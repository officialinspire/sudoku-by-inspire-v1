import { showScreen } from '../screens.js';
import { onStateChange, restoreGame } from '../game-state.js';
import { hasActiveGame, loadActiveGame } from '../active-game-store.js';
import { openSettingsDialog } from './settings.js';
import { requestNewGame } from './new-game-confirm-dialog.js';
import { refreshStatisticsScreen } from './statistics-screen.js';
import { refreshHighScoresScreen } from './high-scores-screen.js';

const continueBtn = document.getElementById('btn-continue-game');

function refreshContinueButton() {
  continueBtn.disabled = !hasActiveGame();
}

export function initMenuScreen() {
  document.getElementById('btn-new-game').addEventListener('click', () => {
    requestNewGame();
  });

  continueBtn.addEventListener('click', () => {
    const saved = loadActiveGame();
    if (!saved) {
      refreshContinueButton(); // save vanished/corrupted since the button was enabled
      return;
    }
    restoreGame(saved);
    showScreen('game');
  });

  document.getElementById('btn-statistics').addEventListener('click', () => {
    refreshStatisticsScreen();
    showScreen('statistics');
  });

  document.getElementById('btn-highscores').addEventListener('click', () => {
    refreshHighScoresScreen();
    showScreen('highscores');
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    openSettingsDialog();
  });

  // A game completing (which clears the active-game save) or an
  // abandon/replace happening elsewhere should be reflected here even
  // if this screen isn't currently visible.
  onStateChange(refreshContinueButton);
  refreshContinueButton();
}
