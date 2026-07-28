# TASKS.md — Phased Build Checklist

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

This checklist is the source of truth for progress. Update it at the end of
every completed phase (see `CLAUDE.md`). As of 2026-07-28, phases are
implemented in full by the assistant with thorough explanation as we go
(no more per-phase user checkpoints — see `CLAUDE.md` → Learning Contract
for the amendment).

## Phase 0 — Environment & Planning (this phase)

- [x] Confirm working directory is a git repo.
- [x] Confirm/configure `origin` remote as `officialinspire/sudoku-by-inspire-v1`.
- [x] Confirm remote repository exists on GitHub.
- [x] Create planning docs: `CLAUDE.md`, `PROJECT_BRIEF.md`, `TASKS.md`,
      `DEVELOPMENT_LOG.md`, `README.md`.
- [x] Commit and push planning docs to `claude/sudoku-inspire-setup-2jpef2`.

## Phase 1 — App Shell & Screen Flow ✅ (2026-07-28)

- [x] `index.html` skeleton with the four screen containers: Start,
      Intro Video, Main Menu, Game (empty placeholder).
- [x] `js/screens.js` — simple state machine to show/hide screens.
- [x] Start screen responds to tap/click/keypress.
- [x] Intro video screen plays `./inspiresoftwareintro.mp4` with a visible
      Skip button; gracefully skips itself if the video file is missing/
      fails to load.
- [x] Main menu renders nav buttons (New Game, Continue [disabled until a
      save exists], Statistics, Settings) and a footer `<img>` for
      `./logo.png` (hidden gracefully if missing).
- [x] Base `styles.css` mobile-first layout + CSS custom-property scaffold
      for theme packs/color modes (empty palettes, wired but not themed yet).

## Phase 2 — Theme System & Responsive Design ✅ (2026-07-28)

- [x] Design-token architecture in `styles.css`: every color a component
      needs (background, panel, raised surface, primary/secondary text,
      border, accent, accent contrast, focus, success, warning, error,
      selected/related/matching-value cells, fixed clues, player entries,
      notes, shadow) expressed as a custom property, never hard-coded in
      a component rule.
- [x] 4 theme packs (Cyber, Woodgrain, Paper, Light) × 2 concrete color
      modes (dark/light) = 8 full palettes, applied via `data-theme` and
      `data-mode` on `<html>`. Woodgrain and Paper use CSS gradients only
      (no images). All text/background pairs verified against WCAG AA
      contrast with a scripted check (see Verification below).
- [x] `js/theme.js` — versioned localStorage persistence
      (`sudoku-inspire:appearance`), safe fallback to defaults on
      missing/corrupt/old-schema/invalid data, "System" mode resolved
      live via `matchMedia('(prefers-color-scheme: dark)')` with a
      change listener so the OS can flip the app's mode without a reload.
- [x] Anti-flash inline script in `index.html <head>` applies the saved
      theme/mode before first paint.
- [x] Settings dialog (native `<dialog>`) with theme/mode radio groups
      (live preview — applies immediately on change), a mini swatch
      preview of board-state tokens, a status-chip preview (success/
      warning/error, each paired with an icon + label, never color
      alone), and a Reset Appearance action.
- [x] Responsive app frame: full-bleed on mobile, centered card with
      panel background/shadow on desktop (≥768px); safe-area insets on
      all screen edges and the intro Skip button.
- [x] Touch targets ≥44px on menu buttons, dialog buttons, and option
      tiles.
- [x] Reduced-motion respected (existing global transition-collapse
      rule extended to the new theme-switch transitions).

## Phase 3 — Sudoku Engine (Pure Rules + Solver) ✅ (2026-07-28)

- [x] `js/sudoku-engine.js` — pure, UI-independent rules engine: 81-cell
      row-major board representation, coordinate conversion
      (`rowColToIndex`/`indexToRowCol`), row/column/box extraction,
      board-shape validation, placement legality, candidate generation,
      a backtracking solver (`solveBoard`), and solution counting with
      early stopping (`countSolutions`) for later uniqueness checks. No
      DOM/localStorage/timers — pure functions, none of which mutate
      their input board.
- [x] `js/sudoku-engine.test.js` — Node's built-in test runner
      (`node --test`), 30 tests across 8 suites covering coordinate
      conversion, board-shape validation, row/column/box extraction,
      legal/illegal placement, a solvable board, an unsolvable
      (conflicting-givens) board, a completed valid board, a completed
      invalid board, early-stopping solution counting, candidate
      calculation, and input immutability. All fixtures are built
      programmatically (a formula-generated valid grid + deterministic
      cell removal) rather than transcribed from a puzzle source, so
      there's no risk of a copied puzzle secretly being wrong.
- [x] `package.json` added (`"type": "module"`, no dependencies) purely
      so Node treats `.js` files as ES modules for the test runner —
      does not affect the shipped static app in any way.

## Phase 4 — Puzzle Generation (Difficulty Tiers) ✅ (2026-07-28)

- [x] `js/sudoku-generator.js` — builds on `js/sudoku-engine.js`:
      randomized-backtracking solved-board generation, clue removal with
      a `countSolutions(puzzle, 2) === 1` uniqueness guarantee, a
      centralized `DIFFICULTIES` config (Easy/Intermediate/Advanced/
      Insane — label, clue range, score multiplier, max attempts, time
      budget, approximate solver-effort range), attempt/time-budget
      guards with periodic event-loop yields (not just between
      attempts — see DEVELOPMENT_LOG.md for why that distinction
      mattered), and a bundled, self-validating fallback puzzle set (2
      per difficulty, all generated and independently re-verified, none
      hand-typed).
- [x] `js/sudoku-generator.test.js` — 15 tests covering generated solved
      boards, unique generated puzzles, clue-range validation,
      difficulty-config validation, seeded-random determinism, and
      fallback validity.
- [x] `js/ui/game-screen.js` (new) + game screen status text
      (`#game-status`, `aria-live="polite"`) — New Game now actually
      triggers generation and shows live progress/result text. Defaults
      to Easy (no difficulty picker yet — that's Phase 5's board/menu
      UI territory).

## Phase 5 — Board Rendering (DOM + CSS Grid)

- [ ] `js/ui/board-view.js` — renders the 9x9 grid via DOM/CSS Grid, 3x3
      box borders, given vs. editable cell styling, selected/peer/error
      highlighting (using the `--color-cell-*`/`--color-clue-fixed`/
      `--color-entry-player`/`--color-notes` tokens from Phase 2 — pair
      each state with a structural cue, not color alone).
- [ ] Number pad UI + notes-mode toggle UI.
- [ ] Wire board-view to board-model (render reflects model state, no
      duplicated state).

## Phase 6 — Input Controls (Keyboard, Mouse, Touch)

- [ ] `js/ui/controls.js` — pointer (mouse/touch) selection + digit entry
      via number pad.
- [ ] Keyboard navigation (arrow keys, digit keys, notes toggle key,
      delete/backspace, escape).
- [ ] Touch target sizing/spacing verified on small viewports.

## Phase 7 — Persistence: Autosave, Continue, Settings

- [ ] `js/storage.js` — thin localStorage wrapper (namespaced keys,
      versioned schema for future-proofing, same safe-fallback pattern
      as `js/theme.js`).
- [ ] Autosave in-progress game state (debounced).
- [ ] "Continue Game" wiring from main menu.
- [ ] Remaining settings persistence (audio, input prefs) alongside the
      appearance settings already persisted in Phase 2.

## Phase 8 — Statistics, Best Times, High Scores

- [ ] Track games played/won, streaks, per-difficulty best time.
- [ ] Score formula + high-score tracking per difficulty.
- [ ] Statistics screen UI.

## Phase 9 — Audio (Music + SFX)

- [ ] `js/audio.js` — music loop playback + SFX playback, independent mute/
      volume controls, respects settings persistence.
- [ ] Lightweight SFX assets sourced/created (small file sizes, offline-
      bundled, no CDN).

## Phase 10 — Offline / PWA

- [ ] `manifest.webmanifest` with relative `start_url`/`scope` (subpath-safe).
- [ ] App icons (sizes per manifest spec).
- [ ] `sw.js` service worker: install/activate/fetch caching strategy for
      all core assets; versioned cache with safe upgrade path.
- [ ] `js/sw-register.js` registration with relative scope.
- [ ] Verified offline load via devtools network throttling to "Offline."

## Phase 11 — Accessibility Polish

- [ ] Full keyboard-only playthrough audit.
- [ ] ARIA labels/roles audit on all interactive controls.
- [ ] Visible focus-state audit across all themes.
- [ ] `prefers-reduced-motion` audit (animations/transitions gated).
- [ ] Contrast re-check post-theme-work.

## Phase 12 — GitHub Pages Deployment

- [ ] Verify no absolute-root paths anywhere (grep audit).
- [ ] GitHub Pages workflow or branch config for subpath hosting.
- [ ] Deployed smoke test at the actual Pages subpath URL.

## Phase 13 — Final QA Against Acceptance Criteria

- [ ] Walk every item in `PROJECT_BRIEF.md` → "v1 Acceptance Criteria" and
      check it off with evidence (manual test note in
      `DEVELOPMENT_LOG.md`).
- [ ] Final `README.md` pass (install/run/deploy instructions accurate).

## Outstanding / Blocked

- [x] `./inspiresoftwareintro.mp4` and `./logo.png` supplied by user
      (2026-07-28) and wired into the Phase 1 intro screen / menu footer.
- [ ] Still waiting on app icon source image(s) for the PWA manifest
      (needed for Phase 10).
