import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { estimateScore, formatElapsedTime, buildShareText } from './completion.js';
import { calculateScore, PAR_SECONDS } from './scoring.js';
import { DIFFICULTIES } from './sudoku-generator.js';

function fakeState(overrides = {}) {
  return { difficulty: 'easy', elapsedSeconds: PAR_SECONDS.easy, mistakes: 0, hintsUsed: 0, ...overrides };
}

// estimateScore's whole job is mapping a game-state snapshot onto
// scoring.js's calculateScore — the formula itself is scoring.test.js's
// job to verify in depth, so these tests focus on the mapping being
// correct (right fields, right difficulty config) rather than
// re-deriving expected score values by hand.
describe('estimateScore', () => {
  test('delegates to calculateScore with the state\'s own fields', () => {
    const state = fakeState({ difficulty: 'advanced', elapsedSeconds: 321, mistakes: 2, hintsUsed: 1 });
    const expected = calculateScore(
      { difficultyId: 'advanced', elapsedSeconds: 321, mistakes: 2, hintsUsed: 1 },
      DIFFICULTIES.advanced
    );
    assert.equal(estimateScore(state, DIFFICULTIES.advanced), expected);
  });

  test('never negative regardless of penalties (delegated guarantee)', () => {
    const score = estimateScore(fakeState({ mistakes: 1000, hintsUsed: 1000 }), DIFFICULTIES.easy);
    assert.equal(score, 0);
  });
});

describe('formatElapsedTime', () => {
  test('formats seconds as m:ss', () => {
    assert.equal(formatElapsedTime(0), '0:00');
    assert.equal(formatElapsedTime(5), '0:05');
    assert.equal(formatElapsedTime(65), '1:05');
    assert.equal(formatElapsedTime(600), '10:00');
  });
});

describe('buildShareText', () => {
  test('includes difficulty label, time, mistakes, hints, and score', () => {
    const state = fakeState({ difficulty: 'advanced', elapsedSeconds: 125, mistakes: 2, hintsUsed: 1 });
    const text = buildShareText(state, DIFFICULTIES.advanced);
    assert.ok(text.includes('Advanced'));
    assert.ok(text.includes('2:05'));
    assert.ok(text.includes('2 mistakes'));
    assert.ok(text.includes('1 hint,')); // singular
    assert.ok(text.includes(String(estimateScore(state, DIFFICULTIES.advanced))));
  });

  test('uses singular "mistake" for exactly one', () => {
    const text = buildShareText(fakeState({ mistakes: 1 }), DIFFICULTIES.easy);
    assert.ok(text.includes('1 mistake,'));
  });

  test('is a pure function: same input, same output', () => {
    const state = fakeState({ elapsedSeconds: 42, mistakes: 1, hintsUsed: 1 });
    const a = buildShareText(state, DIFFICULTIES.easy);
    const b = buildShareText(state, DIFFICULTIES.easy);
    assert.equal(a, b);
  });
});
