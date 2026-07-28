/**
 * Generic, safe localStorage helpers. Every persisted feature in this
 * app (appearance, gameplay settings, the active game, statistics, high
 * scores) goes through these two functions rather than calling
 * `localStorage` directly — one place that handles storage being
 * denied (private browsing, disabled by the user, an iframe sandbox),
 * quota exceeded, malformed JSON left over from a previous version, and
 * environments with no `localStorage` at all (this module is imported
 * by browser-only UI code, but keeping the guard here means a caller
 * never has to think about it).
 */

/**
 * Reads and parses `key`, returning `fallback` if storage is
 * unavailable, the key is missing, the JSON is malformed, or
 * `validator` (if given) rejects the parsed value. `validator` is the
 * caller's chance to check schema/version/shape before trusting data
 * that could be stale (an old app version's format), hand-edited, or
 * corrupted — this function only guarantees "valid JSON came back,"
 * not "the JSON means what you expect."
 */
export function loadJSON(key, fallback, validator) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null || raw === undefined) return fallback;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (validator && !validator(parsed)) return fallback;
  return parsed;
}

/**
 * Serializes and writes `value` to `key`. Returns `true` on success,
 * `false` if storage is denied, full (quota exceeded), or `value`
 * can't be serialized (e.g. contains a circular reference) — the
 * caller decides whether a failed save needs to surface to the user;
 * most callers in this app treat it as "still works this session, just
 * won't be remembered."
 */
export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Removes `key`. Returns `true` on success, `false` if storage is unavailable. */
export function removeJSON(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
