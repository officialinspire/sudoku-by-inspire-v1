/**
 * Registers sw.js with a relative scope (subpath-safe — see sw.js's own
 * header comment) and runs the "An updated version is available" banner.
 * Registration itself is entirely best-effort: older browsers without
 * `serviceWorker` support, and any registration failure (blocked by a
 * browser setting, running from an unsupported origin, etc.), just mean
 * the app runs without offline caching or installability this session —
 * never a broken app.
 *
 * Updates are player-confirmed: a new sw.js installs in the background
 * and *waits* (it never takes over a running page on its own, which is
 * how a page used to end up running new HTML beside old modules). The
 * banner's Refresh button asks that waiting worker to activate, and the
 * page reloads once it has. That reload fires `pagehide`, where
 * js/game-persistence.js flushes any pending autosave — so an
 * in-progress game comes back intact through Continue Game.
 */

const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' };

/**
 * The update flow, kept free of DOM lookups so it's testable with fake
 * service-worker objects (js/sw-register.test.js). `container` is
 * `navigator.serviceWorker`; `showBanner` reveals the refresh prompt;
 * `reload` reloads the page.
 */
export function createUpdateFlow(container, { showBanner, reload }) {
  let registration = null;
  let playerAcceptedUpdate = false;

  // A brand-new install's clients.claim() also fires controllerchange,
  // and reloading then would just restart the intro mid-play — so only
  // reload once the player has actually asked for the update, and only
  // once even if several controllerchange events follow.
  container.addEventListener('controllerchange', () => {
    if (!playerAcceptedUpdate) return;
    playerAcceptedUpdate = false;
    reload();
  });

  // `controller` already being set means some other worker is serving
  // this page, so a newly installed one is a genuine update — not the
  // very first install, which has no "previous version" to replace.
  function promptWhenInstalled(worker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && container.controller) showBanner();
    });
  }

  return {
    track(newRegistration) {
      registration = newRegistration;
      // An update may already be waiting from an earlier visit the
      // player didn't refresh, or already installing by the time
      // register() resolved (its 'updatefound' fired before we listened).
      if (registration.waiting && container.controller) showBanner();
      if (registration.installing) promptWhenInstalled(registration.installing);
      registration.addEventListener('updatefound', () => {
        if (registration.installing) promptWhenInstalled(registration.installing);
      });
    },

    applyUpdate() {
      const waiting = registration?.waiting;
      // Nothing waiting: another tab already activated the new version
      // (this page is controlled by it already), so a reload is all
      // that's left to do.
      if (!waiting) {
        reload();
        return;
      }
      playerAcceptedUpdate = true;
      waiting.postMessage(SKIP_WAITING_MESSAGE);
    },
  };
}

export function initServiceWorker() {
  const banner = document.getElementById('update-banner');
  const refreshBtn = document.getElementById('btn-update-refresh');
  const reload = () => window.location.reload();

  if (!('serviceWorker' in navigator)) {
    refreshBtn?.addEventListener('click', reload);
    return;
  }

  const updateFlow = createUpdateFlow(navigator.serviceWorker, {
    showBanner: () => {
      if (banner) banner.hidden = false;
    },
    reload,
  });
  refreshBtn?.addEventListener('click', () => updateFlow.applyUpdate());

  // Registering after 'load' keeps the service-worker install from
  // competing with the initial page's own network requests.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => updateFlow.track(registration))
      .catch(() => {
        // No service worker this session — see module doc comment.
      });
  });
}
