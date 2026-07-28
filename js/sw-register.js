/**
 * Registers sw.js with a relative scope (subpath-safe — see sw.js's own
 * header comment) and wires the small in-page "Update available" banner
 * that appears when a new service worker has installed alongside an
 * already-active one. Registration itself is entirely best-effort: older
 * browsers without `serviceWorker` support, and any registration failure
 * (blocked by a browser setting, running from an unsupported origin,
 * etc.), just mean the app runs without offline caching or installability
 * this session — never a broken app.
 */

const banner = document.getElementById('update-banner');
const refreshBtn = document.getElementById('btn-update-refresh');

function showUpdateBanner() {
  if (banner) banner.hidden = false;
}

export function initServiceWorker() {
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => window.location.reload());
  }

  if (!('serviceWorker' in navigator)) return;

  // Registering after 'load' keeps the service-worker install from
  // competing with the initial page's own network requests.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // `controller` already being set means some other service
            // worker was already active before this one finished
            // installing — i.e. this is a genuine update, not the
            // page's very first install (which has no banner-worthy
            // "previous version" to compare against).
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch(() => {
        // No service worker this session — see module doc comment.
      });
  });
}
