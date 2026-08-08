import { showScreen } from '../screens.js';
import { getStatistics, clearStatisticsForDifficulty } from '../statistics-store.js';
import { DIFFICULTIES } from '../sudoku-generator.js';
import { initDifficultyFilter } from './difficulty-filter.js';
import { openClearDifficultyDialog } from './clear-difficulty-dialog.js';
import { formatElapsedTime } from '../completion.js';

const backBtn = document.getElementById('btn-statistics-back');
const filterEl = document.getElementById('statistics-difficulty-filter');
const clearBtn = document.getElementById('btn-clear-difficulty-stats');

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

  clearBtn.addEventListener('click', () => {
    const id = filter.getSelected();
    const label = DIFFICULTIES[id].label;
    openClearDifficultyDialog(
      `Clear ${label} Statistics?`,
      `This clears games played, streaks, and best/average time for ${label} only — other difficulties and your High Scores for ${label} are not affected. This can't be undone.`,
      () => {
        clearStatisticsForDifficulty(id);
        render(id);
      }
    );
  });
}

// Statistics can change while this screen isn't visible (a game
// completes elsewhere) — re-render whatever difficulty is currently
// selected each time the screen is shown, rather than relying on
// whatever was last drawn.
export function refreshStatisticsScreen() {
  render(filter.getSelected());
}
