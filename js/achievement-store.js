/**
 * Persists achievement progress (js/achievement-progress.js) through
 * js/storage.js, under its own versioned key — same safe-fallback
 * pattern as the statistics and high-score stores: missing, corrupt, or
 * unreadable data never throws, it just falls back.
 *
 * The fallback for a player with no stored progress (first run of this
 * feature, after Clear Data, or after a corrupt value) is what existing
 * history *proves* (progressFromHistory), not zero; Phase-4 progress
 * (schema 1) is upgraded the same way.
 *
 * Achievements (js/achievement-catalog.js) are evaluated only when
 * progress changes — startup (seed/upgrade/backfill) and a recorded
 * completion — never on a timer tick, and an unlock is written once, in
 * the same write as the progress that earned it, and never re-dated.
 *
 * Completions are counted once per run ID. The stored list of recent run
 * IDs covers reloads and restored backups; `sessionRecordedRunIds`
 * covers the case where storage itself is unavailable (private mode,
 * quota), so even then one session never counts a run twice.
 */

import { loadJSON, saveJSON, removeJSON } from './storage.js';
import { getAllStatistics } from './statistics-store.js';
import { getAllHighScores } from './high-scores-store.js';
import {
  PROGRESS_VERSION,
  localDateKey,
  progressFromHistory,
  upgradeProgress,
  applyCompletedRun,
  applyAbandonedRun,
  withUnlocks,
  isValidProgress,
  isValidProgressV1,
} from './achievement-progress.js';
import { getProgressMetrics, evaluateAchievements, findNewlyMet } from './achievement-evaluation.js';
import { ACHIEVEMENTS } from './achievement-catalog.js';

const STORAGE_KEY = 'inspireSudoku:v1:achievementProgress';

const sessionRecordedRunIds = new Set();
const unlockListeners = new Set();

const todayKeyAt = (now) => localDateKey(new Date(now));
const readHistory = () => ({ statistics: getAllStatistics(), highScores: getAllHighScores() });

/** Unlocks every achievement `progress` meets that isn't unlocked yet. */
function unlockMet(progress, now, backfilled) {
  const ids = findNewlyMet(ACHIEVEMENTS, getProgressMetrics(progress, todayKeyAt(now)), progress.unlocked);
  return withUnlocks(progress, ids, { at: now, backfilled });
}

/**
 * Current-schema progress plus whether it still needs writing: stored
 * progress as-is, or — when it's missing, corrupt, or schema 1 — the
 * history seed/upgrade with whatever that history proves already unlocked
 * (marked `backfilled`, since no win happened just now).
 */
function load(now) {
  const stored = loadJSON(STORAGE_KEY, null, (value) => isValidProgress(value) || isValidProgressV1(value));
  if (stored?.version === PROGRESS_VERSION) return { progress: stored, needsSave: false, newlyUnlocked: [] };
  const seeded = stored ? upgradeProgress(stored, readHistory()) : progressFromHistory(readHistory(), todayKeyAt(now));
  return { ...unlockMet(seeded, now, true), needsSave: true };
}

/**
 * Subscribes to achievements unlocked by a won game:
 * `listener(ids, { runId })`, called once the unlock is saved — never
 * for an unlock that couldn't be stored (it would be gone on the next
 * load, so announcing it would be a promise the Achievements screen
 * can't keep). Returns an unsubscribe function.
 */
export function onAchievementsUnlocked(listener) {
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

function announce(ids, detail) {
  if (ids.length === 0) return;
  for (const listener of unlockListeners) {
    // A display bug must never break the completion flow that called
    // this: Statistics and High Scores are recorded right after.
    try {
      listener(ids, detail);
    } catch (error) {
      console.error('Achievement unlock listener failed:', error);
    }
  }
}

/**
 * Called once at startup: writes the seed/upgrade the first time, and
 * unlocks anything already met but not yet recorded (say, an achievement
 * a newer catalog added). Returns the IDs it unlocked — none if they
 * couldn't be saved.
 */
export function initAchievementProgress(now = Date.now()) {
  const loaded = load(now);
  const { progress, newlyUnlocked } = unlockMet(loaded.progress, now, true);
  if (!loaded.needsSave && newlyUnlocked.length === 0) return [];
  return saveJSON(STORAGE_KEY, progress) ? [...loaded.newlyUnlocked, ...newlyUnlocked] : [];
}

/**
 * Records one completed run: `{ runId, difficulty, score,
 * elapsedSeconds, ...classifyCompletedRun(state) }`. Returns
 * `{ duplicate: true, newlyUnlocked: [] }` if this run was already
 * counted (count it nowhere else either), otherwise `{ duplicate: false,
 * persisted, newlyUnlocked }` — the achievement IDs this win unlocked.
 * Never throws.
 */
export function recordCompletedRun(run, now = Date.now()) {
  if (sessionRecordedRunIds.has(run?.runId)) return { duplicate: true, newlyUnlocked: [] };
  let applied;
  try {
    applied = applyCompletedRun(load(now).progress, run, todayKeyAt(now));
  } catch {
    // Malformed run: skip progress rather than break the completion flow.
    return { duplicate: false, persisted: false, newlyUnlocked: [] };
  }
  sessionRecordedRunIds.add(run.runId);
  if (applied.duplicate) return { duplicate: true, newlyUnlocked: [] };
  const { progress, newlyUnlocked } = unlockMet(applied.progress, now, false);
  const persisted = saveJSON(STORAGE_KEY, progress);
  if (persisted) announce(newlyUnlocked, { runId: run.runId });
  return { duplicate: false, persisted, newlyUnlocked };
}

/**
 * An unfinished game was replaced by a new one: ends the win streak.
 * Nothing can become unlocked by giving up, so nothing is evaluated.
 */
export function recordRunAbandoned(now = Date.now()) {
  saveJSON(STORAGE_KEY, applyAbandonedRun(load(now).progress));
}

export function getAchievementProgress(now = Date.now()) {
  return load(now).progress;
}

export function getAchievementMetrics(now = Date.now()) {
  return getProgressMetrics(load(now).progress, todayKeyAt(now));
}

/**
 * Every achievement, in catalog order, with its progress: `{ ...definition,
 * current, fraction, unlocked, unlockedAt, backfilled }`. Read-only —
 * "unlocked" comes from the stored record, so it can never flicker.
 */
export function getAchievements(now = Date.now()) {
  const { progress } = load(now);
  const results = evaluateAchievements(ACHIEVEMENTS, getProgressMetrics(progress, todayKeyAt(now)));
  return ACHIEVEMENTS.map((definition, i) => {
    const unlock = Object.hasOwn(progress.unlocked, definition.id) ? progress.unlocked[definition.id] : null;
    return {
      ...definition,
      current: results[i].current,
      fraction: unlock ? 1 : results[i].fraction,
      unlocked: unlock !== null,
      unlockedAt: unlock?.at ?? null,
      backfilled: unlock?.backfilled ?? false,
    };
  });
}

/** Part of Settings → Clear Data. */
export function clearAchievementProgress() {
  sessionRecordedRunIds.clear();
  removeJSON(STORAGE_KEY);
}
