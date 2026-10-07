/**
 * The catalog (js/achievement-catalog.js) through the real store, on fake
 * storage: every achievement can actually be earned by real play, each
 * unlocks exactly once, repeating an event never unlocks or re-dates
 * anything, and a first start credits only what existing history proves.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initAchievementProgress,
  recordCompletedRun,
  recordRunAbandoned,
  getAchievementProgress,
  getAchievements,
  clearAchievementProgress,
} from './achievement-store.js';
import { ACHIEVEMENTS, speedTarget, emptiestPuzzleFillSeconds } from './achievement-catalog.js';
import { classifyCompletedRun } from './run-tracking.js';
import { recordGameCompleted } from './statistics-store.js';
import { recordHighScore } from './high-scores-store.js';
import { calculateScore, PAR_SECONDS } from './scoring.js';
import { DIFFICULTIES, DIFFICULTY_IDS } from './sudoku-generator.js';

const KEY = 'inspireSudoku:v1:achievementProgress';
const ALL_IDS = ACHIEVEMENTS.map((achievement) => achievement.id);

let storage;
let progressWrites;
function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (key === KEY) progressWrites++;
      store.set(key, String(value));
    },
    removeItem: (key) => { store.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
beforeEach(() => {
  storage = createFakeStorage();
  globalThis.localStorage = storage;
  clearAchievementProgress();
  progressWrites = 0;
});
afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
});

// Local wall-clock times, built from calendar parts so a daylight-saving
// change can never put two "consecutive" days on the same date.
const atLocal = (dayOffset, hour = 12) => new Date(2026, 9, 7 + dayOffset, hour).getTime();
const OCT_7_NOON = atLocal(0);

/**
 * A completed run exactly as js/game-persistence.js would record it, from
 * the run's monotonic counters: the real score formula and the real
 * classification — no flag set by hand.
 */
function completedRun(runId, difficulty, elapsedSeconds, runCounters, runCountersComplete = true) {
  assert.ok(elapsedSeconds >= emptiestPuzzleFillSeconds(difficulty), 'no faster than any puzzle at this difficulty can be filled');
  const score = calculateScore(
    { difficultyId: difficulty, elapsedSeconds, mistakes: runCounters.mistakes, hintsUsed: runCounters.hints },
    DIFFICULTIES[difficulty]
  );
  return { runId, difficulty, score, elapsedSeconds, ...classifyCompletedRun({ runCounters, runCountersComplete }) };
}

const CLEAN = { mistakes: 0, hints: 0, undos: 0, notes: 0 };

const unlockedIds = () => Object.keys(getAchievementProgress().unlocked).sort();

describe('reachability: a real career earns all 100', () => {
  // Five ordinary ways a game goes, cycled independently of difficulty and
  // pace, so every combination comes up.
  const PLAYSTYLES = [
    { mistakes: 0, hints: 0, undos: 0, notes: 0 }, // clean, ink only
    { mistakes: 0, hints: 0, undos: 2, notes: 40 }, // clean, lots of notes
    { mistakes: 1, hints: 0, undos: 1, notes: 10 }, // one slip, undone
    { mistakes: 3, hints: 1, undos: 3, notes: 0 }, // a rough one
    { mistakes: 0, hints: 2, undos: 0, notes: 5 }, // needed help
  ];
  const GAMES = 1000;
  const GAMES_PER_DAY = 8;
  const ABANDON_EVERY = 100;

  function careerRun(i) {
    const difficulty = DIFFICULTY_IDS[i % DIFFICULTY_IDS.length];
    // Every third game is quick (a third of par); the rest run over par.
    const elapsedSeconds = i % 3 === 0 ? speedTarget(difficulty, 1 / 3) : Math.round(PAR_SECONDS[difficulty] * 1.2);
    return completedRun(`career-${String(i).padStart(4, '0')}`, difficulty, elapsedSeconds, PLAYSTYLES[i % PLAYSTYLES.length]);
  }
  const careerTime = (i) => atLocal(Math.floor(i / GAMES_PER_DAY), 9 + (i % GAMES_PER_DAY));

  test('1,000 wins over 125 straight days (giving up a game now and then) unlock every achievement exactly once', () => {
    const firstUnlock = new Map(); // id → { win, at }
    for (let i = 0; i < GAMES; i++) {
      const now = careerTime(i);
      const result = recordCompletedRun(careerRun(i), now);
      assert.equal(result.persisted, true);
      for (const id of result.newlyUnlocked) {
        assert.ok(!firstUnlock.has(id), `${id} reported twice`);
        firstUnlock.set(id, { win: i + 1, at: now });
      }
      if ((i + 1) % ABANDON_EVERY === 0) recordRunAbandoned(now);
    }

    assert.deepEqual([...firstUnlock.keys()].sort(), [...ALL_IDS].sort());

    // Each at the very win that crossed its threshold.
    const wonAt = (id) => firstUnlock.get(id).win;
    assert.equal(wonAt('wins-1'), 1);
    assert.equal(wonAt('perfect-1'), 1);
    assert.equal(wonAt('speed-easy-third-par'), 1);
    assert.equal(wonAt('style-grand-tour'), DIFFICULTY_IDS.length);
    assert.equal(wonAt('win-streak-50'), 50);
    assert.equal(wonAt('daily-streak-100'), 99 * GAMES_PER_DAY + 1, "the 100th day's first win");
    assert.equal(wonAt('wins-1000'), 1000);

    // The stored record agrees, was never re-dated, and is not "backfilled".
    for (const achievement of getAchievements(careerTime(GAMES - 1))) {
      assert.equal(achievement.unlocked, true, achievement.id);
      assert.equal(achievement.unlockedAt, firstUnlock.get(achievement.id).at, achievement.id);
      assert.equal(achievement.backfilled, false, achievement.id);
      assert.equal(achievement.fraction, 1, achievement.id);
    }
  });
});

describe('repeat events unlock nothing and re-date nothing', () => {
  function firstWin() {
    const run = completedRun('repeat-run-1', 'easy', 120, CLEAN);
    const result = recordCompletedRun(run, OCT_7_NOON);
    assert.ok(result.newlyUnlocked.includes('wins-1'));
    return run;
  }

  test('finishing the same run again — same session, after a reload, days later — changes nothing', () => {
    const run = firstWin();
    const stored = storage.getItem(KEY);
    const writes = progressWrites;

    assert.deepEqual(recordCompletedRun(run, OCT_7_NOON + 1000), { duplicate: true, newlyUnlocked: [] });
    clearSessionOnly();
    assert.deepEqual(recordCompletedRun(run, atLocal(3)), { duplicate: true, newlyUnlocked: [] });

    assert.equal(storage.getItem(KEY), stored, 'byte-for-byte unchanged');
    assert.equal(progressWrites, writes);
  });

  test('starting the app again unlocks nothing and writes nothing', () => {
    firstWin();
    const writes = progressWrites;
    assert.deepEqual(initAchievementProgress(atLocal(1)), []);
    assert.deepEqual(initAchievementProgress(atLocal(2)), []);
    assert.equal(progressWrites, writes);
  });

  test('reading achievements (as a screen would, as often as it likes) never writes', () => {
    firstWin();
    const writes = progressWrites;
    const first = getAchievements(atLocal(1));
    assert.deepEqual(getAchievements(atLocal(1)), first);
    assert.equal(progressWrites, writes);
  });

  test('a later win reports only what it newly earned; earlier unlocks keep their date', () => {
    firstWin();
    const { at } = getAchievementProgress().unlocked['wins-1'];
    const second = recordCompletedRun(completedRun('repeat-run-2', 'easy', 120, CLEAN), atLocal(1));
    assert.ok(!second.newlyUnlocked.includes('wins-1'));
    assert.ok(second.newlyUnlocked.includes('win-streak-2') && second.newlyUnlocked.includes('daily-streak-2'));
    assert.equal(getAchievementProgress().unlocked['wins-1'].at, at);
  });

  test('abandoning a game never takes an unlock back — not even the streak it resets', () => {
    firstWin();
    recordCompletedRun(completedRun('repeat-run-2', 'easy', 120, CLEAN), OCT_7_NOON + 1000);
    const before = getAchievementProgress().unlocked;
    recordRunAbandoned(OCT_7_NOON + 2000);
    const after = getAchievementProgress();
    assert.equal(after.winStreak.current, 0);
    assert.deepEqual(after.unlocked, before);
    assert.ok(Object.hasOwn(after.unlocked, 'win-streak-2'));
  });

  test('an achievement a newer catalog adds is unlocked at the next start if already earned — marked backfilled', () => {
    firstWin();
    const stored = JSON.parse(storage.getItem(KEY));
    delete stored.unlocked['perfect-1']; // as if this version shipped without it
    storage.setItem(KEY, JSON.stringify(stored));
    assert.deepEqual(initAchievementProgress(atLocal(5)), ['perfect-1']);
    assert.deepEqual(getAchievementProgress().unlocked['perfect-1'], { at: atLocal(5), backfilled: true });
  });

  test('an unlock a newer catalog retired is kept, never counted or shown', () => {
    firstWin();
    const stored = JSON.parse(storage.getItem(KEY));
    stored.unlocked['retired-goal'] = { at: OCT_7_NOON, backfilled: false };
    storage.setItem(KEY, JSON.stringify(stored));
    recordCompletedRun(completedRun('repeat-run-2', 'easy', 120, CLEAN), atLocal(1));
    assert.ok(Object.hasOwn(getAchievementProgress().unlocked, 'retired-goal'), 'still stored');
    assert.ok(getAchievements().every((achievement) => achievement.id !== 'retired-goal'));
  });
});

describe('honest backfill: a first start credits only what history proves', () => {
  /** Eight past wins, as statistics and High Scores recorded them. */
  function playBeforeAchievementsExisted() {
    const past = [
      // [difficulty, seconds, mistakes, hints, day] — five flawless Easy
      // wins on five consecutive days, then one each elsewhere.
      ['easy', 250, 0, 0, -12], ['easy', 200, 0, 0, -11], ['easy', 140, 0, 0, -10], ['easy', 95, 0, 0, -9], ['easy', 300, 0, 0, -8],
      ['intermediate', 700, 2, 0, -7],
      ['advanced', 800, 0, 1, -6],
      ['insane', 1600, 0, 0, -5],
    ];
    for (const [difficulty, elapsedSeconds, mistakes, hintsUsed, day] of past) {
      recordGameCompleted(difficulty, { elapsedSeconds, mistakes, hintsUsed });
      const score = calculateScore({ difficultyId: difficulty, elapsedSeconds, mistakes, hintsUsed }, DIFFICULTIES[difficulty]);
      recordHighScore(difficulty, { score, elapsedSeconds, mistakes, hintsUsed, achievedAt: atLocal(day) });
    }
  }

  // Each one backed by a recorded fact: 8 wins; per-difficulty wins; the
  // fastest Easy (95 s) and Advanced (800 s) times; the best Easy (1,410),
  // Advanced (2,400) and Insane (3,500) scores; a win on every difficulty.
  const PROVEN = [
    'wins-1', 'wins-3', 'wins-5',
    'wins-easy-1', 'wins-easy-5', 'wins-intermediate-1', 'wins-advanced-1', 'wins-insane-1',
    'speed-easy-par', 'speed-easy-half-par', 'speed-easy-third-par', 'speed-advanced-par',
    'score-easy-par', 'score-easy-half-par', 'score-advanced-par', 'score-insane-par',
    'style-grand-tour',
  ].sort();

  test('unlocks exactly the proven achievements, dated now and marked backfilled', () => {
    playBeforeAchievementsExisted();
    assert.deepEqual(initAchievementProgress(OCT_7_NOON).sort(), PROVEN);
    assert.deepEqual(unlockedIds(), PROVEN);
    for (const id of PROVEN) assert.deepEqual(getAchievementProgress().unlocked[id], { at: OCT_7_NOON, backfilled: true }, id);
  });

  test('invents nothing: flawless history is not proof of perfect or hint-free play, nor of any streak or playstyle', () => {
    playBeforeAchievementsExisted();
    initAchievementProgress(OCT_7_NOON);
    const unproven = unlockedIds().filter((id) => /^(perfect|no-hint|win-streak|daily-streak)-|^score-lifetime-|^style-(?!grand-tour)/.test(id));
    assert.deepEqual(unproven, []);
    const progress = getAchievementProgress();
    assert.equal(progress.perfectWins, 0);
    assert.equal(progress.noHintWins, 0);
    assert.equal(progress.earnedScore, 0, 'High Scores keep only a top 10, so a total is unknown');
    assert.deepEqual(progress.winStreak, { current: 0, best: 0 });
    assert.deepEqual(progress.dailyStreak, { current: 0, best: 0 });
  });

  test('unknown history starts now: the first tracked win earns what it proves, not backfilled', () => {
    playBeforeAchievementsExisted();
    initAchievementProgress(OCT_7_NOON);
    const { newlyUnlocked } = recordCompletedRun(completedRun('after-backfill-1', 'easy', 200, CLEAN), OCT_7_NOON + 1000);
    assert.deepEqual(newlyUnlocked.sort(), ['no-hint-1', 'perfect-1']);
    assert.equal(getAchievementProgress().unlocked['perfect-1'].backfilled, false);
    assert.equal(getAchievementProgress().wins, 9);
  });

  test('upgrading Phase-4 progress keeps what it tracked, takes bests from history, and starts playstyle at zero', () => {
    recordGameCompleted('easy', { elapsedSeconds: 120, mistakes: 0, hintsUsed: 0 });
    const advancedScore = calculateScore({ difficultyId: 'advanced', elapsedSeconds: 700, mistakes: 0, hintsUsed: 0 }, DIFFICULTIES.advanced);
    recordHighScore('advanced', { score: advancedScore, elapsedSeconds: 700, mistakes: 0, hintsUsed: 0 });
    storage.setItem(KEY, JSON.stringify({
      version: 1,
      trackingSince: '2026-09-01',
      wins: 6,
      winsByDifficulty: { easy: 4, intermediate: 0, advanced: 2, insane: 0 },
      earnedScore: 9000,
      completedSeconds: 3000,
      perfectWins: 3,
      noHintWins: 4,
      winStreak: { current: 2, best: 4 },
      winningDays: 3,
      lastWinDate: '2026-09-03',
      dailyStreak: { current: 3, best: 3 },
      recentRunIds: ['phase4-run-0001', 'phase4-run-0002'],
    }));

    const unlocked = initAchievementProgress(OCT_7_NOON).sort();
    assert.deepEqual(unlocked, [
      'daily-streak-2', 'daily-streak-3', 'no-hint-1', 'perfect-1', 'perfect-3',
      'score-advanced-par', 'speed-easy-half-par', 'speed-easy-par',
      'win-streak-2', 'win-streak-3', 'wins-1', 'wins-3', 'wins-5', 'wins-advanced-1', 'wins-easy-1',
    ]);
    const progress = getAchievementProgress();
    assert.equal(progress.version, 2);
    assert.equal(progress.wins, 6, 'tracked counts kept, not replaced by statistics');
    assert.equal(progress.trackingSince, '2026-09-01');
    assert.deepEqual(progress.playstyle, { heavyNotesWins: 0, noNotesHardWins: 0, noUndoHardWins: 0, comebackWins: 0 });
    assert.equal(recordCompletedRun(completedRun('phase4-run-0002', 'easy', 200, CLEAN), OCT_7_NOON).duplicate, true, 'dedup list carried over');
  });
});

// A page reload forgets the in-session dedup set; stored progress stays.
function clearSessionOnly() {
  const saved = storage.getItem(KEY);
  const writes = progressWrites;
  clearAchievementProgress();
  if (saved !== null) storage.setItem(KEY, saved);
  progressWrites = writes; // putting it back isn't the app writing
}
