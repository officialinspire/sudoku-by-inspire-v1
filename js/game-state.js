/**
 * Central, UI-independent game state: the single source of truth for
 * everything a playing Sudoku game needs. Every mutation (select a cell,
 * enter a digit, toggle a note, erase, undo, use a hint, pause) goes
 * through one of the exported functions here, and every one of them
 * ends by calling `notify()` — that's the one place "state changed" is
 * announced. The board UI (js/ui/board-view.js) and the game-screen
 * orchestrator (js/ui/game-screen.js) both subscribe via
 * `onStateChange` instead of being told individually by each mutating
 * function; a future autosave subscribes the same way rather than
 * needing new hooks.
 *
 * Like js/sudoku-generator.js, this module allows itself one thing the
 * pure engine doesn't: a `setInterval` for the elapsed-time clock. It
 * still has no DOM references (visibility/dialog-driven timer
 * suspension is requested by the UI layer via opaque reason strings,
 * not by this module reading `document` itself) and is fully
 * Node-testable.
 */

import { isValidPlacement, isSolved, indexToRowCol, rowColToIndex } from './sudoku-engine.js';

const BOARD_SIZE = 81;

// Generous for a single Sudoku session (even heavy notes-toggling rarely
// exceeds a few dozen actions) without letting history grow unbounded
// over a very long game — each entry holds two 81-element array copies,
// so unbounded growth is a real, if slow, memory leak over a long session.
export const MAX_HISTORY_SIZE = 50;

// v1 placeholder — Phase 7 (Statistics) owns the real scoring formula.
// Tracked here because hintsUsed already lives in this module and a
// hint's cost needs to be known at the moment it's used, not
// reconstructed later from a raw count.
export const HINT_SCORE_PENALTY = 50;

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

// ================================================================
// TIMER
// ================================================================
// Elapsed time is anchored to real timestamps, not accumulated by
// counting +1-per-tick — that avoids the small drift that repeated
// setInterval increments accumulate over a long session (setInterval's
// delay is a *minimum*, not a guarantee, and background tabs can throttle
// it further). `state.elapsedSeconds` holds seconds *confirmed* from
// completed segments; while a segment is running, `segmentStartedAt`
// (a real timestamp) plus "now minus that" is added on top, computed
// fresh every time elapsed time is read — never compounded.
//
// A segment is "running" exactly when status is 'playing' AND nothing
// in `timerSuspensions` is holding it back. Suspension reasons are
// opaque strings from the caller's point of view (this module never
// reads `document` itself) — the UI layer decides what counts as a
// reason (a hidden tab, an open dialog) and calls suspendTimer/
// resumeTimer accordingly. Multiple simultaneous reasons compose safely
// through a Set rather than a single boolean that two independent
// callers could stomp on each other's state with.
let clockNow = Date.now;
let segmentStartedAt = null;
let timerHandle = null;
let intervalEnabled = true;
const timerSuspensions = new Set();

function commitSegment() {
  if (segmentStartedAt === null) return;
  const elapsedSinceSegmentStart = Math.floor((clockNow() - segmentStartedAt) / 1000);
  state = { ...state, elapsedSeconds: state.elapsedSeconds + elapsedSinceSegmentStart };
  segmentStartedAt = null;
}

function canSegmentRun() {
  return state.status === 'playing' && timerSuspensions.size === 0;
}

function beginSegmentIfNeeded() {
  if (segmentStartedAt === null && canSegmentRun()) segmentStartedAt = clockNow();
}

function currentElapsedSeconds() {
  if (segmentStartedAt === null) return state.elapsedSeconds;
  return state.elapsedSeconds + Math.floor((clockNow() - segmentStartedAt) / 1000);
}

function stopTimer() {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// Segment tracking (the timestamp math above) and the interval below are
// deliberately independent: elapsed time is always tracked correctly the
// instant a segment begins, whether or not a live `setInterval` exists
// to periodically repaint it. The interval's *only* job is to trigger a
// re-render roughly once a second so an on-screen clock ticks — the
// *value* it renders always comes from currentElapsedSeconds()'s fresh
// timestamp math, never from this callback counting anything itself.
// That split is what makes elapsed time testable without a real timer:
// tests can advance a fake clock and read getState().elapsedSeconds
// with `autoStartTimer: false` and no interval running at all.
function startTimer() {
  stopTimer();
  timerHandle = setInterval(() => {
    if (canSegmentRun()) notify();
  }, 1000);
}

/**
 * Marks the timer as held back by `reason` (any caller-defined string —
 * e.g. `'hidden'` for a backgrounded tab, `'dialog'` for an open modal).
 * Safe to call redundantly; a reason already present is a no-op.
 */
export function suspendTimer(reason) {
  if (timerSuspensions.has(reason)) return;
  timerSuspensions.add(reason);
  commitSegment();
}

/**
 * Clears `reason`. The timer only actually resumes once *no* reason
 * remains — one lingering suspension (say, a dialog still open) keeps
 * it held even if another (the tab becoming visible again) just cleared.
 */
export function resumeTimer(reason) {
  if (!timerSuspensions.has(reason)) return;
  timerSuspensions.delete(reason);
  beginSegmentIfNeeded();
}

/**
 * Returns a full, ready-to-render snapshot: the raw state fields plus
 * `conflicts` (a Set of cell indices whose player entry currently
 * clashes with a peer) and the live-computed `elapsedSeconds`, both
 * derived fresh every call rather than cached on `state` — cheap and
 * impossible to let go stale, which a cached copy could.
 */
export function getState() {
  return { ...state, conflicts: computeConflicts(state), elapsedSeconds: currentElapsedSeconds() };
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

/**
 * Starts a new game from a `generatePuzzle()` result.
 * `options.autoStartTimer` defaults to true; tests pass `false` so they
 * don't leave a real `setInterval` running against the test process.
 * `options.now` (defaults to `Date.now`) lets tests supply a fake,
 * controllable clock instead of real wall-clock time.
 */
export function startGame(generationResult, difficultyId, options = {}) {
  stopTimer();
  segmentStartedAt = null;
  timerSuspensions.clear();
  clockNow = options.now ?? Date.now;
  intervalEnabled = options.autoStartTimer ?? true;
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
  // Elapsed-time tracking always begins — it's pure timestamp math, not
  // dependent on whether a live interval exists to periodically repaint
  // it (see the comment above startTimer()). Only the interval itself
  // is gated by autoStartTimer.
  beginSegmentIfNeeded();
  if (intervalEnabled) startTimer();
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
    hintsUsed: s.hintsUsed,
  };
  const history = [...s.history, snapshot];
  if (history.length > MAX_HISTORY_SIZE) history.shift(); // drop the oldest, keep the cap
  return { ...s, history };
}

function isSolvedNow(s) {
  return isSolved(mergedBoard(s));
}

function finishIfSolved() {
  if (isSolvedNow(state)) {
    state = { ...state, status: 'complete', selectedIndex: null };
    commitSegment();
    stopTimer();
  }
}

/**
 * Toggles a single candidate mark. This is the one place notes are
 * mutated — `applyNumberInput` delegates here in notes mode rather than
 * duplicating the logic, and it's independently callable/testable.
 * Rejects (silently, same policy as applyNumberInput) if: the game
 * isn't in progress, the cell is a fixed clue, or the cell already
 * holds a player-entered value — a filled cell has no use for
 * candidates, and letting notes accumulate underneath a value would be
 * silent, pointless state that could resurface confusingly if the cell
 * were ever erased without this guard.
 */
export function toggleNote(index, value) {
  if (state.status !== 'playing') return;
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return;
  if (!Number.isInteger(value) || value < 1 || value > 9) return;
  if (state.puzzle[index] !== 0) return; // fixed
  if (state.entries[index] !== 0) return; // filled

  const next = pushHistory(state);
  const notes = next.notes.slice();
  notes[index] ^= 1 << (value - 1); // every other bit is untouched — unrelated notes are preserved by construction
  state = { ...next, notes };
  notify();
}

/**
 * The entry point for pressing a digit — number pad or keyboard alike.
 * Guards, in order: value must be a real digit (1-9, anything else is
 * silently ignored since this is user input, not a programmer error), a
 * game must be in progress, a cell must be selected, that cell must not
 * be a fixed clue. In notes mode it delegates to `toggleNote` and stops
 * (notes have no mistake count, no completion check — a pencil mark is
 * a guess-in-progress, not an answer). In normal mode it records undo
 * history, writes the entry, clears that cell's own notes, clears the
 * placed value from every peer's notes, counts a mistake if it doesn't
 * match the solution, then runs exactly one conflict recheck and one
 * completion check, then `notify()`s once — never several partial
 * updates for one keypress.
 */
export function applyNumberInput(value) {
  if (!Number.isInteger(value) || value < 1 || value > 9) return;
  if (state.status !== 'playing') return;
  if (state.selectedIndex === null) return;
  const index = state.selectedIndex;
  if (state.puzzle[index] !== 0) return;

  if (state.notesMode) {
    toggleNote(index, value);
    return;
  }

  const next = pushHistory(state);
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

  state = { ...next, entries, notes, mistakes };
  finishIfSolved();
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

/**
 * Reveals the solution's value for the selected cell. Costs a hint
 * (see HINT_SCORE_PENALTY) and, like a normal entry, clears the cell's
 * own notes and removes the revealed value from peer notes — a hint is
 * still a real placed value, not a different kind of thing the rest of
 * the board should treat specially. No confirmation prompt lives here;
 * that's a UI concern (see js/ui/hint-dialog.js) so this function stays
 * a plain action, testable the same way as every other mutation.
 * Returns `false` (and does nothing) if there's nothing to hint — no
 * selection, a fixed cell, or a cell that's already correct.
 */
export function useHint() {
  if (state.status !== 'playing') return false;
  if (state.selectedIndex === null) return false;
  const index = state.selectedIndex;
  if (state.puzzle[index] !== 0) return false;
  const value = state.solution[index];
  if (state.entries[index] === value) return false;

  const next = pushHistory(state);
  const entries = next.entries.slice();
  const notes = next.notes.slice();
  entries[index] = value;
  notes[index] = 0;

  const bit = 1 << (value - 1);
  for (const peerIndex of getPeerIndices(index)) {
    if (notes[peerIndex] & bit) notes[peerIndex] &= ~bit;
  }

  state = { ...next, entries, notes, hintsUsed: next.hintsUsed + 1 };
  finishIfSolved();
  notify();
  return true;
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
    hintsUsed: previous.hintsUsed,
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
  commitSegment();
  stopTimer();
  state = { ...state, status: 'paused' };
  notify();
}

export function resumeGame() {
  if (state.status !== 'paused') return;
  state = { ...state, status: 'playing' };
  beginSegmentIfNeeded();
  if (intervalEnabled) startTimer();
  notify();
}
