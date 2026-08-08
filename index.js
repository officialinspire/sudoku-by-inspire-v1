import { showScreen } from './js/screens.js';
import { initTheme } from './js/theme.js';
import { initGameSettings } from './js/game-settings.js';
import { initAudioSettings } from './js/audio-settings.js';
import { initAudioEngine } from './js/audio.js';
import { initGamePersistence } from './js/game-persistence.js';
import { initStartScreen } from './js/ui/start-screen.js';
import { initIntroScreen, playIntro } from './js/ui/intro-video.js';
import { initMenuScreen } from './js/ui/menu.js';
import { initSettingsDialog } from './js/ui/settings.js';
import { initDifficultyDialog } from './js/ui/difficulty-dialog.js';
import { initNewGameConfirmDialog } from './js/ui/new-game-confirm-dialog.js';
import { initClearDataDialog } from './js/ui/clear-data-dialog.js';
import { initClearDifficultyDialog } from './js/ui/clear-difficulty-dialog.js';
import { initGameScreen } from './js/ui/game-screen.js';
import { initBoardView } from './js/ui/board-view.js';
import { initControls } from './js/ui/controls.js';
import { initHintDialog } from './js/ui/hint-dialog.js';
import { initCompletionDialog } from './js/ui/completion-dialog.js';
import { initStatisticsScreen } from './js/ui/statistics-screen.js';
import { initHighScoresScreen } from './js/ui/high-scores-screen.js';
import { initAudioBindings } from './js/ui/audio-bindings.js';
import { initConnectionStatus } from './js/ui/connection-status.js';
import { initServiceWorker } from './js/sw-register.js';

initTheme();
initGameSettings();
initAudioSettings();
initGamePersistence();
initIntroScreen();
initMenuScreen();
initSettingsDialog();
initDifficultyDialog();
initNewGameConfirmDialog();
initClearDataDialog();
initClearDifficultyDialog();
initGameScreen();
initBoardView();
initControls();
initHintDialog();
initCompletionDialog();
initStatisticsScreen();
initHighScoresScreen();
initAudioBindings();
initConnectionStatus();
initServiceWorker();

// initAudioEngine() must run synchronously inside this same gesture
// handler, not just "sometime after" it — browsers only treat an
// AudioContext as user-unlocked if it's created/resumed within the
// actual call stack of a real click/keydown event. Calling it here,
// right alongside playIntro(), ties both to the exact same gesture.
initStartScreen(() => {
  initAudioEngine();
  playIntro();
});

showScreen('start');
