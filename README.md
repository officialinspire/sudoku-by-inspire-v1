# Sudoku by Inspire v1

A polished, offline-first Sudoku web app by INSPIRE. Mobile-first, installable
as a PWA, and built with plain HTML/CSS/JS — no frameworks, no build step, no
runtime CDN dependencies.

> **Status:** Planning complete, application code not yet started. See
> `TASKS.md` for the phased build plan and current progress.

## Features (planned for v1)

- Touch/click-to-start screen → skippable intro video → main menu.
- Real Sudoku puzzle generation (not canned puzzles) at four difficulties:
  Easy, Intermediate, Advanced, Insane.
- Sudoku board rendered with plain DOM elements and CSS Grid.
- Four visual theme packs (Cyber, Woodgrain, Paper, Light) crossed with
  three color modes (System, Dark, Light).
- Full keyboard, mouse, and touch controls.
- Local autosave with Continue Game, settings, statistics, best times, and
  high scores — all stored on-device, no account or backend required.
- Background music and lightweight UI sound effects, independently mutable.
- Fully offline-capable via a web app manifest and service worker.
- Accessible: keyboard-navigable, ARIA-labeled, visible focus states,
  `prefers-reduced-motion` support, and sufficient color contrast.

## Tech Stack

- Vanilla JavaScript (ES modules) — no frameworks.
- Plain CSS (custom properties for theming) — no preprocessor.
- No bundler, no build step, no `node_modules` required to run.
- No runtime third-party CDN dependencies — everything ships in-repo so the
  app works fully offline after first load.

## Running Locally

No build step is required. Serve the repo root with any static file server
(a plain `file://` open won't work for the service worker/module scripts).
For example, from the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static server works equally well (e.g. `npx serve`, VS Code's Live
Server extension, etc.) — the app has no server-side requirements.

## Deploying to GitHub Pages

This app is built to work correctly at a project subpath (e.g.
`https://officialinspire.github.io/sudoku-by-inspire-v1/`), so no absolute
root-relative paths are used anywhere — all asset references are relative.

Once the app is built out, enable GitHub Pages for this repository
(Settings → Pages) pointing at the branch/folder that holds the built
static files, and the app will be reachable at the Pages subpath with no
additional configuration.

## Required Local Assets

Two binary assets are owned by the project maintainer and must be added to
the repo root before those features are fully functional:

- `./inspiresoftwareintro.mp4` — the intro video played after the start
  screen.
- `./logo.png` — displayed in the main-menu footer.

The app is designed to degrade gracefully if these are absent (skipping the
intro screen / hiding the footer logo) rather than breaking, but they're
required for the intended v1 experience.

## Project Documentation

- [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) — product scope, requirements,
  and v1 acceptance criteria.
- [`TASKS.md`](./TASKS.md) — phased build checklist and current progress.
- [`DEVELOPMENT_LOG.md`](./DEVELOPMENT_LOG.md) — dated running log of
  development sessions.
- [`CLAUDE.md`](./CLAUDE.md) — working agreement / conventions for
  developing this repo (including the learning-contract workflow used to
  build it phase by phase).

## License

TBD.
