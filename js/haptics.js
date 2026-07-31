/**
 * Centralized haptic (vibration) feedback — the one place in the app
 * that ever calls `navigator.vibrate()`. Every trigger below is a
 * named, semantic function (`hapticCorrectEntry()`,
 * `hapticPuzzleComplete()`, ...) rather than a raw pattern at the call
 * site, so every consumer (the board's progression detection in
 * js/ui/board-view.js, the win/error cues in js/audio.js) asks for
 * *what happened*, not *what buzz to play* — keeping the actual
 * durations/patterns tunable in exactly one place instead of scattered
 * `navigator.vibrate(...)` calls.
 *
 * Every call is gated identically, in this order:
 * 1. `navigator.vibrate` must exist — desktop browsers and iOS Safari
 *    don't have it at all.
 * 2. js/audio-settings.js's `vibrationEnabled` toggle (Settings dialog)
 *    must be on.
 * 3. `prefers-reduced-motion: reduce` must NOT be set. Vibration is a
 *    physical motion effect, so a player who's told their OS they want
 *    reduced motion gets that honored here too, the same spirit as the
 *    sitewide CSS override in styles.css's Motion section — without
 *    needing a second, separate in-app setting just for haptics.
 * Any one of these failing makes every exported function below a
 * silent no-op — never a thrown error, never something a caller needs
 * to check for itself first.
 *
 * The Vibration API has no concept of amplitude/intensity — a call is
 * only ever a sequence of on/off millisecond durations. "Progressively
 * stronger" tiers below are therefore built entirely from duration and
 * pattern shape (a longer single pulse, or a short multi-pulse
 * pattern), never volume — that's a hard platform constraint, not a
 * design choice. Every tier stays well inside "light impact, brief" —
 * the longest single pulse is under 30ms, and the longest pattern
 * (puzzle complete) totals 100ms across three short pulses — so none of
 * this ever reads as a long or continuous buzz.
 *
 * Coalescing: a single moment in the game can legitimately cross more
 * than one threshold at once (the last cell placed can finish its
 * digit, its row, its box, *and* the whole puzzle in the same instant).
 * navigator.vibrate() doesn't queue — calling it again cancels whatever
 * pattern is still playing — so firing several tiers back-to-back would
 * just mean whichever happened to run *last* wins, an outcome that
 * depends on unrelated call order rather than which event actually
 * matters most. Instead, every request is queued and only the
 * strongest one requested during the current synchronous pass of work
 * (game-state.js's `notify()` calls every subscriber synchronously, one
 * after another) is actually fired, via a microtask flush *after* that
 * whole pass finishes. This makes "the strongest applicable feedback
 * wins" a real guarantee, not an accident of which module happened to
 * subscribe first.
 */

import { getAudioSettings } from './audio-settings.js';

// Ascending "light impact" hierarchy — Correct Number < Completed
// Number < Completed Row/Column < Completed Box < Puzzle Complete.
// `wrongEntry` sits outside that ladder (it's a distinct, pre-existing
// cue, not a rung of "progress") but is ranked here too so it still
// takes part in the same coalescing rule as everything else.
const TIERS = {
  correctEntry: { rank: 1, pattern: 10 },
  wrongEntry: { rank: 1, pattern: 40 },
  digitComplete: { rank: 2, pattern: 15 },
  unitComplete: { rank: 3, pattern: 20 }, // a row or a column — the hierarchy treats them as one rung
  boxComplete: { rank: 4, pattern: 28 },
  puzzleComplete: { rank: 5, pattern: [30, 40, 30] },
};

export function isHapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function fire(pattern) {
  if (!getAudioSettings().vibrationEnabled) return;
  if (prefersReducedMotion()) return;
  if (!isHapticsSupported()) return;
  navigator.vibrate(pattern);
}

let pendingTier = null;
let flushScheduled = false;

function requestHaptic(name) {
  const tier = TIERS[name];
  if (!pendingTier || tier.rank > pendingTier.rank) pendingTier = tier;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    const tierToFire = pendingTier;
    pendingTier = null;
    flushScheduled = false;
    fire(tierToFire.pattern);
  });
}

/** A correct digit was just placed in a cell — the lightest tier. */
export function hapticCorrectEntry() {
  requestHaptic('correctEntry');
}

/** A digit entered doesn't match the solution. */
export function hapticWrongEntry() {
  requestHaptic('wrongEntry');
}

/** All 9 correct instances of a number are now placed. */
export function hapticDigitComplete() {
  requestHaptic('digitComplete');
}

/** A row or a column is now fully correct. */
export function hapticUnitComplete() {
  requestHaptic('unitComplete');
}

/** A 3x3 box is now fully correct. */
export function hapticBoxComplete() {
  requestHaptic('boxComplete');
}

/** The whole puzzle is solved — the strongest tier. */
export function hapticPuzzleComplete() {
  requestHaptic('puzzleComplete');
}
