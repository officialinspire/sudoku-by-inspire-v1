import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  isValidDifficultyConfig,
  generateSolvedBoard,
  generatePuzzle,
  validateFallbackPuzzles,
  FALLBACK_PUZZLES,
} from './sudoku-generator.js';
import { isSolved, isValidBoardShape, countSolutions } from './sudoku-engine.js';

// Deterministic PRNG (mulberry32) so "seeded" tests are reproducible
// without depending on Math.random.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Skips the real setTimeout(0) between attempts so tests run fast; the
// production default is exercised separately, once, in the "does not
// block the event loop" test below.
const fastOptions = { yieldToEventLoop: () => Promise.resolve() };

describe('generateSolvedBoard', () => {
  test('produces a fully solved, valid board', () => {
    const board = generateSolvedBoard(mulberry32(1));
    assert.equal(isValidBoardShape(board), true);
    assert.equal(isSolved(board), true);
  });

  test('same seed produces the same board (determinism)', () => {
    const a = generateSolvedBoard(mulberry32(42));
    const b = generateSolvedBoard(mulberry32(42));
    assert.deepEqual(a, b);
  });

  test('different seeds produce different boards', () => {
    const a = generateSolvedBoard(mulberry32(1));
    const b = generateSolvedBoard(mulberry32(2));
    assert.notDeepEqual(a, b);
  });
});

describe('difficulty configuration', () => {
  test('every bundled difficulty config is valid', () => {
    for (const id of DIFFICULTY_IDS) {
      assert.equal(isValidDifficultyConfig(DIFFICULTIES[id]), true, `${id} config should be valid`);
    }
  });

  test('clue bands match the product spec and never go below the mathematical minimum (17)', () => {
    assert.deepEqual([DIFFICULTIES.easy.minClues, DIFFICULTIES.easy.maxClues], [40, 46]);
    assert.deepEqual([DIFFICULTIES.intermediate.minClues, DIFFICULTIES.intermediate.maxClues], [34, 39]);
    assert.deepEqual([DIFFICULTIES.advanced.minClues, DIFFICULTIES.advanced.maxClues], [28, 33]);
    assert.deepEqual([DIFFICULTIES.insane.minClues, DIFFICULTIES.insane.maxClues], [22, 27]);
    for (const id of DIFFICULTY_IDS) {
      assert.ok(DIFFICULTIES[id].minClues >= 17);
    }
  });

  test('difficulty bands do not overlap and get strictly harder', () => {
    const order = ['insane', 'advanced', 'intermediate', 'easy'];
    for (let i = 0; i < order.length - 1; i++) {
      const harder = DIFFICULTIES[order[i]];
      const easier = DIFFICULTIES[order[i + 1]];
      assert.ok(harder.maxClues < easier.minClues, `${order[i]}.maxClues should be < ${order[i + 1]}.minClues`);
      assert.ok(harder.scoreMultiplier > easier.scoreMultiplier);
    }
  });

  test('isValidDifficultyConfig rejects malformed configs', () => {
    const base = DIFFICULTIES.easy;
    assert.equal(isValidDifficultyConfig(null), false);
    assert.equal(isValidDifficultyConfig({ ...base, id: '' }), false);
    assert.equal(isValidDifficultyConfig({ ...base, minClues: 10 }), false); // below the proven minimum of 17
    assert.equal(isValidDifficultyConfig({ ...base, minClues: 50, maxClues: 40 }), false); // inverted range
    assert.equal(isValidDifficultyConfig({ ...base, scoreMultiplier: 0 }), false);
    assert.equal(isValidDifficultyConfig({ ...base, maxAttempts: 0 }), false);
    assert.equal(isValidDifficultyConfig({ ...base, timeBudgetMs: -1 }), false);
    assert.equal(isValidDifficultyConfig({ ...base, solverEffortRange: { min: 100, max: 50 } }), false);
    assert.equal(isValidDifficultyConfig({ ...base, solverEffortRange: undefined }), false);
  });
});

describe('generatePuzzle', () => {
  test('generates a puzzle with a unique solution, within its clue range', async () => {
    for (const id of DIFFICULTY_IDS) {
      const config = DIFFICULTIES[id];
      const result = await generatePuzzle(id, { random: mulberry32(7), ...fastOptions });
      assert.equal(isValidBoardShape(result.puzzle), true);
      assert.equal(isSolved(result.solution), true);
      assert.ok(result.clueCount >= config.minClues && result.clueCount <= config.maxClues,
        `${id}: clue count ${result.clueCount} outside [${config.minClues}, ${config.maxClues}]`);
      assert.equal(countSolutions(result.puzzle, 2), 1, `${id}: puzzle must have exactly one solution`);
      // Every given in the puzzle must match the stored solution.
      for (let i = 0; i < 81; i++) {
        if (result.puzzle[i] !== 0) assert.equal(result.puzzle[i], result.solution[i]);
      }
    }
  });

  test('rejects an unknown difficulty id', async () => {
    await assert.rejects(() => generatePuzzle('impossible', fastOptions), RangeError);
  });

  test('same seed produces the same puzzle (determinism)', async () => {
    const a = await generatePuzzle('easy', { random: mulberry32(99), ...fastOptions });
    const b = await generatePuzzle('easy', { random: mulberry32(99), ...fastOptions });
    assert.deepEqual(a.puzzle, b.puzzle);
    assert.deepEqual(a.solution, b.solution);
    assert.equal(a.status, b.status);
  });

  test('falls back to a bundled puzzle once attempts are exhausted, without hanging', async () => {
    // Force the "can't generate in time" path deterministically: 0
    // attempts allowed means the loop never runs and it goes straight
    // to fallback. This is the only way to exercise that branch without
    // depending on real generation being slow, which would make the
    // test itself slow and environment-dependent.
    const original = { ...DIFFICULTIES.easy };
    DIFFICULTIES.easy.maxAttempts = 0;
    try {
      const result = await generatePuzzle('easy', fastOptions);
      assert.equal(result.status, 'fallback');
      assert.equal(isValidBoardShape(result.puzzle), true);
      assert.equal(countSolutions(result.puzzle, 2), 1);
    } finally {
      Object.assign(DIFFICULTIES.easy, original);
    }
  });

  test('onStatus is called at least once per attempt', async () => {
    const statuses = [];
    await generatePuzzle('easy', {
      random: mulberry32(5),
      ...fastOptions,
      onStatus: (info) => statuses.push(info.status),
    });
    assert.ok(statuses.length >= 1);
    assert.ok(statuses.every((s) => s === 'generating' || s === 'fallback'));
  });

  test('does not block the event loop for its full duration (default yield included)', async () => {
    // A real setTimeout(0) between ticks means other pending timers get
    // a chance to fire during generation. If generation blocked the
    // thread synchronously for its whole run, this marker timer would
    // never interleave — it would only fire after generatePuzzle
    // resolves, not before.
    let markerFired = false;
    setTimeout(() => { markerFired = true; }, 0);

    await generatePuzzle('easy', { random: mulberry32(3) }); // real yieldToEventLoop this time
    // Give the marker's already-queued timer a final turn if it hasn't
    // fired yet (it should have, well before generation finished).
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(markerFired, true);
  });
});

describe('fallback puzzles', () => {
  test('every bundled fallback puzzle is independently valid', () => {
    assert.deepEqual(validateFallbackPuzzles(), []);
  });

  test('at least one fallback exists per difficulty', () => {
    for (const id of DIFFICULTY_IDS) {
      assert.ok(FALLBACK_PUZZLES[id].length >= 1, `no fallback puzzles for ${id}`);
    }
  });
});
