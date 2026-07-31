import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  rowColToIndex,
  indexToRowCol,
  getRowValues,
  getColumnValues,
  getBoxValues,
  getRowIndices,
  getColumnIndices,
  getBoxIndices,
  isValidBoardShape,
  isValidPlacement,
  findEmptyCell,
  solveBoard,
  countSolutions,
  isSolved,
  getCandidates,
} from './sudoku-engine.js';

// ---- Fixtures ----
// Built programmatically rather than transcribed from a puzzle source, so
// there's no risk of a copy/paste digit error making a fixture secretly
// unsolvable or non-unique. This is the standard base-pattern construction
// for a valid Sudoku grid (see e.g. "Mathematics of Sudoku"): within each
// band of 3 rows the columns just cycle 1-9, and each successive row
// within a band shifts by 3, so no row/column/box can repeat a digit.

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

// Removes every cell whose index is NOT a multiple of `keepEvery`,
// deterministically (no Math.random) so the test is reproducible. The
// full solution is still `complete`, so the puzzle is solvable by
// construction even though we never assert what the unique solution is.
function makePuzzleFromSolution(complete, keepEvery) {
  return complete.map((value, index) => (index % keepEvery === 0 ? value : 0));
}

const completeBoard = buildValidCompletedBoard();
const solvablePuzzle = makePuzzleFromSolution(completeBoard, 3);

describe('coordinate conversion', () => {
  test('rowColToIndex matches row-major layout', () => {
    assert.equal(rowColToIndex(0, 0), 0);
    assert.equal(rowColToIndex(0, 8), 8);
    assert.equal(rowColToIndex(1, 0), 9);
    assert.equal(rowColToIndex(8, 8), 80);
  });

  test('indexToRowCol matches row-major layout', () => {
    assert.deepEqual(indexToRowCol(0), { row: 0, col: 0 });
    assert.deepEqual(indexToRowCol(9), { row: 1, col: 0 });
    assert.deepEqual(indexToRowCol(80), { row: 8, col: 8 });
  });

  test('round-trips for every one of the 81 cells', () => {
    for (let index = 0; index < 81; index++) {
      const { row, col } = indexToRowCol(index);
      assert.equal(rowColToIndex(row, col), index);
    }
  });

  test('rejects out-of-range row/col/index', () => {
    assert.throws(() => rowColToIndex(-1, 0), RangeError);
    assert.throws(() => rowColToIndex(0, 9), RangeError);
    assert.throws(() => rowColToIndex(1.5, 0), RangeError);
    assert.throws(() => indexToRowCol(-1), RangeError);
    assert.throws(() => indexToRowCol(81), RangeError);
  });
});

describe('board shape validation', () => {
  test('accepts a well-formed 81-cell board', () => {
    assert.equal(isValidBoardShape(completeBoard), true);
    assert.equal(isValidBoardShape(new Array(81).fill(0)), true);
  });

  test('rejects wrong length, non-array, and out-of-range/non-integer cells', () => {
    assert.equal(isValidBoardShape(new Array(80).fill(0)), false);
    assert.equal(isValidBoardShape(new Array(82).fill(0)), false);
    assert.equal(isValidBoardShape('not an array'), false);
    assert.equal(isValidBoardShape(null), false);
    assert.equal(isValidBoardShape(undefined), false);
    assert.equal(isValidBoardShape([...new Array(80).fill(0), -1]), false);
    assert.equal(isValidBoardShape([...new Array(80).fill(0), 10]), false);
    assert.equal(isValidBoardShape([...new Array(80).fill(0), 3.5]), false);
  });
});

describe('row/column/box extraction', () => {
  test('getRowValues returns the 9 cells of that row', () => {
    assert.deepEqual(getRowValues(completeBoard, 0), completeBoard.slice(0, 9));
  });

  test('getColumnValues returns the 9 cells of that column', () => {
    const col0 = getColumnValues(completeBoard, 0);
    assert.equal(col0.length, 9);
    for (let row = 0; row < 9; row++) {
      assert.equal(col0[row], completeBoard[row * 9]);
    }
  });

  test('getBoxValues returns the 9 cells of the containing 3x3 box', () => {
    const box = getBoxValues(completeBoard, 4, 4); // center box
    const expected = [30, 31, 32, 39, 40, 41, 48, 49, 50].map((i) => completeBoard[i]);
    assert.deepEqual(box, expected);
  });

  test('extraction functions return fresh arrays, not board references', () => {
    const row = getRowValues(completeBoard, 0);
    row[0] = 999;
    assert.notEqual(completeBoard[0], 999);
  });
});

describe('row/column/box index extraction', () => {
  test('getRowIndices returns the 9 board indices of that row, matching getRowValues', () => {
    for (let row = 0; row < 9; row++) {
      assert.deepEqual(
        getRowIndices(row).map((i) => completeBoard[i]),
        getRowValues(completeBoard, row)
      );
    }
    assert.deepEqual(getRowIndices(0), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('getColumnIndices returns the 9 board indices of that column, matching getColumnValues', () => {
    for (let col = 0; col < 9; col++) {
      assert.deepEqual(
        getColumnIndices(col).map((i) => completeBoard[i]),
        getColumnValues(completeBoard, col)
      );
    }
    assert.deepEqual(getColumnIndices(0), [0, 9, 18, 27, 36, 45, 54, 63, 72]);
  });

  test('getBoxIndices returns the 9 board indices of the containing box, matching getBoxValues', () => {
    assert.deepEqual(getBoxIndices(4, 4), [30, 31, 32, 39, 40, 41, 48, 49, 50]);
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        assert.deepEqual(
          getBoxIndices(row, col).map((i) => completeBoard[i]),
          getBoxValues(completeBoard, row, col)
        );
      }
    }
  });

  test('rejects out-of-range row/col', () => {
    assert.throws(() => getRowIndices(-1), RangeError);
    assert.throws(() => getRowIndices(9), RangeError);
    assert.throws(() => getColumnIndices(-1), RangeError);
    assert.throws(() => getColumnIndices(9), RangeError);
    assert.throws(() => getBoxIndices(-1, 0), RangeError);
    assert.throws(() => getBoxIndices(0, 9), RangeError);
  });
});

describe('placement legality', () => {
  test('accepts a value absent from the row/col/box', () => {
    const board = new Array(81).fill(0);
    assert.equal(isValidPlacement(board, 0, 0, 5), true);
  });

  test('rejects a value already used in the same row', () => {
    const board = new Array(81).fill(0);
    board[rowColToIndex(0, 3)] = 7;
    assert.equal(isValidPlacement(board, 0, 5, 7), false);
  });

  test('rejects a value already used in the same column', () => {
    const board = new Array(81).fill(0);
    board[rowColToIndex(3, 0)] = 7;
    assert.equal(isValidPlacement(board, 6, 0, 7), false);
  });

  test('rejects a value already used in the same box', () => {
    const board = new Array(81).fill(0);
    board[rowColToIndex(0, 0)] = 7;
    assert.equal(isValidPlacement(board, 2, 2, 7), false);
  });

  test("a cell's own current value does not conflict with itself", () => {
    assert.equal(isValidPlacement(completeBoard, 4, 4, completeBoard[rowColToIndex(4, 4)]), true);
  });

  test('rejects out-of-range values', () => {
    const board = new Array(81).fill(0);
    assert.throws(() => isValidPlacement(board, 0, 0, 0), RangeError);
    assert.throws(() => isValidPlacement(board, 0, 0, 10), RangeError);
  });
});

describe('solveBoard', () => {
  test('solves a solvable puzzle, preserving every given', () => {
    const solved = solveBoard(solvablePuzzle);
    assert.notEqual(solved, null);
    assert.equal(isSolved(solved), true);
    for (let i = 0; i < 81; i++) {
      if (solvablePuzzle[i] !== 0) {
        assert.equal(solved[i], solvablePuzzle[i], `given at index ${i} was not preserved`);
      }
    }
  });

  test('returns null for an unsolvable board (conflicting givens)', () => {
    const board = new Array(81).fill(0);
    board[rowColToIndex(0, 0)] = 5;
    board[rowColToIndex(0, 1)] = 5; // two 5s in row 0 — no completion can ever be valid
    assert.equal(solveBoard(board), null);
  });

  test('does not mutate the input board', () => {
    const before = solvablePuzzle.slice();
    solveBoard(solvablePuzzle);
    assert.deepEqual(solvablePuzzle, before);
  });

  test('returns null for malformed input rather than throwing', () => {
    assert.equal(solveBoard([1, 2, 3]), null);
    assert.equal(solveBoard(null), null);
  });
});

describe('countSolutions', () => {
  test('stops at the limit instead of exhaustively enumerating', () => {
    // An empty board has an astronomical number of solutions. If this
    // didn't stop early, it would never finish.
    const empty = new Array(81).fill(0);
    const start = performance.now();
    const count = countSolutions(empty, 2);
    const elapsedMs = performance.now() - start;
    assert.equal(count, 2);
    assert.ok(elapsedMs < 5000, `expected early stop, took ${elapsedMs}ms`);
  });

  test('returns 0 for a board with conflicting givens', () => {
    const board = new Array(81).fill(0);
    board[rowColToIndex(0, 0)] = 5;
    board[rowColToIndex(0, 1)] = 5;
    assert.equal(countSolutions(board, 2), 0);
  });

  test('finds at least one solution for a solvable puzzle', () => {
    assert.ok(countSolutions(solvablePuzzle, 2) >= 1);
  });

  test('does not mutate the input board', () => {
    const before = solvablePuzzle.slice();
    countSolutions(solvablePuzzle, 2);
    assert.deepEqual(solvablePuzzle, before);
  });
});

describe('isSolved', () => {
  test('true for a completed, valid board', () => {
    assert.equal(isSolved(completeBoard), true);
  });

  test('false for a completed board with a duplicate in a row', () => {
    const invalid = completeBoard.slice();
    invalid[rowColToIndex(0, 1)] = invalid[rowColToIndex(0, 0)]; // duplicate within row 0
    assert.equal(isSolved(invalid), false);
  });

  test('false while cells are still empty', () => {
    assert.equal(isSolved(solvablePuzzle), false);
  });
});

describe('getCandidates', () => {
  test('excludes values already used in the row, column, and box', () => {
    const board = new Array(81).fill(0);
    board[rowColToIndex(0, 1)] = 1; // same row
    board[rowColToIndex(1, 0)] = 2; // same column
    board[rowColToIndex(2, 2)] = 3; // same box
    const candidates = getCandidates(board, rowColToIndex(0, 0));
    assert.deepEqual(candidates, [4, 5, 6, 7, 8, 9]);
  });

  test('returns all 9 digits for a fully unconstrained empty board', () => {
    const board = new Array(81).fill(0);
    assert.deepEqual(getCandidates(board, 40), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('returns an empty array when every digit is already used among the peers', () => {
    const board = new Array(81).fill(0);
    // Fill the other 8 cells of index 0's box with 1-8...
    const boxPeers = [1, 2, 9, 10, 11, 18, 19, 20];
    boxPeers.forEach((index, i) => { board[index] = i + 1; });
    // ...and digit 9 via a row peer outside the box.
    board[rowColToIndex(0, 3)] = 9;
    assert.deepEqual(getCandidates(board, 0), []);
  });

  test('does not mutate the input board', () => {
    const before = solvablePuzzle.slice();
    getCandidates(solvablePuzzle, 0);
    assert.deepEqual(solvablePuzzle, before);
  });
});
