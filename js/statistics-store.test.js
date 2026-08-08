import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordGameStarted,
  recordGameAbandoned,
  recordGameCompleted,
  getStatistics,
  getAllStatistics,
  clearStatistics,
  clearStatisticsForDifficulty,
} from './statistics-store.js';
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

describe('empty state', () => {
  test('every difficulty starts at zero with null bests/averages', () => {
    for (const id of DIFFICULTY_IDS) {
      const stats = getStatistics(id);
      assert.equal(stats.gamesStarted, 0);
      assert.equal(stats.gamesCompleted, 0);
      assert.equal(stats.completionRate, 0);
      assert.equal(stats.bestTimeSeconds, null);
      assert.equal(stats.averageTimeSeconds, null);
      assert.equal(stats.currentStreak, 0);
      assert.equal(stats.bestStreak, 0);
    }
  });
});

describe('recordGameStarted', () => {
  test('increments gamesStarted for that difficulty only', () => {
    recordGameStarted('easy');
    recordGameStarted('easy');
    assert.equal(getStatistics('easy').gamesStarted, 2);
    assert.equal(getStatistics('intermediate').gamesStarted, 0);
  });
});

describe('recordGameCompleted', () => {
  test('updates completion count, play time, best/average time, streak, hints, mistakes', () => {
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 200, mistakes: 2, hintsUsed: 1 });
    let stats = getStatistics('easy');
    assert.equal(stats.gamesCompleted, 1);
    assert.equal(stats.totalPlayTimeSeconds, 200);
    assert.equal(stats.bestTimeSeconds, 200);
    assert.equal(stats.averageTimeSeconds, 200);
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.bestStreak, 1);
    assert.equal(stats.totalHints, 1);
    assert.equal(stats.totalMistakes, 2);

    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    stats = getStatistics('easy');
    assert.equal(stats.gamesCompleted, 2);
    assert.equal(stats.totalPlayTimeSeconds, 300);
    assert.equal(stats.bestTimeSeconds, 100); // faster time wins
    assert.equal(stats.averageTimeSeconds, 150);
    assert.equal(stats.currentStreak, 2);
    assert.equal(stats.bestStreak, 2);
  });

  test('completionRate is completed / started', () => {
    recordGameStarted('easy');
    recordGameStarted('easy');
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    assert.equal(getStatistics('easy').completionRate, 1 / 3);
  });

  test('a slower completion never worsens bestTimeSeconds', () => {
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 500, mistakes: 0, hintsUsed: 0 });
    assert.equal(getStatistics('easy').bestTimeSeconds, 100);
  });
});

describe('streaks', () => {
  test('recordGameAbandoned resets currentStreak but preserves bestStreak', () => {
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    assert.equal(getStatistics('easy').currentStreak, 2);

    recordGameAbandoned('easy');
    const stats = getStatistics('easy');
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.bestStreak, 2);
  });

  test('a new streak can eventually exceed the old best', () => {
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    recordGameAbandoned('easy');
    for (let i = 0; i < 3; i++) {
      recordGameStarted('easy');
      recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 0, hintsUsed: 0 });
    }
    const stats = getStatistics('easy');
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.bestStreak, 3);
  });
});

describe('difficulties are tracked independently', () => {
  test('recording for one difficulty does not affect another', () => {
    recordGameStarted('insane');
    recordGameCompleted('insane', { elapsedSeconds: 1000, mistakes: 5, hintsUsed: 3 });
    assert.equal(getStatistics('easy').gamesCompleted, 0);
    assert.equal(getStatistics('insane').gamesCompleted, 1);
  });
});

describe('getAllStatistics', () => {
  test('returns an entry for every difficulty', () => {
    const all = getAllStatistics();
    for (const id of DIFFICULTY_IDS) assert.ok(id in all);
  });
});

describe('unknown difficulty ids', () => {
  test('recordGameStarted/Completed/Abandoned silently ignore unknown ids', () => {
    recordGameStarted('not-a-difficulty');
    recordGameCompleted('not-a-difficulty', { elapsedSeconds: 1, mistakes: 0, hintsUsed: 0 });
    recordGameAbandoned('not-a-difficulty');
    // No throw, and real difficulties remain untouched.
    assert.equal(getStatistics('easy').gamesStarted, 0);
  });
});

describe('corrupt data fails safely', () => {
  test('malformed JSON falls back to empty statistics', () => {
    localStorage.setItem('inspireSudoku:v1:statistics', 'not json{{{');
    assert.equal(getStatistics('easy').gamesStarted, 0);
  });

  test('a negative counter in storage is rejected wholesale', () => {
    const bad = { version: 1, byDifficulty: {} };
    for (const id of DIFFICULTY_IDS) {
      bad.byDifficulty[id] = {
        gamesStarted: -1, gamesCompleted: 0, totalPlayTimeSeconds: 0, bestTimeSeconds: null,
        currentStreak: 0, bestStreak: 0, totalHints: 0, totalMistakes: 0,
      };
    }
    localStorage.setItem('inspireSudoku:v1:statistics', JSON.stringify(bad));
    assert.equal(getStatistics('easy').gamesStarted, 0); // fell back to empty defaults, not -1
  });
});

describe('clearStatistics', () => {
  test('resets everything back to empty', () => {
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 1, hintsUsed: 1 });
    clearStatistics();
    assert.equal(getStatistics('easy').gamesStarted, 0);
    assert.equal(getStatistics('easy').gamesCompleted, 0);
  });
});

describe('clearStatisticsForDifficulty', () => {
  test('resets only the given difficulty, leaving others untouched', () => {
    recordGameStarted('easy');
    recordGameCompleted('easy', { elapsedSeconds: 100, mistakes: 1, hintsUsed: 1 });
    recordGameStarted('insane');
    recordGameCompleted('insane', { elapsedSeconds: 900, mistakes: 3, hintsUsed: 2 });

    clearStatisticsForDifficulty('easy');

    const easy = getStatistics('easy');
    assert.equal(easy.gamesStarted, 0);
    assert.equal(easy.gamesCompleted, 0);
    assert.equal(easy.bestTimeSeconds, null);

    const insane = getStatistics('insane');
    assert.equal(insane.gamesStarted, 1);
    assert.equal(insane.gamesCompleted, 1);
    assert.equal(insane.bestTimeSeconds, 900);
  });

  test('unknown difficulty id is silently ignored', () => {
    recordGameStarted('easy');
    clearStatisticsForDifficulty('not-a-difficulty');
    assert.equal(getStatistics('easy').gamesStarted, 1);
  });
});
