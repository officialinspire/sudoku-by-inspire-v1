/**
 * Persisted audio/haptics preferences — same versioned-storage-with-
 * safe-fallback pattern as js/theme.js and js/game-settings.js, and
 * deliberately separate from both: independent concern, independent
 * storage key. This module knows nothing about AudioContext or Web
 * Audio at all (js/audio.js, the engine, is the only thing that reads
 * these values to actually make sound) — that split is what makes the
 * Settings dialog able to show/persist volume and mute state even
 * before the audio engine has been initialized by the first user
 * gesture (see js/audio.js's header comment).
 */

import { loadJSON, saveJSON } from './storage.js';

const STORAGE_KEY = 'inspireSudoku:v1:audioSettings';
const SCHEMA_VERSION = 1;

const DEFAULTS = {
  musicEnabled: true,
  sfxEnabled: true,
  vibrationEnabled: true,
  musicVolume: 0.5,
  sfxVolume: 0.6,
};

let settings = { ...DEFAULTS };
const listeners = new Set();

function isValidVolume(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidSettings(value) {
  return (
    value &&
    value.version === SCHEMA_VERSION &&
    typeof value.musicEnabled === 'boolean' &&
    typeof value.sfxEnabled === 'boolean' &&
    typeof value.vibrationEnabled === 'boolean' &&
    isValidVolume(value.musicVolume) &&
    isValidVolume(value.sfxVolume)
  );
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function readStoredSettings() {
  const stored = loadJSON(STORAGE_KEY, { ...DEFAULTS, version: SCHEMA_VERSION }, isValidSettings);
  return {
    musicEnabled: stored.musicEnabled,
    sfxEnabled: stored.sfxEnabled,
    vibrationEnabled: stored.vibrationEnabled,
    musicVolume: stored.musicVolume,
    sfxVolume: stored.sfxVolume,
  };
}

function persist() {
  saveJSON(STORAGE_KEY, { version: SCHEMA_VERSION, ...settings });
}

function notify() {
  for (const listener of listeners) listener(getAudioSettings());
}

export function getAudioSettings() {
  return { ...settings };
}

export function initAudioSettings() {
  settings = readStoredSettings();
}

export function setMusicEnabled(value) {
  settings = { ...settings, musicEnabled: !!value };
  persist();
  notify();
}

export function setSfxEnabled(value) {
  settings = { ...settings, sfxEnabled: !!value };
  persist();
  notify();
}

export function setVibrationEnabled(value) {
  settings = { ...settings, vibrationEnabled: !!value };
  persist();
  notify();
}

export function setMusicVolume(value) {
  settings = { ...settings, musicVolume: clamp01(value) };
  persist();
  notify();
}

export function setSfxVolume(value) {
  settings = { ...settings, sfxVolume: clamp01(value) };
  persist();
  notify();
}

export function onAudioSettingsChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
