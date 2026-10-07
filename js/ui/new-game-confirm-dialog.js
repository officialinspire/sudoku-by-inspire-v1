import { getState } from '../game-state.js';
import { recordGameAbandoned } from '../statistics-store.js';
import { recordRunAbandoned } from '../achievement-store.js';
import { clearActiveGame } from '../active-game-store.js';
import { openDifficultyDialog } from './difficulty-dialog.js';

const dialog = document.getElementById('new-game-confirm-dialog');

function hasUnfinishedGame() {
  const status = getState().status;
  return status === 'playing' || status === 'paused';
}

export function initNewGameConfirmDialog() {
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'confirm') return;
    const state = getState();
    if (hasUnfinishedGame()) {
      recordGameAbandoned(state.difficulty);
      recordRunAbandoned(); // ends the consecutive-win streak (not the daily one)
    }
    clearActiveGame();
    openDifficultyDialog();
  });
}

/** Routes "New Game" through a confirmation only if it would replace an unfinished game. */
export function requestNewGame() {
  if (hasUnfinishedGame()) {
    dialog.showModal();
  } else {
    openDifficultyDialog();
  }
}
