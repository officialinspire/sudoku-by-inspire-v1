# MANUAL_QA.md — Manual Browser QA Checklist

Everything in this file is browser-behavior that automated `node:test`
unit tests either can't exercise at all (real `<video>`/`<audio>` codec
decoding, real service-worker install/update lifecycle, real viewport
rendering, real screen-reader announcement) or can only exercise
indirectly (see `DEVELOPMENT_LOG.md`'s Phase 12 entry for exactly which
scenarios below already have a Playwright-driven equivalent, and which
are genuinely untested outside a real browser). Run this against a real
static file server — `python3 -m http.server 8000` from the repo root,
then open `http://localhost:8000/` — never via a bare `file://` open,
which breaks the service worker and ES module imports.

Check items off as `[x]` as you verify them. A ✅/❌ column isn't
included on purpose — this file is meant to be re-run and re-checked
each release, not a one-time signed-off record; use `DEVELOPMENT_LOG.md`
to record dated results of an actual QA pass if you want that history.

---

## 1. Fresh first launch

- [ ] Clear all site data first (devtools → Application → Storage →
      "Clear site data", or a private/incognito window) so this is a
      genuinely first-ever visit.
- [ ] Load the app. The Start screen appears immediately — brand
      heading, "Tap, click, or press any key to begin" prompt, no
      console errors.
- [ ] No flash of unstyled content or wrong theme on load (the inline
      anti-FOUC script in `index.html`'s `<head>` should apply the
      saved — or default Light — theme before first paint).

## 2. Touch/Click to Start

- [ ] Clicking anywhere on the Start screen advances to the intro video
      (or straight to the menu if the video is unsupported/missing —
      see §3).
- [ ] Pressing any key (not just Enter/Space) also advances, from a
      fresh reload.
- [ ] Tapping on a real touchscreen device advances the same way.
- [ ] This same gesture unlocks audio: after advancing, open Settings
      and confirm the Music/SFX volume sliders and toggles are
      interactive (see §9) — if audio never initialized, `playClick()`
      on any button press would silently do nothing, which is the
      correct fallback, not a bug, if the browser genuinely blocks
      autoplay — but on a normal desktop/mobile browser you should
      hear a click on every button press.

## 3. Intro playback, Skip, and missing/corrupt media fallback

- [ ] With `./inspiresoftwareintro.mp4` present and playable, the video
      plays automatically after Start, with sound, and the Skip button is
      visible and legible in the top-right corner regardless of what's
      currently showing in the video frame underneath it (checked
      across at least 2 theme packs — the Skip button doesn't use theme
      tokens, so this should hold everywhere, but confirm at least
      once).
- [ ] Clicking Skip immediately stops the video and shows the main menu.
- [ ] Letting the video play to the end also advances to the main menu
      on its own (the `ended` event).
- [ ] **Missing video file**: temporarily rename/remove
      `inspiresoftwareintro.mp4`, reload, click Start. The app should
      skip straight to the main menu with no error dialog, no stuck
      screen, and no console exception (only the video element's own
      `error` event, handled gracefully). Restore the file afterward.
- [ ] **Slow connection** (Hardening Phase 1): clear site data,
      devtools → Network → throttle to "Slow 3G", reload. The Network
      panel should show **no** `inspiresoftwareintro.mp4` request until
      you tap Start (the video is `preload="none"`). After the tap the
      intro either starts, or — if it can't start within ~4 s, or
      freezes waiting on data for ~4 s — the app moves on to the menu by
      itself. Skip works the whole time.
- [ ] **iOS Safari, second visit** (Hardening Phases 1–2): load once,
      reload once (so the service worker is installed and controlling
      the page), then fully close and reopen the app. The intro video
      and both music tracks must still play. On that second visit they
      come from the service worker's cache, which since Hardening Phase
      2 answers Safari's byte-range requests with proper `206` slices;
      if media works on the first visit but not the second, check
      devtools (Safari Web Inspector → Network) for the media requests'
      status codes.
- [ ] **Missing logo**: temporarily rename/remove `logo.png`, reload to
      the main menu. The footer area shouldn't show a broken-image icon
      or console error — a `<img>` with a failed `src` degrading
      silently is acceptable; if it looks broken, that's a real bug.
      Restore the file afterward.
- [ ] Note: in some headless/CI Chromium builds the video may fail to
      decode its codec even though the file is well-formed (confirmed
      in this project's own sandboxed dev environment — see the Phase 1
      and Phase 9 `DEVELOPMENT_LOG.md` entries). If Skip/auto-advance
      both work correctly despite a decode failure, that's the intended
      graceful-degradation behavior, not a bug — but this should be
      spot-checked in at least one real desktop and one real mobile
      browser where the codec is fully supported, to confirm the video
      actually plays under normal conditions too.

## 4. Every difficulty

For **each** of Easy, Intermediate, Advanced, and Insane:

- [ ] New Game → select the difficulty → Start generates a puzzle within
      a few seconds (Insane may briefly show "Generating puzzle…
      (attempt N/M)" — that's expected, not a hang).
- [ ] The generated puzzle's clue count and visual difficulty feel
      roughly consistent with the label (Insane should look
      noticeably sparser than Easy).
- [ ] The puzzle is solvable and has no way to observe two different
      correct solutions accepted for the same cell (this is guaranteed
      by `generatePuzzle`'s own uniqueness check at generation time —
      see `js/sudoku-generator.test.js` — but worth confirming the
      *displayed* puzzle matches what was actually generated by
      solving at least one full puzzle per difficulty end to end).

## 5. Input, notes, erase, undo, hint, pause

- [ ] **Mouse**: click a cell to select it, click a number-pad digit to
      place it. Clicking a fixed clue does nothing (no selection change
      to editable state).
- [ ] **Touch**: tap a cell, tap a digit — same behavior, no accidental
      double-registration on a single tap.
- [ ] **Keyboard**: arrow keys move selection; a digit key (1-9) enters
      a value; Backspace/Delete erases; `n` toggles notes mode; Escape
      pauses (or resumes, if already paused).
- [ ] **Notes mode**: toggling "Notes: On" then pressing a digit toggles
      a small candidate mark instead of a real entry; pressing the same
      digit again removes just that mark; other marks in the same cell
      are untouched.
- [ ] **Peer-note cleanup**: pencil-mark the same candidate digit into
      a few cells that share a row/column/box with a cell you're about
      to fill, then place that real value in the shared cell — the
      candidate mark should disappear from every peer it's no longer
      possible in, automatically.
- [ ] **Erase**: clears both the entry and any notes in the selected
      cell; does nothing on a fixed clue.
- [ ] **Undo**: reverses the most recent entry/note/hint action one step
      at a time, including restoring a mistake count / hint count to
      its prior value. Pressing Undo with nothing to undo does nothing
      (no error).
- [ ] **Hint**: shows a confirmation dialog first; confirming reveals
      the correct value for the selected cell, counts toward "Hints"
      (not "Mistakes"), and is itself undoable. Cancelling the dialog
      leaves the cell untouched.
- [ ] **Pause**: Escape (or the in-game pause control) shows the pause
      overlay and visibly stops the timer; Resume hides the overlay and
      the timer continues from where it left off, not from zero.
- [ ] Switching browser tabs away and back also pauses/resumes
      appropriately without losing progress or double-counting elapsed
      time.
- [ ] **Focus stays put while the timer runs** (Hardening Phase 1):
      Tab to a toolbar button (Notes/Erase/Undo) or a number-pad digit
      and wait a few seconds — focus and its ring stay there. Press
      Enter/Space on it — focus still stays. Open and close Settings via
      the in-game gear — focus returns to the gear and stays. Arrow keys
      from a board cell still carry focus with the selection, and
      Resume after a pause puts focus back on the selected cell.

## 6. Reload and Continue

- [ ] Start a game, make a few moves (including at least one mistake
      and one note), then reload the page (not via Continue — an
      actual browser refresh).
- [ ] From the main menu, "Continue Game" is enabled and restores the
      exact board: same entries, same notes, same mistake/hint counts,
      same elapsed time (roughly — a second or two of drift from the
      reload itself is fine).
- [ ] The restored game always comes back **paused** — you should see
      the pause overlay and have to press Resume explicitly, even if
      you reloaded mid-play.
- [ ] Starting a **New Game** while an unfinished game exists shows a
      confirmation dialog first; Cancel leaves the unfinished game
      completely untouched; confirming discards it (and the discarded
      game is no longer offered via Continue).

## 7. Completion and persisted scores

- [ ] Solve a puzzle completely (correctly). The completion dialog
      appears automatically with difficulty, time, mistakes, hints, and
      a score, plus a brief animation on the "Puzzle Solved!" heading.
- [ ] **Leaderboard banner:** with that difficulty's High Scores empty
      (or Clear Data first), solve a puzzle — the completion dialog
      should show a "New High Score — Ranked #1!" chip under the
      heading, and "Copy Results" text should mention the rank too.
      Solve a few more (without clearing) until one lands 4th-10th —
      same idea, but a quieter "Made the leaderboard — ranked #N" line
      instead of the chip. Once 10 entries exist and a new run doesn't
      beat any of them, no banner appears at all.
- [ ] "Copy Results" copies (or, if clipboard access is denied, falls
      back to selecting) shareable text describing the result.
- [ ] After closing the dialog, Statistics for that difficulty show an
      incremented games-completed count, an updated completion rate,
      and (if this was the best time) an updated best time.
- [ ] High Scores for that difficulty show the new entry, ranked
      correctly relative to any existing entries (higher score first,
      ties broken by faster time). Top-3 rows show a "medal" badge (a
      filled #1, an outlined #2, a plainer #3); 4th-10th are plain.
- [ ] **"New!" highlight:** go straight from a placing completion to
      High Scores (via Menu, not directly) — the row you just achieved
      is ringed and tagged "New!", even though the completion dialog is
      already closed. Switch between difficulty tabs and back — the
      highlight should still be there for the difficulty you actually
      just played. Leave the High Scores screen (Back) and return —
      the highlight should be gone, even though the medal badge (if
      it's still top-3) stays.
- [ ] Reload the page — statistics and high scores persist (they don't
      reset on reload, unlike the now-finished active game).

## 8. Theme/mode combinations

For **each** of the 4 theme packs (Cyber, Woodgrain, Paper, Light) ×
2 concrete modes (Light, Dark) — 8 combinations — plus System mode at
least once:

- [ ] Switching in Settings applies instantly, with no full page
      reload, and the appearance preview swatches update to match.
- [ ] Board, dialogs, and menu text all remain legible (no
      invisible-text-on-matching-background situations).
- [ ] Board grid lines (both the ordinary 2px cell lines and the bolder
      3px 3x3 box boundaries) are clearly visible on an ordinary,
      non-Retina desktop monitor, not just a high-DPI one — a 1px line
      genuinely washes out at 1x DPI even with good color contrast,
      which is why the grid uses 2px/3px lines (see Phase 14c,
      2026-07-30).
- [ ] Selected/related/matching-value cell highlighting and the
      conflict/error indicators (a colored ring plus a wavy underline
      on the wrong digit — see `styles.css`'s non-color cue) are all
      visible.
- [ ] Cyber theme specifically: a very subtle background glow should be
      slowly drifting (barely noticeable, not distracting) — unless
      `prefers-reduced-motion` is enabled system-wide, in which case it
      should be completely static (see §12).
- [ ] System mode tracks the OS light/dark setting live — flip the OS
      setting while System mode is active and confirm the app follows
      without a reload.
- [ ] Reload — the chosen theme/mode persists.

## 9. Audio settings and missing optional music

- [ ] Settings → Audio & Haptics: Music toggle + volume slider, SFX
      toggle + volume slider, Vibration toggle are all present and
      interactive.
- [ ] With SFX on, button presses, cell selection, mistakes, and puzzle
      completion each produce a short, distinct, quiet sound.
- [ ] Turning SFX off silences all of the above immediately; turning it
      back on restores it, no reload needed.
- [ ] Dragging the volume sliders audibly changes loudness in real
      time, including for a sound already mid-playback.
- [ ] Vibration toggle is disabled (with an explanatory hint) on any
      device/browser without vibration support (most desktop browsers);
      on a supporting mobile device, a mistake should produce a short
      buzz when enabled.
- [x] **Two-track background music** (`./Sudoku Zen.mp3` and
      `./Logic Flow.mp3`, present in the repo — see `README.md`'s Assets
      section). Verified 2026-07-28 both structurally and with real
      playback (via a `play()` observer in an automated browser pass —
      see `DEVELOPMENT_LOG.md`'s 2026-07-28 follow-up entry):
  - "Sudoku Zen" fades in on the main menu, and stays playing across
    Statistics/High Scores (same "menu" music context) without
    restarting or cutting when moving between those three screens.
  - Starting a new game crossfades to "Logic Flow," which loops for the
    rest of that game.
  - Completing the puzzle fades the gameplay track out (it doesn't keep
    looping under the completion dialog).
  - Returning to the menu (or starting another game) fades the correct
    track back in.
  - Pausing mid-game (Escape, or tapping the pause overlay) fades
    "Logic Flow" out and "Sudoku Zen" in; pressing Resume fades back to
    "Logic Flow." (Added 2026-07-28, Phase 14b.)
  - No audible click/pop/gap at any of these transitions — they should
    crossfade smoothly (an exponential ease, not a linear ramp, over
    ~1.8s — see Phase 14c, 2026-07-30), not cut instantly or sound
    abrupt near the end of the fade. **Exception (Hardening Phase 3):**
    on iOS/iPadOS, where web pages can't set an element's volume, tracks
    switch with a clean hard cut instead — see §9a.
- [ ] **Mobile-specific: music survives interruptions** (Phase 14d/14f,
      2026-07-30; root-caused and reworked in Phase 14q, 2026-08-07 after
      a real-device report that 14d/14f's fixes still weren't enough —
      music now plays through plain `<audio>` elements instead of the
      shared AudioContext specifically so a suspended/broken Web Audio
      graph can no longer take it down; see the Phase 14q dev-log entry
      for the diagnosis). This is the one class of bug that only ever
      showed up on a real mobile device, not desktop testing or this
      repo's headless-Chromium sandbox. On an actual phone, confirm
      background music does *not* silently stop after: opening Settings
      (from the menu or in-game) and closing it again; entering several
      digits in a row during gameplay; opening/closing the pause overlay
      repeatedly, including several times in quick succession; switching
      screens repeatedly (menu ↔ Statistics/High Scores ↔ game);
      backgrounding the browser app briefly and returning to it; locking
      the screen briefly and unlocking; receiving a phone call or
      notification sound during play. If it ever does go silent and stay
      silent, that's a real regression worth reporting — the app should
      notice and recover automatically within about a second or two at
      the very most. (Since Hardening Phase 3: an interruption gets up
      to three automatic retries, 0.5 s / 2 s / 6 s apart, then waits —
      and the next tap anywhere resumes it. It never retries in an
      endless loop, and never while the page is hidden or music is off.)
- [ ] **Missing music (regression check only)**: temporarily rename or
      remove either MP3 and confirm the app still never shows an error,
      never breaks SFX, and the Music toggle simply has nothing audible
      to play for the missing track's context. (Both files are normally
      present in this repo — see `CLAUDE.md`'s asset policy — this
      bullet exists only to verify the documented graceful-degradation
      path still works.)
- [ ] Backgrounding the tab (switching away) pauses whichever track was
      playing; returning to the tab resumes it only if the Music toggle
      is still on.
- [ ] **Music off from the start** (Hardening Phase 3): turn Music off,
      reload, tap Start. Nothing plays — not even silently — and the page
      doesn't load the MP3s at all (devtools → Network, filtered to
      `.mp3`: no requests from the page itself; a first visit's service
      worker precache may still fetch them in the background). Turn Music
      on in Settings: the current screen's track starts right away.

## 9a. Mobile & standalone audio (real devices)

Run each check in **four** setups per platform: in the browser and as
an installed app (Android: Chrome menu → Install app; iOS: Safari Share
→ Add to Home Screen), each **online** and **offline** (airplane mode,
after one online launch so the service worker has cached the music —
see §10). Untested on real devices as of Hardening Phase 3; everything
below was verified only in desktop/headless Chromium and with mocked
lifecycle tests.

- [ ] **Start → Intro → Menu**: tap Start; the intro plays; when it ends
      or is skipped, "Sudoku Zen" fades in on the menu *without* another
      tap. (On iOS this depends on the Start tap's silent unlock — if the
      menu stays silent until you tap again, note it: the app still
      recovers on that tap, but the unlock didn't take.)
- [ ] **Game music**: New Game → "Logic Flow"; pause → "Sudoku Zen";
      resume → "Logic Flow"; solve the puzzle → silence under the
      completion dialog; Menu → "Sudoku Zen".
- [ ] **Screen lock**: lock the phone mid-track for ~10 s, unlock — music
      is silent while locked (it must not keep playing on the lock screen)
      and resumes on unlock, or on the first tap if the OS demands one.
- [ ] **App switch / home screen**: switch to another app and back, and
      (installed app) go to the home screen and reopen from the
      app switcher — same expectation as screen lock.
- [ ] **Interruptions**: a phone call, an alarm, or another app's audio
      (start a podcast, then return) — music resumes afterwards or on the
      next tap; it never plays over the other app while the game is in
      the background.
- [ ] **Rapid switching**: menu ↔ Statistics ↔ High Scores ↔ game
      several times quickly, and mute/unmute during a crossfade — it
      always ends on the right track (or silence when muted), never two
      tracks at once for more than the fade.
- [ ] **Offline** (airplane mode, second launch): both tracks play and
      loop from the cache; seeking/looping doesn't stall (Hardening Phase
      2 serves them as proper byte ranges).

**Volume limitations to expect (not bugs):**

- **iOS/iPadOS ignore a web page's music volume.** Safari (and installed
  web apps) don't let JavaScript set an audio element's volume — it's
  always the hardware volume. So on iOS the Music volume slider only
  distinguishes **zero (music off) vs. above zero (full volume)**, and
  track changes are hard cuts instead of crossfades (a crossfade would
  mean both tracks at full volume for 1.8 s). Use the device's volume
  buttons for loudness.
- **iOS silent switch:** sound effects (Web Audio) follow the
  ring/silent switch and go quiet in silent mode, while music (an audio
  element) may keep playing — Apple routes the two differently.
- **Android:** music and effects both follow the *media* volume, and the
  in-app sliders work as a percentage of it. Android 12+ may duck or
  pause music for notifications; that counts as an interruption (see
  above).
- **Background playback is intentionally off:** the app pauses music
  whenever it's hidden (tab switch, screen lock, home screen), on every
  platform.

## 10. Offline: first install, media seeking, missing media

Use a **real** outage for these: turn off Wi-Fi / airplane mode, or
stop your local server. Devtools' Network → "Offline" checkbox doesn't
cut off the service worker's own fetches, so it can make a broken
offline setup look fine.

- [ ] **First install → offline reload** (Hardening Phase 2): clear
      site data, load the app online **once**, and wait for devtools →
      Application → Service Workers to show "activated and is running".
      Don't reload, navigate, or click through first. Application →
      Cache Storage should show a single
      `inspire-sudoku:/<your-path>/:v<N>` cache holding `index.html`,
      `styles.css`, `manifest.webmanifest`, `index.js`, every file under
      `js/` **except** `*.test.js`, plus the logo, icons, intro video,
      and both MP3s.
- [ ] Now go offline for real and reload. The app loads; Start → intro
      plays → menu; start a game and play a few moves. No network-error
      page, no blank screen.
- [ ] **Media seeking offline**: still offline, let menu music play,
      start a game so "Logic Flow" plays, and let the intro play once.
      In devtools → Network, the media requests show "(ServiceWorker)"
      with status **206**. To test seeking directly, run in the console:
      `const a = new Audio('./Logic%20Flow.mp3'); a.currentTime = 90; a.play()`
      — it plays from 1:30 without stalling. On **iOS Safari** (the
      strictest about this), confirm music and the intro both play
      offline on a second launch.
- [ ] **Missing optional media**: in a local copy (never the real
      repo files), rename one MP3, clear site data, and load online.
      The service worker still installs and activates; Cache Storage
      just lacks that one file; offline reload still works; that track
      is silent with no error dialog. Restore the file.
- [ ] **Missing required file**: in a local copy, rename any `js/`
      module and load with cleared site data. The service worker
      install **fails** (Service Workers panel shows it as redundant or
      errored) and nothing half-installed is left serving. With an
      older version already installed, that older version keeps
      working untouched. Restore the file.
- [ ] Go back online and reload — everything still works, no
      stale-cache weirdness.

## 10a. Installability and app icon (real device)

New as of Phase 16e — `manifest.webmanifest`'s `icons` array was empty
before this, so installability itself was previously unverifiable. This
is the one item in this file that categorically needs a real phone/
desktop browser; a sandboxed headless pass can confirm the manifest is
valid and the files are reachable/precached, but not what the OS/browser
actually does with them.

- [ ] Android Chrome: visit the app, wait for (or trigger via the menu)
      the "Install app"/"Add to Home Screen" prompt. Install it, then
      check the resulting home-screen icon — should be the 3×3 grid
      mark with the INSPIRE badge, not a generic globe/placeholder icon,
      and should render with rounded/masked corners cleanly (the
      maskable icon's safe-zone padding doing its job) rather than
      clipping into the grid or the wordmark badge.
- [ ] iOS Safari: "Add to Home Screen" from the share sheet — same icon
      check. iOS has historically preferred `apple-touch-icon` link tags
      over manifest icons in some versions; if the home-screen icon
      looks wrong specifically on iOS while Android is fine, that's a
      real, separate follow-up (not covered by this phase).
- [ ] Desktop Chrome/Edge: the install icon in the address bar, or
      Settings → "Install Sudoku by Inspire" — confirm the installed
      window/taskbar icon matches, not a blank/default icon.
- [ ] Browser tab favicon (any browser, no install needed) shows the
      same grid mark, not the browser's default blank-page icon.

## 11. Keyboard-only use

- [ ] Unplug the mouse (or just don't touch it) and play a complete
      game start to finish: Tab to New Game, operate the difficulty
      dialog, navigate the board with arrow keys, enter digits, use
      Erase/Undo/Hint via Tab+Enter, pause/resume via Escape, reach
      Settings and change a theme, and finish a puzzle — entirely via
      keyboard.
- [ ] Tab order is logical at every screen (follows visual top-to-
      bottom, left-to-right reading order — including the >=1024px
      desktop side-panel layout and the short-landscape-phone layout,
      where the toolbar/number-pad sit visually beside the board rather
      than below it).
- [ ] Every dialog traps focus while open (Tab doesn't escape to
      content behind it) and returns focus to whatever button opened it
      once closed (native `<dialog>` behavior — confirm at least once
      per dialog: Settings, difficulty picker, Hint, New Game
      confirmation, Clear Data confirmation, the per-difficulty clear
      confirmation, and the import-backup confirmation).
- [ ] The difficulty-filter tabs on Statistics/High Scores respond to
      Left/Right/Home/End arrow keys, and only the currently-selected
      tab is reachable via plain Tab (roving tabindex).
- [ ] A visible focus outline is present on every focused element, in
      every theme/mode combination.
- [ ] Screen reader spot-check (VoiceOver/TalkBack/NVDA — whichever is
      available): landmark navigation finds one main region; each
      screen announces a heading when it becomes active; the board
      reads as a labeled group of 81 buttons, each announcing its own
      row/column/value/selected state on focus (not as a formal ARIA
      grid — Phase 15's a11y audit deliberately moved away from
      `role="grid"`/`gridcell`, since this board doesn't implement the
      full ARIA grid keyboard pattern and the mismatch was flagged as a
      critical axe-core violation; see `DEVELOPMENT_LOG.md`). An
      automated `axe-core` pass (WCAG 2.0/2.1 A+AA + best-practice
      rules) shows zero violations on every screen and dialog as of
      Phase 15 — this item is for whatever only a real screen reader can
      still catch.

## 12. 320px mobile and desktop layouts

- [ ] At a 320px-wide viewport (devtools device toolbar, or an actual
      small phone), nothing overflows horizontally anywhere in the app
      (no sideways scrollbar, no clipped content) — check the menu,
      game screen, Settings dialog, Statistics, and High Scores.
- [ ] Number pad and toolbar buttons remain comfortably tappable
      one-handed at this width.
- [ ] At a short landscape-phone viewport (e.g. ~667x375), the game
      screen fits without needing to scroll to reach the number pad.
- [ ] At >=1024px desktop width, the game screen shows the board and a
      control side panel (toolbar + a 3x3 number pad) side by side
      rather than stacked.
- [ ] At a very wide (ultrawide) viewport, the app frame stays centered
      and capped in width rather than stretching edge to edge.
- [ ] Rotate a real mobile device between portrait and landscape
      mid-game and confirm the layout adapts without losing state.

## 13. Dialog focus behavior

(Overlaps with §11's keyboard pass — call out explicitly here since
it's easy to only half-check.)

- [ ] Opening any dialog moves focus *into* the dialog (typically its
      first focusable control or heading).
- [ ] Closing any dialog — via its own buttons, via Escape, or via
      clicking the backdrop if applicable — returns focus to the
      element that opened it, every time, not just the first time.
- [ ] The completion dialog (which opens automatically on puzzle
      completion, not from a button click) still behaves sensibly on
      close — focus lands somewhere reasonable on the menu/game screen,
      not lost to `<body>`.

## 14. Service-worker updates

- [ ] With the app loaded and a service worker active, start a game and
      place a few digits (so there's an active save).
- [ ] Ship a change to any precached file and bump `CACHE_VERSION` in
      `sw.js`. Locally: edit, bump, and serve; on GitHub Pages: push
      and wait for the deploy.
- [ ] Reload once. The page still runs the **old** release consistently
      (HTML and modules both old; devtools → Network shows them "from
      ServiceWorker"), and the "An updated version is available" banner
      appears. Service Workers panel: the new worker is "waiting to
      activate".
- [ ] Tap Refresh. The page reloads **once** into the new release
      (verify your change is visible). Continue Game restores the exact
      board from before, including the digits you placed.
- [ ] Cache Storage now holds only the new version's
      `inspire-sudoku:/<your-path>/:v<N>` cache for this app. Caches
      belonging to anything else on the same origin (another GitHub
      Pages project under the same account) are untouched.
- [ ] **Two tabs**: with the app open in two tabs when an update
      lands, both show the banner. Refresh in one tab reloads only that
      tab; Refresh in the other then simply reloads it into the new
      version.
- [ ] **Ignoring the banner**: close every tab of the app instead of
      tapping Refresh, then reopen — the new release is running.
- [ ] **Upgrading from v20/v21** (installs from before Hardening Phase
      2): a page served by the old worker still shows its banner, its
      Refresh lands on the new release, and the old
      `inspire-sudoku-shell-v<N>` cache is removed.
- [ ] Without a version bump, a plain reload does *not* show the update
      banner (nothing actually changed from the service worker's point
      of view).

## 15. Data reset

- [ ] Settings → Clear Data shows a confirmation dialog explaining what
      will be removed (saved game, statistics, high scores, achievement
      progress) and what
      won't (theme/gameplay/audio settings — pointing at Reset
      Appearance for those instead).
- [ ] Cancelling leaves everything untouched.
- [ ] Confirming removes the active game (Continue Game becomes
      disabled), resets Statistics to zero for every difficulty, and
      empties High Scores for every difficulty — verify by checking
      more than one difficulty, not just the one you were last playing.
- [ ] Appearance (theme/mode) and gameplay/audio settings are
      unaffected by Clear Data — only "Reset Appearance" touches those.
- [ ] If a game was in progress on the game screen when Clear Data is
      confirmed, the app returns to the menu rather than showing a
      broken/stale board.

## 15a. Per-difficulty data reset

New as of Phase 16f — narrower than Clear Data above: clears just one
difficulty's own Statistics or High Scores, not everything.

- [ ] With scores/stats on at least two difficulties (e.g. play a game
      each on Easy and Intermediate), open Statistics, select Easy, tap
      "Clear Stats for This Difficulty" — the confirmation names Easy
      specifically and says High Scores aren't touched.
- [ ] Confirming zeroes out Easy's Statistics only — switch to the
      Intermediate tab and confirm its numbers are unchanged. Easy's
      High Scores (a different store) are also unchanged.
- [ ] Same check on the High Scores screen with its own "Clear High
      Scores for This Difficulty" button — clearing Easy empties just
      that tab's list (the "no scores yet" message appears) while
      Intermediate's list is untouched, and Easy's Statistics are
      unaffected.
- [ ] Cancelling either confirmation leaves everything untouched.
- [ ] The global Clear Data flow (section 15 above) still clears
      everything for every difficulty, unaffected by these narrower
      controls existing alongside it.

## 15b. Data export/import (backup)

New as of Phase 16g — Settings → "Your data" → Export/Import.

- [ ] With some real data present (play a game or two, adjust a
      setting), tap "Export Data" — a `sudoku-by-inspire-backup-
      YYYY-MM-DD.json` file downloads, and a "Backup downloaded."
      confirmation appears. Open the file in a text editor — it's
      readable JSON, not a scrambled/binary blob.
- [ ] Tap "Import Data" and pick that same file — a confirmation names
      the backup's export date and warns it overwrites current
      settings/statistics/high scores/achievement progress/saved game.
      Cancelling changes
      nothing (check a stat value before and after to confirm).
- [ ] Confirming reloads the app. After reload, everything from the
      backup is back — theme/color mode, gameplay/audio settings,
      Statistics and High Scores for every difficulty you had data on,
      and (if you had one) the in-progress saved game via Continue Game.
- [ ] Round-trip across a data change: export, change a setting or play
      another game, import the *original* file back — confirms the
      import actually overwrites the newer state, not just re-applies
      what's already there.
- [ ] Selecting a file that isn't a Sudoku by Inspire backup (a
      random `.json` file, or a `.txt` renamed to `.json`) shows a clear
      "doesn't look like a backup" message and never opens the overwrite
      confirmation — nothing gets touched.
- [ ] Cross-device/browser check (if convenient): export from one
      browser or device, import into a completely fresh one (or a
      private/incognito window) — the backup is self-contained, no
      dependency on where it came from.

---

## 16. Achievement progress and unlocks (no UI yet — devtools checks)

Hardening Phases 4–5 track progress and unlock the 100 achievements
(`js/achievement-catalog.js`) but show nothing yet; check it in
devtools → Application → Local Storage →
`inspireSudoku:v1:achievementProgress` (a JSON value, `version: 2`).
Unlocks are in its `unlocked` map: `id → { at, backfilled }`.

- [ ] **First launch after updating** with existing history: the key
      appears at startup with `wins` / `winsByDifficulty` /
      `completedSeconds` matching Statistics, `trackingSince` = today,
      and everything else (perfect/no-hint wins, streaks, days, earned
      score) at 0 — past wins are never counted as perfect.
- [ ] **Backfilled unlocks** on that first launch: only wins,
      difficulty, speed (Statistics' best time), score (best High
      Score) and `style-grand-tour` entries, each `backfilled: true`.
      Never `perfect-*`, `no-hint-*`, `win-streak-*`, `daily-streak-*`,
      `score-lifetime-*` or other `style-*`.
- [ ] **A win adds unlocks once**: the first win adds `wins-1` (and
      `perfect-1`/`no-hint-1` if clean) with `backfilled: false` and
      `at` ≈ now. Reload and win again: those entries' `at` values
      don't change.
- [ ] **No evaluation while playing**: in devtools, watch the key's
      value during a game (or break on `localStorage.setItem`) — it
      doesn't change while the clock ticks, only when the game is won
      (or replaced via New Game, which only resets `winStreak.current`).
- [ ] **Undone hint** (fresh profile — Clear Data first): use a hint,
      Undo it, finish — `wins-1` unlocks, but `no-hint-1` and
      `perfect-1` don't.
- [ ] **One win**: `wins` +1, `earnedScore` + exactly the score the
      completion dialog showed, `lastWinDate` = today (local date, even
      just after midnight), `recentRunIds` gains one ID.
- [ ] **Perfect vs not**: a game with no wrong digits and no hints adds
      to `perfectWins`; one where you entered a wrong digit and then
      pressed Undo still shows 0 mistakes in the dialog (unchanged) but
      does **not** add to `perfectWins`.
- [ ] **Continue**: start a game, reload mid-game, Continue, finish —
      counted once. The saved game (`inspireSudoku:v1:activeGame`)
      shows `version: 2` with a `runId` that survives the reload.
- [ ] **No double counting**: export a backup mid-game, finish the game,
      import the backup, Continue and finish again — Statistics, High
      Scores and `wins` don't change the second time.
- [ ] **Streaks**: win on two consecutive days → `dailyStreak.current`
      2; replace an unfinished game via New Game → `winStreak.current`
      0 but the daily streak is untouched.
- [ ] **Old save**: a game saved before this update (schema 1) still
      appears under Continue and finishes as a win, but never as perfect
      or no-hint.
- [ ] Clear Data removes the key; Export includes it; Import restores it.

## Known environment limitations (not bugs)

- This project's own sandboxed development environment's headless
  Chromium cannot decode the intro video's codec, so §3's "video
  actually plays" sub-item can't be confirmed from within that
  environment — it's been spot-checked to gracefully fall back
  instead, which is the correct behavior *given* a decode failure, but
  isn't proof the video plays correctly under normal conditions. Verify
  in a real desktop/mobile browser.
- Real screen-reader software (VoiceOver, NVDA, JAWS) has not been used
  to verify this checklist's accessibility-adjacent items — automated
  checks confirm the right ARIA roles/states/labels exist in the DOM,
  not how a specific screen reader actually renders them aloud. Worth a
  real pass with at least one screen reader before considering
  accessibility fully signed off.
