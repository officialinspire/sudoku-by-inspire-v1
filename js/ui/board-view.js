import { getState, onStateChange, selectCell, getPeerIndices } from '../game-state.js';
import { getGameSettings, onGameSettingsChange } from '../game-settings.js';
import { getCellAriaLabel } from './cell-aria.js';

const boardEl = document.getElementById('board');
const timerEl = document.getElementById('game-timer');
const mistakesEl = document.getElementById('game-mistakes');
const hintsEl = document.getElementById('game-hints');
const difficultyEl = document.getElementById('game-difficulty-label');
const notesToggleBtn = document.getElementById('btn-notes-toggle');
const undoBtn = document.getElementById('btn-undo');
const hintBtn = document.getElementById('btn-hint');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('btn-resume');
const numberPadEl = document.getElementById('number-pad');
const numberButtons = numberPadEl ? Array.from(numberPadEl.querySelectorAll('.number-btn')) : [];

const cells = [];

// Tracks which puzzle the board is currently showing (by array
// identity) so the one-shot feedback animations below know when a
// render is the *first* paint of a (re)started or restored game —
// every cell's value technically "changes" from whatever the DOM
// happened to hold before, and animating all 81 of them at once would
// read as a broken flash rather than the intended one-cell feedback.
let lastPuzzleRef = null;
let suppressEntryFeedback = true;

// Restarts a CSS animation from its beginning even if the element
// already has the class (and therefore may already be mid-animation) —
// removing the class, forcing a reflow, then re-adding it is the
// standard way to do this without any JS-side timing/delay.
function retriggerAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function buildBoard() {
  for (let index = 0; index < 81; index++) {
    const row = Math.floor(index / 9);
    const col = index % 9;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(index);
    // No role="gridcell" here, and #board (index.html) is role="group",
    // not role="grid" — an ARIA grid requires each gridcell to sit
    // inside a role="row" ancestor (a real WCAG failure axe-core flags
    // as critical: "aria-required-parent"), and this board doesn't have
    // that structure. It also doesn't implement the roving-tabindex
    // keyboard pattern a real ARIA grid promises (every cell is
    // independently tabbable here; Up/Down/Left/Right just move
    // selection, not a full grid navigation model) — so claiming the
    // grid role would promise more than this widget delivers. Each
    // cell's rich aria-label (js/ui/cell-aria.js) already announces its
    // row/column/box context in plain language, which is what the grid
    // role would otherwise exist to convey.
    if (col % 3 === 0 && col !== 0) cell.classList.add('grid-line-left');
    if (row % 3 === 0 && row !== 0) cell.classList.add('grid-line-top');

    const valueEl = document.createElement('span');
    valueEl.className = 'cell-value';
    cell.appendChild(valueEl);

    const notesEl = document.createElement('span');
    notesEl.className = 'cell-notes';
    const noteDigits = [];
    for (let d = 1; d <= 9; d++) {
      const noteDigitEl = document.createElement('span');
      noteDigitEl.className = 'cell-note-digit';
      notesEl.appendChild(noteDigitEl);
      noteDigits.push(noteDigitEl);
    }
    cell.appendChild(notesEl);

    boardEl.appendChild(cell);
    cells.push({ el: cell, valueEl, notesEl, noteDigits });
  }

  // Event delegation: one click listener for all 81 cells instead of
  // 81 separate handlers. The clicked cell is identified from the
  // event target at click time, not by which listener fired.
  boardEl.addEventListener('click', (event) => {
    const cellEl = event.target.closest('.cell');
    if (!cellEl) return;
    selectCell(Number(cellEl.dataset.index));
  });
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function render(state) {
  const hasGame = state.puzzle !== null;
  const { immediateErrorChecking } = getGameSettings();
  boardEl.classList.toggle('is-empty', !hasGame);

  if (state.puzzle !== lastPuzzleRef) {
    lastPuzzleRef = state.puzzle;
    suppressEntryFeedback = true;
  }

  const related = hasGame && state.selectedIndex !== null ? new Set(getPeerIndices(state.selectedIndex)) : null;
  const selectedValue =
    hasGame && state.selectedIndex !== null
      ? state.puzzle[state.selectedIndex] || state.entries[state.selectedIndex]
      : 0;
  const ariaState = { ...state, immediateErrorChecking };
  numberPadEl?.classList.toggle('is-notes-mode', state.notesMode);

  // Correctly-placed count per digit (1-9), tallied alongside the main
  // per-cell loop below rather than in a second pass over the board —
  // this is what tells the number pad a digit is "done" afterward.
  const correctDigitCounts = new Array(10).fill(0);

  for (let index = 0; index < 81; index++) {
    const { el, valueEl, notesEl, noteDigits } = cells[index];
    const given = hasGame ? state.puzzle[index] : 0;
    const entry = hasGame ? state.entries[index] : 0;
    const value = given || entry;
    const isFixed = given !== 0;
    const isSelected = state.selectedIndex === index;
    const isRelated = !isSelected && related !== null && related.has(index);
    const isMatch = !isSelected && selectedValue !== 0 && value === selectedValue;
    const isConflict = !isFixed && entry !== 0 && state.conflicts.has(index);
    const isError = immediateErrorChecking && !isFixed && entry !== 0 && entry !== state.solution[index];

    if (value !== 0 && value === state.solution[index]) correctDigitCounts[value]++;

    el.classList.toggle('is-fixed', isFixed);
    el.classList.toggle('is-selected', isSelected);
    el.classList.toggle('is-related', isRelated);
    el.classList.toggle('is-match', isMatch);
    el.classList.toggle('is-conflict', isConflict);
    el.disabled = !hasGame;
    // No aria-selected here (it's only a supported state on roles like
    // gridcell/option/row/tab — invalid, and axe-core flags it, on a
    // plain button). "Selected" is already announced as plain text by
    // getCellAriaLabel below whenever this cell is selected, which is
    // both valid and, unlike a boolean state a screen reader would
    // announce out of context, actually meaningful on its own.

    // Captured before this render overwrites them below, so the two
    // one-shot feedback effects further down can tell "just changed"
    // from "already was this way" — a brief settle-in pulse the moment
    // a value actually appears/changes in a cell, and a brief shake the
    // moment a cell first becomes wrong (not on every render while it
    // simply *stays* wrong, which would be repeated flashing).
    const previousText = valueEl.textContent;
    const wasError = valueEl.classList.contains('is-error');

    // Note-digit text is always derived from state.notes[index], even
    // while the cell is showing a real value and the notes container is
    // hidden — otherwise a cell that had notes, then got a value
    // entered, would keep stale note text sitting in the DOM (correctly
    // invisible today, but no longer actually reflecting state, which
    // is exactly what "derive from state" is meant to rule out).
    const notesBitmask = hasGame ? state.notes[index] : 0;
    for (let d = 1; d <= 9; d++) {
      noteDigits[d - 1].textContent = notesBitmask & (1 << (d - 1)) ? String(d) : '';
    }

    if (value !== 0) {
      valueEl.textContent = String(value);
      valueEl.classList.toggle('is-error', isError);
      valueEl.hidden = false;
      notesEl.hidden = true;

      if (!suppressEntryFeedback && previousText !== String(value)) {
        retriggerAnimation(valueEl, 'is-value-enter');
      }
    } else {
      valueEl.textContent = '';
      valueEl.hidden = true;
      notesEl.hidden = notesBitmask === 0;
    }

    if (!suppressEntryFeedback && isError && !wasError) {
      retriggerAnimation(el, 'is-shake');
    }

    el.setAttribute('aria-label', getCellAriaLabel(index, ariaState));
  }

  suppressEntryFeedback = false;

  // Number pad: highlight the button matching the selected cell's
  // current value (mirrors the board's own "matching number" cells, so
  // the same digit is easy to spot both on the board and on the pad).
  // A digit whose 9 correct instances are all already on the board gets
  // marked complete and disabled — not just cosmetic: once a digit fills
  // all 9 of its required cells, every remaining empty cell already
  // shares a row, column, or box with one of them, so no further
  // placement of that digit can ever be valid again. Disabling it here
  // only guards the number pad itself; keyboard digit entry is
  // unaffected and still registers as an ordinary mistake if attempted,
  // same as any other invalid placement.
  for (const btn of numberButtons) {
    const digit = Number(btn.dataset.digit);
    const isComplete = hasGame && correctDigitCounts[digit] === 9;
    btn.classList.toggle('is-current-value', selectedValue !== 0 && digit === selectedValue);
    btn.classList.toggle('is-complete', isComplete);
    btn.disabled = isComplete;
  }

  // Keep DOM focus following the selected cell (arrow-key navigation
  // moves selection; this is what makes the browser's focus ring move
  // with it). A no-op when the selected cell already has focus, which
  // covers the common case of a render triggered by something other
  // than a selection change (e.g. placing a digit).
  if (hasGame && state.selectedIndex !== null) {
    const selectedEl = cells[state.selectedIndex].el;
    if (document.activeElement !== selectedEl) selectedEl.focus();
  }

  if (difficultyEl) {
    difficultyEl.textContent = state.difficulty
      ? state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1)
      : '—';
  }
  if (timerEl) timerEl.textContent = formatTime(state.elapsedSeconds);
  if (mistakesEl) mistakesEl.textContent = String(state.mistakes);
  if (hintsEl) hintsEl.textContent = String(state.hintsUsed);

  if (notesToggleBtn) {
    notesToggleBtn.setAttribute('aria-pressed', String(state.notesMode));
    notesToggleBtn.textContent = state.notesMode ? 'Notes: On' : 'Notes: Off';
  }

  if (undoBtn) {
    // Mirrors undo()'s own no-op guard in js/game-state.js exactly
    // (playing + non-empty history) — the button is never enabled for a
    // tap that would do nothing.
    undoBtn.disabled = !hasGame || state.status !== 'playing' || state.history.length === 0;
  }

  if (hintBtn) {
    // Nothing to hint without a selected, editable, still-incorrect
    // cell — computed from state, never by reading (or writing) the
    // solution into any DOM attribute a player could inspect to cheat.
    const selectedIndex = state.selectedIndex;
    const canHint =
      hasGame &&
      state.status === 'playing' &&
      selectedIndex !== null &&
      state.puzzle[selectedIndex] === 0 &&
      state.entries[selectedIndex] !== state.solution[selectedIndex];
    hintBtn.disabled = !canHint;
  }

  if (pauseOverlay) {
    const shouldShow = state.status === 'paused';
    const wasHidden = pauseOverlay.hidden;
    pauseOverlay.hidden = !shouldShow;
    // Move focus onto the overlay's own Resume button the moment it
    // actually appears (not the pause-overlay itself, which isn't
    // focusable) — otherwise keyboard focus stays on the now-hidden
    // board cell behind it, same gap a native <dialog> avoids
    // automatically via showModal(). Runs after the "follow the
    // selected cell" focus call above, so it correctly wins.
    if (shouldShow && wasHidden && resumeBtn) resumeBtn.focus();
  }
}

export function initBoardView() {
  buildBoard();
  onStateChange(render);
  onGameSettingsChange(() => render(getState()));
  render(getState());
}
