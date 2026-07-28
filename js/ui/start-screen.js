const startScreen = document.getElementById('screen-start');

/**
 * Wires up the Start screen so any of a click, a tap, or a keypress
 * advances the app forward, calling `onAdvance` exactly once.
 */
export function initStartScreen(onAdvance) {
  function advance() {
    startScreen.removeEventListener('click', advance);
    document.removeEventListener('keydown', advance);
    onAdvance();
  }

  startScreen.addEventListener('click', advance);
  document.addEventListener('keydown', advance);
}
