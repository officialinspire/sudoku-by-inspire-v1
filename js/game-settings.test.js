import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getGameSettings,
  initGameSettings,
  setMistakeDetection,
  onGameSettingsChange,
  MISTAKE_DETECTION_MODES,
} from './game-settings.js';

const STORAGE_KEY = 'inspireSudoku:v1:gameplaySettings';

function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
  initGameSettings();
});
afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
});

describe('MISTAKE_DETECTION_MODES', () => {
  test('is exactly immediate and classic', () => {
    assert.deepEqual(MISTAKE_DETECTION_MODES, ['immediate', 'classic']);
  });
});

describe('defaults', () => {
  test('defaults to immediate (the app\'s original behavior) with no stored preference', () => {
    assert.equal(getGameSettings().mistakeDetection, 'immediate');
  });
});

describe('setMistakeDetection', () => {
  test('switches to classic and persists it', () => {
    setMistakeDetection('classic');
    assert.equal(getGameSettings().mistakeDetection, 'classic');

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    assert.equal(stored.mistakeDetection, 'classic');
  });

  test('a re-initialized module reloads the persisted preference', () => {
    setMistakeDetection('classic');
    initGameSettings();
    assert.equal(getGameSettings().mistakeDetection, 'classic');
  });

  test('an invalid mode is silently ignored', () => {
    setMistakeDetection('classic');
    setMistakeDetection('bogus');
    assert.equal(getGameSettings().mistakeDetection, 'classic');
  });

  test('notifies subscribers with the updated settings', () => {
    const seen = [];
    const unsubscribe = onGameSettingsChange((settings) => seen.push(settings.mistakeDetection));
    setMistakeDetection('classic');
    unsubscribe();
    setMistakeDetection('immediate');
    assert.deepEqual(seen, ['classic']);
  });
});

describe('schema migration', () => {
  test('a pre-existing boolean-shaped preference (the old immediateErrorChecking schema) falls back to the safe default rather than being partially trusted', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, immediateErrorChecking: false }));
    initGameSettings();
    assert.equal(getGameSettings().mistakeDetection, 'immediate');
  });

  test('corrupted JSON falls back to the safe default', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    initGameSettings();
    assert.equal(getGameSettings().mistakeDetection, 'immediate');
  });
});
