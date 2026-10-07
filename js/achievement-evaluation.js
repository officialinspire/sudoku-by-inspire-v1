/**
 * Turns stored progress (js/achievement-progress.js) into the named
 * numbers an achievement can target, and checks achievement definitions
 * (js/achievement-catalog.js) against them. Pure.
 *
 * A definition is `{ id, metric, target, comparison }`. `comparison` is
 * 'atLeast' (the default: counts, scores, best streaks) or 'atMost'
 * (fastest times — lower is better). Definitions target metrics that
 * never get worse (totals, bests): that makes "met" a pure function of
 * progress. The `current*` streak metrics can fall back to zero and are
 * for display only.
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

const perDifficultyMetrics = (prefix, read) =>
  Object.fromEntries(DIFFICULTY_IDS.map((id) => [`${prefix}:${id}`, (p) => read(p, id)]));

const METRICS = {
  wins: (p) => p.wins,
  ...perDifficultyMetrics('wins', (p, id) => p.winsByDifficulty[id]),
  // Seconds of the fastest win, or null before the first one.
  ...perDifficultyMetrics('bestTime', (p, id) => p.bestSecondsByDifficulty[id]),
  // Best single-game score, 0 before the first win.
  ...perDifficultyMetrics('bestScore', (p, id) => p.bestScoreByDifficulty[id] ?? 0),
  difficultiesWon: (p) => DIFFICULTY_IDS.filter((id) => p.winsByDifficulty[id] > 0).length,
  earnedScore: (p) => p.earnedScore,
  completedSeconds: (p) => p.completedSeconds,
  perfectWins: (p) => p.perfectWins,
  noHintWins: (p) => p.noHintWins,
  heavyNotesWins: (p) => p.playstyle.heavyNotesWins,
  noNotesHardWins: (p) => p.playstyle.noNotesHardWins,
  noUndoHardWins: (p) => p.playstyle.noUndoHardWins,
  comebackWins: (p) => p.playstyle.comebackWins,
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

function assertValidDefinition({ id, metric, target, comparison = 'atLeast' }) {
  if (!METRIC_NAMES.includes(metric)) throw new TypeError(`Achievement "${id}": unknown metric "${metric}"`);
  if (!Number.isInteger(target) || target < 1) throw new TypeError(`Achievement "${id}": target must be a positive integer`);
  if (comparison !== 'atLeast' && comparison !== 'atMost') throw new TypeError(`Achievement "${id}": unknown comparison "${comparison}"`);
}

function isMet(current, target, comparison) {
  if (current === null) return false; // e.g. no fastest time yet
  return comparison === 'atMost' ? current <= target : current >= target;
}

// How close, 0..1: for times, target ÷ best time (a 5:00 best against a
// 2:30 target is halfway).
function fractionOf(current, target, comparison) {
  if (current === null) return 0;
  if (comparison === 'atMost') return current <= target ? 1 : target / current;
  return Math.min(1, current / target);
}

/**
 * `[{ id, metric, target, comparison, current, met, fraction }]`, one per
 * definition, in order. A definition naming an unknown metric or
 * comparison, or a non-positive target, throws: the catalog is static
 * code, so that's an authoring mistake its tests catch.
 */
export function evaluateAchievements(definitions, metrics) {
  return definitions.map((definition) => {
    assertValidDefinition(definition);
    const { id, metric, target, comparison = 'atLeast' } = definition;
    const current = metrics[metric];
    return { id, metric, target, comparison, current, met: isMet(current, target, comparison), fraction: fractionOf(current, target, comparison) };
  });
}

/** IDs of definitions now met that aren't in `unlocked` yet. */
export function findNewlyMet(definitions, metrics, unlocked) {
  return evaluateAchievements(definitions, metrics)
    .filter((result) => result.met && !Object.hasOwn(unlocked, result.id))
    .map((result) => result.id);
}
