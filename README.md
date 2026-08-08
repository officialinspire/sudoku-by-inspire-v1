# Sudoku by Inspire v1

A polished, offline-first Sudoku web app by INSPIRE. Mobile-first,
installable as a PWA, and built with plain HTML/CSS/JS — no frameworks,
no build step, no runtime CDN dependencies.

> **Status:** Feature-complete for v1 and passing its full automated test
> suite. See `TASKS.md` for the phased build checklist and current
> progress, and `MANUAL_QA.md` for the browser-level QA checklist to run
> before each release.

## Overview

Sudoku by Inspire is a single-page app: one `index.html`, no server, no
account. Everything — the puzzle engine, four theme packs, statistics,
high scores, audio, and offline support — runs entirely in the browser
and persists to `localStorage` on-device. Open it once online, and it
keeps working with the network off.

**Feature highlights:**

- Touch/click-to-start screen → skippable intro video → main menu.
- Real Sudoku puzzle generation (not canned puzzles) at four
  difficulties, each with a guaranteed **unique** solution.
- The board is rendered with plain DOM elements and CSS Grid — no
  canvas, no PixiJS.
- Four visual theme packs × three color modes (see [Themes and
  modes](#themes-and-modes)).
- Full keyboard, mouse, and touch controls (see [Controls](#controls)).
- Local autosave with Continue Game, notes/pencil-marks, an on-screen
  Undo button (also `Ctrl`/`Cmd`+`Z`), hints, and pause. The number pad
  marks a digit complete once all 9 correct instances are on the board.
- Statistics, best times, and a top-10 high-score list per difficulty —
  the completion dialog surfaces a "New High Score" banner when a run
  places, the leaderboard gives its top 3 a medal treatment, and either
  can be reset per-difficulty independently of the global data reset.
- Export/import a local backup file covering every setting, statistic,
  high score, and saved game — no account, no cloud, just a JSON file
  you keep (see [Local-Data Behavior](#local-data-behavior)).
- Background music and short synthesized UI sound effects, each
  independently mutable, plus an optional vibration toggle.
- Installable and fully offline-capable via a web app manifest, app
  icons, and a service worker.
- Accessible: keyboard-navigable, ARIA-labeled board cells, visible
  focus states, `prefers-reduced-motion` support, and WCAG AA color
  contrast in every theme/mode combination — verified with a real
  automated accessibility scan (`axe-core`), not just asserted; see
  `DEVELOPMENT_LOG.md`'s Phase 15 entry.

## Local Development

No build step, no dependencies to install. Serve the repo root with any
static file server — a bare `file://` open will **not** work, since ES
module imports and the service worker both require a real HTTP origin.

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static server works equally well (`npx serve`, VS Code's Live
Server extension, `caddy file-server`, etc.) — the app has no
server-side requirements at all.

While developing, keep devtools open to the Console (to catch any
runtime errors) and consider devtools → Application → Service Workers →
"Update on reload" so you're never fighting a stale cached version of
your own in-progress changes (see [Cache reset and update
instructions](#cache-reset-and-update-instructions) for the full story).

## Controls

| Action | Mouse/Touch | Keyboard |
|---|---|---|
| Select a cell | Click / tap the cell | Arrow keys move selection |
| Enter a digit | Tap a number-pad button | `1`–`9` |
| Erase a cell | Tap "Erase" | `Backspace` or `Delete` |
| Toggle notes mode | Tap "Notes: On/Off" | `n` |
| Undo | — | `Ctrl`/`Cmd` + `Z` |
| Use a hint | Tap "Hint" (confirms first) | — |
| Pause / Resume | Tap the pause overlay's Resume button | `Escape` |
| Open Settings | Tap the gear icon / "Settings" | Tab to it, `Enter` |

All touch targets are sized to at least 44×44px. Every interactive
element has a visible focus outline and is reachable in a logical Tab
order; dialogs trap focus while open and restore it to whatever opened
them on close.

## Themes and Modes

Four independent theme packs — **Cyber** (dark technical interface,
restrained neon accents), **Woodgrain** (warm natural browns),
**Paper** (off-white tactile paper), and **Light** (the default) — each
crossed with **System**, **Dark**, or **Light** color mode (System
follows the OS setting live). Switch either from Settings; both persist
across reloads and apply instantly with no page refresh.

## Assets

Four binary assets are owned by the project maintainer, already present
in this repo, and must never be fabricated or overwritten by anyone
editing this codebase (see `CLAUDE.md`'s asset policy):

- `./inspiresoftwareintro.mp4` — the intro video played after the start
  screen (currently silent — no audio track).
- `./logo.png` — displayed on the Start screen and in the main-menu
  footer.
- `./Sudoku Zen.mp3` — background music that fades in on the main menu
  (and Statistics/High Scores, which share the same "menu" music
  context) and loops there.
- `./Logic Flow.mp3` — background music that fades in when a new game
  starts, loops for the rest of that game, and fades out on completion.

The app degrades gracefully if any of the four is ever missing (skipping
the intro screen, hiding the logo, or simply staying silent for whichever
music track is absent) rather than breaking. `js/audio.js` detects and
loops each music track independently, respects the Music volume/mute
setting, and requires no code changes if a file is ever swapped out.
Either music file's absence never causes an error, a broken install, or
blocked service worker installation (see `sw.js`'s optional-asset
precaching).

PWA icons (192×192, 512×512, and a maskable 512×512) live in `icons/` —
generated from `logo.png` rather than a separately-supplied source image
(a 3×3 Sudoku-grid mark in the app's own `theme_color` blue, with the
full INSPIRE wordmark as a badge; see `icons/README.md` and
`DEVELOPMENT_LOG.md`'s Phase 16e entry for how, and why that's a design
decision rather than a mechanical rebuild if it ever needs to change).

## Tests

Automated tests use Node's built-in test runner — no test framework
dependency to install:

```bash
npm test
```

This runs every `*.test.js` file under `js/` (205 tests across 63
suites as of this writing, covering the Sudoku engine, puzzle generator,
game state, scoring, and every persisted store) in a few seconds. See
`DEVELOPMENT_LOG.md`'s Phase 12 entry for what's covered here versus
what belongs in manual browser QA instead.

For everything a unit test can't reach — real video/audio playback, the
real service-worker lifecycle, real viewport rendering, real
screen-reader behavior — see **`MANUAL_QA.md`**, a step-by-step browser
checklist covering fresh install through data reset.

## PWA / Offline Verification

Quick check that offline support is actually working:

1. Load the app once with the network on (so the service worker
   installs — confirm in devtools → Application → Service Workers that
   it shows "activated and is running").
2. Click through to the main menu at least once, so the rest of the JS
   module graph gets runtime-cached (see `sw.js`'s comment on why only a
   minimal shell is precached at install time).
3. Set devtools → Network → "Offline" (or actually disconnect), then
   reload. The app should load and be fully playable.
4. To confirm installability: look for the browser's install/"Add to
   Home Screen" prompt, or check devtools → Application → Manifest
   shows no errors.

See `MANUAL_QA.md` §10 for the full offline-reload checklist.

## Local-Data Behavior

Everything — saved games, statistics, high scores, and every setting —
is stored **only** in this browser's `localStorage`, under versioned
keys prefixed `inspireSudoku:v1:`. There is no account, no server, and
no data ever leaves the device. Clearing the browser's site data for
this app removes everything permanently and cannot be undone from
within the app; use Settings → Clear Data for a controlled, in-app reset
instead (it explains exactly what it will and won't remove before you
confirm), or Statistics/High Scores' own "Clear ... for This Difficulty"
buttons for a narrower reset scoped to just one difficulty.

Settings → Export Data downloads a JSON backup of everything above;
Import Data restores from one (after a confirmation, since it overwrites
whatever's currently stored) — the closest thing this app has to a
"move to a new device" or "just-in-case backup" feature, without adding
an account or a server to do it.

## Cache Reset and Update Instructions

The service worker (`sw.js`) uses one explicitly-versioned cache name
(see the `CACHE_NAME` constant near the top of that file for the current
version — deliberately not restated here as a specific number, since
that would just go stale the next time it's bumped). Nothing about cache
invalidation is automatic — this is deliberate, documented in `sw.js`'s
own header comment:

- **To ship an update that existing visitors actually pick up**: bump
  the `CACHE_NAME` version suffix in `sw.js` (`...-v1` → `...-v2`) any
  time a core app-shell file changes. On their next visit, the browser
  detects the byte-different `sw.js`, installs the new version
  alongside the old one, and once it activates, an in-page "An updated
  version is available" banner appears with a Refresh button. The
  `activate` handler deletes every cache that isn't the current
  `CACHE_NAME` automatically — bumping the version is the entire update
  mechanism, no separate cleanup step needed.
- **To force a hard reset during development** (stale cache fighting
  your changes): devtools → Application → Service Workers →
  Unregister, and/or Application → Storage → "Clear site data." Chrome's
  "Update on reload" checkbox (same panel) avoids needing to do this
  repeatedly while actively developing.

## GitHub Pages Deployment

This app's static, no-build-step architecture means GitHub Pages'
built-in "deploy from a branch" is the simplest reliable option — no
GitHub Actions workflow is necessary, and none is included, since there
is nothing to build. Every asset reference in this repo (HTML, CSS, JS
imports, the manifest, and the service worker) is a relative path
specifically so this works correctly at a **repository subpath**
(`https://<user>.github.io/sudoku-by-inspire-v1/`), not just a custom
domain's root.

### Exact steps (GitHub web UI)

1. Push this repo's default branch (or merge this branch into it) to
   GitHub, if it isn't already there.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a
   branch**.
4. Under **Branch**, select your default branch (e.g. `main`) and the
   **`/ (root)`** folder, then **Save**.
5. GitHub Pages builds and publishes the site — this typically takes
   under a minute. The Pages settings page will show the live URL once
   ready, in the form `https://<owner>.github.io/sudoku-by-inspire-v1/`.
6. Open that URL and spot-check `MANUAL_QA.md`'s checklist, especially
   §10 (offline reload) and §12 (320px/desktop layouts) — a real
   deployment is worth a real device pass, not just this repo's local
   testing.

### Optional CLI equivalent

The same source/branch/folder settings can be set with the GitHub CLI
instead of the web UI, if you prefer:

```bash
gh api repos/{owner}/{repo}/pages -X POST \
  -f source[branch]=main -f source[path]=/
```

(Use `-X PUT` instead of `-X POST` if Pages is already enabled and
you're changing its source.) **Nothing in this repository runs this
command automatically** — enabling Pages is a repository-settings
change, and this project's working agreement (`CLAUDE.md`) requires
explicit human action for that, not something an assistant does on your
behalf.

### `.nojekyll`

A `.nojekyll` file at the repo root tells GitHub Pages to skip its
default Jekyll processing step. This repo has no Jekyll content and
doesn't need Jekyll's templating, but Jekyll's processing also
specifically ignores files/folders starting with an underscore, and
skipping it entirely is the standard, zero-downside precaution for any
plain static site on Pages — slightly faster deploys, and no surprises
if a future file ever happens to start with `_`.

### If you ever do need a build step

If a future change genuinely requires a build step (a bundler, a
TypeScript compile, etc. — not needed today, and CLAUDE.md's
"no build step" requirement means this should be a deliberate,
discussed decision, not an incidental one), the smallest justified
addition would be a single GitHub Actions workflow using
`actions/configure-pages` + `actions/upload-pages-artifact` +
`actions/deploy-pages` to publish the *build output* directory instead
of the repo root — not a general-purpose CI pipeline. Until that's
actually true, adding one would be unjustified complexity for a
zero-build static site.

## Connecting to inspireclothing.art

How to surface this app from **www.inspireclothing.art** depends on
that site's own platform (Shopify, Squarespace, a static site, etc.),
which isn't something to assume from this repo alone. Three options, in
order of preference:

1. **Direct link (preferred, works everywhere)**: a plain `<a href>` or
   nav-menu link from inspireclothing.art to the GitHub Pages URL
   (`https://<owner>.github.io/sudoku-by-inspire-v1/`, or a custom
   domain — see below). Requires no integration work on either side,
   full-page navigation, no cross-origin restrictions, and the game
   gets its own real URL that's shareable, bookmarkable, and installable
   as its own PWA. This is the right default unless there's a specific
   reason the game needs to appear *embedded inside* an
   inspireclothing.art page.
2. **Subdomain or a custom path** (e.g. `sudoku.inspireclothing.art` or
   `inspireclothing.art/sudoku`): GitHub Pages supports a custom domain
   for this repo (Settings → Pages → Custom domain) — see [Custom
   domain, later](#custom-domain-later) below. A *path* under the main
   domain (as opposed to a subdomain) generally requires the main site's
   own hosting/CDN to proxy or rewrite that specific path to GitHub
   Pages, which depends entirely on what inspireclothing.art runs on —
   confirm that platform supports reverse-proxying or URL rewrites
   before committing to this option.
3. **`<iframe>`, only if the site platform requires embedding in place**
   (e.g. a page builder that only supports embedding a URL inside the
   existing site chrome, rather than linking out): works, but with real
   costs specific to this app — a service worker's scope and a PWA
   manifest's install prompt both behave inconsistently or are
   suppressed entirely inside a third-party iframe in most browsers, so
   offline support and installability (this app's Phase 10 work) would
   be degraded or lost. Some browsers also block third-party iframe
   storage access by default, which would silently break autosave/
   statistics/high scores for embedded visitors. Use this option only
   when the platform genuinely requires it, not as a default — and if
   used, `PROJECT_BRIEF.md`'s offline-first acceptance criteria should
   be re-verified specifically in that iframe context, since it wasn't
   built or tested with iframing in mind.

### Custom domain, later

GitHub Pages can serve this same repo from a custom domain (or
subdomain) instead of `github.io`, without touching any app code — the
app's relative-path architecture already works identically at any
origin/subpath combination:

1. Add a `CNAME` file at the repo root containing just the domain (e.g.
   `sudoku.inspireclothing.art`), or set it via Settings → Pages →
   Custom domain (GitHub creates the file for you).
2. At your DNS provider for `inspireclothing.art`, add a `CNAME` record
   for the `sudoku` subdomain pointing at `<owner>.github.io` (for a
   subdomain), or the appropriate `A`/`ALIAS` records GitHub's docs
   specify for an apex/root domain.
3. Wait for DNS propagation, then enable "Enforce HTTPS" in the same
   Pages settings once GitHub shows the certificate as provisioned.

This is a DNS + repository-settings change on the real, live domain —
exactly the kind of "change remote repository settings" action this
project's working agreement requires explicit human action for, not
something to do speculatively.

## Suggested Repository Topics

For discoverability on GitHub (Settings → General → Topics):

`sudoku`, `javascript`, `pwa`, `offline-first`, `indie-game`, `inspire`

## Troubleshooting

- **Blank page / console errors about modules**: you almost certainly
  opened `index.html` directly via `file://` instead of a local HTTP
  server. See [Local Development](#local-development).
- **Intro video doesn't play, jumps straight to the menu**: either the
  video file is missing (expected graceful fallback — check the repo
  root for `inspiresoftwareintro.mp4`) or the browser couldn't decode
  its codec (rare on real browsers; confirmed to happen in this
  project's own headless CI/sandbox environment — see
  `DEVELOPMENT_LOG.md`'s Phase 1 and Phase 9 entries). Either way, the
  app should recover on its own into the main menu, not get stuck.
- **No sound**: check Settings → Audio & Haptics — SFX/Music might be
  muted or their volume near zero. Also note audio only initializes
  after the very first Touch/Click-to-Start gesture (a browser
  requirement, not a bug) — if you scripted around that first click,
  audio genuinely never unlocks.
- **"Continue Game" is greyed out** even though you were mid-puzzle:
  either no game was in progress when you left (it only saves an
  *unfinished* game — a completed one has nothing to continue), or the
  save was corrupt/incompatible and was safely discarded rather than
  crashing the app (see `js/active-game-store.js`'s validation).
- **Offline reload shows a browser error page instead of the app**: the
  service worker never got a chance to install (you have to load the
  app online at least once first — see [PWA / Offline
  Verification](#pwa--offline-verification)), or it's disabled in your
  browser/devtools settings.
- **I changed a file and the browser won't show my update**: the
  service worker is serving its cached copy. See [Cache reset and
  update instructions](#cache-reset-and-update-instructions) — either
  bump `CACHE_NAME` or hard-reset via devtools during development.
- **The app looks broken at `inspireclothing.art/sudoku-by-inspire-v1`
  or any subpath**: every asset reference in this repo is a relative
  path specifically so this doesn't happen (see `TASKS.md`'s Phase 13
  path audit and `DEVELOPMENT_LOG.md` for the exact verification) — if
  you do hit this, it's most likely an external proxy/rewrite rule
  serving a file with a modified or incorrect path, not the app itself.

## Project Documentation

- [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) — product scope, requirements,
  and v1 acceptance criteria.
- [`TASKS.md`](./TASKS.md) — phased build checklist and current progress.
- [`DEVELOPMENT_LOG.md`](./DEVELOPMENT_LOG.md) — dated running log of
  development sessions, including the reasoning behind every notable
  design decision.
- [`MANUAL_QA.md`](./MANUAL_QA.md) — manual browser QA checklist.
- [`icons/README.md`](./icons/README.md) — required PWA icon assets and
  how to wire them in once supplied.
- [`CLAUDE.md`](./CLAUDE.md) — working agreement / conventions for
  developing this repo (including the learning-contract workflow used to
  build it phase by phase).

## License

TBD.
