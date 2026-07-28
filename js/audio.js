/**
 * The AudioManager: one shared AudioContext for every synthesized sound
 * effect and for optional background music.
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
 * if `./background-music.mp3` exists it's loaded and looped; if it
 * doesn't (the common case — no such file ships with this repo), the
 * `<audio>` element's `error` event marks it unavailable and the app
 * carries on silently, the same graceful-missing-asset pattern already
 * used for the intro video in js/ui/intro-video.js.
 */

import { getAudioSettings, onAudioSettingsChange } from './audio-settings.js';
import { onStateChange } from './game-state.js';

const MUSIC_SRC = './background-music.mp3';

// Safari (until fairly recently) only exposes this under a vendor
// prefix. Older/locked-down browsers may have neither — captured once so
// every call site below can just check `AudioContextCtor` truthiness.
const AudioContextCtor =
  typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined;

let audioContext = null;
let sfxMasterGain = null;
let musicGain = null;
let musicElement = null;
let musicAvailable = false;
let engineInitialized = false;

function ensureContextRunning() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
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

function applyMusicGain() {
  if (!musicGain) return;
  musicGain.gain.value = getAudioSettings().musicVolume;
}

function updateMusicPlayback() {
  if (!musicElement || !musicAvailable) return;
  const { musicEnabled } = getAudioSettings();
  const canPlay = musicEnabled && typeof document !== 'undefined' && document.visibilityState === 'visible';
  if (canPlay) {
    ensureContextRunning();
    musicElement.play().catch(() => {});
  } else {
    musicElement.pause();
  }
}

function loadMusic() {
  musicElement = new Audio(MUSIC_SRC);
  musicElement.loop = true;
  musicElement.preload = 'auto';

  // Optional asset: a 404 or a decode failure just means no background
  // music this session, not a broken app — same policy as the intro
  // video's missing-file handling in js/ui/intro-video.js.
  musicElement.addEventListener('error', () => {
    musicAvailable = false;
  });
  musicElement.addEventListener(
    'canplaythrough',
    () => {
      musicAvailable = true;
      updateMusicPlayback();
    },
    { once: true }
  );

  const musicSource = audioContext.createMediaElementSource(musicElement);
  musicSource.connect(musicGain);
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    if (musicElement) musicElement.pause();
  } else {
    // "Settings and app state allow" = the music toggle is still on and
    // the file actually loaded earlier; updateMusicPlayback() re-checks
    // both rather than blindly resuming just because the tab is visible
    // again.
    updateMusicPlayback();
  }
}

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

    prevMistakes = state.mistakes;
    prevStatus = state.status;
    prevSelectedIndex = state.selectedIndex;
  });
}

/**
 * Must be called synchronously from within the page's first user-gesture
 * handler (click/keydown) — see the module doc comment above. Safe to
 * call more than once; every call after the first is a no-op, so a
 * caller doesn't need to track "did this already happen" itself.
 */
export function initAudioEngine() {
  if (engineInitialized) return;
  engineInitialized = true;

  // No AudioContext support at all: every playX()/vibrate() call above
  // already checks for a live `audioContext`/`navigator.vibrate` before
  // doing anything, so simply never creating one makes the whole engine
  // a harmless no-op rather than a thrown error.
  if (!AudioContextCtor) return;

  audioContext = new AudioContextCtor();

  sfxMasterGain = audioContext.createGain();
  musicGain = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();

  // Every sound funnels through one shared compressor before hitting
  // the speakers — individual tone envelopes already stay well under
  // full scale (see playTone's peakGain values), but several sounds can
  // legitimately overlap (a wrong digit fires a click *and* an error
  // tone in the same instant); the compressor is a cheap safety margin
  // against that sum ever clipping, rather than something load-bearing.
  sfxMasterGain.connect(compressor);
  musicGain.connect(compressor);
  compressor.connect(audioContext.destination);

  applySfxGain();
  applyMusicGain();
  ensureContextRunning();
  loadMusic();

  onAudioSettingsChange(() => {
    applySfxGain();
    applyMusicGain();
    updateMusicPlayback();
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);

  initAudioReactions();
}
