import { getCurrentScreen } from '../screens.js';
import {
  applyNumberInput,
  eraseSelectedCell,
  toggleNotesMode,
  moveSelection,
  undo,
  pauseGame,
  resumeGame,
  getState,
} from '../game-state.js';

const numberPad = document.getElementById('number-pad');
const notesToggleBtn = document.getElementById('btn-notes-toggle');
const eraseBtn = document.getElementById('btn-erase');
const resumeBtn = document.getElementById('btn-resume');
const pauseOverlay = document.getElementById('pause-overlay');

function isGameScreenActive() {
  return getCurrentScreen() === 'game';
}

function isTypingInFormField() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

function handleKeydown(event) {
  if (!isGameScreenActive() || isTypingInFormField()) return;

  // A dialog being open (Settings, difficulty picker) means the browser
  // already owns Escape (native close) and focus trapping — don't
  // compete with it or act on game keys underneath it.
  if (document.querySelector('dialog[open]')) return;

  const { key, ctrlKey, metaKey } = event;

  if (key >= '1' && key <= '9') {
    event.preventDefault();
    applyNumberInput(Number(key));
    return;
  }

  if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault();
    eraseSelectedCell();
    return;
  }

  if (key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(-1, 0);
    return;
  }
  if (key === 'ArrowDown') {
    event.preventDefault();
    moveSelection(1, 0);
    return;
  }
  if (key === 'ArrowLeft') {
    event.preventDefault();
    moveSelection(0, -1);
    return;
  }
  if (key === 'ArrowRight') {
    event.preventDefault();
    moveSelection(0, 1);
    return;
  }

  if (key === 'n' || key === 'N') {
    event.preventDefault();
    toggleNotesMode();
    return;
  }

  // Not in the phase's required control list, but built alongside a
  // fully working undo mechanism in game-state.js (required by name) —
  // leaving it wired to nothing reachable would be a half-finished
  // feature. Standard, low-risk binding, no new UI chrome needed.
  if ((ctrlKey || metaKey) && (key === 'z' || key === 'Z')) {
    event.preventDefault();
    undo();
    return;
  }

  if (key === 'Escape') {
    const state = getState();
    if (state.status === 'playing') {
      event.preventDefault();
      pauseGame();
    } else if (state.status === 'paused') {
      event.preventDefault();
      resumeGame();
    }
  }
}

export function initControls() {
  document.addEventListener('keydown', handleKeydown);

  // Event delegation for the number pad: one listener for all 9 digit
  // buttons rather than 9 separate handlers.
  numberPad.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-digit]');
    if (!btn) return;
    applyNumberInput(Number(btn.dataset.digit));
  });

  eraseBtn.addEventListener('click', () => eraseSelectedCell());
  notesToggleBtn.addEventListener('click', () => toggleNotesMode());
  resumeBtn.addEventListener('click', () => resumeGame());
  pauseOverlay.addEventListener('click', () => resumeGame());
}
