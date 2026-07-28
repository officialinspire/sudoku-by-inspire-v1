import { loadJSON, saveJSON } from './storage.js';

const STORAGE_KEY = 'inspireSudoku:v1:appearance';
const SCHEMA_VERSION = 1;

export const THEME_PACKS = ['cyber', 'woodgrain', 'paper', 'light'];
export const COLOR_MODES = ['system', 'dark', 'light'];

const DEFAULTS = { theme: 'light', mode: 'system' };

const root = document.documentElement;
const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

let preference = { ...DEFAULTS };
const listeners = new Set();

function isValidPreference(value) {
  return (
    value &&
    value.version === SCHEMA_VERSION &&
    THEME_PACKS.includes(value.theme) &&
    COLOR_MODES.includes(value.mode)
  );
}

function readStoredPreference() {
  // An old schema version, a hand-edited value, or corrupted storage
  // all fall back to safe defaults rather than being partially trusted.
  const stored = loadJSON(STORAGE_KEY, { ...DEFAULTS, version: SCHEMA_VERSION }, isValidPreference);
  return { theme: stored.theme, mode: stored.mode };
}

function persist() {
  saveJSON(STORAGE_KEY, { version: SCHEMA_VERSION, ...preference });
}

function effectiveMode() {
  if (preference.mode === 'system') {
    return darkSchemeQuery.matches ? 'dark' : 'light';
  }
  return preference.mode;
}

function apply() {
  // "system" is a user preference, not a rendering state — the DOM
  // (and every CSS rule keyed on [data-mode]) only ever sees a
  // resolved "dark" or "light". See the token-architecture comment at
  // the top of styles.css for why this beats mirroring the resolution
  // inside an `@media (prefers-color-scheme)` block in CSS.
  root.dataset.theme = preference.theme;
  root.dataset.mode = effectiveMode();
  for (const listener of listeners) listener(getAppearance());
}

export function getAppearance() {
  return { ...preference, effectiveMode: effectiveMode() };
}

export function initTheme() {
  preference = readStoredPreference();
  apply();

  darkSchemeQuery.addEventListener('change', () => {
    if (preference.mode === 'system') apply();
  });
}

export function setTheme(theme) {
  if (!THEME_PACKS.includes(theme)) return;
  preference = { ...preference, theme };
  persist();
  apply();
}

export function setMode(mode) {
  if (!COLOR_MODES.includes(mode)) return;
  preference = { ...preference, mode };
  persist();
  apply();
}

export function resetAppearance() {
  preference = { ...DEFAULTS };
  persist();
  apply();
}

export function onAppearanceChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
