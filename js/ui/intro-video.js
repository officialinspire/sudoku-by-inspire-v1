import { showScreen, getCurrentScreen } from '../screens.js';

const video = document.getElementById('intro-video');
const skipBtn = document.getElementById('skip-intro-btn');
const fadeOverlay = document.getElementById('menu-fade-overlay');

const FADE_DURATION_MS = 800;

// How long the intro may sit without actually playing — before its first
// frame, or frozen mid-way waiting on data — before the app gives up and
// shows the menu. The video is preload="none" (index.html), so on a slow
// connection its bytes only start arriving after the Start tap; this
// keeps a stalled download from ever stranding the player on a black
// screen, while the Skip button covers anyone who'd rather not wait.
const INTRO_STALL_TIMEOUT_MS = 4000;
let stallTimer = null;

function armStallTimer() {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(finishIntro, INTRO_STALL_TIMEOUT_MS);
}

function clearStallTimer() {
  clearTimeout(stallTimer);
  stallTimer = null;
}

/**
 * A brief black-screen fade revealing the menu, whether the video ended
 * naturally or was skipped — both are "the intro just finished" from the
 * player's point of view, so both get the same transition rather than
 * only the natural-end path. Skipped entirely under reduced motion
 * (not just sped up) rather than trying to interrupt a CSS transition
 * that may not even be declared in that case — see styles.css's
 * .menu-fade-overlay, whose transition only exists inside
 * `@media (prefers-reduced-motion: no-preference)`.
 */
function playMenuFadeIn() {
  if (!fadeOverlay) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  fadeOverlay.hidden = false;
  fadeOverlay.classList.add('is-visible');
  void fadeOverlay.offsetWidth; // force a reflow so "visible" registers as a real starting state
  fadeOverlay.classList.remove('is-visible');
  setTimeout(() => {
    fadeOverlay.hidden = true;
  }, FADE_DURATION_MS);
}

function finishIntro() {
  // Skip, 'ended', 'error', a rejected play(), and the stall timer can
  // all race (a missing file fires both 'error' and the play() rejection)
  // — only the first one should leave the intro.
  if (getCurrentScreen() !== 'intro') return;
  clearStallTimer();
  video.pause();
  showScreen('menu');
  playMenuFadeIn();
}

export function initIntroScreen() {
  skipBtn.addEventListener('click', finishIntro);
  video.addEventListener('ended', finishIntro);
  video.addEventListener('playing', clearStallTimer);
  // 'waiting' = playback stopped for lack of data. Not 'stalled', which
  // also fires while playback continues happily from the buffer.
  video.addEventListener('waiting', () => {
    if (getCurrentScreen() === 'intro') armStallTimer();
  });

  // Missing/corrupt video file: don't strand the user on a broken
  // screen. But browsers can start probing a <video>'s `src` for
  // metadata the instant the page loads, independent of any user
  // gesture — so this 'error' event can fire before the Start screen
  // has ever been clicked (confirmed in this sandbox's headless
  // Chromium, which can't decode the file's codec and errors out within
  // milliseconds of load). Only treat it as "the intro failed, skip to
  // menu" while the intro screen is actually the active one; otherwise
  // it's an early, harmless probe failure unrelated to playIntro() ever
  // running, and must not silently bypass the Start gate — audio
  // initialization is tied to that exact first gesture (see js/audio.js).
  video.addEventListener('error', () => {
    if (getCurrentScreen() === 'intro') finishIntro();
  });
}

export function playIntro() {
  showScreen('intro');
  video.currentTime = 0;
  armStallTimer();

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    // Playback is unmuted (allowed here because play() runs synchronously
    // inside the Start screen's click/keydown handler — see index.js) but
    // autoplay can still be blocked in some contexts; fall back to the
    // menu rather than showing a frozen screen.
    playPromise.catch(finishIntro);
  }
}
