/**
 * Service worker for offline-first behavior. Registered from
 * js/sw-register.js with a relative scope, so this file — and every path
 * inside it — must stay relative too, or the app breaks the moment it's
 * hosted at a GitHub Pages repository subpath instead of a domain root.
 *
 * ---- Cache versioning (read this before editing) ----
 * CACHE_NAME below is the *only* thing that controls whether a visitor's
 * browser treats this as "the same cache" or "a new one to switch to."
 * There is no automatic hashing of file contents — bump the version
 * suffix by hand (`...-v1` -> `...-v2`) any time a core app-shell file
 * changes and you want existing installs to actually pick up the new
 * version. The activate handler below deletes every cache that isn't the
 * current CACHE_NAME, so bumping it is both how you invalidate stale
 * content AND how old caches get cleaned up — no separate cleanup step
 * needed.
 *
 * To clear/update a stale cache during development: bump CACHE_NAME and
 * reload (the new service worker installs, activates, and evicts the old
 * cache automatically — see js/sw-register.js for the in-app "Refresh"
 * prompt this triggers). For a hard manual reset instead: browser
 * devtools -> Application -> Service Workers -> Unregister, and/or
 * Application -> Storage -> "Clear site data."
 */
const CACHE_NAME = 'inspire-sudoku-shell-v8';

// The minimum set of files the app cannot boot without. Listed
// explicitly and installed with cache.addAll(), which is all-or-nothing:
// if any single one of these 404s, the whole install() rejects and this
// service worker simply fails to install (the browser falls back to
// whatever was controlling the page before, or no service worker at all
// on a first visit) — appropriate here, since a missing core file means
// something is genuinely broken and installing a service worker that
// can't actually serve the app offline would be worse than not
// installing one. Every other same-origin file (all of js/**) is picked
// up organically by the fetch handler's runtime cache-fill the first
// time it's actually requested, rather than hand-duplicated in a second
// list here that would silently drift out of date as new modules are
// added in future phases.
const CORE_ASSETS = ['./', './index.html', './index.js', './styles.css', './manifest.webmanifest'];

// Root assets the user supplies (see CLAUDE.md's asset policy) that are
// nice to have offline but must never block installation if absent — the
// two named music tracks in particular are *expected* to be missing
// until supplied (see js/audio.js). Each is fetched and cached
// independently in the loop below specifically so one 404 can't take the
// others down with it the way cache.addAll() would. Filenames with
// spaces are passed through encodeURI() the same way js/audio.js does,
// so both agree on the exact same cached request URL.
const OPTIONAL_ROOT_ASSETS = [
  './inspiresoftwareintro.mp4',
  './logo.png',
  encodeURI('./Sudoku Zen.mp3'),
  encodeURI('./Logic Flow.mp3'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);

      await Promise.all(
        OPTIONAL_ROOT_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) await cache.put(url, response);
          } catch {
            // Absent/unreachable optional asset — not an installation
            // failure, just nothing to precache for it this session.
          }
        })
      );

      // Take over from any previously-waiting service worker as soon as
      // this one finishes installing, rather than waiting for every open
      // tab of the old version to close first — paired with the update
      // notification in js/sw-register.js, which tells the user to
      // refresh so their already-loaded page picks up the new version.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is cacheable/meaningful to intercept; anything else (there
  // is nothing else in this app today, but defensively) passes straight
  // through to the network untouched.
  if (request.method !== 'GET') return;

  // Never touch cross-origin requests — this app has zero runtime CDN
  // dependencies by design (see CLAUDE.md), so in normal operation there
  // shouldn't be any, but a request this service worker doesn't
  // recognize as "ours" is exactly the kind it should leave completely
  // alone rather than guess about.
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigations (loading/reloading the page itself) go network-first:
  // an online visitor should always get the current index.html, with the
  // cached app shell only as an offline/failure fallback — the opposite
  // priority from the "cache-first" static assets below, where a
  // slightly stale cached copy is an acceptable, expected tradeoff until
  // CACHE_NAME is next bumped.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./index.html')) ?? Response.error();
        }
      })()
    );
    return;
  }

  // Everything else same-origin: cache-first, filling the cache on a
  // miss from whatever the network returns. This is what lets every
  // js/**.js module get cached automatically after the first real visit
  // without needing to be hand-listed in CORE_ASSETS above.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        // Offline and not already cached — nothing more this worker can
        // do for a request that was never seen before going offline.
        return Response.error();
      }
    })()
  );
});
