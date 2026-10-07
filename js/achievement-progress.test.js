import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDateKey,
  daysBetween,
  emptyProgress,
  progressFromStatistics,
  applyCompletedRun,
  applyAbandonedRun,
  isValidProgress,
  MAX_RECENT_RUN_IDS,
} from './achievement-progress.js';

let nextRun = 0;
function run(overrides = {}) {
  nextRun++;
  return { runId: `run-${String(nextRun).padStart(6, '0')}`, difficulty: 'easy', score: 1000, elapsedSeconds: 300, perfect: false, noHint: false, ...overrides };
}

/** Applies wins as [dateKey, runOverrides?] pairs, asserting each is counted. */
function winOn(progress, ...wins) {
  for (const [day, overrides] of wins) {
    const result = applyCompletedRun(progress, run(overrides), day);
    assert.equal(result.duplicate, false);
    progress = result.progress;
  }
  return progress;
}

describe('local calendar dates', () => {
  test('localDateKey uses the local calendar, zero-padded', () => {
    assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(localDateKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  });

  test('daysBetween counts calendar days across month, year, leap day, and DST changes', () => {
    assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
    assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
    assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2, 'leap year');
    assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2, 'US spring-forward weekend');
    assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, 'EU fall-back weekend');
    assert.equal(daysBetween('2026-05-10', '2026-05-08'), -2);
  });
});

describe('totals', () => {
  test('a win adds to wins, its difficulty, score, time, and perfect/no-hint counts', () => {
    const progress = winOn(
      emptyProgress('2026-10-01'),
      ['2026-10-01', { difficulty: 'insane', score: 4200, elapsedSeconds: 1500, perfect: true, noHint: true }],
      ['2026-10-01', { difficulty: 'easy', score: 900, elapsedSeconds: 200, noHint: true }],
      ['2026-10-01', { difficulty: 'easy', score: 0, elapsedSeconds: 900 }]
    );
    assert.equal(progress.wins, 3);
    assert.deepEqual(progress.winsByDifficulty, { easy: 2, intermediate: 0, advanced: 0, insane: 1 });
    assert.equal(progress.earnedScore, 5100);
    assert.equal(progress.completedSeconds, 2600);
    assert.equal(progress.perfectWins, 1);
    assert.equal(progress.noHintWins, 2);
    assert.ok(isValidProgress(progress));
  });

  test('updates never mutate the progress they were given', () => {
    const before = emptyProgress('2026-10-01');
    const snapshot = JSON.stringify(before);
    winOn(before, ['2026-10-01']);
    applyAbandonedRun(before);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe('duplicate completions', () => {
  test('the same run ID is counted once', () => {
    const first = run({ score: 1234 });
    const once = applyCompletedRun(emptyProgress('2026-10-01'), first, '2026-10-01').progress;
    const again = applyCompletedRun(once, first, '2026-10-02');
    assert.equal(again.duplicate, true);
    assert.equal(again.progress, once, 'untouched');
    assert.equal(once.wins, 1);
  });

  test('the dedup list is bounded to the most recent runs', () => {
    let progress = emptyProgress('2026-10-01');
    const runs = Array.from({ length: MAX_RECENT_RUN_IDS + 5 }, () => run());
    for (const r of runs) progress = applyCompletedRun(progress, r, '2026-10-01').progress;
    assert.equal(progress.recentRunIds.length, MAX_RECENT_RUN_IDS);
    assert.equal(progress.recentRunIds.at(-1), runs.at(-1).runId);
    assert.equal(applyCompletedRun(progress, runs.at(-1), '2026-10-01').duplicate, true);
    assert.ok(isValidProgress(progress));
  });

  test('a malformed run is rejected, not half-applied', () => {
    for (const bad of [run({ runId: 'x' }), run({ difficulty: 'expert' }), run({ score: -5 }), run({ perfect: true, noHint: false })]) {
      assert.throws(() => applyCompletedRun(emptyProgress('2026-10-01'), bad, '2026-10-01'), TypeError);
    }
  });
});

describe('consecutive wins', () => {
  test('count up with each win; abandoning resets current but keeps best', () => {
    let progress = winOn(emptyProgress('2026-10-01'), ['2026-10-01'], ['2026-10-01'], ['2026-10-02']);
    assert.deepEqual(progress.winStreak, { current: 3, best: 3 });
    progress = applyAbandonedRun(progress);
    assert.deepEqual(progress.winStreak, { current: 0, best: 3 });
    progress = winOn(progress, ['2026-10-02']);
    assert.deepEqual(progress.winStreak, { current: 1, best: 3 });
  });
});

describe('winning days and daily streaks', () => {
  test('several wins on one day count that day once', () => {
    const progress = winOn(emptyProgress('2026-10-01'), ['2026-10-01'], ['2026-10-01'], ['2026-10-01']);
    assert.equal(progress.wins, 3);
    assert.equal(progress.winningDays, 1);
    assert.deepEqual(progress.dailyStreak, { current: 1, best: 1 });
  });

  test('consecutive days extend the streak, across a month end', () => {
    const progress = winOn(emptyProgress('2026-10-30'), ['2026-10-30'], ['2026-10-31'], ['2026-11-01'], ['2026-11-01']);
    assert.equal(progress.winningDays, 3);
    assert.deepEqual(progress.dailyStreak, { current: 3, best: 3 });
  });

  test('a missed day breaks the daily streak; best is kept', () => {
    const progress = winOn(emptyProgress('2026-10-01'), ['2026-10-01'], ['2026-10-02'], ['2026-10-03'], ['2026-10-05']);
    assert.equal(progress.winningDays, 4);
    assert.deepEqual(progress.dailyStreak, { current: 1, best: 3 });
    assert.equal(progress.lastWinDate, '2026-10-05');
  });

  test('abandoning a game breaks the win streak but not the daily streak', () => {
    let progress = winOn(emptyProgress('2026-10-01'), ['2026-10-01'], ['2026-10-02']);
    progress = applyAbandonedRun(progress);
    progress = winOn(progress, ['2026-10-03']);
    assert.deepEqual(progress.dailyStreak, { current: 3, best: 3 });
    assert.deepEqual(progress.winStreak, { current: 1, best: 2 });
  });

  test('a win dated before the last one (clock moved back) counts no new day and keeps the streak', () => {
    let progress = winOn(emptyProgress('2026-10-01'), ['2026-10-04'], ['2026-10-05']);
    progress = winOn(progress, ['2026-10-02']);
    assert.equal(progress.wins, 3);
    assert.equal(progress.winningDays, 2);
    assert.deepEqual(progress.dailyStreak, { current: 2, best: 2 });
    assert.equal(progress.lastWinDate, '2026-10-05');
  });
});

describe('backfill from existing statistics', () => {
  const stats = {
    easy: { gamesCompleted: 7, totalPlayTimeSeconds: 2100, bestTimeSeconds: 120, currentStreak: 7, totalHints: 0, totalMistakes: 0 },
    intermediate: { gamesCompleted: 2, totalPlayTimeSeconds: 900 },
    advanced: { gamesCompleted: 0, totalPlayTimeSeconds: 0 },
    insane: { gamesCompleted: 1, totalPlayTimeSeconds: 1800 },
  };

  test('copies only what statistics record exactly: wins and completed time', () => {
    const progress = progressFromStatistics(stats, '2026-10-07');
    assert.equal(progress.wins, 10);
    assert.deepEqual(progress.winsByDifficulty, { easy: 7, intermediate: 2, advanced: 0, insane: 1 });
    assert.equal(progress.completedSeconds, 4800);
    assert.equal(progress.trackingSince, '2026-10-07');
    assert.ok(isValidProgress(progress));
  });

  test('invents nothing else — even a history of 0-mistake, 0-hint wins is not perfect', () => {
    const progress = progressFromStatistics(stats, '2026-10-07');
    assert.equal(progress.perfectWins, 0);
    assert.equal(progress.noHintWins, 0);
    assert.equal(progress.earnedScore, 0);
    assert.deepEqual(progress.winStreak, { current: 0, best: 0 });
    assert.equal(progress.winningDays, 0);
    assert.deepEqual(progress.dailyStreak, { current: 0, best: 0 });
  });

  test('missing or malformed statistics just contribute nothing', () => {
    assert.equal(progressFromStatistics(undefined, '2026-10-07').wins, 0);
    assert.equal(progressFromStatistics({ easy: { gamesCompleted: -3, totalPlayTimeSeconds: 10 } }, '2026-10-07').wins, 0);
  });

  test('the first tracked win after a backfill starts the day counts fresh', () => {
    const progress = winOn(progressFromStatistics(stats, '2026-10-07'), ['2026-10-07']);
    assert.equal(progress.wins, 11);
    assert.equal(progress.winningDays, 1);
  });
});

describe('isValidProgress', () => {
  const valid = () => winOn(emptyProgress('2026-10-01'), ['2026-10-01', { perfect: true, noHint: true }]);

  test('accepts real progress', () => {
    assert.ok(isValidProgress(valid()));
    assert.ok(isValidProgress(emptyProgress('2026-10-01')));
  });

  test('rejects wrong versions, shapes, and broken invariants', () => {
    const cases = {
      'old version': { version: 0 },
      'bad tracking date': { trackingSince: '2026-13-45' },
      'negative count': { earnedScore: -1 },
      'fractional count': { wins: 1.5 },
      'difficulties not adding up': { winsByDifficulty: { easy: 5, intermediate: 0, advanced: 0, insane: 0 } },
      'perfect but not no-hint': { perfectWins: 1, noHintWins: 0 },
      'streak best below current': { winStreak: { current: 3, best: 1 } },
      'days without a last date': { lastWinDate: null },
      'bad run id': { recentRunIds: ['not valid!'] },
      'too many run ids': { recentRunIds: Array.from({ length: MAX_RECENT_RUN_IDS + 1 }, (_, i) => `run-${String(i).padStart(6, '0')}`) },
    };
    for (const [name, overrides] of Object.entries(cases)) {
      assert.equal(isValidProgress({ ...valid(), ...overrides }), false, name);
    }
    for (const bad of [null, undefined, 'progress', [], {}]) assert.equal(isValidProgress(bad), false);
  });
});
