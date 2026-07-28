import { showScreen } from './js/screens.js';
import { initStartScreen } from './js/ui/start-screen.js';
import { initIntroScreen, playIntro } from './js/ui/intro-video.js';
import { initMenuScreen } from './js/ui/menu.js';

initIntroScreen();
initMenuScreen();
initStartScreen(() => playIntro());

showScreen('start');
