import { useHint, suspendTimer, resumeTimer } from '../game-state.js';

const dialog = document.getElementById('hint-dialog');
const hintBtn = document.getElementById('btn-hint');

export function initHintDialog() {
  dialog.addEventListener('close', () => {
    resumeTimer('dialog');
    if (dialog.returnValue === 'confirm') useHint();
  });

  hintBtn.addEventListener('click', () => {
    suspendTimer('dialog');
    dialog.showModal();
  });
}
