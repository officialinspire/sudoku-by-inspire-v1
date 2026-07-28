import { showScreen, getCurrentScreen } from '../screens.js';
import { resetToIdle, suspendTimer, resumeTimer } from '../game-state.js';
import { clearActiveGame } from '../active-game-store.js';
import { clearStatistics } from '../statistics-store.js';
import { clearHighScores } from '../high-scores-store.js';

const dialog = document.getElementById('clear-data-confirm-dialog');
const openBtn = document.getElementById('btn-clear-data');

export function initClearDataDialog() {
  dialog.addEventListener('close', () => {
    resumeTimer('dialog');
    if (dialog.returnValue !== 'confirm') return;

    clearActiveGame();
    clearStatistics();
    clearHighScores();
    // A stale in-memory game would just resurrect a fresh active-game
    // save on its next autosave, quietly undoing part of the clear.
    resetToIdle();
    if (getCurrentScreen() === 'game') showScreen('menu');
  });

  openBtn.addEventListener('click', () => {
    suspendTimer('dialog');
    dialog.showModal();
  });
}
