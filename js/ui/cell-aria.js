/**
 * Builds the full accessible name for one board cell — the single
 * source of truth for what a screen-reader user hears when a cell
 * receives focus. Kept as a pure function (no DOM) so it's directly
 * testable, and so js/ui/board-view.js can call it fresh on every
 * render without any risk of the announced text drifting from what's
 * visually shown.
 *
 * `state` is the subset of js/game-state.js's getState() shape this
 * needs (`puzzle`, `entries`, `notes`, `solution`, `selectedIndex`,
 * `conflicts`, `notesMode`), plus `immediateErrorChecking` merged in by
 * the caller — that setting lives in js/game-settings.js, a different
 * module entirely, but this function doesn't care where its inputs
 * came from, only what shape they're in.
 */
export function getCellAriaLabel(index, state) {
  const row = Math.floor(index / 9) + 1;
  const col = (index % 9) + 1;

  const given = state.puzzle ? state.puzzle[index] : 0;
  const entry = state.entries ? state.entries[index] : 0;
  const value = given || entry;
  const isFixed = given !== 0;
  const isSelected = state.selectedIndex === index;

  const parts = [`Row ${row}, column ${col}`, isFixed ? 'clue' : 'editable'];

  if (value !== 0) {
    parts.push(isFixed ? `given ${value}` : `entered ${value}`);
  } else {
    parts.push('empty');
    const notesBitmask = state.notes ? state.notes[index] : 0;
    const noted = [];
    for (let d = 1; d <= 9; d++) {
      if (notesBitmask & (1 << (d - 1))) noted.push(d);
    }
    if (noted.length > 0) parts.push(`notes ${noted.join(', ')}`);
  }

  // Two independent ways a filled, editable cell can be "wrong": it
  // clashes with a peer (always checked), or it simply doesn't match
  // the solution and the player has immediate error checking turned on
  // (a preference, not a rule of the board) — either one is announced
  // the same way, since both mean "this needs attention."
  const isConflict = !isFixed && entry !== 0 && state.conflicts instanceof Set && state.conflicts.has(index);
  const isError =
    !isFixed &&
    entry !== 0 &&
    !!state.immediateErrorChecking &&
    Array.isArray(state.solution) &&
    entry !== state.solution[index];
  if (isConflict || isError) parts.push('conflicts with another cell');

  if (isSelected) {
    parts.push('selected');
    // A concise, genuinely useful instruction — only for the one cell
    // that would actually receive the next keypress, and only when
    // there's something to instruct (a fixed clue can't be typed into).
    if (!isFixed) {
      parts.push(state.notesMode ? 'press 1 through 9 to toggle a note' : 'press 1 through 9 to enter a value');
    }
  }

  return parts.join(', ');
}
