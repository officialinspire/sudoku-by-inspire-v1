/**
 * Pure helpers for the completion dialog: the score (via the
 * centralized formula in js/scoring.js) and the generated "share
 * results" text. Both take a game-state snapshot (as returned by
 * getState()) plus the matching difficulty config and return plain
 * values — no DOM, so they're testable the same way as the engine/
 * generator/game-state modules.
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
 * Builds the shareable results text shown (and copyable) in the
 * completion dialog. A pure string builder so it's independently
 * testable without a DOM or clipboard access.
 */
export function buildShareText(state, difficultyConfig) {
  const time = formatElapsedTime(state.elapsedSeconds);
  const score = estimateScore(state, difficultyConfig);
  const mistakeWord = state.mistakes === 1 ? 'mistake' : 'mistakes';
  const hintWord = state.hintsUsed === 1 ? 'hint' : 'hints';
  return (
    `Sudoku by Inspire — ${difficultyConfig.label} solved in ${time}\n` +
    `${state.mistakes} ${mistakeWord}, ${state.hintsUsed} ${hintWord}, score ${score}`
  );
}
