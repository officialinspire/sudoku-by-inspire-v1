import { getState, onStateChange, selectCell, getPeerIndices } from '../game-state.js';
import { getGameSettings, onGameSettingsChange } from '../game-settings.js';
import { getCellAriaLabel } from './cell-aria.js';

const boardEl = document.getElementById('board');
const timerEl = document.getElementById('game-timer');
const mistakesEl = document.getElementById('game-mistakes');
const hintsEl = document.getElementById('game-hints');
const difficultyEl = document.getElementById('game-difficulty-label');
const notesToggleBtn = document.getElementById('btn-notes-toggle');
const hintBtn = document.getElementById('btn-hint');
const pauseOverlay = document.getElementById('pause-overlay');

const cells = [];

function buildBoard() {
  for (let index = 0; index < 81; index++) {
    const row = Math.floor(index / 9);
    const col = index % 9;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(index);
    cell.setAttribute('role', 'gridcell');
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

  const related = hasGame && state.selectedIndex !== null ? new Set(getPeerIndices(state.selectedIndex)) : null;
  const selectedValue =
    hasGame && state.selectedIndex !== null
      ? state.puzzle[state.selectedIndex] || state.entries[state.selectedIndex]
      : 0;
  const ariaState = { ...state, immediateErrorChecking };

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

    el.classList.toggle('is-fixed', isFixed);
    el.classList.toggle('is-selected', isSelected);
    el.classList.toggle('is-related', isRelated);
    el.classList.toggle('is-match', isMatch);
    el.classList.toggle('is-conflict', isConflict);
    el.disabled = !hasGame;
    el.setAttribute('aria-selected', String(isSelected));

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
    } else {
      valueEl.textContent = '';
      valueEl.hidden = true;
      notesEl.hidden = notesBitmask === 0;
    }

    el.setAttribute('aria-label', getCellAriaLabel(index, ariaState));
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

  if (pauseOverlay) pauseOverlay.hidden = state.status !== 'paused';
}

export function initBoardView() {
  buildBoard();
  onStateChange(render);
  onGameSettingsChange(() => render(getState()));
  render(getState());
}
