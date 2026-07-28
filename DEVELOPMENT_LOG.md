# DEVELOPMENT_LOG.md

Running, dated log of what happened each session. Append — don't rewrite
history. Newest entry at the top.

---

## 2026-07-28 — Phase 7: Save Data, Statistics, Best Times, and High Scores

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's "Phase 7" covers both `TASKS.md`'s Phase 7 (Persistence)
and Phase 8 (Statistics/High Scores) in one pass — both are now marked
done in `TASKS.md`.

**What was built:**

- **`js/storage.js`** — the generic safe-localStorage foundation every
  persisted feature now shares: `loadJSON(key, fallback, validator?)`,
  `saveJSON(key, value)`, `removeJSON(key)`. Every failure mode (storage
  denied/quota exceeded, malformed JSON, missing key, `localStorage`
  itself unavailable, a validator rejecting the shape) falls back to the
  caller's `fallback` value rather than throwing. `js/theme.js` and
  `js/game-settings.js` were migrated onto it, and their keys renamed
  under a shared versioned prefix: `inspireSudoku:v1:appearance` and
  `inspireSudoku:v1:gameplaySettings` (previously `sudoku-inspire:*`).
  Kept as two separate keys rather than one merged `...:settings` blob —
  they're read/written independently by unrelated modules, and merging
  would only add read-modify-write coordination between them for no
  functional benefit.
- **`js/active-game-store.js`** — persists exactly one in-progress game
  under `inspireSudoku:v1:activeGame` (versioned, validated on load:
  board-shape checks on puzzle/solution/entries/notes, difficulty must be
  a known id, counters must be non-negative integers, status must be
  `'playing'` or `'paused'` — a persisted `'complete'` status is never
  written in the first place). Any corrupt/incompatible save fails safely
  back to "no save," so Continue Game just stays disabled instead of
  crashing.
- **`js/statistics-store.js`** — per-difficulty counters under
  `inspireSudoku:v1:statistics`: games started/completed, total play
  time, best time, current streak, best streak, total hints, total
  mistakes. `completionRate` and `averageTimeSeconds` are *derived* on
  read from the raw counters, never stored, so they can't drift out of
  sync with them. `recordGameStarted`/`recordGameCompleted`/
  `recordGameAbandoned` are called directly by the specific UI code that
  unambiguously knows what just happened (see below) rather than
  inferred from generic state-change events, which would have to
  disambiguate "new game" from "Continue Game restore" and "abandon" from
  "ordinary pause."
- **`js/high-scores-store.js`** — top-10 leaderboard per difficulty under
  `inspireSudoku:v1:highScores`, sorted by score descending with ties
  broken by faster elapsed time. `recordHighScore` returns the entry's
  1-based rank, or `null` if it didn't place in the top 10.
- **`js/scoring.js`** — the single, centralized, documented scoring
  formula (previously an inline placeholder in `js/completion.js`, and a
  now-removed, redundant `HINT_SCORE_PENALTY` constant in
  `js/game-state.js`):
  `score = round(BASE_SCORE × difficulty.scoreMultiplier + speedBonus − mistakes×MISTAKE_PENALTY − hints×HINT_PENALTY)`,
  floored at 0. `speedBonus = max(0, parSeconds − elapsedSeconds) × SPEED_BONUS_PER_SECOND`
  — going over par costs you the bonus, never turns into a penalty.
  `js/completion.js`'s `estimateScore` now just delegates to it.
- **`js/game-persistence.js`** — the one place game-state changes turn
  into storage writes: debounced autosave (500ms, plus a `pagehide`
  listener to flush a save that's still pending when the tab closes)
  while `status` is `'playing'`/`'paused'`, and on the transition into
  `'complete'`: records the finished game into statistics, computes its
  score, records it into high scores, and clears the active-game save
  (nothing left to "continue"). `recordGameStarted`/`recordGameAbandoned`
  are deliberately *not* called from here — they're called directly from
  `js/ui/game-screen.js` (`startNewGame`, right before `startGame()`) and
  `js/ui/new-game-confirm-dialog.js` (on confirming a replacement),
  which are the actual unambiguous moments those things happen.
- **`restoreGame(saved, options?)`** and **`resetToIdle()`** added to
  `js/game-state.js`. `restoreGame` always lands in `'paused'` regardless
  of the save's own status — Continue Game should always show the pause
  overlay and require an explicit Resume, never drop the player straight
  into a mid-puzzle board. `resetToIdle` fully stops the timer and clears
  in-memory state, used by Clear Data so a stale in-memory game can't
  quietly resurrect a save on its next autosave tick.
- **New Game confirmation** (`js/ui/new-game-confirm-dialog.js`) — only
  interrupts with a dialog if there's actually an unfinished game
  (`status` is `'playing'` or `'paused'`); confirming records the
  abandonment (resets the current streak) and clears the save before
  opening the difficulty picker.
- **Clear Data confirmation** (`js/ui/clear-data-dialog.js`) — clears the
  active game, statistics, and high scores, and resets any in-memory
  game; leaves appearance/gameplay settings untouched (the dialog copy
  says so explicitly, pointing at Reset Appearance instead).
- **Statistics screen** (`js/ui/statistics-screen.js`) and **High Scores
  screen** (`js/ui/high-scores-screen.js`), both driven by a shared
  **`js/ui/difficulty-filter.js`** tab component (`role="tablist"`,
  `aria-selected` on the active button).
- New CSS: `.difficulty-filter`/`.difficulty-filter-btn` (a 2×2 grid on
  mobile, single row of 4 from the existing 768px breakpoint — a plain
  flex row wrapped unpredictably at narrow widths), `.stats-grid`/
  `.stats-item`, `.highscores-list`/`.highscore-row` and its rank/score/
  detail/date sub-elements. The two new confirmation dialogs needed no
  new CSS — they reuse the existing `.settings-dialog`/`.settings-form`/
  `.settings-actions` pattern.

**Key technical notes (serialization, defensive parsing, schema/
versioning, validation, debouncing, derived statistics, scoring):**

- *Serialization*: every store's public shape is a plain JSON-safe object
  (`{ version, ...fields }`); `JSON.stringify`/`JSON.parse` round-trip it
  as-is, with no `Map`/`Set`/`Date`-object fields to lose fidelity.
- *Defensive parsing*: `loadJSON` treats storage access itself, JSON
  parsing, and shape validation as three independently failable steps —
  any one failing returns the caller's `fallback`, never throws or
  returns a half-valid object.
- *Schema/versioning*: every stored object carries a `version` field;
  validators reject anything whose version doesn't match the current
  constant, so a future schema change can detect and discard (or, later,
  migrate) old-shaped data instead of silently misreading it.
- *Validation*: beyond the version check, each validator re-checks the
  invariants the rest of the app assumes hold (board-length arrays,
  known difficulty ids, non-negative integer counters, a bounded/sorted
  high-score list) — data is trusted only after passing the same checks
  fresh code would need anyway.
- *Debouncing*: `game-persistence.js` collapses rapid-fire state changes
  (each keystroke, each note toggle) into one write 500ms after the last
  one, trailing-edge, with a `pagehide` flush so nothing in the last
  500ms before a tab closes is lost.
- *Derived statistics*: `completionRate` and `averageTimeSeconds` are
  computed from raw counters on every read rather than stored, so they
  can never drift from the numbers they're derived from.
- *Scoring formula*: base value scaled by difficulty, plus a bonus for
  finishing under a per-difficulty par time, minus flat per-mistake and
  per-hint penalties, floored at zero — centralized in one module so
  every place that shows or ranks a score (completion dialog, high
  scores) uses the exact same number.

**Checks run:**

- `node --check` on every new/modified JS file — all clean.
- `npm test` (Node's built-in test runner): 163 tests across 56 suites,
  all passing, including the 5 new store/formula test files
  (`storage.test.js`, `scoring.test.js`, `active-game-store.test.js`,
  `statistics-store.test.js`, `high-scores-store.test.js`) plus the new
  `restoreGame`/`resetToIdle` coverage in `game-state.test.js`.
  - Testing note: Node has no global `localStorage`. Rather than change
    any production module's API to accept an injected storage object,
    each store's test file installs a small in-memory
    `globalThis.localStorage` polyfill in `beforeEach`/removes it in
    `afterEach` — production code is untouched and still exercised
    exactly as the browser would call it.
- Browser end-to-end pass (headless Chromium via Playwright, served over
  a local static HTTP server): start → menu → New Game → deliberate
  mistake → autosave → back to menu (Continue Game becomes enabled) → New
  Game confirmation (Cancel leaves the game untouched; Confirm abandons
  it, resets the streak, and opens the difficulty picker) → Continue Game
  restores the exact save (mistake count preserved, always paused) →
  solved the rest of the puzzle through the real `game-state.js` API
  (exercising the actual completion → statistics → high-score →
  clear-active-game path, not a mock) → completion dialog shows a
  positive score → Statistics screen reflects the finished game (1
  completed, 100% completion rate, 1 mistake) → High Scores screen shows
  the one ranked entry → Clear Data removes the save, statistics, and
  high scores in one action, leaving appearance/gameplay settings alone.
  No unexpected console/page errors (the known Phase 1 intro-video codec
  message in this sandbox's headless Chromium is excluded, as
  established in the Phase 1 log entry).
- **Bug caught by this verification pass, fixed before commit:**
  `recordGameStarted` existed in `statistics-store.js` and was documented
  in `game-persistence.js`'s own comment as being called from
  `js/ui/game-screen.js` — but it never actually was. "Games Started"
  read 0 while "Games Completed" read 1, and completion rate showed 0%
  instead of 100%. Fixed by calling `recordGameStarted(difficultyId)` in
  `startNewGame()` right before `startGame()`, the one unambiguous place
  a brand-new game begins.
- **CSS bug caught the same way:** `.difficulty-filter`'s plain
  `flex-wrap` layout wrapped unpredictably at a 420px mobile viewport
  (three buttons on one row with the third clipped, the fourth alone on
  its own row). Switched to a 2×2 CSS grid on mobile, reverting to a
  single row of 4 at the existing 768px desktop breakpoint.
- Also corrected leftover copy in the completion dialog that claimed
  scoring was "a provisional estimate — final scoring lands in a future
  phase," which stopped being true once this phase landed.

**Remaining limitations:**

- Audio/input-preference persistence is still deferred to Phase 9 —
  `js/audio.js` doesn't exist yet, so there's nothing to persist.
- No migration path exists yet for a future schema-version bump beyond
  "detect mismatch, discard" — acceptable for v1, would need revisiting
  if a real schema change ever needs to preserve old data.
- `js/game-persistence.js` itself isn't unit-tested (it's a thin,
  browser-only `window`/`onStateChange` wiring module with no pure logic
  of its own to isolate — consistent with how `theme.js` was already
  handled); it's covered by the browser end-to-end pass instead.

---

## 2026-07-28 — Phase 6: Gameplay Tools and Completion Flow

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 6" (gameplay tools/completion) doesn't match
`TASKS.md`'s prior Phase 6 (Persistence). Same pattern as Prompts 3-5:
inserted as the actual Phase 6, Persistence and everything after shift
down by one (now Phases 7-13).

**What was built:**

- **`toggleNote(index, value)`** (`js/game-state.js`): pulled the notes-
  toggling logic out of `applyNumberInput` into its own function with
  its own guards — status playing, valid index/value, not a fixed clue,
  **and not already filled** (new: previously, toggling notes on a
  filled-but-not-fixed cell would silently accumulate note bits that
  were never rendered but never cleaned up either — harmless in
  practice since `eraseSelectedCell` already zeroed notes, but wasteful,
  inconsistent state that could resurface confusingly). `applyNumberInput`
  now delegates to it in notes mode instead of duplicating the logic.
- **Bounded undo history**: `MAX_HISTORY_SIZE = 50` (exported for
  transparency/testing), enforced in `pushHistory` by shifting the
  oldest snapshot off once the cap is exceeded. Entry, erase, notes, and
  (new) hint actions all route through the same `pushHistory`, so undo
  covers all four uniformly rather than needing per-action-type logic.
- **`useHint()`**: reveals `solution[selectedIndex]`, treated exactly
  like a normal entry afterward (clears that cell's notes, clears the
  value from peer notes) except it never counts as a mistake and
  increments `hintsUsed` instead. `HINT_SCORE_PENALTY` is exported as
  scoring metadata — Phase 8 (Statistics) owns the real formula, this
  just records what a hint costs at the moment it's used. Gated behind
  a confirmation `<dialog>` (`js/ui/hint-dialog.js`); the action itself
  stays a plain, directly-testable function with no confirmation logic
  baked in — that's a UI concern layered on top.
- **Timer redesign**: elapsed time is now timestamp-anchored
  (`state.elapsedSeconds` = confirmed seconds from completed segments,
  plus live `now() - segmentStartedAt` while a segment is running)
  instead of counted by a `setInterval` callback incrementing +1 each
  tick. Multiple independent pause causes compose through a `Set` of
  opaque suspension reasons (`suspendTimer('hidden')`,
  `suspendTimer('dialog')`) rather than a single boolean two callers
  could stomp on — the timer only actually resumes once *every* reason
  clears. `pauseGame()`/`resumeGame()` (explicit user pause) additionally
  stop/start the underlying `setInterval` itself, not just gate it,
  since an explicit pause can last indefinitely and there's no reason to
  keep a live interval ticking uselessly the whole time; suspension
  reasons (dialog/hidden-tab) are expected to be brief, so they only
  gate the interval's callback, leaving the interval itself running.
- **Immediate error checking setting** (`js/game-settings.js`, new,
  versioned localStorage, mirrors `js/theme.js`'s pattern exactly but as
  its own file/key — gameplay preferences vs. appearance preferences are
  different concerns): mistakes are *always* counted internally
  (`state.mistakes` doesn't know or care about this setting); the
  setting only controls whether `board-view.js` renders the red
  "wrong entry" styling live. Wired into a new "Gameplay" group in the
  Settings dialog.
- **Completion dialog** (`js/ui/completion-dialog.js`, new) replaces the
  old plain-text "Solved!" message in `#game-status`: difficulty,
  elapsed time, mistakes, hints, a score (`js/completion.js`'s
  `estimateScore` — explicitly labeled in the UI as a provisional
  placeholder, not the real Phase 8 formula), and generated Share
  Results text (`buildShareText`) with a Copy Results button
  (`navigator.clipboard`, falling back to "select the visible text
  by hand" if the Clipboard API is unavailable or denied — never a dead
  end either way). New Game reopens the difficulty picker; Menu returns
  to the main menu.
- **Never expose solution values in DOM attributes**: audited
  `board-view.js` and the new hint/completion code — the Hint button's
  enabled state, `is-error` styling, and everything else that needs to
  know a cell's correct value only ever does that computation in JS
  memory, never by writing it into a `data-*` attribute or similar a
  player could read via devtools. Verified with an automated check that
  serializes every still-empty cell's HTML and confirms no solution
  digit appears in it.

**A real product gap found during browser testing, not part of the
original plan:** Settings was only reachable from the main menu. That
directly undermines two of this phase's own features — the immediate-
error-checking setting is far more useful to toggle mid-game than from
the menu, and "a blocking dialog pauses the timer" has nothing to
demonstrate itself against if no dialog can ever open while a game is in
progress. Added a Settings (gear) button to the game screen's header,
wired to the same `openSettingsDialog()` Phase 2 already built — no new
dialog needed, just a second way to reach the existing one.

**Test results:**

```
# tests 101   (30 engine + 15 generator + 48 game-state + 8 completion)
# pass 101
# fail 0
```

18 new `game-state.test.js` tests cover: `toggleNote` (sets/clears bits,
preserves unrelated notes, rejects fixed and filled cells, confirms
`applyNumberInput` delegates to it in notes mode); bounded history
(pushing `MAX_HISTORY_SIZE + 10` times caps at exactly
`MAX_HISTORY_SIZE`); `useHint` (reveals the correct value without
counting a mistake, clears the hinted cell's and peers' notes, rejects
no-selection/fixed/already-correct, is undoable, can trigger completion,
and that `HINT_SCORE_PENALTY` is real metadata); and the timer (elapsed
time accrues from an injectable fake clock with zero real intervals;
pausing freezes it and resuming continues from where it left off, not
from zero; a suspension reason freezes it without touching `status`;
multiple simultaneous suspension reasons only release once *all* clear;
completion freezes it permanently). New `completion.test.js` (8 tests)
covers `estimateScore` (harder difficulty scores higher for identical
performance, mistakes/hints each reduce it, floors at 0) and
`buildShareText` (contains every expected field, correct singular/
plural wording, and is a pure function — same input always produces the
same output).

**Browser verification** (headless Chromium, 21 checks): Hint button
correctly disabled with no selection and enabled once an editable,
incorrect cell is selected; the confirm dialog reveals the value and
increments the counter; Cancel does nothing; Ctrl+Z undoes a hint
(value cleared, counter reverts); immediate-error-checking OFF hides the
red styling while still counting the mistake internally, ON shows it
again for the same entry; the timer is provably frozen (identical
displayed value before/after) across a 2-second real wait with the
Settings dialog open, and frozen via `suspendTimer('hidden')` directly;
the completion dialog shows the correct difficulty/mistakes/hints/a
numeric score, generates consistent share text, Copy Results shows
confirmation text, Menu and New Game both work; and the DOM-solution-
leak audit above. Zero unexpected console errors throughout (the one
pre-existing video-codec message aside). Screenshots spot-checked in
Paper/light: the new header (difficulty/time/mistakes/hints/settings
gear), the hint confirmation dialog, and the completion dialog all read
cleanly.

**Design concepts worth explaining** (also see inline comments in
`js/game-state.js`):

- *Set/array representation for notes*: a 9-bit integer per cell (bit
  `d-1` = digit `d` is a candidate) rather than a `Set<number>` or a
  9-element boolean array. The main win is peer cleanup: removing a
  placed digit from every peer's notes is `notes[peer] &= ~bit` — one
  cheap bitwise op per peer — instead of a `Set.delete` or an array
  search-and-splice repeated 20 times per placement. It's also trivially
  serializable as a plain number for the localStorage autosave the next
  phase adds, with no custom (de)serialization for a `Set`.
- *Snapshots vs. action history*: undo stores full snapshots (`entries`,
  `notes`, `selectedIndex`, `mistakes`, `hintsUsed` at that moment), not
  a log of "what action happened." Snapshots make `undo()` trivial and
  unconditionally correct — pop, restore, done — regardless of which of
  four different action types produced that snapshot. An action-log
  design would need an inverse operation defined for every action type
  (undo an entry vs. undo a hint vs. undo a note-toggle each look
  different) and would be easy to get subtly wrong for one of them.
  Snapshots cost more memory per entry (two 81-element array copies),
  which is exactly why bounding history size matters here in a way it
  wouldn't for a pure action log.
- *Interval lifecycle*: `startTimer()`/`stopTimer()` manage exactly one
  `setInterval`, always torn down (`clearInterval` + null the handle)
  before a new one is created — `startGame()`, and now `pauseGame()`/
  `resumeGame()`, all funnel through this pair rather than ever calling
  `setInterval` directly, which is what makes "avoid duplicate
  intervals" structurally true instead of just tested-and-hoped-for. The
  interval's callback does almost nothing (`if (canSegmentRun())
  notify()`) — it doesn't compute or store elapsed time itself, so
  whether it's running, throttled by a backgrounded tab, or briefly
  delayed under load has zero effect on the *correctness* of the elapsed
  value the next `getState()` call returns, only on how promptly the UI
  repaints it.
- *Visibility events*: `js/ui/controls.js` is the only place that
  reads `document.hidden`/`visibilitychange` — `game-state.js` never
  touches `document` at all, receiving only an opaque `'hidden'` string
  via `suspendTimer`/`resumeTimer`. That's what keeps the timer logic
  fully Node-testable (no DOM, no fake `document` needed in tests) while
  still letting the real app react to real tab-visibility changes.
- *Pause state*: two genuinely different mechanisms, both reachable
  through the timer, deliberately not merged into one. `status: 'paused'`
  is a full, potentially long-lived, user-visible state — it stops the
  interval outright and shows the obscuring overlay. Suspension reasons
  are brief, incidental interruptions (a 2-second dialog, a tab glance)
  that shouldn't cost the player time but also shouldn't interrupt the
  game with an overlay for something that minor. Conflating them would
  mean either dialogs triggering a jarring pause screen, or an explicit
  pause leaving a pointless interval running for however long the
  player leaves it paused.
- *Completion-state transitions*: `finishIfSolved()` (used by both
  `applyNumberInput` and `useHint`, previously duplicated between them)
  is the single place `status` becomes `'complete'` — checked via
  `isSolved()` on the merged board, never by counting empty cells or any
  other proxy. Once complete, `commitSegment()` + `stopTimer()` run
  immediately, so elapsed time is frozen at the exact moment of
  completion and can never tick further no matter how long the
  completion dialog stays open afterward.

**Remaining limitations:**

- The completion score is explicitly a placeholder formula
  (`SCORE_BASE * scoreMultiplier - mistakes*20 - hintsUsed*50`, floored
  at 0) — labeled as such in the UI itself. Phase 8 (Statistics) owns
  the real formula and will very likely replace this outright rather
  than tune it.
- Hint has no explicit keyboard shortcut (mouse/touch via the button
  only) — not in this phase's requirements, and unlike undo there's no
  "already fully built, just needs a trigger" argument for adding one
  unrequested.
- `js/game-settings.js` isn't unit-tested via `node --test` — like
  `theme.js`, it touches `localStorage` directly and has no meaningful
  pure logic to isolate from that; verified via the browser checks
  above instead, consistent with how `theme.js` was handled in Phase 2.
- Real device/screen-reader verification for the new Hint/completion UI
  remains open, same category of limitation already logged for Phase 5.

---

## 2026-07-28 — Phase 5: Playable Sudoku Board and Input System

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Earlier planning had this as two future phases (Board Rendering, then
Input Controls). Delivered as one, because they're not actually
separable in practice — a click both selects *and* needs to re-render,
a keypress both mutates *and* needs to re-render, and building the
renderer first with no way to change state (or the inputs first with no
renderer to show the result) would mean touching the same seams twice.
`TASKS.md` reflects this: Phase 5 is now "Playable Sudoku Board & Input
System," and Phases 6-12 (Persistence onward) shift down by one.

**What was built:**

- **`js/game-state.js`** (new): the single source of truth for an
  in-progress game. Every mutating function (`selectCell`,
  `applyNumberInput`, `eraseSelectedCell`, `toggleNotesMode`, `undo`,
  `moveSelection`, `pauseGame`/`resumeGame`) ends by calling one
  internal `notify()` — the one hook the UI (and, later, autosave)
  subscribes to via `onStateChange()`. Composes the Phase 3 engine
  (`isValidPlacement`, `isSolved`) rather than reimplementing conflict/
  completion logic. Notes are stored as a 9-bit integer per cell
  (bit `d-1` = digit `d` is a candidate) rather than a `Set` or array,
  mainly because it makes "clear this digit from every peer's notes"
  a single `&= ~bit` per peer instead of a search-and-splice.
- **`applyNumberInput(value)`**: the phase's central flow, checked in
  order — reject a non-1-9 value, reject if no game is in progress,
  reject if no cell is selected, reject if the selected cell is a fixed
  clue — then record undo history, then branch on notes mode (toggle a
  candidate bit) vs. normal mode (write the entry, clear that cell's own
  notes, clear the placed digit from every peer's notes, count a mistake
  if it doesn't match the stored solution), then run exactly one
  conflict recheck and one completion check, then `notify()` once. No
  intermediate state change is ever announced separately.
- **`js/game-state.test.js`**: 30 tests, one per state-transition
  concern in the phase's requirements list — guards, both entry modes,
  peer-note cleanup, mistake counting, conflict detection, completion
  detection, undo, selection movement/clamping, pause/resume, and (its
  own dedicated test) that exactly one `notify()` fires per mutation,
  and zero fire for a rejected no-op input.
- **`js/ui/board-view.js`** (new): builds the 81 cell buttons once, then
  a single `render(state)` function recomputes every cell's classes and
  text from the current state snapshot on every state change — fixed
  clue vs. player entry vs. notes-in-progress, selected/related/
  matching-value/conflict/error, all freshly derived, never read back
  from the DOM. A single delegated click listener on the board container
  resolves which cell was clicked from the event, rather than 81
  individual listeners.
- **`js/ui/controls.js`** (new): keyboard (1-9, Backspace/Delete, all 4
  arrow keys, N for notes, Escape to pause/resume) and number-pad/erase/
  notes-toggle clicks (also event-delegated for the pad). Guarded so
  none of it fires while a `<dialog>` is open or a form field has focus.
- **`js/ui/difficulty-dialog.js`** (new) + markup: New Game now opens a
  difficulty picker — reusing the exact `<dialog>` + option-tile pattern
  from the Phase 2 Settings dialog — before generating, instead of
  always defaulting to Easy as it did as a Phase 4 placeholder.
- **`js/ui/game-screen.js`**: now calls `game-state.js`'s `startGame()`
  once generation resolves, and announces completion once, on the
  transition into `status === 'complete'`, reading `elapsedSeconds`/
  `mistakes` from state rather than anything rendered.
- CSS: a responsive 9×9 grid (`width: min(100%, 32rem)`,
  `aspect-ratio: 1/1`), heavier borders on 3×3 box edges via
  `grid-line-left`/`grid-line-top` classes computed once at cell-build
  time, and the board-state tokens reserved back in Phase 2
  (`--color-cell-selected/-related/-match`, `--color-clue-fixed`,
  `--color-entry-player`, `--color-notes`) finally put to use. Conflicts
  render as an inset `box-shadow` ring (a different CSS property from
  the tint backgrounds) specifically so a conflicting cell's signal
  never has to fight a `background` cascade against selected/related/
  match — and so it's never color-alone, matching the Phase 2 rule.

**A real rendering bug caught by browser testing, not code review:**
`board-view.js`'s first draft only updated a cell's note-digit `<span>`
text inside the "cell is empty" render branch. When a cell went from
"has notes" to "has a real value," the notes container was correctly
hidden (`notesEl.hidden = true`), but the note-digit text nodes
underneath it were never cleared — invisible today, but no longer
actually reflecting `state.notes[index]`, which is exactly the failure
mode "render must derive from state, not from what the DOM already
says" is meant to prevent. An automated browser check caught it
directly (asserting on note-digit text content after a value was
entered, not just container visibility). Fixed by moving the note-digit
text update outside the if/else so it always runs from
`state.notes[index]`, regardless of which branch renders next.

**A deliberate scope decision beyond the phase's literal control list:**
`history`/undo was explicitly required in central state, and
"record undo history before mutation" was an explicit step of
`applyNumberInput`'s flow — so a real, tested `undo()` function exists.
The phase's keyboard-control list didn't mention a trigger for it,
though, and building a fully working, tested undo mechanism with no way
for a real user to ever reach it would be a half-finished feature. Added
Ctrl/Cmd+Z as the trigger — a standard, low-risk, zero-new-UI binding —
rather than leaving it silently unreachable or adding unrequested button
chrome.

**Test results:**

```
# tests 75   (30 engine + 15 generator + 30 game-state)
# pass 75
# fail 0
```

**Browser verification** (headless Chromium, two scripts): difficulty
dialog → New Game → board renders with the correct clue count for Easy;
click-to-select + 20-peer "related" highlighting + DOM focus following
selection; number pad entry and Erase; keyboard digit entry, arrow
navigation, Backspace; notes mode toggling candidates and being cleared
by a real entry (after the bug fix above); two equal values in the same
row flagged `is-conflict`; Escape → pause overlay → Resume; completion
driven by directly mutating the running app's live `game-state` module
instance via `page.evaluate(() => import(...))` to reach an
almost-solved board without 40+ manual clicks, then finishing it with
one real UI click and confirming the "Solved!" message and
`isSolved()`-based detection; Back to Menu. Separately: 320px viewport
has no horizontal overflow and number-pad buttons measure ≥44px;
desktop board cells measure ≥44px; selecting a fixed clue correctly
highlights other same-value cells as `is-match`. All checks pass; zero
unexpected console errors (the one pre-existing video-codec message
aside). Screenshots spot-checked in Cyber/dark (mobile) and Woodgrain/
light (desktop) — 3×3 boundaries read clearly, notes/selection/matching
states are visually distinct in both.

**Design concepts worth explaining** (also see inline comments in
`js/game-state.js` and `js/ui/board-view.js`):

- *State-driven rendering*: `board-view.js`'s `render(state)` treats
  `state` as the complete truth and recomputes every visual property
  from it on every call — never reads a cell's current class list or
  text to decide what it should become next. This is what makes the bug
  above possible to *state* precisely (a code path that skipped
  recomputing one piece of DOM from state) and easy to fix by making
  every path derive from state unconditionally, rather than needing to
  reason about what the DOM might already contain from a previous
  render.
- *Event delegation*: one `click` listener on the board container (and
  one on the number pad) instead of 81 (or 9) individual listeners.
  The handler reads `event.target.closest('.cell')` to find which
  specific cell was clicked at the moment of the click, rather than each
  cell needing its own closure capturing its own index. Fewer listeners
  to create, and cells added/rebuilt later wouldn't need new bindings.
- *Selected-cell logic*: `selectedIndex` lives in `game-state.js`, not
  in the DOM (no "which element has a CSS class" queries) and not
  duplicated into `board-view.js`'s own variable — there is exactly one
  place selection is remembered, and the renderer reads it fresh every
  time along with everything derived from it (related peers, matching
  value).
- *Normal entry vs. notes mode*: same entry point
  (`applyNumberInput`), same guards, then a single branch. Notes mode
  toggles one bit and stops — no mistake counting, no peer cleanup, no
  completion check, because a pencil mark is a guess-in-progress, not an
  answer. Normal mode does all of that, and additionally clears the
  target cell's own notes (an answered cell doesn't need candidates
  anymore) and removes the placed digit from every peer's notes (a
  digit placed in a peer cell is no longer a candidate anywhere it
  conflicts).
- *Peer cells*: "the 20 cells sharing a row, column, or box, excluding
  self" is defined exactly once (`getPeerIndices`, exported from
  `game-state.js`) and reused for both peer-note cleanup during input
  and "related cell" highlighting in the renderer. Two different
  features reading the same definition, rather than two independent
  implementations of "peer" that could quietly drift apart.
- *Why one update/render path prevents inconsistent UI*: every mutating
  function funnels through the same handful of steps and ends in the
  same `notify()`. If `applyNumberInput` and, say, a hypothetical
  separate "clear notes on entry" helper each independently decided
  when to tell the UI to re-render, it would be possible for the DOM to
  reflect a state that existed briefly *between* those two updates —
  notes cleared but the mistake not yet counted, or vice versa. With one
  path, a subscriber only ever sees complete, self-consistent snapshots,
  never a partial one — which is also exactly what made the "one
  `notify()` per mutation" test in `game-state.test.js` meaningful to
  write.

**Remaining limitations:**

- Board cells on very narrow phones (measured ~31px at 320px viewport)
  fall below the general 44px touch-target guideline — this is an
  inherent consequence of fitting 9 cells across a screen that narrow,
  not an oversight; the number pad (the more error-prone target for a
  fat-finger tap) is held to ≥44px. Every mainstream Sudoku app makes
  this same trade-off.
- The `history`/undo mechanism is capped only by memory (no maximum
  depth) — fine for a single game session, but Phase 6 (autosave) should
  decide whether history needs trimming or resetting before persisting.
- `hintsUsed` exists in state as required but nothing increments it yet
  — no hint feature was in this phase's scope; the field is reserved,
  not wired to anything.
- The elapsed-time clock is a plain `setInterval`, not deeply unit-
  tested for real-time accuracy (tests use `autoStartTimer: false` and
  assert state transitions, not wall-clock ticking) — consistent with
  how Phase 4's generation timing was verified (benchmarked/manually
  checked rather than asserted against tight real-time bounds in the
  main suite).
- Two manual-checklist items are explicitly unverified here and need a
  human on a real device: actual touch-tap accuracy (emulated Chromium
  touch isn't a real finger), and a real screen-reader pass over the
  board's `aria-label`s (designed for it, not run through one yet).
- Difficulty-dialog "Cancel" and the native `<dialog>` Escape-to-close
  both correctly leave `game-state` untouched (no game was started) —
  verified by code inspection, not a dedicated automated check.

---

## 2026-07-28 — Phase 4: Puzzle Generation and Difficulty Model

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

**What was built:**

- **`js/sudoku-generator.js`**: sits on top of the pure engine from Phase
  3 without modifying it. `generateSolvedBoard(random)` fills an empty
  board via the same backtracking approach as the engine's solver, but
  shuffles the candidate order at each cell (Fisher-Yates, driven by an
  injectable `random`) instead of trying 1-9 in order, so repeated calls
  produce different valid grids. `generatePuzzle(difficultyId, options)`
  then removes clues from a fresh solved grid one at a time, in a
  shuffled order, checking `countSolutions(puzzle, 2) === 1` after each
  removal and undoing it if uniqueness broke — the standard technique
  for "remove clues while guaranteeing a unique solution."
- **`DIFFICULTIES`**: centralized config for Easy/Intermediate/Advanced/
  Insane — `label`, `minClues`/`maxClues` (the exact bands given: 40-46/
  34-39/28-33/22-27), `scoreMultiplier` (1 / 1.5 / 2.25 / 3.5 — a
  monotonic v1 approximation, easy to retune), `maxAttempts`,
  `timeBudgetMs`, and `solverEffortRange` (an approximate backtracking-
  step range from a *separate*, step-counting solve — see below).
  `isValidDifficultyConfig()` validates the shape, including that
  `minClues` never drops below 17 — the proven minimum for any
  uniquely-solvable Sudoku (McGuire, Tugemann & Civario, 2012), so
  nothing below it could ever pass a uniqueness check regardless of
  tuning.
- **Fallback puzzles**: 2 per difficulty (8 total), all produced by
  running this module's own generator (never hand-typed), captured, and
  independently re-verified with a separate one-off script before being
  hardcoded into `FALLBACK_PUZZLES`. `validateFallbackPuzzles()`
  re-checks shape, that the stored solution actually solves, that every
  given matches it, that the clue count sits in the difficulty's
  configured range, and that `countSolutions` still reports exactly one
  solution — run both at module-load time (a non-fatal `console.warn` if
  anything's wrong) and as a dedicated test.
- **`js/ui/game-screen.js`** (new) + a `#game-status` element
  (`aria-live="polite"`) on the game screen: New Game now generates a
  real puzzle and shows status text through it ("Generating puzzle…" →
  "Ready — Easy puzzle, 43 clues (generated in 116ms, attempt 1)."), or
  a fallback-specific message if live generation didn't finish in time.
  Defaults to Easy — there's no difficulty picker yet, that belongs with
  Phase 5's board/menu UI, not this phase's generator work.

**A real bug found via benchmarking, not just review:** the first
version of `generatePuzzle` only checked its time budget *between*
whole attempts. Benchmarking Insane generation (see below) showed a
*single* attempt's clue-removal pass can itself take up to ~47 seconds
in this environment — so that outer check did nothing to stop one slow
attempt from blocking far past the configured budget. Fixed two ways:
the deadline is now checked before every individual removal (not just
between attempts), and `removeCluesForUniqueness` is now `async` and
`await`s a yield to the event loop every 6 removals, not only between
attempts. Verified with a heartbeat-timer script: over a 2.5s Insane
generation, a 50ms-interval heartbeat fired 5 times spread across the
run (max gap ~691ms) instead of the thread being held for the whole
2.5s — see "Remaining limitations" below for what that gap-size number
means honestly.

**Benchmark data used to tune the config** (mulberry32-seeded, 6-8
trials per difficulty, this sandbox environment):

| Difficulty   | Typical           | Observed max (before the mid-attempt yield fix) |
|--------------|--------------------|---------------------------------------------------|
| Easy         | ~15-50ms           | ~53ms |
| Intermediate | ~20-75ms           | ~74ms |
| Advanced     | ~60-350ms          | ~1.1s |
| Insane       | ~250ms-6.6s        | **~46.7s** (single attempt, pre-fix) |

Insane is genuinely expensive: removing clues down to 22-27 given cells
means most of the removal pass runs with very few clues left on the
board, and each remaining `countSolutions` check has to search a much
larger space than an early removal (going from 81 clues to 80 is nearly
free to verify; going from 24 to 23 is not). `timeBudgetMs`/
`maxAttempts` per difficulty were set from this data — generous enough
that Easy/Intermediate/Advanced essentially always succeed live
(observed 100% live-generation rate in benchmarking), while Insane is
expected to fall back to a bundled puzzle a meaningful fraction of the
time in practice, which is the explicitly intended design, not a bug.

**Test results** (`npm test`, engine + generator suites together):

```
# tests 45
# suites 12
# pass 45
# fail 0
```

15 new tests cover: `generateSolvedBoard` produces a valid solved board
and is deterministic under a seeded random source; every bundled
difficulty config passes `isValidDifficultyConfig` and the four bands
are non-overlapping and strictly harder in order; malformed configs are
rejected (below the 17-clue floor, inverted range, non-positive
multiplier, zero attempts, negative time budget, invalid effort range);
`generatePuzzle` produces a uniquely-solvable puzzle within its
configured clue range for all 4 difficulties, preserving every given;
an unknown difficulty id rejects with `RangeError`; a seeded run is
reproducible end-to-end (puzzle, solution, and status all identical
across two calls); the fallback path is exercised deterministically (by
temporarily setting `maxAttempts` to 0 and restoring it in a `finally`,
rather than depending on real slow generation to trigger it, which would
make the test itself slow and environment-dependent); `onStatus` fires;
and — using real timers, not the test-speed no-op yield — a marker timer
queued before generation starts is confirmed to fire *during*
generation, not just after, proving the yield actually hands control
back to the event loop. Also re-ran `js/sudoku-engine.test.js`
unchanged (30/30) to confirm Phase 3 wasn't touched.
Also verified end-to-end in a headless browser: Settings → New Game →
`#game-status` text updates live and settles on a "Ready — …" message,
no unexpected console errors (the one pre-existing video-codec message
from Phase 1 aside). Caught and fixed a real wiring bug this way — the
first draft of `js/ui/game-screen.js` was never actually imported by
`js/ui/menu.js`'s New Game handler, so nothing happened on click until
this check caught it.

**Design/CS concepts worth explaining** (also see inline comments in
`js/sudoku-generator.js`):

- *Randomized backtracking*: identical algorithm to the engine's
  `solveBoard`, with one change — candidate values at each cell are
  shuffled before being tried, instead of attempted in ascending order.
  Ascending-order backtracking from an empty board is deterministic (it
  always produces the same grid); shuffling the order it tries values in
  is what makes repeated calls produce different valid solved boards
  while still guaranteeing a valid one comes out, since every shuffled
  order is still just "some order to try 1-9 in."
- *Clue removal*: removing a clue is easy; knowing it's *safe* to remove
  is the hard part. A puzzle keeps a unique solution only as long as no
  combination of the remaining clues allows a second valid completion —
  that's a global property of the whole board, not something you can
  determine by looking at the removed cell in isolation. So the only way
  to check is to ask the solver "how many solutions does this board have
  now?" after every single removal.
- *Why uniqueness checks are expensive*: `countSolutions(puzzle, 2)` is
  a full (early-stopping) backtracking search — cheap when there are
  many clues constraining the board (few branches to explore), and
  progressively more expensive as clues thin out (more empty cells, more
  branching, more of the search tree has to be explored before the
  solver can prove — or disprove — uniqueness). A puzzle at 24 clues
  needs the same *kind* of check as one at 80 clues, but the search
  space behind that check is enormously larger. This is a direct,
  measured consequence, not a theoretical concern — it's the entire
  reason Insane generation is slow in this benchmark data.
- *Why clue count alone is insufficient*: two puzzles with identical
  clue counts can require completely different solving techniques —
  simple scanning for one, deep candidate-elimination chains for the
  other — depending on *where* the clues are, not just how many there
  are. `solverEffortRange` (steps a plain backtracking solver takes to
  fill a generated puzzle, tracked via a separate step-counting solve
  function rather than modifying the pure engine's solver) is recorded
  alongside clue count as a second, still-rough signal, precisely
  because clue count by itself is known to be an unreliable proxy for
  how hard a puzzle actually feels to a human solver. This is
  documented as a v1 approximation in `DIFFICULTIES`' own comment block,
  not presented as a rigorous rating.
- *How the time/attempt guard protects UX*: two layers, matching the two
  places JavaScript can get "stuck" — too many attempts (bounded by
  `maxAttempts`) and too much wall-clock time in one attempt (bounded by
  checking `deadline` before every removal, not just before every whole
  attempt, plus yielding to the event loop every few removals so a slow
  attempt is chopped into several event-loop turns instead of one
  uninterrupted stretch). Both layers exist because the first version of
  this module only had the outer one, and benchmarking showed that alone
  doesn't prevent a multi-second freeze — see the bug note above.

**Remaining limitations:**

- The yield-every-6-removals granularity bounds the *number* of
  `countSolutions` calls between yields, not wall-clock time between
  them — at very low clue counts a single one of those calls can itself
  take a few hundred milliseconds (observed up to ~691ms between
  heartbeats in the verification script above), so "never freezes" is
  accurate in the sense of "never blocks for its full multi-second
  duration in one stretch," not in the stricter sense of "guarantees a
  sub-100ms response time at all times." A truly hard guarantee would
  need the pure engine's solver itself to be interruptible mid-search,
  which would mean threading a deadline through `sudoku-engine.js`'s
  recursion — deliberately not done, to keep that module simple, pure,
  and untouched from Phase 3.
- Insane-difficulty live generation is expected to fall back to a
  bundled puzzle a real fraction of the time in this environment (per
  the benchmark data above) — that's the intended, documented behavior
  of the fallback system, not a defect, but it does mean Insane games
  will sometimes replay one of only 2 bundled puzzles rather than a
  fresh one.
- No difficulty picker UI yet — New Game always requests Easy. Belongs
  with Phase 5 (board rendering/menu UI), not this phase.
- The generated puzzle/solution isn't persisted or connected to a board
  yet (`getCurrentGame()` just holds it in memory) — Phase 5 renders it,
  Phase 6 will autosave it.

---

## 2026-07-28 — Phase 3: Pure Sudoku Engine + Automated Tests

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Redefined "Phase 3" to match the actual scope delivered: a pure,
UI-independent rules engine and its test suite — not yet puzzle
generation with difficulty tiers, which is real enough work to be its
own phase. `TASKS.md` renumbered: Phase 3 is now the engine (done),
Phase 4 is a new "Puzzle Generation (Difficulty Tiers)" phase (not
started, builds on Phase 3), and everything from the old Board Rendering
phase onward shifts down by one (now Phases 5–13).

**What was built:**

- **`js/sudoku-engine.js`**: board representation is a flat 81-element
  array, row-major (`index = row * 9 + col`), 0 = empty, 1–9 = filled.
  Exports: `rowColToIndex`, `indexToRowCol`, `getRowValues`,
  `getColumnValues`, `getBoxValues`, `isValidBoardShape`,
  `isValidPlacement`, `findEmptyCell`, `solveBoard`, `countSolutions`,
  `isSolved`, `getCandidates`. No DOM, no `localStorage`, no timers, no
  reference to anything outside the module — every function takes a
  board (and sometimes coordinates) in and returns a new value out.
- Validation policy, applied consistently: navigation helpers
  (`rowColToIndex`, `getRowValues`, `isValidPlacement`, `getCandidates`,
  etc.) `throw` on a malformed board/row/col/index/value — those are
  programmer-contract functions, called with values that should already
  be valid, so throwing surfaces a bug immediately. Pure predicates
  (`isValidBoardShape`, `isSolved`) never throw — "is this valid" is
  exactly the question they exist to answer, so malformed input is
  simply `false`. `solveBoard`/`countSolutions` also never throw on a
  malformed board (return their documented failure value — `null` and
  `0` respectively) since they represent a "try to do this" operation
  that may reasonably be called on questionable data (e.g. something
  loaded from storage) without every call site needing a try/catch.
- **Conflict pre-check** (`hasNoConflicts`, internal): found while
  implementing `solveBoard` — backtracking only ever fills currently
  *empty* cells, it never re-examines a given. So a board with two
  conflicting givens (say, two 5s in one row) could reach "no empty
  cells left" and get reported as solved, because nothing ever checked
  the givens against each other. `solveBoard` and `countSolutions` both
  check this upfront now, before backtracking starts.
- **`js/sudoku-engine.test.js`**: Node's built-in test runner
  (`node:test` + `node:assert/strict`), 8 `describe` blocks / 30 tests.
  Fixtures are generated, not transcribed — a "completed valid board" is
  built from the standard base-pattern formula for a valid Sudoku grid
  (`value(r,c) = ((3*(r%3) + Math.floor(r/3) + c) % 9) + 1`, verified by
  the tests themselves via `isSolved`), and a solvable puzzle is derived
  by deterministically zeroing out cells of that same grid — so
  solvability is guaranteed by construction and there was no risk of a
  copied puzzle turning out to be secretly broken.
- **`package.json`** (new): `{"type": "module", "private": true}` plus a
  `test` script. Added solely so Node treats `.js` files as ES modules
  for `node --test` — no dependencies, doesn't affect the shipped static
  app (browsers never read `package.json`).

**Test results** (`npm test`, i.e. `node --test`):

```
# tests 30
# suites 8
# pass 30
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Coverage maps directly to the required list: coordinate conversion
(including a full 81-cell round-trip and out-of-range rejection), valid/
invalid board shapes, row/column/box extraction (plus a check that
extraction returns fresh arrays, not board references), legal/illegal
placement (row, column, and box conflicts each tested separately),
solving a solvable board (asserting the result is fully solved *and*
every given was preserved, not just "some solved board came back"), an
unsolvable board (two conflicting givens), a completed valid board, a
completed invalid board (one duplicate introduced into an otherwise-
valid completed grid), `countSolutions` stopping at its limit against a
fully empty board — which has on the order of 10^21 solutions, so a
5-second wall-clock assertion is a meaningful proof it didn't try to
enumerate them all — candidate calculation (including a hand-checked
row/column/box exclusion case), and input immutability, checked
explicitly on `solveBoard`, `countSolutions`, and `getCandidates` by
diffing the input array before/after each call. `node --check` also ran
clean on both new files.

**Design/CS concepts worth explaining** (also see inline comments in
`js/sudoku-engine.js`):

- *81-cell flat array over a 9×9 nested array*: a single flat array with
  `index = row * 9 + col` avoids two levels of indirection
  (`board[row][col]`) for every access, serializes trivially to/from
  JSON and `localStorage` with no reshaping, and is exactly what
  `Array.prototype.indexOf(0)` needs to find the next empty cell in one
  call rather than a nested loop. The two representations hold the same
  information; the flat one is just more convenient for this module's
  access patterns.
- *Integer division for box lookup*: `Math.floor(row / 3) * 3` maps any
  row 0–8 down to the row where its 3×3 box starts (0, 3, or 6) — e.g.
  row 4 → `Math.floor(4/3)*3 = 3`. The same formula on `col` gives the
  box's starting column. A double loop over the 3 rows/columns from
  those starting points visits exactly the 9 cells in that box. No
  lookup table needed — it falls straight out of how the grid is
  numbered.
- *Pure functions*: every exported function's output depends only on
  its arguments, and none of them modify the array passed in. That's
  what makes `board.slice()` at the top of `solveBoard`/`countSolutions`
  load-bearing: the algorithm mutates a local copy freely (mutation is
  the efficient way to do backtracking — allocating a new 81-element
  array at every recursive step would be wasteful), but the caller's
  original array is never touched. Purity is also why the test suite
  can freely reuse `solvablePuzzle` and `completeBoard` across dozens of
  assertions without one test's call contaminating the next.
- *Backtracking recursion*: `backtrackFill` finds the first empty cell,
  tries digits 1–9 in order, and for each one that's currently legal
  (`isValidPlacement`), places it and recurses on the *rest* of the
  board. If that recursive call eventually returns `true`, the whole
  chain unwinds as solved. If none of the 9 digits lead anywhere, the
  function returns `false` and the *caller* (one level up) undoes its
  own placement and tries its next digit — that's backtracking: instead
  of detecting a dead end and giving up, the search retreats exactly one
  decision and tries the next option there.
- *Base case*: `findEmptyCell` returning nothing (`indexOf(0) === -1`)
  means every cell is filled. Combined with the upfront conflict check,
  "no empty cells and no conflicts" is the base case — a fully solved
  board — and the recursion stops growing and starts returning `true`
  back up the call stack.
- *Copying vs. mutation*: the public API is copy-in (never touches the
  argument), mutate-internally (the recursive helpers mutate their own
  local clone directly, which is both simpler to write and faster than
  threading immutable updates through 81 levels of recursion). This is
  a common, deliberate pattern — expose an immutable-feeling API on top
  of a mutable, efficient implementation.
- *Early termination*: `countSolutions`' recursive helper checks
  `state.count >= limit` both on entry and inside its digit loop. Once
  the limit is hit, every still-open frame on the call stack sees that
  check trip immediately and returns without exploring further branches
  — the search doesn't finish exploring a branch it's already given up
  on. That's the difference between finishing in milliseconds and never
  finishing at all on a near-empty board.

**Remaining limitations:**

- No puzzle *generator* yet — `js/sudoku-engine.js` can solve and count
  solutions for a given board, but nothing yet produces a puzzle with a
  target clue count or difficulty. That's the new Phase 4.
- The engine isn't wired into the app yet (no import from `index.js` or
  any `js/ui/*` module) — it's a standalone, tested module until the
  board UI (Phase 5) or generator (Phase 4) consumes it.
- Backtracking here is a plain constraint-check solver (no constraint
  propagation/MRV heuristics). It's fast enough for 9×9 Sudoku — the
  test suite's hardest case (an empty board search truncated at 2
  solutions) finishes in single-digit milliseconds — but a future
  difficulty-aware generator may want a smarter solver if it needs to
  solve many candidate boards quickly.

---

## 2026-07-28 — Phase 2: Theme System & Responsive Design

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Reordered the build plan so the visual design system lands right after
the app shell (previously slotted later as "Phase 7"). `TASKS.md` is
renumbered accordingly: Phase 2 is now Theme System & Responsive Design,
and the former Phases 2–6 (Sudoku engine, board rendering, input, save/
continue, statistics) shift down to Phases 3–7. Phases 8–12 (audio,
offline/PWA, accessibility polish, GitHub Pages, final QA) are unchanged.

**What was built:**

- **Design tokens** (`styles.css`): every color a component uses —
  background, panel, raised surface, primary/secondary text, border,
  accent, accent-contrast, focus, success/warning/error, selected/
  related/matching-value cell, fixed-clue, player-entry, notes, and
  shadow — is a CSS custom property, never a literal color in a
  component rule. 4 theme packs × 2 concrete color modes (dark/light)
  = 8 full palettes, selected via `[data-theme][data-mode]` attribute
  selectors on `<html>`. Woodgrain and Paper use `linear-gradient()`
  values directly as their background/panel/surface tokens (no images)
  — since `background: var(--color-bg)` accepts a gradient exactly like
  it accepts a hex color, no component rule had to change to support
  textured themes.
- **`js/theme.js`**: owns the persisted preference
  (`{ version: 1, theme, mode }` in `localStorage` under
  `sudoku-inspire:appearance`), validates it strictly on read (unknown
  version, garbage JSON, or an out-of-list theme/mode all fall back to
  `{ theme: 'light', mode: 'system' }` rather than being partially
  trusted), and resolves "system" mode to a concrete `dark`/`light`
  value via `matchMedia('(prefers-color-scheme: dark)')` before writing
  `data-mode` to the DOM — with a `change` listener so the app re-themes
  live if the OS preference flips while "System" is selected, no reload
  needed.
- **Anti-flash inline script** in `index.html <head>` (before the
  stylesheet link): reads and validates the same storage key
  synchronously and sets `data-theme`/`data-mode` before first paint, so
  there's no flash of the wrong palette. `js/theme.js` re-derives the
  same state right after and takes over from there (the OS-change
  listener, the Settings dialog); the small duplication between the two
  is a deliberate, common trade-off for avoiding FOUC.
- **Settings dialog** (`js/ui/settings.js`, wired from the menu's
  Settings button): a native `<dialog>` with radio groups for theme pack
  and color mode. Selecting either applies and persists immediately
  (live preview) — no separate "Apply" step. Includes a live preview
  swatch grid demonstrating the board-state tokens (selected/related/
  matching-value cells, fixed clue vs. player entry vs. notes text) and
  a status-chip row (success/warning/error) before the actual Sudoku
  board or validation logic exists, and a Reset Appearance button.
  Status chips pair color with an icon glyph, a text label, and their
  own outline — never color alone; the same requirement is documented as
  a constraint on `--color-cell-selected`/`-related`/`-match` for
  whoever builds the Phase 4 board (those tints are intentionally
  subtle and must be paired with a structural cue, not read on their
  own).
- **Responsive app frame**: mobile is unchanged full-bleed; at ≥768px
  `#app` becomes a centered, max-width card with a panel background and
  shadow (both theme tokens), demonstrating the "raised surface" token
  practically. Safe-area insets extended from just the Skip button
  (Phase 1) to all screen edges and `#app`.
- Menu wiring: `#btn-settings` now opens the dialog (was inert since
  Phase 1).

**Verification:**

- Scripted WCAG contrast check (custom Node script, relative-luminance
  formula) against all 8 palettes before writing any CSS: every text/
  background pairing hit AA (4.5:1 normal text, 3:1 for accent-as-UI and
  small notes text). Three initial color picks failed on the first pass
  (a couple of accent colors were too close to their background/panel)
  and were darkened/lightened until they cleared the bar — see the
  script's final palette values, which is what shipped.
- Headless Chromium (Playwright) end-to-end script covering: default
  attrs on first load; all 12 theme/mode combinations (including
  "system" resolving correctly against both light and dark emulated OS
  schemes) with no console errors and a resolved background on every
  combination; localStorage persistence across reload; three flavors of
  invalid/corrupt stored data all falling back to safe defaults; Reset
  Appearance restoring defaults and re-syncing the dialog controls; a
  live OS color-scheme flip updating `data-mode` without reload while
  "System" is selected, and explicit Dark/Light staying put regardless
  of OS changes; 320px mobile vs. 1280px desktop app-frame styling;
  ≥44px touch targets on menu/dialog controls; reduced-motion collapsing
  transition durations; Escape closing the dialog. 38 of 39 checks
  passed outright.
- The one failure was "no console errors on load," caused by the same
  pre-existing issue from Phase 1: this sandbox's headless Chromium
  build lacks proprietary H.264/AAC codec support, so the intro video
  still errors out here (confirmed it's the identical failure, not a
  regression — same `net::ERR_ABORTED` on `inspiresoftwareintro.mp4`,
  nothing else). Not a Phase 2 issue.
- Visually spot-checked 8 of the 12 combinations as screenshots (both
  viewport sizes, a mix of gradient and flat themes) — gradients render
  correctly, swatches and status chips are legible, and the desktop
  card frame looks intentional rather than accidental.
- `node --check` on all 7 JS modules.

**Design decisions worth explaining** (also see inline comments in
`styles.css`/`js/theme.js`):

- *CSS custom properties as the token layer*: a component rule like
  `.menu-nav button { background: var(--color-accent); }` never mentions
  a specific color. What `--color-accent` resolves to is entirely
  decided by which `[data-theme][data-mode]` block is in scope for that
  element (custom properties inherit down the DOM tree and the closest
  definition wins). This is why adding a 5th theme pack later means
  adding one more token block, not touching a single component rule —
  exactly the "avoid duplicating component rules per theme" requirement.
- *`data-theme`/`data-mode` as the switching mechanism*: attribute
  selectors on `<html>` (`:root[data-theme="cyber"][data-mode="dark"]`)
  let one JS call (`root.dataset.theme = 'cyber'`) instantly re-scope
  every custom property on the page — no re-render, no JS touching
  individual elements.
- *Why resolve "system" to a concrete `data-mode` in JS instead of an
  `@media (prefers-color-scheme: dark)` block in CSS*: the media-query
  approach would require duplicating every theme's dark-token block a
  second time (once for explicit `[data-mode="dark"]`, once inside the
  media query for `[data-mode="system"]`), which is exactly the kind of
  per-theme duplication the task asked to avoid. Resolving in JS means
  each theme's dark palette is written exactly once, and the OS-preference
  logic lives in exactly one place (`js/theme.js`) instead of being
  spread across CSS and JS.
- *Why gradients live directly in color tokens*: `background` accepts
  either a color or a gradient function, so `--color-bg` can hold
  `#eef0f2` for Light or `linear-gradient(...)` for Woodgrain/Paper
  without any component rule needing an `if (theme has gradient)`
  branch — the indirection that makes tokens valuable is exactly what
  makes this work for free.
- *Why semantic tokens over hard-coded colors generally*: hard-coding
  `#2b6cb0` in ten places means ten edits (and ten chances to miss one)
  every time a color needs to change, and makes "does this look right
  in Cyber dark mode" impossible to answer without literally switching
  themes and hunting for stragglers. A semantic name (`--color-accent`)
  documents *intent* at the call site and centralizes every theme's
  actual value in one place that's easy to audit (like the contrast
  script above) and easy to extend.
- *Versioned persistence with strict validation*: the stored payload
  carries a `version` field on purpose. If the schema ever changes
  (e.g. a future mode gets added or removed), bumping `SCHEMA_VERSION`
  and requiring an exact match means old stored data is never partially
  trusted — it's read as invalid and replaced with safe defaults, rather
  than crashing or rendering a broken hybrid state.

**Remaining limitations:**

- Intro video playback still can't be visually confirmed in this
  sandbox (codec limitation, not a code issue — see Phase 1 log entry
  and above).
- The `border`, `cell-selected`, `cell-related`, and `cell-match` tokens
  are deliberately soft (low contrast against their background) by
  design — they're meant to be subtle tints, not loud UI outlines. This
  means they don't independently clear a strict 3:1 non-text contrast
  bar against the page background. This is fine as long as the actual
  board (Phase 4) pairs them with a non-color structural cue (a ring/
  border/weight change) as documented in the token comments — that
  pairing doesn't exist yet since there's no board to attach it to.
- App icon source images for the PWA manifest are still outstanding
  (needed for Phase 9, unchanged from before).

---

## 2026-07-28 — Learning Contract amended; Phase 1 complete

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

- User supplied `./inspiresoftwareintro.mp4` and `./logo.png` (pushed
  directly to the branch as a separate commit, pulled into this session).
- **Workflow change:** the user found the per-phase `TODO(USER)` checkpoint
  pattern was blocking progress (syntax/logic not yet solid enough to work
  independently). By explicit request, `CLAUDE.md` → Learning Contract was
  amended: the assistant now implements each phase in full, explaining
  code thoroughly as it goes, instead of leaving a checkpoint for the user
  to write. The original contract is kept in `CLAUDE.md` for history.
- Finished Phase 1 (App Shell & Screen Flow) under the new contract:
  - `index.html` — four screen sections (Start/Intro/Menu/Game) with
    `tabindex="-1"` for programmatic focus management.
  - `styles.css` — mobile-first layout, CSS custom-property scaffold for
    theme packs (Cyber/Woodgrain/Paper stubs; Light values live on
    `:root`) and color modes (System/Dark/Light), focus-visible styling,
    a `prefers-reduced-motion` reset.
  - `js/screens.js` — a small `showScreen(id)` state machine: hides all
    screens but one and moves focus into it.
  - `js/ui/start-screen.js` — click **or** keydown advances past the start
    screen exactly once (listeners are removed on first trigger so a
    click followed immediately by a keypress can't double-fire).
  - `js/ui/intro-video.js` — plays the intro video; Skip button, the
    video's `ended` event, and its `error` event all route to the same
    `finishIntro()` → main menu, so a missing/broken video file degrades
    gracefully instead of stranding the user.
  - `js/ui/menu.js` — wires New Game → game-screen placeholder. Continue
    Game stays disabled (no save data exists until Phase 5); Statistics/
    Settings buttons exist but aren't wired yet (Phases 6–7).
- **Verification:** syntax-checked all new JS files (`node --check`), then
  drove the app end-to-end with headless Chromium (Playwright): start
  screen → keypress advance, main menu render, `logo.png` loads, New Game
  → game screen placeholder, no console errors from the app itself.
  - Note: Python's built-in `http.server` doesn't support HTTP Range
    requests, which made the video error out during local testing — not a
    real bug, GitHub Pages serves Range requests correctly. Switched to a
    small Range-capable local test server to isolate this.
  - With Range support in place, the video still failed to play in this
    sandbox's headless Chromium build, but for an unrelated, expected
    reason: that build lacks proprietary H.264/AAC codec support (a known
    limitation of open-source Chromium builds vs. real Chrome/Edge/
    Firefox/Safari). Confirmed via `canPlayType()` and by inspecting the
    file's MP4 box structure directly — it uses standard `avc1`/`mp4a`
    (H.264/AAC), a well-formed, ordinary file.
    The video's `error` listener caught this and correctly fell back to
    the main menu, which is exactly the graceful-degradation behavior
    Phase 1 was built to have — so this doubled as a live test of that
    fallback path. Real-browser video playback should still be spot-
    checked manually by the user when convenient, since it couldn't be
    visually confirmed in this environment.
- Updated `TASKS.md`: Phase 0 fully checked off, Phase 1 fully checked
  off, per-phase checkpoint bullets removed from all future phases, and
  the asset blocker updated to reflect the two supplied files (PWA icons
  still outstanding, needed for Phase 9).

---

## 2026-07-27 — Phase 0: Environment & Planning

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

- Verified the working directory is a git repository, currently empty (no
  commits).
- Verified `origin` remote is already correctly configured to
  `officialinspire/sudoku-by-inspire-v1`.
- Confirmed the remote repository already exists on GitHub (currently
  empty — no commits/default branch yet), so no repository creation was
  needed.
- Created the five foundational planning documents: `CLAUDE.md`,
  `PROJECT_BRIEF.md`, `TASKS.md`, `DEVELOPMENT_LOG.md`, `README.md`.
- Recorded all non-negotiable v1 requirements and the learning-contract
  workflow in `CLAUDE.md`.
- Defined v1 acceptance criteria and scope boundaries in `PROJECT_BRIEF.md`.
- Built the 12-phase build checklist in `TASKS.md`.
- **Missing assets detected:** `./inspiresoftwareintro.mp4` and
  `./logo.png` are not present in the repo. No app code was written yet
  (per instructions) — this is planning-only.
- No checkpoint assigned this phase (environment/planning setup only; the
  first `TODO(USER)` checkpoint will be assigned in Phase 1).
