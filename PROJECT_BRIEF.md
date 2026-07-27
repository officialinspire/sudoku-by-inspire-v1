# Project Brief — Sudoku by Inspire v1

## Overview

A polished, offline-first Sudoku web app built with vanilla HTML/CSS/JS
(ES modules, no frameworks, no build tooling, no runtime CDN dependencies).
Mobile-first, works fully offline after first load, installable as a PWA,
and deployable to GitHub Pages — including when hosted at a repository
subpath (e.g. `https://officialinspire.github.io/sudoku-by-inspire-v1/`).

## Goals

- Deliver a genuinely pleasant Sudoku experience: smooth board interaction,
  real puzzle generation (not canned puzzles), and enough polish (themes,
  audio, stats) that it feels like a real product, not a demo.
- Work identically online and offline. Once loaded once, it should be fully
  playable with no network at all.
- Be simple enough to run by opening the folder in any static file server
  — no npm install, no bundler, no transpile step.
- Be a teaching vehicle: architecture should be legible to someone learning
  vanilla JS app structure (clear module boundaries, no magic).

## Non-Goals (v1)

- No backend, accounts, or cloud sync — all persistence is local
  (`localStorage`/`IndexedDB` as needed).
- No multiplayer or leaderboard sharing across devices.
- No native app packaging (iOS/Android) — web/PWA only.
- No build pipeline (no bundler, no TypeScript compile step, no CSS
  preprocessor requiring a build).

## Core Product Flow

1. **Touch/Click to Start** — a minimal splash screen; any tap/click/keypress
   advances.
2. **Intro video** — plays `./inspiresoftwareintro.mp4`; a visible **Skip**
   control is always available (and required for accessibility/impatience).
3. **Main menu** — New Game (with difficulty picker), Continue Game (only
   enabled if a saved game exists), Statistics, Settings. Footer displays
   `./logo.png`.
4. **Game screen** — the Sudoku board, timer, mistake counter (if enabled),
   number pad, notes toggle, undo, hint (if in scope), pause.
5. **Settings** — theme pack, color mode, sound/music toggles + volume,
   input preferences, reduced-motion opt-in override, data reset.
6. **Statistics** — best times per difficulty, games played/won, streaks,
   high scores.

## Technical Constraints (see `CLAUDE.md` for the full non-negotiable list)

- `index.html`, `styles.css`, `index.js` at repo root; vanilla ES modules.
- Board = DOM + CSS Grid. No canvas/PixiJS for the board.
- No runtime CDN calls (fonts, icon libraries, JS libs) — everything ships
  in-repo so offline mode never breaks.
- Relative paths everywhere (GitHub Pages subpath hosting).
- Web app manifest + service worker for installability and offline caching.
- Accessibility: focus-visible states, ARIA labeling, `prefers-reduced-motion`
  support, WCAG AA-level contrast across all theme/color-mode combinations.

## Themes & Modes

- **Theme packs** (visual skin — palette, textures/borders, typographic
  feel): Cyber, Woodgrain, Paper, Light.
- **Color modes** (luminance — independent axis from theme pack): System,
  Dark, Light.
- Both persist locally and apply instantly without reload.

## Difficulties

Easy, Intermediate, Advanced, Insane — implemented via the puzzle
generator's clue-count / technique-difficulty targets, not just fewer
clues at random.

## Persistence Scope (all local, no backend)

- Autosave of in-progress game (board state, notes, timer, mistakes).
- "Continue Game" resumes the autosaved game.
- Settings (theme, color mode, audio, input prefs).
- Statistics: games played, games won, win streak.
- Best times per difficulty.
- High scores (score formula TBD in the relevant phase — likely
  time + mistake-penalty based, tracked per difficulty).

## Input Support

- **Keyboard:** arrow keys/WASD to move selection, number keys to place
  digits, a modifier or dedicated key for pencil-mark/notes mode, Delete/
  Backspace to clear, Escape to deselect/pause.
- **Mouse:** click cell to select, click number pad to place, drag not
  required.
- **Touch:** tap cell to select, tap number pad to place; targets sized for
  touch (≥44px hit areas).

## Audio

- Background music: loopable, mutable, low file size (offline bundle
  concern).
- UI SFX: short, lightweight (cell select, digit place, error, win, button
  tap). Mutable independently from music.

## Assets Owned by the User (do not fabricate)

- `./inspiresoftwareintro.mp4` — intro video. **Not present in repo yet.**
- `./logo.png` — used in main-menu footer. **Not present in repo yet.**

Until these are supplied, the app should degrade gracefully (e.g. skip
straight past the intro screen if the video file is missing, and omit/hide
the footer logo rather than showing a broken image) — this graceful
degradation will be implemented in the relevant phase, not assumed away.

## v1 Acceptance Criteria

The app is "v1 done" when all of the following are true:

1. Opening `index.html` via a static server shows Start → (video/skip) →
   Main Menu, with no console errors.
2. A puzzle can be generated at each of the 4 difficulties, is solvable and
   has a unique solution, and can be played to completion via keyboard,
   mouse, and touch.
3. Progress autosaves; reloading the page and choosing "Continue Game"
   restores the exact board/notes/timer state.
4. Settings changes (theme pack, color mode, audio) persist across reloads
   and apply without a full page reload.
5. All 4 theme packs × 3 color modes render with correct contrast and no
   layout breakage, at mobile and desktop widths.
6. Statistics/best-times/high-scores update correctly after a completed
   game and persist across reloads.
7. Keyboard-only play is fully possible end-to-end (menu navigation
   through solving a puzzle), with visible focus states throughout.
8. With devtools network set to offline, a previously-loaded app still
   loads and is fully playable (service worker cache verified).
9. The app is installable as a PWA (manifest valid, icons present, served
   over the required scope).
10. The app works correctly when hosted at a GitHub Pages project subpath
    (no absolute-root asset paths anywhere).
11. No runtime network requests to third-party CDNs at any point.
12. Lighthouse (or equivalent) accessibility check shows no critical
    violations; reduced-motion is respected.

## Out of Scope for v1 (candidate v2 ideas — do not build now)

- Daily challenge / seeded puzzle sharing.
- Cloud sync across devices.
- Hint system with technique explanations (beyond a possibly simple v1
  hint, if time allows — TBD during the relevant phase, not assumed).
- Multiplayer/race modes.
