/**
 * Top-10 local leaderboard per difficulty. Best completion *times* live
 * in js/statistics-store.js (bestTimeSeconds) — this module is purely
 * about the score leaderboard, so "best time" isn't tracked twice in
 * two places that could disagree. Also tracks (in memory only, see
 * `lastRecorded` below) whether the most recent completion just placed,
 * for the High Scores screen's "you just got this one" highlight.
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

// In-memory only, deliberately never persisted: "the most recent
// completion's placement, if any" is a session-only fact, not something
// that should survive a reload. Exists purely so js/ui/high-scores-screen.js
// can highlight "the entry you just got" the next time it's shown,
// without new storage or new UI plumbing to thread the achievement
// through screen navigation (Menu, Statistics, etc. can sit in between).
let lastRecorded = null; // { difficultyId, entry } | null

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
  // Always reassigned — including to null on a non-placing completion —
  // so this tracks "did the single most recent game place," not "the
  // last time any game placed." Otherwise an earlier placement's stale
  // highlight could linger and get shown again after a later game that
  // didn't actually place.
  lastRecorded = rank === -1 ? null : { difficultyId, entry };
  return rank === -1 ? null : rank + 1;
}

/**
 * Returns the `{ difficultyId, entry }` of the most recent placing
 * completion, and clears it in the same call — a caller can't forget
 * the clear step and accidentally re-highlight the same entry on a
 * later, unrelated visit. Returns `null` if the last completion didn't
 * place, or if this has already been consumed since.
 */
export function consumeLastRecordedHighScore() {
  const result = lastRecorded;
  lastRecorded = null;
  return result;
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
