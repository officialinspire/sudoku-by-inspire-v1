import { showScreen } from '../screens.js';
import { generatePuzzle, DIFFICULTIES } from '../sudoku-generator.js';
import { startGame, pauseGame } from '../game-state.js';
import { openSettingsDialog } from './settings.js';

const statusEl = document.getElementById('game-status');
const backBtn = document.getElementById('btn-game-back');
const gameSettingsBtn = document.getElementById('btn-game-settings');

function renderStatus(message) {
  statusEl.textContent = message;
}

// Completion is announced by js/ui/completion-dialog.js's modal, not
// here — #game-status stays focused on generation progress/result.

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

  gameSettingsBtn.addEventListener('click', () => {
    openSettingsDialog();
  });
}
