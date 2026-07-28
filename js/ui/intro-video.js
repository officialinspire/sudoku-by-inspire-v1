import { showScreen, getCurrentScreen } from '../screens.js';

const video = document.getElementById('intro-video');
const skipBtn = document.getElementById('skip-intro-btn');

function finishIntro() {
  video.pause();
  showScreen('menu');
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
    // Autoplay can be blocked by the browser even with muted video in some
    // contexts; fall back to the menu rather than showing a frozen screen.
    playPromise.catch(finishIntro);
  }
}
