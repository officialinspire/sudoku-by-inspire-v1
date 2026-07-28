/**
 * Pure helpers for the completion dialog: a provisional score estimate
 * and the generated "share results" text. Both take a game-state
 * snapshot (as returned by getState()) plus the matching difficulty
 * config and return plain values — no DOM, so they're testable the same
 * way as the engine/generator/game-state modules.
 */

const SCORE_BASE = 1000;
const MISTAKE_PENALTY = 20;
const HINT_PENALTY = 50;

/**
 * v1 placeholder formula, not the final scoring system — Phase 7
 * (Statistics, Best Times, High Scores) owns that. Higher difficulty
 * scores a higher base; mistakes and hints each cost a fixed amount;
 * never negative. Kept here (not in game-state.js) because it's a
 * *derived* display value, never stored as part of the actual game
 * state.
 */
export function estimateScore(state, difficultyConfig) {
  const base = SCORE_BASE * difficultyConfig.scoreMultiplier;
  const penalty = state.mistakes * MISTAKE_PENALTY + state.hintsUsed * HINT_PENALTY;
  return Math.max(0, Math.round(base - penalty));
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
