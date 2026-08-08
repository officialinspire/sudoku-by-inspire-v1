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

## Phase 14c — Smoother Fades, Real Desktop Grid Fix, Menu Icons ✅ (2026-07-30)

A third direct user-feedback round, continuing the same polish thread.

- [x] Music crossfades now use `setTargetAtTime` (smooth exponential
      approach) instead of `linearRampToValueAtTime`, and the fade
      duration was lengthened (1.2s → 1.8s) — linear gain ramps sound
      abrupt near the tail since loudness is perceived roughly
      logarithmically; the exponential curve reads as a genuinely smooth
      crossfade and gracefully absorbs being re-triggered mid-fade
      (rapid pause/resume) without a discontinuity.
- [x] **Real bug fixed: board grid lines washed out on standard-DPI
      desktop monitors.** The Phase 14 contrast fix was colorimetrically
      correct (verified ≥4.5:1) but never checked *actual rendered
      pixels* — a 1px CSS grid gap only paints as a true single pixel on
      a >=2x-DPI (Retina-class) screen; on an ordinary 1x monitor the
      browser anti-aliases that hairline across sub-pixel coverage and
      it visibly washes out, confirmed by comparing rendered screenshots
      at `deviceScaleFactor: 1` vs `2`. Fixed by widening the ordinary
      cell gap from 1px to 2px and the 3x3 box boundaries from 2px to
      3px (keeping the box lines visibly heavier than the ordinary
      grid), which renders as a solid line at any DPI.
- [x] Third main-menu polish pass: added small inline SVG icons (play,
      clock, bar-chart, star, sliders) to each nav button — zero new
      binary assets, `currentColor`-filled so they auto-match every
      theme and the disabled state, `aria-hidden` since each button
      already has a real text label. Along the way, discovered that
      every earlier "the menu looks flat/gray" impression this session
      was itself a test artifact: Phase 14's `.menu-fade-overlay`
      fade-from-black takes ~500-800ms to settle, and this round's
      screenshot scripts were only waiting ~200-300ms before
      capturing — i.e. genuinely catching the intentional fade
      mid-transition, not a real rendering defect. Confirmed by sampling
      actual PNG pixel values (not just `getComputedStyle`) over a
      timeline: (56,56,56) at 0ms → (255,255,255) by ~500ms, a clean
      monotonic fade matching `FADE_DURATION_MS = 800`.
- [x] Full regression playtest re-run: `npm test` 181/181, all JS/HTML
      syntax-clean, real-audio crossfade + pause/resume verification
      (still correct under the new fade curve), a 9-viewport grid-gap
      + digit-centering audit (2px gaps confirmed everywhere, centering
      still sub-2px), the 10-viewport overflow sweep, and the full
      Phase 14 playtest suite — all passing, zero console/page errors.
      One flake chased down and fixed in the *test script itself* (not
      the app): a hardcoded guess digit occasionally matched the random
      puzzle's actual solution at that cell, making Hint correctly
      report "nothing to hint" for an already-correct entry — not a
      real bug, just a bad test fixture.
- [x] `sw.js` `CACHE_NAME` bumped `v3` → `v4` for this round's HTML/CSS/
      JS changes.

## Phase 14d — Mobile Music-Stops-Unexpectedly Fix ✅ (2026-07-30)

A fourth direct user-feedback round, reported after real mobile play
(not desktop, and not reproducible in this sandbox's headless testing —
diagnosed and fixed from first principles instead).

- [x] **Real bug fixed: background music silently stopped after certain
      interactions on mobile** (opening Settings and returning to the
      menu; selecting a number or opening the pause menu during
      gameplay). Root cause: mobile browsers can pause an already-
      playing `<audio>` element for reasons entirely outside the app's
      control (a native `<dialog>` opening, a brief OS-level audio-
      session interruption, a focus change) and this app had no
      mechanism to notice or recover — the track just stayed silently
      paused until some unrelated screen/settings change happened to
      re-sync playback.
- [x] Fix, `js/audio.js`: each track's `<audio>` element now has a
      `pause` event listener — since this app never intentionally
      pauses the *currently active* track (every explicit `.pause()`
      call only targets a track that's already stopped being active, or
      runs while the tab itself is hidden), any `pause` event on the
      active track while `canPlayMusicNow()` is true is by definition an
      external interruption, and gets auto-resumed immediately. A
      low-frequency (2s) safety-net poll backs this up for the one case
      the event can't see: a `.play()` call whose promise silently
      rejected without ever transitioning the element *away* from
      paused (so no `pause` event fires for it in the first place).
      Both respect the existing mute/tab-hidden logic — verified the
      tab-hidden path still stays silent across the full poll interval,
      and correctly resumes only once the tab is visible again.
- [x] Verified via Playwright: directly simulating an external
      `.pause()` call (the same thing a mobile browser does) on both the
      menu and gameplay tracks confirms auto-recovery within under a
      second; reproduced the user's exact steps (open Settings mid-game,
      change a setting, close it; select several numbers in a row) and
      confirmed gameplay music keeps playing throughout. Fade in/out
      behavior (Phase 14c's smoother exponential crossfade) and the
      pause-overlay music crossfade (Phase 14b) both re-verified
      unaffected.
- [x] Full regression: `npm test` 181/181, all files syntax-clean, full
      Phase 14 playtest suite passing, zero console/page errors.
      `sw.js` `CACHE_NAME` bumped `v4` → `v5`.

## Phase 14e — Animated Sudoku-Digit Menu Background ✅ (2026-07-30)

A fifth direct feature request: a subtle animated Sudoku-digit texture
behind the main menu only.

- [x] Added `.menu-sudoku-bg` (edge-fade wrapper) and
      `.menu-sudoku-bg__pattern` (the actual drifting tile) as the first
      children of `#screen-menu` in `index.html` — living inside the
      menu screen's own subtree, not a globally-mounted element, so it's
      shown/hidden by the exact same `.screen[hidden] { display: none }`
      rule that already governs every screen transition. No JS
      mount/unmount logic needed or added; verified via
      `getBoundingClientRect()` (not `getComputedStyle`, which doesn't
      reflect an ancestor's `display: none`) that it renders zero-size
      on every other screen and during gameplay.
- [x] Single-element CSS `mask-image` pattern (a hand-built, seamlessly-
      tileable inline SVG data URI of loose Sudoku digits with ~45%
      blank cells) rather than a DOM grid of individual digits — stays
      at exactly 2 elements total regardless of viewport size, since
      `mask-repeat` tiles natively. The mask only defines shape; actual
      color comes from `background-color: var(--color-text-secondary)`
      (the same "ink" token the real board's grid lines use), so it
      auto-matches every theme with one image, no per-theme variants.
- [x] Diagonal down-left drift via `transform: translate()`, animated by
      *exactly* one tile period (`--sbg-tile`) so the loop is seamless
      by construction — verified the CSS `transform` matrix genuinely
      changes over a real 2s window (animation is live, not stalled).
- [x] Soft edge fade via a second, independent `mask-image` (radial
      gradient) on the outer wrapper.
- [x] `@media (prefers-reduced-motion: reduce)` disables the animation
      entirely, leaving a static faint pattern rather than removing it
      or leaving it moving — verified both that `animationName` becomes
      `none` and that the computed `transform` genuinely stops changing
      under that media query.
- [x] Tunable via 3 CSS custom properties scoped to `.menu-sudoku-bg`:
      `--sbg-tile` (420px, spacing), `--sbg-opacity` (0.06, the 4-8%
      requested range), `--sbg-duration` (32s, the 25-40s requested
      range).
- [x] **Real bug found and fixed during implementation:** the pattern
      was completely invisible at first (confirmed empirically, not
      just by not-noticing-it — boosted opacity to 60% for debugging
      and it still showed nothing). Root cause: `z-index: -1` was set
      on `.menu-sudoku-bg` to paint it behind `#screen-menu`'s normal-
      flow children, but `#screen-menu` only had `position: relative`
      — without an explicit `z-index` too, an element doesn't establish
      its own stacking context, so the `-1` had no local floor to stop
      at and escaped upward past every ancestor looking for one,
      landing behind the very first opaque background it found and
      disappearing entirely. Reproduced in isolation before fixing;
      fixed by adding `z-index: 0` to `#screen-menu` alongside its
      `position: relative`, which correctly scopes the child's `-1`
      to just below `#screen-menu`'s own (transparent) box.
- [x] `pointer-events: none`, `user-select: none`, `aria-hidden="true"`
      on the outer wrapper (covers the whole subtree for assistive
      tech); verified the New Game button is still the actual hit-test
      target at its own coordinates (background never intercepts
      clicks).
- [x] Verified: 2 total elements added (mobile-performance requirement),
      no page overflow introduced (desktop and 320px), full regression
      playtest suite still passing, real-audio and grid-line checks
      from prior phases unaffected. `sw.js` `CACHE_NAME` bumped
      `v5` → `v6`.

## Phase 14f — Fix Root Cause of Android Audio Cut-Outs ✅ (2026-07-30)

The user was still hearing music cut off after Phase 14d's fix, tested
specifically on an Android phone.

- [x] **Real bug found: Phase 14d's recovery only checked the `<audio>`
      element's own `.paused` state, never the shared `AudioContext`'s
      state.** Android readily suspends the AudioContext when it
      reclaims audio focus (locking the screen, a phone call, another
      app grabbing the session) — and when that happens, the `<audio>`
      element itself keeps reporting `paused: false` the whole time (it
      never actually stopped "playing" from its own point of view), so
      the pause-event listener and safety-net poll both saw "looks
      fine" while the app was completely silent. Verified this exact
      scenario by directly suspending the app's real `AudioContext` in
      Playwright (via a wrapped-constructor spy, not just calling
      `.pause()` on the element) and confirming `element.paused` stays
      `false` throughout the suspension — precisely reproducing what
      the old fix couldn't detect.
- [x] Fix, `js/audio.js`: consolidated the three separate recovery call
      sites (pause listener, safety-net poll, and a new
      `AudioContext.addEventListener('statechange', ...)` handler) into
      one shared `recoverMusicPlayback()` that *always* calls
      `ensureContextRunning()` first, regardless of the element's own
      paused state, then retries `.play()` only if actually needed.
      The new `statechange` listener is the fast path — recovers within
      milliseconds of the browser reporting the transition — with the
      pause listener and 2s poll as backstops for whatever it might
      miss.
- [x] Verified: simulated suspension recovers to `state: 'running'`
      within ~50ms (via the `statechange` listener, not the slower
      poll); re-ran every Phase 14b/14d audio regression test
      (crossfade, pause-overlay, settings-mid-game, rapid digit entry,
      tab-hidden silence) — all still passing unchanged.
- [x] Considered extending the same recovery pattern to the intro
      video — decided against it: it's a one-shot playback triggered
      once at app start (not a continuous/looping background element an
      interruption would repeatedly break), and it already has its own
      complete error/rejection → fallback-to-menu handling from Phase 1.
- [x] `npm test`: 181/181. Full regression playtest suite: unchanged,
      all passing. `sw.js` `CACHE_NAME` bumped `v6` → `v7`.

## Phase 14g — Design Token Consolidation (no visual/functional change) ✅ (2026-07-30)

An explicit "polish the plumbing, not the paint" pass: audit `styles.css`
for duplicated hardcoded values and consolidate them into reusable
design tokens, with a hard constraint that nothing renders differently
afterward — this is groundwork for a future intentional redesign pass,
not a redesign itself.

- [x] Audited the entire (single) stylesheet via targeted greps for
      every `box-shadow`, `font-size`, `font-weight`, `letter-spacing`,
      `border`/`border-radius`, `transition`, and `animation` duration/
      easing declaration. Colors, spacing, and non-pill radii were
      already fully tokenized from earlier phases; everything else
      wasn't.
- [x] Added to the global `:root` token block: a 4-tier shadow scale
      (`--shadow-sm/md/lg/panel`, built from the existing
      `--shadow-color` so per-theme recoloring still works), a 14-step
      numbered type scale (`--font-size-1` through `-14`, matching the
      project's own `--space-N` numbering convention) covering every
      distinct font-size already in use, 3 font-weight tokens, 3
      letter-spacing tokens, `--border-width-thin` (the pervasive 1px
      chrome border), `--focus-ring-width`, `--radius-pill`, 4 motion
      durations (`--duration-fast/moderate/slow/ambient`), and 4 easing
      tokens (`--ease-standard/out/in-out/linear`).
- [x] Board-specific `--board-gap-width` (2px) and `--board-line-width`
      (3px) were deliberately scoped locally on `.board` rather than
      folded into the global border-width tokens — they exist for a
      specific, already-documented DPI-legibility reason (Phase 14c),
      and coincidentally sharing a number with an unrelated global token
      would risk a future edit to one silently resizing the other.
- [x] Replaced every matching hardcoded value across the whole file with
      its token — 28 font-size, 20 font-weight, 6 letter-spacing, 14
      border-width, 5 box-shadow, and 22 transition/animation duration+
      easing declarations. Left three categories of value deliberately
      un-tokenized, each already documented in-code as intentional: the
      two responsive `clamp()` font-sizes on board digits (single-use,
      structurally different from a flat scale value), the non-themed
      overlay colors on `.skip-btn`/`.pause-overlay`/dialog backdrops
      (need guaranteed contrast against arbitrary video frames/content,
      not the current theme), and the single-use conflict-ring inset
      shadow width (a functional state indicator, not decorative
      elevation).
- [x] Verified zero visual regression rigorously, not just by eye:
      snapshotted `getComputedStyle()` for ~20 representative selectors
      across all 8 theme/mode combinations *before* editing (via a
      temporary `git stash` to get the pre-edit file back), then diffed
      against the same snapshot taken after. The only differences found
      (cell-value font-weight/color, and gradient-background
      `backgroundColor` sampling on `.option-tile`) were proven to be
      pre-existing test nondeterminism — reproduced identically by
      diffing the *post-edit* code against itself twice (random puzzle
      content changes which cell is "first" and fixed-vs-not; browser
      gradient sampling for `getComputedStyle` isn't pixel-stable) —
      not caused by the token changes.
- [x] Full regression: `npm test` 181/181, all JS syntax-clean, the
      complete Phase 14 playtest suite, the grid-gap/centering audit,
      the audio crossfade/recovery tests, and the menu-background
      restriction tests all still passing unchanged. `sw.js`
      `CACHE_NAME` bumped `v7` → `v8`.
- [x] No new styling library added; single stylesheet, same
      `data-theme`/`data-mode` architecture, same component structure —
      purely additive tokens plus mechanical value-for-token swaps.

## Phase 14h — Light/Dark Palette Polish (Light theme pack) ✅ (2026-07-30)

Refined the base "Light" theme pack's Light and Dark color modes using
the token system Phase 14g just consolidated — a color-only pass, no
new tokens, no layout/architecture change. Cyber, Woodgrain, and Paper
theme packs (each already warm/parchment/dark-technical by design) were
intentionally not touched.

- [x] Light mode: replaced flat `#ffffff`/`#eef0f2` with a warm-neutral
      trio — `--color-bg: #f6f4ef` (outer page, most muted), `--color-
      panel: #fcfaf8` (the #app card/dialogs, brightest/cleanest), and
      `--color-surface: #edeae6` (buttons/tiles/controls, a step more
      muted than panel so they read as a distinct recessed layer
      instead of blending in — previously panel and surface were both
      literally `#ffffff`, i.e. not actually distinct from each other).
      Text darkened from flat `#1a1a1a`/`#55595e` to a warm near-black/
      mid-gray (`#2d261f`/`#685e55`) to match. Border darkened from
      `#d0d3d6` to `#c2b9ad` for a real (if still deliberately soft)
      contrast improvement over chrome that was previously only
      1.3-1.65:1.
- [x] Dark mode: refined `#121212`/`#f0f0f0` to a deliberate graphite/
      off-white pairing — `--color-bg: #161618`, `--color-panel:
      #1f1f23`, `--color-surface: #2a2a2f` (three clearly elevated
      steps, verified via contrast math not eyeballed), text `#edebe8`
      (comfortable off-white, not harsh `#f0f0f0`), border lightened to
      `#51515c` for better legibility against the deeper background.
- [x] Accent (`#2b6cb0` light / `#5b9bd5` dark) and focus ring colors
      left completely unchanged — verified first that both already
      clear 4.5:1+ against every new surface (4.52-6.10:1), so retuning
      them wasn't needed and the brief specifically asks to keep one
      consistent accent rather than adjust it alongside the neutrals.
- [x] `--color-success` (light) nudged from `#1f7a3d` to `#1a7039` —
      the original measured 4.48:1 against the new `--color-surface`,
      a hair under WCAG AA's 4.5:1; the new value clears it with real
      margin (5.1-5.9:1) instead of skating the line.
- [x] `--shadow-color` warmed and softened slightly in both modes
      (light: cool navy → warm dark brown, 0.14 → 0.12 opacity; dark:
      0.55 → 0.5 opacity) to sit better against the new warm/graphite
      surfaces without changing where shadows are used.
- [x] Board digit/state tokens (`--color-clue-fixed`, `--color-entry-
      player`, `--color-notes`, `--color-cell-selected/related/match`)
      verified against the new `--color-panel` and left unchanged —
      all still clear 4.5:1+ for text, and the soft state tints still
      read correctly paired with their existing structural cues.
      Dark-mode `--color-cell-related` updated from `#232326` to
      `#2a2a2f` to stay in sync with the new `--color-surface` (the two
      were already the same literal value by design, not coincidence).
- [x] Verified every text/UI-role color pairing with a WCAG contrast
      script (relative luminance formula, same methodology as the
      Phase 11/14c audits) before touching any CSS — not tuned by eye.
- [x] Confirmed Cyber/Woodgrain/Paper theme packs and System mode are
      completely unaffected (checked computed `--color-bg` for all 3
      other packs × 2 modes, and System mode's resolved value, after
      the edit).
- [x] Full regression: `npm test` 181/181, the complete Phase 14
      playtest suite, grid-gap/centering audit, menu-background
      restriction/animation tests, and audio crossfade tests all still
      passing unchanged. Visually verified menu/board/settings dialog
      in both modes, desktop and mobile. `sw.js` `CACHE_NAME` bumped
      `v8` → `v9`.

## Phase 14i — Main Menu Typography & Hierarchy Refinement ✅ (2026-07-30)

- [x] `.brand` (title) font-size converted from a fixed token +
      desktop-only media-query override to a single fluid
      `clamp(var(--font-size-13), 1.7rem + 1.3vw, var(--font-size-14))`
      expression, anchored to the existing type-scale tokens at both
      ends; added explicit `line-height: 1.1` (previously unset).
- [x] `.brand--compact` (menu-screen title) similarly converted to
      `clamp(var(--font-size-11), 1.2rem + 0.5vw, var(--font-size-12))`.
- [x] `.start-logo` shrunk from `min(70%, 16rem)` to
      `clamp(6rem, 22vw, 9rem)` so it reads as a supporting brand mark
      under the title rather than competing with it — restores the
      requested hierarchy order (app title > INSPIRE branding).
- [x] `.start-prompt` font-size converted to
      `clamp(var(--font-size-7), 0.85rem + 0.4vw, var(--font-size-9))`
      with `line-height: 1.4` added for comfortable reading.
- [x] `.menu-nav` max-width converted from fixed 20rem (mobile) / 24rem
      (desktop, via media query) to a single fluid
      `clamp(18rem, 60vw, 22rem)`, keeping buttons from growing
      button-bar-wide on desktop.
- [x] Removed the now-redundant `.brand{font-size}` and
      `.menu-nav{max-width}` overrides from the `@media (min-width:
      768px)` block; every other rule in that block (`.difficulty-
      filter`, `body`, `#app`, `.screen`) left untouched.
- [x] No HTML changes, no navigation/feature changes — every menu
      action (New Game, Continue Game, Statistics, High Scores,
      Settings) preserved exactly.
- [x] Verified across 320×568, 390×844, 768×1024, 1280×800, and
      1920×1080: zero horizontal/vertical page overflow, all 5 menu
      buttons present with correct IDs at every size. Full regression:
      `npm test` 181/181, full Phase 14 playtest suite, and the menu-
      background restriction/animation tests all still passing
      unchanged. `sw.js` `CACHE_NAME` bumped `v9` → `v10`.

## Phase 14j — Consolidated Control Interaction States ✅ (2026-07-30)

- [x] Added shared `--press-scale: 0.98` / `--press-translate-y: 1px`
      tokens (within the requested 0.97-0.99 scale range), reusing the
      existing `--duration-fast` (200ms, inside 120-220ms) for timing.
- [x] Replaced the old brightness+scale-only `:active` treatment with
      `transform: translateY(1px) scale(0.98)` plus `box-shadow: none`
      (subtle shadow reduction while pressed) across every button-like
      control: menu buttons, `.btn-primary`/`.btn-secondary`, the
      number pad, difficulty tabs, option tiles, and the skip button.
      No bounce, no ripple, no glow.
- [x] Added `box-shadow: var(--shadow-sm)` to `.btn-primary` as a
      baseline (previously only the menu's "New Game" button had
      elevation) so every primary action in the app is visually
      related and the press-state shadow reduction has something real
      to reduce everywhere it appears (dialogs, pause overlay, update
      banner, completion dialog).
- [x] Consolidated duplicated CSS: one shared transition declaration
      for every interactive control (previously repeated per-component,
      and entirely missing on `.number-btn`/`.skip-btn`); one shared
      `:disabled` rule (previously identical code in two places); one
      shared "selected" rule for `#btn-notes-toggle[aria-pressed]` and
      `.difficulty-filter-btn[aria-selected]` (previously duplicated).
- [x] Added `touch-action: manipulation` to the global `button` reset
      so no control anywhere in the app has a tap-delay/double-tap-zoom
      window (previously only board cells and the number pad had it).
- [x] Added a `.option-tile:has(input:focus-visible)` rule so keyboard
      focus on a theme/mode/gameplay radio or checkbox rings the whole
      tile, not just the small 1.1rem input — progressive enhancement,
      same pattern already used for the `:has(input:checked)` state.
- [x] Hover remains gated behind `@media (hover: hover) and
      (pointer: fine)` (unchanged, already correct) so touch devices
      never get a "stuck" hover state.
- [x] No HTML changes — no new controls, no navigation changes. Every
      existing button, label, and `aria-*` attribute preserved exactly.
- [x] Verified with Playwright across mouse, keyboard, and touch-
      emulated input: transition duration measured at 200ms, pressed
      transform measured as `scale(0.98) translateY(1px)` with
      box-shadow reduced to `none`, keyboard `:focus-visible` rings
      confirmed on menu buttons and option tiles, touch tap produces no
      stuck hover filter, disabled/selected states confirmed, and every
      checked touch target measured >=44x44px. Full regression:
      `npm test` 181/181, the Phase 14 playtest suite, grid-gap/
      centering audit, and the menu-background suite all still passing.
      Visually spot-checked in Light/Cyber-dark themes and the Settings
      dialog/game screen. `sw.js` `CACHE_NAME` bumped `v10` → `v11`.

## Phase 14k — Sudoku Board Cell-State Visual Hierarchy ✅ (2026-07-30)

- [x] Audited the board against every requested state (default,
      selected, related row/col/box, matching-number, fixed, entered,
      notes, conflict) with real gameplay screenshots in light and dark
      mode before changing anything — found the "match" tint
      (`#fde68a`) was the single most saturated color anywhere on the
      board (louder than selection itself), and the selected cell's
      soft blue fill read as barely distinct from the related row/
      column's tint at a glance.
- [x] Added an accent-colored inset ring (`box-shadow`, a structural
      cue separate from the fill color) to the selected cell only —
      related and matching cells stay flat tints with no ring, so
      selection unambiguously outranks them without needing a louder
      background color.
- [x] Softened `:root`'s (Light pack) `--color-cell-match` from
      `#fde68a` to a muted warm cream `#f3e8c9`, bringing it in line
      with how subdued the same token already was in every other theme
      pack (Cyber/Woodgrain/Paper). No other theme's tokens changed.
- [x] Fixed vs. player-entered digits now differ on three channels, not
      just color: entered digits are italic at semibold weight, fixed
      clues are upright at extrabold weight (widened from bold) —
      readable as "printed clue" vs. "handwritten-in" even in
      grayscale or for a color-vision-deficient player.
- [x] Added a `--duration-board: 0.15s` token (120-180ms range as
      requested) and applied it as a `background-color`/`box-shadow`
      transition on `.cell` and a `color` transition on `.cell-value` —
      previously cell state changes snapped instantly.
- [x] Tokenized the selection/conflict ring width as `--cell-ring-width`
      alongside the board's existing line-width tokens, rather than a
      magic number.
- [x] 3×3 box boundaries, the per-cell "no heavy border" default, and
      notes rendering left untouched — already correct.
- [x] Found and fixed a real (pre-existing, unrelated to the above)
      board-scaling bug while verifying "scales cleanly on narrow
      screens": `.board` has `overflow: hidden` (needed to clip to its
      rounded corners), which per spec floors a flex item's automatic
      minimum size at 0 instead of its aspect-ratio-derived size — on
      a short viewport (e.g. 320×568) this let the flex column silently
      squash the board into a short rectangle instead of staying
      square and letting `.screen`'s own `overflow-y: auto` scroll the
      rest into view. Fixed with `flex-shrink: 0` on `.board`.
      Confirmed present identically on the pre-this-phase commit (via
      `git stash`) before fixing it, so it's a genuine bug catch, not
      something introduced by the state-hierarchy work.
- [x] No changes to puzzle generation, validation, difficulty, or game
      rules — every edit is in `styles.css`; `board-view.js` and
      `game-state.js` were read for reference only, never modified.
- [x] Verified: `npm test` 181/181; a new Playwright script confirming
      transition duration (150ms), zero cell layout shift across state
      changes, the selection ring vs. ring-free related/match cells,
      the fixed/entered non-color distinction, and intact 3×3
      boundaries; a scaling script confirming the board stays exactly
      square with no horizontal page overflow at 320/390/768/1280/
      1920px and in short-landscape phone view; screenshots across all
      4 theme packs × both modes; the full Phase 14 regression suite
      (playtest, grid-gap/centering audit, menu-background suite) still
      passing unchanged. `sw.js` `CACHE_NAME` bumped `v11` → `v12`.

## Phase 14l — Number-Entry Controls & Gameplay Feedback Polish ✅ (2026-07-30)

- [x] Audited existing coverage first: confirmed the number pad already
      has the full Phase 14j tactile press system (200ms, scale 0.98 +
      1px translate, brightness on press) — nothing to add there, just
      verified it's still intact. Confirmed "unavailable/completed
      number" states do **not** exist anywhere in the codebase, so per
      the request's own "if they already exist" scope, nothing was
      added there — no new gameplay feature invented.
- [x] Number pad now highlights the button matching the selected
      cell's current value (an accent ring, mirroring the board's own
      matching-number cells) — `js/ui/board-view.js` reuses the
      `selectedValue` it already computes; `styles.css` adds
      `.number-btn.is-current-value`.
- [x] Notes mode now visibly changes the number pad itself (dashed
      accent border + accent digit color on all 9 buttons), not just
      the toggle button's own label — `.number-pad.is-notes-mode
      .number-btn`, toggled from `state.notesMode` in the same render
      pass.
- [x] Added a brief, one-shot "settle in" pulse (scale 0.8→1, opacity
      0.4→1, `--duration-board` 150ms) on a cell's digit the moment a
      value actually appears or changes — diffed against the
      previously-rendered text so it never replays on unrelated
      re-renders (selecting a different cell, toggling notes mode) and
      never fires on the render that first paints a (re)started or
      restored game.
- [x] Added a brief, one-shot shake (translateX, max 3px, decaying,
      new `--duration-shake` 300ms token) the moment a cell's entry
      first becomes wrong (immediate error checking on) — diffed
      against the cell's previous `is-error` state so it fires exactly
      once per mistake, never repeatedly while the cell simply stays
      wrong.
- [x] Both new animations are pure `transform`/`opacity`/color changes
      (never affect layout) and are automatically neutralized by the
      existing sitewide `prefers-reduced-motion: reduce` override —
      no separate gating needed.
- [x] No JS-side delay anywhere: animations are fire-and-forget CSS
      (`classList` toggle + a forced reflow to allow re-triggering),
      never a `setTimeout` gating the next input; `applyNumberInput`/
      `eraseSelectedCell`/`selectCell` themselves are untouched.
- [x] No changes to validation rules or number logic — every edit to
      `js/ui/board-view.js` only reads existing state to drive
      class toggles; `js/game-state.js` was not modified.
- [x] Verified: `npm test` 181/181; a new Playwright script covering
      the number-pad highlight tracking selection, notes-mode styling
      toggling on/off, the entry pulse firing exactly once per real
      change (checked via `getAnimations()`, not just class presence),
      the shake firing once on becoming wrong and not again on a later
      re-render while still wrong, `prefers-reduced-motion` forcing
      near-zero animation durations, the existing number-button press
      effect still present, and 6 rapid-fire keyboard digit entries all
      registering with no drops in under 2 seconds. Full existing
      regression suite (`final-playtest.mjs`, `grid-gap-audit2.mjs`,
      `sbg-verify.mjs`, board-scaling checks) still passing unchanged.
      Screenshotted mouse-click and touch-tap entry paths mid-animation
      to visually confirm both the shake and the pulse. `sw.js`
      `CACHE_NAME` bumped `v12` → `v13`.

## Phase 14m — Dialog, Overlay & Pause Screen Polish ✅ (2026-07-30)

- [x] Audited first: confirmed all six `<dialog>` elements (Settings,
      New Game's difficulty picker, Hint confirm, Puzzle Solved,
      Replace Unfinished Game?, Clear Data?) already share one
      `.settings-dialog` class — strong existing foundation, so a
      single shared CSS change reaches every one of them. Confirmed
      the pause overlay does **not** share that system (plain scrim +
      unstyled text) and found two real, screenshot-confirmed issues:
      Settings' 3-button action row overflowed/wrapped ugly on a
      360px-wide screen, and no dialog/overlay had any entrance or
      exit motion at all (native `<dialog>` show/hide is instant).
- [x] Added a shared entrance/exit transition to `.settings-dialog`
      (fade + a small `scale(0.96→1)`, 200ms — inside the requested
      150-250ms range, no bounce) using `@starting-style` +
      `transition-behavior: allow-discrete`, the standard modern CSS
      technique for animating native `<dialog>` open *and* close with
      zero JS — `showModal()`/`close()` calls in all six dialog
      controller files are completely untouched. `::backdrop` gets its
      own opacity-only fade (no transform — scaling a full-viewport box
      would reveal its edges, not read as subtle).
- [x] Fixed the mobile button-row overflow: `.settings-actions` now
      stacks full-width buttons on narrow screens and becomes a
      right-aligned row again at the existing >=768px desktop
      breakpoint — column order matches DOM order (never reversed), so
      visual/reading/tab order stay in agreement.
- [x] Pause overlay restyled to match the dialog surface system: its
      "Paused" message and Resume button now sit in a `.pause-card`
      (panel background, `--radius-lg`, `--shadow-lg` — same tokens
      `.settings-dialog` uses) instead of floating directly on the
      scrim; the scrim's own opacity aligned to `0.5` to match
      `::backdrop`; and it gets the same fade (+ card scale) transition
      as the real dialogs, via the same `@starting-style`/
      `allow-discrete` technique applied to a plain toggled element
      instead of a native `<dialog>`.
      Real accessibility gap found and fixed along the way: the pause
      overlay never moved keyboard focus onto itself, so a keyboard
      user's focus stayed on the now-hidden board cell behind it.
      `js/ui/board-view.js` now focuses the Resume button the moment
      the overlay actually becomes visible (and the existing "follow
      the selected cell" logic already correctly restores focus to the
      board on resume — verified, not changed).
- [x] Completion dialog hierarchy clarified: Score (always the last
      stat in the DOM) now spans both grid columns with a divider
      above it and is set in a larger, accent-colored value — reusing
      the exact same "this is a score" treatment High Scores' own list
      already uses — so it reads as the payoff "total," calm rather
      than flashy, with zero new statistics, confetti, or sound. The
      existing title-celebration animation (scale+fade-in, gated to
      `prefers-reduced-motion: no-preference`) was left exactly as-is.
- [x] Desktop dialog width was already capped (`min(30rem, 92vw)`,
      confirmed 480px on a 1920px-wide viewport) and mobile content was
      already inset from screen edges (92vw + internal padding,
      confirmed no overflow at 320px) — no changes needed there, just
      verified.
- [x] Reduced motion: no new gating logic anywhere — the existing
      sitewide `@media (prefers-reduced-motion: reduce)` override
      (forces every `transition-duration`/`animation-duration` near
      zero) already covers the new dialog/backdrop/pause-card
      transitions, confirmed directly rather than assumed.
- [x] Verified: `npm test` 181/181. A new Playwright script confirmed
      the dialog transition duration (200ms), a genuinely mid-flight
      opacity+transform sample during open, the dialog staying rendered
      briefly after `close()` before being removed, reduced motion
      forcing near-zero duration, native focus-trap and ESC-close/
      focus-return behavior intact (with a documented, `git stash`-
      confirmed-pre-existing Chromium quirk where Tab transiently
      touches `<body>`/the dialog element itself while wrapping —
      never a real actionable element outside the dialog), the mobile
      action-button stack vs. desktop row, dialog width capped on
      desktop and inset from edges on mobile, and the pause overlay's
      card styling + focus handoff to Resume and back to the board.
      Screenshotted every dialog type plus the pause overlay across
      Light/Cyber-dark/Woodgrain-dark, mobile and desktop. Full
      existing regression suite (`final-playtest.mjs`) still passing
      unchanged. `sw.js` `CACHE_NAME` bumped `v13` → `v14`.

## Phase 14n — Responsive Pass: Menu & Gameplay UI ✅ (2026-07-30)

- [x] Built a Playwright audit script covering 320/375/430/768/1024/
      1440px plus a short-landscape phone viewport, across the Start
      screen, Menu, Game screen, difficulty picker, and Settings
      dialog: horizontal overflow, sibling overlap, tap-target size
      (>=44px), board squareness/containment, desktop dialog width cap,
      and safe-area-aware padding presence. Every check passed at every
      breakpoint except one.
- [x] Found and fixed a real bug: the game screen's header (Menu
      button, 4 meta stats, Settings gear) relied on plain flex-wrap
      to fit 3 competing groups on one line. Below ~440px this
      cascaded unpredictably — a genuine 3-row stack at 320px, and at
      390-430px the Settings gear wrapped alone onto its own row,
      left-aligned instead of staying paired top-right with Menu.
      Confirmed via direct measurement (`.game-header`'s own rendered
      height: 134px/3-row at 320px, 96px/inconsistent-2-row at
      340-430px, clean 44px/1-row only from 440px up).
- [x] Replaced the flex-wrap header with an explicit CSS Grid
      (`grid-template-areas`) so the layout is deliberate at every
      width instead of an accidental cascade: below 480px, Menu and
      Settings share one row (opposite corners) with the four stats
      centered on their own row below; at >=480px (confirmed with a
      safety margin above the measured 440px natural-fit point) it
      becomes a single row, Menu/stats/Settings left-to-right. DOM
      order (and therefore keyboard tab order) is unchanged — grid-area
      placement reorders visually without touching focus order, and
      the two focusable elements (Menu, Settings) were already in
      their natural visual order.
- [x] Verified every other requested review area was already correct
      and needed no change: title scaling (existing `clamp()` fluid
      type from Phase 14i), menu width capping (Phase 14i/j), board
      sizing/`aspect-ratio` (Phase 14k, including the `flex-shrink: 0`
      fix), number-pad/toolbar tap targets and placement (Phase 14j/l),
      dialog sizing and safe-area padding (Phase 14m), and the existing
      short-landscape-phone and >=1024px wide-desktop side-panel
      layouts — all re-confirmed under this pass's fresh 6-breakpoint
      + landscape sweep rather than assumed still-correct.
- [x] Also swept the Statistics and High Scores screens (difficulty
      filter tabs, stat cards) at 320/768px — no issues found.
- [x] No device-specific JavaScript anywhere — the one fix is pure CSS
      (`display: grid` + `grid-template-areas` + one `min-width: 480px`
      media query, matching this file's existing mobile-first
      convention), reusing already-established tokens
      (`--space-2`, `--touch-target-min`) rather than new ones.
- [x] Verified: `npm test` 181/181. The 6-breakpoint + landscape audit
      script re-run clean after the fix (header height: 82px/clean-
      2-row below 480px, 44px/clean-1-row at and above it, at every
      sampled width). Full existing regression suite — the Phase 14
      playtest, grid-gap/centering audit, menu-background suite,
      board-state suite, board-scaling checks, number-entry feedback
      suite, and dialog suite — all still passing with zero
      regressions. `sw.js` `CACHE_NAME` bumped `v14` → `v15`.

## Phase 14o — Accessibility Audit ✅ (2026-07-30)

- [x] Full checklist audit (semantic controls, icon-only accessible
      names, keyboard nav, focus order, `:focus-visible`, contrast,
      touch targets, selected/disabled states, dialogs/overlays,
      decorative-content handling, reduced motion) against every
      HTML/CSS/JS file — found the app already solid on most fronts
      from prior phases (native `<dialog>` focus trap + `aria-
      labelledby` on all six dialogs; the difficulty filter's full
      WAI-ARIA tabs pattern with roving tabindex; `getCellAriaLabel`
      announcing row/column/value/selected/conflict state on every
      board cell; `screens.js` moving focus to each new screen's root
      on navigation; a comprehensive `getCellAriaLabel`/`aria-live`
      story on every dynamic status region; `.menu-sudoku-bg` already
      `aria-hidden="true"`; zero `outline: none` anywhere in
      `styles.css`; the sitewide `prefers-reduced-motion: reduce`
      override already catching every transition/animation added
      across every prior phase). No semantic-button, keyboard, focus-
      order, or reduced-motion gaps found.
- [x] Wrote a live-contrast Playwright script (WCAG relative-luminance
      formula, worst-case gradient-stop testing for Woodgrain/Paper's
      gradient surfaces — a plain `getComputedStyle().backgroundColor`
      read returns transparent for those and silently produces bogus
      readings) covering every `--color-accent`-as-text usage in the
      app across all 8 theme/mode combinations. Found 4 real WCAG AA
      failures, all in Paper/dark specifically: `.brand span` ("by
      Inspire") at 4.23:1 against the desktop `--color-panel` card,
      the pre-existing `.highscore-score` at 3.88:1 against
      `--color-surface`, and two from this project's own recent work —
      the notes-mode number-pad digit text and the completion dialog's
      score — both introduced in Phases 14l/14m without ever being
      checked against this exact pairing.
- [x] Fixed by switching all four from `--color-accent` (calibrated
      for fills/borders/focus rings) to `--color-entry-player` — a
      token in the same accent hue family per theme (literally
      identical in Woodgrain/light) but already purpose-built and
      audited for colored text on panel/surface backgrounds. Re-
      verified: comfortable 4.5:1+ margin in all 8 combinations,
      visual identity preserved (same brand hue, just the
      already-established "safe for text" shade of it).
- [x] Found and fixed a real dialogs/overlays gap: `#pause-overlay`
      isn't a native `<dialog>` (it needs to appear instantly on a
      backgrounded tab or Escape press, without the modal `showModal()`
      machinery), so it never had any of `role="dialog"`,
      `aria-modal="true"`, or an accessible name — nor any real
      keyboard focus trap, despite visually blocking the board. Added
      `role="dialog" aria-modal="true" aria-label="Game paused"` to the
      element, plus a minimal, fully-correct trap: since Resume is the
      overlay's only focusable element and already receives focus the
      instant it opens (a Phase 14m fix), blocking `Tab`/`Shift+Tab`
      from moving focus at all is a complete trap for this
      single-control case.
- [x] No changes to product scope, functionality, or visual identity —
      confirmed every existing interaction (click Resume, click the
      backdrop, Escape to toggle pause, Enter on the focused Resume
      button, Settings-dialog Tab navigation unaffected by the new
      trap) still works exactly as before.
- [x] Considered and deliberately left unchanged: the board's
      "related"/"matching-number" cell tints (Phase 14k) rely on hue/
      luminance alone with no structural cue, unlike the selected cell
      (which has an accent ring) and conflicts (an error-colored ring).
      Not fixed here — the information they convey (row/column/box
      membership, matching digits) is independently available through
      non-color means already on screen (grid position, the literal
      digit text), and Phase 14k's explicit brief was to keep these
      two states deliberately subordinate/subtle to the selected
      cell's ring; adding rings to them now would reverse that
      considered design decision and add visual weight this task's
      "preserve existing visual identity" and "minimal targeted
      changes" constraints argue against. Documented as a reasoned
      exception, not an oversight.
- [x] Verified: `npm test` 181/181. The corrected 8-combination
      contrast script passes clean. A new Playwright script confirmed
      the pause-overlay's ARIA attributes, that focus starts on and
      stays trapped on Resume through repeated Tab/Shift+Tab, and that
      every existing way to resume (click button, click backdrop,
      Escape, Enter-on-focused-button) still works, with focus
      correctly returning to the board afterward. Full existing
      regression suite — the Phase 14 playtest, grid-gap/centering
      audit, menu-background suite, board-state suite, number-entry
      feedback suite, and dialog suite — all still passing with zero
      regressions. Screenshotted the corrected colors in Paper/dark
      (where the failures were) to confirm they read as more legible,
      not just numerically compliant, with no loss of the theme's warm
      character. `sw.js` `CACHE_NAME` bumped `v15` → `v16`.

## Phase 14p — Final Polish & Performance Audit ✅ (2026-07-30)

A closing audit pass, not a redesign: review the whole design system for
inconsistency (fonts, spacing, radii, colors, shadows, button states,
animation, unused styles) and performance (expensive animated properties,
unnecessary rerenders, menu-background leakage), fixing only what the
audit itself finds broken.

- [x] Confirmed the actual available tooling before claiming results:
      this repo has no lint/type-check/build config (no `eslint`/
      `prettier`/`tsconfig`/`stylelint`, per `package.json`'s single
      `"test": "node --test"` script and `CLAUDE.md`'s no-build-step
      constraint) — `node --check` across every `.js` file is used as the
      closest available substitute for "type-check"/"build".
- [x] Font-size, spacing, radius, shadow, and color audit of the entire
      `styles.css`: zero hardcoded `border-radius` anywhere; zero
      hardcoded spacing except one justified sub-scale value
      (`.cell-notes { padding: 2px }`, the 3×3 in-cell notes mini-grid);
      zero hardcoded `box-shadow` outside the token scale and the
      already-documented functional conflict/selection rings; only 3
      hardcoded hex colors, all pre-existing and already documented as
      deliberately theme-independent (`.skip-btn`'s guaranteed-contrast
      video overlay text, the SVG mask's alpha-only `#000`, and the
      intro-to-menu black fade) — no real duplicated-color issue found.
      One pre-existing, self-documented near-duplicate in the type scale
      (`--font-size-6: 0.95rem` / `--font-size-8: 1.05rem`) was
      re-confirmed and left alone — reconciling it would ripple into
      `.game-meta-item`/`.start-prompt`/`.menu-nav button` for a 1.6px
      difference, out of scope for a minimal polish pass per this
      phase's own "no major redesign" constraint.
- [x] Button/interactive-state audit: all 7 `cursor: pointer` selectors
      in the stylesheet are covered by the shared interactive-states
      block (hover/press/disabled/focus-visible); `.cell`'s documented
      exception (no scale/transform, brightness-only, edge-to-edge grid)
      re-confirmed as the one deliberate, justified deviation.
- [x] Unused-CSS-class audit: cross-checked every class in `styles.css`
      against `index.html` and `js/**` usage. Two apparent misses
      (`.is-shake`, `.is-value-enter`) were false positives from a naive
      literal-string grep — both are genuinely applied via
      `board-view.js`'s `retriggerAnimation()` helper (remove class →
      force reflow → re-add), not a literal `classList.add('...')` call.
      No actual unused classes found.
- [x] Expensive-animated-property audit: every `transition`/
      `transition-property` declaration (14 found) and `@keyframes` block
      (5 found) animates only `transform`, `opacity`, `background-color`,
      `color`, `border-color`, `box-shadow`, or the discrete `display`/
      `overlay` pair — none animate `width`/`height`/`top`/`left`. One
      real exception found: `cyber-drift` (the Cyber-theme ambient body
      background) animates `background-position`, a paint-triggering
      property, not `transform`. Verified with Playwright's
      `getAnimations()` that it (a) is confirmed running during gameplay
      and (b) causes no measurable input lag — 10 rapid-fire keyboard
      digit entries with the animation active all registered correctly
      in 162ms. Given it's slow (26s), very low-opacity (0.07-0.09),
      already gated behind `prefers-reduced-motion`, pre-dates this
      phase's polish work, and a `transform`-based rewrite would require
      introducing a new `body::before` pseudo-element with its own
      z-index/stacking-context risk for a change with no measured
      benefit — left as-is and documented rather than restructured, per
      this phase's "fix issues caused by the polish work, don't refactor
      unrelated code" constraint.
- [x] Menu-background-leakage audit: confirmed via `getAnimations()`,
      not assumption, that `.menu-sudoku-bg__pattern` has a running
      animation on the menu screen and exactly zero animations the
      instant the game screen is active — `#screen-menu` is genuinely
      `display: none` (not just visually covered), which is what
      actually stops the animation from consuming compositor resources
      off-menu, re-confirming the Phase 14e/14g mechanism still holds.
      The separate Cyber-theme ambient body drift is an unrelated,
      intentional per-theme atmospheric effect that runs on every screen
      by design (not the menu-specific digit pattern this checklist item
      is about) — confirmed not to be an accidental leak.
- [x] Reduced-motion re-confirmation: under `prefers-reduced-motion:
      reduce`, both `.menu-sudoku-bg__pattern` and the Cyber ambient body
      drift report zero running animations.
- [x] Rerender audit: `board-view.js`'s `render()` walks all 81 cells and
      unconditionally sets `textContent`/toggles classes every state
      change — reviewed and confirmed trivially cheap at this scale
      (roughly 500 idempotent DOM writes per keystroke, well under a
      frame budget), not a real performance problem; left unchanged
      rather than adding diffing complexity with no measurable benefit.
- [x] Abrupt-state-change, mobile-overflow, desktop-overexpansion, and
      theme-consistency checklist items re-verified via the existing
      regression suite rather than re-audited from scratch, since prior
      phases (14m dialogs/overlays, 14n responsive pass, 14h/14k
      palette/board work) already covered this ground directly — all
      still pass with zero regressions.
- [x] No source files required changes — the audit found the codebase
      already compliant with every checklist item except the one
      documented, deliberately-left `cyber-drift` finding above; `sw.js`
      `CACHE_NAME` was not bumped since no cached file changed.
- [x] Verified: `npm test` 181/181, `node --check` clean on every JS
      file, and the full existing Playwright regression suite
      (`final-playtest.mjs`, `grid-gap-audit2.mjs`, `sbg-verify.mjs`,
      `board-verify.mjs`, `board-scaling.mjs`, `number-feedback-
      verify.mjs`, `dialog-verify.mjs`, `responsive-audit.mjs`,
      `a11y-contrast2.mjs`, `a11y-verify.mjs`) plus a new
      `final-perf-audit.mjs` covering the menu-background/ambient-drift/
      responsiveness/reduced-motion checks above — all passing, zero
      regressions.

## Phase 14q — Mobile Music: Decouple From AudioContext (Root-Cause Fix) ✅ (2026-08-07)

Direct follow-up to a real-device report: the user tested on Android
Chrome again and background music was still stopping and not resuming,
specifically around pausing/resuming the game and switching screens —
meaning Phase 14d's and 14f's recovery logic (pause listener,
`AudioContext` `statechange` listener, 2s safety-net poll) still wasn't
catching the actual failure mode.

- [x] Diagnosed the likely root cause: music was routed through the
      shared `AudioContext` via `createMediaElementSource` + `GainNode`,
      the same graph SFX synthesis uses. Android Chrome is known to be
      able to silently sever that graph across a suspend/resume cycle
      (screen lock, backgrounding, or just cycling the context fast
      enough while pausing/resuming) — and when only the *graph*
      dies, both `<audio>.paused` and `AudioContext.state` keep
      reporting "fine," which is exactly the blind spot both previous
      fixes had, since they only ever watched those two flags.
- [x] **Fix (`js/audio.js`):** removed music from the Web Audio graph
      entirely — no more `createMediaElementSource`/`GainNode` for music
      tracks. Each track's own `<audio>` element now controls its volume
      directly (`element.volume`), animated via a small
      `requestAnimationFrame`-driven exponential fade (`fadeTrackTo`)
      that replaces the old `AudioParam.setTargetAtTime` ramp. The
      AudioContext is now used only for SFX synthesis, so an
      SFX-context suspend/graph issue can no longer take music down
      with it. `recoverMusicPlayback()` simplified to only check
      `element.paused` — there's no context state left to also resume.
- [x] Fixed a smaller correctness bug found while in this code:
      `updateMusicPlayback()`'s trailing `pause()` (after fading out for
      a disabled/hidden state) fired unconditionally after the fade
      delay, even if music had been re-enabled mid-fade — now guarded
      the same way `setActiveMusicTrack()`'s pause already was.
- [x] **Verification:** `node --check` on every `.js` file, `npm test`
      181/181 (no test touches these internals directly, all still
      green). Headless-Chromium (Playwright) run against the real
      `Sudoku Zen.mp3`/`Logic Flow.mp3` files: new game → Escape to
      pause → Resume → 6 rapid pause/resume toggles in immediate
      succession — zero page errors, and the tracks' final
      paused/volume state matched exactly what the toggle sequence
      should produce (active track audible at the slider volume,
      inactive track silent and paused). Real Android hardware still
      can't be exercised from this sandbox (same limitation noted for
      the intro video in the Phase 1 log and for Phase 14f's
      `AudioContext.suspend()` simulation) — this is a genuine
      architectural fix for a documented failure class, not something
      provable end-to-end without the user's device.

## Phase 14r — Mobile Audio Playtest Verification ✅ (2026-08-07)

Follow-up to Phase 14q: playtest and verify menu/gameplay background
music, SFX, and fade-in/fade-out quality actually work — fix whatever
turns up. Nothing turned up; this phase is the verification record.

- [x] Headless Chromium (Playwright), Pixel 5 device emulation, real
      `Sudoku Zen.mp3`/`Logic Flow.mp3` files, `<audio>`/oscillator
      instrumentation via `page.addInitScript`. Confirmed: smooth
      exponential menu-music fade-in (0 → 0.5 over ~1.8s); true
      overlapping menu↔gameplay crossfade on new-game start and on
      pause-overlay open/close; live volume-slider response mid-fade;
      mute fades to 0 and actually pauses, unmute fades back up; SFX
      oscillators fire on button clicks, cell selection, and digit
      entry. Zero page errors across all runs. Full detail and sampled
      curves in `DEVELOPMENT_LOG.md`.
- [x] No code changes required — Phase 14q's fix already delivers this;
      `MANUAL_QA.md`'s real-Android confirmation item is the only thing
      this sandbox still can't close out.

## Phase 14s — Audio Edge-Case Review: Four Hardening Fixes ✅ (2026-08-07)

Explicit request to review `js/audio.js` against common Web
Audio/mobile-audio bug categories (not just re-playtest the happy path).
Found and fixed four real gaps, none previously observed as an active
symptom but all plausible on real mobile hardware:

- [x] NaN-safe `clamp01()` — an unguarded NaN reaching `<audio>.volume`
      throws and permanently kills that track's `requestAnimationFrame`
      fade loop.
- [x] `playCompletion()` now calls `ensureContextRunning()` before
      reading `audioContext.currentTime`, so a suspended context at
      puzzle-completion time can't collapse the arpeggio's staggered
      notes into one simultaneous chord.
- [x] Transient track errors (network blip / decode hiccup after a track
      already loaded successfully once) now retry via `.load()` instead
      of permanently disabling that track for the session — added a
      `hasLoadedOnce` flag to distinguish "never worked" from "worked,
      then hiccuped."
- [x] `unlockMusicElements()` — a play()-then-immediately-pause() on both
      tracks, called synchronously inside `initAudioEngine()` (itself
      required to run inside the real Start-screen gesture), so the menu
      track's first real playback — which can end up triggered by the
      intro video's non-gesture `ended` event if the player doesn't tap
      Skip — always lands on an already-unlocked element.
- [x] Verified via the Phase 14r Playwright harness (Pixel 5 emulation)
      with play()/pause() call logging added: unlock fires for both
      tracks within the same tick as the gesture, real playback follows
      on an unlocked element, fade-in curve unchanged from baseline.
      `npm test` 181/181, `node --check` clean on every file.

## Phase 16a — On-Screen Undo Button ✅ (2026-08-07)

First of a requested polish/feature series (recommendations tracked in
chat, not a separate doc). `undo()` in `js/game-state.js` was fully
implemented and Ctrl+Z-bound but had no touch/click-accessible control —
a real gap on this app's stated mobile-first priority.

- [x] Added `#btn-undo` to the board toolbar in `index.html` (between
      Erase and Hint), wired to the existing `undo()` in
      `js/ui/controls.js`, with disabled-state logic in
      `js/ui/board-view.js`'s `render()` mirroring the existing `hintBtn`
      pattern (disabled exactly when `undo()` would itself be a no-op).
- [x] Verified via headless Chromium at 320/375/414px: all four toolbar
      buttons stay in one row at full touch-target height, no
      wrapping/overflow. Functional pass confirmed enable/disable
      transitions and that Ctrl+Z still works alongside the button.
      `npm test` 181/181, `node --check` clean, zero page errors.

## Phase 16b — Number-Pad "Digit Complete" Indicator ✅ (2026-08-07)

Second in the requested polish series. A digit whose 9 correct instances
are all already on the board now gets marked complete on the number pad.

- [x] `js/ui/board-view.js`: tallies correct placements per digit inside
      the existing per-cell render loop (no second board pass); toggles
      `.is-complete` and disables the matching number-pad button when a
      digit hits 9 — provably safe to disable, not just cosmetic (see
      `DEVELOPMENT_LOG.md` for the "every remaining cell already
      conflicts" reasoning). Keyboard entry is unaffected.
- [x] `styles.css`: `.number-btn.is-complete` reuses the existing
      `--color-success` token (already used for `.status-chip--success`)
      rather than the generic disabled treatment, plus a higher-
      specificity override so it stays correctly styled while notes mode
      is also on.
- [x] Verified contrast of `--color-success` against `--color-surface`
      programmatically across all 8 theme/mode combinations (both
      gradient stops each for Woodgrain/Paper) — all clear WCAG AA
      4.5:1, tightest 4.83:1.
- [x] Headless Chromium: drove exact digit placement via a dynamic
      `import()` of `js/game-state.js` in-page; confirmed complete/
      disabled/re-enable-on-undo behavior, an unrelated digit staying
      untouched, and the notes-mode override in a non-default theme
      (Cyber/dark). `npm test` 181/181, `node --check` clean, zero page
      errors.

## Phase 16c — Surface High-Score Achievement in the Completion Dialog ✅ (2026-08-07)

Third in the requested polish series. `recordHighScore()` already
returned the achieved rank, but nothing in the UI ever showed it.

- [x] `js/completion.js`: added the pure, tested `findRankInHighScores()`
      helper; `buildShareText()` gained an optional `rank` parameter
      (backward compatible, defaults to `null`).
- [x] `js/ui/completion-dialog.js`: looks up the rank via the
      already-recorded entry (verified the listener-registration order
      in `index.js` guarantees it's saved by the time the dialog reads
      it) and shows a top-3 "New High Score" chip (reusing
      `.status-chip--success` and the High Scores menu's own star icon)
      or a quieter 4th-10th note (reusing `.settings-hint`) — hidden
      entirely if the run didn't place.
- [x] `index.html`/`styles.css`: one new element, one spacing rule — both
      visual treatments it switches between were already fully styled
      and contrast-audited elsewhere.
- [x] Verified via headless Chromium across all three outcomes (rank 1,
      rank 4, no placement) using localStorage-seeded leaderboards and a
      direct `game-state.js` import to drive an instant full solve — all
      matched exactly. `npm test` 187/187 (6 new unit tests), `node
      --check` clean, zero page errors. `MANUAL_QA.md` updated.

## Phase 16d — High-Scores Screen Medal Treatment + "New!" Highlight ✅ (2026-08-07)

Fourth in the requested polish series. Visual hierarchy for the top 3
leaderboard ranks, plus carrying "you just achieved this" through to the
High Scores screen even after navigating away and back through Menu.

- [x] `styles.css`: three medal tiers for ranks 1-3, built entirely from
      pairings already proven safe elsewhere (no new gold/silver/bronze
      colors needing their own contrast audit) — see
      `DEVELOPMENT_LOG.md` for exactly which existing tokens/pairings
      each tier reuses and why.
- [x] `js/high-scores-store.js`: `recordHighScore()` now tracks the most
      recent completion's placement in memory only (never persisted),
      always reassigned including to `null` so a later non-placing game
      correctly clears an earlier placement's stale signal; new
      `consumeLastRecordedHighScore()` reads-and-clears it atomically.
- [x] `js/ui/high-scores-screen.js`: consumes it once per screen visit,
      caches locally so the highlight survives difficulty-tab switching
      within that visit but not a later, separate visit. Ring +
      "New!" text badge (color-paired, not color-only).
- [x] Found and fixed a real bug while verifying: `--cell-ring-width`
      was scoped inside `.board`'s own block, invisible outside it —
      promoted to the global `:root` token block (pure scope-widening,
      zero change for the three existing board consumers, re-verified).
- [x] Verified via headless Chromium across two themes (including a
      gradient-surface one), the tab-switch-persistence /
      separate-visit-clears behavior, and WAI-ARIA tab semantics staying
      untouched. `npm test` 191/191 (4 new tests), `node --check` clean,
      zero page errors. `MANUAL_QA.md` updated.

## Phase 16e — PWA App Icons ✅ (2026-08-08)

Fifth in the requested polish series. `manifest.webmanifest` had
declared `"icons": []` since Phase 10 — never fabricated, per
`CLAUDE.md`'s asset policy, since no icon source art existed. Resolved
without waiting on new artwork: generated from the user's own existing
`logo.png`, with the user approving the design direction and two rounds
of revision before anything was wired in.

- [x] Design iterated live with the user rather than decided
      unilaterally: first checked whether to use the full wordmark or a
      cropped mark (the wordmark is a wide ~3.3:1 lockup, not a
      square-friendly symbol); user asked for a Sudoku-themed mark with
      the branding as a corner accent instead; iterated twice more on
      polish (gradient/shadow/depth) and which part of the logo to
      feature (isolated leaf, then the full INSPIRE wordmark instead).
- [x] Final design: a 3×3 grid tile (two sample digits, rounded corners,
      soft drop shadow, diagonal gradient background in the app's own
      `theme_color` blue) with the full INSPIRE wordmark on a white pill
      badge — sized to the wordmark's own aspect ratio rather than
      cropped into a circle.
- [x] Isolating just the leaf from `logo.png` (an early iteration) turned
      out to be non-trivial — verified programmatically that the leaf
      and the "I" letterform are one continuous fused outline in the
      source art with no natural seam, so a circular mask centered on
      the leaf's own round mass was used instead of a rectangular crop.
      Moot once the design moved to the full wordmark instead, but kept
      as a documented technique in case a future icon needs just the
      leaf again.
- [x] `icon-maskable-512.png`'s safe-zone compliance checked
      programmatically (overlaying the actual 40%-radius safe-zone
      circle and confirming every element's farthest point stays inside
      it with real margin), not eyeballed — caught and fixed one
      composition that poked outside it before finalizing.
- [x] Legibility checked at actual small home-screen sizes (48px, 96px),
      not just at the 512px master — this is what ruled out an earlier
      full-9×9-grid-with-more-numbers direction, which looked sharp at
      512px but turned to visual mush at 48px; the simpler 3×3 grid held
      up at every size tested.
- [x] Wired in: `manifest.webmanifest`'s `icons` array, `sw.js`'s
      `OPTIONAL_ROOT_ASSETS` (+ `CACHE_NAME` bump), a `<link rel="icon">`
      favicon in `index.html`. `icons/README.md` updated to describe the
      generated assets in place of the old "waiting on artwork" state.

## Phase 16f — Per-Difficulty Data Reset ✅ (2026-08-08)

Sixth (optional) item in the requested polish series. The only reset
control before this was the global "Clear Data" (everything, every
difficulty) — added a narrower option scoped to whichever difficulty
tab is currently selected.

- [x] `js/statistics-store.js`/`js/high-scores-store.js`:
      `clearStatisticsForDifficulty`/`clearHighScoresForDifficulty`,
      reusing the existing `byDifficulty[id]` storage shape rather than
      a new schema.
- [x] New shared `js/ui/clear-difficulty-dialog.js` + one new `<dialog>`
      in `index.html`, opened from either Statistics or High Scores with
      screen-specific title/message text — avoids duplicating dialog
      markup/wiring for what's otherwise the identical confirm shape in
      two places.
- [x] A "Clear Stats for This Difficulty" button on Statistics and
      "Clear High Scores for This Difficulty" on High Scores, each
      operating on whatever difficulty tab is currently selected.
- [x] Verified via headless Chromium: clearing Easy's stats leaves
      Intermediate's untouched (and Easy's High Scores untouched);
      clearing Easy's high scores leaves Intermediate's untouched (and
      Easy's Statistics untouched); cancelling either changes nothing;
      the existing global Clear Data flow still clears everything for
      every difficulty, unaffected. `npm test` 195/195 (4 new unit
      tests), `node --check` clean, zero page errors. `MANUAL_QA.md`
      updated.

## Phase 16g — Settings Backup/Restore (Export/Import) ✅ (2026-08-08)

Seventh (optional) item in the requested polish series. A manual local
JSON backup file — no cloud, no account, matching the app's fully local
storage model — covering every `inspireSudoku:v1:*` key: appearance,
gameplay/audio settings, statistics, high scores, and the active game.

- [x] New `js/data-backup.js` (`buildBackup`/`applyBackup`, no DOM
      dependency beyond `localStorage` itself) — deliberately doesn't
      re-validate each key's *content* on import; every store's own
      `load()` already re-validates whatever's in localStorage on every
      read (the same safety net that already protects against
      hand-edited/corrupted localStorage), so a malformed or tampered
      key just gets silently discarded by the existing mechanism the
      next time anything reads it, same as today.
- [x] New `js/ui/data-backup-controls.js` + Export/Import buttons in
      Settings' existing "Your data" section, and a new confirm dialog
      (import is destructive — overwrites current data — so it's gated
      behind an explicit confirmation naming the backup's export date,
      matching every other destructive action in this app). Import
      reloads the page on success, since several store modules cache
      their settings in memory after their own `init()` and only update
      through their own setters — a raw localStorage write alone
      wouldn't reach them until the next load.
- [x] Verified via headless Chromium: full export → clear → import
      round-trip restores identical data; cancelling the import
      confirmation changes nothing; a wrong-app or non-JSON file is
      rejected immediately with a clear message and never opens the
      overwrite confirmation. `npm test` 205/205 (10 new unit tests
      covering export/import including a round-trip, rejecting bad
      input, and ignoring unrecognized extra keys), `node --check`
      clean, zero page errors. `sw.js` `CACHE_NAME` bumped (the two new
      JS files are picked up via the existing runtime cache-fill, but
      `index.js` itself — a core asset — changed too). `MANUAL_QA.md`
      updated.

## Phase 15 — Final QA Against Acceptance Criteria

- [ ] Walk every item in `PROJECT_BRIEF.md` → "v1 Acceptance Criteria" and
      check it off with evidence (manual test note in
      `DEVELOPMENT_LOG.md`).
- [ ] Final `README.md` pass (install/run/deploy instructions accurate).

## Outstanding / Blocked

- [x] `./inspiresoftwareintro.mp4` and `./logo.png` supplied by user
      (2026-07-28) and wired into the Phase 1 intro screen / menu footer.
- [x] App icons resolved without a separately-supplied source image —
      generated (Phase 16e, 2026-08-08) from the existing user-owned
      `logo.png` rather than waiting on new artwork; approved by the
      user before being wired into the manifest. See Phase 16e below.
- [x] `./Sudoku Zen.mp3` (menu music) and `./Logic Flow.mp3` (gameplay
      music) supplied by the user (2026-07-28, Phase 14) via a direct
      GitHub upload merged into this branch; verified real playback with
      no console/page errors, `npm test` 181/181, full regression
      playtest all passing (see `DEVELOPMENT_LOG.md`).
