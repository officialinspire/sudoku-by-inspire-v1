import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  emptiestPuzzleFillSeconds,
  maxAttainableScore,
  speedTarget,
  scoreTarget,
} from './achievement-catalog.js';
import { METRIC_NAMES, evaluateAchievements } from './achievement-evaluation.js';
import { PAR_SECONDS, BASE_SCORE, calculateScore } from './scoring.js';
import { DIFFICULTIES, DIFFICULTY_IDS } from './sudoku-generator.js';
import { formatElapsedTime } from './completion.js';

// Unlocks are stored under these IDs: changing or reusing one would
// orphan or misattribute players' unlocks. Add new IDs; never edit these.
const GOLDEN_IDS = [
  'wins-1', 'wins-3', 'wins-5', 'wins-10', 'wins-15', 'wins-25', 'wins-40', 'wins-50', 'wins-75',
  'wins-100', 'wins-150', 'wins-200', 'wins-300', 'wins-500', 'wins-1000', 'wins-easy-1',
  'wins-easy-5', 'wins-easy-10', 'wins-easy-25', 'wins-easy-50', 'wins-intermediate-1',
  'wins-intermediate-5', 'wins-intermediate-10', 'wins-intermediate-25', 'wins-intermediate-50',
  'wins-advanced-1', 'wins-advanced-5', 'wins-advanced-10', 'wins-advanced-25', 'wins-advanced-50',
  'wins-insane-1', 'wins-insane-5', 'wins-insane-10', 'wins-insane-25', 'wins-insane-50',
  'perfect-1', 'perfect-3', 'perfect-5', 'perfect-10', 'perfect-15', 'perfect-25', 'perfect-40',
  'perfect-50', 'perfect-75', 'perfect-100', 'no-hint-1', 'no-hint-5', 'no-hint-10', 'no-hint-25',
  'no-hint-50', 'no-hint-75', 'no-hint-100', 'no-hint-150', 'no-hint-200', 'no-hint-300',
  'speed-easy-par', 'speed-easy-half-par', 'speed-intermediate-par', 'speed-intermediate-half-par',
  'speed-advanced-par', 'speed-advanced-half-par', 'speed-insane-par', 'speed-insane-half-par',
  'speed-easy-third-par', 'speed-insane-third-par', 'score-easy-par', 'score-easy-half-par',
  'score-intermediate-par', 'score-intermediate-half-par', 'score-advanced-par',
  'score-advanced-half-par', 'score-insane-par', 'score-insane-half-par',
  'score-lifetime-collector', 'score-lifetime-hoarder', 'win-streak-2', 'win-streak-3',
  'win-streak-5', 'win-streak-7', 'win-streak-10', 'win-streak-15', 'win-streak-20',
  'win-streak-25', 'win-streak-30', 'win-streak-50', 'daily-streak-2', 'daily-streak-3',
  'daily-streak-5', 'daily-streak-7', 'daily-streak-10', 'daily-streak-14', 'daily-streak-21',
  'daily-streak-30', 'daily-streak-60', 'daily-streak-100', 'style-note-taker', 'style-ink-only',
  'style-no-take-backs', 'style-grand-tour', 'style-comeback',
];

describe('catalog shape', () => {
  test('exactly 100 achievements, allocated as specified', () => {
    assert.equal(ACHIEVEMENTS.length, 100);
    const counts = Object.fromEntries(ACHIEVEMENT_CATEGORIES.map(({ id }) => [id, 0]));
    for (const achievement of ACHIEVEMENTS) counts[achievement.category]++;
    assert.deepEqual(counts, {
      wins: 15,
      difficulty: 20,
      perfect: 10,
      'no-hint': 10,
      speed: 10,
      score: 10,
      'win-streak': 10,
      'daily-streak': 10,
      playstyle: 5,
    });
    for (const id of DIFFICULTY_IDS) {
      assert.equal(ACHIEVEMENTS.filter((a) => a.metric === `wins:${id}`).length, 5, `5 win milestones for ${id}`);
    }
  });

  test('IDs are stable — exactly the published list, in order', () => {
    assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), GOLDEN_IDS);
  });

  test('IDs and names are unique; every field is present and well-formed', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 100);
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.name)).size, 100);
    const categoryIds = ACHIEVEMENT_CATEGORIES.map((c) => c.id);
    for (const a of ACHIEVEMENTS) {
      assert.match(a.id, /^[a-z0-9-]{1,64}$/, a.id);
      assert.ok(a.name.trim() && a.description.trim(), a.id);
      assert.ok(a.description.endsWith('.'), `${a.id}: a full sentence`);
      assert.ok(categoryIds.includes(a.category), a.id);
      assert.ok(METRIC_NAMES.includes(a.metric), `${a.id}: known metric`);
      assert.ok(!a.metric.startsWith('current'), `${a.id}: never a metric that can go back down`);
      assert.ok(Number.isInteger(a.target) && a.target >= 1, a.id);
      assert.equal(a.comparison, a.metric.startsWith('bestTime:') ? 'atMost' : 'atLeast', a.id);
      assert.ok(Object.isFrozen(a), a.id);
    }
    assert.ok(Object.isFrozen(ACHIEVEMENTS));
  });

  test('every requirement states its own number (count, time, or score)', () => {
    for (const a of ACHIEVEMENTS) {
      const shown = a.comparison === 'atMost' ? formatElapsedTime(a.target) : a.target.toLocaleString('en-US');
      const states = a.description.includes(shown) || (a.target === 1 && /\b(a|an|your first) /.test(a.description));
      assert.ok(states, `${a.id}: "${a.description}" should mention ${shown}`);
    }
  });
});

describe('speed and score targets are derived from scoring.js', () => {
  const byId = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

  test('speed targets are fractions of each difficulty\'s par time', () => {
    for (const d of DIFFICULTY_IDS) {
      assert.equal(byId[`speed-${d}-par`].target, PAR_SECONDS[d]);
      assert.equal(byId[`speed-${d}-half-par`].target, Math.round(PAR_SECONDS[d] / 2));
    }
    assert.equal(byId['speed-easy-third-par'].target, Math.round(PAR_SECONDS.easy / 3));
    assert.equal(byId['speed-insane-third-par'].target, Math.round(PAR_SECONDS.insane / 3));
  });

  test('score targets are what a flawless game at that fraction of par scores', () => {
    for (const d of DIFFICULTY_IDS) {
      const flawlessAt = (seconds) => calculateScore({ difficultyId: d, elapsedSeconds: seconds, mistakes: 0, hintsUsed: 0 }, DIFFICULTIES[d]);
      assert.equal(byId[`score-${d}-par`].target, flawlessAt(PAR_SECONDS[d]));
      assert.equal(byId[`score-${d}-par`].target, BASE_SCORE * DIFFICULTIES[d].scoreMultiplier, 'at par: exactly the difficulty reward');
      assert.equal(byId[`score-${d}-half-par`].target, flawlessAt(Math.round(PAR_SECONDS[d] / 2)));
    }
    assert.equal(byId['score-lifetime-collector'].target, 10 * scoreTarget('easy', 1));
    assert.equal(byId['score-lifetime-hoarder'].target, 100 * scoreTarget('easy', 1));
  });
});

describe('every target is attainable', () => {
  test('no speed goal is faster than twice the time a puzzle can physically be filled in', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.category === 'speed')) {
      const d = a.metric.split(':')[1];
      assert.ok(a.target >= 2 * emptiestPuzzleFillSeconds(d), `${a.id}: ${a.target}s vs floor ${emptiestPuzzleFillSeconds(d)}s`);
      assert.ok(a.target <= PAR_SECONDS[d], `${a.id}: at most par`);
    }
  });

  test('no single-game score goal exceeds the best score a real game can earn', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.metric.startsWith('bestScore:'))) {
      const d = a.metric.split(':')[1];
      assert.ok(a.target <= maxAttainableScore(d), `${a.id}: ${a.target} vs ${maxAttainableScore(d)}`);
    }
  });

  test('the attainable bounds come from the difficulty table, not guesses', () => {
    assert.equal(emptiestPuzzleFillSeconds('easy'), 81 - DIFFICULTIES.easy.minClues);
    assert.equal(maxAttainableScore('insane'), calculateScore({ difficultyId: 'insane', elapsedSeconds: 81 - DIFFICULTIES.insane.minClues, mistakes: 0, hintsUsed: 0 }, DIFFICULTIES.insane));
    assert.equal(speedTarget('advanced', 1), PAR_SECONDS.advanced);
  });
});

describe('threshold boundaries, for all 100', () => {
  // One metric set with only `metric` changed — evaluated per achievement.
  const metricsWith = (metric, value) => ({ ...Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])), [metric]: value });

  test('one short of the target is not met; exactly the target is', () => {
    for (const a of ACHIEVEMENTS) {
      const [justMissed, exactly] =
        a.comparison === 'atMost'
          ? [metricsWith(a.metric, a.target + 1), metricsWith(a.metric, a.target)]
          : [metricsWith(a.metric, a.target - 1), metricsWith(a.metric, a.target)];
      assert.equal(evaluateAchievements([a], justMissed)[0].met, false, `${a.id} just missed`);
      assert.equal(evaluateAchievements([a], exactly)[0].met, true, `${a.id} exactly`);
    }
  });

  test('a time goal with no win yet (null) is not met, and better times are', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.comparison === 'atMost')) {
      assert.equal(evaluateAchievements([a], metricsWith(a.metric, null))[0].met, false, a.id);
      assert.equal(evaluateAchievements([a], metricsWith(a.metric, a.target - 1))[0].met, true, a.id);
      assert.equal(evaluateAchievements([a], metricsWith(a.metric, 2 * a.target))[0].fraction, 0.5, a.id);
    }
  });
});
