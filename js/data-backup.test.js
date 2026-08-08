import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildBackup, applyBackup } from './data-backup.js';

function createFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
beforeEach(() => { globalThis.localStorage = createFakeStorage(); });
afterEach(() => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
});

describe('buildBackup', () => {
  test('includes every key currently present in storage', () => {
    localStorage.setItem('inspireSudoku:v1:statistics', JSON.stringify({ version: 1, foo: 'bar' }));
    localStorage.setItem('inspireSudoku:v1:highScores', JSON.stringify({ version: 1, foo: 'baz' }));
    const backup = buildBackup();
    assert.deepEqual(backup.data['inspireSudoku:v1:statistics'], { version: 1, foo: 'bar' });
    assert.deepEqual(backup.data['inspireSudoku:v1:highScores'], { version: 1, foo: 'baz' });
  });

  test('omits keys that are not present rather than including null', () => {
    const backup = buildBackup();
    assert.equal('inspireSudoku:v1:statistics' in backup.data, false);
  });

  test('skips a corrupt (non-JSON) value already in storage instead of throwing', () => {
    localStorage.setItem('inspireSudoku:v1:statistics', 'not json{{{');
    const backup = buildBackup();
    assert.equal('inspireSudoku:v1:statistics' in backup.data, false);
  });

  test('stamps the app name, a backup version, and an ISO export timestamp', () => {
    const backup = buildBackup();
    assert.equal(backup.app, 'Sudoku by Inspire');
    assert.equal(typeof backup.backupVersion, 'number');
    assert.ok(!Number.isNaN(new Date(backup.exportedAt).getTime()));
  });
});

describe('applyBackup', () => {
  test('round-trips: export, clear, import restores the same data', () => {
    localStorage.setItem('inspireSudoku:v1:statistics', JSON.stringify({ version: 1, gamesStarted: 5 }));
    const backup = buildBackup();

    localStorage.removeItem('inspireSudoku:v1:statistics');
    assert.equal(localStorage.getItem('inspireSudoku:v1:statistics'), null);

    const result = applyBackup(backup);
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(localStorage.getItem('inspireSudoku:v1:statistics')), { version: 1, gamesStarted: 5 });
  });

  test('only writes keys present in the backup, leaving others untouched', () => {
    localStorage.setItem('inspireSudoku:v1:statistics', JSON.stringify({ version: 1, gamesStarted: 9 }));
    const backup = { app: 'Sudoku by Inspire', backupVersion: 1, exportedAt: new Date().toISOString(), data: {} };
    applyBackup(backup);
    assert.deepEqual(JSON.parse(localStorage.getItem('inspireSudoku:v1:statistics')), { version: 1, gamesStarted: 9 });
  });

  test('rejects a file from a different app', () => {
    const result = applyBackup({ app: 'Some Other App', backupVersion: 1, data: {} });
    assert.equal(result.ok, false);
  });

  test('rejects an incompatible backup version', () => {
    const result = applyBackup({ app: 'Sudoku by Inspire', backupVersion: 999, data: {} });
    assert.equal(result.ok, false);
  });

  test('rejects malformed input without throwing', () => {
    assert.equal(applyBackup(null).ok, false);
    assert.equal(applyBackup(undefined).ok, false);
    assert.equal(applyBackup('a string, not an object').ok, false);
    assert.equal(applyBackup({ app: 'Sudoku by Inspire', backupVersion: 1, data: 'not an object' }).ok, false);
  });

  test('ignores unrecognized extra keys in the backup rather than writing them', () => {
    const backup = {
      app: 'Sudoku by Inspire',
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      data: { 'some-unrelated-key': { hacked: true } },
    };
    const result = applyBackup(backup);
    assert.equal(result.ok, true);
    assert.equal(localStorage.getItem('some-unrelated-key'), null);
  });
});
