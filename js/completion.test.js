import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { estimateScore, formatElapsedTime, buildShareText } from './completion.js';
import { DIFFICULTIES } from './sudoku-generator.js';

function fakeState(overrides = {}) {
  return { elapsedSeconds: 0, mistakes: 0, hintsUsed: 0, ...overrides };
}

describe('estimateScore', () => {
  test('a flawless game scores the difficulty\'s full base value', () => {
    const score = estimateScore(fakeState(), DIFFICULTIES.easy);
    assert.equal(score, 1000 * DIFFICULTIES.easy.scoreMultiplier);
  });

  test('harder difficulties score higher for an identical performance', () => {
    const easy = estimateScore(fakeState(), DIFFICULTIES.easy);
    const insane = estimateScore(fakeState(), DIFFICULTIES.insane);
    assert.ok(insane > easy);
  });

  test('mistakes and hints each reduce the score', () => {
    const flawless = estimateScore(fakeState(), DIFFICULTIES.easy);
    const withMistakes = estimateScore(fakeState({ mistakes: 3 }), DIFFICULTIES.easy);
    const withHints = estimateScore(fakeState({ hintsUsed: 2 }), DIFFICULTIES.easy);
    assert.ok(withMistakes < flawless);
    assert.ok(withHints < flawless);
  });

  test('never goes negative regardless of penalties', () => {
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
    const state = fakeState({ elapsedSeconds: 125, mistakes: 2, hintsUsed: 1 });
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
