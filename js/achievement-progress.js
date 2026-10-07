/**
 * Lifetime progress toward achievements: pure functions over one plain
 * object (js/achievement-store.js persists it and evaluates the catalog
 * in js/achievement-catalog.js against it; the UI comes later). Every
 * update returns a new object.
 *
 * Tracked: lifetime and per-difficulty wins, total earned score (from
 * js/scoring.js, as recorded), total completed-run time, perfect and
 * no-hint wins, the fastest win and best score per difficulty, playstyle
 * wins, consecutive wins, distinct winning days, daily streaks — and
 * which achievements (js/achievement-catalog.js) are unlocked, and when.
 *
 * Days are local calendar dates ('YYYY-MM-DD' on the player's own
 * calendar, not UTC): several wins on one day count that day once, a
 * win the next day extends the daily streak, and a missed day breaks it.
 * Abandoning a game breaks the consecutive-win streak but not the daily
 * streak (an abandoned game isn't a missed day).
 */

import { DIFFICULTY_IDS } from './sudoku-generator.js';
import { isValidRunId } from './run-tracking.js';

// Schema 2 (Hardening Phase 5) adds per-difficulty bests, playstyle win
// counts and unlocked achievements; schema-1 progress (Phase 4) is
// upgraded on load — see upgradeProgress.
export const PROGRESS_VERSION = 2;
const PROGRESS_VERSION_1 = 1;

// The "hard game" playstyle achievements count wins at these levels.
export const HARD_DIFFICULTIES = ['advanced', 'insane'];
const PLAYSTYLE_KEYS = ['heavyNotesWins', 'noNotesHardWins', 'noUndoHardWins', 'comebackWins'];
const ACHIEVEMENT_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_UNLOCKED = 500;

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

const perDifficulty = (value) => Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, value]));
const sumOf = (byDifficulty) => DIFFICULTY_IDS.reduce((total, id) => total + byDifficulty[id], 0);

export function emptyProgress(todayKey) {
  return {
    version: PROGRESS_VERSION,
    trackingSince: todayKey,
    wins: 0,
    winsByDifficulty: perDifficulty(0),
    earnedScore: 0,
    completedSeconds: 0,
    perfectWins: 0,
    noHintWins: 0,
    // Fastest win and best single-game score per difficulty (null = none).
    bestSecondsByDifficulty: perDifficulty(null),
    bestScoreByDifficulty: perDifficulty(null),
    playstyle: Object.fromEntries(PLAYSTYLE_KEYS.map((key) => [key, 0])),
    winStreak: { current: 0, best: 0 },
    winningDays: 0,
    lastWinDate: null,
    dailyStreak: { current: 0, best: 0 },
    recentRunIds: [],
    // Achievement ID → { at: epoch ms, backfilled }. Written once, never
    // re-dated, never removed (only Clear Data wipes everything).
    unlocked: {},
  };
}

/**
 * What existing history *proves*, each value backed by a real recorded
 * win:
 *  - js/statistics-store.js: completed games per difficulty, their total
 *    time, and the fastest one;
 *  - js/high-scores-store.js: the best score per difficulty.
 * Deliberately not used: high scores' mistake/hint counts (undo-erasable,
 * so no past run can be proven perfect or hint-free), per-difficulty
 * streaks (an abandoned game in *another* difficulty would have broken
 * the overall streak), and win dates (only a top 10 keeps one). Those
 * start from zero and are tracked from now on.
 */
function provenHistory({ statistics, highScores } = {}) {
  const facts = {
    winsByDifficulty: perDifficulty(0),
    completedSeconds: 0,
    bestSecondsByDifficulty: perDifficulty(null),
    bestScoreByDifficulty: perDifficulty(null),
  };
  for (const id of DIFFICULTY_IDS) {
    const stats = statistics?.[id];
    if (stats && isCount(stats.gamesCompleted) && isCount(stats.totalPlayTimeSeconds)) {
      facts.winsByDifficulty[id] = stats.gamesCompleted;
      facts.completedSeconds += stats.totalPlayTimeSeconds;
      if (stats.gamesCompleted > 0 && isCount(stats.bestTimeSeconds)) facts.bestSecondsByDifficulty[id] = stats.bestTimeSeconds;
    }
    const scores = Array.isArray(highScores?.[id]) ? highScores[id].map((entry) => entry?.score).filter(isCount) : [];
    if (scores.length > 0) facts.bestScoreByDifficulty[id] = Math.max(...scores);
  }
  return facts;
}

/** The starting point for a player with no stored progress yet. */
export function progressFromHistory(history, todayKey) {
  const facts = provenHistory(history);
  return {
    ...emptyProgress(todayKey),
    wins: sumOf(facts.winsByDifficulty),
    winsByDifficulty: facts.winsByDifficulty,
    completedSeconds: facts.completedSeconds,
    bestSecondsByDifficulty: facts.bestSecondsByDifficulty,
    bestScoreByDifficulty: facts.bestScoreByDifficulty,
  };
}

/**
 * Schema-1 progress (Phase 4) → schema 2. Everything it tracked is kept
 * as-is; the new bests come from proven history, and the new playstyle
 * counts start at zero (that history was never recorded).
 */
export function upgradeProgress(progressV1, history) {
  const facts = provenHistory(history);
  return {
    ...progressV1,
    version: PROGRESS_VERSION,
    bestSecondsByDifficulty: facts.bestSecondsByDifficulty,
    bestScoreByDifficulty: facts.bestScoreByDifficulty,
    playstyle: Object.fromEntries(PLAYSTYLE_KEYS.map((key) => [key, 0])),
    unlocked: {},
  };
}

const RUN_FLAGS = ['perfect', 'noHint', 'noNotes', 'noUndo', 'heavyNotes', 'comeback'];

function assertValidRun(run) {
  const valid =
    run &&
    isValidRunId(run.runId) &&
    DIFFICULTY_IDS.includes(run.difficulty) &&
    isCount(run.score) &&
    isCount(run.elapsedSeconds) &&
    RUN_FLAGS.every((flag) => typeof run[flag] === 'boolean') &&
    // Combinations no real run can produce (see classifyCompletedRun).
    (!run.perfect || run.noHint) &&
    !(run.perfect && run.comeback) &&
    !(run.noNotes && run.heavyNotes);
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

function withPlaystyle(playstyle, run) {
  const hard = HARD_DIFFICULTIES.includes(run.difficulty);
  const add = (condition) => (condition ? 1 : 0);
  return {
    heavyNotesWins: playstyle.heavyNotesWins + add(run.heavyNotes),
    noNotesHardWins: playstyle.noNotesHardWins + add(run.noNotes && hard),
    noUndoHardWins: playstyle.noUndoHardWins + add(run.noUndo && hard),
    comebackWins: playstyle.comebackWins + add(run.comeback),
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

  const { difficulty } = run;
  const bestSeconds = progress.bestSecondsByDifficulty[difficulty];
  const bestScore = progress.bestScoreByDifficulty[difficulty];
  const winStreak = progress.winStreak.current + 1;
  const next = {
    ...progress,
    wins: progress.wins + 1,
    winsByDifficulty: { ...progress.winsByDifficulty, [difficulty]: progress.winsByDifficulty[difficulty] + 1 },
    earnedScore: progress.earnedScore + run.score,
    completedSeconds: progress.completedSeconds + run.elapsedSeconds,
    perfectWins: progress.perfectWins + (run.perfect ? 1 : 0),
    noHintWins: progress.noHintWins + (run.noHint ? 1 : 0),
    bestSecondsByDifficulty: {
      ...progress.bestSecondsByDifficulty,
      [difficulty]: bestSeconds === null ? run.elapsedSeconds : Math.min(bestSeconds, run.elapsedSeconds),
    },
    bestScoreByDifficulty: {
      ...progress.bestScoreByDifficulty,
      [difficulty]: bestScore === null ? run.score : Math.max(bestScore, run.score),
    },
    playstyle: withPlaystyle(progress.playstyle, run),
    winStreak: { current: winStreak, best: Math.max(progress.winStreak.best, winStreak) },
    recentRunIds: [...progress.recentRunIds, run.runId].slice(-MAX_RECENT_RUN_IDS),
  };
  return { progress: withWinOn(next, todayKey), duplicate: false };
}

/** An unfinished game was given up: ends the consecutive-win streak only. */
export function applyAbandonedRun(progress) {
  return { ...progress, winStreak: { current: 0, best: progress.winStreak.best } };
}

/**
 * Records achievements as unlocked at `at`. An ID that's already
 * unlocked is skipped — an unlock is never re-dated — so calling this
 * again with the same IDs changes nothing. Returns `{ progress,
 * newlyUnlocked }`.
 */
export function withUnlocks(progress, ids, { at, backfilled }) {
  const fresh = [...new Set(ids)].filter((id) => !Object.hasOwn(progress.unlocked, id));
  if (fresh.length === 0) return { progress, newlyUnlocked: [] };
  const unlocked = { ...progress.unlocked };
  for (const id of fresh) unlocked[id] = { at, backfilled };
  return { progress: { ...progress, unlocked }, newlyUnlocked: fresh };
}

function isValidStreak(value) {
  return !!value && isCount(value.current) && isCount(value.best) && value.best >= value.current;
}

const isCountOrNull = (value) => value === null || isCount(value);

/** The fields and invariants schema 1 and 2 share. */
function hasValidCore(value) {
  if (!isDateKey(value.trackingSince)) return false;
  const counts = ['wins', 'earnedScore', 'completedSeconds', 'perfectWins', 'noHintWins', 'winningDays'];
  if (!counts.every((key) => isCount(value[key]))) return false;
  const byDifficulty = value.winsByDifficulty;
  if (!byDifficulty || !DIFFICULTY_IDS.every((id) => isCount(byDifficulty[id]))) return false;
  if (sumOf(byDifficulty) !== value.wins) return false;
  if (value.perfectWins > value.noHintWins || value.noHintWins > value.wins) return false;
  if (!isValidStreak(value.winStreak) || !isValidStreak(value.dailyStreak)) return false;
  if (value.lastWinDate === null ? value.winningDays !== 0 : !isDateKey(value.lastWinDate)) return false;
  return (
    Array.isArray(value.recentRunIds) &&
    value.recentRunIds.length <= MAX_RECENT_RUN_IDS &&
    value.recentRunIds.every(isValidRunId)
  );
}

function isValidUnlocked(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_UNLOCKED &&
    // Unknown IDs are allowed on purpose: a later catalog may retire an
    // achievement, and that must not invalidate the player's progress.
    entries.every(
      ([id, unlock]) =>
        ACHIEVEMENT_ID_PATTERN.test(id) && !!unlock && Number.isInteger(unlock.at) && unlock.at > 0 && typeof unlock.backfilled === 'boolean'
    )
  );
}

/**
 * Strict shape check for stored (schema 2) progress, including the
 * invariants every update preserves — per-difficulty wins add up to the
 * total, perfect wins are also no-hint wins, a recorded day exists once
 * anything was — so corruption or hand-editing is caught rather than
 * built upon.
 */
export function isValidProgress(value) {
  if (!value || value.version !== PROGRESS_VERSION || !hasValidCore(value)) return false;
  const bests = [value.bestSecondsByDifficulty, value.bestScoreByDifficulty];
  if (!bests.every((byDifficulty) => byDifficulty && DIFFICULTY_IDS.every((id) => isCountOrNull(byDifficulty[id])))) return false;
  const { playstyle } = value;
  if (!playstyle || !PLAYSTYLE_KEYS.every((key) => isCount(playstyle[key]) && playstyle[key] <= value.wins)) return false;
  return isValidUnlocked(value.unlocked);
}

/** Schema-1 progress (Phase 4), accepted only to be upgraded. */
export function isValidProgressV1(value) {
  return !!value && value.version === PROGRESS_VERSION_1 && hasValidCore(value);
}
