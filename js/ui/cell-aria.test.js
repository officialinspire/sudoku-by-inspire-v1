import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getCellAriaLabel } from './cell-aria.js';

function baseState(overrides = {}) {
  return {
    puzzle: new Array(81).fill(0),
    entries: new Array(81).fill(0),
    notes: new Array(81).fill(0),
    solution: new Array(81).fill(1),
    selectedIndex: null,
    conflicts: new Set(),
    notesMode: false,
    immediateErrorChecking: false,
    ...overrides,
  };
}

describe('getCellAriaLabel', () => {
  test('row/column math for a few indices', () => {
    assert.equal(getCellAriaLabel(0, baseState()), 'Row 1, column 1, editable, empty');
    assert.equal(getCellAriaLabel(8, baseState()), 'Row 1, column 9, editable, empty');
    assert.equal(getCellAriaLabel(9, baseState()), 'Row 2, column 1, editable, empty');
    assert.equal(getCellAriaLabel(80, baseState()), 'Row 9, column 9, editable, empty');
    assert.equal(getCellAriaLabel(40, baseState()), 'Row 5, column 5, editable, empty');
  });

  test('empty editable cell', () => {
    assert.equal(getCellAriaLabel(0, baseState()), 'Row 1, column 1, editable, empty');
  });

  test('empty editable cell with notes reports them in ascending order', () => {
    const notes = new Array(81).fill(0);
    notes[0] = (1 << 1) | (1 << 3); // digits 2 and 4
    const state = baseState({ notes });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, editable, empty, notes 2, 4');
  });

  test('fixed clue cell reports "clue" and its given value, never "editable"', () => {
    const puzzle = new Array(81).fill(0);
    puzzle[0] = 5;
    const state = baseState({ puzzle });
    const label = getCellAriaLabel(0, state);
    assert.equal(label, 'Row 1, column 1, clue, given 5');
    assert.ok(!label.includes('editable'));
  });

  test('editable cell filled correctly by the player', () => {
    const entries = new Array(81).fill(0);
    entries[0] = 7;
    const state = baseState({ entries });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, editable, entered 7');
  });

  test('a cell in state.conflicts is announced as conflicting', () => {
    const entries = new Array(81).fill(0);
    entries[0] = 7;
    const state = baseState({ entries, conflicts: new Set([0]) });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, editable, entered 7, conflicts with another cell');
  });

  test('a wrong entry is announced as conflicting when immediate error checking is on', () => {
    const entries = new Array(81).fill(0);
    entries[0] = 7;
    const solution = new Array(81).fill(1); // solution[0] = 1, entry is 7 -> wrong
    const state = baseState({ entries, solution, immediateErrorChecking: true });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, editable, entered 7, conflicts with another cell');
  });

  test('a wrong entry is NOT announced as conflicting when immediate error checking is off and it is not a peer conflict', () => {
    const entries = new Array(81).fill(0);
    entries[0] = 7;
    const solution = new Array(81).fill(1);
    const state = baseState({ entries, solution, immediateErrorChecking: false });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, editable, entered 7');
  });

  test('fixed clue cells are never reported as conflicting even if listed in conflicts', () => {
    const puzzle = new Array(81).fill(0);
    puzzle[0] = 5;
    const state = baseState({ puzzle, conflicts: new Set([0]) });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, clue, given 5');
  });

  test('selected empty editable cell adds a concise entry instruction', () => {
    const state = baseState({ selectedIndex: 0 });
    assert.equal(
      getCellAriaLabel(0, state),
      'Row 1, column 1, editable, empty, selected, press 1 through 9 to enter a value'
    );
  });

  test('selected cell in notes mode gets a notes-specific instruction', () => {
    const state = baseState({ selectedIndex: 0, notesMode: true });
    assert.equal(
      getCellAriaLabel(0, state),
      'Row 1, column 1, editable, empty, selected, press 1 through 9 to toggle a note'
    );
  });

  test('a selected fixed clue is announced as selected but gets no entry instruction', () => {
    const puzzle = new Array(81).fill(0);
    puzzle[0] = 5;
    const state = baseState({ puzzle, selectedIndex: 0 });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, clue, given 5, selected');
  });

  test('an unselected cell never includes "selected" or an instruction', () => {
    const state = baseState({ selectedIndex: 5 });
    assert.ok(!getCellAriaLabel(0, state).includes('selected'));
  });

  test('no active game (puzzle is null) treats every cell as empty and editable', () => {
    const state = baseState({ puzzle: null, entries: null, notes: null });
    assert.equal(getCellAriaLabel(0, state), 'Row 1, column 1, editable, empty');
  });
});
