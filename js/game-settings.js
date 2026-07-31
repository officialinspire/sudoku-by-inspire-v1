/**
 * Gameplay preferences — separate from js/theme.js's *appearance*
 * settings on purpose: different concern, different storage key, same
 * versioned-storage-with-safe-fallback pattern (via js/storage.js). The
 * only setting so far is mistake detection mode; this module exists as
 * its own small file rather than folded into theme.js so the next
 * gameplay preference has an obvious home instead of overloading the
 * appearance module.
 *
 * Mistake Detection has two modes:
 * - 'immediate' (the default, and the app's original/only behavior
 *   before this setting existed — an existing player's experience never
 *   changes unless they explicitly pick 'classic'): a wrong entry is
 *   flagged the moment it's placed (js/ui/board-view.js's `isError`,
 *   js/ui/cell-aria.js's aria-label wording).
 * - 'classic': no per-cell flagging at all — a player only ever finds
 *   out a puzzle has a wrong entry the same way classic pencil-and-paper
 *   Sudoku does, by it failing to actually complete. This needs no
 *   separate logic of its own: js/game-state.js's `finishIfSolved`
 *   already calls the engine's real `isSolved()` against the full
 *   board, which a puzzle with any wrong entry can never satisfy (every
 *   generated puzzle has exactly one solution, so a deviation from it
 *   always breaks a row/column/box), and `mistakes`/hint counting are
 *   scoring bookkeeping, not player-facing flags — both stay exactly as
 *   they are in either mode. This is *why* 'classic' introduces no new
 *   gameplay-logic branch anywhere outside the UI layer.
 */

import { loadJSON, saveJSON } from './storage.js';

const STORAGE_KEY = 'inspireSudoku:v1:gameplaySettings';
const SCHEMA_VERSION = 2; // bumped: immediateErrorChecking (boolean) -> mistakeDetection (enum)

export const MISTAKE_DETECTION_MODES = ['immediate', 'classic'];

const DEFAULTS = { mistakeDetection: 'immediate' };

let settings = { ...DEFAULTS };
const listeners = new Set();

function isValidSettings(value) {
  return value && value.version === SCHEMA_VERSION && MISTAKE_DETECTION_MODES.includes(value.mistakeDetection);
}

function readStoredSettings() {
  // An old schema version (including the pre-existing boolean shape), a
  // hand-edited value, or corrupted storage all fall back to safe
  // defaults rather than being partially trusted — the same policy
  // js/theme.js already uses for its own preference storage.
  const stored = loadJSON(STORAGE_KEY, { ...DEFAULTS, version: SCHEMA_VERSION }, isValidSettings);
  return { mistakeDetection: stored.mistakeDetection };
}

function persist() {
  saveJSON(STORAGE_KEY, { version: SCHEMA_VERSION, ...settings });
}

function notify() {
  for (const listener of listeners) listener(getGameSettings());
}

export function getGameSettings() {
  return { ...settings };
}

export function initGameSettings() {
  settings = readStoredSettings();
}

export function setMistakeDetection(mode) {
  if (!MISTAKE_DETECTION_MODES.includes(mode)) return;
  settings = { ...settings, mistakeDetection: mode };
  persist();
  notify();
}

export function onGameSettingsChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
