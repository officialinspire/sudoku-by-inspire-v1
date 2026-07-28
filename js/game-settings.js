/**
 * Gameplay preferences — separate from js/theme.js's *appearance*
 * settings on purpose: different concern, different storage key, same
 * versioned-localStorage-with-safe-fallback pattern. The only setting
 * so far is immediate error checking; this module exists as its own
 * small file rather than folded into theme.js so the next gameplay
 * preference (Phase 7+) has an obvious home instead of overloading the
 * appearance module.
 */

const STORAGE_KEY = 'sudoku-inspire:gameplay-settings';
const SCHEMA_VERSION = 1;

const DEFAULTS = { immediateErrorChecking: true };

let settings = { ...DEFAULTS };
const listeners = new Set();

function readStoredSettings() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULTS };
  }
  if (!raw) return { ...DEFAULTS };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULTS };
  }

  const isValid =
    parsed && parsed.version === SCHEMA_VERSION && typeof parsed.immediateErrorChecking === 'boolean';

  return isValid ? { immediateErrorChecking: parsed.immediateErrorChecking } : { ...DEFAULTS };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...settings }));
  } catch {
    // Storage unavailable — the setting still works for this session,
    // it just won't be remembered on reload.
  }
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

export function setImmediateErrorChecking(value) {
  settings = { ...settings, immediateErrorChecking: !!value };
  persist();
  notify();
}

export function onGameSettingsChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
