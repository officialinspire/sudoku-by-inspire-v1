/**
 * The AudioManager: one shared AudioContext for every synthesized sound
 * effect, plus independent background-music playback (the state machine
 * itself lives in js/music-player.js; this file connects it to screens,
 * game state, settings, and the page lifecycle).
 *
 * Browsers refuse to let audio play until a real user gesture has
 * happened on the page, so `initAudioEngine()` must only ever be called
 * from directly inside a click/keydown handler for the very first
 * interaction — see index.js, where it's called synchronously alongside
 * `playIntro()` from the Start screen's advance handler (the same
 * gesture unlocks both). It is never called at module load time, and
 * every exported play/vibrate function silently no-ops if the engine
 * hasn't been initialized yet or the browser doesn't support the
 * feature it needs — see the "feature detection" notes below.
 *
 * SFX are synthesized here with the Web Audio API (oscillator + gain
 * envelope) rather than shipped as audio files — zero extra binary
 * assets, fully offline. Background music is the one optional exception:
 * two named tracks — "Sudoku Zen.mp3" for the menu family of screens and
 * "Logic Flow.mp3" for gameplay — looped if present; a missing file just
 * leaves that track silent (the same graceful-missing-asset policy as the
 * intro video). Only one track plays at a time; switching tracks (a
 * screen change, a game-state pause/resume, game completion) crossfades
 * rather than cutting, except on browsers that ignore `volume` (iOS),
 * where a crossfade would be two full-volume tracks at once.
 *
 * Music and SFX fail independently: music starts first, and an
 * AudioContext that's missing or throws on creation only costs the SFX.
 *
 * Music deliberately does NOT run through the shared AudioContext/Web
 * Audio graph (no `createMediaElementSource`, no `GainNode`) — each
 * track's own `<audio>` element controls its volume directly. This was a
 * mobile bug fix, not a style choice: earlier versions routed music
 * through the same AudioContext as the SFX, and on Android Chrome in
 * particular, that graph can go silently dead across a suspend/resume
 * cycle (screen lock, backgrounding, even just cycling the context fast
 * enough while pausing/resuming a game) — `<audio>.paused` and
 * `AudioContext.state` both keep reporting "everything's fine" while
 * nothing reaches the speakers, because the *connection* died, not
 * either endpoint's own state. No amount of watching those two flags
 * (which is all the previous recovery logic did) can catch that. Plain
 * `<audio>` elements, played and volume-controlled directly, don't share
 * that failure mode — they're independent of whatever the AudioContext
 * is doing, so an SFX-related context suspend can no longer take music
 * down with it.
 */

import { getAudioSettings, onAudioSettingsChange } from './audio-settings.js';
import { onStateChange, getState } from './game-state.js';
import { onScreenChange, getCurrentScreen } from './screens.js';
import { createMusicPlayer } from './music-player.js';

// encodeURI'd exactly as sw.js precaches them, so both agree on one URL.
const MUSIC_TRACK_SOURCES = {
  menu: encodeURI('./Sudoku Zen.mp3'),
  gameplay: encodeURI('./Logic Flow.mp3'),
};

let audioContext = null;
let sfxMasterGain = null;
let musicPlayer = null;
let engineInitialized = false;

function ensureContextRunning() {
  if (!audioContext) return;
  // 'interrupted' is WebKit's state after a phone call, Siri, or a screen
  // lock; resume() recovers from it the same way as from 'suspended'.
  if (audioContext.state === 'suspended' || audioContext.state === 'interrupted') {
    // resume() is async, but scheduling against audioContext.currentTime
    // below is valid whether or not the promise has settled yet — the
    // sound just stays silent until the context actually finishes
    // resuming, rather than the call failing outright.
    audioContext.resume().catch(() => {});
  }
}

/**
 * Plays one short synthesized tone. The envelope always ramps *up* from
 * zero (a sound starting instantly at full volume produces an audible
 * "click" from the sudden discontinuity) and back *down* to zero at the
 * end (same reason, in reverse) — see the Phase 8 dev-log entry for the
 * fuller explanation of why exponential decay is used for the release
 * instead of a straight line. Every node created here is local to this
 * call and explicitly disconnected once the oscillator finishes, so
 * nothing lingers referencing them after playback ends.
 */
function playTone({ frequency, frequencyEnd, duration, type = 'sine', peakGain = 0.2, startTime }) {
  if (!audioContext || !sfxMasterGain) return;
  if (!getAudioSettings().sfxEnabled) return;
  ensureContextRunning();

  const now = startTime ?? audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (frequencyEnd) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), now + duration);
  }

  const attack = Math.min(0.01, duration / 4);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(peakGain, now + attack);
  // exponentialRampToValueAtTime can never target exactly 0 (it's a
  // multiplicative curve) — ramp to a near-silent floor instead, then
  // snap the last fraction of the way at the very end.
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gainNode.gain.setValueAtTime(0, now + duration + 0.001);

  oscillator.connect(gainNode);
  gainNode.connect(sfxMasterGain);

  oscillator.onended = () => {
    oscillator.disconnect();
    gainNode.disconnect();
  };

  oscillator.start(now);
  oscillator.stop(now + duration + 0.01);
}

export function playClick() {
  playTone({ frequency: 620, duration: 0.06, type: 'sine', peakGain: 0.16 });
}

export function playSelect() {
  playTone({ frequency: 720, frequencyEnd: 900, duration: 0.08, type: 'sine', peakGain: 0.14 });
}

export function playError() {
  playTone({ frequency: 260, frequencyEnd: 140, duration: 0.18, type: 'square', peakGain: 0.12 });
  vibrate(40);
}

export function playCompletion() {
  if (!audioContext) return;
  // Resume *before* reading currentTime, not after: every note below is
  // scheduled at a fixed offset from `base`, so if the context happened
  // to be suspended right at puzzle completion, capturing `base` first
  // and only resuming inside the first playTone() call risks scheduling
  // some/all of the notes at a moment that's already in the past by the
  // time the context actually resumes — browsers clamp that to "now,"
  // which can collapse the arpeggio's stagger into one simultaneous
  // chord instead of four notes in sequence.
  ensureContextRunning();
  const base = audioContext.currentTime;
  // A short ascending major-triad-plus-octave arpeggio (C5, E5, G5, C6) —
  // a small, deliberately simple "win" cue rather than anything busy.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, i) => {
    playTone({ frequency, duration: 0.16, type: 'sine', peakGain: 0.15, startTime: base + i * 0.1 });
  });
  vibrate([30, 40, 30]);
}

/**
 * Vibration is its own independent toggle (distinct from SFX) and its
 * own independent feature check: `navigator.vibrate` simply doesn't
 * exist on many desktop browsers and on iOS Safari, and calling it
 * there would throw in some environments — checking `typeof ... ===
 * 'function'` first makes the unsupported case a silent no-op rather
 * than an error.
 */
export function vibrate(pattern) {
  if (!getAudioSettings().vibrationEnabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
}

function applySfxGain() {
  if (!sfxMasterGain) return;
  // The master gain (rather than each tone's own peak) tracks the
  // slider, so dragging it updates the loudness of a tone that's
  // already mid-envelope, not just the next one.
  sfxMasterGain.gain.value = getAudioSettings().sfxVolume;
}


/**
 * Creates the SFX graph. Every SFX tone funnels through one shared
 * compressor before hitting the speakers — individual tone envelopes
 * already stay well under full scale (see playTone's peakGain values),
 * but several sounds can legitimately overlap (a wrong digit fires a
 * click *and* an error tone in the same instant); the compressor is a
 * cheap safety margin against that sum ever clipping. Music isn't part
 * of this graph — see the module doc comment.
 *
 * The constructor is looked up here, not at module load, and a missing
 * one or a throwing one (some browsers cap how many contexts a page may
 * create, or block audio outright by policy) just leaves SFX off — every
 * playX() above already no-ops without a context. It must never throw:
 * it runs inside the Start tap, ahead of the intro.
 */
function createSfxEngine() {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    masterGain.connect(compressor);
    compressor.connect(context.destination);
    audioContext = context;
    sfxMasterGain = masterGain;
  } catch {
    audioContext = null;
    sfxMasterGain = null;
    return;
  }
  applySfxGain();
  ensureContextRunning();
}

// ================================================================
// MUSIC
// ================================================================

/**
 * The menu "family" of screens (main menu, Statistics, High Scores,
 * Achievements) all share the menu track — they're all reached from,
 * and lead back to, the same context, and switching tracks every time
 * you tap into Statistics and back would be more distracting than
 * helpful. Start and Intro get no music of their own (Start is silent
 * until the very first gesture; Intro is a brief, self-contained
 * moment). Game gets the gameplay track — matches "fade in once a new
 * level is started."
 */
const SCREEN_MUSIC_TRACK = {
  menu: 'menu',
  statistics: 'menu',
  highscores: 'menu',
  achievements: 'menu',
  game: 'gameplay',
};

/**
 * The game screen is the one case where "which track should be playing"
 * depends on more than just which screen is showing: pausing mid-game
 * (Escape, or the in-game pause overlay) opens what's functionally an
 * in-game menu, so the menu track fades in — then back to "Logic Flow"
 * on resume. A completed game has no track at all ("loops until level
 * completion"): nothing plays under the completion dialog until the
 * player moves on to the menu or a new game.
 */
function musicTrackFor(screenId, gameStatus) {
  if (screenId === 'game' && gameStatus === 'paused') return 'menu';
  if (screenId === 'game' && gameStatus === 'complete') return null;
  return SCREEN_MUSIC_TRACK[screenId] ?? null;
}

// Reads live game state rather than caching the last-seen status — a
// fresh game's `showScreen('game')` fires before `startGame()` resolves
// (see js/ui/difficulty-dialog.js), so a cached status from the
// *previous* game (e.g. left 'paused') would otherwise leak into the new
// one's very first track resolution.
function syncMusicTarget() {
  musicPlayer.setTarget(musicTrackFor(getCurrentScreen(), getState().status));
}

// "Active" = visible and not being unloaded. pagehide also covers a page
// entering the back/forward cache (visibility can still read 'visible'
// at that moment), and pageshow brings it back when restored.
let pageUnloading = false;

function syncPageActivity() {
  musicPlayer.setPageActive(!pageUnloading && document.visibilityState === 'visible');
}

function handleVisibilityChange() {
  syncPageActivity();
  if (document.visibilityState === 'visible') ensureContextRunning();
}

// Events browsers treat as a user gesture for media playback. A retry of
// refused playback has to run inside one; a tap fires several of these,
// and every call after the first is a no-op.
const USER_GESTURE_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

function startMusic() {
  musicPlayer = createMusicPlayer({
    sources: MUSIC_TRACK_SOURCES,
    createAudio: (src) => new Audio(src),
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
    frames: { request: (fn) => requestAnimationFrame(fn), cancel: (id) => cancelAnimationFrame(id) },
    getSettings: getAudioSettings,
  });
  syncPageActivity();
  // We're inside the Start tap: unlock both tracks now (only if music is
  // on — see music-player.js's unlockIdleTracks), since the menu track's
  // first real play() comes when the intro ends, which isn't a gesture.
  musicPlayer.userGesture();
}

function listenForMusicLifecycle() {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', () => {
    pageUnloading = true;
    syncPageActivity();
  });
  window.addEventListener('pageshow', () => {
    pageUnloading = false;
    syncPageActivity();
  });
  for (const type of USER_GESTURE_EVENTS) {
    document.addEventListener(type, () => musicPlayer.userGesture(), { capture: true, passive: true });
  }
}

// ================================================================
// REACTIONS
// ================================================================

let prevMistakes = 0;
let prevStatus = null;
let prevSelectedIndex = null;

function initAudioReactions() {
  onStateChange((state) => {
    const isRealSelectionChange =
      state.status === 'playing' && prevStatus === 'playing' && state.selectedIndex !== prevSelectedIndex;

    if (state.status === 'complete' && prevStatus !== 'complete') {
      playCompletion();
    } else if (state.mistakes > prevMistakes) {
      playError();
    } else if (isRealSelectionChange) {
      playSelect();
    }

    // Pause/resume crossfades between the gameplay and menu tracks, and
    // completion stops music — all decided by musicTrackFor().
    if (state.status !== prevStatus) syncMusicTarget();

    prevMistakes = state.mistakes;
    prevStatus = state.status;
    prevSelectedIndex = state.selectedIndex;
  });
}

/**
 * Must be called synchronously from within the page's first user-gesture
 * handler (click/keydown) — see the module doc comment above. Safe to
 * call more than once; every call after the first is a no-op, so no
 * listener, timer, or audio element is ever created twice.
 */
export function initAudioEngine() {
  if (engineInitialized) return;
  engineInitialized = true;

  // Music first and independently: nothing about SFX can stop it.
  startMusic();
  createSfxEngine();

  onAudioSettingsChange(() => {
    applySfxGain();
    musicPlayer.settingsChanged();
  });
  listenForMusicLifecycle();

  // Picks the right track for whatever screen is showing right now, then
  // keeps it in sync with every screen change after.
  onScreenChange(syncMusicTarget);
  syncMusicTarget();

  initAudioReactions();
}
