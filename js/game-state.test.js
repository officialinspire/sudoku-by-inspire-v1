import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getState,
  onStateChange,
  startGame,
  restoreGame,
  selectCell,
  applyNumberInput,
  toggleNote,
  eraseSelectedCell,
  toggleNotesMode,
  useHint,
  MAX_HISTORY_SIZE,
  undo,
  moveSelection,
  pauseGame,
  resumeGame,
  resetToIdle,
  suspendTimer,
  resumeTimer,
  getPeerIndices,
} from './game-state.js';
import { rowColToIndex } from './sudoku-engine.js';

// Same base-pattern formula as js/sudoku-engine.test.js: a deterministic,
// self-verifiable valid completed grid, not transcribed from anywhere.
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

// A fixture puzzle with exactly one given (index 0) and everything else
// empty. State-layer tests don't need a uniqueness-guaranteed puzzle —
// applyNumberInput only ever compares against the stored `solution`
// field and checks structural peer conflicts, neither of which cares
// whether the puzzle has one solution or many.
function freshGameResult(overrides = {}) {
  const puzzle = new Array(81).fill(0);
  puzzle[0] = solution[0];
  return {
    puzzle,
    solution: solution.slice(),
    status: 'generated',
    attempts: 1,
    elapsedMs: 10,
    clueCount: 1,
    ...overrides,
  };
}

// autoStartTimer: false everywhere — otherwise every test would leave a
// real setInterval running against the test process.
function newGame(overrides) {
  startGame(freshGameResult(overrides), 'easy', { autoStartTimer: false });
}

// A controllable fake clock for timer tests — avoids any test needing
// to actually wait on real wall-clock time.
function fakeClock(startAt = 0) {
  let now = startAt;
  const clock = () => now;
  clock.advance = (ms) => { now += ms; };
  return clock;
}

beforeEach(() => {
  newGame();
});

describe('startGame', () => {
  test('initializes state fields', () => {
    const state = getState();
    assert.equal(state.status, 'playing');
    assert.equal(state.difficulty, 'easy');
    assert.equal(state.elapsedSeconds, 0);
    assert.equal(state.mistakes, 0);
    assert.equal(state.hintsUsed, 0);
    assert.equal(state.selectedIndex, null);
    assert.equal(state.notesMode, false);
    assert.deepEqual(state.history, []);
    assert.equal(state.entries.every((v) => v === 0), true);
    assert.equal(state.notes.every((v) => v === 0), true);
  });

  test('does not mutate the generator result it was given', () => {
    const result = freshGameResult();
    const puzzleBefore = result.puzzle.slice();
    startGame(result, 'easy', { autoStartTimer: false });
    applyNumberInput(9); // no cell selected yet, but exercises the path safely
    assert.deepEqual(result.puzzle, puzzleBefore);
  });
});

describe('selectCell', () => {
  test('selects a valid index', () => {
    selectCell(5);
    assert.equal(getState().selectedIndex, 5);
  });

  test('ignores out-of-range indices', () => {
    selectCell(5);
    selectCell(-1);
    selectCell(81);
    assert.equal(getState().selectedIndex, 5);
  });
});

describe('applyNumberInput — guards', () => {
  test('does nothing without a selected cell', () => {
    applyNumberInput(5);
    assert.equal(getState().entries.some((v) => v !== 0), false);
  });

  test('rejects invalid values (0, 10, non-integer)', () => {
    selectCell(1);
    applyNumberInput(0);
    applyNumberInput(10);
    applyNumberInput(3.5);
    assert.equal(getState().entries[1], 0);
  });

  test('rejects edits to a fixed clue', () => {
    selectCell(0); // index 0 is the puzzle's one given
    applyNumberInput(5);
    assert.equal(getState().entries[0], 0);
  });
});

describe('applyNumberInput — normal mode', () => {
  test('places a value and clears that cell\'s notes', () => {
    selectCell(1);
    toggleNotesMode();
    applyNumberInput(2); // note 2 on cell 1
    toggleNotesMode();
    applyNumberInput(solution[1]); // real entry
    const state = getState();
    assert.equal(state.entries[1], solution[1]);
    assert.equal(state.notes[1], 0);
  });

  test('removes the placed value from peer notes', () => {
    const peerIndex = getPeerIndices(1)[0];
    selectCell(peerIndex);
    toggleNotesMode();
    applyNumberInput(solution[1]); // candidate-note the value we're about to place at 1
    toggleNotesMode();
    selectCell(1);
    applyNumberInput(solution[1]);
    const bit = 1 << (solution[1] - 1);
    assert.equal(getState().notes[peerIndex] & bit, 0);
  });

  test('counts a mistake when the entry does not match the solution', () => {
    selectCell(1);
    const wrongValue = (solution[1] % 9) + 1; // guaranteed different digit
    applyNumberInput(wrongValue);
    assert.equal(getState().mistakes, 1);
    assert.equal(getState().entries[1], wrongValue);
  });

  test('does not count a mistake for a correct entry', () => {
    selectCell(1);
    applyNumberInput(solution[1]);
    assert.equal(getState().mistakes, 0);
  });

  test('replacing a value does not retroactively remove a counted mistake', () => {
    selectCell(1);
    const wrongValue = (solution[1] % 9) + 1;
    applyNumberInput(wrongValue);
    applyNumberInput(solution[1]); // corrected — but the earlier mistake already happened
    assert.equal(getState().mistakes, 1);
  });
});

describe('applyNumberInput — notes mode', () => {
  test('toggles a candidate bit without touching entries or mistakes', () => {
    selectCell(1);
    toggleNotesMode();
    applyNumberInput(4);
    const state = getState();
    assert.equal(state.notes[1] & (1 << 3), 1 << 3);
    assert.equal(state.entries[1], 0);
    assert.equal(state.mistakes, 0);
  });

  test('toggling the same digit twice clears the note', () => {
    selectCell(1);
    toggleNotesMode();
    applyNumberInput(4);
    applyNumberInput(4);
    assert.equal(getState().notes[1], 0);
  });
});

describe('conflicts', () => {
  test('two player entries with the same value in one row conflict; fixed clues never do', () => {
    const a = rowColToIndex(3, 0);
    const b = rowColToIndex(3, 1);
    selectCell(a);
    applyNumberInput(7);
    selectCell(b);
    applyNumberInput(7);
    const state = getState();
    assert.equal(state.conflicts.has(a), true);
    assert.equal(state.conflicts.has(b), true);
    assert.equal(state.conflicts.has(0), false); // the puzzle's fixed given
  });

  test('resolving the clash clears the conflict', () => {
    const a = rowColToIndex(3, 0);
    const b = rowColToIndex(3, 1);
    selectCell(a);
    applyNumberInput(7);
    selectCell(b);
    applyNumberInput(7);
    selectCell(b);
    applyNumberInput(8);
    assert.equal(getState().conflicts.has(a), false);
    assert.equal(getState().conflicts.has(b), false);
  });
});

describe('completion', () => {
  test('filling every cell to match the solution marks the game complete', () => {
    for (let i = 0; i < 81; i++) {
      if (i === 0) continue; // fixed given
      selectCell(i);
      applyNumberInput(solution[i]);
    }
    const state = getState();
    assert.equal(state.status, 'complete');
    assert.equal(state.selectedIndex, null);
    assert.equal(state.mistakes, 0);
  });

  test('an incomplete board is not marked complete', () => {
    selectCell(1);
    applyNumberInput(solution[1]);
    assert.equal(getState().status, 'playing');
  });

  test('placing notes never triggers completion, even on the last empty cell', () => {
    for (let i = 1; i < 81; i++) {
      selectCell(i);
      applyNumberInput(solution[i]);
    }
    // Board is now fully (correctly) filled and already complete; this
    // just documents that notes mode is a no-op with respect to
    // completion in general (it never writes to entries).
    toggleNotesMode();
    assert.equal(getState().status, 'complete');
  });
});

describe('eraseSelectedCell', () => {
  test('clears an entry and its notes', () => {
    selectCell(1);
    applyNumberInput(solution[1]);
    eraseSelectedCell();
    const state = getState();
    assert.equal(state.entries[1], 0);
    assert.equal(state.notes[1], 0);
  });

  test('does nothing to a fixed clue', () => {
    selectCell(0);
    eraseSelectedCell();
    assert.equal(getState().entries[0], 0); // it was never an entry to begin with
    assert.equal(getState().puzzle[0], solution[0]); // and the given is untouched
  });
});

describe('undo', () => {
  test('restores entries, notes, selection, and mistakes from before the last mutation', () => {
    selectCell(1);
    const wrongValue = (solution[1] % 9) + 1;
    applyNumberInput(wrongValue);
    assert.equal(getState().mistakes, 1);

    undo();

    const state = getState();
    assert.equal(state.entries[1], 0);
    assert.equal(state.mistakes, 0);
  });

  test('does nothing when there is no history', () => {
    undo();
    assert.equal(getState().selectedIndex, null);
  });
});

describe('moveSelection', () => {
  test('selects (0,0) on the first move when nothing is selected', () => {
    moveSelection(0, 1);
    assert.equal(getState().selectedIndex, 0);
  });

  test('moves by row/col delta', () => {
    selectCell(rowColToIndex(4, 4));
    moveSelection(1, 0);
    assert.equal(getState().selectedIndex, rowColToIndex(5, 4));
    moveSelection(0, -1);
    assert.equal(getState().selectedIndex, rowColToIndex(5, 3));
  });

  test('clamps at the board edges instead of wrapping', () => {
    selectCell(rowColToIndex(0, 0));
    moveSelection(-1, -1);
    assert.equal(getState().selectedIndex, rowColToIndex(0, 0));
  });
});

describe('pause/resume', () => {
  test('pausing blocks input and resuming restores it', () => {
    pauseGame();
    selectCell(1);
    applyNumberInput(solution[1]);
    assert.equal(getState().status, 'paused');
    assert.equal(getState().entries.some((v) => v !== 0), false);

    resumeGame();
    assert.equal(getState().status, 'playing');
    selectCell(1);
    applyNumberInput(solution[1]);
    assert.equal(getState().entries[1], solution[1]);
  });
});

describe('getPeerIndices', () => {
  test('returns exactly the 20 row/column/box peers, excluding self', () => {
    const peers = getPeerIndices(rowColToIndex(4, 4));
    assert.equal(peers.length, 20);
    assert.equal(peers.includes(rowColToIndex(4, 4)), false);
    assert.equal(peers.includes(rowColToIndex(4, 0)), true); // same row
    assert.equal(peers.includes(rowColToIndex(0, 4)), true); // same column
    assert.equal(peers.includes(rowColToIndex(3, 3)), true); // same box
  });
});

describe('single notify path', () => {
  test('one applyNumberInput call notifies subscribers exactly once', () => {
    let calls = 0;
    const unsubscribe = onStateChange(() => { calls += 1; });
    selectCell(1);
    calls = 0; // reset after the selectCell notify
    applyNumberInput(solution[1]);
    unsubscribe();
    assert.equal(calls, 1);
  });

  test('a rejected input (no-op guard) does not notify at all', () => {
    let calls = 0;
    const unsubscribe = onStateChange(() => { calls += 1; });
    applyNumberInput(10); // invalid value, no cell selected either
    unsubscribe();
    assert.equal(calls, 0);
  });
});

describe('toggleNote', () => {
  test('sets and clears a candidate bit, preserving unrelated notes', () => {
    toggleNote(1, 3);
    toggleNote(1, 6);
    let notes = getState().notes[1];
    assert.equal(notes & (1 << 2), 1 << 2); // digit 3
    assert.equal(notes & (1 << 5), 1 << 5); // digit 6

    toggleNote(1, 3); // clear just digit 3
    notes = getState().notes[1];
    assert.equal(notes & (1 << 2), 0);
    assert.equal(notes & (1 << 5), 1 << 5); // digit 6 untouched
  });

  test('rejects a fixed clue', () => {
    toggleNote(0, 5);
    assert.equal(getState().notes[0], 0);
  });

  test('rejects an already-filled cell', () => {
    selectCell(1);
    applyNumberInput(solution[1]);
    toggleNote(1, 4);
    assert.equal(getState().notes[1], 0);
  });

  test('is what applyNumberInput delegates to in notes mode', () => {
    selectCell(1);
    toggleNotesMode();
    applyNumberInput(7);
    assert.equal(getState().notes[1] & (1 << 6), 1 << 6);
  });
});

describe('bounded undo history', () => {
  test('caps at MAX_HISTORY_SIZE, dropping the oldest entries', () => {
    // Each toggleNote call pushes one history snapshot.
    for (let i = 0; i < MAX_HISTORY_SIZE + 10; i++) {
      toggleNote(1, (i % 9) + 1);
    }
    assert.equal(getState().history.length, MAX_HISTORY_SIZE);
  });
});

describe('useHint', () => {
  test('reveals the correct value and increments hintsUsed without counting a mistake', () => {
    selectCell(1);
    const ok = useHint();
    const state = getState();
    assert.equal(ok, true);
    assert.equal(state.entries[1], solution[1]);
    assert.equal(state.hintsUsed, 1);
    assert.equal(state.mistakes, 0);
  });

  test('clears the hinted cell\'s notes and removes the value from peer notes', () => {
    const peerIndex = getPeerIndices(1)[0];
    toggleNote(1, solution[1]);
    toggleNote(peerIndex, solution[1]);
    selectCell(1);
    useHint();
    const state = getState();
    assert.equal(state.notes[1], 0);
    assert.equal(state.notes[peerIndex] & (1 << (solution[1] - 1)), 0);
  });

  test('does nothing without a selection', () => {
    assert.equal(useHint(), false);
    assert.equal(getState().hintsUsed, 0);
  });

  test('does nothing on a fixed clue', () => {
    selectCell(0);
    assert.equal(useHint(), false);
  });

  test('does nothing if the cell is already correct', () => {
    selectCell(1);
    applyNumberInput(solution[1]);
    assert.equal(useHint(), false);
    assert.equal(getState().hintsUsed, 0);
  });

  test('is undoable', () => {
    selectCell(1);
    useHint();
    undo();
    const state = getState();
    assert.equal(state.entries[1], 0);
    assert.equal(state.hintsUsed, 0);
  });

  test('can complete the puzzle', () => {
    for (let i = 1; i < 80; i++) {
      selectCell(i);
      applyNumberInput(solution[i]);
    }
    // Every cell but the last (index 80) is now correctly filled.
    assert.notEqual(getState().status, 'complete');
    selectCell(80);
    useHint();
    assert.equal(getState().status, 'complete');
  });
});

describe('timer', () => {
  test('elapsed time accrues from a fake clock without any real interval', () => {
    const clock = fakeClock(0);
    startGame(freshGameResult(), 'easy', { autoStartTimer: false, now: clock });
    assert.equal(getState().elapsedSeconds, 0);
    clock.advance(3500);
    assert.equal(getState().elapsedSeconds, 3);
  });

  test('pausing freezes elapsed time; resuming continues accruing from there', () => {
    const clock = fakeClock(0);
    startGame(freshGameResult(), 'easy', { autoStartTimer: false, now: clock });
    clock.advance(5000);
    pauseGame();
    assert.equal(getState().elapsedSeconds, 5);

    clock.advance(60000); // time passes while paused
    assert.equal(getState().elapsedSeconds, 5); // not counted

    resumeGame();
    clock.advance(2000);
    assert.equal(getState().elapsedSeconds, 7);
  });

  test('a suspension reason freezes elapsed time without changing status', () => {
    const clock = fakeClock(0);
    startGame(freshGameResult(), 'easy', { autoStartTimer: false, now: clock });
    clock.advance(4000);
    suspendTimer('dialog');
    assert.equal(getState().status, 'playing'); // no overlay/pause — timer-only suspension
    clock.advance(10000);
    assert.equal(getState().elapsedSeconds, 4); // frozen while suspended

    resumeTimer('dialog');
    clock.advance(1000);
    assert.equal(getState().elapsedSeconds, 5);
  });

  test('multiple simultaneous suspension reasons only resume once all are cleared', () => {
    const clock = fakeClock(0);
    startGame(freshGameResult(), 'easy', { autoStartTimer: false, now: clock });
    clock.advance(2000);
    suspendTimer('hidden');
    suspendTimer('dialog');
    clock.advance(5000);

    resumeTimer('hidden'); // one reason cleared, one remains
    clock.advance(5000);
    assert.equal(getState().elapsedSeconds, 2); // still frozen — 'dialog' still holds it

    resumeTimer('dialog');
    clock.advance(3000);
    assert.equal(getState().elapsedSeconds, 5);
  });

  test('completion freezes elapsed time', () => {
    const clock = fakeClock(0);
    startGame(freshGameResult(), 'easy', { autoStartTimer: false, now: clock });
    for (let i = 1; i < 81; i++) {
      selectCell(i);
      applyNumberInput(solution[i]);
      clock.advance(100);
    }
    const elapsedAtCompletion = getState().elapsedSeconds;
    clock.advance(60000);
    assert.equal(getState().elapsedSeconds, elapsedAtCompletion);
  });
});

describe('restoreGame', () => {
  function savedGameFixture(overrides = {}) {
    const entries = new Array(81).fill(0);
    entries[1] = solution[1];
    const notes = new Array(81).fill(0);
    notes[2] = 0b101; // digits 1 and 3
    return {
      puzzle: freshGameResult().puzzle,
      solution: solution.slice(),
      entries,
      notes,
      selectedIndex: 4,
      difficulty: 'advanced',
      elapsedSeconds: 250,
      mistakes: 2,
      hintsUsed: 1,
      notesMode: true,
      ...overrides,
    };
  }

  test('restores every field and always resumes as paused', () => {
    restoreGame(savedGameFixture(), { autoStartTimer: false });
    const state = getState();
    assert.equal(state.status, 'paused');
    assert.equal(state.difficulty, 'advanced');
    assert.equal(state.elapsedSeconds, 250);
    assert.equal(state.mistakes, 2);
    assert.equal(state.hintsUsed, 1);
    assert.equal(state.selectedIndex, 4);
    assert.equal(state.notesMode, true);
    assert.equal(state.entries[1], solution[1]);
    assert.equal(state.notes[2], 0b101);
  });

  test('restored state is independently mutable (a fresh copy, not a shared reference)', () => {
    const saved = savedGameFixture();
    restoreGame(saved, { autoStartTimer: false });
    const before = saved.entries[1];
    resumeGame();
    selectCell(3);
    applyNumberInput(solution[3]);
    assert.equal(saved.entries[1], before); // the original fixture object is untouched
  });

  test('a restored game requires an explicit Resume before it accepts input', () => {
    restoreGame(savedGameFixture(), { autoStartTimer: false }); // restores with selectedIndex: 4
    selectCell(5); // rejected — game is 'paused', not 'playing'
    applyNumberInput(1); // also rejected
    const state = getState();
    assert.equal(state.selectedIndex, 4); // unchanged from the restored save, not 5
    assert.equal(state.entries[5], 0); // the input never applied
  });

  test('resumeGame after a restore continues the timer from the saved elapsedSeconds', () => {
    const clock = fakeClock(0);
    restoreGame(savedGameFixture({ elapsedSeconds: 100 }), { autoStartTimer: false, now: clock });
    resumeGame();
    clock.advance(5000);
    assert.equal(getState().elapsedSeconds, 105);
  });

  test('undo history starts empty after a restore', () => {
    restoreGame(savedGameFixture(), { autoStartTimer: false });
    assert.deepEqual(getState().history, []);
  });
});

describe('resetToIdle', () => {
  test('drops the in-memory game back to idle with no puzzle', () => {
    resetToIdle();
    const state = getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.puzzle, null);
    assert.equal(state.difficulty, null);
  });

  test('a reset game rejects further input', () => {
    resetToIdle();
    selectCell(0);
    applyNumberInput(1);
    assert.equal(getState().selectedIndex, null);
  });
});
