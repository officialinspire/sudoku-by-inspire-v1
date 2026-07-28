import { playClick } from '../audio.js';

/**
 * One delegated listener for the generic "button tap" sound, instead of
 * wiring a playClick() call into every button handler across every UI
 * module individually. Board cells (`.cell`) are excluded — they already
 * get their own, distinct 'select' sound from js/audio.js's game-state
 * diffing whenever the selected cell actually changes, and playing both
 * on the same tap would just be a doubled-up sound.
 */
export function initAudioBindings() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.classList.contains('cell')) return;
    playClick();
  });
}
