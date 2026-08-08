import { suspendTimer, resumeTimer } from '../game-state.js';

/**
 * One shared confirm dialog for "clear just this difficulty's
 * statistics/high scores," opened from either js/ui/statistics-screen.js
 * or js/ui/high-scores-screen.js — the two call sites want the exact
 * same shape of confirmation (a message naming what's about to be
 * cleared, Cancel/Confirm), just with different wording and a different
 * store to actually clear, so this owns the dialog element and lets
 * each caller supply both rather than duplicating dialog markup and
 * open/close wiring per screen.
 */
const dialog = document.getElementById('clear-difficulty-confirm-dialog');
const titleEl = document.getElementById('clear-difficulty-confirm-title');
const messageEl = document.getElementById('clear-difficulty-confirm-message');

let pendingAction = null;

export function initClearDifficultyDialog() {
  dialog.addEventListener('close', () => {
    resumeTimer('dialog');
    if (dialog.returnValue === 'confirm' && pendingAction) pendingAction();
    pendingAction = null;
  });
}

/**
 * @param {string} title - dialog heading, e.g. "Clear Easy Statistics?"
 * @param {string} message - body text naming exactly what gets cleared
 * @param {() => void} onConfirm - runs only if the player confirms
 */
export function openClearDifficultyDialog(title, message, onConfirm) {
  titleEl.textContent = title;
  messageEl.textContent = message;
  pendingAction = onConfirm;
  suspendTimer('dialog');
  dialog.showModal();
}
