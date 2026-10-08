/** Analytics listens to existing state/unlock notifications; never mutates game state. */
import { getState, onStateChange } from './game-state.js';
import { onAchievementsUnlocked } from './achievement-store.js';
import { getHighScores } from './high-scores-store.js';
import { initAnalytics, setAnalyticsContext, trackGameEvent } from './analytics.js';

let initialized = false;
let runId = null;
let continued = false;
let entries = null;

export function initGameAnalytics() {
  try {
    if (initialized) return;
    initialized = true;
    setAnalyticsContext(() => {
      const state = getState();
      return { difficulty: state.difficulty, mode: 'sudoku', game_state: state.status };
    });
    initAnalytics();
    onStateChange((state) => {
      try {
        if (!state.runId) return;
        if (state.runId !== runId) {
          runId = state.runId;
          continued = state.status === 'paused';
          entries = null;
        }
        if (state.status === 'playing') {
          trackGameEvent('game_started', { continued: continued ? 'yes' : 'no' }, runId);
        }
        if (state.status !== 'playing' && state.status !== 'complete') return;
        // Entries retain identity on selection, notes, and timer notifications.
        if (state.entries === entries || !state.puzzle) return;
        entries = state.entries;
        const emptyCells = state.puzzle.filter((digit) => digit === 0).length;
        if (!emptyCells) return;
        const correct = state.entries.filter((digit, index) => state.puzzle[index] === 0 && digit !== 0 && digit === state.solution[index]).length;
        for (const milestone of [25, 50, 75]) {
          if (correct / emptyCells * 100 >= milestone) {
            trackGameEvent('game_progress', { progress_percent: milestone }, `${runId}:${milestone}`);
          }
        }
      } catch { /* optional analytics */ }
    });
    onAchievementsUnlocked((ids, detail) => {
      try {
        for (const achievement of ids) trackGameEvent('achievement_unlocked', { achievement }, `${detail.runId}:${achievement}`);
      } catch { /* optional analytics */ }
    });
  } catch { /* optional analytics */ }
}

/** Called only for a completion the game's own run-deduplication accepts. */
export function capturePuzzleCompletion(state, score, previousHighScore) {
  try {
    if (!initialized) return;
    const high_score = getHighScores(state.difficulty)[0]?.score ?? score;
    const result = { difficulty: state.difficulty, score, high_score, duration_seconds: state.elapsedSeconds };
    trackGameEvent('game_completed', result, state.runId);
    if (score > previousHighScore) trackGameEvent('high_score_achieved', result, state.runId);
  } catch { /* optional analytics */ }
}

export function readAnalyticsHighScore(difficulty) {
  try { return getHighScores(difficulty)[0]?.score ?? 0; } catch { return 0; }
}
