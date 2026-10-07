/**
 * The real game state + autosave + stores, end to end, on fake storage:
 * each run must be counted exactly once — through Continue, a reload, or
 * a stale copy of the save — with scoring and the displayed counts
 * unchanged.
 */
import { describe, test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, restoreGame, resumeGame, selectCell, applyNumberInput, undo, getState, resetToIdle } from './game-state.js';
import { initGamePersistence } from './game-persistence.js';
import { loadActiveGame } from './active-game-store.js';
import { getStatistics } from './statistics-store.js';
import { getHighScores } from './high-scores-store.js';
import { getAchievementProgress, clearAchievementProgress } from './achievement-store.js';
import { calculateScore } from './scoring.js';
import { DIFFICULTIES } from './sudoku-generator.js';

const SAVE_KEY = 'inspireSudoku:v1:activeGame';
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

function newGame() {
  startGame({ puzzle, solution, status: 'generated', attempts: 1, elapsedMs: 1, clueCount: 79 }, 'easy', { autoStartTimer: false });
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
  mock.timers.enable({ apis: ['setTimeout'] });
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

// A page reload forgets the in-session dedup set; stored progress stays.
function clearAchievementProgressSessionOnly() {
  const key = 'inspireSudoku:v1:achievementProgress';
  const saved = storage.getItem(key);
  clearAchievementProgress();
  if (saved !== null) storage.setItem(key, saved);
}
