import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CATEGORIES,
  summarizeAchievements,
  filterByCategory,
  describeProgress,
  describeUnlockDate,
  formatUnlockDate,
  dateKeyToEpochMs,
  describeUnlockBatch,
} from './achievement-view.js';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from './achievement-catalog.js';

// The shape js/achievement-store.js's getAchievements() returns: every
// 7th one unlocked.
const list = ACHIEVEMENTS.map((achievement, i) => ({
  ...achievement,
  current: achievement.comparison === 'atMost' ? null : 0,
  fraction: 0,
  unlocked: i % 7 === 0,
  unlockedAt: i % 7 === 0 ? 1_790_000_000_000 : null,
  backfilled: false,
}));

describe('counts and category filter', () => {
  test('unlocked of total, overall and per category in catalog order', () => {
    const summary = summarizeAchievements(list);
    assert.equal(summary.total, 100);
    assert.equal(summary.unlocked, list.filter((a) => a.unlocked).length);
    assert.deepEqual(summary.categories.map((c) => c.id), ACHIEVEMENT_CATEGORIES.map((c) => c.id));
    assert.deepEqual(summary.categories.map((c) => c.total), [15, 20, 10, 10, 10, 10, 10, 10, 5]);
    assert.equal(summary.categories.reduce((sum, c) => sum + c.unlocked, 0), summary.unlocked);
  });

  test('"All" is everything; each category is exactly its own, in catalog order', () => {
    assert.equal(filterByCategory(list, ALL_CATEGORIES), list);
    const regrouped = ACHIEVEMENT_CATEGORIES.flatMap(({ id }) => filterByCategory(list, id));
    assert.deepEqual(regrouped.map((a) => a.id), list.map((a) => a.id), 'the categories partition the list');
    for (const { id } of ACHIEVEMENT_CATEGORIES) {
      assert.ok(filterByCategory(list, id).every((a) => a.category === id), id);
    }
  });
});

describe('progress text', () => {
  const cases = [
    [{ metric: 'wins', target: 10, comparison: 'atLeast', current: 3 }, '3 of 10'],
    [{ metric: 'wins', target: 1000, comparison: 'atLeast', current: 250 }, '250 of 1,000'],
    [{ metric: 'bestTime:easy', target: 150, comparison: 'atMost', current: null }, 'No win yet'],
    [{ metric: 'bestTime:easy', target: 150, comparison: 'atMost', current: 250 }, 'Best 4:10 — goal 2:30'],
    [{ metric: 'bestScore:insane', target: 3500, comparison: 'atLeast', current: 1410 }, 'Best score 1,410 of 3,500'],
    [{ metric: 'earnedScore', target: 10000, comparison: 'atLeast', current: 4200 }, '4,200 of 10,000 points'],
    [{ metric: 'difficultiesWon', target: 4, comparison: 'atLeast', current: 2 }, '2 of 4 difficulties'],
    [{ metric: 'bestDailyStreak', target: 7, comparison: 'atLeast', current: 3 }, 'Best streak 3 of 7'],
  ];
  for (const [achievement, expected] of cases) {
    test(`${achievement.metric}: "${expected}"`, () => {
      assert.equal(describeProgress(achievement), expected);
    });
  }

  test('reads cleanly for every achievement in the catalog', () => {
    for (const achievement of list) {
      const text = describeProgress(achievement);
      assert.ok(text.length > 0 && !/undefined|NaN|null/.test(text), `${achievement.id}: ${text}`);
    }
  });
});

describe('unlock dates', () => {
  test('the date, noting an unlock credited from earlier games', () => {
    const format = () => 'Oct 7, 2026';
    assert.equal(describeUnlockDate({ unlockedAt: 1, backfilled: false }, format), 'Oct 7, 2026');
    assert.equal(describeUnlockDate({ unlockedAt: 1, backfilled: true }, format), 'Oct 7, 2026 · from earlier games');
    assert.match(formatUnlockDate(new Date(2026, 9, 7, 12).getTime()), /2026/);
  });

  test('a tracking-since date key is that day on the local calendar', () => {
    const date = new Date(dateKeyToEpochMs('2026-10-07'));
    assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 9, 7]);
  });
});

describe('a batch of simultaneous unlocks', () => {
  test('nothing unlocked: nothing to say', () => {
    assert.deepEqual(describeUnlockBatch([]), { count: 0, title: '0 achievements unlocked', shown: [], more: 0, list: '', sentence: '' });
  });

  test('one, two, three, and more than the limit', () => {
    assert.equal(describeUnlockBatch(['wins-1']).sentence, 'Achievement unlocked: First Victory.');
    assert.equal(describeUnlockBatch(['wins-1', 'perfect-1']).sentence, '2 achievements unlocked: First Victory and Flawless.');
    assert.equal(describeUnlockBatch(['wins-1', 'perfect-1', 'no-hint-1']).list, 'First Victory, Flawless and On My Own');
    const five = describeUnlockBatch(['wins-1', 'perfect-1', 'no-hint-1', 'wins-easy-1', 'speed-easy-par']);
    assert.equal(five.title, '5 achievements unlocked');
    assert.equal(five.shown.length, 3);
    assert.equal(five.more, 2);
    assert.equal(five.list, 'First Victory, Flawless, On My Own and 2 more');
    assert.equal(describeUnlockBatch(['wins-1', 'perfect-1', 'no-hint-1', 'wins-easy-1', 'speed-easy-par'], 5).more, 0);
  });

  test('repeated and unknown (retired) IDs are skipped', () => {
    const batch = describeUnlockBatch(['wins-1', 'wins-1', 'retired-goal']);
    assert.equal(batch.count, 1);
    assert.deepEqual(batch.shown.map((a) => a.id), ['wins-1']);
  });
});
