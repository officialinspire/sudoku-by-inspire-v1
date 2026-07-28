const statusEl = document.getElementById('connection-status');

/**
 * Deliberately quiet by default: nothing shows while online (the
 * expected, unremarkable state), and only surfaces when there's
 * something the player actually needs to know — that they've lost the
 * network but the app (and their local save) keeps working regardless.
 */
function render() {
  if (!statusEl) return;
  const offline = !navigator.onLine;
  statusEl.hidden = !offline;
  statusEl.textContent = offline ? 'Offline — your progress still saves locally.' : '';
}

export function initConnectionStatus() {
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
}
