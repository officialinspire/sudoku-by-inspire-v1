/**
 * Achievement badges: small inline SVGs, one glyph per category, so
 * there's no image file to ship, cache, or keep in sync with the theme.
 * Every color comes from styles.css through classes and `currentColor`
 * (the disc is the accent fill when unlocked, an outlined empty disc
 * plus a padlock when locked), so all 4 theme packs × 2 modes recolor
 * them with no per-theme artwork. Decorative: always `aria-hidden` —
 * the name and "Unlocked"/"Locked" text next to a badge carry the
 * meaning.
 */

// Drawn on a 48×48 canvas, inside the disc (center 24,24).
const stroke = (width = 2.5) =>
  `fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;

const GLYPHS = {
  // Trophy
  wins:
    '<path d="M17 13h14v6a7 7 0 0 1-14 0z" fill="currentColor"/>' +
    `<path d="M17 15.5h-3v1.5a4.5 4.5 0 0 0 4.5 4.5M31 15.5h3v1.5a4.5 4.5 0 0 1-4.5 4.5" ${stroke(2)}/>` +
    '<rect x="22" y="26" width="4" height="5" fill="currentColor"/><rect x="17.5" y="31" width="13" height="3.5" rx="1" fill="currentColor"/>',
  // Rank chevrons
  difficulty: `<path d="M15 32l9-7 9 7M15 24l9-7 9 7" ${stroke(3.5)}/>`,
  // Star
  perfect:
    '<polygon transform="translate(12 12)" points="12,1.5 14.6,8.4 21.9,8.7 16.2,13.3 18.1,20.4 12,16.4 5.9,20.4 7.8,13.3 2.1,8.7 9.4,8.4" fill="currentColor"/>',
  // Light bulb, struck through (the strike cuts a gap in the disc's color first)
  'no-hint':
    '<path d="M24 12a8 8 0 0 0-4.5 14.6V30h9v-3.4A8 8 0 0 0 24 12z" fill="currentColor"/>' +
    '<rect x="20" y="31.5" width="8" height="2.5" rx="1" fill="currentColor"/>' +
    '<path class="achievement-badge-cut" d="M14.5 14.5l19 19" fill="none" stroke-width="5.5" stroke-linecap="round"/>' +
    `<path d="M14.5 14.5l19 19" ${stroke()}/>`,
  // Stopwatch
  speed:
    `<circle cx="24" cy="26.5" r="9" ${stroke()}/><path d="M24 26.5v-5M24 26.5l3.5 2.5" ${stroke()}/>` +
    '<rect x="21.5" y="12" width="5" height="3" rx="1" fill="currentColor"/>',
  // Medal on a ribbon
  score: `<path d="M19 12.5l3 7.5M29 12.5l-3 7.5" ${stroke()}/><circle cx="24" cy="27" r="7.5" fill="currentColor"/>`,
  // Flame
  'win-streak':
    '<path d="M24 12c1 5 7 7.5 7 14.5a7 7 0 0 1-14 0c0-4 2-6.5 3.5-8 .3 2.5 1.5 4 3 4.5-1-4 0-8 .5-11z" fill="currentColor"/>',
  // Calendar page with a check
  'daily-streak':
    `<rect x="14" y="15" width="20" height="18" rx="2" ${stroke()}/><path d="M14 21h20M19 12.5v4.5M29 12.5v4.5" ${stroke()}/>` +
    `<path d="M19.5 27l3 3 5.5-5.5" ${stroke()}/>`,
  // Pencil
  playstyle:
    '<path d="M15.5 32.5l1.6-6.1 10.6-10.6 4.5 4.5-10.6 10.6z" fill="currentColor"/>' +
    '<path d="M29.4 14.1l1.9-1.9 4.5 4.5-1.9 1.9z" fill="currentColor"/>',
};

const LOCK =
  '<g class="achievement-badge-lock"><circle cx="37.5" cy="37.5" r="8.5"/>' +
  '<rect class="achievement-badge-lock-body" x="33.5" y="36.5" width="8" height="6" rx="1"/>' +
  '<path class="achievement-badge-lock-shackle" d="M35.3 36.5v-2a2.2 2.2 0 0 1 4.4 0v2" fill="none" stroke-width="1.6"/></g>';

export const BADGE_CATEGORIES = Object.keys(GLYPHS);

/** The badge for `category`, unlocked or locked, as an SVG string. */
export function badgeSvg(category, unlocked) {
  const glyph = GLYPHS[category] ?? GLYPHS.wins;
  const state = unlocked ? 'is-unlocked' : 'is-locked';
  return (
    `<svg class="achievement-badge ${state}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">` +
    '<circle class="achievement-badge-disc" cx="24" cy="24" r="22"/>' +
    `<g class="achievement-badge-glyph">${glyph}</g>${unlocked ? '' : LOCK}</svg>`
  );
}
