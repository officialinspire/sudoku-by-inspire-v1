/**
 * Service worker for offline-first behavior. Registered from
 * js/sw-register.js with scope './', so this file — and every path in it
 * — stays relative: the app must keep working at a GitHub Pages
 * repository subpath (https://user.github.io/repo/), not just at a
 * domain root. Every list entry below is resolved against SCOPE_URL.
 *
 * ---- What it guarantees ----
 * 1. One install = one complete copy of the app. The shell plus the
 *    *entire* runtime ES-module graph is fetched fresh and stored in a
 *    single all-or-nothing cache.addAll(), so an offline launch right
 *    after the very first visit has every module it imports — nothing
 *    depends on a module having been requested after this worker took
 *    control. If any required file fails, the install fails and
 *    whatever version was already running stays in charge.
 * 2. A page is served from exactly one version. index.html comes from
 *    the same cache as the modules it imports, never fresh from the
 *    network next to cached modules from an older release.
 * 3. Updates wait for the player. A new version installs in the
 *    background and then waits; js/sw-register.js shows the "Refresh"
 *    banner, and only that tap (a SKIP_WAITING message) activates it.
 *    Autosave flushes on the resulting reload (js/game-persistence.js's
 *    pagehide handler), so an in-progress game is never lost.
 * 4. Cached audio/video answer Range requests with real 206/416
 *    responses, so seeking works offline and Safari accepts the media.
 *
 * ---- Cache versioning (read this before editing) ----
 * Bump CACHE_VERSION whenever any file listed below changes — that's
 * the only thing that makes existing installs pick up a new release (the
 * changed sw.js is what the browser notices). Activation then deletes
 * this app's older caches, and only this app's.
 *
 * Adding a module? Add it to MODULE_ASSETS too. `npm run
 * validate:assets` and `npm test` both fail until you do, because a
 * missing entry would only break an offline launch after a first
 * install — long after any normal manual test would notice.
 *
 * Hard reset during development: devtools -> Application -> Service
 * Workers -> Unregister, and/or Application -> Storage -> "Clear site
 * data."
 */
const CACHE_VERSION = 'v26';

// A cache name is shared by everything on an origin — and every GitHub
// Pages project under one account is the *same* origin — so this app's
// cache names carry its own scope path, and cleanup only ever touches
// names with exactly this prefix (the old code deleted every other cache
// on the origin, including other projects').
const SCOPE_URL = self.registration.scope;
const CACHE_PREFIX = `inspire-sudoku:${new URL(SCOPE_URL).pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// Names used through v21, before names were scope-qualified. The prefix
// is unique to this app, so these are safe to delete.
const LEGACY_CACHE_NAME = /^inspire-sudoku-shell-v\d+$/;

const SHELL_ASSETS = ['./index.html', './styles.css', './manifest.webmanifest', './index.js'];

// Every module index.js imports, directly or transitively — and never a
// *.test.js file. Checked against the real import graph by
// `npm run validate:assets` and sw.test.js.
const MODULE_ASSETS = [
  './js/achievement-catalog.js',
  './js/achievement-evaluation.js',
  './js/achievement-progress.js',
  './js/achievement-store.js',
  './js/achievement-view.js',
  './js/active-game-store.js',
  './js/audio-settings.js',
  './js/audio.js',
  './js/completion.js',
  './js/data-backup.js',
  './js/game-persistence.js',
  './js/game-settings.js',
  './js/game-state.js',
  './js/high-scores-store.js',
  './js/music-player.js',
  './js/run-tracking.js',
  './js/scoring.js',
  './js/screens.js',
  './js/statistics-store.js',
  './js/storage.js',
  './js/sudoku-engine.js',
  './js/sudoku-generator.js',
  './js/sw-register.js',
  './js/theme.js',
  './js/toast-queue.js',
  './js/ui/achievement-badges.js',
  './js/ui/achievement-toasts.js',
  './js/ui/achievements-screen.js',
  './js/ui/audio-bindings.js',
  './js/ui/board-render-plan.js',
  './js/ui/board-view.js',
  './js/ui/cell-aria.js',
  './js/ui/clear-data-dialog.js',
  './js/ui/clear-difficulty-dialog.js',
  './js/ui/completion-dialog.js',
  './js/ui/connection-status.js',
  './js/ui/controls.js',
  './js/ui/data-backup-controls.js',
  './js/ui/difficulty-dialog.js',
  './js/ui/difficulty-filter.js',
  './js/ui/game-screen.js',
  './js/ui/high-scores-screen.js',
  './js/ui/hint-dialog.js',
  './js/ui/intro-video.js',
  './js/ui/menu.js',
  './js/ui/new-game-confirm-dialog.js',
  './js/ui/settings.js',
  './js/ui/start-screen.js',
  './js/ui/statistics-screen.js',
];

// Nice to have offline, never worth failing an install over — the app
// already degrades gracefully without each one (CLAUDE.md's asset
// policy). Filenames with spaces go through encodeURI() exactly as
// js/audio.js does, so both agree on one cached URL.
const OPTIONAL_ASSETS = [
  './logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './inspiresoftwareintro.mp4',
  encodeURI('./Sudoku Zen.mp3'),
  encodeURI('./Logic Flow.mp3'),
];

// One shared deadline for all optional downloads (~5 MB, mostly music).
// Browsers abandon an install that runs for several minutes — taking the
// required shell down with it — so a stalled connection must give up on
// the extras long before that. Anything that misses this window is just
// streamed from the network when online, and retried by the next
// version's install.
const OPTIONAL_ASSET_BUDGET_MS = 60_000;

const toUrl = (path) => new URL(path, SCOPE_URL).href;
const SHELL_URL = toUrl('./index.html');

// ================================================================
// INSTALL
// ================================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: 'reload' skips the browser's HTTP cache (GitHub Pages lets
      // it keep files for 10 minutes), so a release deployed moments ago
      // can't be stored here as a mix of new and stale files under the
      // new version's name. addAll() is atomic: one failure stores none.
      const required = [...SHELL_ASSETS, ...MODULE_ASSETS].map((path) => new Request(toUrl(path), { cache: 'reload' }));
      await cache.addAll(required);
      await precacheOptionalAssets(cache);
      if (await isReplacingLegacyWorker()) await self.skipWaiting();
    })()
  );
});

async function precacheOptionalAssets(cache) {
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), OPTIONAL_ASSET_BUDGET_MS);
  try {
    await Promise.all(OPTIONAL_ASSETS.map((path) => cacheIfAvailable(cache, toUrl(path), budget.signal)));
  } finally {
    clearTimeout(timer);
  }
}

async function cacheIfAvailable(cache, url, signal) {
  try {
    const response = await fetch(url, { cache: 'reload', signal });
    if (response.status === 200) await cache.put(url, response);
  } catch {
    // Missing, offline, or out of time — skip just this one asset.
  }
}

// Workers through v21 activated themselves the instant they installed,
// and the pages they served have a Refresh button that only reloads —
// which can't activate a *waiting* worker. When replacing one of those,
// keep that old contract once so its banner still works; every later
// update uses the wait-for-Refresh flow.
async function isReplacingLegacyWorker() {
  return (await caches.keys()).some((name) => LEGACY_CACHE_NAME.test(name));
}

// ================================================================
// ACTIVATE / MESSAGES
// ================================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter(isObsoleteOwnCache).map((name) => caches.delete(name)));
      // Takes control of the page that triggered a *first* install, so
      // its media requests start using this worker right away.
      await self.clients.claim();
    })()
  );
});

function isObsoleteOwnCache(name) {
  if (name === CACHE_NAME) return false;
  return name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_NAME.test(name);
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ================================================================
// FETCH
// ================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // This app's own URLs only. Same-origin isn't narrow enough: on
  // GitHub Pages every project under the account shares this origin.
  if (!request.url.startsWith(SCOPE_URL)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  } else {
    event.respondWith(handleAsset(event));
  }
});

function isShellNavigation(request) {
  const { origin, pathname } = new URL(request.url);
  const page = origin + pathname;
  return page === SCOPE_URL || page === SHELL_URL;
}

// The shell is served from the same cache as its modules. The old
// network-first approach handed a returning visitor the *new* index.html
// beside the *old* cached modules the first time they opened a fresh
// deploy; new releases now arrive through the waiting worker instead.
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  if (isShellNavigation(request)) {
    const shell = await cache.match(SHELL_URL);
    if (shell) return shell;
  }
  try {
    return await fetch(request);
  } catch {
    return (await cache.match(SHELL_URL)) ?? Response.error();
  }
}

async function handleAsset(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    const range = request.headers.get('Range');
    return range ? respondWithRange(cached, range) : cached;
  }

  try {
    const response = await fetch(request);
    // Only a complete 200 is ever stored. A media element's Range request
    // gets a 206 holding just a slice, which must never stand in for the
    // whole file (cache.put() refuses a 206 anyway). The write is
    // best-effort: a failed write must never fail the response itself.
    if (response.status === 200) {
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  } catch {
    // Offline and never cached — nothing more this worker can do.
    return Response.error();
  }
}

// ================================================================
// BYTE RANGES
// ================================================================

/**
 * Reads a Range header against a body of `size` bytes (RFC 9110 §14).
 * Returns { start, end } (inclusive) for one satisfiable byte range,
 * 'unsatisfiable' when it starts past the end, or null when the header
 * should be ignored — malformed, multiple ranges, or a unit other than
 * bytes — in which case the full 200 response is the correct answer.
 */
function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (first === '' && last === '') return null;

  if (first === '') {
    const suffixLength = Number(last);
    if (suffixLength === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(first);
  if (last !== '' && Number(last) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: last === '' ? size - 1 : Math.min(Number(last), size - 1) };
}

async function respondWithRange(cachedResponse, rangeHeader) {
  const body = await cachedResponse.clone().blob();
  const range = parseByteRange(rangeHeader, body.size);
  if (range === null) return cachedResponse;
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${body.size}` },
    });
  }
  const { start, end } = range;
  return new Response(body.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${body.size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
