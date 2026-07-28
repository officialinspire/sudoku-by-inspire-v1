import { showScreen } from './js/screens.js';
import { initTheme } from './js/theme.js';
import { initGameSettings } from './js/game-settings.js';
import { initStartScreen } from './js/ui/start-screen.js';
import { initIntroScreen, playIntro } from './js/ui/intro-video.js';
import { initMenuScreen } from './js/ui/menu.js';
import { initSettingsDialog } from './js/ui/settings.js';
import { initDifficultyDialog } from './js/ui/difficulty-dialog.js';
import { initGameScreen } from './js/ui/game-screen.js';
import { initBoardView } from './js/ui/board-view.js';
import { initControls } from './js/ui/controls.js';
import { initHintDialog } from './js/ui/hint-dialog.js';
import { initCompletionDialog } from './js/ui/completion-dialog.js';

initTheme();
initGameSettings();
initIntroScreen();
initMenuScreen();
initSettingsDialog();
initDifficultyDialog();
initGameScreen();
initBoardView();
initControls();
initHintDialog();
initCompletionDialog();
initStartScreen(() => playIntro());

showScreen('start');
