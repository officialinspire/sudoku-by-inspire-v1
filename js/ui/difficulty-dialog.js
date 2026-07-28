import { showScreen } from '../screens.js';
import { suspendTimer, resumeTimer } from '../game-state.js';
import { startNewGame } from './game-screen.js';

const dialog = document.getElementById('difficulty-dialog');
const form = dialog.querySelector('form');

export function initDifficultyDialog() {
  dialog.addEventListener('close', () => {
    resumeTimer('dialog');
    if (dialog.returnValue !== 'start') return;
    const selected = form.querySelector('input[name="new-game-difficulty"]:checked');
    const difficultyId = selected ? selected.value : 'easy';
    showScreen('game');
    startNewGame(difficultyId);
  });
}

export function openDifficultyDialog() {
  suspendTimer('dialog');
  dialog.showModal();
}
