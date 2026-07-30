import { getCurrentScreen } from '../screens.js';
import {
  applyNumberInput,
  eraseSelectedCell,
  toggleNotesMode,
  moveSelection,
  undo,
  pauseGame,
  resumeGame,
  suspendTimer,
  resumeTimer,
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

  // A backgrounded tab shouldn't cost the player time (or expose their
  // in-progress board in a screenshot/preview thumbnail while they're
  // away) — suspend the timer's "hidden" reason on visibilitychange
  // rather than fully pausing (no overlay pop-up just from switching
  // tabs, which would be a jarring surprise for a brief glance away).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendTimer('hidden');
    else resumeTimer('hidden');
  });

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

  // pause-overlay isn't a native <dialog>, so it gets none of the
  // browser's built-in modal focus-trapping for free — without this, a
  // keyboard user tabbing past the Resume button (the overlay's only
  // focusable element) would land back on the board underneath, which
  // is supposed to read as inert while paused (it's marked
  // role="dialog" aria-modal="true" in index.html; this is what makes
  // that claim actually true instead of aspirational). Resume already
  // has focus the instant the overlay opens (js/ui/board-view.js), so
  // simply blocking Tab/Shift+Tab from moving focus at all is a
  // complete trap for this single-control case — nowhere else inside
  // the dialog for focus to usefully go anyway.
  pauseOverlay.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') event.preventDefault();
  });
}
