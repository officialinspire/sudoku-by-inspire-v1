const STORAGE_KEY = 'sudoku-inspire:appearance';
const SCHEMA_VERSION = 1;

export const THEME_PACKS = ['cyber', 'woodgrain', 'paper', 'light'];
export const COLOR_MODES = ['system', 'dark', 'light'];

const DEFAULTS = { theme: 'light', mode: 'system' };

const root = document.documentElement;
const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

let preference = { ...DEFAULTS };
const listeners = new Set();

function readStoredPreference() {
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

  // Reject anything that isn't exactly the schema we expect — an old
  // schema version, a hand-edited value, or corrupted storage all fall
  // back to safe defaults rather than being partially trusted.
  const isValid =
    parsed &&
    parsed.version === SCHEMA_VERSION &&
    THEME_PACKS.includes(parsed.theme) &&
    COLOR_MODES.includes(parsed.mode);

  return isValid ? { theme: parsed.theme, mode: parsed.mode } : { ...DEFAULTS };
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, ...preference })
    );
  } catch {
    // Storage unavailable (private browsing, quota exceeded, etc). The
    // chosen appearance still works for the rest of this session — it
    // just won't be remembered on reload.
  }
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
