/**
 * The 100 gameplay achievements. Pure data, frozen, evaluated by
 * js/achievement-store.js (through js/achievement-evaluation.js) only
 * when progress actually changes — a completed game, or startup's
 * backfill/upgrade — never on a timer tick.
 *
 * Each definition: `{ id, name, description, category, metric, target,
 * comparison }`.
 *  - `id` is permanent: unlocks are stored under it. IDs name the goal
 *    ("speed-easy-half-par"), never a derived number, so retuning
 *    js/scoring.js can move a target without orphaning anyone's unlock.
 *  - `description` is the exact requirement, numbers included.
 *  - `metric`/`target`/`comparison` are what's checked; 'atMost' is for
 *    times (lower is better), everything else is 'atLeast'.
 *
 * Speed and score targets aren't typed in — they're derived from
 * js/scoring.js (par times, multipliers, the formula itself), and the
 * catalog's tests prove each is attainable on *every* puzzle of its
 * difficulty: no target beats the time the emptiest such puzzle can
 * physically be filled in, or the score that time would earn.
 */

import { DIFFICULTIES, DIFFICULTY_IDS } from './sudoku-generator.js';
import { PAR_SECONDS, calculateScore } from './scoring.js';
import { formatElapsedTime } from './completion.js';
import { HEAVY_NOTES_MIN_TOGGLES, COMEBACK_MIN_MISTAKES } from './run-tracking.js';
import { HARD_DIFFICULTIES } from './achievement-progress.js';

export const ACHIEVEMENT_CATEGORIES = Object.freeze([
  { id: 'wins', label: 'Victories' },
  { id: 'difficulty', label: 'Difficulty' },
  { id: 'perfect', label: 'Perfect Games' },
  { id: 'no-hint', label: 'No Hints' },
  { id: 'speed', label: 'Speed' },
  { id: 'score', label: 'Score' },
  { id: 'win-streak', label: 'Winning Streaks' },
  { id: 'daily-streak', label: 'Daily Streaks' },
  { id: 'playstyle', label: 'Playstyle' },
]);

// ------------------------------------------------- derived targets

// The mechanical floor: every empty cell needs at least one input, and
// nobody enters more than one a second. Measured on the emptiest puzzle a
// difficulty generates (its minClues) — a puzzle with more clues can be
// finished sooner, but a goal must be reachable whichever puzzle the
// player is dealt, so this bounds what any speed or score goal may ask for.
export const MIN_SECONDS_PER_EMPTY_CELL = 1;

export function emptiestPuzzleFillSeconds(difficultyId) {
  return (81 - DIFFICULTIES[difficultyId].minClues) * MIN_SECONDS_PER_EMPTY_CELL;
}

const flawlessScore = (difficultyId, elapsedSeconds) =>
  calculateScore({ difficultyId, elapsedSeconds, mistakes: 0, hintsUsed: 0 }, DIFFICULTIES[difficultyId]);

/** The best score every puzzle of the difficulty can earn: flawless, at the mechanical floor. */
export function maxAttainableScore(difficultyId) {
  return flawlessScore(difficultyId, emptiestPuzzleFillSeconds(difficultyId));
}

/** Seconds: `fraction` of the difficulty's par time. */
export function speedTarget(difficultyId, fraction) {
  return Math.round(PAR_SECONDS[difficultyId] * fraction);
}

/** Points: what a flawless game finished at `fraction` of par scores. */
export function scoreTarget(difficultyId, fraction) {
  return flawlessScore(difficultyId, speedTarget(difficultyId, fraction));
}

// ---------------------------------------------------------- helpers

const formatCount = (n) => n.toLocaleString('en-US');
const label = (difficultyId) => DIFFICULTIES[difficultyId].label;
const games = (n) => (n === 1 ? 'a game' : `${formatCount(n)} games`);

function define(category, id, name, description, metric, target, comparison = 'atLeast') {
  return Object.freeze({ id, name, description, category, metric, target, comparison });
}

// ------------------------------------------------------- categories

const WIN_MILESTONES = [
  [1, 'First Victory'], [3, 'Getting Started'], [5, 'High Five'], [10, 'Double Digits'],
  [15, 'Regular'], [25, 'Quarter Century'], [40, 'Dedicated'], [50, 'Half Century'],
  [75, 'Seasoned Solver'], [100, 'Centurion'], [150, 'Grid Veteran'], [200, 'Puzzle Devotee'],
  [300, 'Tireless'], [500, 'Sudoku Sage'], [1000, 'Grandmaster'],
];

const DIFFICULTY_RANKS = [[1, 'Initiate'], [5, 'Apprentice'], [10, 'Adept'], [25, 'Expert'], [50, 'Master']];

const PERFECT_MILESTONES = [
  [1, 'Flawless'], [3, 'Clean Hands'], [5, 'Precision'], [10, 'Perfectionist'], [15, 'Steady Mind'],
  [25, 'Immaculate'], [40, 'Surgical'], [50, 'Unblemished'], [75, 'Pristine Record'], [100, 'Living Legend'],
];

const NO_HINT_MILESTONES = [
  [1, 'On My Own'], [5, 'Self-Reliant'], [10, 'Independent'], [25, 'No Help Needed'], [50, 'Trust Your Logic'],
  [75, 'Pure Deduction'], [100, 'Hint-Free Hundred'], [150, 'Unassisted'], [200, 'Solo Artist'], [300, 'Lone Genius'],
];

// [difficulty, fraction of par, id suffix, name prefix]: par and half par
// everywhere, plus a third of par at both ends of the difficulty range.
const SPEED_GOALS = [
  ...DIFFICULTY_IDS.flatMap((id) => [
    [id, 1, 'par', 'On Pace'],
    [id, 1 / 2, 'half-par', 'Swift'],
  ]),
  ['easy', 1 / 3, 'third-par', 'Lightning'],
  ['insane', 1 / 3, 'third-par', 'Lightning'],
];

const SCORE_TIERS = [
  [1, 'par', 'Solid Score', 'a flawless win at par'],
  [1 / 2, 'half-par', 'High Score', 'a flawless win in half the par time'],
];

// Lifetime points, as multiples of what a flawless Easy game at par earns.
const LIFETIME_SCORE_GOALS = [
  [10, 'score-lifetime-collector', 'Point Collector'],
  [100, 'score-lifetime-hoarder', 'Point Hoarder'],
];

const WIN_STREAK_MILESTONES = [
  [2, 'Back to Back'], [3, 'Hat Trick'], [5, 'On a Roll'], [7, 'Lucky Seven'], [10, 'Unstoppable'],
  [15, 'Relentless'], [20, 'Streak Master'], [25, 'Untouchable'], [30, 'Juggernaut'], [50, 'Legendary Run'],
];

const DAILY_STREAK_MILESTONES = [
  [2, 'Two Days Running'], [3, 'Three-Peat'], [5, 'Habit Forming'], [7, 'Full Week'], [10, 'Ten-Day Trek'],
  [14, 'Fortnight'], [21, 'Three Weeks Strong'], [30, 'Monthly Ritual'], [60, 'Two-Month Marathon'], [100, 'Hundred-Day Habit'],
];

const hardLabels = HARD_DIFFICULTIES.map(label).join(' or ');

export const ACHIEVEMENTS = Object.freeze([
  ...WIN_MILESTONES.map(([n, name]) =>
    define('wins', `wins-${n}`, name, n === 1 ? 'Win your first game.' : `Win ${games(n)}.`, 'wins', n)
  ),

  ...DIFFICULTY_IDS.flatMap((d) =>
    DIFFICULTY_RANKS.map(([n, rank]) =>
      define('difficulty', `wins-${d}-${n}`, `${label(d)} ${rank}`, `Win ${n === 1 ? `an ${label(d)} game` : `${formatCount(n)} ${label(d)} games`}.`, `wins:${d}`, n)
    )
  ),

  ...PERFECT_MILESTONES.map(([n, name]) =>
    define('perfect', `perfect-${n}`, name, `Win ${games(n)} without a single wrong digit or hint — undone mistakes still count.`, 'perfectWins', n)
  ),

  ...NO_HINT_MILESTONES.map(([n, name]) =>
    define('no-hint', `no-hint-${n}`, name, `Win ${games(n)} without using a hint — an undone hint still counts.`, 'noHintWins', n)
  ),

  ...SPEED_GOALS.map(([d, fraction, suffix, prefix]) => {
    const seconds = speedTarget(d, fraction);
    return define('speed', `speed-${d}-${suffix}`, `${prefix}: ${label(d)}`, `Win an ${label(d)} game in ${formatElapsedTime(seconds)} or less.`, `bestTime:${d}`, seconds, 'atMost');
  }),

  ...DIFFICULTY_IDS.flatMap((d) =>
    SCORE_TIERS.map(([fraction, suffix, prefix, meaning]) => {
      const points = scoreTarget(d, fraction);
      return define('score', `score-${d}-${suffix}`, `${prefix}: ${label(d)}`, `Score ${formatCount(points)} or more in a single ${label(d)} game (${meaning}).`, `bestScore:${d}`, points);
    })
  ),
  ...LIFETIME_SCORE_GOALS.map(([multiple, id, name]) => {
    const points = multiple * scoreTarget('easy', 1);
    return define('score', id, name, `Earn ${formatCount(points)} points in total across all your wins.`, 'earnedScore', points);
  }),

  ...WIN_STREAK_MILESTONES.map(([n, name]) =>
    define('win-streak', `win-streak-${n}`, name, `Win ${formatCount(n)} games in a row without abandoning one in between.`, 'bestWinStreak', n)
  ),

  ...DAILY_STREAK_MILESTONES.map(([n, name]) =>
    define('daily-streak', `daily-streak-${n}`, name, `Win at least one game on ${formatCount(n)} days in a row.`, 'bestDailyStreak', n)
  ),

  define('playstyle', 'style-note-taker', 'Note Taker', `Win a game in which you placed or removed at least ${HEAVY_NOTES_MIN_TOGGLES} notes.`, 'heavyNotesWins', 1),
  define('playstyle', 'style-ink-only', 'Ink Only', `Win an ${hardLabels} game without using notes at all.`, 'noNotesHardWins', 1),
  define('playstyle', 'style-no-take-backs', 'No Take-Backs', `Win an ${hardLabels} game without using Undo.`, 'noUndoHardWins', 1),
  define('playstyle', 'style-grand-tour', 'Grand Tour', `Win at least one game on each of the ${DIFFICULTY_IDS.length} difficulties (${DIFFICULTY_IDS.map(label).join(', ')}).`, 'difficultiesWon', DIFFICULTY_IDS.length),
  define('playstyle', 'style-comeback', 'Comeback Kid', `Win a game despite making ${COMEBACK_MIN_MISTAKES} or more mistakes.`, 'comebackWins', 1),
]);
