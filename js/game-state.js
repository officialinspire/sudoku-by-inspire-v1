/**
 * Central, UI-independent game state: the single source of truth for
 * everything a playing Sudoku game needs. Every mutation (select a cell,
 * enter a digit, erase, toggle notes, undo, pause) goes through one of
 * the exported functions here, and every one of them ends by calling
 * `notify()` — that's the one place "state changed" is announced. The
 * board UI (js/ui/board-view.js) and the game-screen orchestrator
 * (js/ui/game-screen.js) both subscribe via `onStateChange` instead of
 * being told individually by each mutating function; a future autosave
 * (Phase 6) subscribes the same way rather than needing new hooks.
 *
 * Like js/sudoku-generator.js, this module allows itself one thing the
 * pure engine doesn't: a `setInterval` for the elapsed-time clock. It
 * still has no DOM references and is fully Node-testable.
 */

import { isValidPlacement, isSolved, indexToRowCol, rowColToIndex } from './sudoku-engine.js';

const BOARD_SIZE = 81;

const listeners = new Set();

function notify() {
  const snapshot = getState();
  for (const listener of listeners) listener(snapshot);
}

export function onStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function createEmptyState() {
  return {
    puzzle: null,
    solution: null,
    entries: new Array(BOARD_SIZE).fill(0),
    notes: new Array(BOARD_SIZE).fill(0), // bitmask per cell: bit (d-1) set = digit d is a candidate
    selectedIndex: null,
    difficulty: null,
    elapsedSeconds: 0,
    mistakes: 0,
    hintsUsed: 0,
    history: [],
    status: 'idle', // 'idle' | 'playing' | 'paused' | 'complete'
    notesMode: false,
    generationMeta: null,
  };
}

let state = createEmptyState();
let timerHandle = null;

/**
 * Returns a full, ready-to-render snapshot: the raw state fields plus
 * `conflicts` (a Set of cell indices whose player entry currently
 * clashes with a peer), computed fresh every call rather than cached on
 * `state` — cheap (at most 81 peer checks) and impossible to let go
 * stale, which a cached copy could.
 */
export function getState() {
  return { ...state, conflicts: computeConflicts(state) };
}

function mergedBoard(s) {
  const board = new Array(BOARD_SIZE);
  for (let i = 0; i < BOARD_SIZE; i++) {
    board[i] = s.puzzle[i] !== 0 ? s.puzzle[i] : s.entries[i];
  }
  return board;
}

/**
 * The 20 cells sharing a row, column, or box with `index` (never
 * including `index` itself). Exported so the board UI can compute
 * "related cell" highlighting from the same definition of "peer" that
 * the mutation logic below uses for note cleanup and conflict checks —
 * one definition of "peer," not two that could drift apart.
 */
export function getPeerIndices(index) {
  const { row, col } = indexToRowCol(index);
  const peers = new Set();
  for (let c = 0; c < 9; c++) if (c !== col) peers.add(rowColToIndex(row, c));
  for (let r = 0; r < 9; r++) if (r !== row) peers.add(rowColToIndex(r, col));
  const boxRowStart = Math.floor(row / 3) * 3;
  const boxColStart = Math.floor(col / 3) * 3;
  for (let r = boxRowStart; r < boxRowStart + 3; r++) {
    for (let c = boxColStart; c < boxColStart + 3; c++) {
      const i = rowColToIndex(r, c);
      if (i !== index) peers.add(i);
    }
  }
  return [...peers];
}

function computeConflicts(s) {
  const conflicts = new Set();
  if (!s.puzzle) return conflicts;
  const board = mergedBoard(s);
  for (let i = 0; i < BOARD_SIZE; i++) {
    // Fixed clues are never "in conflict" — a generated puzzle's givens
    // are guaranteed consistent with each other; only a player entry
    // can clash with something.
    if (s.entries[i] === 0) continue;
    const { row, col } = indexToRowCol(i);
    if (!isValidPlacement(board, row, col, board[i])) {
      conflicts.add(i);
    }
  }
  return conflicts;
}

function stopTimer() {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

function startTimer() {
  stopTimer();
  timerHandle = setInterval(() => {
    if (state.status === 'playing') {
      state = { ...state, elapsedSeconds: state.elapsedSeconds + 1 };
      notify();
    }
  }, 1000);
}

/**
 * Starts a new game from a `generatePuzzle()` result. `options.autoStartTimer`
 * defaults to true; tests pass `false` so they don't leave a real
 * `setInterval` running against the test process.
 */
export function startGame(generationResult, difficultyId, options = {}) {
  stopTimer();
  state = {
    ...createEmptyState(),
    puzzle: generationResult.puzzle.slice(),
    solution: generationResult.solution.slice(),
    difficulty: difficultyId,
    status: 'playing',
    generationMeta: {
      status: generationResult.status,
      attempts: generationResult.attempts,
      elapsedMs: generationResult.elapsedMs,
      clueCount: generationResult.clueCount,
    },
  };
  if (options.autoStartTimer ?? true) startTimer();
  notify();
}

export function selectCell(index) {
  if (state.status !== 'playing') return;
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return;
  if (state.selectedIndex === index) return;
  state = { ...state, selectedIndex: index };
  notify();
}

function pushHistory(s) {
  const snapshot = {
    entries: s.entries.slice(),
    notes: s.notes.slice(),
    selectedIndex: s.selectedIndex,
    mistakes: s.mistakes,
  };
  return { ...s, history: [...s.history, snapshot] };
}

function isSolvedNow(s) {
  return isSolved(mergedBoard(s));
}

/**
 * The one entry point for placing a digit. Every guard is checked in
 * order before anything mutates:
 * 1. value must be a real digit (1-9) — anything else is silently
 *    ignored rather than throwing, since this is driven by user input
 *    (a stray keypress isn't a programmer error).
 * 2. a game must be in progress.
 * 3. a cell must be selected.
 * 4. that cell must not be a fixed clue.
 * Only after all four hold does it record undo history, then branch on
 * notes mode vs. normal entry, and finish with exactly one conflict
 * check, one completion check, and one `notify()` — never several
 * partial updates.
 */
export function applyNumberInput(value) {
  if (!Number.isInteger(value) || value < 1 || value > 9) return;
  if (state.status !== 'playing') return;
  if (state.selectedIndex === null) return;
  const index = state.selectedIndex;
  if (state.puzzle[index] !== 0) return;

  let next = pushHistory(state);

  if (next.notesMode) {
    const notes = next.notes.slice();
    const bit = 1 << (value - 1);
    notes[index] ^= bit;
    next = { ...next, notes };
  } else {
    const entries = next.entries.slice();
    const notes = next.notes.slice();
    entries[index] = value;
    notes[index] = 0; // a cell with a real value doesn't need candidate notes anymore

    // A placed digit is no longer a candidate for any peer — clear it
    // from their notes too, the same "remove this candidate everywhere
    // it's now impossible" cleanup a paper-and-pencil solver would do.
    const bit = 1 << (value - 1);
    for (const peerIndex of getPeerIndices(index)) {
      if (notes[peerIndex] & bit) notes[peerIndex] &= ~bit;
    }

    const mistakes = next.solution[index] !== value ? next.mistakes + 1 : next.mistakes;

    next = { ...next, entries, notes, mistakes };
  }

  state = next;

  if (!state.notesMode && isSolvedNow(state)) {
    state = { ...state, status: 'complete', selectedIndex: null };
    stopTimer();
  }

  notify();
}

export function eraseSelectedCell() {
  if (state.status !== 'playing') return;
  if (state.selectedIndex === null) return;
  const index = state.selectedIndex;
  if (state.puzzle[index] !== 0) return;
  if (state.entries[index] === 0 && state.notes[index] === 0) return; // nothing to do

  const next = pushHistory(state);
  const entries = next.entries.slice();
  const notes = next.notes.slice();
  entries[index] = 0;
  notes[index] = 0;
  state = { ...next, entries, notes };
  notify();
}

export function toggleNotesMode() {
  if (state.status !== 'playing') return;
  state = { ...state, notesMode: !state.notesMode };
  notify();
}

export function undo() {
  if (state.status !== 'playing') return;
  if (state.history.length === 0) return;
  const history = state.history.slice();
  const previous = history.pop();
  state = {
    ...state,
    entries: previous.entries,
    notes: previous.notes,
    selectedIndex: previous.selectedIndex,
    mistakes: previous.mistakes,
    history,
  };
  notify();
}

export function moveSelection(rowDelta, colDelta) {
  if (state.status !== 'playing') return;
  if (state.selectedIndex === null) {
    state = { ...state, selectedIndex: 0 };
    notify();
    return;
  }
  const { row, col } = indexToRowCol(state.selectedIndex);
  const newIndex = rowColToIndex(
    Math.min(8, Math.max(0, row + rowDelta)),
    Math.min(8, Math.max(0, col + colDelta))
  );
  if (newIndex === state.selectedIndex) return;
  state = { ...state, selectedIndex: newIndex };
  notify();
}

export function pauseGame() {
  if (state.status !== 'playing') return;
  state = { ...state, status: 'paused' };
  notify();
}

export function resumeGame() {
  if (state.status !== 'paused') return;
  state = { ...state, status: 'playing' };
  notify();
}
