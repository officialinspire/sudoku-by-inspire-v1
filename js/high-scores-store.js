/**
 * Top-10 local leaderboard per difficulty. Best completion *times* live
 * in js/statistics-store.js (bestTimeSeconds) — this module is purely
 * about the score leaderboard, so "best time" isn't tracked twice in
 * two places that could disagree.
 */

import { loadJSON, saveJSON, removeJSON } from './storage.js';
import { DIFFICULTY_IDS } from './sudoku-generator.js';

const STORAGE_KEY = 'inspireSudoku:v1:highScores';
const SCHEMA_VERSION = 1;
const MAX_ENTRIES_PER_DIFFICULTY = 10;

function emptyHighScores() {
  const byDifficulty = {};
  for (const id of DIFFICULTY_IDS) byDifficulty[id] = [];
  return { version: SCHEMA_VERSION, byDifficulty };
}

function isValidEntry(value) {
  return (
    value &&
    Number.isInteger(value.score) && value.score >= 0 &&
    Number.isInteger(value.elapsedSeconds) && value.elapsedSeconds >= 0 &&
    Number.isInteger(value.mistakes) && value.mistakes >= 0 &&
    Number.isInteger(value.hintsUsed) && value.hintsUsed >= 0 &&
    Number.isInteger(value.achievedAt)
  );
}

function isValidHighScores(value) {
  return (
    value &&
    value.version === SCHEMA_VERSION &&
    value.byDifficulty &&
    DIFFICULTY_IDS.every(
      (id) =>
        Array.isArray(value.byDifficulty[id]) &&
        value.byDifficulty[id].length <= MAX_ENTRIES_PER_DIFFICULTY &&
        value.byDifficulty[id].every(isValidEntry)
    )
  );
}

function load() {
  return loadJSON(STORAGE_KEY, emptyHighScores(), isValidHighScores);
}

function save(data) {
  saveJSON(STORAGE_KEY, data);
}

function sortEntries(entries) {
  // Highest score first; ties broken by the faster time.
  return entries.slice().sort((a, b) => b.score - a.score || a.elapsedSeconds - b.elapsedSeconds);
}

/**
 * Inserts a new score, re-sorts, and truncates to the top 10 for that
 * difficulty. Returns the entry's rank (1-based) if it made the top 10,
 * or `null` if it didn't place.
 */
export function recordHighScore(difficultyId, { score, elapsedSeconds, mistakes, hintsUsed, achievedAt = Date.now() }) {
  if (!DIFFICULTY_IDS.includes(difficultyId)) return null;
  const data = load();
  const entry = { score, elapsedSeconds, mistakes, hintsUsed, achievedAt };
  const sorted = sortEntries([...data.byDifficulty[difficultyId], entry]).slice(0, MAX_ENTRIES_PER_DIFFICULTY);
  data.byDifficulty[difficultyId] = sorted;
  save(data);
  const rank = sorted.indexOf(entry);
  return rank === -1 ? null : rank + 1;
}

/** Returns up to 10 entries for `difficultyId`, highest score first. */
export function getHighScores(difficultyId) {
  const data = load();
  return data.byDifficulty[difficultyId] ?? [];
}

export function getAllHighScores() {
  const result = {};
  for (const id of DIFFICULTY_IDS) result[id] = getHighScores(id);
  return result;
}

export function clearHighScores() {
  removeJSON(STORAGE_KEY);
}
