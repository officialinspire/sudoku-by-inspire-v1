import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicPlayer, RETRY_DELAYS_MS, STALL_TIMEOUT_MS } from './music-player.js';

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

/** setTimeout + requestAnimationFrame on one fake timeline. */
class FakeClock {
  now = 0;
  nextId = 1;
  timers = new Map();
  frames = new Map();
  setTimeout = (fn, ms) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id) => {
    this.timers.delete(id);
  };
  requestFrame = (fn) => {
    const id = this.nextId++;
    this.frames.set(id, fn);
    return id;
  };
  cancelFrame = (id) => {
    this.frames.delete(id);
  };
  async advance(ms, frameMs = 16) {
    const end = this.now + ms;
    while (this.now < end) {
      this.now = Math.min(end, this.now + frameMs);
      const due = [...this.frames.values()];
      this.frames.clear();
      for (const fn of due) fn(this.now);
      const timers = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of timers) {
        if (timer.at <= this.now && this.timers.has(id)) {
          this.timers.delete(id);
          timer.fn();
        }
      }
      await flush();
    }
  }
}

/**
 * Just enough of HTMLAudioElement, with the browser behaviors the player
 * relies on: play() flips `paused` at once and settles later; pause() or
 * load() reject a pending play() with AbortError; events fire async.
 * `behavior` scripts what the next play() does.
 */
class FakeAudio extends EventTarget {
  constructor(src, { lockVolume }) {
    super();
    Object.assign(this, { src, lockVolume, loop: false, preload: '', muted: false, paused: true, error: null });
    this._volume = 1;
    this.behavior = 'resolve'; // 'resolve' | 'notAllowed' | 'missing' | 'manual' (never settles)
    this.pending = null;
    this.playCalls = [];
    this.loadCalls = 0;
  }
  get volume() {
    return this.lockVolume ? 1 : this._volume; // iOS: always reads 1
  }
  set volume(value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('IndexSizeError');
    if (!this.lockVolume) this._volume = value;
  }
  play() {
    this.playCalls.push({ muted: this.muted });
    // Refusal is decided synchronously (as in browsers — a pause() right
    // after can't turn it into an AbortError), and `paused` stays true.
    if (this.behavior === 'notAllowed') return Promise.reject(new DOMException('needs a gesture', 'NotAllowedError'));
    this.paused = false;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      if (this.behavior !== 'manual') queueMicrotask(() => this.settle());
    });
  }
  settle(outcome = this.behavior) {
    if (!this.pending) return;
    const { resolve, reject } = this.pending;
    this.pending = null;
    if (outcome === 'missing') {
      this.paused = true;
      this.error = { code: 4 };
      this.emit('error');
      reject(new DOMException('no supported source', 'NotSupportedError'));
    } else {
      resolve();
      this.emit('playing');
    }
  }
  pause() {
    this.abortPending();
    if (!this.paused) {
      this.paused = true;
      this.emit('pause');
    }
  }
  load() {
    this.loadCalls++;
    this.abortPending();
    this.paused = true;
    this.error = null;
  }
  abortPending() {
    if (!this.pending) return;
    const { reject } = this.pending;
    this.pending = null;
    reject(new DOMException('interrupted', 'AbortError'));
  }
  // Browsers fire media events as queued tasks — after promise callbacks
  // already queued — which is what makes a stale 'pause' possible.
  emit(type) {
    setImmediate(() => this.dispatchEvent(new Event(type)));
  }
  // What the outside world does to an element:
  externalPause() {
    this.paused = true;
    this.emit('pause');
  }
  networkError() {
    this.error = { code: 2 };
    this.emit('error');
  }
  buffering() {
    this.emit('waiting');
  }
}

function setup({ lockVolume = false, ...settingsOverrides } = {}) {
  const clock = new FakeClock();
  const settings = { musicEnabled: true, musicVolume: 0.5, ...settingsOverrides };
  const elements = {};
  const player = createMusicPlayer({
    sources: { menu: 'Sudoku%20Zen.mp3', gameplay: 'Logic%20Flow.mp3' },
    createAudio: (src) => {
      const element = new FakeAudio(src, { lockVolume });
      elements[src.startsWith('Sudoku') ? 'menu' : 'gameplay'] = element;
      return element;
    },
    timers: clock,
    frames: { request: clock.requestFrame, cancel: clock.cancelFrame },
    getSettings: () => ({ ...settings }),
  });
  const track = (name) => player.snapshot().tracks[name];
  // Real (unmuted) playback attempts; the Start-tap unlock's muted calls are silent by design.
  const playCount = () => [elements.menu, elements.gameplay].flatMap((e) => e.playCalls).filter((call) => !call.muted).length;
  return { player, clock, settings, menu: elements.menu, gameplay: elements.gameplay, track, playCount };
}

async function playingMenu(options) {
  const h = setup(options);
  h.player.setTarget('menu');
  await h.clock.advance(3000);
  assert.equal(h.track('menu').status, 'playing');
  return h;
}

// ------------------------------------------------------------- unlock

describe('Start-tap unlock', () => {
  test('a muted play() then pause() per track: silent, and both end paused and idle', async () => {
    const h = setup();
    h.player.userGesture();
    for (const element of [h.menu, h.gameplay]) {
      assert.deepEqual(element.playCalls, [{ muted: true }]);
      assert.equal(element.muted, false, 'unmuted again right after');
    }
    await flush();
    assert.equal(h.menu.paused, true);
    assert.equal(h.track('menu').status, 'idle');
    assert.equal(h.track('gameplay').status, 'idle');
  });

  test('with music off — or its volume at zero — the Start tap touches no audio element', async () => {
    for (const settings of [{ musicEnabled: false }, { musicVolume: 0 }]) {
      const h = setup(settings);
      h.player.userGesture();
      h.player.setTarget('menu');
      await h.clock.advance(5000);
      assert.equal(h.menu.playCalls.length + h.gameplay.playCalls.length, 0, `not even muted: ${JSON.stringify(settings)}`);
    }
  });

  test('with music off the tracks are not even preloaded; switching it on preloads them', () => {
    const h = setup({ musicEnabled: false });
    assert.equal(h.menu.preload, 'none');
    assert.equal(h.gameplay.preload, 'none');
    h.settings.musicEnabled = true;
    h.player.settingsChanged();
    assert.equal(h.menu.preload, 'auto');
    assert.equal(h.gameplay.preload, 'auto');
    assert.equal(setup().menu.preload, 'auto', 'music on from the start: preloaded right away');
  });

  test('switching music on later (itself a tap) unlocks the other track and plays the current one', async () => {
    const h = setup({ musicEnabled: false });
    h.player.setTarget('menu');
    await h.clock.advance(100);
    h.settings.musicEnabled = true;
    h.player.settingsChanged();
    assert.deepEqual(h.gameplay.playCalls, [{ muted: true }], 'gameplay track unlocked');
    assert.deepEqual(h.menu.playCalls, [{ muted: false }], 'menu just plays — no unlock pause to race it');
    await h.clock.advance(3000);
    assert.equal(h.track('menu').status, 'playing');
    assert.equal(h.track('menu').retries, 0, 'no retry spent');
    assert.equal(h.gameplay.paused, true);
  });

  test("a stale 'pause' event from an earlier pause() doesn't count as an interruption", async () => {
    const h = setup();
    h.player.userGesture(); // Start tap: the unlock's pause() queues a 'pause' event…
    h.player.setTarget('menu'); // …and real playback begins before it's delivered
    await h.clock.advance(3000);
    assert.equal(h.track('menu').status, 'playing');
    assert.equal(h.track('menu').retries, 0);
  });

  test('every track starts silent — no full-volume blip before its fade-in', () => {
    const h = setup();
    assert.equal(h.menu.volume, 0);
    assert.equal(h.gameplay.volume, 0);
  });

  test('unlocks once; a refused unlock is attempted again on the next gesture', async () => {
    const h = setup();
    h.menu.behavior = 'notAllowed';
    h.player.userGesture();
    await flush();
    h.menu.behavior = 'resolve';
    h.player.userGesture();
    h.player.userGesture();
    assert.equal(h.menu.playCalls.length, 2, 'refused once, retried once');
    assert.equal(h.gameplay.playCalls.length, 1, 'unlocked the first time, never again');
  });
});

// ------------------------------------------------- targets & crossfades

describe('targets and crossfades', () => {
  test('the menu target plays Sudoku Zen and fades it up to the music volume', async () => {
    const h = await playingMenu();
    assert.equal(h.track('menu').fadeLevel, 1);
    assert.equal(h.menu.volume, 0.5);
    assert.equal(h.gameplay.playCalls.length, 0);
  });

  test('switching to gameplay crossfades, pausing the menu track only once its fade-out ends', async () => {
    const h = await playingMenu();
    h.player.setTarget('gameplay');
    await h.clock.advance(900);
    assert.equal(h.menu.paused, false, 'still fading out');
    assert.ok(h.menu.volume < 0.5 && h.gameplay.volume > 0);
    await h.clock.advance(1200);
    assert.equal(h.menu.paused, true);
    assert.equal(h.track('menu').status, 'idle');
    assert.equal(h.track('gameplay').status, 'playing');
  });

  test('rapid screen switches leave exactly the last target playing, with no stale pause left', async () => {
    const h = await playingMenu();
    for (const target of ['gameplay', 'menu', 'gameplay', 'menu', 'gameplay', 'menu']) {
      h.player.setTarget(target);
      await h.clock.advance(120);
    }
    await h.clock.advance(3000);
    assert.equal(h.menu.paused, false);
    assert.equal(h.track('menu').fadeLevel, 1);
    assert.equal(h.gameplay.paused, true);
    assert.equal(h.clock.timers.size, 0, 'no timers left behind');
    assert.equal(h.clock.frames.size, 0, 'no fade frames left behind');
  });

  test('Start, Intro and a completed game (target null) are silent', async () => {
    const h = await playingMenu();
    h.player.setTarget(null);
    await h.clock.advance(2500);
    assert.equal(h.menu.paused, true);
    const plays = h.playCount();
    h.player.userGesture();
    h.player.setPageActive(false);
    h.player.setPageActive(true);
    h.player.settingsChanged();
    await h.clock.advance(20000);
    assert.equal(h.playCount(), plays, 'nothing restarts without a target');
  });
});

// ------------------------------------------------------------ settings

describe('mute and volume', () => {
  test('muting mid-crossfade fades both tracks out, and nothing restarts while muted', async () => {
    const h = await playingMenu();
    h.player.setTarget('gameplay');
    await h.clock.advance(600);
    h.settings.musicEnabled = false;
    h.player.settingsChanged();
    await h.clock.advance(2500);
    assert.equal(h.menu.paused, true);
    assert.equal(h.gameplay.paused, true);

    const plays = h.playCount();
    h.player.userGesture();
    h.player.setPageActive(false);
    h.player.setPageActive(true);
    h.player.setTarget('menu');
    await h.clock.advance(30000);
    assert.equal(h.playCount(), plays);
  });

  test('a mute → unmute → mute flurry ends muted, without an early cut from a stale pause', async () => {
    const h = await playingMenu();
    h.settings.musicEnabled = false;
    h.player.settingsChanged(); // fade-out #1: its pause would land at +1850 ms
    await h.clock.advance(600);
    h.settings.musicEnabled = true;
    h.player.settingsChanged();
    await h.clock.advance(600);
    h.settings.musicEnabled = false;
    h.player.settingsChanged(); // fade-out #2 starts at +1200 ms
    await h.clock.advance(800); // +2000 ms: past #1's moment, mid fade-out #2
    assert.equal(h.menu.paused, false, 'fade-out #1\'s pause was cancelled, not left to cut #2 short');
    await h.clock.advance(1500);
    assert.equal(h.menu.paused, true);
    assert.equal(h.clock.timers.size, 0);
  });

  test('volume 0 counts as off (iOS ignores the volume property), and raising it resumes', async () => {
    const h = await playingMenu();
    h.settings.musicVolume = 0;
    h.player.settingsChanged();
    await h.clock.advance(2500);
    assert.equal(h.menu.paused, true);
    h.settings.musicVolume = 0.8;
    h.player.settingsChanged();
    await h.clock.advance(3000);
    assert.equal(h.menu.paused, false);
    assert.ok(Math.abs(h.menu.volume - 0.8) < 1e-9);
  });

  test('the volume slider applies live, mid-fade', async () => {
    const h = setup();
    h.player.setTarget('menu');
    await h.clock.advance(400);
    h.settings.musicVolume = 0.2;
    h.player.settingsChanged();
    const { fadeLevel } = h.track('menu');
    assert.ok(fadeLevel > 0 && fadeLevel < 1);
    assert.ok(Math.abs(h.menu.volume - fadeLevel * 0.2) < 1e-9);
  });
});

// ----------------------------------------------------------- lifecycle

describe('page lifecycle', () => {
  test('hiding the page pauses at once, and nothing restarts while hidden', async () => {
    const h = await playingMenu();
    h.player.setPageActive(false);
    assert.equal(h.menu.paused, true, 'immediately, no fade (hidden pages get no frames)');
    const plays = h.playCount();
    h.player.userGesture();
    h.player.settingsChanged();
    h.player.setTarget('gameplay');
    h.player.setTarget('menu');
    await h.clock.advance(30000);
    assert.equal(h.playCount(), plays);
    assert.equal(h.track('menu').status, 'idle');
  });

  test('showing the page again resumes the target, fading in from silence', async () => {
    const h = await playingMenu();
    h.player.setPageActive(false);
    h.player.setPageActive(true);
    await h.clock.advance(300);
    const { status, fadeLevel } = h.track('menu');
    assert.equal(status, 'playing');
    assert.ok(fadeLevel > 0 && fadeLevel < 1, `fading in (${fadeLevel})`);
  });

  test('screen lock: the OS pauses the element, the page hides, then unlock resumes', async () => {
    const h = await playingMenu();
    h.menu.externalPause();
    await flush();
    assert.equal(h.track('menu').status, 'retrying');
    h.player.setPageActive(false);
    assert.deepEqual(h.track('menu').pendingTimers, [], 'the retry was cancelled');
    const plays = h.playCount();
    await h.clock.advance(30000);
    assert.equal(h.playCount(), plays, 'no retry fired while locked');
    h.player.setPageActive(true);
    await h.clock.advance(100);
    assert.equal(h.track('menu').status, 'playing');
  });
});

// ------------------------------------------------- failures & retries

describe('failures and bounded retries', () => {
  test('an autoplay refusal waits for a gesture — no timer retries — then plays inside it', async () => {
    const h = setup();
    h.menu.behavior = 'notAllowed';
    h.player.setTarget('menu');
    await h.clock.advance(60000);
    assert.equal(h.track('menu').status, 'blocked');
    assert.equal(h.menu.playCalls.length, 1, 'tried once, then waited');

    h.menu.behavior = 'resolve';
    h.player.userGesture();
    assert.equal(h.menu.playCalls.length, 2, 'play() called synchronously inside the gesture');
    await h.clock.advance(100);
    assert.equal(h.track('menu').status, 'playing');
  });

  test('repeated outside pauses get bounded retries, then stop until a fresh start', async () => {
    const h = await playingMenu();
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      h.menu.externalPause();
      await h.clock.advance(RETRY_DELAYS_MS[i] + 100);
      assert.equal(h.track('menu').status, 'playing', `retry ${i + 1} succeeded`);
    }
    h.menu.externalPause();
    await flush();
    assert.equal(h.track('menu').status, 'failed');
    const plays = h.playCount();
    await h.clock.advance(60000);
    assert.equal(h.playCount(), plays, 'no endless recovery');

    h.player.userGesture(); // e.g. the next digit tap
    await h.clock.advance(100);
    assert.equal(h.track('menu').status, 'playing');
  });

  test('a missing file is unavailable for the session: no retries, no gesture retries', async () => {
    const h = setup();
    h.menu.behavior = 'missing';
    h.player.setTarget('menu');
    await h.clock.advance(60000);
    h.player.userGesture();
    h.player.setPageActive(false);
    h.player.setPageActive(true);
    await h.clock.advance(60000);
    assert.equal(h.menu.playCalls.length, 1);
    assert.equal(h.track('menu').unavailable, true);

    h.player.setTarget('gameplay');
    await h.clock.advance(2500);
    assert.equal(h.track('gameplay').status, 'playing', 'the other track is unaffected');
  });

  test('a NotSupportedError from play() alone (no error event) is also final, never retried', async () => {
    const h = setup();
    h.menu.play = function () {
      this.playCalls.push({ muted: this.muted });
      return Promise.reject(new DOMException('unsupported', 'NotSupportedError'));
    };
    h.player.setTarget('menu');
    await h.clock.advance(60000);
    h.player.userGesture();
    await h.clock.advance(60000);
    assert.equal(h.track('menu').unavailable, true);
    assert.equal(h.menu.playCalls.filter((call) => !call.muted).length, 1);
  });

  test('a network error after playing is retried with a reload', async () => {
    const h = await playingMenu();
    h.menu.networkError();
    await flush();
    assert.equal(h.track('menu').status, 'retrying');
    await h.clock.advance(RETRY_DELAYS_MS[0] + 100);
    assert.equal(h.menu.loadCalls, 1);
    assert.equal(h.track('menu').status, 'playing');
  });

  test('a start that stalls is abandoned after the watchdog and retried', async () => {
    const h = setup();
    h.menu.behavior = 'manual'; // play() never settles: no data arriving
    h.player.setTarget('menu');
    await h.clock.advance(STALL_TIMEOUT_MS + 50);
    assert.equal(h.track('menu').status, 'retrying');
    h.menu.behavior = 'resolve';
    await h.clock.advance(RETRY_DELAYS_MS[0] + 100);
    assert.equal(h.menu.loadCalls, 1, 'reloaded before retrying');
    assert.equal(h.track('menu').status, 'playing');
  });

  test('mid-track buffering that never recovers counts as a stall', async () => {
    const h = await playingMenu();
    h.menu.buffering();
    await h.clock.advance(STALL_TIMEOUT_MS + 50);
    assert.equal(h.track('menu').status, 'retrying');
  });

  test("a superseded play()'s late rejection is ignored", async () => {
    const h = setup();
    h.menu.behavior = 'manual';
    h.player.setTarget('menu');
    await flush();
    h.player.setTarget('gameplay'); // menu's pending play() is aborted by our own pause()
    await h.clock.advance(2500);
    assert.equal(h.track('menu').status, 'idle', 'not retrying/failed over its own AbortError');
    assert.equal(h.track('gameplay').status, 'playing');
  });
});

// ----------------------------------------------- volume-locked (iOS)

describe('browsers that ignore element.volume (iOS)', () => {
  test('detected, and tracks switch with a hard cut rather than two full-volume tracks overlapping', async () => {
    const h = await playingMenu({ lockVolume: true });
    assert.equal(h.player.snapshot().volumeControl, false);
    h.player.setTarget('gameplay');
    assert.equal(h.menu.paused, true, 'cut at once');
    await h.clock.advance(100);
    assert.equal(h.track('gameplay').status, 'playing');
    assert.equal(h.clock.frames.size, 0, 'no fade animation at all');
  });
});

// ---------------------------------------------------------- idempotency

describe('idempotency', () => {
  test('repeated calls never stack timers or animation frames', async () => {
    const h = await playingMenu();
    h.player.setTarget('gameplay');
    for (let i = 0; i < 50; i++) {
      h.player.setTarget('gameplay');
      h.player.userGesture();
      h.player.settingsChanged();
      h.player.setPageActive(true);
    }
    // Exactly one of each thing in flight: the menu's fade-out and its
    // pending pause, and the gameplay track's start watchdog.
    assert.deepEqual(h.track('menu').pendingTimers, ['pause']);
    assert.deepEqual(h.track('gameplay').pendingTimers, ['watchdog']);
    assert.equal(h.clock.timers.size, 2);
    assert.ok(h.clock.frames.size <= 2, `${h.clock.frames.size} frames`);
    await h.clock.advance(3000);
    assert.equal(h.track('gameplay').status, 'playing');
    assert.equal(h.menu.paused, true);
    assert.equal(h.clock.timers.size + h.clock.frames.size, 0);
  });
});
