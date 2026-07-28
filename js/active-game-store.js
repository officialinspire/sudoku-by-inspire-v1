/**
 * Persists exactly one in-progress game — what "Continue Game" restores
 * and what autosave (js/game-persistence.js) keeps up to date. Never
 * holds a completed game (nothing to continue); completion clears it.
 */

import { loadJSON, saveJSON, removeJSON } from './storage.js';
import { isValidBoardShape } from './sudoku-engine.js';
import { DIFFICULTY_IDS } from './sudoku-generator.js';

const STORAGE_KEY = 'inspireSudoku:v1:activeGame';
const SCHEMA_VERSION = 1;

function isValidNotesArray(value) {
  return (
    Array.isArray(value) &&
    value.length === 81 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 0b111111111)
  );
}

function isValidActiveGame(value) {
  return (
    value &&
    value.version === SCHEMA_VERSION &&
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

/** Returns the saved game, or `null` if there isn't one or it's invalid/corrupt. */
export function loadActiveGame() {
  return loadJSON(STORAGE_KEY, null, isValidActiveGame);
}

export function hasActiveGame() {
  return loadActiveGame() !== null;
}

export function clearActiveGame() {
  return removeJSON(STORAGE_KEY);
}
