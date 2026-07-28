# DEVELOPMENT_LOG.md

Running, dated log of what happened each session. Append — don't rewrite
history. Newest entry at the top.

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
