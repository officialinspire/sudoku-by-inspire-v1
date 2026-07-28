import { showScreen } from '../screens.js';

const video = document.getElementById('intro-video');
const skipBtn = document.getElementById('skip-intro-btn');

function finishIntro() {
  video.pause();
  showScreen('menu');
}

export function initIntroScreen() {
  skipBtn.addEventListener('click', finishIntro);
  video.addEventListener('ended', finishIntro);
  // Missing/corrupt video file: don't strand the user on a broken screen.
  video.addEventListener('error', finishIntro);
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
