# CLAUDE.md — Working Agreement for This Repo

This file governs how development happens on **Sudoku by Inspire v1**. Read it
before writing any code in this repo.

## Project Identity

A mobile-first, offline-first Sudoku web app. Vanilla JS (ES modules), no
build step, no frameworks, no runtime CDN dependencies. Must run entirely
from static files (works with `file://`-adjacent static hosting and GitHub
Pages, including repo-subpath hosting like `https://user.github.io/repo/`).

## Non-Negotiable Requirements

These constraints are fixed for v1. Do not silently violate them, and flag
to the user if a request conflicts with one:

- Mobile-first layout, polished on desktop too.
- Main entry files at repo root: `index.html`, `styles.css`, `index.js`.
  (`index.js` may import further ES modules from a `js/` subdirectory —
  that's an implementation detail, not a violation.)
- Vanilla JavaScript, ES modules. No frameworks (no React/Vue/etc.).
- The Sudoku board is built with DOM elements + CSS Grid. **No PixiJS or
  canvas-based rendering for the core board.**
- Zero runtime CDN dependencies — everything the app needs at runtime must
  ship in the repo so it works fully offline.
- Root binary assets `./inspiresoftwareintro.mp4` and `./logo.png` are
  owned by the user. **Never fabricate, replace, or overwrite these
  binaries.** If they're missing, say so and stop — don't invent
  placeholder video/image binaries in their place.
- Flow: Touch/Click-to-Start screen → intro video (with Skip) → main menu.
- Main menu footer displays `logo.png`.
- Theme packs: Cyber, Woodgrain, Paper, Light.
- Color modes: System, Dark, Light (independent of theme pack).
- Difficulties: Easy, Intermediate, Advanced, Insane.
- Local autosave, Continue Game, Settings, Statistics, Best Times, High
  Scores — all persisted locally (no backend).
- Full keyboard, mouse, and touch input support.
- Background music support + lightweight UI sound effects (both mutable).
- Offline-capable via a web app manifest + service worker.
- Must work when hosted at a GitHub Pages subpath — no absolute root paths
  (`/foo.js`); use relative paths (`./foo.js`) throughout.
- Accessible: visible focus states, ARIA labels on interactive elements,
  `prefers-reduced-motion` support, sufficient color contrast in every
  theme/mode combination.

## Learning Contract

This is a teaching project. The user is learning by building alongside the
assistant. Every phase follows this pattern:

1. **Before editing:** summarize the phase's goal and which files will be
   touched.
2. **Implement the foundation** for the phase — most of the scaffolding,
   wiring, and boilerplate — but leave **one meaningful checkpoint**
   (roughly 10–20 minutes of focused coding) for the user to write
   themselves.
3. **Mark the checkpoint** clearly with a `TODO(USER)` comment at the exact
   spot, and separately state:
   - the exact file/function involved,
   - the requirements for what it must do,
   - the test/acceptance criteria for "done."
4. **Stop.** Do not complete the checkpoint on the user's behalf, even
   partially, even as a "draft they can replace." Wait for them to return.
5. **On return:** review their code constructively — explain any bugs in
   plain language (what breaks, why, under what input) before proposing a
   fix. Then finish out the rest of that phase.
6. **After every completed phase:** update `TASKS.md` (check off items) and
   append a dated entry to `DEVELOPMENT_LOG.md`.

## Code Style

- Small functions, one responsibility each.
- Descriptive names over comments explaining *what*.
- Comments only for *why* — non-obvious constraints, workarounds, invariants.
- No giant unexplained code dumps — introduce code in reviewable chunks.
- Never rewrite unrelated working code as a drive-by "improvement."
- No speculative abstraction — build what the current phase needs.

## After Every Edit

- Run whatever checks exist (lint/tests/manual load) and report results.
- Summarize which files changed and why, in plain language.

## File Map (for orientation — see `PROJECT_BRIEF.md` for full architecture)

- `index.html` / `styles.css` / `index.js` — app entry points.
- `js/` — ES modules imported by `index.js` (screens, sudoku engine, UI,
  audio, theme, storage, service-worker registration).
- `manifest.webmanifest`, `sw.js` — offline/PWA support.
- `PROJECT_BRIEF.md` — product scope and acceptance criteria.
- `TASKS.md` — phased build checklist (source of truth for progress).
- `DEVELOPMENT_LOG.md` — dated running log of what happened each session.
