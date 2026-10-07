import { showScreen } from '../screens.js';
import { onStateChange } from '../game-state.js';
import { DIFFICULTIES } from '../sudoku-generator.js';
import { estimateScore, formatElapsedTime, buildShareText, findRankInHighScores } from '../completion.js';
import { getHighScores } from '../high-scores-store.js';
import { onAchievementsUnlocked } from '../achievement-store.js';
import { describeUnlockBatch } from '../achievement-view.js';
import { openDifficultyDialog } from './difficulty-dialog.js';
import { refreshAchievementsScreen } from './achievements-screen.js';
import { badgeSvg } from './achievement-badges.js';

// Same star glyph as the High Scores menu button (index.html) — reused
// rather than a new icon, so "you're on the leaderboard" reads as the
// same visual idea in both places.
const RANK_ICON =
  '<svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,3 14.23,8.93 20.56,9.22 15.61,13.17 17.29,19.28 12,15.8 6.71,19.28 8.39,13.17 3.44,9.22 9.77,8.93" fill="currentColor"/></svg>';

const dialog = document.getElementById('completion-dialog');
const titleEl = document.getElementById('completion-title');
const rankBannerEl = document.getElementById('completion-rank-banner');
const difficultyEl = document.getElementById('completion-difficulty');
const timeEl = document.getElementById('completion-time');
const mistakesEl = document.getElementById('completion-mistakes');
const hintsEl = document.getElementById('completion-hints');
const scoreEl = document.getElementById('completion-score');
const shareTextarea = document.getElementById('completion-share-text');
const copyBtn = document.getElementById('btn-copy-results');
const copyConfirmation = document.getElementById('copy-confirmation');
const menuBtn = document.getElementById('btn-completion-menu');
const newGameBtn = document.getElementById('btn-completion-new-game');
const achievementsSection = document.getElementById('completion-achievements');
const achievementsTitleEl = document.getElementById('completion-achievements-title');
const achievementsListEl = document.getElementById('completion-achievements-list');
const achievementsMoreEl = document.getElementById('completion-achievements-more');
const achievementsBtn = document.getElementById('btn-completion-achievements');

const LISTED_UNLOCKS = 5;

let previousStatus = null;

// What the run just won unlocked: js/achievement-store.js announces it
// while js/game-persistence.js records the completion — and that
// module's state listener is registered first (index.js), so for the
// same transition into 'complete' the announcement always arrives
// before this module's own listener opens the dialog.
let lastUnlock = null; // { runId, ids }

/**
 * Top-3 gets the full "New High Score" chip treatment (matches the
 * app's existing .status-chip--success pattern — color paired with an
 * icon and a text label, never color alone). 4th-10th still placed, but
 * quieter: reuses .settings-hint, the same muted-text treatment already
 * used for the dialog's own scoring blurb just below. Outside the top
 * 10 (or no game/store to compare against — rank is null either way),
 * the banner stays hidden entirely rather than saying nothing happened.
 */
function updateRankBanner(rank) {
  rankBannerEl.hidden = rank === null;
  if (rank === null) {
    rankBannerEl.className = 'completion-rank-banner';
    rankBannerEl.textContent = '';
  } else if (rank <= 3) {
    rankBannerEl.className = 'completion-rank-banner status-chip status-chip--success';
    rankBannerEl.innerHTML = `${RANK_ICON}New High Score — Ranked #${rank}!`;
  } else {
    rankBannerEl.className = 'completion-rank-banner settings-hint';
    rankBannerEl.textContent = `Made the leaderboard — ranked #${rank}.`;
  }
}

function buildUnlockItem(achievement, index) {
  const item = document.createElement('li');
  item.style.setProperty('--unlock-index', String(index)); // staggers the badge animation
  item.insertAdjacentHTML('afterbegin', badgeSvg(achievement.category, true));
  const name = document.createElement('span');
  name.textContent = achievement.name;
  item.append(name);
  return item;
}

/**
 * Every achievement this win unlocked, as one batch: a heading with the
 * count, the first few by name, and "…and N more". Hidden (with its
 * View Achievements button) when the win unlocked nothing.
 */
function updateAchievementsSummary(ids) {
  const batch = describeUnlockBatch(ids, LISTED_UNLOCKS);
  const hasUnlocks = batch.count > 0;
  achievementsSection.hidden = !hasUnlocks;
  achievementsBtn.hidden = !hasUnlocks;
  // Read out along with the dialog's title when it opens. Focus starts
  // further down (the share text), so otherwise a screen reader user
  // could finish the dialog without ever hearing about the unlocks.
  if (hasUnlocks) dialog.setAttribute('aria-describedby', 'completion-achievements');
  else dialog.removeAttribute('aria-describedby');
  if (!hasUnlocks) return;

  achievementsTitleEl.textContent = batch.title;
  achievementsListEl.replaceChildren(...batch.shown.map(buildUnlockItem));
  achievementsMoreEl.hidden = batch.more === 0;
  achievementsMoreEl.textContent = `…and ${batch.more} more — see Achievements.`;
}

function showCompletion(state) {
  const config = DIFFICULTIES[state.difficulty];
  const score = estimateScore(state, config);
  const rank = findRankInHighScores(getHighScores(state.difficulty), state, score);

  difficultyEl.textContent = config.label;
  timeEl.textContent = formatElapsedTime(state.elapsedSeconds);
  mistakesEl.textContent = String(state.mistakes);
  hintsEl.textContent = String(state.hintsUsed);
  scoreEl.textContent = String(score);
  updateRankBanner(rank);
  updateAchievementsSummary(lastUnlock?.runId === state.runId ? lastUnlock.ids : []);
  lastUnlock = null;
  shareTextarea.value = buildShareText(state, config, rank);
  copyConfirmation.textContent = '';

  // Re-trigger the celebration animation even on back-to-back completions:
  // removing the class, forcing a reflow, then re-adding is the standard
  // way to restart a CSS animation that's already at its end state — the
  // animation itself only actually runs when reduced motion isn't
  // requested (see styles.css's .celebrate keyframes), so this is a
  // harmless no-op class toggle for players who've turned that off.
  titleEl.classList.remove('celebrate');
  void titleEl.offsetWidth;
  titleEl.classList.add('celebrate');

  dialog.showModal();
}

export function initCompletionDialog() {
  onAchievementsUnlocked((ids, { runId }) => {
    lastUnlock = { runId, ids };
  });

  // Announced once, exactly on the transition into 'complete' — not on
  // every render, which would reopen the dialog after a manual close.
  onStateChange((state) => {
    if (state.status === 'complete' && previousStatus !== 'complete') {
      showCompletion(state);
    }
    previousStatus = state.status;
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareTextarea.value);
      copyConfirmation.textContent = 'Copied!';
    } catch {
      // Clipboard API unavailable or permission denied — the text is
      // still selectable/copyable by hand from the visible textarea,
      // so this isn't a dead end, just a smaller convenience lost.
      shareTextarea.select();
      copyConfirmation.textContent = 'Select and copy the text above.';
    }
  });

  menuBtn.addEventListener('click', () => {
    dialog.close();
    showScreen('menu');
  });

  achievementsBtn.addEventListener('click', () => {
    dialog.close();
    refreshAchievementsScreen();
    showScreen('achievements');
  });

  newGameBtn.addEventListener('click', () => {
    dialog.close();
    openDifficultyDialog();
  });
}
