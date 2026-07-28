import { showScreen } from './js/screens.js';
import { initTheme } from './js/theme.js';
import { initStartScreen } from './js/ui/start-screen.js';
import { initIntroScreen, playIntro } from './js/ui/intro-video.js';
import { initMenuScreen } from './js/ui/menu.js';
import { initSettingsDialog } from './js/ui/settings.js';
import { initDifficultyDialog } from './js/ui/difficulty-dialog.js';
import { initGameScreen } from './js/ui/game-screen.js';
import { initBoardView } from './js/ui/board-view.js';
import { initControls } from './js/ui/controls.js';

initTheme();
initIntroScreen();
initMenuScreen();
initSettingsDialog();
initDifficultyDialog();
initGameScreen();
initBoardView();
initControls();
initStartScreen(() => playIntro());

showScreen('start');
