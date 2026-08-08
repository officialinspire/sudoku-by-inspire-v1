/**
 * Manual local backup/restore: bundles every `inspireSudoku:v1:*` key
 * this app persists (appearance, gameplay/audio settings, statistics,
 * high scores, the active game) into one downloadable JSON file, and
 * restores from one. No server, no account — this is a plain file the
 * player keeps themselves, matching the app's fully local, offline-
 * first storage model rather than adding one.
 *
 * Deliberately dumb on the way in: `applyBackup` only checks the outer
 * envelope shape (is this actually a backup file, is its version one we
 * recognize) and otherwise writes each key's value straight into
 * localStorage without re-validating its contents itself. That's not a
 * gap — every store module's own `load()` (via js/storage.js's
 * `loadJSON`) already re-validates whatever's in localStorage on every
 * read, the same safety net that already protects against hand-edited
 * or corrupted localStorage today. Duplicating each store's validator
 * here would just be a second copy that could drift out of sync with
 * the original; letting the existing one run naturally on next read is
 * simpler and can't disagree with it. A full page reload after import
 * (see js/ui/data-backup-controls.js) is what actually makes the
 * restored data take effect everywhere — several store modules
 * (js/theme.js, js/game-settings.js, js/audio-settings.js) cache their
 * settings in memory after their own init() and only update that cache
 * through their own setters, so a raw localStorage write alone wouldn't
 * reach them until the next load anyway.
 */

const BACKUP_VERSION = 1;
const APP_NAME = 'Sudoku by Inspire';

const STORAGE_KEYS = [
  'inspireSudoku:v1:appearance',
  'inspireSudoku:v1:gameplaySettings',
  'inspireSudoku:v1:audioSettings',
  'inspireSudoku:v1:statistics',
  'inspireSudoku:v1:highScores',
  'inspireSudoku:v1:activeGame',
];

/** Builds the exportable backup object from whatever's currently in localStorage. */
export function buildBackup() {
  const data = {};
  for (const key of STORAGE_KEYS) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue; // storage denied (e.g. private browsing) -- skip, not fatal
    }
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      // Already-corrupt localStorage -- skip rather than export garbage;
      // the store's own load() would have discarded it anyway.
    }
  }
  return {
    app: APP_NAME,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Applies a parsed backup object (as produced by buildBackup, or
 * hand-edited/from elsewhere) to localStorage. Returns
 * `{ ok: true, keysWritten }` on success or `{ ok: false, reason }` on
 * a recognizable problem — never throws. Per-key content validity is
 * intentionally left to each store's own load()-time validator (see the
 * module doc comment above), not re-implemented here.
 */
export function applyBackup(parsed) {
  if (!parsed || typeof parsed !== 'object' || parsed.app !== APP_NAME) {
    return { ok: false, reason: "That file doesn't look like a Sudoku by Inspire backup." };
  }
  if (parsed.backupVersion !== BACKUP_VERSION) {
    return { ok: false, reason: 'This backup was made by an incompatible app version.' };
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    return { ok: false, reason: "That file doesn't look like a Sudoku by Inspire backup." };
  }

  const keysWritten = [];
  for (const key of STORAGE_KEYS) {
    if (!(key in parsed.data)) continue;
    try {
      localStorage.setItem(key, JSON.stringify(parsed.data[key]));
      keysWritten.push(key);
    } catch {
      // Storage denied or full -- move on; the caller surfaces overall
      // success/failure, not a per-key breakdown.
    }
  }
  return { ok: true, keysWritten };
}
