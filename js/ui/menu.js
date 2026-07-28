import { openSettingsDialog } from './settings.js';
import { openDifficultyDialog } from './difficulty-dialog.js';

export function initMenuScreen() {
  document.getElementById('btn-new-game').addEventListener('click', () => {
    openDifficultyDialog();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    openSettingsDialog();
  });

  // Continue Game stays disabled until Phase 6 adds save-state detection.
  // Statistics screen doesn't exist yet — built in Phase 7.
}
