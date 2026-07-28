import { showScreen } from './js/screens.js';
import { initTheme } from './js/theme.js';
import { initStartScreen } from './js/ui/start-screen.js';
import { initIntroScreen, playIntro } from './js/ui/intro-video.js';
import { initMenuScreen } from './js/ui/menu.js';
import { initSettingsDialog } from './js/ui/settings.js';

initTheme();
initIntroScreen();
initMenuScreen();
initSettingsDialog();
initStartScreen(() => playIntro());

showScreen('start');
