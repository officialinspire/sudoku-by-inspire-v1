import { showScreen } from '../screens.js';
import { generatePuzzle, DIFFICULTIES } from '../sudoku-generator.js';
import { startGame, onStateChange, pauseGame } from '../game-state.js';

const statusEl = document.getElementById('game-status');
const backBtn = document.getElementById('btn-game-back');

let previousStatus = null;

function renderStatus(message) {
  statusEl.textContent = message;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Completion is announced here (once, on the transition into 'complete')
// rather than the board renderer doing it on every render — this module
// owns #game-status, board-view.js owns the grid/header/toolbar.
onStateChange((state) => {
  if (state.status === 'complete' && previousStatus !== 'complete') {
    const mistakeWord = state.mistakes === 1 ? 'mistake' : 'mistakes';
    renderStatus(`Solved! Time ${formatTime(state.elapsedSeconds)}, ${state.mistakes} ${mistakeWord}.`);
  }
  previousStatus = state.status;
});

export async function startNewGame(difficultyId = 'easy') {
  renderStatus('Generating puzzle…');

  const result = await generatePuzzle(difficultyId, {
    onStatus: (info) => {
      if (info.status === 'generating' && info.attempt > 1) {
        renderStatus(`Generating puzzle… (attempt ${info.attempt}/${info.maxAttempts})`);
      }
    },
  });

  const label = DIFFICULTIES[difficultyId].label;
  const clueWord = result.clueCount === 1 ? 'clue' : 'clues';
  const detail =
    result.status === 'generated'
      ? `generated in ${Math.round(result.elapsedMs)}ms, attempt ${result.attempts}`
      : `live generation didn't finish in time — used a bundled puzzle`;

  renderStatus(`Ready — ${label} puzzle, ${result.clueCount} ${clueWord} (${detail}).`);

  startGame(result, difficultyId);
}

export function initGameScreen() {
  backBtn.addEventListener('click', () => {
    pauseGame();
    showScreen('menu');
  });
}
