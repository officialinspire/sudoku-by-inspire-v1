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

## Phase 5 — Playable Sudoku Board & Input System ✅ (2026-07-28)

Originally split across two future phases (Board Rendering, then Input
Controls) in earlier planning; delivered as one combined, fully playable
phase instead — rendering and input are tightly coupled enough (a click
selects, a keypress mutates, both re-render from the same state) that
building them separately would have meant wiring the same seams twice.

- [x] `js/game-state.js` (new) — central, UI-independent game state and
      every mutation (`selectCell`, `applyNumberInput`, `eraseSelectedCell`,
      `toggleNotesMode`, `undo`, `moveSelection`, `pauseGame`/`resumeGame`).
      One `notify()` call per mutation is the single render/save path —
      see DEVELOPMENT_LOG.md for why that single-path design matters.
      State: `puzzle`, `solution`, `entries`, `notes` (81-cell bitmasks),
      `selectedIndex`, `difficulty`, `elapsedSeconds`, `mistakes`,
      `hintsUsed`, `history`, `status`, `notesMode`, `generationMeta`.
- [x] `js/game-state.test.js` — 30 tests covering every state transition:
      guards (invalid value/no selection/fixed cell), normal vs. notes
      mode, peer-note cleanup, mistake counting, conflict detection,
      completion detection, undo, selection movement/clamping, pause/
      resume, and that exactly one notify happens per mutation.
- [x] `js/ui/board-view.js` (new) — 9×9 CSS Grid, strong 3×3 boundaries,
      focusable `<button>` cells, fully state-derived rendering (fixed
      clues, player entries, notes mini-grid, selected/related/matching/
      conflict/error, all recomputed from state every render — including
      a bug caught by browser testing where note-digit *text* wasn't
      being cleared on value entry even though the notes container was
      correctly hidden, i.e. state said one thing and the DOM still said
      another underneath it).
- [x] `js/ui/controls.js` (new) — number pad + Erase + Notes toggle (event
      delegation, not 9+ separate listeners), keyboard (1-9, Backspace/
      Delete, arrow-key movement, N for notes, Escape to pause/resume,
      Ctrl/Cmd+Z for undo — see DEVELOPMENT_LOG.md for why undo's binding
      goes beyond the phase's literal control list), all guarded so game
      keys don't fire while a dialog is open or a form field has focus.
- [x] `js/ui/difficulty-dialog.js` (new) + dialog markup — New Game now
      opens a difficulty picker (reusing the Settings dialog's
      `<dialog>`/option-tile pattern) before generating, instead of
      always defaulting to Easy.
- [x] `js/ui/game-screen.js` — extended to call `startGame()` once
      generation finishes, and to announce completion
      (`isSolved()`-driven, not DOM text) once, on the state transition
      into `'complete'`.
- [x] Touch: `touch-action: manipulation` on interactive board/pad
      elements, board cells and number pad sized per the responsive grid
      (44px+ where the grid math allows — see Remaining Limitations),
      tap = click, no hover-dependent functionality.
- [x] Manual QA checklist below, for real-device verification beyond
      what headless Chromium can confirm.

**Manual keyboard/touch checklist** (✅ = automated via headless
Playwright as part of this phase's verification; ⬜ = needs a human on a
real device, not fully coverable by automation):

- ✅ Difficulty dialog → New Game generates and renders a board
- ✅ Tap/click a cell selects it; related row/column/box cells highlight
- ✅ Selecting a filled cell highlights other cells with the same value
- ✅ Number pad entry writes the digit; Erase clears it
- ✅ Notes toggle + digit marks a candidate; a real entry clears that
  cell's notes
- ✅ Two equal values in the same row/column/box are flagged as conflicts
- ✅ Keyboard: digits 1-9, Backspace/Delete, all 4 arrow keys, N, Escape
  (pause), Resume
- ✅ Completion is detected from state/engine (`isSolved`), announced once
- ✅ Back to Menu pauses and returns to the menu
- ✅ 320px viewport: no horizontal overflow; number pad buttons ≥44px
- ✅ Desktop viewport: board cells ≥44px
- ⬜ Real touch device: tap accuracy on board cells at the smallest
  supported width (emulated touch ≠ a real finger)
- ⬜ Real device: on-screen keyboard doesn't appear/interfere (board
  cells are `<button>`s, not text inputs, so it shouldn't — worth a
  physical check)
- ⬜ Screen reader pass over `aria-label`s on cells (e.g. "Row 3, column
  5, empty, notes 2, 4, 7") — content was designed for this but not
  run through an actual screen reader yet

## Phase 6 — Gameplay Tools & Completion Flow ✅ (2026-07-28)

- [x] `toggleNote(index, value)` in `js/game-state.js` — the one place
      notes are mutated; `applyNumberInput` delegates to it in notes
      mode rather than duplicating the logic. Rejects fixed *and*
      already-filled cells, preserves unrelated notes by construction
      (single-bit XOR).
- [x] Bounded undo history: `MAX_HISTORY_SIZE = 50` (exported,
      documented), oldest entries dropped once exceeded. Undo covers
      entry, erase, notes, and hint actions (all four route through the
      same `pushHistory`).
- [x] Hint: `useHint()` reveals the selected cell's solution value
      (clears its notes, clears the value from peer notes, same as a
      normal entry), plus `HINT_SCORE_PENALTY` as scoring metadata for
      the future real formula. Gated behind a confirmation `<dialog>`
      (`js/ui/hint-dialog.js`) — the Hint button itself is
      state-computed disabled/enabled, never exposing the solution to
      decide that.
- [x] Timer redesign: timestamp-anchored segments (`elapsedSeconds`
      confirmed-so-far + live `now() - segmentStartedAt`) instead of
      tick-counting, immune to `setInterval` drift/throttling. Pauses
      via a composable reason-`Set` (`suspendTimer`/`resumeTimer`) for
      independent, simultaneous causes: explicit pause (full stop +
      pause overlay), a blocking dialog (Settings, difficulty picker,
      hint confirmation), a hidden tab (`visibilitychange`, timer-only —
      no overlay just for switching tabs), and completion (terminal).
- [x] Pause overlay (from Phase 5) confirmed to fully obscure the board
      (`position: fixed; inset: 0`) — carried forward, not rebuilt.
- [x] Mistake tracking (from Phase 5) untouched; now paired with a new
      **optional immediate-error-checking setting**
      (`js/game-settings.js`, versioned localStorage, same pattern as
      `js/theme.js`) — mistakes are always counted internally regardless
      of the setting, but the red "wrong entry" styling only renders
      live when the setting is on.
- [x] Completion dialog (`js/ui/completion-dialog.js`) replacing the old
      plain-text "Solved!" message: difficulty, elapsed time, a clearly
      labeled provisional score (`js/completion.js`'s `estimateScore`,
      explicitly not the final Phase 8 scoring formula), mistakes,
      hints, generated Share Results text (`buildShareText`, copyable
      via the Clipboard API with a visible-textarea fallback), New Game
      (reopens the difficulty picker), and Menu.
- [x] Audited: no solution value is ever written into a DOM attribute,
      dataset, or other inspectable location for an unrevealed cell —
      verified both by code review and an automated browser check.
- [x] Settings is now reachable from the game screen itself (a header
      gear button), not just the main menu — needed for the immediate-
      error-checking setting and the "blocking dialog pauses the timer"
      behavior to be exercisable/useful mid-game; this was a real gap
      found while testing, not part of the original plan.

## Phase 7 — Persistence: Autosave, Continue, Settings ✅ (2026-07-28)

- [x] `js/storage.js` — thin localStorage wrapper (namespaced keys,
      versioned schema for future-proofing, same safe-fallback pattern
      as `js/theme.js`). `theme.js` and `game-settings.js` migrated onto it
      (keys renamed to `inspireSudoku:v1:appearance` /
      `inspireSudoku:v1:gameplaySettings`).
- [x] Autosave in-progress game state (debounced 500ms, plus a `pagehide`
      flush) via `js/active-game-store.js` + `js/game-persistence.js`.
- [x] "Continue Game" wiring from main menu — always resumes into the
      paused overlay, never straight into play.
- [x] New Game confirmation dialog before replacing an unfinished game.
- [x] Clear Data confirmation, with scope clearly explained (active game +
      statistics + high scores; leaves appearance/gameplay settings alone).
- [ ] Audio/input-pref persistence — deferred to Phase 9 (`js/audio.js`
      doesn't exist yet, so there are no audio prefs to persist).

## Phase 8 — Statistics, Best Times, High Scores ✅ (2026-07-28)

- [x] Track games started/completed, completion rate, total/average/best
      play time, current + best streak, total hints, total mistakes — per
      difficulty (`js/statistics-store.js`).
- [x] Centralized score formula (`js/scoring.js`): difficulty multiplier +
      speed bonus − mistake/hint penalties, floored at 0.
- [x] Top-10 high-score leaderboard per difficulty (`js/high-scores-store.js`).
- [x] Statistics screen UI with a difficulty filter.
- [x] High Scores screen UI with a difficulty filter.

## Phase 9 — Audio (Music + SFX) ✅ (2026-07-28)

- [x] `js/audio.js` — one shared, lazily-created `AudioContext`; music
      loop playback (optional, graceful if the file is absent) + SFX
      playback, independent mute/volume controls, respects settings
      persistence (`js/audio-settings.js`).
- [x] SFX synthesized directly with the Web Audio API (oscillator + gain
      envelope) instead of shipped audio files — click, select, error,
      and completion sounds, zero added binary assets, fully offline.
- [x] Vibration toggle, feature-detected and gated independently of SFX.
- [x] Audio/haptics controls added to the Settings dialog (music
      enable+volume, SFX enable+volume, vibration enable).

## Phase 10 — Offline / PWA ✅ (2026-07-28)

- [x] `manifest.webmanifest` with relative `start_url`/`scope` (subpath-safe).
- [x] `icons/README.md` documents the 192×192, 512×512, and maskable
      512×512 PNGs needed — no icon files exist yet, so the manifest
      correctly declares `"icons": []` rather than pointing at anything
      fabricated (see CLAUDE.md's asset policy).
- [x] `sw.js` service worker: versioned cache (`inspire-sudoku-shell-vN`),
      install/activate/fetch caching strategy — mandatory app-shell
      precache, best-effort optional-root-asset precache (missing
      `background-music.mp3` doesn't fail installation), cache-first
      runtime fill for same-origin static assets, network-first-with-
      cache-fallback for navigations, old-cache cleanup on activation.
- [x] `js/sw-register.js` — safe, feature-detected registration with
      relative scope, plus an in-page "Update available" banner.
- [x] Online/offline status indicator (`js/ui/connection-status.js`).
- [x] Local-data privacy explanation added to the Settings dialog.
- [x] Verified offline reload, a service-worker update after a
      cache-version bump, a missing optional asset, and GitHub
      Pages-style subpath hosting — all via Playwright against a local
      static server (devtools network throttling wasn't available in
      this environment; the automated equivalents cover the same
      scenarios — see DEVELOPMENT_LOG.md for details).

## Phase 11 — Accessibility Polish ✅ (2026-07-28)

- [x] Full keyboard-only playthrough audit — Tab order, dialog Escape/
      close paths, board arrow-key navigation + digit entry, pause/
      resume via Escape, all verified via Playwright driving the
      keyboard exclusively (no mouse events).
- [x] ARIA labels/roles audit on all interactive controls — new
      `getCellAriaLabel(index, state)` (`js/ui/cell-aria.js`) is the
      single source of truth for board-cell accessible names; the
      difficulty filter tabs now have correct `role="tab"`/
      `role="tabpanel"` structure with roving tabindex and arrow-key
      navigation, matching the WAI-ARIA tabs pattern.
- [x] Visible focus-state audit across all themes — `:focus-visible`
      confirmed present and legible in all 4 theme packs × 2 modes;
      added explicit hover/active states (mouse-hover gated behind
      `(hover: hover) and (pointer: fine)` so touch doesn't get stuck
      "hover" states) so focus isn't the only interactive-state cue.
- [x] `prefers-reduced-motion` audit — the new Cyber background drift
      and completion-dialog celebration animation are both declared
      *inside* `@media (prefers-reduced-motion: no-preference)` (not
      just relying on the existing blanket override), confirmed via
      Playwright's `reducedMotion: 'reduce'` emulation to compute to
      `animation-name: none`.
- [x] Contrast re-check post-theme-work — scripted WCAG AA audit across
      all 8 theme/mode combinations found and fixed one real failure
      (Paper/dark's `--color-error` at 3.91:1); everything else already
      passed. Added a non-color (wavy underline) cue alongside the
      color-based error/conflict indicators.
- [x] Responsive audit: 320px portrait, phone landscape, tablet
      portrait/landscape, desktop, ultrawide — no horizontal overflow
      found anywhere. Added a >=1024px desktop side-panel layout (board
      + toolbar/number-pad side by side) and a short-landscape-phone
      layout using the same technique sized down, eliminating a
      previously-required scroll to reach the number pad in landscape.
- [x] Safe-area inset audit — added missing insets to `.pause-overlay`
      (a fixed full-screen element that had none).
- [x] Accidental text-selection prevention on all button-style controls
      (`user-select: none` on every `<button>`), without affecting
      readable/copyable content elsewhere.
- [x] Intro Skip button given a guaranteed-visible treatment (dark
      scrim + white text) independent of theme, since it sits over
      arbitrary video content rather than this app's own themed chrome.
- [x] Small completion celebration (a one-shot scale/fade-in on the
      completion dialog's heading) and a subtle, reduced-motion-gated
      Cyber-theme background drift.

## Phase 12 — Testing & QA Hardening ✅ (2026-07-28)

- [x] Full engineering audit of automated test coverage against: coordinate
      helpers, board validation, valid placement, solver success/failure,
      solution-count limit, puzzle uniqueness, difficulty configuration,
      notes behavior, peer-note cleanup, undo history, timer/pause state
      transitions, scoring boundaries, storage corruption/validation,
      statistics updates, completion detection, share-result formatting —
      all already covered in depth by prior phases' test files; audit
      found and closed 2 genuine small gaps (`getCandidates`'s
      zero-candidates case, `pauseGame`/`resumeGame` no-op guards) rather
      than padding with redundant tests.
- [x] `MANUAL_QA.md` — a full manual browser QA checklist covering every
      scenario `node:test` can't reach (real video/audio codecs, real
      service-worker lifecycle, real viewport rendering, real
      screen-reader behavior).
- [x] Ran the complete automated suite + `node --check` across every JS
      file + one full Playwright-driven end-to-end smoke run — zero
      failures found; see `DEVELOPMENT_LOG.md` for exact counts.

## Phase 13 — GitHub Pages Deployment ✅ (2026-07-28, not yet deployed — see below)

- [x] Verify no absolute-root paths anywhere — scripted grep audit across
      every HTML attribute, CSS `url()`, JS import/fetch, the manifest,
      and `sw.js`: zero absolute-root references found anywhere.
- [x] Confirmed GitHub Pages' built-in "deploy from a branch" is
      sufficient — no build step exists or is needed, so no GitHub
      Actions workflow was added (would be unjustified complexity for a
      zero-build static site; see `README.md`'s Deployment section for
      the exact UI/CLI steps, and what a *future* justified workflow
      would look like if a real build step is ever added).
- [x] Added `.nojekyll` (skip GitHub Pages' default Jekyll processing —
      unneeded for this repo, standard zero-downside precaution) and a
      minimal `.gitignore`.
- [x] Simulated-subpath smoke test: served the repo under a
      `/sudoku-by-inspire-v1/` prefix (mimicking the real Pages project-
      site URL shape) via Playwright — manifest, service worker scope,
      full precache list, and a complete played-through game all
      resolved correctly with zero failed requests and zero console
      errors. **Not yet deployed to a live `github.io` URL** — Pages
      hasn't been enabled (a remote repository-settings change, out of
      scope without explicit permission — see `DEVELOPMENT_LOG.md`).
- [x] Full pre-deployment audit: 181/181 tests passing, all 46 JS files
      syntax-clean, `sw.js`'s precache list matches what's actually on
      disk, no secrets/local machine paths/accidental large files, the
      optional music file remains genuinely optional, `logo.png`/
      `inspiresoftwareintro.mp4` confirmed never modified since the
      user's original upload (single commit in their `git log`), and
      zero external runtime dependencies (`grep` for `https?://` across
      every runtime file: no matches).
- [x] `README.md` rewritten with a full deployment section (exact UI
      steps + optional CLI), a `.nojekyll` explanation, and
      `inspireclothing.art` integration options.

## Phase 14 — UX/Audio Polish and Bug Fixes ✅ (2026-07-28)

User feedback round, not a new architectural phase — but it directly
surfaced and fixed three genuine, real defects (not just polish), so it's
logged here in full rather than folded silently into another phase.

- [x] Two-track contextual background music: `./Sudoku Zen.mp3` for the
      menu family of screens, `./Logic Flow.mp3` for gameplay, each
      crossfading in/out on screen change or completion (`js/audio.js`
      rewritten onto a per-track-gain-node model; `js/screens.js` gained
      an `onScreenChange` hook). Both files were uploaded by the user
      directly to GitHub mid-phase and merged in; verified end-to-end
      with the real audio (see Outstanding/Blocked and the 2026-07-28
      follow-up entry in `DEVELOPMENT_LOG.md`) — including a real timing
      bug (track loading finishing after the screen transition that
      wanted it playing) found and fixed only once genuine files existed
      to test against.
- [x] Menu fades in from black after the intro video finishes or is
      skipped (`.menu-fade-overlay`, reduced-motion skips it entirely).
- [x] `logo.png` added to the Start screen title card.
- [x] Main menu visual polish: refined typography (weight/letter-
      spacing/sizing), button depth (shadow + existing hover/active),
      tightened footer spacing.
- [x] **Real bug fixed:** page-level scrolling on desktop/some mobile
      widths. Root cause: `#screen-game`'s `display: grid` rules (from
      Phase 11's side-panel layout) had higher CSS specificity than
      `.screen[hidden] { display: none }`, so the hidden game screen
      stayed laid out at full height behind whatever screen was actually
      showing. Fixed with an explicit `#screen-game[hidden]` override;
      also replaced `#app`'s margin-based desktop centering (which was
      separately leaking ~40px via margin collapse) with flexbox
      centering, and gave every `.screen` its own bounded
      `max-height: 100dvh; overflow-y: auto` so the outer page
      (`html, body { overflow: hidden }`) never scrolls even if some
      future screen's content ever runs long.
- [x] **Real bug fixed:** board grid lines were nearly invisible in 7 of
      8 theme/mode combinations (measured 1.3-2.4:1 contrast, well under
      WCAG's 3:1 minimum for non-text UI boundaries) — switched the
      cell-gap color from `--color-border` to the already-audited
      `--color-text-secondary` (>=4.5:1 everywhere).
- [x] **Real bug fixed:** entered/given digits were rendered ~15px off-
      center horizontally. Same root cause as the scrolling bug, one
      level down: `.cell-notes[hidden]` had no override for `.cell-notes
      { display: grid }`, so a "hidden" notes grid stayed present as a
      same-size flex sibling next to `.cell-value`, skewing the flex
      centering. Fixed with `.cell-notes[hidden]`/`.cell-value[hidden]`
      overrides; verified centered within ~1px (font-rendering rounding)
      across multiple cells.
- [x] Full playtest: all 4 difficulties, full input surface (select/
      digit/notes/erase/undo/hint/pause/resume), completion, reload +
      Continue, Clear Data, 8 theme/mode combinations, 320px keyboard-
      only — zero console/page errors. `npm test`: 181/181 unchanged
      (no application logic touched, only markup/styles/the audio
      module). `node --check`: all 46 JS files clean.

## Phase 14b — Pause Music, Real Video Audio, and Menu Hierarchy ✅ (2026-07-28)

A second direct user-feedback round on the same day, following up on Phase
14. Logged as 14b rather than a new numbered phase since it's a
continuation of the same polish/bug-fix thread, not new scope.

- [x] Gameplay music now fades out to the menu track while paused
      (Escape / pause overlay) and fades back to "Logic Flow" on resume —
      `js/audio.js` gained `activeTrackForContext()`/
      `syncActiveMusicTrack()`, reading live `getState().status` rather
      than a cached value (a fresh game's screen change fires before
      `startGame()` resolves, so a cached status would leak the
      *previous* game's paused/complete state into the new one).
- [x] **Real bug fixed:** the intro video was hardcoded `muted` in
      `index.html` even though the file genuinely has an audio track
      (confirmed via MP4 box inspection — one `soun`/`mp4a` track
      alongside the video track). `playIntro()` already calls
      `video.play()` synchronously inside the Start screen's
      click/keydown gesture handler, so removing `muted` is safe under
      browser autoplay policy. Not audible in this sandbox (still no
      H.264/AAC codec support in this headless Chromium build — see
      Phase 1's note) but structurally correct and ready for a real
      browser.
- [x] Menu button hierarchy: New Game keeps the solid accent fill as the
      one primary action; Continue Game/Statistics/High Scores/Settings
      now reuse the existing `.btn-secondary` outline style (previously
      only used in dialogs), so the menu reads as "one clear next step,
      four supporting ones" instead of five identical bars.
- [x] Added a small accent-colored divider under every `.brand` heading
      (Start, Menu, Statistics, High Scores all share the class) for a
      consistent branded header moment on every screen.
- [x] More breathing room on the menu screen (`#screen-menu` gap bumped
      to `--space-5`) and between nav buttons (`--space-2` → `--space-3`)
      — the previous tight clustering read as unfinished inside the
      much larger card.
- [x] Investigated the reported "scrolling reveals the gameplay screen
      on desktop" regression: swept 10 realistic viewport sizes × 4
      themes × before/after a real game session with Playwright —
      zero overflow cases found, `#screen-game` computed `display:
      none` in every case. This exactly matches the bug already fixed
      in Phase 14 (`#screen-game[hidden]` override); most likely
      explanation is a stale cached build (the service worker only
      swaps in new JS/CSS after a page reload once the new worker has
      activated — see `js/sw-register.js`'s "Update available" banner).
      `sw.js`'s `CACHE_NAME` bumped `v2` → `v3` for this round's actual
      HTML/CSS/JS changes regardless.
- [x] Full regression playtest: real-audio crossfade verification
      (menu → gameplay → pause → resume, via a `play()` observer),
      unmuted-video fallback check, 10-viewport overflow sweep, and the
      full Phase 14 playtest suite (all difficulties, full input
      surface, completion, reload/Continue, 320px keyboard-only) — all
      passing, zero console/page errors. `npm test`: 181/181 unchanged.

## Phase 15 — Final QA Against Acceptance Criteria

- [ ] Walk every item in `PROJECT_BRIEF.md` → "v1 Acceptance Criteria" and
      check it off with evidence (manual test note in
      `DEVELOPMENT_LOG.md`).
- [ ] Final `README.md` pass (install/run/deploy instructions accurate).

## Outstanding / Blocked

- [x] `./inspiresoftwareintro.mp4` and `./logo.png` supplied by user
      (2026-07-28) and wired into the Phase 1 intro screen / menu footer.
- [ ] Still waiting on app icon source image(s) for the PWA manifest
      (needed for Phase 10).
- [x] `./Sudoku Zen.mp3` (menu music) and `./Logic Flow.mp3` (gameplay
      music) supplied by the user (2026-07-28, Phase 14) via a direct
      GitHub upload merged into this branch; verified real playback with
      no console/page errors, `npm test` 181/181, full regression
      playtest all passing (see `DEVELOPMENT_LOG.md`).
