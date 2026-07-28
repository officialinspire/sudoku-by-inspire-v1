const SCREEN_IDS = ['start', 'intro', 'menu', 'game', 'statistics', 'highscores'];

const screenElements = new Map(
  SCREEN_IDS.map((id) => [id, document.getElementById(`screen-${id}`)])
);

let currentScreen = null;
const listeners = new Set();

export function showScreen(id) {
  if (!screenElements.has(id)) {
    throw new Error(`Unknown screen: "${id}"`);
  }

  for (const [screenId, el] of screenElements) {
    const isActive = screenId === id;
    el.hidden = !isActive;
    el.classList.toggle('is-active', isActive);
  }

  currentScreen = id;

  // tabindex="-1" on each section (see index.html) makes this a valid
  // focus target without adding it to the normal tab order.
  screenElements.get(id).focus();

  for (const listener of listeners) listener(id);
}

export function getCurrentScreen() {
  return currentScreen;
}

// Lets other modules react to screen changes without themselves calling
// showScreen — e.g. js/audio.js uses this to pick which background music
// track should be playing, without game-state.js or screens.js needing
// to know anything about audio.
export function onScreenChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
