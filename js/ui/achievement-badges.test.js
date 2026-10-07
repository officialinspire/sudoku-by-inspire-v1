import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeSvg, BADGE_CATEGORIES } from './achievement-badges.js';
import { ACHIEVEMENT_CATEGORIES } from '../achievement-catalog.js';

const categoryIds = ACHIEVEMENT_CATEGORIES.map((category) => category.id);
const allBadges = categoryIds.flatMap((id) => [badgeSvg(id, true), badgeSvg(id, false)]);

describe('achievement badges', () => {
  test('one glyph per catalog category, each distinct', () => {
    assert.deepEqual([...BADGE_CATEGORIES].sort(), [...categoryIds].sort());
    const unlocked = categoryIds.map((id) => badgeSvg(id, true));
    assert.equal(new Set(unlocked).size, categoryIds.length);
  });

  test('decorative to assistive tech, never a tab stop', () => {
    for (const svg of allBadges) {
      assert.match(svg, /^<svg [^>]*aria-hidden="true"[^>]*focusable="false"/);
    }
  });

  test('locked badges carry a padlock (not just a color change); unlocked ones don\'t', () => {
    for (const id of categoryIds) {
      assert.match(badgeSvg(id, false), /class="achievement-badge is-locked".*achievement-badge-lock/);
      assert.doesNotMatch(badgeSvg(id, true), /achievement-badge-lock|is-locked/);
    }
  });

  test('no hard-coded colors: every color comes from the theme (CSS classes or currentColor)', () => {
    for (const svg of allBadges) {
      assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|rgb|hsl/i);
      for (const [, value] of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
        assert.ok(value === 'currentColor' || value === 'none', value);
      }
    }
  });

  test('well-formed: balanced elements, no attribute given twice (HTML would silently keep the first)', () => {
    for (const svg of allBadges) {
      for (const tag of ['svg', 'g']) {
        assert.equal(svg.split(`<${tag} `).length, svg.split(`</${tag}>`).length, tag);
      }
      for (const [, attributes] of svg.matchAll(/<\w+((?:\s+[\w-]+="[^"]*")*)\s*\/?>/g)) {
        const names = [...attributes.matchAll(/([\w-]+)=/g)].map((match) => match[1]);
        assert.equal(new Set(names).size, names.length, attributes);
      }
    }
  });

  test('an unknown category still draws a badge instead of breaking the list', () => {
    assert.match(badgeSvg('not-a-category', true), /^<svg .*<\/svg>$/);
  });
});
