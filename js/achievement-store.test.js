import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  initAchievementProgress,
  recordCompletedRun,
  recordRunAbandoned,
  getAchievementProgress,
  getAchievementMetrics,
  clearAchievementProgress,
  onAchievementsUnlocked,
} from './achievement-store.js';
import { recordGameCompleted } from './statistics-store.js';
import { buildBackup, applyBackup } from './data-backup.js';

const KEY = 'inspireSudoku:v1:achievementProgress';

function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

// Private browsing / disabled storage: every call throws.
const deniedStorage = {
  getItem() { throw new DOMException('denied', 'SecurityError'); },
  setItem() { throw new DOMException('denied', 'SecurityError'); },
  removeItem() { throw new DOMException('denied', 'SecurityError'); },
};

const originalLocalStorage = globalThis.localStorage;
beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
  clearAchievementProgress(); // also resets the in-session dedup between tests
});
afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
});

const OCT_7_NOON = new Date(2026, 9, 7, 12).getTime();
const DAY = 86_400_000;
let nextRun = 0;
function run(overrides = {}) {
  nextRun++;
  return { runId: `store-run-${nextRun}`, difficulty: 'easy', score: 1500, elapsedSeconds: 240, perfect: false, noHint: true, noNotes: false, noUndo: false, heavyNotes: false, comeback: false, ...overrides };
}

describe('startup and backfill', () => {
  test('first start seeds wins and time from existing statistics, dated today', () => {
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    recordGameCompleted('advanced', { elapsedSeconds: 700, mistakes: 2, hintsUsed: 1 });
    initAchievementProgress(OCT_7_NOON);
    const stored = JSON.parse(localStorage.getItem(KEY));
    assert.equal(stored.wins, 2);
    assert.equal(stored.completedSeconds, 800);
    assert.equal(stored.perfectWins, 0, 'a 0-mistake, 0-hint history is not proof of a perfect run');
    assert.equal(stored.trackingSince, '2026-10-07');
  });

  test('later starts leave existing progress alone (the baseline never shifts)', () => {
    initAchievementProgress(OCT_7_NOON);
    recordCompletedRun(run(), OCT_7_NOON);
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    initAchievementProgress(OCT_7_NOON + DAY);
    assert.equal(getAchievementProgress().wins, 1);
  });
});

describe('recording completions', () => {
  test('a completion is recorded with its score, time, and local day', () => {
    const result = recordCompletedRun(run({ score: 2300, elapsedSeconds: 410, perfect: true }), OCT_7_NOON);
    assert.equal(result.duplicate, false);
    assert.equal(result.persisted, true);
    assert.ok(result.newlyUnlocked.includes('wins-1') && result.newlyUnlocked.includes('perfect-1'));
    const metrics = getAchievementMetrics(OCT_7_NOON);
    assert.equal(metrics.wins, 1);
    assert.equal(metrics.earnedScore, 2300);
    assert.equal(metrics.completedSeconds, 410);
    assert.equal(metrics.perfectWins, 1);
    assert.equal(getAchievementProgress().lastWinDate, '2026-10-07');
  });

  test('a duplicate completion is reported and counted once — within a session and after a reload', () => {
    const finished = run();
    recordCompletedRun(finished, OCT_7_NOON);
    assert.deepEqual(recordCompletedRun(finished, OCT_7_NOON + 1000), { duplicate: true, newlyUnlocked: [] });
    clearAchievementProgressMemoryOnly();
    assert.deepEqual(recordCompletedRun(finished, OCT_7_NOON + DAY), { duplicate: true, newlyUnlocked: [] }, 'from the stored list');
    assert.equal(getAchievementProgress().wins, 1);
  });

  test('a run restored from a backup and finished again is still a duplicate', () => {
    const finished = run();
    const backup = JSON.parse(JSON.stringify(buildBackup())); // taken before it was finished
    recordCompletedRun(finished, OCT_7_NOON);
    const afterwards = buildBackup(); // …and one taken after
    assert.ok(applyBackup(afterwards).ok);
    clearAchievementProgressMemoryOnly();
    assert.deepEqual(recordCompletedRun(finished, OCT_7_NOON + DAY), { duplicate: true, newlyUnlocked: [] });
    assert.ok(applyBackup(backup).ok); // the older backup has no progress key: current progress stays
    assert.equal(getAchievementProgress().wins, 1);
  });

  test('a malformed run is skipped without throwing', () => {
    assert.deepEqual(recordCompletedRun({ runId: 'nope' }, OCT_7_NOON), { duplicate: false, persisted: false, newlyUnlocked: [] });
    assert.deepEqual(recordCompletedRun(undefined, OCT_7_NOON), { duplicate: false, persisted: false, newlyUnlocked: [] });
    assert.equal(getAchievementProgress().wins, 0);
  });

  test('abandoning ends the win streak but not the daily streak', () => {
    recordCompletedRun(run(), OCT_7_NOON);
    recordCompletedRun(run(), OCT_7_NOON + DAY);
    recordRunAbandoned(OCT_7_NOON + DAY);
    const metrics = getAchievementMetrics(OCT_7_NOON + DAY);
    assert.equal(metrics.currentWinStreak, 0);
    assert.equal(metrics.bestWinStreak, 2);
    assert.equal(metrics.currentDailyStreak, 2);
  });
});

describe('unlock announcements (for the UI)', () => {
  test('each saved win announces what it unlocked, with its run ID — once', () => {
    const heard = [];
    const stop = onAchievementsUnlocked((ids, detail) => heard.push([ids, detail]));
    const wins = [run({ perfect: true }), run(), run(), run()];
    const results = wins.map((won) => recordCompletedRun(won, OCT_7_NOON));
    recordCompletedRun(wins[0], OCT_7_NOON); // a duplicate
    stop();
    recordCompletedRun(run(), OCT_7_NOON); // after unsubscribing

    assert.deepEqual(results[1].newlyUnlocked, ['win-streak-2']);
    assert.deepEqual(results[3].newlyUnlocked, [], 'the 4th win crosses no threshold');
    assert.deepEqual(heard, [0, 1, 2].map((i) => [results[i].newlyUnlocked, { runId: wins[i].runId }]));
  });

  test('an unlock that couldn\'t be saved is never announced, and startup reports none', () => {
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 }); // history to credit
    const heard = [];
    const stop = onAchievementsUnlocked((ids) => heard.push(ids));
    localStorage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    assert.deepEqual(initAchievementProgress(OCT_7_NOON), [], 'wins-1 would be credited, but nothing could be stored');
    const result = recordCompletedRun(run(), OCT_7_NOON);
    stop();
    assert.equal(result.persisted, false);
    assert.deepEqual(heard, []);
  });

  test('a listener that throws can\'t break recording the win', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const stop = onAchievementsUnlocked(() => { throw new Error('UI bug'); });
    let result;
    assert.doesNotThrow(() => { result = recordCompletedRun(run(), OCT_7_NOON); });
    stop();
    consoleError.mock.restore();
    assert.equal(result.persisted, true);
    assert.equal(getAchievementProgress().wins, 1);
    assert.equal(consoleError.mock.callCount(), 1, 'reported, not swallowed silently');
  });
});

describe('backup, import, and Clear Data', () => {
  test('progress is part of a backup and comes back on import', () => {
    recordCompletedRun(run({ score: 777 }), OCT_7_NOON);
    const backup = buildBackup();
    assert.equal(backup.data[KEY].earnedScore, 777);
    clearAchievementProgress();
    assert.equal(getAchievementProgress().earnedScore, 0);
    assert.ok(applyBackup(backup).ok);
    assert.equal(getAchievementProgress().earnedScore, 777);
  });

  test('unlocks and their dates survive a backup round trip, and the next start re-credits nothing', () => {
    recordCompletedRun(run({ perfect: true }), OCT_7_NOON);
    const unlocked = getAchievementProgress().unlocked;
    const backup = JSON.parse(JSON.stringify(buildBackup())); // as written to and read from a file
    clearAchievementProgress();
    assert.deepEqual(getAchievementProgress().unlocked, {});
    assert.ok(applyBackup(backup).ok);
    assert.deepEqual(initAchievementProgress(OCT_7_NOON + DAY), [], 'the reload after Import');
    assert.deepEqual(getAchievementProgress().unlocked, unlocked);
  });

  test('Clear Data removes progress (and the next start rebuilds from the cleared statistics)', () => {
    recordCompletedRun(run(), OCT_7_NOON);
    clearAchievementProgress();
    assert.equal(localStorage.getItem(KEY), null);
    initAchievementProgress(OCT_7_NOON);
    assert.equal(getAchievementProgress().wins, 0);
  });
});

describe('corrupt or unavailable storage', () => {
  test('corrupt JSON or an invalid shape falls back instead of throwing — and is replaced on the next write', () => {
    for (const corrupt of ['{not json', JSON.stringify({ version: 1, wins: 'lots' }), JSON.stringify({ version: 99 })]) {
      localStorage.setItem(KEY, corrupt);
      assert.equal(getAchievementProgress(OCT_7_NOON).wins, 0, corrupt);
      clearAchievementProgressMemoryOnly();
      recordCompletedRun(run(), OCT_7_NOON);
      assert.equal(JSON.parse(localStorage.getItem(KEY)).wins, 1);
      localStorage.removeItem(KEY);
    }
  });

  test('with storage denied nothing throws, and one session still never counts a run twice', () => {
    globalThis.localStorage = deniedStorage;
    assert.doesNotThrow(() => initAchievementProgress(OCT_7_NOON));
    const finished = run();
    const first = recordCompletedRun(finished, OCT_7_NOON);
    assert.equal(first.duplicate, false);
    assert.equal(first.persisted, false);
    assert.deepEqual(recordCompletedRun(finished, OCT_7_NOON), { duplicate: true, newlyUnlocked: [] });
    assert.doesNotThrow(() => recordRunAbandoned(OCT_7_NOON));
    assert.doesNotThrow(() => clearAchievementProgress());
    assert.equal(getAchievementMetrics(OCT_7_NOON).wins, 0);
  });

  test('with no localStorage at all (very old or locked-down browsers) nothing throws', () => {
    delete globalThis.localStorage;
    assert.doesNotThrow(() => initAchievementProgress(OCT_7_NOON));
    assert.equal(recordCompletedRun(run(), OCT_7_NOON).duplicate, false);
  });
});

// Simulates a page reload: the in-session dedup set is gone, stored data stays.
function clearAchievementProgressMemoryOnly() {
  const saved = localStorage.getItem(KEY);
  clearAchievementProgress();
  if (saved !== null) localStorage.setItem(KEY, saved);
}
