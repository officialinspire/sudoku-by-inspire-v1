/**
 * Background music: one looping HTMLAudioElement per track ("menu" =
 * Sudoku Zen, "gameplay" = Logic Flow), driven by an explicit state
 * machine. Deliberately independent of the SFX AudioContext — see
 * js/audio.js's header comment (Phase 14q) for why music must never route
 * through Web Audio. Everything environment-specific (the Audio
 * constructor, timers, animation frames, settings) is injected, so this
 * module has no DOM dependencies and is tested in Node
 * (js/music-player.test.js).
 *
 * The one rule: a track makes sound only while `shouldPlay(track)` —
 * it's the target track (js/audio.js maps screens to targets; Start,
 * Intro and a completed game have none), the page is visible and not
 * being unloaded, and music is on with a volume above zero. Every input
 * (target, page activity, settings, a user gesture, an element event)
 * ends in `reconcile()`, which moves each track toward that rule. So
 * nothing can restart music while hidden, muted, in the intro, or after
 * completion.
 *
 * Track status:
 *   idle      — not playing, nothing pending
 *   starting  — play() requested, waiting for playback to begin
 *   playing   — confirmed playing (a 'playing' event or resolved play())
 *   blocked   — the browser refused autoplay (NotAllowedError); waits
 *               for the next user gesture, never a timer
 *   retrying  — a transient failure; one retry timer pending
 *   failed    — retries exhausted (until a fresh start), or the file is
 *               missing/unsupported (`unavailable`: for the whole session)
 */

const FADE_SECONDS = 1.8;
const FADE_TIME_CONSTANT = FADE_SECONDS / 4;
// Outgoing tracks are paused once their fade-out has finished.
const PAUSE_AFTER_FADE_MS = FADE_SECONDS * 1000 + 50;

// A transient failure (network hiccup, a stall, the OS pausing the
// element) gets a few spaced-out retries and then stops. A fresh start —
// the page becoming visible, a tap, music being switched on, a new
// target — earns another round. Never an endless loop. (During play,
// every digit tap is a gesture, so the budget refills naturally.)
export const RETRY_DELAYS_MS = [500, 2000, 6000];
// How long playback may sit waiting for data — before starting, or
// mid-track — before it counts as a transient failure.
export const STALL_TIMEOUT_MS = 8000;

const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
const TIMER_KINDS = ['retry', 'watchdog', 'pause'];

function clamp01(value) {
  // Setting <audio>.volume to NaN throws — and would kill a fade loop.
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * iOS Safari ignores writes to HTMLMediaElement.volume (it always reads
 * back 1; loudness is the hardware buttons' job). There, fades would be
 * inaudible and a "crossfade" would play both tracks at full volume for
 * the whole fade — so on such browsers tracks switch with a hard cut.
 */
function detectVolumeControl(element) {
  try {
    element.volume = 0.5;
    const settable = Math.abs(element.volume - 0.5) < 0.01;
    element.volume = 0;
    return settable;
  } catch {
    return false;
  }
}

export function createMusicPlayer({ sources, createAudio, timers, frames, getSettings }) {
  let target = null;
  let pageActive = true;
  const tracks = new Map();
  for (const [name, src] of Object.entries(sources)) tracks.set(name, createTrack(name, src));
  const volumeControl = detectVolumeControl(tracks.values().next().value.element);
  let wasAudible = isAudible();

  // ------------------------------------------------------------ rules

  function isAudible() {
    const { musicEnabled, musicVolume } = getSettings();
    return musicEnabled && musicVolume > 0;
  }

  function shouldPlay(track) {
    return track.name === target && pageActive && !track.unavailable && isAudible();
  }

  // ----------------------------------------------------------- tracks

  function createTrack(name, src) {
    const element = createAudio(src);
    element.loop = true;
    // With music off, don't even download/buffer the tracks; switching it
    // on (settingsChanged) upgrades this.
    element.preload = isAudible() ? 'auto' : 'none';
    const track = {
      name,
      element,
      status: 'idle',
      unavailable: false,
      hasPlayed: false,
      unlocked: false,
      needsReload: false,
      retries: 0,
      // Bumped whenever an in-flight play() stops mattering (we paused,
      // reloaded, or gave up on it), so its late resolve/reject is ignored.
      playToken: 0,
      fadeLevel: 0,
      fadeTarget: 0,
      fadeFrame: null,
      timers: { retry: null, watchdog: null, pause: null },
    };
    // Silent until a fade raises it: an element's default volume is 1,
    // so without this a track's first frames would blip at full volume.
    element.volume = 0;
    element.addEventListener('playing', () => onPlaying(track));
    element.addEventListener('pause', () => onExternalPause(track));
    element.addEventListener('waiting', () => onWaiting(track));
    element.addEventListener('error', () => onMediaError(track));
    return track;
  }

  // One pending timer of each kind per track: setting one cancels its
  // predecessor, so repeated events never stack timers up.
  function setTrackTimer(track, kind, delayMs, callback) {
    clearTrackTimer(track, kind);
    track.timers[kind] = timers.setTimeout(() => {
      track.timers[kind] = null;
      callback();
    }, delayMs);
  }

  function clearTrackTimer(track, kind) {
    if (track.timers[kind] === null) return;
    timers.clearTimeout(track.timers[kind]);
    track.timers[kind] = null;
  }

  // ----------------------------------------------------------- volume

  // Audible volume = this track's crossfade position × the user's slider.
  function applyVolume(track) {
    track.element.volume = clamp01(track.fadeLevel * getSettings().musicVolume);
  }

  function cancelFade(track) {
    if (track.fadeFrame === null) return;
    frames.cancel(track.fadeFrame);
    track.fadeFrame = null;
  }

  /**
   * An exponential approach toward `level` (loudness is perceived
   * logarithmically, so a linear ramp sounds abrupt near its end — Phase
   * 14c). Each frame moves a fraction of the remaining distance, so
   * reversing mid-fade blends smoothly from wherever it is. A fade already
   * heading to the same level is left alone rather than restarted.
   */
  function fadeTo(track, level) {
    if (track.fadeFrame !== null && track.fadeTarget === level) return;
    cancelFade(track);
    track.fadeTarget = level;
    if (!volumeControl || track.fadeLevel === level) {
      track.fadeLevel = level;
      applyVolume(track);
      return;
    }
    let lastTimestamp = null;
    const step = (timestamp) => {
      const dt = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      track.fadeLevel += (level - track.fadeLevel) * (1 - Math.exp(-dt / FADE_TIME_CONSTANT));
      if (Math.abs(level - track.fadeLevel) < 0.003) {
        track.fadeLevel = level;
        track.fadeFrame = null;
      } else {
        track.fadeFrame = frames.request(step);
      }
      applyVolume(track);
    };
    track.fadeFrame = frames.request(step);
  }

  // --------------------------------------------------- start and stop

  function requestPlay(track) {
    const token = ++track.playToken;
    track.status = 'starting';
    if (track.needsReload) {
      track.needsReload = false;
      track.element.load();
    }
    setTrackTimer(track, 'watchdog', STALL_TIMEOUT_MS, () => onStall(track, token));
    let attempt;
    try {
      attempt = track.element.play();
    } catch (error) {
      onPlayRejected(track, token, error);
      return;
    }
    // Very old browsers return nothing from play(); the element's own
    // 'playing'/'error' events still report the outcome.
    attempt?.then(
      () => onPlayResolved(track, token),
      (error) => onPlayRejected(track, token, error)
    );
  }

  /** Stops a track immediately and cancels everything pending for it. */
  function pauseNow(track, { resetFade = false } = {}) {
    for (const kind of TIMER_KINDS) clearTrackTimer(track, kind);
    cancelFade(track);
    track.playToken++;
    if (!track.unavailable) track.status = 'idle';
    if (resetFade) {
      track.fadeLevel = 0;
      track.fadeTarget = 0;
      applyVolume(track);
    }
    if (!track.element.paused) track.element.pause();
  }

  function fadeOutThenPause(track) {
    // Only a confirmed-playing track is audible; anything else (starting,
    // retrying, blocked) just stops — there's nothing to fade.
    if (track.status !== 'playing' || !volumeControl) {
      pauseNow(track);
      return;
    }
    clearTrackTimer(track, 'retry');
    clearTrackTimer(track, 'watchdog');
    fadeTo(track, 0);
    if (track.timers.pause !== null) return; // a fade-out is already counting down
    setTrackTimer(track, 'pause', PAUSE_AFTER_FADE_MS, () => {
      if (!shouldPlay(track)) pauseNow(track);
    });
  }

  function startOrContinue(track) {
    clearTrackTimer(track, 'pause'); // cancels a stale pause from an earlier fade-out
    if (track.status === 'idle') requestPlay(track);
    if (track.status === 'playing') fadeTo(track, 1);
  }

  function reconcile() {
    for (const track of tracks.values()) {
      if (shouldPlay(track)) startOrContinue(track);
      // Hidden pages get no animation frames (a fade would never finish)
      // and should go quiet at once; the next fade-in starts from silence.
      else if (!pageActive) pauseNow(track, { resetFade: true });
      else fadeOutThenPause(track);
    }
  }

  // ------------------------------------------------ outcomes & failure

  function markPlaying(track) {
    clearTrackTimer(track, 'watchdog');
    track.status = 'playing';
    track.hasPlayed = true;
    track.unlocked = true;
    // `retries` is deliberately NOT reset here: if something keeps
    // pausing a track right after each successful restart, resetting on
    // success would turn the bounded retries into an endless loop. Only a
    // fresh start (freshStart below) refills them.
    if (shouldPlay(track)) fadeTo(track, 1);
    else fadeOutThenPause(track); // started just as it stopped being wanted
  }

  function onPlayResolved(track, token) {
    if (token === track.playToken) markPlaying(track);
  }

  function onPlaying(track) {
    if (track.status === 'starting' || track.status === 'playing') markPlaying(track);
  }

  function onPlayRejected(track, token, error) {
    if (token !== track.playToken) return; // superseded by our own pause/reload
    clearTrackTimer(track, 'watchdog');
    if (error?.name === 'NotAllowedError') {
      track.status = 'blocked'; // userGesture() retries it
    } else if (error?.name === 'NotSupportedError' && !track.hasPlayed) {
      markUnavailable(track);
    } else {
      retryLater(track, { reload: true });
    }
  }

  function onMediaError(track) {
    track.playToken++; // a pending play() for this load rejects too; it's stale now
    clearTrackTimer(track, 'watchdog');
    // Missing file or unsupported format, before it ever played: the
    // asset policy's "carry on silently" case, for the whole session.
    if (track.element.error?.code === MEDIA_ERR_SRC_NOT_SUPPORTED && !track.hasPlayed) {
      markUnavailable(track);
      return;
    }
    track.needsReload = true;
    if (shouldPlay(track)) retryLater(track, { reload: true });
    else if (track.status !== 'failed') track.status = 'idle';
  }

  // Mobile browsers pause elements on their own — a dialog opening, a
  // notification, an audio-session interruption. Our own pauses set the
  // status first, so a 'pause' while still 'playing' came from outside.
  function onExternalPause(track) {
    // Events arrive as queued tasks, so a 'pause' from one of our own
    // earlier pause() calls (the unlock's, say) can land after playback
    // has already started again — the element itself says it isn't
    // paused, so that event is stale.
    if (track.status !== 'playing' || !track.element.paused) return;
    if (shouldPlay(track)) retryLater(track, { reload: false });
    else track.status = 'idle';
  }

  function onWaiting(track) {
    if (track.status !== 'playing') return;
    const token = track.playToken;
    setTrackTimer(track, 'watchdog', STALL_TIMEOUT_MS, () => onStall(track, token));
  }

  function onStall(track, token) {
    if (token !== track.playToken) return;
    track.element.pause();
    retryLater(track, { reload: true });
  }

  function retryLater(track, { reload }) {
    track.playToken++;
    clearTrackTimer(track, 'watchdog');
    if (reload) track.needsReload = true;
    if (track.retries >= RETRY_DELAYS_MS.length) {
      track.status = 'failed';
      return;
    }
    track.status = 'retrying';
    setTrackTimer(track, 'retry', RETRY_DELAYS_MS[track.retries++], () => {
      track.status = 'idle';
      reconcile();
    });
  }

  function markUnavailable(track) {
    for (const kind of TIMER_KINDS) clearTrackTimer(track, kind);
    cancelFade(track);
    track.unavailable = true;
    track.status = 'failed';
  }

  // A deliberate new attempt: forget exhausted retries and old refusals
  // (permanently missing files stay missing).
  function freshStart(track) {
    track.retries = 0;
    if (!track.unavailable && (track.status === 'failed' || track.status === 'blocked')) track.status = 'idle';
  }

  /**
   * WebKit (iOS especially) only lets an element play without a gesture
   * if play() was once called on it *inside* one. The menu track's first
   * real play comes after the intro ends, which isn't a gesture — so each
   * idle track gets one muted play() + pause() here. Muted because iOS
   * ignores `volume`; paused immediately so nothing is heard. The play()
   * promise always rejects (AbortError — our own pause); only a
   * NotAllowedError means the unlock itself was refused.
   */
  function unlockIdleTracks() {
    for (const track of tracks.values()) {
      // The track about to play gets a real play() right after, which
      // unlocks it just the same.
      if (track.unlocked || track.unavailable || track.status !== 'idle' || shouldPlay(track)) continue;
      track.unlocked = true;
      const { element } = track;
      element.muted = true;
      let attempt = null;
      try {
        attempt = element.play();
      } catch {
        // Synchronous throw (very old browsers): nothing to unlock.
      }
      element.pause();
      element.muted = false;
      attempt?.catch((error) => {
        if (error?.name === 'NotAllowedError') track.unlocked = false;
      });
    }
  }

  // ------------------------------------------------------- public API

  return {
    /** Which track should be heard: 'menu', 'gameplay', or null. */
    setTarget(name) {
      if (name === target) return;
      target = name;
      if (tracks.has(name)) freshStart(tracks.get(name));
      reconcile();
    },

    /** Visible and not being unloaded (visibilitychange/pagehide/pageshow). */
    setPageActive(active) {
      if (active === pageActive) return;
      pageActive = active;
      if (active) tracks.forEach(freshStart);
      reconcile();
    },

    /** Music toggle or volume changed. */
    settingsChanged() {
      for (const track of tracks.values()) applyVolume(track);
      const audible = isAudible();
      if (audible && !wasAudible) {
        for (const track of tracks.values()) track.element.preload = 'auto';
        tracks.forEach(freshStart);
        unlockIdleTracks(); // switching music on is itself a tap
      }
      wasAudible = audible;
      reconcile();
    },

    /**
     * Call synchronously inside every user gesture (the Start tap, and
     * any later tap/click/key). Unlocks tracks the first time, and retries
     * playback the browser refused or that ran out of retries — inside
     * the gesture, where the browser allows it. Does nothing while music
     * is off: switching it on later counts as its own gesture.
     */
    userGesture() {
      if (!isAudible()) return;
      unlockIdleTracks();
      let retried = false;
      for (const track of tracks.values()) {
        if (shouldPlay(track) && (track.status === 'blocked' || track.status === 'failed')) {
          freshStart(track);
          retried = true;
        }
      }
      if (retried) reconcile();
    },

    /** Read-only view for tests and debugging. */
    snapshot() {
      const view = { target, pageActive, volumeControl, tracks: {} };
      for (const track of tracks.values()) {
        view.tracks[track.name] = {
          status: track.status,
          unavailable: track.unavailable,
          retries: track.retries,
          fadeLevel: track.fadeLevel,
          paused: track.element.paused,
          pendingTimers: TIMER_KINDS.filter((kind) => track.timers[kind] !== null),
          fading: track.fadeFrame !== null,
        };
      }
      return view;
    },
  };
}
