import { showScreen } from '../screens.js';

export function initMenuScreen() {
  document.getElementById('btn-new-game').addEventListener('click', () => {
    showScreen('game');
  });

  // Continue Game stays disabled until Phase 5 adds save-state detection.
  // Statistics/Settings screens don't exist yet — built in Phases 6 and 7.
}
