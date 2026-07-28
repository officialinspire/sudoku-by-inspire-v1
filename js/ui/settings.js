import { getAppearance, setTheme, setMode, resetAppearance, onAppearanceChange } from '../theme.js';

const dialog = document.getElementById('settings-dialog');
const themeInputs = dialog.querySelectorAll('input[name="theme"]');
const modeInputs = dialog.querySelectorAll('input[name="mode"]');
const modeHint = document.getElementById('mode-current-hint');
const resetBtn = document.getElementById('btn-reset-appearance');

function syncControls() {
  const { theme, mode, effectiveMode } = getAppearance();

  for (const input of themeInputs) input.checked = input.value === theme;
  for (const input of modeInputs) input.checked = input.value === mode;

  modeHint.textContent =
    mode === 'system'
      ? `System is currently ${effectiveMode === 'dark' ? 'Dark' : 'Light'}.`
      : '';
}

export function initSettingsDialog() {
  for (const input of themeInputs) {
    input.addEventListener('change', () => setTheme(input.value));
  }
  for (const input of modeInputs) {
    input.addEventListener('change', () => setMode(input.value));
  }

  resetBtn.addEventListener('click', () => {
    resetAppearance();
    syncControls();
  });

  // Appearance can change from outside the dialog (e.g. the OS scheme
  // flips while "System" is selected) — keep the controls truthful.
  onAppearanceChange(syncControls);
}

export function openSettingsDialog() {
  syncControls();
  dialog.showModal();
}
