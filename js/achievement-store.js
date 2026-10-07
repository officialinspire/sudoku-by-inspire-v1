/**
 * Persists achievement progress (js/achievement-progress.js) through
 * js/storage.js, under its own versioned key — same safe-fallback
 * pattern as the statistics and high-score stores: missing, corrupt, or
 * unreadable data never throws, it just falls back.
 *
 * The fallback for a player with no stored progress (first run after
 * this feature shipped, after Clear Data, or after a corrupt value) is
 * the statistics backfill, not zero — see progressFromStatistics.
 *
 * Completions are counted once per run ID. The stored list of recent run
 * IDs covers reloads and restored backups; `sessionRecordedRunIds`
 * covers the case where storage itself is unavailable (private mode,
 * quota), so even then one session never counts a run twice.
 */

import { loadJSON, saveJSON, removeJSON } from './storage.js';
import { getAllStatistics } from './statistics-store.js';
import {
  localDateKey,
  progressFromStatistics,
  applyCompletedRun,
  applyAbandonedRun,
  isValidProgress,
} from './achievement-progress.js';
import { getProgressMetrics } from './achievement-evaluation.js';

const STORAGE_KEY = 'inspireSudoku:v1:achievementProgress';

const sessionRecordedRunIds = new Set();

const todayKeyAt = (now) => localDateKey(new Date(now));

function loadStored() {
  return loadJSON(STORAGE_KEY, null, isValidProgress);
}

function load(now) {
  return loadStored() ?? progressFromStatistics(getAllStatistics(), todayKeyAt(now));
}

/**
 * Called once at startup: writes the statistics backfill as soon as the
 * feature first runs (so `trackingSince` is the day tracking really
 * began, and later statistics changes can't shift the baseline).
 */
export function initAchievementProgress(now = Date.now()) {
  if (loadStored() === null) saveJSON(STORAGE_KEY, load(now));
}

/**
 * Records one completed run: `{ runId, difficulty, score,
 * elapsedSeconds, perfect, noHint }`. Returns `{ duplicate: true }` if
 * this run was already counted (do not count it anywhere else either),
 * otherwise `{ duplicate: false, persisted }`. Never throws.
 */
export function recordCompletedRun(run, now = Date.now()) {
  if (sessionRecordedRunIds.has(run?.runId)) return { duplicate: true };
  let result;
  try {
    result = applyCompletedRun(load(now), run, todayKeyAt(now));
  } catch {
    return { duplicate: false, persisted: false }; // malformed run: skip progress, never break completion
  }
  sessionRecordedRunIds.add(run.runId);
  if (result.duplicate) return { duplicate: true };
  return { duplicate: false, persisted: saveJSON(STORAGE_KEY, result.progress) };
}

/** An unfinished game was replaced by a new one: ends the win streak. */
export function recordRunAbandoned(now = Date.now()) {
  saveJSON(STORAGE_KEY, applyAbandonedRun(load(now)));
}

export function getAchievementProgress(now = Date.now()) {
  return load(now);
}

export function getAchievementMetrics(now = Date.now()) {
  return getProgressMetrics(load(now), todayKeyAt(now));
}

/** Part of Settings → Clear Data. */
export function clearAchievementProgress() {
  sessionRecordedRunIds.clear();
  removeJSON(STORAGE_KEY);
}
