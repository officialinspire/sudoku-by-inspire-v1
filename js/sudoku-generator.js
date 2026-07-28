/**
 * Puzzle generation on top of the pure rules engine (js/sudoku-engine.js).
 * This module is allowed one thing the engine deliberately isn't: a
 * `setTimeout(0)` yield between generation attempts, so a slow generation
 * doesn't freeze the tab and a caller's status callback actually gets a
 * chance to paint. It still takes no dependency on the DOM, storage, or
 * app state — everything it needs (a random source, a clock, a yield
 * function) is injectable, which is what makes it possible to test
 * deterministically under Node.
 */

import {
  isValidPlacement,
  findEmptyCell,
  indexToRowCol,
  countSolutions,
  isValidBoardShape,
  isSolved,
} from './sudoku-engine.js';

const BOARD_SIZE = 81;

// 17 givens is the proven minimum for any uniquely-solvable Sudoku
// (McGuire, Tugemann & Civario, 2012) — nothing below that can ever pass
// a uniqueness check, so it's a hard floor for `minClues`.
const ABSOLUTE_MIN_CLUES = 17;

/**
 * Centralized, tunable difficulty configuration. Every threshold that
 * shapes "how hard is a puzzle" lives here — nowhere else in the app
 * should hard-code a clue count or attempt limit.
 *
 * IMPORTANT: clue count (and this whole model) is a v1 approximation,
 * not a scientific difficulty rating. Two puzzles with the same clue
 * count can require wildly different solving techniques — one might
 * fall to simple scanning, the other might demand deep chains of
 * candidate elimination. `solverEffortRange` (backtracking steps taken
 * by a plain solver to fill a generated puzzle) is tracked alongside
 * clue count as a second, equally rough signal, mainly so a future
 * phase has a real number to refine this model against instead of
 * starting from nothing.
 */
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    minClues: 40,
    maxClues: 46,
    scoreMultiplier: 1,
    maxAttempts: 20,
    timeBudgetMs: 2000,
    solverEffortRange: { min: 80, max: 600 },
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermediate',
    minClues: 34,
    maxClues: 39,
    scoreMultiplier: 1.5,
    maxAttempts: 30,
    timeBudgetMs: 3000,
    solverEffortRange: { min: 150, max: 2000 },
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    minClues: 28,
    maxClues: 33,
    scoreMultiplier: 2.25,
    maxAttempts: 40,
    timeBudgetMs: 4000,
    solverEffortRange: { min: 400, max: 6000 },
  },
  insane: {
    id: 'insane',
    label: 'Insane',
    minClues: 22,
    maxClues: 27,
    scoreMultiplier: 3.5,
    maxAttempts: 60,
    timeBudgetMs: 6000,
    solverEffortRange: { min: 1500, max: 40000 },
  },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);

export const GENERATION_STATUS = {
  GENERATING: 'generating',
  GENERATED: 'generated',
  FALLBACK: 'fallback',
};

export function isValidDifficultyConfig(config) {
  if (!config || typeof config !== 'object') return false;
  if (typeof config.id !== 'string' || config.id.length === 0) return false;
  if (typeof config.label !== 'string' || config.label.length === 0) return false;
  if (!Number.isInteger(config.minClues) || !Number.isInteger(config.maxClues)) return false;
  if (config.minClues < ABSOLUTE_MIN_CLUES) return false;
  if (config.maxClues > BOARD_SIZE) return false;
  if (config.minClues > config.maxClues) return false;
  if (typeof config.scoreMultiplier !== 'number' || config.scoreMultiplier <= 0) return false;
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) return false;
  if (!Number.isInteger(config.timeBudgetMs) || config.timeBudgetMs < 1) return false;
  const range = config.solverEffortRange;
  if (
    !range ||
    !Number.isInteger(range.min) ||
    !Number.isInteger(range.max) ||
    range.min < 0 ||
    range.min > range.max
  ) {
    return false;
  }
  return true;
}

function shuffled(array, random) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomizedBacktrackFill(working, random) {
  const emptyIndex = findEmptyCell(working);
  if (emptyIndex === null) return true;

  const { row, col } = indexToRowCol(emptyIndex);
  for (const value of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random)) {
    if (isValidPlacement(working, row, col, value)) {
      working[emptyIndex] = value;
      if (randomizedBacktrackFill(working, random)) return true;
      working[emptyIndex] = 0;
    }
  }
  return false;
}

/**
 * Produces a random, fully-solved, valid board via randomized
 * backtracking: the same fill-and-backtrack algorithm as the engine's
 * solver, except candidate values are shuffled at each cell instead of
 * tried in ascending order, so repeated calls (with a varying random
 * source) don't all converge on the same grid. Pass a seeded `random`
 * (a `() => number in [0, 1)` function) for deterministic output.
 */
export function generateSolvedBoard(random = Math.random) {
  const working = new Array(BOARD_SIZE).fill(0);
  return randomizedBacktrackFill(working, random) ? working : null;
}

function currentClueCount(board) {
  let count = 0;
  for (const cell of board) if (cell !== 0) count += 1;
  return count;
}

// How many clue-removal attempts to make between yields to the event
// loop. Each attempt (a set-to-0 plus a countSolutions call) is cheap
// at high clue counts and gets progressively more expensive as clues
// thin out, so a fixed count doesn't bound wall-clock time between
// yields — but it does bound the *number* of countSolutions calls the
// thread runs uninterrupted, which is what keeps the pauses between
// yields from growing without limit as generation gets harder.
const YIELD_EVERY_N_REMOVALS = 6;

/**
 * Starting from a solved grid, removes clues one at a time (in a
 * shuffled order) down toward `targetClues`, backing out any removal
 * that would make the puzzle solvable more than one way. Stops early if
 * it runs out of cells that can be removed without breaking uniqueness
 * before reaching the target, or if `deadline` passes mid-removal — the
 * caller decides whether the resulting clue count is still acceptable.
 *
 * Two things protect the main thread here, not one:
 * - The deadline check runs on every iteration, not just between whole
 *   attempts (in `generatePuzzle`) — at low clue counts a *single*
 *   uniqueness check can itself take a while (see the Insane benchmark
 *   note in DEVELOPMENT_LOG.md), so bounding only between attempts
 *   would let one slow attempt blow through the entire time budget
 *   before anything could stop it.
 * - `await yieldToEventLoop()` runs periodically *during* one attempt,
 *   not just between attempts, so a long removal pass is chopped into
 *   several event-loop turns instead of one uninterrupted synchronous
 *   stretch that can run for seconds — that's what actually keeps the
 *   tab responsive, as opposed to merely bounding the total time.
 */
async function removeCluesForUniqueness(solution, targetClues, random, deadline, now, yieldToEventLoop) {
  const puzzle = solution.slice();
  const order = shuffled(
    Array.from({ length: BOARD_SIZE }, (_, i) => i),
    random
  );

  let sinceYield = 0;
  for (const index of order) {
    if (currentClueCount(puzzle) <= targetClues) break;
    if (now() >= deadline) break;

    const removedValue = puzzle[index];
    puzzle[index] = 0;

    // This is the expensive part: a full (bounded) backtracking search
    // to prove no *second* solution exists. It has to run once per
    // removal attempt, because uniqueness isn't local — removing a
    // clue can only be judged safe by re-solving the whole board.
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[index] = removedValue;
    }

    sinceYield += 1;
    if (sinceYield >= YIELD_EVERY_N_REMOVALS) {
      sinceYield = 0;
      await yieldToEventLoop();
    }
  }

  return puzzle;
}

async function attemptGeneration(config, random, deadline, now, yieldToEventLoop) {
  const solution = generateSolvedBoard(random);
  if (!solution) return null;

  const spread = config.maxClues - config.minClues + 1;
  const targetClues = config.minClues + Math.floor(random() * spread);

  const puzzle = await removeCluesForUniqueness(solution, targetClues, random, deadline, now, yieldToEventLoop);
  const clueCount = currentClueCount(puzzle);

  if (clueCount < config.minClues || clueCount > config.maxClues) return null;
  if (countSolutions(puzzle, 2) !== 1) return null; // defensive final check

  return { puzzle, solution, clueCount };
}

function defaultYield() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pickFallback(difficultyId, random) {
  const pool = FALLBACK_PUZZLES[difficultyId];
  const entry = pool[Math.floor(random() * pool.length)];
  return { puzzle: entry.puzzle.slice(), solution: entry.solution.slice() };
}

/**
 * Generates a puzzle for `difficultyId`. Tries up to `maxAttempts` times
 * (each a fresh random solved board + clue removal pass), bailing out
 * once either the attempt count or the time budget from that
 * difficulty's config is exhausted — this is the guard that keeps a
 * pathologically slow generation (most likely at Insane) from freezing
 * the UI indefinitely. If no attempt succeeds in time, falls back to a
 * pre-verified bundled puzzle for that difficulty so the player always
 * gets *something* playable.
 *
 * Options:
 * - `random`: `() => number in [0, 1)`, defaults to `Math.random`. Pass
 *   a seeded generator for deterministic output in tests.
 * - `now`: `() => number` clock, defaults to `performance.now`.
 * - `yieldToEventLoop`: `() => Promise<void>`, defaults to a
 *   `setTimeout(0)`. Lets tests replace the yield with a no-op so they
 *   don't have to wait on real timers.
 * - `onStatus`: called with `{ status, difficultyId, attempt, maxAttempts }`
 *   after each attempt starts — this is what a UI hangs status text off.
 */
export async function generatePuzzle(difficultyId, options = {}) {
  const config = DIFFICULTIES[difficultyId];
  if (!config) {
    throw new RangeError(`Unknown difficulty: ${difficultyId}`);
  }

  const random = options.random ?? Math.random;
  const now = options.now ?? (() => performance.now());
  const yieldToEventLoop = options.yieldToEventLoop ?? defaultYield;
  const onStatus = options.onStatus ?? (() => {});

  const startedAt = now();
  const deadline = startedAt + config.timeBudgetMs;
  let attempts = 0;

  while (attempts < config.maxAttempts && now() < deadline) {
    attempts += 1;
    onStatus({
      status: GENERATION_STATUS.GENERATING,
      difficultyId,
      attempt: attempts,
      maxAttempts: config.maxAttempts,
    });

    const result = await attemptGeneration(config, random, deadline, now, yieldToEventLoop);
    if (result) {
      return {
        status: GENERATION_STATUS.GENERATED,
        difficultyId,
        puzzle: result.puzzle,
        solution: result.solution,
        clueCount: result.clueCount,
        attempts,
        elapsedMs: now() - startedAt,
      };
    }

    // One more yield between attempts (on top of the periodic yields
    // already taken inside a slow attempt, see removeCluesForUniqueness)
    // so the onStatus update above always gets a chance to paint before
    // the next attempt starts, even for a fast attempt that never yielded.
    await yieldToEventLoop();
  }

  const fallback = pickFallback(difficultyId, random);
  const clueCount = currentClueCount(fallback.puzzle);
  onStatus({ status: GENERATION_STATUS.FALLBACK, difficultyId, attempts });

  return {
    status: GENERATION_STATUS.FALLBACK,
    difficultyId,
    puzzle: fallback.puzzle,
    solution: fallback.solution,
    clueCount,
    attempts,
    elapsedMs: now() - startedAt,
  };
}

/**
 * One pre-verified, hand-checkable-by-machine puzzle per difficulty,
 * used when live generation can't meet its time/attempt budget. Every
 * entry here was produced by this module's own generator (never
 * hand-typed) and is re-verified by `validateFallbackPuzzles()` — see
 * that function and js/sudoku-generator.test.js.
 */
export const FALLBACK_PUZZLES = {
  easy: [
    {
      puzzle: [0, 0, 3, 2, 0, 0, 0, 0, 5, 4, 5, 8, 0, 3, 1, 0, 9, 0, 9, 1, 2, 7, 5, 4, 0, 0, 0, 8, 0, 0, 9, 6, 5, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 7, 0, 2, 0, 5, 4, 1, 7, 0, 6, 0, 7, 9, 1, 5, 2, 3, 0, 8, 0, 0, 2, 4, 8, 0, 0, 0, 0, 3, 0, 8, 0, 1, 4, 9, 0, 5, 2],
      solution: [6, 7, 3, 2, 9, 8, 1, 4, 5, 4, 5, 8, 6, 3, 1, 2, 9, 7, 9, 1, 2, 7, 5, 4, 6, 3, 8, 8, 4, 7, 9, 6, 5, 3, 2, 1, 1, 6, 9, 3, 8, 2, 5, 7, 4, 2, 3, 5, 4, 1, 7, 8, 6, 9, 7, 9, 1, 5, 2, 3, 4, 8, 6, 5, 2, 4, 8, 7, 6, 9, 1, 3, 3, 8, 6, 1, 4, 9, 7, 5, 2],
    },
    {
      puzzle: [5, 0, 4, 0, 2, 8, 0, 0, 0, 7, 3, 2, 0, 0, 0, 8, 0, 6, 0, 0, 0, 0, 7, 0, 0, 2, 0, 4, 0, 3, 0, 5, 0, 0, 8, 0, 0, 0, 1, 9, 3, 2, 4, 6, 5, 6, 2, 0, 8, 1, 4, 0, 3, 0, 0, 4, 0, 0, 0, 3, 0, 7, 0, 2, 0, 8, 7, 6, 0, 9, 4, 3, 3, 5, 7, 0, 4, 9, 6, 0, 0],
      solution: [5, 6, 4, 3, 2, 8, 1, 9, 7, 7, 3, 2, 4, 9, 1, 8, 5, 6, 1, 8, 9, 5, 7, 6, 3, 2, 4, 4, 9, 3, 6, 5, 7, 2, 8, 1, 8, 7, 1, 9, 3, 2, 4, 6, 5, 6, 2, 5, 8, 1, 4, 7, 3, 9, 9, 4, 6, 1, 8, 3, 5, 7, 2, 2, 1, 8, 7, 6, 5, 9, 4, 3, 3, 5, 7, 2, 4, 9, 6, 1, 8],
    },
  ],
  intermediate: [
    {
      puzzle: [0, 0, 0, 0, 1, 6, 9, 0, 0, 1, 0, 9, 0, 0, 8, 0, 0, 6, 2, 4, 0, 0, 7, 9, 0, 8, 0, 0, 3, 0, 6, 2, 0, 0, 0, 7, 7, 0, 8, 0, 0, 5, 2, 6, 3, 0, 6, 0, 0, 8, 0, 4, 0, 0, 3, 9, 1, 0, 6, 0, 0, 4, 0, 0, 0, 7, 0, 0, 0, 0, 9, 0, 6, 0, 0, 7, 9, 4, 0, 3, 2],
      solution: [8, 5, 3, 2, 1, 6, 9, 7, 4, 1, 7, 9, 4, 3, 8, 5, 2, 6, 2, 4, 6, 5, 7, 9, 3, 8, 1, 9, 3, 4, 6, 2, 1, 8, 5, 7, 7, 1, 8, 9, 4, 5, 2, 6, 3, 5, 6, 2, 3, 8, 7, 4, 1, 9, 3, 9, 1, 8, 6, 2, 7, 4, 5, 4, 2, 7, 1, 5, 3, 6, 9, 8, 6, 8, 5, 7, 9, 4, 1, 3, 2],
    },
    {
      puzzle: [1, 0, 0, 6, 2, 7, 0, 4, 0, 3, 0, 7, 1, 0, 0, 0, 9, 0, 0, 0, 0, 0, 9, 0, 7, 1, 6, 7, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 6, 4, 0, 0, 0, 0, 0, 0, 2, 0, 7, 0, 9, 0, 6, 0, 9, 4, 0, 0, 0, 0, 0, 0, 3, 0, 0, 2, 0, 0, 6, 1, 0, 4, 0, 3, 0, 0, 0, 4, 8, 7, 9],
      solution: [1, 9, 8, 6, 2, 7, 3, 4, 5, 3, 6, 7, 1, 4, 5, 2, 9, 8, 2, 5, 4, 3, 9, 8, 7, 1, 6, 7, 1, 9, 5, 6, 3, 4, 8, 2, 5, 8, 6, 4, 1, 2, 9, 3, 7, 4, 2, 3, 7, 8, 9, 5, 6, 1, 9, 4, 5, 8, 7, 1, 6, 2, 3, 8, 7, 2, 9, 3, 6, 1, 5, 4, 6, 3, 1, 2, 5, 4, 8, 7, 9],
    },
  ],
  advanced: [
    {
      puzzle: [0, 0, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 8, 0, 9, 2, 0, 5, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 9, 4, 7, 5, 2, 9, 0, 0, 8, 2, 0, 4, 0, 0, 0, 4, 0, 0, 0, 6, 0, 8, 0, 0, 0, 7, 0, 0, 8, 5, 0, 0, 1, 0, 0, 7, 0, 9, 6, 0, 0, 8, 0, 0, 6, 0, 0, 0, 0, 7],
      solution: [7, 9, 1, 4, 8, 3, 2, 6, 5, 4, 3, 6, 5, 1, 2, 8, 7, 9, 2, 8, 5, 9, 6, 7, 1, 3, 4, 6, 1, 8, 3, 9, 4, 7, 5, 2, 9, 7, 3, 8, 2, 5, 4, 1, 6, 5, 4, 2, 1, 7, 6, 9, 8, 3, 3, 6, 7, 2, 4, 8, 5, 9, 1, 1, 5, 4, 7, 3, 9, 6, 2, 8, 8, 2, 9, 6, 5, 1, 3, 4, 7],
    },
    {
      puzzle: [2, 4, 0, 5, 0, 6, 0, 0, 9, 6, 9, 0, 0, 3, 0, 0, 0, 7, 0, 3, 0, 0, 0, 0, 6, 2, 0, 9, 0, 0, 0, 0, 0, 1, 0, 0, 0, 7, 0, 0, 1, 0, 0, 5, 4, 0, 0, 0, 9, 2, 8, 7, 0, 0, 5, 0, 0, 4, 0, 0, 0, 3, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 9, 0, 0, 0, 0],
      solution: [2, 4, 8, 5, 7, 6, 3, 1, 9, 6, 9, 5, 2, 3, 1, 8, 4, 7, 7, 3, 1, 8, 4, 9, 6, 2, 5, 9, 6, 3, 7, 5, 4, 1, 8, 2, 8, 7, 2, 6, 1, 3, 9, 5, 4, 1, 5, 4, 9, 2, 8, 7, 6, 3, 5, 1, 9, 4, 6, 7, 2, 3, 8, 3, 2, 7, 1, 8, 5, 4, 9, 6, 4, 8, 6, 3, 9, 2, 5, 7, 1],
    },
  ],
  insane: [
    {
      puzzle: [0, 0, 2, 7, 0, 0, 0, 5, 0, 6, 0, 9, 4, 0, 0, 0, 1, 0, 8, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 8, 6, 9, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 7, 0, 4, 8, 1, 0, 0, 0, 9],
      solution: [3, 4, 2, 7, 8, 1, 9, 5, 6, 6, 5, 9, 4, 3, 2, 8, 1, 7, 8, 1, 7, 9, 5, 6, 4, 3, 2, 5, 3, 8, 6, 9, 4, 7, 2, 1, 4, 7, 1, 5, 2, 8, 6, 9, 3, 2, 9, 6, 1, 7, 3, 5, 8, 4, 9, 8, 3, 2, 6, 7, 1, 4, 5, 1, 6, 5, 3, 4, 9, 2, 7, 8, 7, 2, 4, 8, 1, 5, 3, 6, 9],
    },
    {
      puzzle: [0, 0, 0, 0, 3, 8, 0, 4, 0, 0, 2, 0, 0, 0, 0, 7, 0, 0, 4, 0, 1, 5, 9, 0, 0, 0, 0, 0, 0, 7, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 8, 4, 3, 0, 0, 0, 0, 9, 6, 0, 0, 9, 0, 0, 0, 8, 6, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 7, 0, 0, 0, 3, 5, 0, 0],
      solution: [7, 9, 6, 2, 3, 8, 1, 4, 5, 8, 2, 5, 1, 6, 4, 7, 3, 9, 4, 3, 1, 5, 9, 7, 2, 6, 8, 6, 8, 7, 3, 4, 1, 9, 5, 2, 5, 1, 9, 6, 7, 2, 3, 8, 4, 3, 4, 2, 8, 5, 9, 6, 1, 7, 9, 5, 3, 7, 8, 6, 4, 2, 1, 1, 6, 4, 9, 2, 5, 8, 7, 3, 2, 7, 8, 4, 1, 3, 5, 9, 6],
    },
  ],
};

/**
 * Re-validates every bundled fallback puzzle: correct shape, the stored
 * solution is actually solved, every given matches that solution, the
 * clue count sits inside its difficulty's configured range, and the
 * puzzle has exactly one solution. Returns an array of human-readable
 * problem strings — empty means everything checked out.
 */
export function validateFallbackPuzzles() {
  const problems = [];

  for (const [difficultyId, entries] of Object.entries(FALLBACK_PUZZLES)) {
    const config = DIFFICULTIES[difficultyId];
    if (!config) {
      problems.push(`No difficulty config found for fallback set "${difficultyId}"`);
      continue;
    }
    if (entries.length === 0) {
      problems.push(`No fallback puzzles bundled for "${difficultyId}"`);
      continue;
    }

    entries.forEach((entry, i) => {
      const label = `${difficultyId}[${i}]`;

      if (!isValidBoardShape(entry.puzzle) || !isValidBoardShape(entry.solution)) {
        problems.push(`${label}: malformed board shape`);
        return;
      }
      if (!isSolved(entry.solution)) {
        problems.push(`${label}: stored solution is not actually a solved board`);
        return;
      }
      for (let i2 = 0; i2 < BOARD_SIZE; i2++) {
        if (entry.puzzle[i2] !== 0 && entry.puzzle[i2] !== entry.solution[i2]) {
          problems.push(`${label}: given at index ${i2} does not match the stored solution`);
          return;
        }
      }

      const clueCount = currentClueCount(entry.puzzle);
      if (clueCount < config.minClues || clueCount > config.maxClues) {
        problems.push(
          `${label}: clue count ${clueCount} outside configured range [${config.minClues}, ${config.maxClues}]`
        );
      }
      if (countSolutions(entry.puzzle, 2) !== 1) {
        problems.push(`${label}: puzzle does not have a unique solution`);
      }
    });
  }

  return problems;
}

// Startup self-check: cheap (a handful of countSolutions calls against
// near-minimal-clue boards) and non-fatal — a broken fallback shouldn't
// crash the app, but it should be loud in the console immediately
// rather than surfacing later as "New Game did nothing" once live
// generation happens to fail.
const fallbackProblems = validateFallbackPuzzles();
if (fallbackProblems.length > 0 && typeof console !== 'undefined') {
  console.warn('[sudoku-generator] bundled fallback puzzles failed validation:', fallbackProblems);
}
