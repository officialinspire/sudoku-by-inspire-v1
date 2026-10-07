/**
 * Persists exactly one in-progress game — what "Continue Game" restores
 * and what autosave (js/game-persistence.js) keeps up to date. Never
 * holds a completed game (nothing to continue); completion clears it.
 *
 * Schema 2 adds the run's identity and monotonic counters
 * (js/run-tracking.js), so a continued game stays the same run. Schema 1
 * saves (from before run tracking) still load: they're upgraded on read
 * by normalizeRunTracking — conservatively, never as a perfect-eligible
 * run — and written back as schema 2 by the next autosave.
 */

import { loadJSON, saveJSON, removeJSON } from './storage.js';
import { isValidBoardShape } from './sudoku-engine.js';
import { DIFFICULTY_IDS } from './sudoku-generator.js';
import { isValidRunId, isValidRunCounters, normalizeRunTracking } from './run-tracking.js';

const STORAGE_KEY = 'inspireSudoku:v1:activeGame';
const SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;

function isValidNotesArray(value) {
  return (
    Array.isArray(value) &&
    value.length === 81 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 0b111111111)
  );
}

function isValidRunTracking(value) {
  return isValidRunId(value.runId) && isValidRunCounters(value.runCounters) && typeof value.runCountersComplete === 'boolean';
}

function isValidActiveGame(value) {
  if (!value) return false;
  if (value.version === SCHEMA_VERSION && !isValidRunTracking(value)) return false;
  return (
    (value.version === SCHEMA_VERSION || value.version === LEGACY_SCHEMA_VERSION) &&
    isValidBoardShape(value.puzzle) &&
    isValidBoardShape(value.solution) &&
    isValidBoardShape(value.entries) &&
    isValidNotesArray(value.notes) &&
    (value.selectedIndex === null || (Number.isInteger(value.selectedIndex) && value.selectedIndex >= 0 && value.selectedIndex < 81)) &&
    DIFFICULTY_IDS.includes(value.difficulty) &&
    Number.isInteger(value.elapsedSeconds) && value.elapsedSeconds >= 0 &&
    Number.isInteger(value.mistakes) && value.mistakes >= 0 &&
    Number.isInteger(value.hintsUsed) && value.hintsUsed >= 0 &&
    typeof value.notesMode === 'boolean' &&
    (value.status === 'playing' || value.status === 'paused')
  );
}

/** Builds the persisted shape from a game-state snapshot (getState()). */
export function serializeActiveGame(state) {
  return {
    version: SCHEMA_VERSION,
    puzzle: state.puzzle,
    solution: state.solution,
    entries: state.entries,
    notes: state.notes,
    selectedIndex: state.selectedIndex,
    difficulty: state.difficulty,
    elapsedSeconds: state.elapsedSeconds,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    notesMode: state.notesMode,
    // Normalized so this can never write a save its own loader rejects
    // (real game state always carries valid tracking already).
    ...normalizeRunTracking(state),
    // A completed game is never persisted as "active" — the caller is
    // responsible for calling clearActiveGame() on completion instead
    // of saveActiveGame(), but this floor guards against saving a
    // stray 'complete' snapshot some other way.
    status: state.status === 'paused' ? 'paused' : 'playing',
  };
}

export function saveActiveGame(state) {
  return saveJSON(STORAGE_KEY, serializeActiveGame(state));
}

/**
 * Returns the saved game (always in the current schema, with run
 * tracking), or `null` if there isn't one or it's invalid/corrupt.
 */
export function loadActiveGame() {
  const saved = loadJSON(STORAGE_KEY, null, isValidActiveGame);
  if (saved === null) return null;
  return { ...saved, version: SCHEMA_VERSION, ...normalizeRunTracking(saved) };
}

export function hasActiveGame() {
  return loadActiveGame() !== null;
}

export function clearActiveGame() {
  return removeJSON(STORAGE_KEY);
}
