/**
 * What the achievement UI says, as plain values: counts, the category
 * filter, each achievement's progress and unlock line, and the summary
 * of a batch of unlocks. Pure — no DOM, no storage — so the wording is
 * tested in Node; js/ui/achievements-screen.js, js/ui/completion-dialog.js
 * and js/ui/achievement-toasts.js only put it on screen.
 *
 * Input is js/achievement-store.js's getAchievements() list: each
 * definition plus `current`, `fraction`, `unlocked`, `unlockedAt`,
 * `backfilled`.
 */

import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from './achievement-catalog.js';
import { formatElapsedTime } from './completion.js';

export const ALL_CATEGORIES = 'all';

const formatCount = (n) => n.toLocaleString('en-US');

function countUnlocked(achievements) {
  return { unlocked: achievements.filter((achievement) => achievement.unlocked).length, total: achievements.length };
}

/** Unlocked / total overall, and per category in catalog order. */
export function summarizeAchievements(achievements) {
  return {
    ...countUnlocked(achievements),
    categories: ACHIEVEMENT_CATEGORIES.map(({ id, label }) => ({
      id,
      label,
      ...countUnlocked(achievements.filter((achievement) => achievement.category === id)),
    })),
  };
}

export function filterByCategory(achievements, categoryId) {
  if (categoryId === ALL_CATEGORIES) return achievements;
  return achievements.filter((achievement) => achievement.category === categoryId);
}

// How the "current / target" line reads for each kind of metric.
const PROGRESS_FORMATS = [
  [(metric) => metric.startsWith('bestScore:'), (current, target) => `Best score ${formatCount(current)} of ${formatCount(target)}`],
  [(metric) => metric === 'earnedScore', (current, target) => `${formatCount(current)} of ${formatCount(target)} points`],
  [(metric) => metric === 'difficultiesWon', (current, target) => `${current} of ${target} difficulties`],
  [(metric) => metric === 'bestWinStreak' || metric === 'bestDailyStreak', (current, target) => `Best streak ${current} of ${target}`],
];

/**
 * A locked achievement's progress, in words: "3 of 10", "Best 4:10 —
 * goal 2:30", "No win yet". Times are lower-is-better, so they show the
 * best so far against the goal rather than a count.
 */
export function describeProgress({ metric, target, comparison, current }) {
  if (comparison === 'atMost') {
    return current === null ? 'No win yet' : `Best ${formatElapsedTime(current)} — goal ${formatElapsedTime(target)}`;
  }
  const format = PROGRESS_FORMATS.find(([matches]) => matches(metric));
  return format ? format[1](current, target) : `${formatCount(current)} of ${formatCount(target)}`;
}

/** "Oct 7, 2026" in the player's locale. */
export function formatUnlockDate(epochMs) {
  return new Date(epochMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** When it was unlocked — "Oct 7, 2026" — noting if it was credited from earlier games. */
export function describeUnlockDate({ unlockedAt, backfilled }, formatDate = formatUnlockDate) {
  return `${formatDate(unlockedAt)}${backfilled ? ' · from earlier games' : ''}`;
}

/** 'YYYY-MM-DD' (progress.trackingSince) → the same local calendar day's epoch ms. */
export function dateKeyToEpochMs(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

const byId = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

/**
 * One batch of simultaneous unlocks, ready to show: `{ count, title,
 * shown, more, list, sentence }`. `shown` is the first `limit`
 * achievements (catalog definitions), `more` how many weren't listed,
 * `list` their names in words ("A, B and 2 more"). IDs this catalog
 * doesn't know are skipped.
 */
export function describeUnlockBatch(ids, limit = 3) {
  const achievements = [...new Set(ids)].map((id) => byId.get(id)).filter(Boolean);
  const count = achievements.length;
  const shown = achievements.slice(0, limit);
  const more = count - shown.length;
  const title = count === 1 ? 'Achievement unlocked' : `${count} achievements unlocked`;
  const names = shown.map((achievement) => achievement.name);
  const list = more > 0 ? `${names.join(', ')} and ${more} more` : joinNames(names);
  return { count, title, shown, more, list, sentence: count === 0 ? '' : `${title}: ${list}.` };
}

function joinNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
