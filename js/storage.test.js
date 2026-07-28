import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { loadJSON, saveJSON, removeJSON } from './storage.js';

// Node has no global `localStorage` (as of this project's Node version),
// so storage.js is exercised here against a tiny in-memory polyfill
// installed as globalThis.localStorage — storage.js itself stays
// ordinary browser code with no injected dependency, since it always
// reads the global fresh on every call rather than caching a reference.
function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    _store: store,
  };
}

function createThrowingStorage() {
  const boom = () => { throw new Error('storage denied'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
});

describe('loadJSON', () => {
  beforeEach(() => { globalThis.localStorage = createFakeStorage(); });

  test('returns the fallback when the key is missing', () => {
    assert.deepEqual(loadJSON('missing-key', { a: 1 }), { a: 1 });
  });

  test('returns the parsed value when present and valid JSON', () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    assert.deepEqual(loadJSON('k', null), { a: 1 });
  });

  test('returns the fallback for malformed JSON rather than throwing', () => {
    localStorage.setItem('k', 'not json{{{');
    assert.deepEqual(loadJSON('k', 'fallback'), 'fallback');
  });

  test('returns the fallback when a validator rejects the parsed value', () => {
    localStorage.setItem('k', JSON.stringify({ version: 99 }));
    const validator = (v) => v && v.version === 1;
    assert.deepEqual(loadJSON('k', { version: 1, safe: true }, validator), { version: 1, safe: true });
  });

  test('returns the parsed value when a validator accepts it', () => {
    localStorage.setItem('k', JSON.stringify({ version: 1, ok: true }));
    const validator = (v) => v && v.version === 1;
    assert.deepEqual(loadJSON('k', null, validator), { version: 1, ok: true });
  });

  test('returns the fallback when storage access throws (denied/unsupported)', () => {
    globalThis.localStorage = createThrowingStorage();
    assert.deepEqual(loadJSON('k', 'fallback'), 'fallback');
  });

  test('returns the fallback when localStorage does not exist at all', () => {
    delete globalThis.localStorage;
    assert.deepEqual(loadJSON('k', 'fallback'), 'fallback');
  });
});

describe('saveJSON', () => {
  beforeEach(() => { globalThis.localStorage = createFakeStorage(); });

  test('persists a JSON-serialized value and returns true', () => {
    const ok = saveJSON('k', { a: 1 });
    assert.equal(ok, true);
    assert.equal(localStorage.getItem('k'), JSON.stringify({ a: 1 }));
  });

  test('returns false (not throw) when storage write fails (quota/denied)', () => {
    globalThis.localStorage = createThrowingStorage();
    const ok = saveJSON('k', { a: 1 });
    assert.equal(ok, false);
  });

  test('returns false when localStorage does not exist at all', () => {
    delete globalThis.localStorage;
    const ok = saveJSON('k', { a: 1 });
    assert.equal(ok, false);
  });
});

describe('removeJSON', () => {
  beforeEach(() => { globalThis.localStorage = createFakeStorage(); });

  test('removes a stored key', () => {
    localStorage.setItem('k', '"value"');
    removeJSON('k');
    assert.equal(localStorage.getItem('k'), null);
  });

  test('returns false (not throw) when storage access fails', () => {
    globalThis.localStorage = createThrowingStorage();
    assert.equal(removeJSON('k'), false);
  });
});

describe('round trip', () => {
  beforeEach(() => { globalThis.localStorage = createFakeStorage(); });

  test('saveJSON then loadJSON returns an equivalent value', () => {
    const original = { version: 1, list: [1, 2, 3], nested: { ok: true } };
    saveJSON('k', original);
    assert.deepEqual(loadJSON('k', null), original);
  });
});
