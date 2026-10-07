/**
 * Runs the real sw.js source in Node against a fake CacheStorage and a
 * fake network that serves this repo's own files from an app scope at a
 * GitHub-Pages-style subpath. The fakes mirror the two Cache API rules
 * this worker depends on: addAll() is all-or-nothing, and put() refuses
 * a 206 partial response.
 */
import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAssets } from './scripts/validate-assets.js';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const SCOPE = 'https://example.test/sudoku-by-inspire-v1/';
const swSource = readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');
const CACHE_VERSION = /const CACHE_VERSION = '([^']+)'/.exec(swSource)[1];
const CACHE_NAME = `inspire-sudoku:/sudoku-by-inspire-v1/:${CACHE_VERSION}`;
const OPTIONAL_BUDGET_MS = Number(/OPTIONAL_ASSET_BUDGET_MS = ([\d_]+)/.exec(swSource)[1].replaceAll('_', ''));

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.md': 'text/markdown',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

const repoFile = (relative) => readFileSync(path.join(repoRoot, relative));

// ------------------------------------------------------------- fakes

/** Serves repo files (with GitHub-Pages-like Range support) unless a route overrides a path. */
function createNetwork(routes = {}) {
  const network = { routes, requests: [], offline: false };
  network.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const request = input instanceof Request && !init ? input : new Request(url, init);
    network.requests.push(request);
    if (network.offline) throw new TypeError('Failed to fetch (offline)');

    const relative = decodeURIComponent(new URL(request.url).pathname.slice(new URL(SCOPE).pathname.length));
    if (routes[relative]) return routes[relative](request);
    const file = path.join(repoRoot, relative);
    if (!relative || !existsSync(file) || statSync(file).isDirectory()) return new Response('Not Found', { status: 404 });

    const bytes = readFileSync(file);
    const headers = { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('Range') ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] === '' ? bytes.length - 1 : Math.min(Number(range[2]), bytes.length - 1);
      return new Response(bytes.subarray(start, end + 1), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
      });
    }
    return new Response(bytes, { status: 200, headers });
  };
  return network;
}

const cacheKey = (request) => (typeof request === 'string' ? request : request.url).split('#')[0];

class FakeCache {
  constructor(storage) {
    this.storage = storage;
    this.entries = new Map();
  }

  async match(request) {
    return this.entries.get(cacheKey(request))?.clone();
  }

  async put(request, response) {
    if (response.status === 206) throw new TypeError('Partial response (status code 206) is unsupported');
    const body = await response.arrayBuffer(); // like the real thing, consumes the body (and fails if it errors)
    this.entries.set(cacheKey(request), new Response(body, { status: response.status, headers: response.headers }));
  }

  async addAll(requests) {
    const responses = await Promise.all(requests.map((request) => this.storage.fetch(request)));
    if (responses.some((response) => !response.ok || response.status === 206)) throw new TypeError('addAll: a request failed');
    const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()));
    requests.forEach((request, i) => {
      this.entries.set(cacheKey(request), new Response(bodies[i], { status: 200, headers: responses[i].headers }));
    });
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

class FakeCacheStorage {
  constructor() {
    this.caches = new Map();
  }

  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(this));
    return this.caches.get(name);
  }

  async keys() {
    return [...this.caches.keys()];
  }

  async delete(name) {
    return this.caches.delete(name);
  }
}

/** Evaluates sw.js with fakes for its globals; returns event dispatchers. */
function startServiceWorker({ network = createNetwork(), cacheStorage = new FakeCacheStorage() } = {}) {
  cacheStorage.fetch = network.fetch;
  const listeners = new Map();
  const self = {
    registration: { scope: SCOPE },
    location: new URL('sw.js', SCOPE),
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: mock.fn(async () => {}),
    clients: { claim: mock.fn(async () => {}) },
  };
  new Function('self', 'caches', 'fetch', swSource)(self, cacheStorage, network.fetch);

  async function dispatchExtendable(type, props = {}) {
    const pending = [];
    listeners.get(type)({ ...props, waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  }

  return {
    self,
    network,
    cacheStorage,
    install: () => dispatchExtendable('install'),
    activate: () => dispatchExtendable('activate'),
    message: (data) => dispatchExtendable('message', { data }),
    /** Resolves to the worker's Response, or null if it didn't intercept. */
    async fetch(request) {
      const pending = [];
      let responded = null;
      listeners.get('fetch')({ request, respondWith: (promise) => (responded = promise), waitUntil: (promise) => pending.push(promise) });
      if (!responded) return null;
      const response = await responded;
      await Promise.all(pending);
      return response;
    },
    async cachedUrls() {
      return (await (await cacheStorage.open(CACHE_NAME)).keys()).map((request) => request.url);
    },
  };
}

const assetRequest = (relative, headers = {}) => new Request(SCOPE + relative, { headers });
// The Request constructor refuses mode 'navigate', so navigations are plain objects.
const navigationRequest = (url) => ({ method: 'GET', url, mode: 'navigate', headers: new Headers() });
const flushIO = async (rounds = 20) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve));
};

afterEach(() => mock.timers.reset());

// ------------------------------------------------------------- install

describe('install', () => {
  test('precaches the shell and the entire runtime module graph, and no test files', async () => {
    const sw = startServiceWorker();
    await sw.install();
    const cached = await sw.cachedUrls();

    const runtimeModules = validateAssets(repoRoot).modules.map((module) => module.split(path.sep).join('/'));
    assert.ok(runtimeModules.length > 30, 'sanity: the graph was actually found');
    for (const file of [...runtimeModules, 'index.html', 'styles.css', 'manifest.webmanifest']) {
      assert.ok(cached.includes(SCOPE + file), `${file} should be precached`);
    }
    assert.deepEqual(cached.filter((url) => url.endsWith('.test.js')), []);
    assert.deepEqual(await sw.cacheStorage.keys(), [CACHE_NAME]);
  });

  test('fetches every precached file fresh, bypassing the HTTP cache', async () => {
    const sw = startServiceWorker();
    await sw.install();
    assert.ok(sw.network.requests.length > 40);
    assert.deepEqual(sw.network.requests.filter((request) => request.cache !== 'reload').map((r) => r.url), []);
  });

  test('a missing required module fails the whole install and stores none of it', async () => {
    const sw = startServiceWorker({ network: createNetwork({ 'js/ui/menu.js': () => new Response('gone', { status: 404 }) }) });
    await assert.rejects(sw.install());
    assert.deepEqual(await sw.cachedUrls(), []);
    assert.equal(sw.self.skipWaiting.mock.callCount(), 0);
  });

  test('optional assets are cached independently: a 404 or network error skips only that asset', async () => {
    const network = createNetwork({
      'Sudoku Zen.mp3': () => new Response('Not Found', { status: 404 }),
      'logo.png': () => Promise.reject(new TypeError('connection reset')),
    });
    const sw = startServiceWorker({ network });
    await sw.install();
    const cached = await sw.cachedUrls();
    assert.ok(cached.includes(`${SCOPE}Logic%20Flow.mp3`));
    assert.ok(cached.includes(`${SCOPE}inspiresoftwareintro.mp4`));
    assert.ok(cached.includes(`${SCOPE}icons/icon-512.png`));
    assert.ok(!cached.includes(`${SCOPE}Sudoku%20Zen.mp3`));
    assert.ok(!cached.includes(`${SCOPE}logo.png`));
  });

  // The timeout turns a regression (no budget at all) into a failure
  // instead of a test run that hangs forever.
  test('a stalled optional download is abandoned at the budget without failing the install', { timeout: 5000 }, async () => {
    assert.ok(OPTIONAL_BUDGET_MS <= 120_000, 'well inside the few minutes browsers allow an install');
    mock.timers.enable({ apis: ['setTimeout'] });
    let markStarted;
    const stalledStarted = new Promise((resolve) => (markStarted = resolve));
    const network = createNetwork({
      'Logic Flow.mp3': (request) => {
        markStarted();
        return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason)));
      },
    });
    const sw = startServiceWorker({ network });
    let installed = false;
    const installing = sw.install().then(() => (installed = true));

    await stalledStarted;
    await flushIO();
    assert.equal(installed, false, 'install is still waiting on the stalled download');
    mock.timers.tick(OPTIONAL_BUDGET_MS);
    await installing;

    const cached = await sw.cachedUrls();
    assert.ok(cached.includes(`${SCOPE}index.js`));
    assert.ok(cached.includes(`${SCOPE}Sudoku%20Zen.mp3`));
    assert.ok(!cached.includes(`${SCOPE}Logic%20Flow.mp3`));
  });

  test('music is cached under the same percent-encoded URLs js/audio.js requests', async () => {
    const sw = startServiceWorker();
    await sw.install();
    sw.network.offline = true;
    for (const name of ['Sudoku Zen.mp3', 'Logic Flow.mp3']) {
      const response = await sw.fetch(assetRequest(encodeURI(name)));
      assert.equal(response.status, 200, name);
      assert.equal(Buffer.from(await response.arrayBuffer()).equals(repoFile(name)), true, name);
    }
  });
});

// --------------------------------------------- update + cache cleanup

describe('updates and cache cleanup', () => {
  test('a normal update waits for the player: only a SKIP_WAITING message activates it', async () => {
    const sw = startServiceWorker();
    await sw.install();
    assert.equal(sw.self.skipWaiting.mock.callCount(), 0);
    await sw.message({ type: 'something-else' });
    await sw.message(null);
    assert.equal(sw.self.skipWaiting.mock.callCount(), 0);
    await sw.message({ type: 'SKIP_WAITING' });
    assert.equal(sw.self.skipWaiting.mock.callCount(), 1);
  });

  test('replacing a pre-v22 worker takes over at once, so that old page\'s Refresh still works', async () => {
    const cacheStorage = new FakeCacheStorage();
    await cacheStorage.open('inspire-sudoku-shell-v21');
    const sw = startServiceWorker({ cacheStorage });
    await sw.install();
    assert.equal(sw.self.skipWaiting.mock.callCount(), 1);
  });

  test("activation deletes only this app's obsolete caches, then claims the page", async () => {
    const cacheStorage = new FakeCacheStorage();
    const keep = ['other-project-cache', 'inspire-sudoku:/sudoku-staging/:v22', 'workbox-precache-v2'];
    const remove = ['inspire-sudoku-shell-v20', 'inspire-sudoku-shell-v21', 'inspire-sudoku:/sudoku-by-inspire-v1/:v1'];
    for (const name of [...keep, ...remove]) await cacheStorage.open(name);

    const sw = startServiceWorker({ cacheStorage });
    await sw.install();
    await sw.activate();
    assert.deepEqual((await cacheStorage.keys()).sort(), [...keep, CACHE_NAME].sort());
    assert.equal(sw.self.clients.claim.mock.callCount(), 1);
  });
});

// --------------------------------------------------------------- fetch

describe('fetch', () => {
  test("ignores non-GET requests and URLs outside this app's scope", async () => {
    const sw = startServiceWorker();
    await sw.install();
    assert.equal(await sw.fetch(new Request(`${SCOPE}index.js`, { method: 'POST', body: 'x' })), null);
    assert.equal(await sw.fetch(new Request('https://example.test/other-repo/app.js')), null, 'same origin, other project');
    assert.equal(await sw.fetch(new Request('https://cdn.example.com/lib.js')), null, 'cross-origin');
    assert.notEqual(await sw.fetch(assetRequest('js/screens.js')), null);
  });

  test('navigations get the cached shell even after a newer index.html is deployed', async () => {
    const network = createNetwork();
    const sw = startServiceWorker({ network });
    await sw.install();
    network.routes['index.html'] = () => new Response('<p>release B</p>', { headers: { 'Content-Type': 'text/html' } });

    const installedShell = repoFile('index.html').toString();
    for (const url of [SCOPE, `${SCOPE}index.html`, `${SCOPE}index.html?source=pwa`]) {
      assert.equal(await (await sw.fetch(navigationRequest(url))).text(), installedShell, url);
    }
  });

  test('other navigations use the network, with the shell as the offline fallback', async () => {
    const network = createNetwork();
    const sw = startServiceWorker({ network });
    await sw.install();
    const online = await sw.fetch(navigationRequest(`${SCOPE}README.md`));
    assert.equal(await online.text(), repoFile('README.md').toString());

    network.offline = true;
    const offline = await sw.fetch(navigationRequest(`${SCOPE}README.md`));
    assert.equal(await offline.text(), repoFile('index.html').toString());
  });

  test('a cached module is served offline; an uncached one is a network error', async () => {
    const network = createNetwork();
    const sw = startServiceWorker({ network });
    await sw.install();
    network.offline = true;
    assert.equal((await sw.fetch(assetRequest('js/ui/board-view.js'))).status, 200);
    assert.equal((await sw.fetch(assetRequest('PROJECT_BRIEF.md'))).type, 'error');
  });

  test('a network 206 passes straight through and is never stored; a full 200 is', async () => {
    const network = createNetwork({ 'Logic Flow.mp3': () => new Response('Not Found', { status: 404 }) });
    const sw = startServiceWorker({ network });
    await sw.install(); // Logic Flow.mp3 missed the precache
    delete network.routes['Logic Flow.mp3'];

    const partial = await sw.fetch(assetRequest('Logic%20Flow.mp3', { Range: 'bytes=0-99' }));
    assert.equal(partial.status, 206);
    assert.equal((await partial.arrayBuffer()).byteLength, 100);
    assert.ok(!(await sw.cachedUrls()).includes(`${SCOPE}Logic%20Flow.mp3`));

    const full = await sw.fetch(assetRequest('Logic%20Flow.mp3'));
    assert.equal(full.status, 200);
    assert.ok((await sw.cachedUrls()).includes(`${SCOPE}Logic%20Flow.mp3`));
  });

  test('a failed cache write never fails the response', async () => {
    const cacheStorage = new FakeCacheStorage();
    const sw = startServiceWorker({ cacheStorage });
    await sw.install();
    (await cacheStorage.open(CACHE_NAME)).put = async () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    const response = await sw.fetch(assetRequest('README.md'));
    assert.equal(response.status, 200);
  });
});

// ------------------------------------------------- byte-range serving

describe('byte ranges from the cache (offline)', () => {
  const music = 'Logic%20Flow.mp3';
  const musicBytes = repoFile('Logic Flow.mp3');
  const size = musicBytes.length;

  async function offlineWorker() {
    const sw = startServiceWorker();
    await sw.install();
    sw.network.offline = true;
    return sw;
  }

  async function expectPartial(sw, relative, range, start, end, bytes, type) {
    const response = await sw.fetch(assetRequest(relative, { Range: range }));
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${bytes.length}`, range);
    assert.equal(response.headers.get('Content-Length'), String(end - start + 1), range);
    assert.equal(response.headers.get('Content-Type'), type, range);
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes', range);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(start, end + 1)), `${range} body`);
  }

  test('serves 206 slices with correct headers: first bytes, open-ended, suffix, past-the-end', async () => {
    const sw = await offlineWorker();
    await expectPartial(sw, music, 'bytes=0-99', 0, 99, musicBytes, 'audio/mpeg');
    await expectPartial(sw, music, 'bytes=0-', 0, size - 1, musicBytes, 'audio/mpeg');
    await expectPartial(sw, music, 'bytes=1000000-', 1000000, size - 1, musicBytes, 'audio/mpeg');
    await expectPartial(sw, music, 'bytes=-500', size - 500, size - 1, musicBytes, 'audio/mpeg');
    await expectPartial(sw, music, `bytes=${size - 10}-${size + 5000}`, size - 10, size - 1, musicBytes, 'audio/mpeg');

    const video = repoFile('inspiresoftwareintro.mp4');
    await expectPartial(sw, 'inspiresoftwareintro.mp4', 'bytes=7705-8704', 7705, 8704, video, 'video/mp4');
  });

  test('answers an unsatisfiable range with 416 and the full size', async () => {
    const sw = await offlineWorker();
    for (const range of [`bytes=${size}-`, `bytes=${size + 10}-${size + 20}`, 'bytes=-0']) {
      const response = await sw.fetch(assetRequest(music, { Range: range }));
      assert.equal(response.status, 416, range);
      assert.equal(response.headers.get('Content-Range'), `bytes */${size}`, range);
      assert.equal((await response.arrayBuffer()).byteLength, 0, range);
    }
  });

  test('ignores malformed, multi-range, and non-byte headers with the full 200', async () => {
    const sw = await offlineWorker();
    for (const range of ['bytes=500-100', 'bytes=0-1,5-6', 'items=0-10', 'bytes=abc', 'bytes=-']) {
      const response = await sw.fetch(assetRequest(music, { Range: range }));
      assert.equal(response.status, 200, range);
      assert.equal((await response.arrayBuffer()).byteLength, size, range);
    }
    const plain = await sw.fetch(assetRequest(music));
    assert.equal(plain.status, 200);
  });
});
