/**
 * The real game state + autosave + stores, end to end, on fake storage:
 * each run must be counted exactly once — through Continue, a reload, or
 * a stale copy of the save — with scoring and the displayed counts
 * unchanged.
 */
import { describe, test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, restoreGame, resumeGame, selectCell, applyNumberInput, toggleNote, useHint, undo, getState, resetToIdle, onStateChange } from './game-state.js';
import { initGamePersistence } from './game-persistence.js';
import { loadActiveGame } from './active-game-store.js';
import { getStatistics } from './statistics-store.js';
import { getHighScores } from './high-scores-store.js';
import { getAchievementProgress, clearAchievementProgress, onAchievementsUnlocked } from './achievement-store.js';
import { calculateScore } from './scoring.js';
import { DIFFICULTIES } from './sudoku-generator.js';
import { HEAVY_NOTES_MIN_TOGGLES } from './run-tracking.js';

const SAVE_KEY = 'inspireSudoku:v1:activeGame';
const PROGRESS_KEY = 'inspireSudoku:v1:achievementProgress';
const solution = [...Array(81)].map((_, i) => ((3 * (Math.floor(i / 9) % 3) + Math.floor(Math.floor(i / 9) / 3) + (i % 9)) % 9) + 1);
const OPEN_CELLS = [0, 1];
const puzzle = solution.map((digit, i) => (OPEN_CELLS.includes(i) ? 0 : digit));
const wrongDigit = (index) => (solution[index] === 9 ? 1 : solution[index] + 1);

let storage;
function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

function newGame({ autoStartTimer = false } = {}) {
  startGame({ puzzle, solution, status: 'generated', attempts: 1, elapsedMs: 1, clueCount: 79 }, 'easy', { autoStartTimer });
}
function fill(index) {
  selectCell(index);
  applyNumberInput(solution[index]);
}
function letAutosaveRun() {
  mock.timers.tick(600); // past the 500 ms autosave debounce
}
/** What "Continue Game" does after a reload. */
function continueSavedGame() {
  restoreGame(loadActiveGame(), { autoStartTimer: false });
  resumeGame();
}

before(() => {
  globalThis.window = new EventTarget(); // initGamePersistence listens for pagehide
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  initGamePersistence();
});
beforeEach(() => {
  storage = createFakeStorage();
  globalThis.localStorage = storage;
  clearAchievementProgress();
  resetToIdle();
});
after(() => {
  mock.timers.reset();
  delete globalThis.window;
  delete globalThis.localStorage;
});

describe('a completed run is recorded exactly once', () => {
  test('one win: statistics, high scores, and achievements, with the existing score formula', () => {
    newGame();
    OPEN_CELLS.forEach(fill);
    assert.equal(getState().status, 'complete');

    const expectedScore = calculateScore({ difficultyId: 'easy', elapsedSeconds: 0, mistakes: 0, hintsUsed: 0 }, DIFFICULTIES.easy);
    assert.equal(getStatistics('easy').gamesCompleted, 1);
    assert.equal(getHighScores('easy')[0].score, expectedScore);
    const progress = getAchievementProgress();
    assert.equal(progress.wins, 1);
    assert.equal(progress.earnedScore, expectedScore);
    assert.equal(progress.perfectWins, 1);
    assert.equal(storage.getItem(SAVE_KEY), null, 'the save is cleared');
  });

  test('Continue after a reload is the same run — same ID, counters kept — and counts once', () => {
    newGame();
    const runId = getState().runId;
    selectCell(0);
    applyNumberInput(wrongDigit(0));
    undo();
    letAutosaveRun();

    resetToIdle(); // the reload
    continueSavedGame();
    assert.equal(getState().runId, runId);
    assert.deepEqual(getState().runCounters, { mistakes: 1, hints: 0, undos: 1, notes: 0 });

    OPEN_CELLS.forEach(fill);
    assert.equal(getStatistics('easy').gamesCompleted, 1);
    assert.equal(getAchievementProgress().wins, 1);
    assert.equal(getAchievementProgress().perfectWins, 0, 'the undone mistake survived the reload');
  });

  test('finishing a stale copy of an already-finished run counts nothing again', () => {
    newGame();
    fill(0);
    letAutosaveRun();
    const staleCopy = storage.getItem(SAVE_KEY); // e.g. inside an exported backup
    fill(1);
    assert.equal(getStatistics('easy').gamesCompleted, 1);

    storage.setItem(SAVE_KEY, staleCopy); // the backup is imported
    clearAchievementProgressSessionOnly(); // …and the page reloaded
    continueSavedGame();
    fill(1);
    assert.equal(getState().status, 'complete');
    assert.equal(getStatistics('easy').gamesCompleted, 1);
    assert.equal(getHighScores('easy').length, 1);
    assert.equal(getAchievementProgress().wins, 1);
  });
});

describe('scoring and display are unchanged; achievements see the truth', () => {
  test('an undone mistake: the score and high score are as before, but the win is not perfect', () => {
    newGame();
    selectCell(0);
    applyNumberInput(wrongDigit(0));
    undo();
    OPEN_CELLS.forEach(fill);

    const entry = getHighScores('easy')[0];
    assert.equal(entry.mistakes, 0, 'displayed mistakes, as before');
    assert.equal(entry.score, calculateScore({ difficultyId: 'easy', elapsedSeconds: 0, mistakes: 0, hintsUsed: 0 }, DIFFICULTIES.easy));
    const progress = getAchievementProgress();
    assert.equal(progress.perfectWins, 0);
    assert.equal(progress.noHintWins, 1);
  });

  test('a save from before run tracking finishes as a win, but never as perfect or no-hint', () => {
    newGame();
    fill(0);
    letAutosaveRun();
    const { runId, runCounters, runCountersComplete, ...v1 } = JSON.parse(storage.getItem(SAVE_KEY));
    storage.setItem(SAVE_KEY, JSON.stringify({ ...v1, version: 1 }));
    resetToIdle();

    continueSavedGame();
    fill(1);
    const progress = getAchievementProgress();
    assert.equal(progress.wins, 1);
    assert.equal(progress.perfectWins, 0);
    assert.equal(progress.noHintWins, 0);
    assert.equal(getStatistics('easy').gamesCompleted, 1);
  });
});

describe('the unlock announcement (for the Puzzle Solved dialog)', () => {
  test('arrives during the completion, for this run, before later listeners see "complete"', () => {
    const heard = [];
    const stopHearing = onAchievementsUnlocked((ids, { runId }) => heard.push({ ids, runId }));
    let heardBeforeLaterListener = null;
    const stopWatching = onStateChange((state) => {
      if (state.status === 'complete') heardBeforeLaterListener = heard.length;
    });
    newGame();
    const runId = getState().runId;
    OPEN_CELLS.forEach(fill);
    stopHearing();
    stopWatching();
    assert.equal(heard.length, 1);
    assert.equal(heard[0].runId, runId);
    assert.ok(heard[0].ids.includes('wins-1') && heard[0].ids.includes('perfect-1'));
    assert.equal(heardBeforeLaterListener, 1, 'what js/ui/completion-dialog.js relies on');
  });

  test('a UI listener that throws can\'t stop Statistics and High Scores from recording the win', () => {
    const consoleError = mock.method(console, 'error', () => {});
    const stop = onAchievementsUnlocked(() => { throw new Error('UI bug'); });
    newGame();
    OPEN_CELLS.forEach(fill);
    stop();
    consoleError.mock.restore();
    assert.equal(getStatistics('easy').gamesCompleted, 1);
    assert.equal(getHighScores('easy').length, 1);
    assert.equal(storage.getItem(SAVE_KEY), null, 'and the save is still cleared');
  });
});

describe('achievements are checked on game events, never on timer ticks', () => {
  test('a minute of live clock (and the autosaves it triggers) never reads or writes achievement progress', () => {
    newGame({ autoStartTimer: true });
    fill(0);
    const access = countStorageAccess();
    // One second at a time, like a real clock: a single big tick() doesn't
    // run the autosave timeouts each tick schedules along the way.
    for (let second = 0; second < 60; second++) mock.timers.tick(1000);
    assert.ok(access.writes[SAVE_KEY] >= 59, 'the clock really ticked: each tick re-saved the game');
    assert.equal(access.reads[PROGRESS_KEY], undefined);
    assert.equal(access.writes[PROGRESS_KEY], undefined);

    fill(1); // the completion: one evaluation, one write
    assert.equal(access.writes[PROGRESS_KEY], 1);
    assert.ok(Object.hasOwn(getAchievementProgress().unlocked, 'wins-1'));
  });
});

describe('perfect means no mistakes and no hints all game — undo erases neither', () => {
  const cases = [
    ['a clean game', () => {}, { perfect: true, noHint: true }],
    ['an undone mistake', () => { selectCell(0); applyNumberInput(wrongDigit(0)); undo(); }, { perfect: false, noHint: true }],
    ['an undone hint', () => { selectCell(0); useHint(); undo(); }, { perfect: false, noHint: false }],
  ];
  for (const [name, play, expected] of cases) {
    test(`${name}: perfect ${expected.perfect ? 'unlocks' : 'stays locked'}, no-hint ${expected.noHint ? 'unlocks' : 'stays locked'}`, () => {
      newGame();
      play();
      OPEN_CELLS.forEach(fill);
      const { unlocked } = getAchievementProgress();
      assert.ok(Object.hasOwn(unlocked, 'wins-1'));
      assert.equal(Object.hasOwn(unlocked, 'perfect-1'), expected.perfect);
      assert.equal(Object.hasOwn(unlocked, 'no-hint-1'), expected.noHint);
    });
  }
});

describe('playstyle achievements need a completed run', () => {
  test('heavy note-taking unlocks nothing until that game is won', () => {
    newGame();
    for (let i = 0; i < HEAVY_NOTES_MIN_TOGGLES; i++) toggleNote(0, (i % 9) + 1);
    letAutosaveRun();
    assert.equal(Object.hasOwn(getAchievementProgress().unlocked, 'style-note-taker'), false);

    resetToIdle(); // a reload mid-game — the counters travel with the save
    continueSavedGame();
    assert.equal(Object.hasOwn(getAchievementProgress().unlocked, 'style-note-taker'), false);
    OPEN_CELLS.forEach(fill);
    assert.ok(Object.hasOwn(getAchievementProgress().unlocked, 'style-note-taker'));
  });
});

/** Counts storage reads and writes per key from now on. */
function countStorageAccess() {
  const access = { reads: {}, writes: {} };
  const { getItem, setItem } = storage;
  const bump = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };
  storage.getItem = (key) => { bump(access.reads, key); return getItem(key); };
  storage.setItem = (key, value) => { bump(access.writes, key); setItem(key, value); };
  return access;
}

// A page reload forgets the in-session dedup set; stored progress stays.
function clearAchievementProgressSessionOnly() {
  const saved = storage.getItem(PROGRESS_KEY);
  clearAchievementProgress();
  if (saved !== null) storage.setItem(PROGRESS_KEY, saved);
}
