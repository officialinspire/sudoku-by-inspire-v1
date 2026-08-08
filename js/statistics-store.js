/**
 * Per-difficulty play statistics. Stores only raw counters —
 * completion rate and average time are *derived* (computed in
 * `getStatistics`, never stored) so they can never drift out of sync
 * with the counters they're computed from.
 */

import { loadJSON, saveJSON, removeJSON } from './storage.js';
import { DIFFICULTY_IDS } from './sudoku-generator.js';

const STORAGE_KEY = 'inspireSudoku:v1:statistics';
const SCHEMA_VERSION = 1;

function emptyDifficultyStats() {
  return {
    gamesStarted: 0,
    gamesCompleted: 0,
    totalPlayTimeSeconds: 0,
    bestTimeSeconds: null,
    currentStreak: 0,
    bestStreak: 0,
    totalHints: 0,
    totalMistakes: 0,
  };
}

function emptyStatistics() {
  const byDifficulty = {};
  for (const id of DIFFICULTY_IDS) byDifficulty[id] = emptyDifficultyStats();
  return { version: SCHEMA_VERSION, byDifficulty };
}

function isValidDifficultyStats(value) {
  return (
    value &&
    Number.isInteger(value.gamesStarted) && value.gamesStarted >= 0 &&
    Number.isInteger(value.gamesCompleted) && value.gamesCompleted >= 0 &&
    Number.isInteger(value.totalPlayTimeSeconds) && value.totalPlayTimeSeconds >= 0 &&
    (value.bestTimeSeconds === null || (Number.isInteger(value.bestTimeSeconds) && value.bestTimeSeconds >= 0)) &&
    Number.isInteger(value.currentStreak) && value.currentStreak >= 0 &&
    Number.isInteger(value.bestStreak) && value.bestStreak >= 0 &&
    Number.isInteger(value.totalHints) && value.totalHints >= 0 &&
    Number.isInteger(value.totalMistakes) && value.totalMistakes >= 0
  );
}

function isValidStatistics(value) {
  return (
    value &&
    value.version === SCHEMA_VERSION &&
    value.byDifficulty &&
    DIFFICULTY_IDS.every((id) => isValidDifficultyStats(value.byDifficulty[id]))
  );
}

function load() {
  return loadJSON(STORAGE_KEY, emptyStatistics(), isValidStatistics);
}

function save(stats) {
  saveJSON(STORAGE_KEY, stats);
}

export function recordGameStarted(difficultyId) {
  if (!DIFFICULTY_IDS.includes(difficultyId)) return;
  const stats = load();
  stats.byDifficulty[difficultyId].gamesStarted += 1;
  save(stats);
}

/** A game was replaced by a new one before being completed — breaks the streak. */
export function recordGameAbandoned(difficultyId) {
  if (!DIFFICULTY_IDS.includes(difficultyId)) return;
  const stats = load();
  stats.byDifficulty[difficultyId].currentStreak = 0;
  save(stats);
}

export function recordGameCompleted(difficultyId, { elapsedSeconds, mistakes, hintsUsed }) {
  if (!DIFFICULTY_IDS.includes(difficultyId)) return;
  const stats = load();
  const d = stats.byDifficulty[difficultyId];
  d.gamesCompleted += 1;
  d.totalPlayTimeSeconds += elapsedSeconds;
  d.bestTimeSeconds = d.bestTimeSeconds === null ? elapsedSeconds : Math.min(d.bestTimeSeconds, elapsedSeconds);
  d.currentStreak += 1;
  d.bestStreak = Math.max(d.bestStreak, d.currentStreak);
  d.totalHints += hintsUsed;
  d.totalMistakes += mistakes;
  save(stats);
}

/**
 * Returns the stored counters for `difficultyId` plus the derived
 * `completionRate` (0-1, 0 when no games started) and
 * `averageTimeSeconds` (null when no games completed).
 */
export function getStatistics(difficultyId) {
  const stats = load();
  const d = stats.byDifficulty[difficultyId] ?? emptyDifficultyStats();
  return {
    ...d,
    completionRate: d.gamesStarted === 0 ? 0 : d.gamesCompleted / d.gamesStarted,
    averageTimeSeconds: d.gamesCompleted === 0 ? null : Math.round(d.totalPlayTimeSeconds / d.gamesCompleted),
  };
}

export function getAllStatistics() {
  const result = {};
  for (const id of DIFFICULTY_IDS) result[id] = getStatistics(id);
  return result;
}

export function clearStatistics() {
  removeJSON(STORAGE_KEY);
}

/** Resets just one difficulty's counters to empty, leaving every other difficulty untouched. */
export function clearStatisticsForDifficulty(difficultyId) {
  if (!DIFFICULTY_IDS.includes(difficultyId)) return;
  const stats = load();
  stats.byDifficulty[difficultyId] = emptyDifficultyStats();
  save(stats);
}
