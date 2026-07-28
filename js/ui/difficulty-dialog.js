import { showScreen } from '../screens.js';
import { startNewGame } from './game-screen.js';

const dialog = document.getElementById('difficulty-dialog');
const form = dialog.querySelector('form');

export function initDifficultyDialog() {
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'start') return;
    const selected = form.querySelector('input[name="new-game-difficulty"]:checked');
    const difficultyId = selected ? selected.value : 'easy';
    showScreen('game');
    startNewGame(difficultyId);
  });
}

export function openDifficultyDialog() {
  dialog.showModal();
}
