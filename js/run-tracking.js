/**
 * Per-run identity and honest per-run counters — the raw material for
 * achievement progress (js/achievement-progress.js). Pure: no DOM, no
 * storage.
 *
 * Why separate counters at all: game-state's displayed `mistakes` and
 * `hintsUsed` are restored by undo (undoing a wrong entry or a hint
 * takes it back off the count and the score — deliberate, existing
 * behavior this module leaves alone). So they can't prove anything: a
 * run with three undone mistakes displays 0. `runCounters` only ever go
 * up — undo itself is one of the things they count.
 */

export const RUN_COUNTER_KEYS = ['mistakes', 'hints', 'undos', 'notes'];

// Playstyle thresholds (js/achievement-catalog.js quotes them in its
// requirement text, so the two can't drift apart).
export const HEAVY_NOTES_MIN_TOGGLES = 25;
export const COMEBACK_MIN_MISTAKES = 3;

const RUN_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * A new random run ID. `crypto.randomUUID` only exists in secure
 * contexts (https, localhost); `getRandomValues` also works over plain
 * http — e.g. the app served to a phone from a laptop on the same Wi-Fi.
 * Math.random is the last resort for very old browsers.
 */
export function createRunId(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === 'function') return cryptoSource.randomUUID();
  if (typeof cryptoSource?.getRandomValues === 'function') {
    const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isValidRunId(value) {
  return typeof value === 'string' && RUN_ID_PATTERN.test(value);
}

export function emptyRunCounters() {
  return { mistakes: 0, hints: 0, undos: 0, notes: 0 };
}

export function isValidRunCounters(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    RUN_COUNTER_KEYS.every((key) => Number.isInteger(value[key]) && value[key] >= 0)
  );
}

export function incrementRunCounter(counters, key) {
  return { ...counters, [key]: counters[key] + 1 };
}

// FNV-1a: a tiny, stable string hash — enough to turn a puzzle into a
// short, deterministic ID. Not security-relevant.
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Run tracking for a save from before it existed (active-game schema
 * v1): no ID, and only the undo-erasable displayed counts. Upgraded
 * conservatively:
 *  - the ID is derived from the puzzle itself, so every load of the same
 *    old save agrees on it (and its completion can be deduplicated)
 *    without having to write the save back;
 *  - the displayed counts become a floor for the real ones (undo may
 *    have erased more — it can never have added any);
 *  - `runCountersComplete: false` rules the run out of perfect/no-hint
 *    credit for good: its true history is unknown, and inventing a
 *    perfect run from it would be exactly the wrong guess.
 */
export function legacyRunTracking({ puzzle, difficulty, mistakes, hintsUsed }) {
  return {
    runId: `legacy-${hashText(`${difficulty}:${puzzle.join('')}`)}`,
    runCounters: { mistakes, hints: hintsUsed, undos: 0, notes: 0 },
    runCountersComplete: false,
  };
}

/** A save's own run tracking if it has valid tracking, else the legacy upgrade. */
export function normalizeRunTracking(saved) {
  if (isValidRunId(saved.runId) && isValidRunCounters(saved.runCounters) && typeof saved.runCountersComplete === 'boolean') {
    return { runId: saved.runId, runCounters: { ...saved.runCounters }, runCountersComplete: saved.runCountersComplete };
  }
  return legacyRunTracking(saved);
}

/**
 * What a finished run proves, for achievements.
 *
 * Claims that something *never* happened — perfect (no wrong digit and
 * no hint, ever, undone or not), no-hint, no notes, no undo — need
 * complete counters: a migrated run's counters are only a floor, so it
 * qualifies for none of them.
 *
 * Claims that something happened *at least* N times — heavy note use,
 * a comeback after several mistakes — are fine on a floor: if the floor
 * reaches N, the real count did too.
 */
export function classifyCompletedRun({ runCounters, runCountersComplete }) {
  const valid = isValidRunCounters(runCounters);
  const complete = valid && runCountersComplete === true;
  return {
    perfect: complete && runCounters.mistakes === 0 && runCounters.hints === 0,
    noHint: complete && runCounters.hints === 0,
    noNotes: complete && runCounters.notes === 0,
    noUndo: complete && runCounters.undos === 0,
    heavyNotes: valid && runCounters.notes >= HEAVY_NOTES_MIN_TOGGLES,
    comeback: valid && runCounters.mistakes >= COMEBACK_MIN_MISTAKES,
  };
}
