import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordHighScore,
  getHighScores,
  getAllHighScores,
  clearHighScores,
  clearHighScoresForDifficulty,
  consumeLastRecordedHighScore,
} from './high-scores-store.js';
import { DIFFICULTY_IDS } from './sudoku-generator.js';

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

function entry(overrides = {}) {
  return { score: 1000, elapsedSeconds: 300, mistakes: 0, hintsUsed: 0, achievedAt: 1700000000000, ...overrides };
}

describe('empty state', () => {
  test('every difficulty starts with no entries', () => {
    for (const id of DIFFICULTY_IDS) assert.deepEqual(getHighScores(id), []);
  });
});

describe('recordHighScore', () => {
  test('adds an entry and returns its rank', () => {
    const rank = recordHighScore('easy', entry({ score: 500 }));
    assert.equal(rank, 1);
    assert.equal(getHighScores('easy').length, 1);
  });

  test('sorts by score descending', () => {
    recordHighScore('easy', entry({ score: 500 }));
    recordHighScore('easy', entry({ score: 900 }));
    recordHighScore('easy', entry({ score: 100 }));
    const scores = getHighScores('easy').map((e) => e.score);
    assert.deepEqual(scores, [900, 500, 100]);
  });

  test('ties are broken by faster elapsed time', () => {
    recordHighScore('easy', entry({ score: 500, elapsedSeconds: 400 }));
    recordHighScore('easy', entry({ score: 500, elapsedSeconds: 200 }));
    const times = getHighScores('easy').map((e) => e.elapsedSeconds);
    assert.deepEqual(times, [200, 400]);
  });

  test('truncates to the top 10, dropping the lowest scores', () => {
    for (let i = 0; i < 15; i++) recordHighScore('easy', entry({ score: i * 10 }));
    const scores = getHighScores('easy');
    assert.equal(scores.length, 10);
    assert.equal(scores[0].score, 140); // highest of 0,10,...,140
    assert.equal(scores[9].score, 50); // 10th place — the lowest 5 (0-40) got dropped
  });

  test('an entry that does not make the top 10 returns a null rank', () => {
    for (let i = 0; i < 10; i++) recordHighScore('easy', entry({ score: 1000 }));
    const rank = recordHighScore('easy', entry({ score: 1 }));
    assert.equal(rank, null);
    assert.equal(getHighScores('easy').some((e) => e.score === 1), false);
  });

  test('difficulties are tracked independently', () => {
    recordHighScore('easy', entry({ score: 100 }));
    recordHighScore('insane', entry({ score: 999 }));
    assert.equal(getHighScores('easy').length, 1);
    assert.equal(getHighScores('insane').length, 1);
    assert.equal(getHighScores('easy')[0].score, 100);
  });

  test('unknown difficulty id is ignored, returns null', () => {
    assert.equal(recordHighScore('not-a-difficulty', entry()), null);
  });
});

describe('getAllHighScores', () => {
  test('returns an entry array for every difficulty', () => {
    const all = getAllHighScores();
    for (const id of DIFFICULTY_IDS) assert.ok(Array.isArray(all[id]));
  });
});

describe('corrupt data fails safely', () => {
  test('malformed JSON falls back to empty', () => {
    localStorage.setItem('inspireSudoku:v1:highScores', 'not json{{{');
    assert.deepEqual(getHighScores('easy'), []);
  });

  test('a list longer than 10 already in storage is rejected wholesale', () => {
    const bad = { version: 1, byDifficulty: {} };
    for (const id of DIFFICULTY_IDS) bad.byDifficulty[id] = new Array(11).fill(entry());
    localStorage.setItem('inspireSudoku:v1:highScores', JSON.stringify(bad));
    assert.deepEqual(getHighScores('easy'), []); // fell back to empty, not the invalid 11-entry list
  });

  test('a negative score in storage is rejected wholesale', () => {
    const bad = { version: 1, byDifficulty: {} };
    for (const id of DIFFICULTY_IDS) bad.byDifficulty[id] = [entry({ score: -5 })];
    localStorage.setItem('inspireSudoku:v1:highScores', JSON.stringify(bad));
    assert.deepEqual(getHighScores('easy'), []);
  });
});

describe('clearHighScores', () => {
  test('removes all recorded scores', () => {
    recordHighScore('easy', entry());
    clearHighScores();
    assert.deepEqual(getHighScores('easy'), []);
  });
});

describe('clearHighScoresForDifficulty', () => {
  test('empties only the given difficulty, leaving others untouched', () => {
    recordHighScore('easy', entry({ score: 500 }));
    recordHighScore('insane', entry({ score: 900 }));

    clearHighScoresForDifficulty('easy');

    assert.deepEqual(getHighScores('easy'), []);
    assert.equal(getHighScores('insane').length, 1);
    assert.equal(getHighScores('insane')[0].score, 900);
  });

  test('unknown difficulty id is silently ignored', () => {
    recordHighScore('easy', entry({ score: 500 }));
    clearHighScoresForDifficulty('not-a-difficulty');
    assert.equal(getHighScores('easy').length, 1);
  });
});

describe('consumeLastRecordedHighScore', () => {
  test('returns the difficulty and entry of a placing completion', () => {
    recordHighScore('advanced', entry({ score: 700 }));
    const result = consumeLastRecordedHighScore();
    assert.equal(result.difficultyId, 'advanced');
    assert.equal(result.entry.score, 700);
  });

  test('returns null after a completion that did not place', () => {
    for (let i = 0; i < 10; i++) recordHighScore('easy', entry({ score: 1000 }));
    consumeLastRecordedHighScore(); // drain the 10th placing call above first
    recordHighScore('easy', entry({ score: 1 })); // does not place
    assert.equal(consumeLastRecordedHighScore(), null);
  });

  test('consuming clears it — a second call in a row returns null', () => {
    recordHighScore('easy', entry({ score: 500 }));
    consumeLastRecordedHighScore();
    assert.equal(consumeLastRecordedHighScore(), null);
  });

  test('a later non-placing completion clears an earlier placement instead of leaving it stale', () => {
    recordHighScore('easy', entry({ score: 500 })); // places (list not full yet)
    for (let i = 0; i < 9; i++) recordHighScore('easy', entry({ score: 1000 + i })); // fills the list to 10; the 500 entry is still on it
    // The list is now full with a floor of 500 — this one is too low to place,
    // even though the 500 entry recorded earlier is still validly on the board.
    recordHighScore('easy', entry({ score: 1 }));
    assert.equal(consumeLastRecordedHighScore(), null);
  });
});
