/**
 * Pure decisions behind js/ui/board-view.js's render: how much of the
 * board a state change actually needs repainted, and whether keyboard
 * focus should move. Kept DOM-free (like js/ui/cell-aria.js) so both are
 * directly testable in Node.
 *
 * Both rely on js/game-state.js updating state immutably: a mutation
 * replaces only the arrays it touches (`entries`, `notes`, `history`…)
 * with fresh copies, and getState() spreads those same references into
 * every snapshot. So "did anything besides the clock change?" is a
 * per-field identity check, never a deep compare of 81-element arrays.
 * board-render-plan.test.js pins that assumption against the real
 * game-state module, so a future change that breaks it fails a test
 * instead of silently freezing the board.
 */

// Every snapshot field the board, toolbar, and number pad render from —
// except `elapsedSeconds` (the one thing a timer tick changes) and
// `conflicts` (a brand-new Set on every getState() call, but derived
// purely from `puzzle` + `entries`, which are both listed here).
const BOARD_FIELDS = [
  'puzzle',
  'solution',
  'entries',
  'notes',
  'selectedIndex',
  'status',
  'notesMode',
  'mistakes',
  'hintsUsed',
  'history',
  'difficulty',
];

/**
 * True when `next` differs from `previous` only in elapsed time — i.e.
 * the once-a-second timer tick — so only the clock needs repainting.
 * Always false for the very first render (`previous` is null).
 */
export function isTimerOnlyChange(previous, next) {
  if (!previous) return false;
  return BOARD_FIELDS.every((field) => previous[field] === next[field]);
}

/**
 * Focus follows the selected cell only when the player just moved the
 * selection (arrow keys, a click, undo jumping back), just resumed from
 * pause (focus was on the overlay's Resume button, which is now hidden),
 * or focus has been stranded — `focusIsStranded` is the DOM layer's
 * "nothing usable has focus": the page body, or a control this very
 * render just disabled (Hint once its cell is solved, a number-pad digit
 * once all nine are placed). Any other render — a timer tick, a digit
 * placed from the number pad, Notes toggled, a dialog closing — must
 * leave focus where the player put it.
 */
export function shouldFocusSelectedCell(previous, next, focusIsStranded = false) {
  if (next.status !== 'playing' || next.selectedIndex === null) return false;
  const selectionMoved = !previous || previous.selectedIndex !== next.selectedIndex;
  const justResumed = previous?.status === 'paused';
  return selectionMoved || justResumed || focusIsStranded;
}
