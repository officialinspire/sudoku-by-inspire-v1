# DEVELOPMENT_LOG.md

Running, dated log of what happened each session. Append — don't rewrite
history. Newest entry at the top.

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
