/**
 * Turns stored progress (js/achievement-progress.js) into the named
 * numbers an achievement can target, and checks achievement definitions
 * against them. Pure; the catalog of definitions and its UI come later.
 *
 * A definition is `{ id, metric, target }` — e.g. `{ id: 'ten-wins',
 * metric: 'wins', target: 10 }`. Definitions should target the
 * never-decreasing metrics (totals and *best* streaks): those make
 * "unlocked" a pure function of progress, so nothing extra has to be
 * stored to remember an unlock. The `current*` streak metrics can fall
 * back to zero and are for display.
 */

import { DIFFICULTY_IDS } from './sudoku-generator.js';
import { daysBetween } from './achievement-progress.js';

/**
 * The daily streak as of `todayKey`. Stored progress only changes on a
 * win, so a streak whose last win was two or more days ago is already
 * broken even though the stored number hasn't been reset yet.
 */
export function currentDailyStreak(progress, todayKey) {
  if (progress.lastWinDate === null) return 0;
  return daysBetween(progress.lastWinDate, todayKey) <= 1 ? progress.dailyStreak.current : 0;
}

const METRICS = {
  wins: (p) => p.wins,
  ...Object.fromEntries(DIFFICULTY_IDS.map((id) => [`wins:${id}`, (p) => p.winsByDifficulty[id]])),
  earnedScore: (p) => p.earnedScore,
  completedSeconds: (p) => p.completedSeconds,
  perfectWins: (p) => p.perfectWins,
  noHintWins: (p) => p.noHintWins,
  bestWinStreak: (p) => p.winStreak.best,
  currentWinStreak: (p) => p.winStreak.current,
  winningDays: (p) => p.winningDays,
  bestDailyStreak: (p) => p.dailyStreak.best,
  currentDailyStreak: (p, todayKey) => currentDailyStreak(p, todayKey),
};

export const METRIC_NAMES = Object.freeze(Object.keys(METRICS));

/** Every metric's value for `progress` as of `todayKey`. */
export function getProgressMetrics(progress, todayKey) {
  return Object.fromEntries(METRIC_NAMES.map((name) => [name, METRICS[name](progress, todayKey)]));
}

/**
 * `[{ id, metric, target, current, unlocked, fraction }]`, one per
 * definition, in order. A definition naming an unknown metric or a
 * non-positive target throws: the catalog is static code, so that's an
 * authoring mistake its tests should catch, not something to skip
 * quietly at runtime.
 */
export function evaluateAchievements(definitions, metrics) {
  return definitions.map(({ id, metric, target }) => {
    if (!METRIC_NAMES.includes(metric)) throw new TypeError(`Achievement "${id}": unknown metric "${metric}"`);
    if (!Number.isInteger(target) || target < 1) throw new TypeError(`Achievement "${id}": target must be a positive integer`);
    const current = metrics[metric];
    return { id, metric, target, current, unlocked: current >= target, fraction: Math.min(1, current / target) };
  });
}
