import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculateScore, BASE_SCORE, MISTAKE_PENALTY, HINT_PENALTY, PAR_SECONDS } from './scoring.js';
import { DIFFICULTIES } from './sudoku-generator.js';

function result(overrides = {}) {
  return { difficultyId: 'easy', elapsedSeconds: PAR_SECONDS.easy, mistakes: 0, hintsUsed: 0, ...overrides };
}

describe('calculateScore', () => {
  test('finishing exactly at par with no mistakes/hints scores the base value', () => {
    const score = calculateScore(result(), DIFFICULTIES.easy);
    assert.equal(score, Math.round(BASE_SCORE * DIFFICULTIES.easy.scoreMultiplier));
  });

  test('harder difficulties score higher for an identical performance', () => {
    const easy = calculateScore(result({ difficultyId: 'easy', elapsedSeconds: PAR_SECONDS.easy }), DIFFICULTIES.easy);
    const insane = calculateScore(result({ difficultyId: 'insane', elapsedSeconds: PAR_SECONDS.insane }), DIFFICULTIES.insane);
    assert.ok(insane > easy);
  });

  test('finishing under par earns a speed bonus', () => {
    const atPar = calculateScore(result({ elapsedSeconds: PAR_SECONDS.easy }), DIFFICULTIES.easy);
    const underPar = calculateScore(result({ elapsedSeconds: PAR_SECONDS.easy - 60 }), DIFFICULTIES.easy);
    assert.ok(underPar > atPar);
  });

  test('finishing over par earns no bonus but also no penalty beyond the missed bonus', () => {
    const atPar = calculateScore(result({ elapsedSeconds: PAR_SECONDS.easy }), DIFFICULTIES.easy);
    const overPar = calculateScore(result({ elapsedSeconds: PAR_SECONDS.easy + 500 }), DIFFICULTIES.easy);
    assert.equal(overPar, atPar); // both get zero speed bonus, nothing further subtracted for lateness
  });

  test('each mistake reduces the score by exactly MISTAKE_PENALTY', () => {
    const clean = calculateScore(result(), DIFFICULTIES.easy);
    const oneMistake = calculateScore(result({ mistakes: 1 }), DIFFICULTIES.easy);
    assert.equal(clean - oneMistake, MISTAKE_PENALTY);
  });

  test('each hint reduces the score by exactly HINT_PENALTY', () => {
    const clean = calculateScore(result(), DIFFICULTIES.easy);
    const oneHint = calculateScore(result({ hintsUsed: 1 }), DIFFICULTIES.easy);
    assert.equal(clean - oneHint, HINT_PENALTY);
  });

  test('never goes negative regardless of penalties', () => {
    const score = calculateScore(result({ mistakes: 10000, hintsUsed: 10000 }), DIFFICULTIES.easy);
    assert.equal(score, 0);
  });

  test('is always an integer', () => {
    const score = calculateScore(result({ elapsedSeconds: 137, mistakes: 3, hintsUsed: 1 }), DIFFICULTIES.advanced);
    assert.equal(Number.isInteger(score), true);
  });

  test('falls back to the easy par time for an unknown difficulty id', () => {
    const score = calculateScore(result({ difficultyId: 'nonexistent', elapsedSeconds: PAR_SECONDS.easy }), DIFFICULTIES.easy);
    assert.equal(score, Math.round(BASE_SCORE * DIFFICULTIES.easy.scoreMultiplier));
  });
});
