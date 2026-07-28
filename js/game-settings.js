/**
 * Gameplay preferences — separate from js/theme.js's *appearance*
 * settings on purpose: different concern, different storage key, same
 * versioned-storage-with-safe-fallback pattern (via js/storage.js). The
 * only setting so far is immediate error checking; this module exists
 * as its own small file rather than folded into theme.js so the next
 * gameplay preference has an obvious home instead of overloading the
 * appearance module.
 */

import { loadJSON, saveJSON } from './storage.js';

const STORAGE_KEY = 'inspireSudoku:v1:gameplaySettings';
const SCHEMA_VERSION = 1;

const DEFAULTS = { immediateErrorChecking: true };

let settings = { ...DEFAULTS };
const listeners = new Set();

function isValidSettings(value) {
  return value && value.version === SCHEMA_VERSION && typeof value.immediateErrorChecking === 'boolean';
}

function readStoredSettings() {
  const stored = loadJSON(STORAGE_KEY, { ...DEFAULTS, version: SCHEMA_VERSION }, isValidSettings);
  return { immediateErrorChecking: stored.immediateErrorChecking };
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

export function setImmediateErrorChecking(value) {
  settings = { ...settings, immediateErrorChecking: !!value };
  persist();
  notify();
}

export function onGameSettingsChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
