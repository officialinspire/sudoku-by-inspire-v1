import { showScreen } from '../screens.js';
import { getHighScores } from '../high-scores-store.js';
import { initDifficultyFilter } from './difficulty-filter.js';
import { formatElapsedTime } from '../completion.js';

const backBtn = document.getElementById('btn-highscores-back');
const filterEl = document.getElementById('highscores-difficulty-filter');
const listEl = document.getElementById('highscores-list');
const emptyEl = document.getElementById('highscores-empty');

function formatDate(timestampMs) {
  return new Date(timestampMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function render(difficultyId) {
  const entries = getHighScores(difficultyId);
  listEl.innerHTML = '';
  emptyEl.hidden = entries.length > 0;

  entries.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'highscore-row';
    item.innerHTML = `
      <span class="highscore-rank">#${index + 1}</span>
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
}

export function refreshHighScoresScreen() {
  render(filter.getSelected());
}
