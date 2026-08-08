import { showScreen } from '../screens.js';
import { getHighScores, consumeLastRecordedHighScore, clearHighScoresForDifficulty } from '../high-scores-store.js';
import { DIFFICULTIES } from '../sudoku-generator.js';
import { initDifficultyFilter } from './difficulty-filter.js';
import { openClearDifficultyDialog } from './clear-difficulty-dialog.js';
import { formatElapsedTime } from '../completion.js';

const backBtn = document.getElementById('btn-highscores-back');
const filterEl = document.getElementById('highscores-difficulty-filter');
const listEl = document.getElementById('highscores-list');
const emptyEl = document.getElementById('highscores-empty');
const clearBtn = document.getElementById('btn-clear-difficulty-highscores');

function formatDate(timestampMs) {
  return new Date(timestampMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function entriesMatch(a, b) {
  return (
    a.score === b.score &&
    a.elapsedSeconds === b.elapsedSeconds &&
    a.mistakes === b.mistakes &&
    a.hintsUsed === b.hintsUsed &&
    a.achievedAt === b.achievedAt
  );
}

// Captured once per screen visit by refreshHighScoresScreen() below (not
// re-read on every render()), so switching between difficulty tabs
// during the same visit keeps showing the highlight — only the *next*
// separate visit to this screen starts fresh.
let highlightDifficulty = null;
let highlightEntry = null;

function render(difficultyId) {
  const entries = getHighScores(difficultyId);
  listEl.innerHTML = '';
  emptyEl.hidden = entries.length > 0;

  const highlightHere = highlightDifficulty === difficultyId ? highlightEntry : null;

  entries.forEach((entry, index) => {
    const rank = index + 1;
    const isNew = highlightHere !== null && entriesMatch(entry, highlightHere);

    const item = document.createElement('li');
    item.className = 'highscore-row';
    // Top-3 get a "medal" treatment on their rank badge (see styles.css
    // for why these three tiers reuse existing, already-audited color
    // pairings rather than introducing new gold/silver/bronze colors
    // that would each need their own contrast check per theme).
    if (rank <= 3) item.classList.add(`highscore-row--rank-${rank}`);
    if (isNew) item.classList.add('highscore-row--new');

    item.innerHTML = `
      <span class="highscore-rank">#${rank}</span>
      ${isNew ? '<span class="highscore-new-badge">New!</span>' : ''}
      <span class="highscore-score">${entry.score}</span>
      <span class="highscore-detail">${formatElapsedTime(entry.elapsedSeconds)}</span>
      <span class="highscore-detail">${entry.mistakes} mistake${entry.mistakes === 1 ? '' : 's'}</span>
      <span class="highscore-detail">${entry.hintsUsed} hint${entry.hintsUsed === 1 ? '' : 's'}</span>
      <span class="highscore-date">${formatDate(entry.achievedAt)}</span>
    `;
    listEl.appendChild(item);
  });
}

let filter;

export function initHighScoresScreen() {
  filter = initDifficultyFilter(filterEl, render);
  backBtn.addEventListener('click', () => showScreen('menu'));

  clearBtn.addEventListener('click', () => {
    const id = filter.getSelected();
    const label = DIFFICULTIES[id].label;
    openClearDifficultyDialog(
      `Clear ${label} High Scores?`,
      `This clears the leaderboard for ${label} only — other difficulties and your Statistics for ${label} are not affected. This can't be undone.`,
      () => {
        clearHighScoresForDifficulty(id);
        render(id);
      }
    );
  });
}

export function refreshHighScoresScreen() {
  const lastRecorded = consumeLastRecordedHighScore();
  highlightDifficulty = lastRecorded ? lastRecorded.difficultyId : null;
  highlightEntry = lastRecorded ? lastRecorded.entry : null;
  render(filter.getSelected());
}
