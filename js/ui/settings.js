import { getAppearance, setTheme, setMode, resetAppearance, onAppearanceChange } from '../theme.js';
import { getGameSettings, setMistakeDetection, onGameSettingsChange } from '../game-settings.js';
import {
  getAudioSettings,
  setMusicEnabled,
  setSfxEnabled,
  setVibrationEnabled,
  setMusicVolume,
  setSfxVolume,
  onAudioSettingsChange,
} from '../audio-settings.js';
import { suspendTimer, resumeTimer } from '../game-state.js';
import { isHapticsSupported } from '../haptics.js';

const dialog = document.getElementById('settings-dialog');
const themeInputs = dialog.querySelectorAll('input[name="theme"]');
const modeInputs = dialog.querySelectorAll('input[name="mode"]');
const modeHint = document.getElementById('mode-current-hint');
const resetBtn = document.getElementById('btn-reset-appearance');
const mistakeDetectionInputs = dialog.querySelectorAll('input[name="mistake-detection"]');
const musicEnabledInput = document.getElementById('setting-music-enabled');
const musicVolumeInput = document.getElementById('setting-music-volume');
const sfxEnabledInput = document.getElementById('setting-sfx-enabled');
const sfxVolumeInput = document.getElementById('setting-sfx-volume');
const vibrationEnabledInput = document.getElementById('setting-vibration-enabled');
const vibrationSupportHint = document.getElementById('vibration-support-hint');

// Feature-detected once (via the same check js/haptics.js itself uses
// before ever calling navigator.vibrate — one definition of "does this
// device support it," not two) — it can't change over the page's
// lifetime, and is used both to disable the toggle and to explain why
// in the hint text, rather than letting the player enable a setting
// that can never do anything on this device/browser.
const vibrationSupported = isHapticsSupported();

function syncControls() {
  const { theme, mode, effectiveMode } = getAppearance();

  for (const input of themeInputs) input.checked = input.value === theme;
  for (const input of modeInputs) input.checked = input.value === mode;

  modeHint.textContent =
    mode === 'system'
      ? `System is currently ${effectiveMode === 'dark' ? 'Dark' : 'Light'}.`
      : '';

  const { mistakeDetection } = getGameSettings();
  for (const input of mistakeDetectionInputs) input.checked = input.value === mistakeDetection;

  const audio = getAudioSettings();
  musicEnabledInput.checked = audio.musicEnabled;
  musicVolumeInput.value = String(audio.musicVolume);
  sfxEnabledInput.checked = audio.sfxEnabled;
  sfxVolumeInput.value = String(audio.sfxVolume);
  vibrationEnabledInput.checked = audio.vibrationEnabled;
  vibrationEnabledInput.disabled = !vibrationSupported;
  vibrationSupportHint.textContent = vibrationSupported ? '' : 'Not supported on this device or browser.';
}

export function initSettingsDialog() {
  for (const input of themeInputs) {
    input.addEventListener('change', () => setTheme(input.value));
  }
  for (const input of modeInputs) {
    input.addEventListener('change', () => setMode(input.value));
  }

  for (const input of mistakeDetectionInputs) {
    input.addEventListener('change', () => setMistakeDetection(input.value));
  }

  musicEnabledInput.addEventListener('change', () => setMusicEnabled(musicEnabledInput.checked));
  musicVolumeInput.addEventListener('input', () => setMusicVolume(Number(musicVolumeInput.value)));
  sfxEnabledInput.addEventListener('change', () => setSfxEnabled(sfxEnabledInput.checked));
  sfxVolumeInput.addEventListener('input', () => setSfxVolume(Number(sfxVolumeInput.value)));
  vibrationEnabledInput.addEventListener('change', () => setVibrationEnabled(vibrationEnabledInput.checked));

  resetBtn.addEventListener('click', () => {
    resetAppearance();
    syncControls();
  });

  // Appearance/gameplay/audio settings can all change from outside the
  // dialog (e.g. the OS scheme flips while "System" is selected) — keep
  // the controls truthful.
  onAppearanceChange(syncControls);
  onGameSettingsChange(syncControls);
  onAudioSettingsChange(syncControls);

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
