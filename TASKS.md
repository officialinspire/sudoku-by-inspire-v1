# TASKS.md — Phased Build Checklist

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

This checklist is the source of truth for progress. Update it at the end of
every completed phase (see `CLAUDE.md`). Each phase will include one
`TODO(USER)` checkpoint assigned during that phase's implementation — this
file tracks phase-level deliverables, not the checkpoint mechanics
themselves (those are called out live in-phase).

## Phase 0 — Environment & Planning (this phase)

- [x] Confirm working directory is a git repo.
- [x] Confirm/configure `origin` remote as `officialinspire/sudoku-by-inspire-v1`.
- [x] Confirm remote repository exists on GitHub.
- [x] Create planning docs: `CLAUDE.md`, `PROJECT_BRIEF.md`, `TASKS.md`,
      `DEVELOPMENT_LOG.md`, `README.md`.
- [ ] Commit and push planning docs to `claude/sudoku-inspire-setup-2jpef2`.

## Phase 1 — App Shell & Screen Flow

- [ ] `index.html` skeleton with the four screen containers: Start,
      Intro Video, Main Menu, Game (empty placeholder).
- [ ] `js/screens.js` — simple state machine to show/hide screens.
- [ ] Start screen responds to tap/click/keypress.
- [ ] Intro video screen plays `./inspiresoftwareintro.mp4` with a visible
      Skip button; gracefully skips itself if the video file is missing/
      fails to load.
- [ ] Main menu renders nav buttons (New Game, Continue [disabled until a
      save exists], Statistics, Settings) and a footer `<img>` for
      `./logo.png` (hidden gracefully if missing).
- [ ] Base `styles.css` mobile-first layout + CSS custom-property scaffold
      for theme packs/color modes (empty palettes, wired but not themed yet).
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 2 — Sudoku Engine (Generator + Solver)

- [ ] `js/sudoku/board-model.js` — grid state representation, givens vs.
      user entries, notes storage.
- [ ] `js/sudoku/solver.js` — validity checker + solve/uniqueness check.
- [ ] `js/sudoku/generator.js` — puzzle generation per difficulty
      (Easy/Intermediate/Advanced/Insane), guaranteeing a unique solution.
- [ ] Unit-style manual test harness (console-driven or simple assertions)
      confirming generated puzzles solve uniquely at each difficulty.
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 3 — Board Rendering (DOM + CSS Grid)

- [ ] `js/ui/board-view.js` — renders the 9x9 grid via DOM/CSS Grid, 3x3
      box borders, given vs. editable cell styling, selected/peer/error
      highlighting.
- [ ] Number pad UI + notes-mode toggle UI.
- [ ] Wire board-view to board-model (render reflects model state, no
      duplicated state).
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 4 — Input Controls (Keyboard, Mouse, Touch)

- [ ] `js/ui/controls.js` — pointer (mouse/touch) selection + digit entry
      via number pad.
- [ ] Keyboard navigation (arrow keys, digit keys, notes toggle key,
      delete/backspace, escape).
- [ ] Touch target sizing/spacing verified on small viewports.
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 5 — Persistence: Autosave, Continue, Settings

- [ ] `js/storage.js` — thin localStorage wrapper (namespaced keys,
      versioned schema for future-proofing).
- [ ] Autosave in-progress game state (debounced).
- [ ] "Continue Game" wiring from main menu.
- [ ] Settings persistence (theme, color mode, audio, input prefs).
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 6 — Statistics, Best Times, High Scores

- [ ] Track games played/won, streaks, per-difficulty best time.
- [ ] Score formula + high-score tracking per difficulty.
- [ ] Statistics screen UI.
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 7 — Themes & Color Modes

- [ ] Implement 4 theme packs (Cyber, Woodgrain, Paper, Light) as CSS
      custom-property sets.
- [ ] Implement 3 color modes (System, Dark, Light) layered independently
      of theme pack.
- [ ] `js/theme.js` — applies + persists theme/mode, respects `prefers-
      color-scheme` for System.
- [ ] Contrast check across all 12 theme×mode combinations.
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 8 — Audio (Music + SFX)

- [ ] `js/audio.js` — music loop playback + SFX playback, independent mute/
      volume controls, respects settings persistence.
- [ ] Lightweight SFX assets sourced/created (small file sizes, offline-
      bundled, no CDN).
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 9 — Offline / PWA

- [ ] `manifest.webmanifest` with relative `start_url`/`scope` (subpath-safe).
- [ ] App icons (sizes per manifest spec).
- [ ] `sw.js` service worker: install/activate/fetch caching strategy for
      all core assets; versioned cache with safe upgrade path.
- [ ] `js/sw-register.js` registration with relative scope.
- [ ] Verified offline load via devtools network throttling to "Offline."
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 10 — Accessibility Polish

- [ ] Full keyboard-only playthrough audit.
- [ ] ARIA labels/roles audit on all interactive controls.
- [ ] Visible focus-state audit across all themes.
- [ ] `prefers-reduced-motion` audit (animations/transitions gated).
- [ ] Contrast re-check post-theme-work.
- [ ] **Checkpoint:** user-implemented piece TBD when this phase starts.

## Phase 11 — GitHub Pages Deployment

- [ ] Verify no absolute-root paths anywhere (grep audit).
- [ ] GitHub Pages workflow or branch config for subpath hosting.
- [ ] Deployed smoke test at the actual Pages subpath URL.

## Phase 12 — Final QA Against Acceptance Criteria

- [ ] Walk every item in `PROJECT_BRIEF.md` → "v1 Acceptance Criteria" and
      check it off with evidence (manual test note in
      `DEVELOPMENT_LOG.md`).
- [ ] Final `README.md` pass (install/run/deploy instructions accurate).

## Outstanding / Blocked

- [ ] Waiting on user-supplied assets: `./inspiresoftwareintro.mp4`,
      `./logo.png`, and app icon source image(s) for the PWA manifest.
