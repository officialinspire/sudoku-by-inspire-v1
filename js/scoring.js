/**
 * The single, centralized scoring formula — every score shown anywhere
 * in the app (the completion dialog, high scores) is computed by
 * `calculateScore` here. Nothing else in the codebase is allowed to
 * invent its own point values.
 *
 * score = round(
 *   BASE_SCORE * difficultyConfig.scoreMultiplier      (difficulty reward)
 *   + speedBonus                                        (speed reward)
 *   - mistakes * MISTAKE_PENALTY
 *   - hintsUsed * HINT_PENALTY
 * ), floored at 0 — a score can never be negative, so a rough or
 * hint-heavy solve is never worse than "no reward," just a smaller one.
 *
 * The speed bonus rewards finishing under a per-difficulty "par" time:
 * every second under par is worth SPEED_BONUS_PER_SECOND points, capped
 * implicitly at `par * SPEED_BONUS_PER_SECOND` (finishing instantly).
 * Going over par earns no bonus and, importantly, no penalty either —
 * this app has no reason to punish a slower, careful solve beyond
 * simply not rewarding it as generously as a fast one.
 */

export const BASE_SCORE = 1000;
export const MISTAKE_PENALTY = 25;
export const HINT_PENALTY = 50;
export const SPEED_BONUS_PER_SECOND = 2;

// "Par" time per difficulty, in seconds — a reasonable target used only
// to compute the speed bonus, not a limit or requirement. Centralized
// here (not derived from DIFFICULTIES' clue counts) so it can be tuned
// independently of puzzle generation.
export const PAR_SECONDS = {
  easy: 300,
  intermediate: 600,
  advanced: 900,
  insane: 1500,
};

/**
 * @param {{ difficultyId: string, elapsedSeconds: number, mistakes: number, hintsUsed: number }} result
 * @param {{ scoreMultiplier: number }} difficultyConfig - from sudoku-generator.js's DIFFICULTIES
 */
export function calculateScore(result, difficultyConfig) {
  const base = BASE_SCORE * difficultyConfig.scoreMultiplier;
  const par = PAR_SECONDS[result.difficultyId] ?? PAR_SECONDS.easy;
  const speedBonus = Math.max(0, par - result.elapsedSeconds) * SPEED_BONUS_PER_SECOND;
  const penalty = result.mistakes * MISTAKE_PENALTY + result.hintsUsed * HINT_PENALTY;
  return Math.max(0, Math.round(base + speedBonus - penalty));
}
