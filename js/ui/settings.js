import { getAppearance, setTheme, setMode, resetAppearance, onAppearanceChange } from '../theme.js';
import { getGameSettings, setImmediateErrorChecking, onGameSettingsChange } from '../game-settings.js';
import { suspendTimer, resumeTimer } from '../game-state.js';

const dialog = document.getElementById('settings-dialog');
const themeInputs = dialog.querySelectorAll('input[name="theme"]');
const modeInputs = dialog.querySelectorAll('input[name="mode"]');
const modeHint = document.getElementById('mode-current-hint');
const resetBtn = document.getElementById('btn-reset-appearance');
const immediateErrorCheckingInput = document.getElementById('setting-immediate-error-checking');

function syncControls() {
  const { theme, mode, effectiveMode } = getAppearance();

  for (const input of themeInputs) input.checked = input.value === theme;
  for (const input of modeInputs) input.checked = input.value === mode;

  modeHint.textContent =
    mode === 'system'
      ? `System is currently ${effectiveMode === 'dark' ? 'Dark' : 'Light'}.`
      : '';

  immediateErrorCheckingInput.checked = getGameSettings().immediateErrorChecking;
}

export function initSettingsDialog() {
  for (const input of themeInputs) {
    input.addEventListener('change', () => setTheme(input.value));
  }
  for (const input of modeInputs) {
    input.addEventListener('change', () => setMode(input.value));
  }

  immediateErrorCheckingInput.addEventListener('change', () => {
    setImmediateErrorChecking(immediateErrorCheckingInput.checked);
  });

  resetBtn.addEventListener('click', () => {
    resetAppearance();
    syncControls();
  });

  // Appearance/gameplay settings can change from outside the dialog
  // (e.g. the OS scheme flips while "System" is selected) — keep the
  // controls truthful.
  onAppearanceChange(syncControls);
  onGameSettingsChange(syncControls);

  // A blocking dialog holds the game timer, same as a hidden tab or an
  // explicit pause — correct regardless of whether a game is actually
  // in progress when Settings is opened (suspendTimer/resumeTimer are
  // harmless no-ops when there's nothing to suspend).
  dialog.addEventListener('close', () => resumeTimer('dialog'));
}

export function openSettingsDialog() {
  suspendTimer('dialog');
  syncControls();
  dialog.showModal();
}
