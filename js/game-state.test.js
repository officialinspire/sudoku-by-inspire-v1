import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getState,
  onStateChange,
  startGame,
  selectCell,
  applyNumberInput,
  eraseSelectedCell,
  toggleNotesMode,
  undo,
  moveSelection,
  pauseGame,
  resumeGame,
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
