import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { initAudioSettings, setVibrationEnabled } from './audio-settings.js';
import {
  isHapticsSupported,
  hapticCorrectEntry,
  hapticWrongEntry,
  hapticDigitComplete,
  hapticUnitComplete,
  hapticBoxComplete,
  hapticPuzzleComplete,
} from './haptics.js';

function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
// Node (unlike a browser, but like this test needs to simulate one) has
// its own built-in read-only `navigator` global — plain assignment
// throws ("Cannot set property navigator... which has only a getter"),
// so every override/restore here goes through defineProperty instead,
// preserving whatever was there before (Node's own descriptor, or
// nothing at all) exactly.
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

let vibrateCalls;

function setGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
    return;
  }
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function installSupportedEnvironment({ reducedMotion = false } = {}) {
  vibrateCalls = [];
  setGlobal('navigator', {
    vibrate: (pattern) => {
      vibrateCalls.push(pattern);
      return true;
    },
  });
  setGlobal('window', {
    matchMedia: () => ({ matches: reducedMotion }),
  });
}

function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) delete globalThis[name];
  else Object.defineProperty(globalThis, name, descriptor);
}

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
  initAudioSettings();
  setVibrationEnabled(true);
  installSupportedEnvironment();
});

afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  restoreGlobal('navigator', originalNavigatorDescriptor);
  restoreGlobal('window', originalWindowDescriptor);
});

describe('isHapticsSupported', () => {
  test('true when navigator.vibrate exists', () => {
    assert.equal(isHapticsSupported(), true);
  });

  test('false when navigator.vibrate is missing', () => {
    setGlobal('navigator', {});
    assert.equal(isHapticsSupported(), false);
  });

  test('false when navigator is entirely absent', () => {
    setGlobal('navigator', undefined);
    assert.equal(isHapticsSupported(), false);
  });
});

describe('individual triggers', () => {
  test('hapticCorrectEntry fires the lightest pattern', async () => {
    hapticCorrectEntry();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [10]);
  });

  test('hapticWrongEntry fires its own pattern', async () => {
    hapticWrongEntry();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [40]);
  });

  test('hapticDigitComplete fires a stronger pattern than a correct entry', async () => {
    hapticDigitComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [15]);
  });

  test('hapticUnitComplete (row/column) fires a stronger pattern than digit completion', async () => {
    hapticUnitComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [20]);
  });

  test('hapticBoxComplete fires a stronger pattern than a row/column', async () => {
    hapticBoxComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [28]);
  });

  test('hapticPuzzleComplete fires the strongest, multi-pulse pattern', async () => {
    hapticPuzzleComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [[30, 40, 30]]);
  });
});

describe('coalescing within a single synchronous pass', () => {
  test('only the strongest of several same-tick requests actually fires', async () => {
    hapticCorrectEntry();
    hapticDigitComplete();
    hapticBoxComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [28]);
  });

  test('the strongest still wins even if requested first', async () => {
    hapticPuzzleComplete();
    hapticCorrectEntry();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [[30, 40, 30]]);
  });

  test('two requests in separate synchronous passes both fire independently', async () => {
    hapticCorrectEntry();
    await Promise.resolve();
    hapticCorrectEntry();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, [10, 10]);
  });
});

describe('gating', () => {
  test('does nothing when the vibrationEnabled preference is off', async () => {
    setVibrationEnabled(false);
    hapticPuzzleComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, []);
  });

  test('does nothing when navigator.vibrate is unsupported', async () => {
    setGlobal('navigator', {});
    hapticPuzzleComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, []);
  });

  test('does nothing when the OS prefers-reduced-motion is set', async () => {
    installSupportedEnvironment({ reducedMotion: true });
    hapticPuzzleComplete();
    await Promise.resolve();
    assert.deepEqual(vibrateCalls, []);
  });

  test('never throws when navigator/window are entirely absent', async () => {
    setGlobal('navigator', undefined);
    setGlobal('window', undefined);
    assert.doesNotThrow(() => hapticPuzzleComplete());
    await Promise.resolve();
  });
});
