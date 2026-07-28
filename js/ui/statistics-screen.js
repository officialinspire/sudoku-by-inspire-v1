import { showScreen } from '../screens.js';
import { getStatistics } from '../statistics-store.js';
import { initDifficultyFilter } from './difficulty-filter.js';
import { formatElapsedTime } from '../completion.js';

const backBtn = document.getElementById('btn-statistics-back');
const filterEl = document.getElementById('statistics-difficulty-filter');

const fields = {
  gamesStarted: document.getElementById('stat-games-started'),
  gamesCompleted: document.getElementById('stat-games-completed'),
  completionRate: document.getElementById('stat-completion-rate'),
  totalTime: document.getElementById('stat-total-time'),
  bestTime: document.getElementById('stat-best-time'),
  averageTime: document.getElementById('stat-average-time'),
  currentStreak: document.getElementById('stat-current-streak'),
  bestStreak: document.getElementById('stat-best-streak'),
  totalHints: document.getElementById('stat-total-hints'),
  totalMistakes: document.getElementById('stat-total-mistakes'),
};

function render(difficultyId) {
  const stats = getStatistics(difficultyId);
  fields.gamesStarted.textContent = String(stats.gamesStarted);
  fields.gamesCompleted.textContent = String(stats.gamesCompleted);
  fields.completionRate.textContent = `${Math.round(stats.completionRate * 100)}%`;
  fields.totalTime.textContent = formatElapsedTime(stats.totalPlayTimeSeconds);
  fields.bestTime.textContent = stats.bestTimeSeconds === null ? '—' : formatElapsedTime(stats.bestTimeSeconds);
  fields.averageTime.textContent = stats.averageTimeSeconds === null ? '—' : formatElapsedTime(stats.averageTimeSeconds);
  fields.currentStreak.textContent = String(stats.currentStreak);
  fields.bestStreak.textContent = String(stats.bestStreak);
  fields.totalHints.textContent = String(stats.totalHints);
  fields.totalMistakes.textContent = String(stats.totalMistakes);
}

let filter;

export function initStatisticsScreen() {
  filter = initDifficultyFilter(filterEl, render);
  backBtn.addEventListener('click', () => showScreen('menu'));
}

// Statistics can change while this screen isn't visible (a game
// completes elsewhere) — re-render whatever difficulty is currently
// selected each time the screen is shown, rather than relying on
// whatever was last drawn.
export function refreshStatisticsScreen() {
  render(filter.getSelected());
}
