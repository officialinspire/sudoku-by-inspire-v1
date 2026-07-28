import { showScreen } from '../screens.js';
import { onStateChange } from '../game-state.js';
import { DIFFICULTIES } from '../sudoku-generator.js';
import { estimateScore, formatElapsedTime, buildShareText } from '../completion.js';
import { openDifficultyDialog } from './difficulty-dialog.js';

const dialog = document.getElementById('completion-dialog');
const difficultyEl = document.getElementById('completion-difficulty');
const timeEl = document.getElementById('completion-time');
const mistakesEl = document.getElementById('completion-mistakes');
const hintsEl = document.getElementById('completion-hints');
const scoreEl = document.getElementById('completion-score');
const shareTextarea = document.getElementById('completion-share-text');
const copyBtn = document.getElementById('btn-copy-results');
const copyConfirmation = document.getElementById('copy-confirmation');
const menuBtn = document.getElementById('btn-completion-menu');
const newGameBtn = document.getElementById('btn-completion-new-game');

let previousStatus = null;

function showCompletion(state) {
  const config = DIFFICULTIES[state.difficulty];
  difficultyEl.textContent = config.label;
  timeEl.textContent = formatElapsedTime(state.elapsedSeconds);
  mistakesEl.textContent = String(state.mistakes);
  hintsEl.textContent = String(state.hintsUsed);
  scoreEl.textContent = String(estimateScore(state, config));
  shareTextarea.value = buildShareText(state, config);
  copyConfirmation.textContent = '';
  dialog.showModal();
}

export function initCompletionDialog() {
  // Announced once, exactly on the transition into 'complete' — not on
  // every render, which would reopen the dialog after a manual close.
  onStateChange((state) => {
    if (state.status === 'complete' && previousStatus !== 'complete') {
      showCompletion(state);
    }
    previousStatus = state.status;
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareTextarea.value);
      copyConfirmation.textContent = 'Copied!';
    } catch {
      // Clipboard API unavailable or permission denied — the text is
      // still selectable/copyable by hand from the visible textarea,
      // so this isn't a dead end, just a smaller convenience lost.
      shareTextarea.select();
      copyConfirmation.textContent = 'Select and copy the text above.';
    }
  });

  menuBtn.addEventListener('click', () => {
    dialog.close();
    showScreen('menu');
  });

  newGameBtn.addEventListener('click', () => {
    dialog.close();
    openDifficultyDialog();
  });
}
