/**
 * Drives the real js/audio.js wiring (with the real screens, game-state
 * and audio-settings modules) through a minimal fake DOM: document and
 * window are EventTargets, Audio is a fake element, AudioContext throws,
 * and setTimeout is mocked so fades and timers run instantly. Tests run
 * in order against one engine, like one session in a browser.
 */
import { describe, test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeAudio extends EventTarget {
  static created = [];
  constructor(src) {
    super();
    Object.assign(this, { src, loop: false, preload: '', muted: false, paused: true, error: null, volume: 1 });
    this.behavior = 'resolve'; // or 'notAllowed'
    this.playCalls = [];
    this.pending = null;
    FakeAudio.created.push(this);
  }
  play() {
    this.playCalls.push({ muted: this.muted, at: currentEvent });
    if (this.behavior === 'notAllowed') return Promise.reject(new DOMException('needs a gesture', 'NotAllowedError'));
    this.paused = false;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      queueMicrotask(() => {
        if (!this.pending) return;
        this.pending = null;
        resolve();
        this.dispatchEvent(new Event('playing'));
      });
    });
  }
  pause() {
    if (this.pending) {
      this.pending.reject(new DOMException('interrupted', 'AbortError'));
      this.pending = null;
    }
    if (!this.paused) {
      this.paused = true;
      queueMicrotask(() => this.dispatchEvent(new Event('pause')));
    }
  }
  load() {}
}

class FakeScreen {
  hidden = true;
  classList = { toggle() {} };
  focus() {}
}

// Which DOM event (if any) is being dispatched when play() is called —
// how the tests prove a retry happened *inside* a gesture.
let currentEvent = null;
function dispatch(target, type) {
  currentEvent = type;
  try {
    target.dispatchEvent(new Event(type));
  } finally {
    currentEvent = null;
  }
}

let frameTime = 0;
const screens = Object.fromEntries(
  ['start', 'intro', 'menu', 'game', 'statistics', 'highscores', 'achievements'].map((id) => [`screen-${id}`, new FakeScreen()])
);
const fakeDocument = Object.assign(new EventTarget(), {
  visibilityState: 'visible',
  getElementById: (id) => screens[id] ?? null,
});
const fakeWindow = Object.assign(new EventTarget(), {
  // e.g. a browser's cap on AudioContexts, or audio blocked by policy.
  AudioContext: class {
    constructor() {
      throw new DOMException('Too many AudioContexts', 'NotSupportedError');
    }
  },
});

let audio, screensModule, gameState, audioSettings;
let documentListenerCount = 0;

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
async function advance(ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    mock.timers.tick(50);
    await flush();
  }
}
const elementFor = (name) => FakeAudio.created.find((element) => element.src.includes(name));
const audiblePlays = () => FakeAudio.created.flatMap((element) => element.playCalls).filter((call) => !call.muted).length;
async function setVisibility(state) {
  fakeDocument.visibilityState = state;
  dispatch(fakeDocument, 'visibilitychange');
  await advance(100);
}

before(async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  Object.assign(globalThis, {
    document: fakeDocument,
    window: fakeWindow,
    Audio: FakeAudio,
    requestAnimationFrame: (fn) => setTimeout(() => fn((frameTime += 16)), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
  });
  const addEventListener = fakeDocument.addEventListener.bind(fakeDocument);
  fakeDocument.addEventListener = (...args) => {
    documentListenerCount++;
    return addEventListener(...args);
  };
  audio = await import('./audio.js');
  screensModule = await import('./screens.js');
  gameState = await import('./game-state.js');
  audioSettings = await import('./audio-settings.js');
  audioSettings.initAudioSettings();
  screensModule.showScreen('start');
});

after(() => {
  mock.timers.reset();
  for (const key of ['document', 'window', 'Audio', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[key];
});

describe('audio engine wiring (one simulated session)', () => {
  test('music initializes even though creating the AudioContext throws', () => {
    assert.doesNotThrow(() => audio.initAudioEngine());
    assert.equal(FakeAudio.created.length, 2);
    assert.ok(elementFor('Sudoku%20Zen.mp3') && elementFor('Logic%20Flow.mp3'), 'encoded URLs, as sw.js caches them');
    assert.doesNotThrow(() => audio.playClick(), 'SFX just stay silent');
  });

  test('the Start tap unlocks both tracks silently; Start and Intro play nothing audible', async () => {
    for (const element of FakeAudio.created) assert.deepEqual(element.playCalls.map((c) => c.muted), [true]);
    screensModule.showScreen('intro');
    await advance(500);
    assert.equal(audiblePlays(), 0);
  });

  test('the menu screen plays Sudoku Zen', async () => {
    screensModule.showScreen('menu');
    await advance(3000);
    assert.equal(elementFor('Sudoku').paused, false);
    assert.equal(elementFor('Logic').paused, true);
  });

  test('the Achievements screen and back keep Sudoku Zen playing, without restarting it', async () => {
    const menuTrack = elementFor('Sudoku');
    const plays = menuTrack.playCalls.length;
    screensModule.showScreen('achievements');
    await advance(3000);
    screensModule.showScreen('menu');
    await advance(3000);
    assert.equal(menuTrack.paused, false);
    assert.equal(menuTrack.playCalls.length, plays, 'no new play() — same track, no crossfade');
    assert.equal(elementFor('Logic').paused, true);
  });

  test('init is idempotent: a second call creates no elements and no listeners', () => {
    const listeners = documentListenerCount;
    audio.initAudioEngine();
    assert.equal(FakeAudio.created.length, 2);
    assert.equal(documentListenerCount, listeners);
  });

  test('a hidden page pauses music and nothing restarts it until visible again', async () => {
    await setVisibility('hidden');
    assert.equal(elementFor('Sudoku').paused, true);
    const plays = audiblePlays();
    screensModule.showScreen('statistics');
    dispatch(fakeDocument, 'pointerup');
    await advance(10000);
    assert.equal(audiblePlays(), plays);

    await setVisibility('visible');
    assert.equal(elementFor('Sudoku').paused, false);
  });

  test('pagehide pauses even while still "visible"; pageshow (bfcache restore) resumes', async () => {
    dispatch(fakeWindow, 'pagehide');
    await advance(100);
    assert.equal(elementFor('Sudoku').paused, true);
    dispatch(fakeWindow, 'pageshow');
    await advance(100);
    assert.equal(elementFor('Sudoku').paused, false);
  });

  test('an autoplay refusal is retried inside the next tap, not on a timer', async () => {
    const menu = elementFor('Sudoku');
    menu.behavior = 'notAllowed';
    await setVisibility('hidden');
    await setVisibility('visible'); // resuming is refused this time
    const refused = menu.playCalls.length;
    await advance(20000);
    assert.equal(menu.playCalls.length, refused, 'no timer retries while blocked');

    menu.behavior = 'resolve';
    dispatch(fakeDocument, 'pointerup');
    assert.equal(menu.playCalls.at(-1).at, 'pointerup', 'play() ran inside the gesture');
    await advance(100);
    assert.equal(menu.paused, false);
  });

  test('a new game switches to Logic Flow; completing it stops music for good', async () => {
    const solution = [...Array(81)].map((_, i) => ((3 * (Math.floor(i / 9) % 3) + Math.floor(Math.floor(i / 9) / 3) + (i % 9)) % 9) + 1);
    const puzzle = solution.slice();
    puzzle[0] = 0;
    screensModule.showScreen('game');
    gameState.startGame({ puzzle, solution, status: 'generated', attempts: 1, elapsedMs: 1, clueCount: 80 }, 'easy', { autoStartTimer: false });
    await advance(3000);
    assert.equal(elementFor('Logic').paused, false);
    assert.equal(elementFor('Sudoku').paused, true);

    gameState.selectCell(0);
    gameState.applyNumberInput(solution[0]);
    assert.equal(gameState.getState().status, 'complete');
    await advance(3000);
    assert.equal(elementFor('Logic').paused, true);

    const plays = audiblePlays();
    await setVisibility('hidden');
    await setVisibility('visible');
    dispatch(fakeDocument, 'click');
    audioSettings.setMusicVolume(0.7);
    await advance(10000);
    assert.equal(audiblePlays(), plays, 'nothing restarts under the completion dialog');
  });

  test('muting stops music and keeps it stopped; unmuting resumes the current screen', async () => {
    screensModule.showScreen('menu');
    await advance(3000);
    assert.equal(elementFor('Sudoku').paused, false);

    audioSettings.setMusicEnabled(false);
    await advance(3000);
    assert.equal(elementFor('Sudoku').paused, true);
    const plays = audiblePlays();
    screensModule.showScreen('highscores');
    dispatch(fakeDocument, 'keydown');
    await setVisibility('hidden');
    await setVisibility('visible');
    await advance(10000);
    assert.equal(audiblePlays(), plays);

    audioSettings.setMusicEnabled(true);
    await advance(3000);
    assert.equal(elementFor('Sudoku').paused, false);
  });
});
