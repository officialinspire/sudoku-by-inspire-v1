import { capturePuzzleCompletion, readAnalyticsHighScore } from './game-analytics.js';
/**
 * The one place that reacts to game-state changes by writing to
 * storage. game-state.js itself stays persistence-agnostic (it only
 * calls `notify()`); this module subscribes via the same
 * `onStateChange` hook the UI uses, and is the sole caller of
 * js/active-game-store.js's save/clear, js/statistics-store.js's
 * recordGameCompleted, js/high-scores-store.js's recordHighScore,
 * js/achievement-store.js's recordCompletedRun, and js/scoring.js's
 * calculateScore for "a game just finished."
 *
 * Each run is counted exactly once, by its run ID: a run that was
 * already recorded (say, a stale copy of it restored from a backup and
 * finished again) updates nothing — not achievements, statistics, or
 * high scores.
 *
 * `recordGameStarted`/`recordGameAbandoned` are deliberately NOT called
 * from here — they're called directly by the UI code that knows the
 * true, unambiguous moment a new game begins or an unfinished one gets
 * explicitly replaced (see js/ui/game-screen.js and
 * js/ui/new-game-confirm-dialog.js). Inferring "this is a new game" from
 * state alone would have to distinguish it from a Continue-Game restore
 * or a plain pause/resume — needlessly indirect when the real call
 * sites already know exactly what's happening.
 */

import { onStateChange } from './game-state.js';
import { saveActiveGame, clearActiveGame } from './active-game-store.js';
import { recordGameCompleted } from './statistics-store.js';
import { recordHighScore } from './high-scores-store.js';
import { calculateScore } from './scoring.js';
import { DIFFICULTIES } from './sudoku-generator.js';
import { recordCompletedRun } from './achievement-store.js';
import { classifyCompletedRun } from './run-tracking.js';

const AUTOSAVE_DEBOUNCE_MS = 500;

let previousStatus = null;
let debounceHandle = null;
let latestState = null;

function flushAutosave() {
  if (debounceHandle === null) return;
  clearTimeout(debounceHandle);
  debounceHandle = null;
  if (latestState) saveActiveGame(latestState);
}

function scheduleAutosave(state) {
  latestState = state;
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    saveActiveGame(state);
  }, AUTOSAVE_DEBOUNCE_MS);
}

function recordCompletion(state, score) {
  recordGameCompleted(state.difficulty, {
    elapsedSeconds: state.elapsedSeconds,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  });
  recordHighScore(state.difficulty, {
    score,
    elapsedSeconds: state.elapsedSeconds,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  });
}

function handleCompletion(state) {
  const config = DIFFICULTIES[state.difficulty];
  const score = calculateScore(
    {
      difficultyId: state.difficulty,
      elapsedSeconds: state.elapsedSeconds,
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed,
    },
    config
  );

  // Achievement progress goes first, for two reasons: it's the record of
  // which runs were already counted (a duplicate skips everything else
  // too), and a first-ever progress record is seeded from statistics,
  // which mustn't already include this win.
  const previousHighScore = readAnalyticsHighScore(state.difficulty);
  const { duplicate } = recordCompletedRun({
    runId: state.runId,
    difficulty: state.difficulty,
    score,
    elapsedSeconds: state.elapsedSeconds,
    ...classifyCompletedRun(state),
  });
  if (!duplicate) {
    recordCompletion(state, score);
    capturePuzzleCompletion(state, score, previousHighScore);
  }

  // A completed game has nothing left to "continue" — drop the save
  // (and any pending debounced write that could otherwise resurrect it).
  clearTimeout(debounceHandle);
  debounceHandle = null;
  clearActiveGame();
}

export function initGamePersistence() {
  onStateChange((state) => {
    if (state.status === 'complete' && previousStatus !== 'complete') {
      handleCompletion(state);
    } else if (state.status === 'playing' || state.status === 'paused') {
      scheduleAutosave(state);
    }
    previousStatus = state.status;
  });

  // Best-effort: flush a pending debounced save before the tab actually
  // goes away, so a change made in the last <500ms before close isn't
  // silently lost. 'pagehide' fires reliably on both tab close and
  // navigation, unlike 'beforeunload' (blocked by some browsers/
  // extensions) or relying on 'visibilitychange' alone.
  window.addEventListener('pagehide', flushAutosave);
}
