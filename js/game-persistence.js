/**
 * The one place that reacts to game-state changes by writing to
 * storage. game-state.js itself stays persistence-agnostic (it only
 * calls `notify()`); this module subscribes via the same
 * `onStateChange` hook the UI uses, and is the sole caller of
 * js/active-game-store.js's save/clear, js/statistics-store.js's
 * recordGameCompleted, js/high-scores-store.js's recordHighScore, and
 * js/scoring.js's calculateScore for "a game just finished."
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

function handleCompletion(state) {
  recordGameCompleted(state.difficulty, {
    elapsedSeconds: state.elapsedSeconds,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  });

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
  recordHighScore(state.difficulty, {
    score,
    elapsedSeconds: state.elapsedSeconds,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  });

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
