import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { saveActiveGame, loadActiveGame, hasActiveGame, clearActiveGame, serializeActiveGame } from './active-game-store.js';

function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
beforeEach(() => { globalThis.localStorage = createFakeStorage(); });
afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
});

function buildValidCompletedBoard() {
  const board = new Array(81).fill(0);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const shift = 3 * (row % 3) + Math.floor(row / 3);
      board[row * 9 + col] = ((shift + col) % 9) + 1;
    }
  }
  return board;
}

const solution = buildValidCompletedBoard();

function fakeGameState(overrides = {}) {
  const puzzle = new Array(81).fill(0);
  puzzle[0] = solution[0];
  return {
    puzzle,
    solution: solution.slice(),
    entries: new Array(81).fill(0),
    notes: new Array(81).fill(0),
    selectedIndex: 5,
    difficulty: 'easy',
    elapsedSeconds: 42,
    mistakes: 1,
    hintsUsed: 0,
    notesMode: false,
    status: 'playing',
    ...overrides,
  };
}

describe('save / load round trip', () => {
  test('saves and restores an equivalent game', () => {
    const state = fakeGameState();
    saveActiveGame(state);
    const loaded = loadActiveGame();
    assert.deepEqual(loaded.puzzle, state.puzzle);
    assert.deepEqual(loaded.solution, state.solution);
    assert.deepEqual(loaded.entries, state.entries);
    assert.deepEqual(loaded.notes, state.notes);
    assert.equal(loaded.selectedIndex, state.selectedIndex);
    assert.equal(loaded.difficulty, state.difficulty);
    assert.equal(loaded.elapsedSeconds, state.elapsedSeconds);
    assert.equal(loaded.mistakes, state.mistakes);
    assert.equal(loaded.hintsUsed, state.hintsUsed);
  });

  test('a paused game is restored as paused', () => {
    saveActiveGame(fakeGameState({ status: 'paused' }));
    assert.equal(loadActiveGame().status, 'paused');
  });

  test('serializeActiveGame never persists "complete" as an active status', () => {
    const serialized = serializeActiveGame(fakeGameState({ status: 'complete' }));
    assert.equal(serialized.status, 'playing');
  });
});

describe('hasActiveGame / clearActiveGame', () => {
  test('false with nothing saved, true after saving, false after clearing', () => {
    assert.equal(hasActiveGame(), false);
    saveActiveGame(fakeGameState());
    assert.equal(hasActiveGame(), true);
    clearActiveGame();
    assert.equal(hasActiveGame(), false);
  });
});

describe('validation / corrupt data', () => {
  test('malformed JSON fails safely (loadActiveGame returns null)', () => {
    localStorage.setItem('inspireSudoku:v1:activeGame', 'not json{{{');
    assert.equal(loadActiveGame(), null);
  });

  test('wrong schema version is rejected', () => {
    localStorage.setItem('inspireSudoku:v1:activeGame', JSON.stringify({ ...serializeActiveGame(fakeGameState()), version: 999 }));
    assert.equal(loadActiveGame(), null);
  });

  test('an unknown difficulty id is rejected', () => {
    localStorage.setItem('inspireSudoku:v1:activeGame', JSON.stringify(serializeActiveGame(fakeGameState({ difficulty: 'impossible' }))));
    assert.equal(loadActiveGame(), null);
  });

  test('a malformed board array (wrong length) is rejected', () => {
    const bad = serializeActiveGame(fakeGameState());
    bad.puzzle = bad.puzzle.slice(0, 80); // 80 instead of 81
    localStorage.setItem('inspireSudoku:v1:activeGame', JSON.stringify(bad));
    assert.equal(loadActiveGame(), null);
  });

  test('an out-of-range note bitmask is rejected', () => {
    const bad = serializeActiveGame(fakeGameState());
    bad.notes = bad.notes.slice();
    bad.notes[0] = 1024; // outside the 9-bit range
    localStorage.setItem('inspireSudoku:v1:activeGame', JSON.stringify(bad));
    assert.equal(loadActiveGame(), null);
  });

  test('a corrupt save can simply be cleared', () => {
    localStorage.setItem('inspireSudoku:v1:activeGame', 'garbage');
    clearActiveGame();
    assert.equal(loadActiveGame(), null);
    assert.equal(hasActiveGame(), false);
  });
});

describe('run tracking in the save (schema 2)', () => {
  const KEY = 'inspireSudoku:v1:activeGame';
  const tracking = { runId: 'run-abc-12345', runCounters: { mistakes: 2, hints: 1, undos: 5, notes: 9 }, runCountersComplete: true };

  test('a saved game keeps its run ID and counters through save → load', () => {
    saveActiveGame(fakeGameState(tracking));
    const loaded = loadActiveGame();
    assert.equal(loaded.version, 2);
    assert.equal(loaded.runId, tracking.runId);
    assert.deepEqual(loaded.runCounters, tracking.runCounters);
    assert.equal(loaded.runCountersComplete, true);
  });

  test('a schema-1 save (from before run tracking) still loads, upgraded conservatively and stably', () => {
    const { runId, runCounters, runCountersComplete, ...v1 } = serializeActiveGame(fakeGameState({ mistakes: 0, hintsUsed: 0 }));
    localStorage.setItem(KEY, JSON.stringify({ ...v1, version: 1 }));
    const first = loadActiveGame();
    const second = loadActiveGame();
    assert.equal(first.version, 2);
    assert.match(first.runId, /^legacy-/);
    assert.equal(second.runId, first.runId, 'the same old save always maps to the same run');
    assert.equal(first.runCountersComplete, false, 'its history is unknown: never a perfect run');
    assert.deepEqual(first.runCounters, { mistakes: 0, hints: 0, undos: 0, notes: 0 });
    assert.equal(hasActiveGame(), true);
  });

  test('a schema-2 save with broken run tracking is rejected, not half-trusted', () => {
    const good = serializeActiveGame(fakeGameState(tracking));
    for (const broken of [{ runId: 'x' }, { runCounters: { mistakes: -1, hints: 0, undos: 0, notes: 0 } }, { runCountersComplete: 'yes' }]) {
      localStorage.setItem(KEY, JSON.stringify({ ...good, ...broken }));
      assert.equal(loadActiveGame(), null, JSON.stringify(broken));
    }
  });

  test('unknown future schema versions are rejected', () => {
    localStorage.setItem(KEY, JSON.stringify({ ...serializeActiveGame(fakeGameState(tracking)), version: 3 }));
    assert.equal(loadActiveGame(), null);
  });
});
