/**
 * Lifetime progress toward achievements: pure functions over one plain
 * object (js/achievement-store.js persists it; the achievement catalog
 * and its UI build on it later). Every update returns a new object.
 *
 * Tracked: lifetime and per-difficulty wins, total earned score (from
 * js/scoring.js, as recorded), total completed-run time, perfect and
 * no-hint wins, consecutive wins, distinct winning days, and daily
 * streaks.
 *
 * Days are local calendar dates ('YYYY-MM-DD' on the player's own
 * calendar, not UTC): several wins on one day count that day once, a
 * win the next day extends the daily streak, and a missed day breaks it.
 * Abandoning a game breaks the consecutive-win streak but not the daily
 * streak (an abandoned game isn't a missed day).
 */

import { DIFFICULTY_IDS } from './sudoku-generator.js';
import { isValidRunId } from './run-tracking.js';

export const PROGRESS_VERSION = 1;

// Completed run IDs kept to recognize a run that's already been counted,
// newest last. A repeat can only come from a stale copy of a run (a
// restored backup, a save from another tab) — in practice a recent one —
// so a bounded list keeps storage and backups small at the cost of not
// recognizing a copy of a run from more than this many wins ago.
export const MAX_RECENT_RUN_IDS = 50;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' for `date` on the device's local calendar. */
export function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Whole calendar days from `fromKey` to `toKey` (negative if earlier).
 * Worked out on the date parts through Date.UTC, so a 23- or 25-hour
 * daylight-saving day can't turn into 0 or 2 days.
 */
export function daysBetween(fromKey, toKey) {
  const dayNumber = (key) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  return dayNumber(toKey) - dayNumber(fromKey);
}

function isDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

const isCount = (value) => Number.isInteger(value) && value >= 0;

export function emptyProgress(todayKey) {
  return {
    version: PROGRESS_VERSION,
    trackingSince: todayKey,
    wins: 0,
    winsByDifficulty: Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, 0])),
    earnedScore: 0,
    completedSeconds: 0,
    perfectWins: 0,
    noHintWins: 0,
    winStreak: { current: 0, best: 0 },
    winningDays: 0,
    lastWinDate: null,
    dailyStreak: { current: 0, best: 0 },
    recentRunIds: [],
  };
}

/**
 * The starting point for a player who already has history: only what
 * js/statistics-store.js records *exactly* — completed games per
 * difficulty and their total time. Everything else starts at zero and is
 * tracked from `trackingSince` on, because the stored history can't
 * support it: high scores keep only a top 10, and their mistake/hint
 * counts are undo-erasable (see js/run-tracking.js), so no past run can
 * be proven perfect or hint-free.
 */
export function progressFromStatistics(statisticsByDifficulty, todayKey) {
  const progress = emptyProgress(todayKey);
  for (const id of DIFFICULTY_IDS) {
    const stats = statisticsByDifficulty?.[id];
    if (!stats || !isCount(stats.gamesCompleted) || !isCount(stats.totalPlayTimeSeconds)) continue;
    progress.winsByDifficulty[id] = stats.gamesCompleted;
    progress.wins += stats.gamesCompleted;
    progress.completedSeconds += stats.totalPlayTimeSeconds;
  }
  return progress;
}

function assertValidRun(run) {
  const valid =
    run &&
    isValidRunId(run.runId) &&
    DIFFICULTY_IDS.includes(run.difficulty) &&
    isCount(run.score) &&
    isCount(run.elapsedSeconds) &&
    typeof run.perfect === 'boolean' &&
    typeof run.noHint === 'boolean' &&
    (!run.perfect || run.noHint);
  if (!valid) throw new TypeError('Invalid completed run');
}

function withWinOn(progress, todayKey) {
  const last = progress.lastWinDate;
  const gap = last === null ? null : daysBetween(last, todayKey);
  // Same day: already counted. Earlier than the last win: the device
  // clock moved back, and there's no way to tell whether that day was
  // already counted — so count nothing rather than guess.
  if (gap !== null && gap <= 0) return progress;
  const current = gap === 1 ? progress.dailyStreak.current + 1 : 1;
  return {
    ...progress,
    winningDays: progress.winningDays + 1,
    lastWinDate: todayKey,
    dailyStreak: { current, best: Math.max(progress.dailyStreak.best, current) },
  };
}

/**
 * Adds one completed run. Returns `{ progress, duplicate }`; a run whose
 * ID was already counted leaves progress untouched (`duplicate: true`).
 * Throws on a malformed run (a programming error, not player data).
 */
export function applyCompletedRun(progress, run, todayKey) {
  assertValidRun(run);
  if (progress.recentRunIds.includes(run.runId)) return { progress, duplicate: true };

  const winStreak = progress.winStreak.current + 1;
  const next = {
    ...progress,
    wins: progress.wins + 1,
    winsByDifficulty: { ...progress.winsByDifficulty, [run.difficulty]: progress.winsByDifficulty[run.difficulty] + 1 },
    earnedScore: progress.earnedScore + run.score,
    completedSeconds: progress.completedSeconds + run.elapsedSeconds,
    perfectWins: progress.perfectWins + (run.perfect ? 1 : 0),
    noHintWins: progress.noHintWins + (run.noHint ? 1 : 0),
    winStreak: { current: winStreak, best: Math.max(progress.winStreak.best, winStreak) },
    recentRunIds: [...progress.recentRunIds, run.runId].slice(-MAX_RECENT_RUN_IDS),
  };
  return { progress: withWinOn(next, todayKey), duplicate: false };
}

/** An unfinished game was given up: ends the consecutive-win streak only. */
export function applyAbandonedRun(progress) {
  return { ...progress, winStreak: { current: 0, best: progress.winStreak.best } };
}

function isValidStreak(value) {
  return !!value && isCount(value.current) && isCount(value.best) && value.best >= value.current;
}

/**
 * Strict shape check for stored progress, including the invariants every
 * update preserves — per-difficulty wins add up to the total, perfect
 * wins are also no-hint wins, a recorded day exists once anything was —
 * so corruption or hand-editing is caught rather than built upon.
 */
export function isValidProgress(value) {
  if (!value || value.version !== PROGRESS_VERSION || !isDateKey(value.trackingSince)) return false;
  const counts = ['wins', 'earnedScore', 'completedSeconds', 'perfectWins', 'noHintWins', 'winningDays'];
  if (!counts.every((key) => isCount(value[key]))) return false;
  const byDifficulty = value.winsByDifficulty;
  if (!byDifficulty || !DIFFICULTY_IDS.every((id) => isCount(byDifficulty[id]))) return false;
  if (DIFFICULTY_IDS.reduce((sum, id) => sum + byDifficulty[id], 0) !== value.wins) return false;
  if (value.perfectWins > value.noHintWins || value.noHintWins > value.wins) return false;
  if (!isValidStreak(value.winStreak) || !isValidStreak(value.dailyStreak)) return false;
  if (value.lastWinDate === null ? value.winningDays !== 0 : !isDateKey(value.lastWinDate)) return false;
  return (
    Array.isArray(value.recentRunIds) &&
    value.recentRunIds.length <= MAX_RECENT_RUN_IDS &&
    value.recentRunIds.every(isValidRunId)
  );
}
