# DEVELOPMENT_LOG.md

Running, dated log of what happened each session. Append — don't rewrite
history. Newest entry at the top.

---

## 2026-07-28 — Phase 14: UX/Audio Polish and Three Real Bug Fixes

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A direct user-feedback round (not a numbered "Prompt"), covering audio,
visual polish, and an explicit "test play to verify no bugs." Logged as
the new Phase 14 in `TASKS.md`, shifting Final QA to Phase 15 — same
insert-and-shift convention used for prior unplanned phases.

**Missing assets, flagged up front:** the user described `Logic
Flow.mp3` (gameplay music) and `Sudoku Zen.mp3` (menu music) as already
being "in repo main directory." Checked the actual filesystem and full
git history before writing any code — neither file exists anywhere.
Per `CLAUDE.md`'s binary-asset policy, nothing was fabricated in their
place; the full two-track playback system was built and verified with
both tracks absent (the same graceful-optional-asset pattern already
proven for `background-music.mp3` in Phase 9), ready to work the moment
the real files are supplied with those exact names. Told the user this
directly before starting the rest of the work, rather than silently
building around a gap or blocking on it.

**What was built:**

- **Two-track contextual music** (`js/audio.js`, substantially rewritten
  from Phase 9's single-track model): each track (`menu` → "Sudoku
  Zen.mp3", `gameplay` → "Logic Flow.mp3") gets its own `<audio>`
  element and its own gain node purely for fade in/out, both feeding
  into the existing shared `musicGain` (the actual volume-slider
  control) — so a crossfade is just ramping one track's gain to 0 while
  ramping the other's to 1, without either needing to know the other
  exists. `js/screens.js` gained a small `onScreenChange(listener)`
  subscription hook (mirrors the existing `onStateChange` pattern) so
  `audio.js` can pick the right track without `screens.js` knowing
  anything about audio. Menu/Statistics/High Scores share the "menu"
  track (switching every time you glance at Statistics would be more
  distracting than helpful); Game gets "gameplay"; puzzle completion
  explicitly stops music rather than leaving it looping under the
  completion dialog. `sw.js`'s optional-asset list and `CACHE_NAME` were
  updated to match (`v1` → `v2`, per its own documented versioning
  policy) — verified the service worker still installs cleanly with
  both new (currently-404ing) filenames.
- **Menu fade-in from black**: a fixed, full-screen black overlay
  (`#menu-fade-overlay`) that appears and fades to transparent whenever
  `finishIntro()` runs — whether the video played to completion or was
  skipped, both count as "the intro just finished." Skipped entirely
  (not just sped up) under `prefers-reduced-motion: reduce`.
- **`logo.png` on the Start screen**, above the "Sudoku by Inspire"
  heading — `alt=""` since the heading already conveys the same brand
  name textually (the image is a decorative reinforcement, not new
  information — the correct accessible-name pattern for that situation).
- **Typography/menu polish**: heavier, tighter brand heading
  (`font-weight: 800`, negative letter-spacing), a touch more size on
  body/prompt text, subtle shadow depth on menu buttons, tightened
  footer spacing — all CSS-only, no new font files. Considered
  self-hosting a distinct webfont for more visual character, but ruled
  it out: sourcing and verifying licensing for a new binary asset within
  this session carries real risk for a "nice to have," while the
  existing `system-ui` stack already renders each platform's own
  highest-quality native font — the safer, zero-risk path was extracting
  more visual quality from weight/spacing/hierarchy instead.

**Three real bugs found and fixed** (the user's "test play to verify no
bugs" instruction was taken literally — these were found by actually
measuring the rendered page with Playwright, not just eyeballing
screenshots):

1. **Page-level scrolling on desktop** (and some mobile widths). Root
   cause: Phase 11's `#screen-game { display: grid; ... }` desktop/
   landscape layout rules use an ID selector, which is *more specific*
   than the base `.screen[hidden] { display: none }` rule — so the
   hidden game screen kept its full ~720px layout height behind
   whatever screen was actually showing, inflating the page. Confirmed
   directly: `getComputedStyle(#screen-game).display` was `"grid"` even
   with `hidden` set. Fixed with an explicit `#screen-game[hidden] {
   display: none }` override (specificity now wins on its own terms,
   regardless of what other `#screen-game` rules exist or get added
   later). Separately, desktop's `#app { margin: var(--space-5) auto }`
   centering trick was independently leaking ~40px of collapsed margin
   into `documentElement.scrollHeight` (confirmed by comparing
   `document.documentElement.scrollHeight` against `document.body.
   scrollHeight` — 840 vs. 800) — replaced with flexbox centering on
   `body`, which doesn't have the same collapse behavior. Added a global
   backstop on top of both fixes: `html, body { overflow: hidden }`
   plus `max-height: 100dvh; overflow-y: auto` on every `.screen`, so
   even a future regression stays contained to one screen's own scroll
   instead of growing the whole page again.
2. **Board grid lines nearly invisible in 7 of 8 theme/mode
   combinations.** `.board`'s 1px cell gaps used `--color-border` as
   their color — measured at only 1.3-2.4:1 contrast against
   `--color-panel` across themes (WCAG's minimum for non-text UI
   boundaries is 3:1), so the inner grid essentially disappeared into
   the panel color everywhere except Light mode, confirmed visually
   before the fix in every theme's board screenshot. Fixed by reusing
   `--color-text-secondary` instead — already verified elsewhere (Phase
   11's contrast audit) to clear 4.5:1 against `--color-panel` in all 8
   combinations, so no new color values needed hand-tuning.
3. **Digits rendered ~15px off-center horizontally.** The exact same
   *class* of bug as #1, one level down: `.cell-notes { display: grid }`
   also beat the default `[hidden] { display: none }` for a "hidden"
   notes grid, which stayed present as a same-height flex sibling next
   to `.cell-value` inside each cell — skewing the flex centering by
   roughly the notes grid's own width. Measured precisely with
   Playwright (comparing each digit's rendered center to its cell's
   center) before and after: ~15px off before, ~1px (font-rendering
   rounding, not a real bug) after adding `.cell-notes[hidden]`/
   `.cell-value[hidden]` overrides. Worth calling out as a pattern for
   future CSS: **any element given its own explicit non-default
   `display` value needs an explicit `[hidden] { display: none }`
   sibling rule** — the browser's default `[hidden]` styling silently
   loses to an author rule of equal-or-lower specificity due to CSS
   origin precedence (author beats user-agent regardless of specificity
   ties), and this is now the *second* time that exact mechanism caused
   a real, user-visible bug in this codebase.

**Checks run:**

- `node --check` across all 46 `.js` files: clean.
- `npm test`: 181/181 passing, unchanged (no pure-logic module touched
  this phase — everything was CSS, markup, or the browser-only
  `js/audio.js`/`js/screens.js`, none of which have or need dedicated
  unit tests, consistent with this project's established
  browser-only-module precedent).
- Full Playwright playtest: all 4 difficulties generated and labeled
  correctly, complete input surface exercised (select, digit entry,
  notes toggle, erase, undo, hint with confirmation, pause/resume via
  Escape), a full puzzle solved to completion, reload + Continue Game
  correctly disabled afterward, Clear Data flow, all 8 theme/mode
  combinations checked for zero page overflow, and a 320px keyboard-only
  pass (Enter to start, Tab+Enter to open New Game, Escape to cancel
  with focus restored) — zero console/page errors across the entire run.
- Precise pixel-measurement checks (not just visual screenshots) for
  both the scrolling fix (`documentElement.scrollHeight` vs.
  `innerHeight`, exact match after the fix) and the centering fix
  (per-digit offset from cell center, sub-2px after the fix).

**Remaining limitations:**

- `Logic Flow.mp3` and `Sudoku Zen.mp3` still don't exist in the repo —
  the entire two-track system is unheard, verified only at the
  code-path level (no throws, correct track selected per screen, correct
  crossfade timing math). Needs a real listen once the files are
  supplied.
- The intro video's silence ("Main intro video has no audio :(") is
  acknowledged but not actionable from this codebase — it's the user's
  own binary asset, and `CLAUDE.md`'s policy is to never
  fabricate/replace/overwrite it. If audio is ever added to that file,
  no code change is needed (the video isn't force-muted by a hidden
  audio-availability check, just given the `muted` HTML attribute for
  autoplay-policy reasons — same as before this phase).
- Given how the "hidden but still displayed" bug pattern showed up
  twice, ran a preemptive audit of every other element toggled via
  `.hidden` in JS (`.pause-overlay`, `.menu-fade-overlay`,
  `.connection-status`, `.update-banner`, `#highscores-empty`) against
  its CSS: the first four already have correct `[hidden]` overrides
  (added defensively in earlier phases), and `#highscores-empty`
  (`.game-status`) has no conflicting `display` rule to begin with, so
  the browser's default `[hidden]` behavior already works there
  unaided. No third instance found.

---

## 2026-07-28 — Phase 13: Production Deployment Readiness

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Matches `TASKS.md`'s existing Phase 13 (GitHub Pages Deployment)
directly — no renumbering needed this time.

**Important constraint honored this phase:** the prompt explicitly said
not to push or change remote repository settings without permission.
Every file change below is committed locally to this branch as usual,
but **the commit has not been pushed**, and GitHub Pages has **not**
been enabled — both are real, external, hard-to-reverse actions (a
push is visible to others; enabling Pages exposes a live public URL)
that this project's own working agreement (`CLAUDE.md`) and this
prompt's explicit instruction both require a human's go-ahead for.
Deployment steps are fully documented and ready to run; none were run.

**What was built/verified:**

- **Absolute-path audit**: scripted `grep` across every HTML
  `href`/`src`, every CSS `url()`, every JS `import`/`fetch`, the
  manifest, and `sw.js` for anything starting with a bare `/` — zero
  matches. Every path in this repo was already relative (`./...` or
  `../...`), built that way deliberately since Phase 1, so this was
  confirmation of existing discipline, not a fix.
- **`.nojekyll`** (empty file, repo root) — tells GitHub Pages to skip
  its default Jekyll build step.
- **`.gitignore`** — `node_modules/`, OS/editor cruft, `.env*`. This
  project has zero dependencies today (`npm test` uses only Node's
  built-in test runner), so there's nothing to actually ignore yet, but
  it's cheap insurance against the first future `npm install` landing
  in a commit by accident.
- **Simulated-subpath deployment check**: served the repo through a
  local static server with a `/sudoku-by-inspire-v1/` URL prefix
  (mirroring the real shape of a GitHub Pages project-site URL —
  `https://<owner>.github.io/<repo>/`) and drove it with Playwright:
  confirmed the manifest resolves under the subpath, the service
  worker's registered `scope` is confined to the subpath (never the
  origin root), every core and optional asset precached under the
  correct subpath-prefixed URL, a complete game played start-to-finish
  with zero failed network requests and zero console errors. This is
  the same verification technique used in Phase 10's PWA work, re-run
  here specifically as this phase's deployment-readiness gate.
- **Full pre-deployment audit**, per the prompt's explicit checklist:
  - `npm test`: 181/181 passing.
  - `node --check` across all 46 `.js` files: clean.
  - `sw.js`'s `CORE_ASSETS`/`OPTIONAL_ROOT_ASSETS` cross-checked against
    what's actually on disk: all 5 core files exist, both existing
    optional assets (`logo.png`, `inspiresoftwareintro.mp4`) exist,
    `background-music.mp3` correctly does not.
  - Secrets/local-machine-path grep across every source file: no
    matches (the only "secret"/"token" hits were CSS "design token"
    terminology and unrelated English prose).
  - Largest tracked file is the intro video at 276KB — nowhere near any
    size concern.
  - `git log --follow` on `logo.png` and `inspiresoftwareintro.mp4`
    each show exactly one commit (the user's original upload) — neither
    has ever been touched by any phase since, confirmed by file-type
    signature and checksum as still valid, unmodified PNG/MP4 files.
  - `grep` for `https?://` across every runtime file (HTML, CSS, JS,
    manifest, service worker): zero matches — confirmed zero external
    runtime dependencies, consistent with CLAUDE.md's requirement.
- **`README.md`** fully rewritten (previously still Phase 0's
  placeholder "planning complete, application code not yet started"
  text) — overview, local development, a controls table, themes/modes,
  assets (including the optional-music and PWA-icon status), tests, PWA/
  offline verification steps, local-data behavior, cache reset/update
  instructions, exact GitHub Pages deployment steps (UI + optional CLI),
  `inspireclothing.art` integration options, suggested repository
  topics, and a troubleshooting section.

**Explanation (why repository subpaths break absolute URLs, what
GitHub Pages serves, when Actions are unnecessary, service-worker scope
vs. deployment path, connecting a custom domain later):**

- *Why repository subpaths break absolute URLs*: a path starting with
  `/` (like `/index.js` or `/styles.css`) is resolved by the browser
  against the current **origin** (scheme + host + port) — always the
  domain root, no matter how deep the current page's own URL is nested.
  `https://user.github.io/sudoku-by-inspire-v1/index.html` referencing
  `/styles.css` would actually request
  `https://user.github.io/styles.css` — one level too high, landing
  outside the repo's own subfolder entirely, a 404. A **relative** path
  (`./styles.css`) is resolved against the *current document's own URL*
  instead, so it correctly lands at
  `https://user.github.io/sudoku-by-inspire-v1/styles.css`. This is
  also exactly why a page that works perfectly when opened at a domain
  root (or via `file://`, or via a local dev server with nothing else
  under it) can silently break the moment it's hosted one folder deeper
  — the bug is invisible until the hosting path actually changes.
- *What GitHub Pages serves*: literally the files in the chosen
  branch/folder, over HTTP(S), completely unprocessed except for the
  optional Jekyll build step (skipped here via `.nojekyll`) — there is
  no server-side code execution, no environment variables, no backend
  of any kind. That's precisely why this app is a perfect fit for it:
  it's already "just static files that happen to talk to each other via
  relative URLs," which is all Pages can (or needs to) serve.
- *When Actions are unnecessary*: GitHub Actions exists to run a
  process — most commonly a build step — before publishing. A
  project with no build step has nothing for Actions to *do* on the way
  to Pages; "deploy from a branch" publishes the repository's own files
  directly, with one less moving part (no workflow YAML to maintain, no
  Actions minutes consumed, no extra point of failure) than an
  Actions-based deploy would add for zero benefit. The moment a real
  build step exists — a bundler, a TypeScript compile, anything that
  produces output *different* from the source files — Actions becomes
  the right tool, because "deploy from a branch" can only publish what's
  literally committed, not a build artifact.
- *Service-worker scope vs. deployment path*: a service worker's
  `scope` defaults to the directory containing the script it was
  registered from, and can never be broader than that (a worker at
  `/sudoku-by-inspire-v1/sw.js` can control pages under
  `/sudoku-by-inspire-v1/` but never anything outside it, even on the
  same origin) — this project's registration
  (`navigator.serviceWorker.register('./sw.js', { scope: './' })`, in
  `js/sw-register.js`) is written relative to wherever `index.html`
  itself was loaded from specifically so this resolves correctly
  whether that's a domain root or a repository subpath, without any
  environment-specific configuration. Verified directly this phase: the
  simulated-subpath check above confirmed `registration.scope` came
  back as the full subpath URL, not the origin root.
- *Connecting a custom domain later*: GitHub Pages can serve this exact
  same repository from a custom (sub)domain instead of `github.io`
  purely via DNS + a `CNAME` file — no application code changes needed,
  because the app's relative-path architecture already works
  identically at any origin. The domain owner adds a DNS `CNAME` record
  pointing the desired subdomain at `<owner>.github.io`, and either
  commits a `CNAME` file containing that domain to the repo root or sets
  it via Settings → Pages → Custom domain (which creates the file
  automatically); GitHub then provisions a TLS certificate for it
  automatically once DNS propagates. This is real, live-domain
  infrastructure — exactly the class of action this phase deliberately
  did not perform without explicit permission.

**Checks run:**

- `npm test`: 181/181 passing (unchanged from Phase 12 — no application
  code changed this phase, only deployment/documentation artifacts).
- `node --check` across all 46 `.js` files: clean.
- Full absolute-path grep audit: clean (see above).
- Simulated-subpath Playwright deployment check: all assertions passed,
  zero failed requests, zero console errors.

**Remaining manual actions (deliberately not performed this phase):**

- Push this branch / merge to the default branch.
- Enable GitHub Pages (Settings → Pages → Deploy from a branch) — exact
  steps are in `README.md`'s Deployment section.
- Run `MANUAL_QA.md`'s full checklist against the real, live Pages URL
  once deployed (this phase only verified a *simulated* subpath
  locally — a real deployment is still worth its own pass, especially
  for real-device video/audio playback and real screen-reader use,
  neither of which this sandboxed environment can confirm).
- Supply PWA icons (`icons/README.md`) and, if desired later, a real
  `background-music.mp3` — both optional, both already handled
  gracefully in their absence.
- Decide on and implement an `inspireclothing.art` integration option
  (see `README.md`'s three options) once that site's own platform is
  known — deliberately not assumed or chosen in this repo.
- Add the suggested repository topics (`sudoku`, `javascript`, `pwa`,
  `offline-first`, `indie-game`, `inspire`) via Settings → General →
  Topics — a repository-settings change, so left for the user.

---

## 2026-07-28 — Phase 12: Full Engineering Audit — Tests and Manual QA

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt didn't carry an explicit "Prompt NN" header, but its content
(comprehensive automated-test audit + a manual QA checklist) doesn't
match any existing `TASKS.md` phase — Phase 11 (Accessibility) was
already done, Phase 12 was GitHub Pages Deployment, Phase 13 was Final
QA. Inserted as the actual new Phase 12, shifting Deployment to 13 and
Final QA to 14, matching the same pattern used for prior insertions
(see the Phase 6 and Phase 7 log entries).

**What this phase actually was:** an audit, not a build. The explicit
instruction was "do not intentionally create failing exercises" and to
add tests only for genuine gaps — so the real work here was reading
every existing test file against its matching source module, function
by function, to find out whether the coverage the prompt asked for
already existed (much of it did, built incrementally as each earlier
phase landed its own module) versus where a real hole remained.

**Audit findings, by requested category** (file:describe-block, or
"gap closed" with what was added):

- Coordinate helpers → `sudoku-engine.test.js`: "coordinate conversion"
  (round-trips all 81 cells, rejects out-of-range input).
- Board validation → "board shape validation" (wrong length, non-array,
  out-of-range/non-integer cells).
- Valid placement → "placement legality" (row/column/box conflicts, a
  cell's own value never self-conflicting, out-of-range values).
- Solver success and failure → "solveBoard" (solves a solvable puzzle
  preserving every given; returns `null` for an unsolvable board with
  conflicting givens; returns `null` rather than throwing on malformed
  input).
- Solution-count limit → "countSolutions" (an empty board — which has
  an astronomically large solution count — stops at the requested limit
  in well under 5 seconds instead of exhaustively enumerating).
- Puzzle uniqueness → `sudoku-generator.test.js`'s "generatePuzzle" test
  asserts `countSolutions(result.puzzle, 2) === 1` for every difficulty,
  and the fallback-puzzle path is checked the same way.
- Difficulty configuration → "difficulty configuration" (every bundled
  config valid, clue bands match spec and never dip below the proven
  17-clue minimum, bands don't overlap and get strictly harder,
  malformed configs rejected on 8 different specific defects).
- Notes behavior → `game-state.test.js`'s "applyNumberInput — notes
  mode" and "toggleNote" (candidate bits toggle independently, don't
  touch entries/mistakes, survive being set/cleared twice).
- Peer-note cleanup → "removes the placed value from peer notes" (both
  for a normal entry and, separately, for `useHint`).
- Undo history → "undo" and "bounded undo history" (restores
  entries/notes/selection/mistakes/hints from before the last mutation;
  caps at `MAX_HISTORY_SIZE`, dropping the oldest).
- Timer/pause state transitions → "timer" (5 tests, all against a fake,
  advanceable clock — no real `setInterval` in the test process at all):
  accrual, pause freezing time, a named suspension reason freezing time
  independently of `status`, multiple simultaneous suspension reasons
  only releasing once all clear, completion freezing time permanently.
- Scoring boundaries → `scoring.test.js` (par-value baseline, harder
  difficulty scores higher, under/over-par speed bonus behavior, exact
  per-mistake/per-hint penalty amounts, **never negative**, always an
  integer, unknown-difficulty fallback).
- Storage corruption and validation → `storage.test.js` plus
  `active-game-store.test.js`/`statistics-store.test.js`/
  `high-scores-store.test.js`'s own "corrupt data fails safely" blocks
  (malformed JSON, validator rejection, storage-access-throws,
  `localStorage` entirely absent, and per-store shape-specific bad data
  like a stored high-scores list longer than 10 or a negative score).
- Statistics updates → `statistics-store.test.js` (started/completed
  counts, best/average time, streak increment and reset-on-abandon,
  independence across difficulties, division-by-zero guards for
  completion rate and average time already covered by the "empty state"
  test).
- Completion detection → `game-state.test.js`'s "completion" (filling
  every cell to match the solution marks it complete and clears
  selection; an incomplete board never is; placing notes on the last
  empty cell never triggers it, since notes never write to `entries`).
- Share-result formatting → `completion.test.js`'s "buildShareText"
  (includes difficulty/time/mistakes/hints/score, correct singular
  "1 mistake"/"1 hint" grammar, pure-function determinism).

**Two genuine gaps found and closed** (not padding — both are real,
previously-unexercised branches in existing source code):

- `getCandidates` had no test for the case where a cell's peers already
  cover all 9 digits (an empty array result) — only the "some digits
  used" and "no digits used" cases existed. Added a fixture that fills
  a target cell's box-peers with 1-8 and a row-peer with 9.
- `pauseGame()`/`resumeGame()` both have an early-return guard
  (`if (state.status !== 'playing') return;` and the paused-status
  equivalent) that had literally zero test coverage — every existing
  test only ever called them in the state where they're expected to
  actually do something. Added 3 tests: pausing an already-paused game
  is a no-op, resuming a non-paused game is a no-op, and resuming with
  no game in progress at all (`status: 'idle'`) is a no-op.

**`MANUAL_QA.md`** — a new top-level checklist covering everything a
`node:test` unit test structurally cannot reach: real video/audio codec
playback, the real service-worker install/update/cache lifecycle, real
viewport rendering at specific breakpoints, real dialog focus behavior
in an actual browser, and (explicitly flagged as a known gap, not
something this phase could close) real screen-reader software. Organized
around the exact 16 scenarios the prompt named, plus a closing "known
environment limitations" section documenting what this project's own
sandboxed dev environment specifically can't verify (the intro video's
codec, real assistive technology) so a future QA pass knows what's
already been checked here versus what still needs a real device/browser.

**Checks run:**

- `node --check` across **all 46** `.js` files in the repo (not just the
  ones touched this phase) — clean.
- `npm test`: **181/181 passing**, 57 suites (177 carried over + 4 new:
  1 `getCandidates` test, 3 `pauseGame`/`resumeGame` guard tests).
- One full Playwright end-to-end smoke run (start → menu → new game →
  deliberate mistake → hint → pause/resume → complete → statistics/high
  scores reflect it → reload → Continue correctly disabled → offline
  reload still boots) — zero console/page errors, confirming no
  regression across the accumulated work of every prior phase.
- **Zero automated-test failures found.** Nothing needed fixing this
  phase beyond closing the two coverage gaps above — an honest finding,
  not a shortcut: the prior phases' own "run checks" discipline (every
  phase's `DEVELOPMENT_LOG.md` entry already shows a full green test run
  before that phase was called done) is exactly why there was nothing
  broken left to find here.

**Explanation (testing pyramid, unit vs. manual QA, how regression tests
protect fixes, reading a Node test failure):**

- *The testing pyramid, for this project specifically*: a wide base of
  fast, deterministic `node:test` unit tests (181 of them, ~5 seconds
  total) covering every pure-logic module — the Sudoku engine, the
  generator, game state, scoring, storage, and every persisted store —
  each testable with zero DOM and zero real timers (see the "fake clock"
  pattern in `game-state.test.js`'s timer tests, or the in-memory
  `localStorage` polyfill in every store's test file). Above that, a
  thin layer of Playwright browser-automation scripts — used throughout
  Phases 7-12 for exactly the things unit tests can't reach (real
  `<dialog>` focus restoration, a real service worker's cache lifecycle,
  real CSS layout at specific viewports) — written ad hoc per phase
  rather than committed as a permanent suite, since this project
  deliberately has no browser-test framework installed (see the
  "do not add a large framework" instruction this phase itself
  received). At the very top, `MANUAL_QA.md`: the smallest, slowest
  layer, for the handful of things that need an actual human in an
  actual browser (or an actual screen reader) — video codec playback,
  real device rotation, real assistive technology.
- *What belongs in a unit test vs. manual QA*: the dividing line is
  "does this function's correctness depend on anything outside pure
  JavaScript values?" `calculateScore(result, config)` takes plain
  numbers and returns a plain number — trivially a unit test, no matter
  how complex the formula. Whether a `<video>` element actually decodes
  an MP4's specific codec depends on the browser's underlying media
  pipeline, which nothing in Node can construct or fake — that's
  manual-QA territory by necessity, not by choice. The useful test in
  between — "does the intro video's `error` handler correctly skip to
  the menu" — *is* unit/integration-testable, because it only depends on
  a DOM event firing, which Playwright can simulate; that's why it's a
  Playwright script in this project's history rather than either a unit
  test or a manual-QA line item.
- *How regression tests protect a fix*: every defect this project has
  ever found via testing (the Phase 7 `recordGameStarted` never being
  called, Phase 9's intro-video `error` listener able to bypass the
  Start gate, Phase 11's Paper/dark contrast failure) was fixed
  alongside a test or an assertion that would fail again if the same
  bug were reintroduced — not just a one-time manual confirmation that
  it currently works. That's the actual value of the 181-test suite:
  it's not there to prove the code is correct today (a human already
  just watched it work), it's there so that six phases from now, an
  unrelated change to `game-state.js` that accidentally breaks undo
  history gets caught by `npm test` in 5 seconds, instead of silently
  shipping and being discovered by a player instead.
- *How to read a Node test failure*: `node --test` output nests by
  `describe` block; a failing test prints `not ok N - <test name>`
  (versus `ok N - ...` for a pass) with a `---` YAML block underneath
  giving the failure location and, for `assert.equal`/`assert.deepEqual`
  failures, the actual vs. expected values directly (no separate
  diffing tool needed). The summary at the very end
  (`# tests`/`# pass`/`# fail`) is the fastest way to confirm "did
  anything break" without reading the full scrollback — `# fail 0` is
  the bar this project holds itself to before calling any phase done,
  and every `DEVELOPMENT_LOG.md` entry from Phase 3 onward records that
  exact line.

**Remaining limitations:**

- No browser-test framework (Playwright-as-a-committed-dependency,
  Cypress, etc.) was added, per this phase's own explicit instruction —
  every Playwright script written across Phases 7-12 lives in the
  session's scratch directory, not the repo, and would need to be
  rewritten if a future phase wants to re-run the same browser-level
  checks. `MANUAL_QA.md` is the durable, repo-committed record of what
  those checks were, in a form a human can re-run without any tooling
  at all.
- Real screen-reader software and a real (non-codec-limited) browser's
  intro-video playback remain genuinely unverified by anything in this
  repo or this session — both are called out explicitly in
  `MANUAL_QA.md`'s "known environment limitations" section rather than
  silently assumed fine.
- `README.md` is still the placeholder "planning complete, application
  code not yet started" version from Phase 0 — out of scope for this
  phase (that's explicitly Phase 14's job per `TASKS.md`), but worth
  flagging here so it isn't mistaken for an oversight.

---

## 2026-07-28 — Phase 11: Accessibility, Mobile Polish, and Desktop Mode

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 10" (accessibility/UX pass) is `TASKS.md`'s
Phase 11 (Accessibility Polish) — matches it directly, no renumbering
needed.

**What was built:**

- **`js/ui/cell-aria.js`** — `getCellAriaLabel(index, state)`, a pure,
  fully-tested function (14 tests) that is now the single source of
  truth for a board cell's accessible name: row/column, `clue` vs
  `editable`, its value (`given`/`entered`) or `empty` plus any notes,
  `conflicts with another cell` when either a peer clash or (with
  immediate error checking on) a wrong entry applies, `selected`, and —
  only on the selected, editable cell, where it's actually relevant — a
  concise `press 1 through 9 to enter a value`/`...to toggle a note`
  instruction. `js/ui/board-view.js`'s old private `describeCell` helper
  is gone; it now calls this directly on every render.
- **`js/ui/difficulty-filter.js`** rewritten onto the real WAI-ARIA tabs
  pattern: each button gets `role="tab"` + `aria-controls` pointing at a
  new `role="tabpanel"` results container, only the selected tab has
  `tabindex="0"` (roving tabindex — the other three are skipped when
  Tabbing through the page, exactly like a native tab widget), and
  Left/Right/Home/End move both focus and selection between tabs.
- **Responsive layout**: audited 320px portrait, phone landscape, tablet
  portrait/landscape, desktop, and ultrawide via Playwright screenshots
  at each size — no horizontal overflow anywhere already. Added two new
  breakpoints, both scoped to `#screen-game` specifically (not the
  shared `.screen-game` class, which Statistics/High Scores also use for
  an unrelated base layout, and would have broken under these grids):
  - `@media (min-width: 1024px)`: board and the toolbar/number-pad
    controls side by side as a genuine desktop "side panel," using CSS
    Grid named areas — no HTML restructuring needed, since Grid can
    place existing sibling elements into named areas directly.
  - `@media (orientation: landscape) and (max-height: 500px)`: the same
    two-column idea, sized down, specifically for short landscape
    phones — before this, reaching the number pad in landscape required
    scrolling past ~870px of stacked content; measured and confirmed the
    new layout fits entirely within a 375px-tall viewport with zero
    scroll (a first version still needed ~421px until the toolbar was
    left as a row instead of a stacked column — vertical space is the
    scarce resource at this breakpoint, so three stacked buttons costing
    3x one row's height was the actual problem, not the board).
- **Safe-area insets**: `.pause-overlay` (a fixed full-screen element)
  was missing them entirely — added, matching the pattern already used
  by `.screen`/`.skip-btn`/`.connection-status`/`.update-banner`.
- **Hover/active/focus-visible states**: added explicit `:hover` (gated
  behind `@media (hover: hover) and (pointer: fine)` — without that,
  touch browsers apply `:hover` on tap and it can stay visually "stuck"
  until an unrelated tap elsewhere) and `:active` press-down feedback
  (brightness dim, plus a small scale-down for standalone buttons —
  board cells get brightness only, since scaling one down in a
  seamless edge-to-edge grid would open a visible gap against its
  neighbors) across every button-like control.
- **Text-selection prevention**: `button { user-select: none; }` — one
  blanket rule, since every button in this app is a control, never
  readable prose to select/copy. Leaves paragraphs, stat values, and the
  completion dialog's share textarea normally selectable.
- **Intro Skip button**: switched from theme tokens to a fixed dark
  scrim + white text, independent of the active theme — it sits on top
  of arbitrary video frames, not this app's own themed background, so it
  needs guaranteed contrast against whatever's playing underneath it
  rather than whatever a theme pack's surface/text/border tokens happen
  to resolve to.
- **Non-color conflict/error cue**: `.cell-value.is-error` now gets a
  wavy underline (the familiar "spell-check" convention) alongside its
  color change, on top of the conflict ring's already-structural
  (color-independent) presence/absence cue.
- **Contrast re-check**: scripted a WCAG AA contrast audit across all 8
  theme/mode combinations for every significant text/background pairing
  in the app (body text, secondary text, button text, given/player
  digits, error/success/warning text, note digits). Found one genuine
  failure — Paper/dark's `--color-error` (`#e2695a`) against its panel
  background at 3.91:1, below the 4.5:1 AA threshold for normal text —
  and fixed it by lightening to `#ec8878` (5.10:1), staying in the same
  warm coral hue family as that theme's existing accent/entry-player
  tokens rather than introducing an unrelated color.
- **Completion celebration**: the completion dialog's "Puzzle Solved!"
  heading gets a one-shot scale+fade-in (`.celebrate` class, toggled
  off/reflowed/back-on so it re-triggers on back-to-back completions) —
  no confetti particles or new DOM, just a brief cue on text that was
  already there.
- **Cyber background animation**: two soft radial-gradient glows slowly
  drifting between opposite corners of the viewport, in both Cyber
  light and dark modes, declared *only* inside
  `@media (prefers-reduced-motion: no-preference)` — not just relying on
  the existing blanket `prefers-reduced-motion: reduce` override further
  up the file, which would still compute and then freeze the animation
  rather than never declaring it at all.

**Explanation (accessible names, focus vs. selection, native semantics,
`aria-live`, dialog focus restoration, reduced-motion media queries,
responsive layout decisions):**

- *Accessible names*: the "accessible name" is the string a screen
  reader actually announces for an element — computed from, in priority
  order, `aria-label`/`aria-labelledby`, then native semantics (a
  `<label>` for a form control, visible button text), then other
  fallbacks. Board cells have no useful visible text of their own to
  fall back to (a bare digit doesn't say "row 3 column 5"), which is
  exactly why `getCellAriaLabel` exists — it's the entire accessible
  name for each of the 81 `role="gridcell"` buttons, recomputed fresh
  every render so it can never drift from what's visually shown.
- *Focus vs. selection*: these are two different concepts that happen to
  usually move together in this app. "Selection" is `game-state.js`'s
  `selectedIndex` — pure application state, no DOM involved. "Focus" is
  the browser's own concept of which element receives keyboard input
  next. `js/ui/board-view.js` explicitly moves DOM focus to match
  `selectedIndex` on every render (`selectedEl.focus()`) so a sighted
  keyboard user's focus ring and a screen reader's announced position
  both track the same cell the game logic considers selected — but nothing
  requires this; a future feature could select a cell programmatically
  without touching focus at all, precisely because the two are kept
  separate rather than conflated into one concept.
- *Native semantics*: every interactive element in this app is a real
  `<button>`, `<input type="radio/checkbox/range">`, or `<dialog>` —
  ARIA is added on top to supplement what these already give for free
  (keyboard operability, correct default role, built-in focus handling),
  never to replace it with a `<div role="button">` reimplementation. The
  one deliberately-not-fully-native piece is the board itself
  (`role="grid"`/`role="gridcell"` on flat sibling buttons rather than a
  full `grid`>`row`>`gridcell` hierarchy) — building genuine `row`
  elements would need either restructuring the DOM away from a clean
  9x9 CSS Grid or duplicating row/column bookkeeping the CSS Grid
  already handles implicitly; the explicit row/column text in every
  cell's accessible name is the deliberate compensating choice for that
  gap, documented here rather than silently accepted.
- *`aria-live`*: an aria-live region (`#game-status`, `#connection-status`,
  `#copy-confirmation`, `#mode-current-hint`, `#vibration-support-hint`)
  is how a screen reader finds out about a text change that didn't come
  from the user's own focus moving — e.g. `#game-status`'s "Ready — Easy
  puzzle, 43 clues" appears after puzzle generation finishes, which
  isn't triggered by any element gaining focus, so without `aria-live`
  a screen-reader user would never hear it at all. `polite` (used
  everywhere here) waits for a natural pause rather than interrupting
  whatever's currently being read, appropriate for status updates that
  are useful but never urgent enough to justify cutting someone off.
- *Dialog focus restoration*: every dialog in this app uses the native
  `<dialog>` element's `showModal()`/`close()`, which — in every
  evergreen browser this app targets — automatically remembers and
  restores focus to whatever had it before `showModal()` was called, no
  extra code required. Verified this directly rather than assuming it:
  opened and closed all four buttons-that-open-a-dialog paths (Settings,
  New Game's difficulty picker, Hint, Settings-from-the-game-screen) via
  Playwright and confirmed `document.activeElement` was back on the
  triggering button every time.
- *Reduced-motion media queries*: `@media (prefers-reduced-motion:
  reduce)` reflects an OS-level accessibility setting for users who get
  disoriented, nauseated, or simply distracted by motion — this app
  already had a blanket override (near-zero animation/transition
  duration on everything) from Phase 2, which is a good safety net but
  only *freezes* an animation that still gets declared and computed.
  Both new animations added this phase (the Cyber background drift, the
  completion celebration) are additionally declared inside the *inverse*
  query, `@media (prefers-reduced-motion: no-preference)` — for a
  reduced-motion visitor, the animation rule doesn't exist in the
  cascade at all, not just get neutralized after the fact. Verified with
  Playwright's `reducedMotion: 'reduce'` context option, confirming
  `getComputedStyle(document.body).animationName` resolves to `'none'`.
- *Responsive layout decisions*: the two new breakpoints
  (`min-width: 1024px` and `orientation: landscape` + `max-height: 500px`)
  are both about the same underlying idea — reflow the board and its
  controls from a single stacked column into two side-by-side columns
  once there's enough width relative to height to make that worthwhile —
  applied at two different physical situations (a genuinely wide desktop
  window vs. a short landscape phone) with different sizing math for
  each, since a landscape phone's *height* is the scarce resource while
  a desktop window's *width* is the abundant one. Scoping both to
  `#screen-game` by id (not the `.screen-game` class shared with
  Statistics/High Scores) was a deliberate, necessary choice — those
  other two screens have a completely different set of child elements,
  and CSS Grid's named `grid-template-areas` only place children that
  have a matching `grid-area` assigned; anything else falls back to
  implicit auto-placement, which would have visually scrambled those
  screens had the rule been scoped to the shared class instead.

**Checks run:**

- `node --check` on every new/modified JS file — all clean; `styles.css`
  brace-balance check.
- `npm test`: **177/177 passing** (163 carried over + 14 new
  `cell-aria.test.js` tests), across 57 suites.
- Scripted WCAG AA contrast audit across all 8 theme/mode combinations
  for 11 text/background pairings each (88 checks) — 1 failure found and
  fixed (Paper/dark `--color-error`), all 88 pass after the fix.
- Playwright verification, organized as a keyboard-and-screen-reader-
  oriented inspection per the prompt's own instruction:
  - Focus restoration confirmed after closing all four
    button-triggered dialogs.
  - A fully keyboard-only playthrough: Tab to New Game, Enter to open
    the difficulty dialog, Escape to cancel it (native `<dialog>`
    behavior), reopen and start a game, arrow keys to move board
    selection, a digit keypress to enter a value, Escape to pause,
    Enter on the focused Resume button to resume — no mouse events used
    anywhere in this pass.
  - Difficulty filter: confirmed `role="tab"` on every button, roving
    tabindex (`[0, -1, -1, -1]` before any interaction), and that
    ArrowRight moves both `aria-selected` and the visible panel content
    to the next tab.
  - `getCellAriaLabel` spot-checked directly in the live DOM (not just
    unit tests): a fixed clue's `aria-label` includes "clue" and
    "given"; a selected empty editable cell's includes "editable",
    "selected", and the entry instruction.
  - No horizontal overflow re-confirmed at 320px and 1920px on the game
    screen specifically (the most layout-dense screen) after all this
    phase's CSS changes.
  - Full 4-theme x 2-mode visual sweep of the game screen — no console/
    page errors in any of the 8 combinations, spot-checked several
    screenshots for visual correctness.

**Remaining limitations:**

- The board's ARIA structure is `role="grid"`/`role="gridcell"` on flat
  sibling buttons rather than a complete `grid`>`row`>`gridcell`
  hierarchy (see the native-semantics explanation above) — a deliberate,
  documented tradeoff, not an oversight, but a stricter ARIA audit tool
  would still flag the missing `row` level.
- No automated screen-reader-software testing (VoiceOver/NVDA/JAWS)
  was performed — verification here is DOM/ARIA-attribute-level
  (confirming the right roles, states, and accessible-name strings exist
  and update correctly) via Playwright, not an actual assistive
  technology's rendering of them. A real screen-reader pass by the user
  is still worth doing before calling this fully done.
- The >=1024px and short-landscape-phone grid layouts are new and only
  tested at a handful of specific viewport sizes; an unusual in-between
  size could theoretically reveal a gap this pass didn't sample.

---

## 2026-07-28 — Phase 10: Offline-First PWA Behavior

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 9" (offline PWA) is `TASKS.md`'s Phase 10
(Offline / PWA) — matches it directly, no renumbering needed.

**What was built:**

- **`manifest.webmanifest`** — `name`, `short_name`, `description`,
  `start_url`/`scope` both relative (`"./index.html"` / `"./"`, resolved
  against the manifest's own URL, so it stays correct at a GitHub Pages
  repository subpath the same way every other path in this repo already
  is), `display: "standalone"`, `theme_color`/`background_color` matched
  to the Light theme pack's `--color-accent`/`--color-bg` (the default
  pack on first load), and `"icons": []` — deliberately empty, since no
  icon files exist yet (see below), rather than pointing at files that
  would 404.
- **`icons/README.md`** — documents the three PNGs a real install needs
  (192×192, 512×512, and a *separate* 512×512 maskable icon — reusing an
  edge-to-edge icon as "maskable" gets its content clipped by the
  platform's mask, which is why it has to be its own file with padding),
  and the exact steps to wire them into `manifest.webmanifest` and
  `sw.js` once supplied.
- **`sw.js`** — a versioned cache (`inspire-sudoku-shell-v1`) with:
  - `install`: precaches a small, explicit **mandatory** app-shell list
    (`./`, `./index.html`, `./index.js`, `./styles.css`,
    `./manifest.webmanifest`) via `cache.addAll()` — deliberately *not*
    every `js/**.js` module by hand, since that list would silently drift
    out of date as future phases add files; then, separately, attempts
    each **optional** root asset (`inspiresoftwareintro.mp4`, `logo.png`,
    `background-music.mp3`) individually with its own try/catch, so one
    404 (currently `background-music.mp3` — it doesn't exist, same as
    Phase 9) can't take the others down or fail the whole installation
    the way a single `cache.addAll()` covering all of them would.
  - `activate`: deletes every cache whose name isn't the current
    `CACHE_NAME`, then `clients.claim()`.
  - `fetch`: ignores non-GET and cross-origin requests entirely (never
    calls `respondWith()` for them, leaving the browser's normal handling
    untouched); navigations go network-first with a cached-`index.html`
    fallback (so an online visitor always gets current HTML, offline
    still boots); every other same-origin GET goes cache-first, filling
    the cache from the network on a miss — this is what makes the full
    `js/**` module graph end up cached after one real visit, without
    hand-listing it.
  - Cache-version bumps are entirely manual (edit the `CACHE_NAME`
    suffix) — documented at the top of the file, along with the
    devtools-based hard-reset path (Application → Service Workers →
    Unregister / Clear site data) for local development.
- **`js/sw-register.js`** — feature-detected (`'serviceWorker' in
  navigator`), registers after the `load` event with `{ scope: './' }`,
  and a `.catch()` that treats registration failure as "no offline
  caching this session," never a broken app. Also wires a small
  "Update available" banner: when `updatefound` fires and the *new*
  worker reaches `'installed'` while `navigator.serviceWorker.controller`
  is already set (i.e. this is a genuine update, not the very first
  install), the banner appears with a Refresh button that just calls
  `location.reload()`.
- **`js/ui/connection-status.js`** — a small `aria-live="polite"` status
  line, hidden by default, that only appears when `!navigator.onLine`
  (via the `online`/`offline` window events) — quiet when everything's
  normal, visible only when it's actually useful to know.
- **Settings dialog**: a new "Your data" section explaining, in plain
  language, that everything stays local (no account, no server) and
  pointing at Clear Data for a controlled reset versus clearing browser
  site data entirely.
- New CSS: `.connection-status` and `.update-banner`, both small fixed-
  position pills. `.connection-status` deliberately reuses the same
  "colored text + colored border on a neutral panel background" pattern
  already established by `.status-chip--warning`, rather than a solid
  `--color-warning` fill with white text — checked the contrast math for
  `--color-warning`-on-`--color-panel` across all 4 theme packs × their
  light/dark variants (8 combinations) and every one landed between 5.19
  and 10.49:1, comfortably above WCAG AA's 4.5:1 for normal text; a
  couple of the theme packs' `--color-warning` values are light amber
  tones meant to be read as foreground text, and would have failed
  contrast badly as a background fill under white text.

**Explanation (manifest vs. service worker, install/activate/fetch
lifecycle, cache versioning, precache failure behavior, navigation
fallback, relative paths):**

- *Manifest vs. service worker*: the web manifest is a static, declarative
  JSON file — the browser reads it to decide things like the app's name,
  icon, and start URL *if* the user installs it to their home screen/app
  list. It does nothing for offline behavior by itself. The service
  worker is the opposite: an actual background script the browser runs
  independently of any open tab, and it's the only piece that can
  intercept network requests and decide to serve a cached response
  instead — offline support is 100% the service worker's job, not the
  manifest's.
- *Install/activate/fetch lifecycle*: `install` fires once, the moment
  the browser sees a new-or-changed `sw.js`; this is where the mandatory
  and optional precaching above happens. `activate` fires once the new
  worker is about to start controlling pages; this is the correct (and
  really only sanctioned) place to clean up old caches, since at that
  point nothing is still relying on them. `fetch` fires on every network
  request the page makes for as long as the worker is active/controlling
  it, and is the only handler that can actually change what a request
  returns (via `event.respondWith()`).
- *Cache versioning*: `CACHE_NAME` is a plain string constant with a
  version suffix — nothing hashes file contents or bumps it
  automatically. That's a deliberate, simple, always-correct-by-
  construction choice for a project with no build step: the developer
  who changes a core file is the one person who reliably knows a bump is
  needed, and the `activate` handler's "delete anything that isn't the
  current name" logic means bumping is the *entire* update mechanism —
  no separate cleanup step to remember.
- *Precache failure behavior*: `cache.addAll()` is atomic — if any single
  URL in the list 404s or errors, the *whole* call rejects and `install`
  fails, meaning this service worker never activates at all (the browser
  falls back to whatever was controlling the page before, or none). That
  behavior is exactly right for the mandatory app-shell list (a missing
  core file means something is genuinely broken), but exactly wrong for
  optional assets — which is why they're precached in a separate loop
  with per-file `try`/`catch`, so `background-music.mp3` being absent
  can't drag `inspiresoftwareintro.mp4` and `logo.png` down with it, and
  can't fail installation at all.
- *Navigation fallback*: a "navigation" is specifically a request for a
  new document (typing the URL, hitting reload, following a link) as
  opposed to a request for a script/stylesheet/image a page already
  makes on its own. This app has exactly one real page (`index.html`) —
  every screen is a client-side show/hide, not a real navigation — so
  "app-shell fallback" here just means: if a navigation request fails
  (offline), serve the cached `index.html` instead of a browser error
  page, and everything downstream (its `<script type="module">` import,
  which pulls in the already-cached `js/**` graph) continues to work from
  there.
- *Why relative paths matter*: `start_url`/`scope` in the manifest and
  every `fetch`/`cache.addAll()` path in `sw.js` are written as `./...`,
  resolved against the file's own location rather than the site's domain
  root. Hard-coding `/index.html` would work fine at
  `https://user.github.io/` but break at
  `https://user.github.io/sudoku-by-inspire-v1/` (GitHub Pages' normal
  project-site URL shape) — the browser would look for
  `/index.html` at the domain root, not inside the repo's subpath. This
  is the exact same constraint CLAUDE.md already states for every other
  asset reference in the app; `sw.js` and the manifest just extend it to
  service-worker/PWA-specific paths too.

**Checks run:**

- `node --check` on every new/modified JS file — all clean; `styles.css`
  brace-balance check; `manifest.webmanifest` parsed as valid JSON.
- `npm test`: 163/163 passing, unchanged (this phase's code is
  browser/service-worker-runtime behavior with no pure logic to unit-test
  in Node — verified via Playwright instead, per the prompt's own test
  list).
- Playwright verification, covering every scenario the prompt named:
  - **First online visit**: manifest linked with a relative href, service
    worker reaches `'activated'`, exactly one clearly-named cache exists,
    all four mandatory app-shell files are in it, both existing optional
    root assets (`logo.png`, the intro video) are in it, the missing
    optional `background-music.mp3` correctly is *not*, no console/page
    errors.
  - **Reload**: online reload lands cleanly back on the Start screen, no
    errors.
  - **Offline reload**: after one online visit + a bit of navigation (to
    let the fetch handler runtime-cache the JS module graph),
    `context.setOffline(true)` + reload still renders the Start screen
    and can still dynamically `import()` an already-visited module —
    no errors.
  - **Service-worker update after cache-version change**: bumped
    `CACHE_NAME` in a scratch copy of `sw.js` (exactly the developer
    workflow documented at the top of the real file), triggered
    `registration.update()`, confirmed the "Update available" banner
    appeared, clicked Refresh, reloaded, and confirmed exactly one
    cache remained afterward and it was the *new* version — the old one
    was cleaned up automatically.
  - **Missing optional asset**: covered by the first-visit check above
    (`background-music.mp3` absent, install still succeeds, no errors).
  - **GitHub Pages-style subpath**: every one of the above tests ran
    against a local static server mounting the app under a
    `/sudoku-by-inspire-v1/` prefix (mimicking a GitHub Pages project
    site), not the domain root — manifest, service worker registration,
    and every cached path all resolved correctly.
  - Note: real browser devtools "Network: Offline" throttling wasn't
    available to drive from this sandboxed environment; `context.
    setOffline(true)` via Playwright (which actually blocks the
    network layer, not just simulates it) is the practical equivalent
    used instead, and exercises the same service-worker fetch-
    interception code path devtools throttling would.

**Remaining limitations:**

- No icon files exist yet (`icons/README.md` documents exactly what's
  needed); until they're supplied, the manifest's `"icons": []` means the
  app is installable but without a custom icon — some platforms may
  decline to show an install prompt at all without one.
- Background music still isn't a real file in this repo (correctly, per
  CLAUDE.md); the precache/offline behavior around its absence is
  verified, but there's nothing to actually hear yet.
- The update banner's Refresh button reloads the *current* tab; other
  open tabs on an old version won't be prompted until they're
  interacted with or reloaded themselves — acceptable for a small,
  single-tab-typical app, but worth knowing if that assumption ever
  stops holding.

---

## 2026-07-28 — Phase 9: Audio, Haptics, and User-Gesture Initialization

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 8" (audio/haptics) is `TASKS.md`'s Phase 9 (Audio)
— matches it directly, no renumbering needed this time.

**What was built:**

- **`js/audio-settings.js`** — persisted audio/haptics preferences
  (`musicEnabled`, `sfxEnabled`, `vibrationEnabled`, `musicVolume`,
  `sfxVolume`) under `inspireSudoku:v1:audioSettings`, on the same
  versioned-storage-with-safe-fallback pattern as `theme.js` and
  `game-settings.js`. Deliberately knows nothing about `AudioContext` —
  that split lets the Settings dialog show/persist volume and mute state
  even before the audio engine itself has ever been initialized.
  Following the existing precedent set by `theme.js` and
  `game-settings.js` (both thin settings wrappers with no dedicated test
  file of their own, since their real logic lives in — and is tested by —
  `storage.js`), this module has no dedicated test file either; this
  phase's own verification is manual/browser-driven per the prompt.
- **`js/audio.js`** — the AudioManager engine: one lazily-created, reused
  `AudioContext`; `playClick()`, `playSelect()`, `playError()`,
  `playCompletion()` — each a short synthesized oscillator+gain-envelope
  tone (see below); `vibrate(pattern)`; optional looping background
  music loaded from `./background-music.mp3` (absent in this repo — its
  `error` listener marks it unavailable and the app carries on silently,
  the same pattern already used for the intro video's missing-file
  handling); pauses music on `document.visibilitychange` to hidden,
  resumes only if the music toggle is still on and the file did load;
  reacts to `js/game-state.js`'s `onStateChange` by diffing the previous
  vs. current snapshot to decide when to play `select` (a real, in-play
  selection change), `error` (mistakes count went up), or `completion`
  (status just became `'complete'`) — game-state.js itself stays fully
  audio-agnostic, exactly as its own header comment already promises for
  DOM.
- **`js/ui/audio-bindings.js`** — one delegated `document`-level click
  listener plays the generic `click` tone for any `<button>` press,
  excluding `.cell` board buttons (which already get their own `select`
  tone from the state-diffing above — both firing on the same tap would
  just double up). This covers every button in the app — number pad,
  toolbar, dialogs, menu nav — without editing any of those individual
  UI modules.
- **`initAudioEngine()` wired to the Start screen's gesture handler**
  (`index.js`), called synchronously alongside `playIntro()`, not
  "sometime after" it — browsers only treat an `AudioContext` as
  user-unlocked if it's created/resumed from directly inside the actual
  call stack of a real click/keydown event; an `await` or a `.then()`
  later loses that unlocked status in some browsers (notably Safari).
  `initAudioEngine()` is idempotent (a no-op after the first call), so
  nothing needs to track "did this already run" itself.
- **Settings dialog**: new "Audio & Haptics" fieldset — Background music
  toggle + volume slider, Sound effects toggle + volume slider, Vibration
  toggle. The vibration checkbox is disabled (with an explanatory hint)
  when `navigator.vibrate` doesn't exist, rather than letting the player
  turn on a setting that can never do anything on their device/browser.
- New CSS: `.settings-slider` for the two volume rows — reuses the
  existing `--color-accent` via the `accent-color` property (same
  mechanism the checkbox/radio `.option-tile`s already lean on) so native
  range-input styling matches the rest of the theme automatically.

**Bug found and fixed during this phase's verification (unrelated to
audio, but directly blocking it):** `js/ui/intro-video.js`'s `error`
listener on the intro `<video>` called `finishIntro()` (→
`showScreen('menu')`) unconditionally. Browsers can start probing a
`<video>`'s `src` for metadata the instant the page loads, independent of
any user gesture — confirmed here, where this sandbox's headless
Chromium can't decode the video's codec and fires that `error` event
within tens of milliseconds of page load. That meant the app could skip
straight from the Start screen to the main menu before the player ever
clicked anything, silently bypassing the Start gate — and with it,
`initAudioEngine()`, since that only runs from inside the Start screen's
click handler. Caught by a Playwright test that reloaded the page twice
in the same browser process (the second load's codec probe resolved fast
enough to consistently lose the race; the first load's didn't, which is
why this had gone unnoticed in every previous phase's verification).
Fixed by only treating the video's `error` event as "the intro failed,
skip to menu" while the intro screen is actually the active one
(`getCurrentScreen() === 'intro'`) — an early probe failure that happens
before `playIntro()` was ever called is now just ignored, and the Start
gate can no longer be silently bypassed.

**Explanation (browser autoplay restrictions, AudioContext lifecycle,
oscillator frequency, gain envelopes, clipping prevention, feature
detection):**

- *Autoplay restrictions*: browsers block audio (and often video) from
  playing until a real user gesture — a click or keydown, not a
  programmatic event — has occurred on the page, specifically to stop
  sites from ambushing visitors with sound. Critically, the unlock only
  "counts" if the audio API call happens synchronously inside that
  gesture's own event handler; code that runs later (even a `.then()`
  chained off a promise started inside the handler) can lose that
  privilege in stricter browsers. That's why `initAudioEngine()` is
  called directly, synchronously, from the Start screen's click/keydown
  callback in `index.js`, not queued or deferred.
- *AudioContext lifecycle*: a fresh `AudioContext` starts in a
  `'suspended'` state until a user gesture resumes it (some browsers
  create it already-running post-gesture; others still require an
  explicit `.resume()` call). It can also be auto-suspended later by the
  browser during extended inactivity. `ensureContextRunning()` calls
  `.resume()` (fire-and-forget — its promise settling asynchronously is
  fine, since scheduling sounds against `audioContext.currentTime` is
  valid either way) before every sound is scheduled, so a sound
  attempted while suspended doesn't just silently vanish forever.
- *Oscillator frequency*: each SFX is one (or a few, for completion) sine
  or square wave at a chosen pitch — `click` at 620Hz (a short, neutral
  tick), `select` sweeping 720→900Hz (a small upward "chosen" cue),
  `error` sweeping 260→140Hz on a buzzier square wave (a downward "wrong"
  cue), `completion` as a four-note ascending arpeggio (C5, E5, G5, C6).
  Frequency sweeps are done with `exponentialRampToValueAtTime`, which
  the ear perceives as a smoother pitch glide than a linear ramp.
- *Gain envelopes*: every tone ramps its gain node from 0 up to a low
  peak (attack) and back down to ~0 (release) rather than jumping
  straight to full volume and back — a sound that starts or stops
  instantly at nonzero amplitude produces an audible "click" from that
  sudden discontinuity in the waveform, which is exactly the kind of
  artifact a short UI blip is most likely to expose.
- *Clipping prevention*: two layers. First, every tone's peak gain is
  kept deliberately low (0.12–0.16) so that even several sounds
  overlapping (e.g., a wrong digit fires `click` and `error` in the same
  instant) sums to well under full scale. Second, both the SFX and music
  gain chains funnel through one shared `DynamicsCompressorNode` before
  reaching the destination — a cheap safety margin against that sum ever
  clipping, not something load-bearing given the first layer already
  keeps levels conservative.
- *Feature detection*: `window.AudioContext || window.webkitAudioContext`
  is checked once; if neither exists, the engine never creates a context
  and every `playX()`/`vibrate()` call already checks for a live context
  or a real `navigator.vibrate` function before doing anything — so an
  unsupported browser gets a fully silent, error-free app rather than a
  thrown exception. The Settings dialog does the same check for
  vibration specifically, disabling that one toggle (with an explanatory
  hint) rather than leaving it live with no effect.

**Checks run:**

- `node --check` on every new/modified JS file — all clean.
- `npm test`: 163/163 passing, unchanged from Phase 7 (no automated
  tests added this phase — see the audio-settings.js note above; the
  prompt itself asked for manual/browser verification instead).
- Browser verification (headless Chromium via Playwright) covering every
  scenario the prompt named:
  - **First interaction**: `initAudioEngine()` reachable and
    `playClick()` callable with no throw immediately after the Start
    click.
  - **Mute/unmute**: toggling music/SFX off is reflected in
    `getAudioSettings()` immediately.
  - **Volume changes**: dragging both sliders persists the exact value
    and survives a full page reload.
  - **Hidden-tab behavior**: dispatching `visibilitychange` to hidden and
    back to visible runs the pause/resume-check logic with no throw.
  - **Missing music**: confirmed `./background-music.mp3` genuinely 404s
    in this repo, and no page error results from that.
  - **Repeated button presses**: 10 rapid Settings-dialog open/close
    cycles produced no console or page errors.
  - **Unsupported AudioContext**: deleted `window.AudioContext`/
    `webkitAudioContext` before load, then clicked through Start → menu →
    Statistics → New Game → Cancel with no errors.
  - **Unsupported vibration**: stubbed `navigator.vibrate` to `undefined`
    before load; confirmed the Settings checkbox is disabled with the
    "Not supported" hint, and that triggering a real mistake (which
    calls `vibrate()` internally via `playError()`) still doesn't throw.
  - A full gameplay pass (select a cell, move selection, make a mistake,
    solve the rest of the puzzle to completion) exercised the `select`/
    `error`/`completion` state-diff paths end-to-end with no errors.

**Remaining limitations:**

- No actual `background-music.mp3` ships with this repo (correctly, per
  CLAUDE.md's binary-asset policy — it's optional and not one of the two
  protected assets); background music itself hasn't been *heard* in this
  environment, only verified to fail absence-detection correctly. If the
  user supplies the file later, it should Just Work via the existing
  loader, but that's worth a quick real-browser spot-check when it lands.
- Sound quality (the specific oscillator waveforms/frequencies chosen)
  is a first pass, not something that can be meaningfully judged from
  automated verification — worth a real-ears listen and adjustment pass
  from the user when convenient.
- No visual "now playing"/mute-state indicator outside the Settings
  dialog (e.g. no persistent mute icon on the game screen) — not
  requested by this phase, but worth deciding on later if it turns out
  to matter in practice.

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
