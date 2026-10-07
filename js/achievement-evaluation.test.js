import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getProgressMetrics, currentDailyStreak, evaluateAchievements, METRIC_NAMES } from './achievement-evaluation.js';
import { emptyProgress, applyCompletedRun } from './achievement-progress.js';

function progressWithWins(days) {
  let progress = emptyProgress(days[0]);
  days.forEach((day, i) => {
    const run = { runId: `eval-run-${i}-x`, difficulty: i % 2 ? 'insane' : 'easy', score: 100, elapsedSeconds: 60, perfect: i === 0, noHint: true };
    progress = applyCompletedRun(progress, run, day).progress;
  });
  return progress;
}

describe('getProgressMetrics', () => {
  test('exposes every metric by name', () => {
    const metrics = getProgressMetrics(progressWithWins(['2026-10-01', '2026-10-02', '2026-10-02']), '2026-10-02');
    assert.deepEqual(Object.keys(metrics).sort(), [...METRIC_NAMES].sort());
    assert.equal(metrics.wins, 3);
    assert.equal(metrics['wins:easy'], 2);
    assert.equal(metrics['wins:insane'], 1);
    assert.equal(metrics.earnedScore, 300);
    assert.equal(metrics.completedSeconds, 180);
    assert.equal(metrics.perfectWins, 1);
    assert.equal(metrics.noHintWins, 3);
    assert.equal(metrics.bestWinStreak, 3);
    assert.equal(metrics.winningDays, 2);
    assert.equal(metrics.bestDailyStreak, 2);
    assert.equal(metrics.currentDailyStreak, 2);
  });
});

describe('currentDailyStreak', () => {
  const progress = progressWithWins(['2026-10-01', '2026-10-02', '2026-10-03']);

  test('still alive today and tomorrow (a day without a win yet)', () => {
    assert.equal(currentDailyStreak(progress, '2026-10-03'), 3);
    assert.equal(currentDailyStreak(progress, '2026-10-04'), 3);
  });

  test('broken once a whole day has passed without a win — before any new win updates it', () => {
    assert.equal(currentDailyStreak(progress, '2026-10-05'), 0);
    assert.equal(getProgressMetrics(progress, '2026-10-05').bestDailyStreak, 3, 'best is unaffected');
  });

  test('zero with no wins yet', () => {
    assert.equal(currentDailyStreak(emptyProgress('2026-10-01'), '2026-10-01'), 0);
  });
});

describe('evaluateAchievements', () => {
  const metrics = getProgressMetrics(progressWithWins(['2026-10-01', '2026-10-02']), '2026-10-02');

  test('reports progress and unlocks, in definition order', () => {
    const results = evaluateAchievements(
      [
        { id: 'first-win', metric: 'wins', target: 1 },
        { id: 'ten-wins', metric: 'wins', target: 10 },
        { id: 'insane-win', metric: 'wins:insane', target: 1 },
        { id: 'week-streak', metric: 'bestDailyStreak', target: 7 },
      ],
      metrics
    );
    assert.deepEqual(
      results.map(({ id, current, unlocked, fraction }) => [id, current, unlocked, fraction]),
      [
        ['first-win', 2, true, 1],
        ['ten-wins', 2, false, 0.2],
        ['insane-win', 1, true, 1],
        ['week-streak', 2, false, 2 / 7],
      ]
    );
  });

  test('a catalog mistake fails loudly', () => {
    assert.throws(() => evaluateAchievements([{ id: 'typo', metric: 'winz', target: 1 }], metrics), /unknown metric/);
    assert.throws(() => evaluateAchievements([{ id: 'zero', metric: 'wins', target: 0 }], metrics), /positive integer/);
  });
});
