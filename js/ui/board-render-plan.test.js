import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isTimerOnlyChange, shouldFocusSelectedCell } from './board-render-plan.js';
import {
  getState,
  startGame,
  selectCell,
  applyNumberInput,
  toggleNotesMode,
  undo,
  pauseGame,
  resumeGame,
} from '../game-state.js';

// Same deterministic valid grid as js/game-state.test.js.
function buildValidCompletedBoard() {
  const board = new Array(81).fill(0);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const shift = 3 * (row % 3) + Math.floor(row / 3);
      board[row * 9 + col] = ((shift + col) % 9) + 1;
    }
  }
  return board;
}

const solution = buildValidCompletedBoard();

function freshGameResult() {
  const puzzle = new Array(81).fill(0);
  puzzle[0] = solution[0];
  return { puzzle, solution: solution.slice(), status: 'generated', attempts: 1, elapsedMs: 10, clueCount: 1 };
}

// A controllable clock, so "one timer tick" is just advancing this by a
// second and reading a fresh snapshot — no real setInterval involved.
let now = 0;

beforeEach(() => {
  now = 1_000_000;
  startGame(freshGameResult(), 'easy', { autoStartTimer: false, now: () => now });
});

describe('isTimerOnlyChange (against the real game-state module)', () => {
  test('first render is never timer-only', () => {
    assert.equal(isTimerOnlyChange(null, getState()), false);
  });

  test('a clock tick alone is timer-only', () => {
    const before = getState();
    now += 1000;
    const after = getState();
    assert.equal(after.elapsedSeconds, before.elapsedSeconds + 1);
    assert.equal(isTimerOnlyChange(before, after), true);
  });

  test('every real mutation is detected as a board change', () => {
    const mutations = [
      () => selectCell(10),
      () => applyNumberInput(solution[10]),
      () => toggleNotesMode(),
      () => undo(),
      () => pauseGame(),
      () => resumeGame(),
    ];
    for (const mutate of mutations) {
      const before = getState();
      mutate();
      assert.equal(isTimerOnlyChange(before, getState()), false, mutate.toString());
    }
  });

  test('a wrong entry (mistake count + history change) is detected', () => {
    selectCell(10);
    const before = getState();
    applyNumberInput(solution[10] === 9 ? 1 : solution[10] + 1);
    const after = getState();
    assert.equal(after.mistakes, before.mistakes + 1);
    assert.equal(isTimerOnlyChange(before, after), false);
  });
});

describe('shouldFocusSelectedCell', () => {
  test('a timer tick never moves focus', () => {
    selectCell(10);
    const before = getState();
    now += 1000;
    assert.equal(shouldFocusSelectedCell(before, getState()), false);
  });

  test('placing a digit or toggling notes leaves focus where it is', () => {
    selectCell(10);
    let before = getState();
    applyNumberInput(solution[10]);
    assert.equal(shouldFocusSelectedCell(before, getState()), false);

    before = getState();
    toggleNotesMode();
    assert.equal(shouldFocusSelectedCell(before, getState()), false);
  });

  test('moving the selection moves focus', () => {
    selectCell(10);
    const before = getState();
    selectCell(11);
    assert.equal(shouldFocusSelectedCell(before, getState()), true);
  });

  test('resuming from pause returns focus to the selected cell', () => {
    selectCell(10);
    pauseGame();
    const paused = getState();
    assert.equal(shouldFocusSelectedCell(null, paused), false, 'never while paused');
    resumeGame();
    assert.equal(shouldFocusSelectedCell(paused, getState()), true);
  });

  test('stranded focus (body, or a control just disabled) is rescued to the selected cell', () => {
    selectCell(10);
    const before = getState();
    applyNumberInput(solution[10]); // e.g. Hint/a digit button disabling itself
    assert.equal(shouldFocusSelectedCell(before, getState(), false), false);
    assert.equal(shouldFocusSelectedCell(before, getState(), true), true);

    pauseGame();
    assert.equal(shouldFocusSelectedCell(before, getState(), true), false, 'never while paused');
  });

  test('no selection means nothing to focus', () => {
    assert.equal(getState().selectedIndex, null);
    assert.equal(shouldFocusSelectedCell(null, getState()), false);
  });
});
