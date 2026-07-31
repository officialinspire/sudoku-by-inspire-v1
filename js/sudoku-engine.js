/**
 * Pure Sudoku rules engine: board shape, coordinate math, candidate
 * generation, and a backtracking solver. No DOM, no localStorage, no
 * timers, no app state — every function here takes plain data in and
 * returns plain data out, so it can run identically in a browser, in
 * Node's test runner, or (later) inside a Web Worker.
 *
 * Board representation: an 81-element array of integers, row-major
 * (index = row * 9 + col). 1-9 is a filled cell, 0 is empty.
 */

const BOARD_SIZE = 81;
const GRID_SIZE = 9;
const BOX_SIZE = 3;

function assertValidCoord(row, col) {
  if (!Number.isInteger(row) || row < 0 || row > 8) {
    throw new RangeError(`row must be an integer 0-8, got ${row}`);
  }
  if (!Number.isInteger(col) || col < 0 || col > 8) {
    throw new RangeError(`col must be an integer 0-8, got ${col}`);
  }
}

function assertValidIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index > 80) {
    throw new RangeError(`index must be an integer 0-80, got ${index}`);
  }
}

function assertValidBoard(board) {
  if (!isValidBoardShape(board)) {
    throw new TypeError('board must be an 81-element array of integers 0-9');
  }
}

export function rowColToIndex(row, col) {
  assertValidCoord(row, col);
  return row * GRID_SIZE + col;
}

export function indexToRowCol(index) {
  assertValidIndex(index);
  return { row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE };
}

export function getRowValues(board, row) {
  assertValidBoard(board);
  if (!Number.isInteger(row) || row < 0 || row > 8) {
    throw new RangeError(`row must be an integer 0-8, got ${row}`);
  }
  const start = row * GRID_SIZE;
  return board.slice(start, start + GRID_SIZE);
}

export function getColumnValues(board, col) {
  assertValidBoard(board);
  if (!Number.isInteger(col) || col < 0 || col > 8) {
    throw new RangeError(`col must be an integer 0-8, got ${col}`);
  }
  const values = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    values.push(board[row * GRID_SIZE + col]);
  }
  return values;
}

export function getBoxValues(board, row, col) {
  assertValidBoard(board);
  assertValidCoord(row, col);
  // Integer division snaps (row, col) to the top-left corner of the
  // 3x3 box that contains it: e.g. row=4 -> Math.floor(4/3)*3 = 3.
  const boxRowStart = Math.floor(row / BOX_SIZE) * BOX_SIZE;
  const boxColStart = Math.floor(col / BOX_SIZE) * BOX_SIZE;
  const values = [];
  for (let r = boxRowStart; r < boxRowStart + BOX_SIZE; r++) {
    for (let c = boxColStart; c < boxColStart + BOX_SIZE; c++) {
      values.push(board[r * GRID_SIZE + c]);
    }
  }
  return values;
}

/**
 * Index-returning counterparts to getRowValues/getColumnValues/
 * getBoxValues above — same coordinate math, but for callers that need
 * to know *which cells* make up a unit rather than what's currently in
 * them (e.g. js/game-state.js checking whether every cell in a unit is
 * correct, or js/ui/board-view.js finding which cells to animate when a
 * unit completes). Take no `board` argument since the answer never
 * depends on board contents.
 */
export function getRowIndices(row) {
  if (!Number.isInteger(row) || row < 0 || row > 8) {
    throw new RangeError(`row must be an integer 0-8, got ${row}`);
  }
  const start = row * GRID_SIZE;
  return Array.from({ length: GRID_SIZE }, (_, col) => start + col);
}

export function getColumnIndices(col) {
  if (!Number.isInteger(col) || col < 0 || col > 8) {
    throw new RangeError(`col must be an integer 0-8, got ${col}`);
  }
  return Array.from({ length: GRID_SIZE }, (_, row) => row * GRID_SIZE + col);
}

export function getBoxIndices(row, col) {
  assertValidCoord(row, col);
  const boxRowStart = Math.floor(row / BOX_SIZE) * BOX_SIZE;
  const boxColStart = Math.floor(col / BOX_SIZE) * BOX_SIZE;
  const indices = [];
  for (let r = boxRowStart; r < boxRowStart + BOX_SIZE; r++) {
    for (let c = boxColStart; c < boxColStart + BOX_SIZE; c++) {
      indices.push(r * GRID_SIZE + c);
    }
  }
  return indices;
}

export function isValidBoardShape(board) {
  if (!Array.isArray(board)) return false;
  if (board.length !== BOARD_SIZE) return false;
  return board.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 9);
}

// Shared by isValidPlacement and getCandidates: the set of values already
// in play in (row, col)'s row, column, and box, excluding whatever is
// currently sitting in that cell itself — so checking a cell against its
// own existing value doesn't falsely conflict with itself.
function getUsedPeerValues(board, row, col) {
  const index = rowColToIndex(row, col);
  const cleared = board.slice();
  cleared[index] = 0;
  return new Set([
    ...getRowValues(cleared, row),
    ...getColumnValues(cleared, col),
    ...getBoxValues(cleared, row, col),
  ]);
}

export function isValidPlacement(board, row, col, value) {
  assertValidBoard(board);
  assertValidCoord(row, col);
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new RangeError(`value must be an integer 1-9, got ${value}`);
  }
  return !getUsedPeerValues(board, row, col).has(value);
}

export function findEmptyCell(board) {
  assertValidBoard(board);
  const index = board.indexOf(0);
  return index === -1 ? null : index;
}

// Duplicate non-zero values within any row/col/box mean the board's
// givens already contradict each other. Backtracking only ever fills
// currently-empty cells — it never revisits a given — so without this
// check a board with two conflicting givens could reach "no empty cells
// left" and be reported solved even though it never was.
function hasNoConflicts(board) {
  const hasDuplicateNonZero = (values) => {
    const seen = new Set();
    for (const value of values) {
      if (value === 0) continue;
      if (seen.has(value)) return true;
      seen.add(value);
    }
    return false;
  };

  for (let row = 0; row < GRID_SIZE; row++) {
    if (hasDuplicateNonZero(getRowValues(board, row))) return false;
  }
  for (let col = 0; col < GRID_SIZE; col++) {
    if (hasDuplicateNonZero(getColumnValues(board, col))) return false;
  }
  for (let boxRow = 0; boxRow < GRID_SIZE; boxRow += BOX_SIZE) {
    for (let boxCol = 0; boxCol < GRID_SIZE; boxCol += BOX_SIZE) {
      if (hasDuplicateNonZero(getBoxValues(board, boxRow, boxCol))) return false;
    }
  }
  return true;
}

function backtrackFill(working) {
  const emptyIndex = working.indexOf(0);
  if (emptyIndex === -1) return true; // base case: every cell filled, none of them conflicted

  const { row, col } = indexToRowCol(emptyIndex);
  for (let value = 1; value <= 9; value++) {
    if (isValidPlacement(working, row, col, value)) {
      working[emptyIndex] = value;
      if (backtrackFill(working)) return true;
      working[emptyIndex] = 0; // that branch dead-ended — undo before trying the next value
    }
  }
  return false; // no value (1-9) worked at this cell — tell the caller to backtrack further
}

/**
 * Attempts to solve `board`. Returns a solved *copy* on success, or
 * `null` if `board` has no solution (including malformed input or
 * conflicting givens) — this function never throws.
 */
export function solveBoard(board) {
  if (!isValidBoardShape(board) || !hasNoConflicts(board)) return null;
  const working = board.slice();
  return backtrackFill(working) ? working : null;
}

function countSolutionsRecursive(working, limit, state) {
  if (state.count >= limit) return; // already found enough — unwind without exploring further

  const emptyIndex = working.indexOf(0);
  if (emptyIndex === -1) {
    state.count += 1;
    return;
  }

  const { row, col } = indexToRowCol(emptyIndex);
  for (let value = 1; value <= 9; value++) {
    if (state.count >= limit) break;
    if (isValidPlacement(working, row, col, value)) {
      working[emptyIndex] = value;
      countSolutionsRecursive(working, limit, state);
      working[emptyIndex] = 0;
    }
  }
}

/**
 * Counts solutions to `board`, stopping as soon as `limit` is reached
 * rather than exhaustively enumerating every completion — a board with
 * few givens can have astronomically many solutions, so this early exit
 * is what makes uniqueness checking (`countSolutions(board, 2) === 1`)
 * practical. Malformed input or conflicting givens count as 0, never throw.
 */
export function countSolutions(board, limit = 2) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }
  if (!isValidBoardShape(board) || !hasNoConflicts(board)) return 0;
  const working = board.slice();
  const state = { count: 0 };
  countSolutionsRecursive(working, limit, state);
  return state.count;
}

export function isSolved(board) {
  if (!isValidBoardShape(board)) return false;
  if (board.includes(0)) return false;

  const isPermutationOfOneToNine = (values) => new Set(values).size === GRID_SIZE;

  for (let i = 0; i < GRID_SIZE; i++) {
    if (!isPermutationOfOneToNine(getRowValues(board, i))) return false;
    if (!isPermutationOfOneToNine(getColumnValues(board, i))) return false;
  }
  for (let boxRow = 0; boxRow < GRID_SIZE; boxRow += BOX_SIZE) {
    for (let boxCol = 0; boxCol < GRID_SIZE; boxCol += BOX_SIZE) {
      if (!isPermutationOfOneToNine(getBoxValues(board, boxRow, boxCol))) return false;
    }
  }
  return true;
}

export function getCandidates(board, index) {
  assertValidBoard(board);
  assertValidIndex(index);
  const { row, col } = indexToRowCol(index);
  const used = getUsedPeerValues(board, row, col);
  const candidates = [];
  for (let value = 1; value <= 9; value++) {
    if (!used.has(value)) candidates.push(value);
  }
  return candidates;
}
