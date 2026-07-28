import { showScreen, getCurrentScreen } from '../screens.js';

const video = document.getElementById('intro-video');
const skipBtn = document.getElementById('skip-intro-btn');
const fadeOverlay = document.getElementById('menu-fade-overlay');

const FADE_DURATION_MS = 800;

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
  video.pause();
  showScreen('menu');
  playMenuFadeIn();
}

export function initIntroScreen() {
  skipBtn.addEventListener('click', finishIntro);
  video.addEventListener('ended', finishIntro);

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

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    // Playback is unmuted (allowed here because play() runs synchronously
    // inside the Start screen's click/keydown handler — see index.js) but
    // autoplay can still be blocked in some contexts; fall back to the
    // menu rather than showing a frozen screen.
    playPromise.catch(finishIntro);
  }
}
