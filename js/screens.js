const SCREEN_IDS = ['start', 'intro', 'menu', 'game', 'statistics', 'highscores'];

const screenElements = new Map(
  SCREEN_IDS.map((id) => [id, document.getElementById(`screen-${id}`)])
);

let currentScreen = null;

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
}

export function getCurrentScreen() {
  return currentScreen;
}
