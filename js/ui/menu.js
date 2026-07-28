import { showScreen } from '../screens.js';
import { openSettingsDialog } from './settings.js';
import { startNewGame } from './game-screen.js';

export function initMenuScreen() {
  document.getElementById('btn-new-game').addEventListener('click', () => {
    showScreen('game');
    startNewGame();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    openSettingsDialog();
  });

  // Continue Game stays disabled until Phase 5 adds save-state detection.
  // Statistics screen doesn't exist yet — built in Phase 6.
}
