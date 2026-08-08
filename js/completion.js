/**
 * Pure helpers for the completion dialog: the score (via the
 * centralized formula in js/scoring.js), the achieved leaderboard rank
 * (if any), and the generated "share results" text. All take a
 * game-state snapshot (as returned by getState()) plus the matching
 * difficulty config and return plain values — no DOM, so they're
 * testable the same way as the engine/generator/game-state modules.
 */

import { calculateScore } from './scoring.js';

export function estimateScore(state, difficultyConfig) {
  return calculateScore(
    {
      difficultyId: state.difficulty,
      elapsedSeconds: state.elapsedSeconds,
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed,
    },
    difficultyConfig
  );
}

export function formatElapsedTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Finds this run's 1-based rank within `entries` (as returned by
 * js/high-scores-store.js's getHighScores for the same difficulty), or
 * `null` if it isn't on the list. By the time the completion dialog
 * calls this, js/game-persistence.js's own onStateChange listener has
 * already recorded this exact completion — it's registered first in
 * index.js, so it always runs before the completion dialog's listener
 * for the same 'complete' transition — so this is a lookup, not a
 * prediction. Matches on every stat rather than object identity, since
 * recordHighScore builds its own new entry object; an exact duplicate of
 * an earlier run's stats already on the list matches whichever one
 * sorted first, which is harmless — the reported rank is still correct
 * for *a* run with these exact stats.
 */
export function findRankInHighScores(entries, state, score) {
  const index = entries.findIndex(
    (entry) =>
      entry.score === score &&
      entry.elapsedSeconds === state.elapsedSeconds &&
      entry.mistakes === state.mistakes &&
      entry.hintsUsed === state.hintsUsed
  );
  return index === -1 ? null : index + 1;
}

/**
 * Builds the shareable results text shown (and copyable) in the
 * completion dialog. A pure string builder so it's independently
 * testable without a DOM or clipboard access. `rank` is optional — pass
 * the value from findRankInHighScores to mention it; omit it (or pass
 * `null`) for a run that didn't place, which leaves the text unchanged
 * from before this existed.
 */
export function buildShareText(state, difficultyConfig, rank = null) {
  const time = formatElapsedTime(state.elapsedSeconds);
  const score = estimateScore(state, difficultyConfig);
  const mistakeWord = state.mistakes === 1 ? 'mistake' : 'mistakes';
  const hintWord = state.hintsUsed === 1 ? 'hint' : 'hints';
  const rankLine = rank === null ? '' : ` — ranked #${rank} on the local leaderboard!`;
  return (
    `Sudoku by Inspire — ${difficultyConfig.label} solved in ${time}\n` +
    `${state.mistakes} ${mistakeWord}, ${state.hintsUsed} ${hintWord}, score ${score}${rankLine}`
  );
}
