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
 * two named tracks — "Sudoku Zen.mp3" for the menu family of screens and
 * "Logic Flow.mp3" for gameplay — are loaded and looped if present; if
 * either doesn't exist, that track's `<audio>` element's `error` event
 * marks it unavailable and the app carries on silently, the same
 * graceful-missing-asset pattern already used for the intro video in
 * js/ui/intro-video.js. Only one track plays at a time; switching tracks
 * (via `js/screens.js`'s `onScreenChange`, a game-state pause/resume, or
 * game completion) crossfades rather than cutting instantly.
 */

import { getAudioSettings, onAudioSettingsChange } from './audio-settings.js';
import { onStateChange, getState } from './game-state.js';
import { onScreenChange, getCurrentScreen } from './screens.js';

const MUSIC_FADE_SECONDS = 1.8;
const MUSIC_TRACK_SOURCES = {
  menu: './Sudoku Zen.mp3',
  gameplay: './Logic Flow.mp3',
};

// Safari (until fairly recently) only exposes this under a vendor
// prefix. Older/locked-down browsers may have neither — captured once so
// every call site below can just check `AudioContextCtor` truthiness.
const AudioContextCtor =
  typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined;

let audioContext = null;
let sfxMasterGain = null;
let musicGain = null;
let musicTracks = null; // { menu: Track, gameplay: Track }, built once the engine initializes
let activeTrackName = null; // 'menu' | 'gameplay' | null
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
  // The master `musicGain` node still tracks the volume slider directly
  // (matches applySfxGain's reasoning: an in-flight fade updates live).
  // Each track's *own* gain node (created in createMusicTrack) is purely
  // the 0/1 "is this the active track" fade value — the two multiply
  // together in the audio graph, so neither has to know about the other.
  if (!musicGain) return;
  musicGain.gain.value = getAudioSettings().musicVolume;
}

/**
 * One background-music track: its own `<audio>` element (so each track
 * can be independently paused/loaded without touching the other) and its
 * own gain node used purely for fade-in/fade-out, feeding into the
 * shared `musicGain` (the actual volume-slider control) below it.
 */
function createMusicTrack(name, src) {
  const track = {
    element: new Audio(encodeURI(src)),
    gain: audioContext.createGain(),
    available: false,
  };
  track.element.loop = true;
  track.element.preload = 'auto';
  track.gain.gain.value = 0;

  // Optional asset: a 404 or a decode failure just means this track
  // isn't available this session, not a broken app — same policy as the
  // intro video's missing-file handling in js/ui/intro-video.js.
  track.element.addEventListener('error', () => {
    track.available = false;
  });
  track.element.addEventListener(
    'canplaythrough',
    () => {
      track.available = true;
      // Loading is async — the screen that wants this track playing may
      // already have been shown (and setActiveMusicTrack already called)
      // *before* the file finished loading, in which case that earlier
      // call saw `available: false` and did nothing. This is the retry:
      // if this track is (still) the active one, actually start it now.
      if (activeTrackName === name) updateMusicPlayback();
    },
    { once: true }
  );

  const source = audioContext.createMediaElementSource(track.element);
  source.connect(track.gain);
  track.gain.connect(musicGain);
  return track;
}

/**
 * An exponential approach toward targetGain rather than a straight
 * linear ramp. Linear gain ramps sound abrupt to the ear — loudness is
 * perceived roughly logarithmically, so a constant-rate gain change
 * reads as "holding, holding, holding... then suddenly cut/appear" near
 * the tail end rather than a smooth crossfade. setTargetAtTime's
 * exponential curve matches how volume actually sounds instead, and
 * since it's just "keep moving toward wherever the target is *from
 * wherever gain currently sits*," re-triggering it mid-fade (e.g. a
 * fast pause/resume) blends into the new direction with no audible
 * discontinuity — restarting a linear ramp mid-flight can't do that as
 * cleanly. `seconds / 4` as the time constant: after 4 time constants
 * the curve has covered ~98% of the distance to target, so the fade
 * reads as "done" right around `seconds`, matching the old linear
 * ramp's timing for every setTimeout that waits on MUSIC_FADE_SECONDS.
 */
function fadeTrackGainTo(track, targetGain, seconds) {
  const now = audioContext.currentTime;
  track.gain.gain.cancelScheduledValues(now);
  track.gain.gain.setValueAtTime(track.gain.gain.value, now);
  track.gain.gain.setTargetAtTime(targetGain, now, seconds / 4);
}

function canPlayMusicNow() {
  return getAudioSettings().musicEnabled && typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/**
 * Switches which track is playing — 'menu', 'gameplay', or null (stop
 * entirely, used on puzzle completion). Crossfades rather than cutting:
 * the incoming track starts playing *before* its fade-in begins (so
 * there's no silent gap), and the outgoing track is only paused once its
 * fade-out has actually finished (so the cut isn't audible either).
 * Calling this with the name already active is a harmless no-op.
 */
function setActiveMusicTrack(name) {
  if (!musicTracks || activeTrackName === name) return;
  activeTrackName = name;

  for (const [trackName, track] of Object.entries(musicTracks)) {
    if (trackName === name) {
      if (track.available && canPlayMusicNow()) {
        ensureContextRunning();
        track.element.play().catch(() => {});
        fadeTrackGainTo(track, 1, MUSIC_FADE_SECONDS);
      }
    } else {
      fadeTrackGainTo(track, 0, MUSIC_FADE_SECONDS);
      setTimeout(() => {
        // Only pause if nothing re-activated this track while we waited
        // out the fade (e.g. rapid screen switching).
        if (activeTrackName !== trackName) track.element.pause();
      }, MUSIC_FADE_SECONDS * 1000 + 50);
    }
  }
}

function updateMusicPlayback() {
  // Re-applies "should the active track actually be audible right now"
  // — called after a settings change (mute toggled) or the tab
  // regaining visibility, neither of which changes *which* track is
  // active, just whether it's allowed to be heard.
  if (!musicTracks || !activeTrackName) return;
  const track = musicTracks[activeTrackName];
  if (!track.available) return;
  if (canPlayMusicNow()) {
    ensureContextRunning();
    track.element.play().catch(() => {});
    fadeTrackGainTo(track, 1, MUSIC_FADE_SECONDS);
  } else {
    fadeTrackGainTo(track, 0, MUSIC_FADE_SECONDS);
    setTimeout(() => track.element.pause(), MUSIC_FADE_SECONDS * 1000 + 50);
  }
}

function loadMusicTracks() {
  musicTracks = {
    menu: createMusicTrack('menu', MUSIC_TRACK_SOURCES.menu),
    gameplay: createMusicTrack('gameplay', MUSIC_TRACK_SOURCES.gameplay),
  };
}

/**
 * The menu "family" of screens (main menu, Statistics, High Scores) all
 * share the menu track — they're all reached from, and lead back to,
 * the same context, and switching tracks every time you tap into
 * Statistics and back would be more distracting than helpful. Start and
 * Intro get no music of their own (Start is silent until the very first
 * gesture; Intro is a brief, self-contained moment). Game gets the
 * gameplay track — matches "fade in once a new level is started."
 */
const SCREEN_MUSIC_TRACK = {
  menu: 'menu',
  statistics: 'menu',
  highscores: 'menu',
  game: 'gameplay',
};

/**
 * The game screen is the one case where "which track should be playing"
 * depends on more than just which screen is showing: pausing mid-game
 * (Escape, or the in-game pause overlay) opens what's functionally an
 * in-game menu, so the menu track fades in the same as if the player had
 * actually navigated to the main menu — then fades back to "Logic Flow"
 * on resume. Every other screen only ever depends on SCREEN_MUSIC_TRACK.
 */
function activeTrackForContext(screenId, gameStatus) {
  if (screenId === 'game' && gameStatus === 'paused') return 'menu';
  return SCREEN_MUSIC_TRACK[screenId] ?? null;
}

// Reads live game state rather than caching the last-seen status — a
// fresh game's `showScreen('game')` fires before `startGame()` resolves
// (see js/ui/difficulty-dialog.js), so a cached status from the
// *previous* game (e.g. left 'paused') would otherwise leak into the new
// one's very first track resolution.
function syncActiveMusicTrack() {
  setActiveMusicTrack(activeTrackForContext(getCurrentScreen(), getState().status));
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    if (musicTracks) {
      for (const track of Object.values(musicTracks)) track.element.pause();
    }
  } else {
    // "Settings and app state allow" = the music toggle is still on and
    // the active track actually loaded earlier; updateMusicPlayback()
    // re-checks both rather than blindly resuming just because the tab
    // is visible again.
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
      // "Loops until level completion" — stop rather than let it keep
      // looping under the completion dialog; the next screen change
      // (Menu or a fresh New Game) picks the right track back up.
      setActiveMusicTrack(null);
    } else if (state.mistakes > prevMistakes) {
      playError();
    } else if (isRealSelectionChange) {
      playSelect();
    }

    // Pause/resume during a game crossfades between the gameplay and menu
    // tracks (see activeTrackForContext) — 'complete' is handled by the
    // explicit setActiveMusicTrack(null) above instead, so skip it here
    // to avoid fighting that with a "menu" resolution.
    if (state.status !== prevStatus && state.status !== 'complete') {
      syncActiveMusicTrack();
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
  loadMusicTracks();

  onAudioSettingsChange(() => {
    applySfxGain();
    applyMusicGain();
    updateMusicPlayback();
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Picks the right music track for whatever screen is showing right
  // when the engine finishes initializing (e.g. the menu, if it's
  // already visible by the time the Start-screen gesture unlocks
  // audio), then keeps it in sync with every screen change after.
  onScreenChange(() => {
    syncActiveMusicTrack();
  });
  syncActiveMusicTrack();

  initAudioReactions();
}
