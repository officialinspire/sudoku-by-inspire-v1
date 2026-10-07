import { showScreen } from '../screens.js';
import { getAchievements, getAchievementProgress } from '../achievement-store.js';
import { ACHIEVEMENT_CATEGORIES } from '../achievement-catalog.js';
import {
  ALL_CATEGORIES,
  summarizeAchievements,
  filterByCategory,
  describeProgress,
  describeUnlockDate,
  formatUnlockDate,
  dateKeyToEpochMs,
} from '../achievement-view.js';
import { badgeSvg } from './achievement-badges.js';
import { initDifficultyFilter } from './difficulty-filter.js';

const backBtn = document.getElementById('btn-achievements-back');
const filterEl = document.getElementById('achievements-category-filter');
const listEl = document.getElementById('achievements-list');
const unlockedCountEl = document.getElementById('achievements-unlocked-count');
const totalCountEl = document.getElementById('achievements-total-count');
const meterFillEl = document.getElementById('achievements-meter-fill');
const trackingNoteEl = document.getElementById('achievements-tracking-note');

const TABS = [{ id: ALL_CATEGORIES, label: 'All' }, ...ACHIEVEMENT_CATEGORIES];

// Read once per visit by refreshAchievementsScreen(), not per tab switch:
// nothing can unlock while this screen is open (unlocks only happen when
// a game is won, or at startup).
let achievements = [];
let filter;

function buildTabs() {
  for (const { id, label } of TABS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'difficulty-filter-btn achievement-tab';
    tab.dataset.category = id;
    tab.innerHTML = `<span class="achievement-tab-label"></span><span class="achievement-tab-count"></span>`;
    tab.querySelector('.achievement-tab-label').textContent = label;
    filterEl.append(tab);
  }
}

function renderCounts() {
  const summary = summarizeAchievements(achievements);
  unlockedCountEl.textContent = String(summary.unlocked);
  totalCountEl.textContent = String(summary.total);
  meterFillEl.style.setProperty('--fraction', String(summary.total === 0 ? 0 : summary.unlocked / summary.total));

  const counts = new Map([[ALL_CATEGORIES, summary], ...summary.categories.map((category) => [category.id, category])]);
  for (const tab of filterEl.querySelectorAll('[data-category]')) {
    const { unlocked, total } = counts.get(tab.dataset.category);
    const label = tab.querySelector('.achievement-tab-label').textContent;
    tab.querySelector('.achievement-tab-count').textContent = `${unlocked}/${total}`;
    // The visible "3/10" runs into the label for a screen reader
    // ("Speed3/10"), so the tab gets a spoken name of its own.
    tab.setAttribute('aria-label', `${label}, ${unlocked} of ${total} unlocked`);
  }
}

function renderTrackingNote() {
  const since = formatUnlockDate(dateKeyToEpochMs(getAchievementProgress().trackingSince));
  trackingNoteEl.textContent =
    `Tracked on this device since ${since}. Wins, speed and score goals also count games from before then; ` +
    'perfect and no-hint games, streaks, and playstyle goals count from then on.';
}

function textElement(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function buildStatusLine(achievement) {
  const status = document.createElement('p');
  status.className = 'achievement-status';
  if (achievement.unlocked) {
    status.append(textElement('span', 'achievement-state achievement-state--unlocked', '✓ Unlocked'));
    status.append(textElement('span', 'achievement-date', describeUnlockDate(achievement)));
  } else {
    status.append(textElement('span', 'achievement-state', 'Locked'));
    status.append(textElement('span', 'achievement-progress-text', describeProgress(achievement)));
  }
  return status;
}

// Decorative: the progress text beside it says the same in words.
function buildProgressBar(fraction) {
  const bar = document.createElement('div');
  bar.className = 'achievement-progress';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'achievement-progress-fill';
  fill.style.setProperty('--fraction', String(fraction));
  bar.append(fill);
  return bar;
}

function buildCard(achievement) {
  const card = document.createElement('li');
  card.className = `achievement-card ${achievement.unlocked ? 'is-unlocked' : 'is-locked'}`;
  card.dataset.achievementId = achievement.id;
  card.insertAdjacentHTML('afterbegin', badgeSvg(achievement.category, achievement.unlocked));

  const body = document.createElement('div');
  body.className = 'achievement-body';
  body.append(
    textElement('h2', 'achievement-name', achievement.name),
    textElement('p', 'achievement-requirement', achievement.description),
    buildStatusLine(achievement)
  );
  if (!achievement.unlocked) body.append(buildProgressBar(achievement.fraction));
  card.append(body);
  return card;
}

function renderList(categoryId) {
  listEl.replaceChildren(...filterByCategory(achievements, categoryId).map(buildCard));
}

export function initAchievementsScreen() {
  buildTabs();
  filter = initDifficultyFilter(filterEl, renderList, 'category');
  backBtn.addEventListener('click', () => showScreen('menu'));
}

// Unlocks happen elsewhere (a won game), so the screen re-reads
// everything each time it's shown, keeping whichever tab was selected.
export function refreshAchievementsScreen() {
  achievements = getAchievements();
  renderCounts();
  renderTrackingNote();
  renderList(filter.getSelected());
}
