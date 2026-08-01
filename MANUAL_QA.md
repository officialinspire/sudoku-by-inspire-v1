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
      plays automatically after Start, muted, and the Skip button is
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
- [ ] "Copy Results" copies (or, if clipboard access is denied, falls
      back to selecting) shareable text describing the result.
- [ ] After closing the dialog, Statistics for that difficulty show an
      incremented games-completed count, an updated completion rate,
      and (if this was the best time) an updated best time.
- [ ] High Scores for that difficulty show the new entry, ranked
      correctly relative to any existing entries (higher score first,
      ties broken by faster time).
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

- [ ] Settings → Audio & haptics: Music toggle + volume slider, SFX
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
    abrupt near the end of the fade.
- [ ] **Mobile-specific: music survives interruptions** (Phase 14d/14f,
      2026-07-30 — this is the one class of bug that only ever showed up
      on a real mobile device, not desktop testing; Android in
      particular readily suspends the page's AudioContext on focus loss,
      which Phase 14f specifically targeted). On an actual phone,
      confirm background music does *not* silently stop after: opening
      Settings (from the menu or in-game) and closing it again; entering
      several digits in a row during gameplay; opening/closing the
      pause overlay repeatedly; backgrounding the browser app briefly
      and returning to it; locking the screen briefly and unlocking;
      receiving a phone call or notification sound during play. If it
      ever does go silent and stay silent, that's a real regression
      worth reporting — the app should notice and recover automatically
      within about a second or two at the very most.
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

## 10. Offline reload after first online visit

- [ ] Load the app online at least once (so the service worker installs
      and precaches the app shell — check devtools → Application →
      Service Workers shows it "activated and is running").
- [ ] Play through at least one full screen transition (e.g. reach the
      main menu) so the rest of the JS module graph gets runtime-cached
      too (see `sw.js`'s comment on why only a minimal shell is
      precached at install time).
- [ ] Set devtools → Network → "Offline" (or actually disable your
      network connection), then reload the page. The app should load
      and be fully playable — start a game, play a few moves — with no
      network-error page.
- [ ] Go back online and reload again — everything still works, no
      stale-cache weirdness.

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
      confirmation, Clear Data confirmation).
- [ ] The difficulty-filter tabs on Statistics/High Scores respond to
      Left/Right/Home/End arrow keys, and only the currently-selected
      tab is reachable via plain Tab (roving tabindex).
- [ ] A visible focus outline is present on every focused element, in
      every theme/mode combination.

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

- [ ] With the app already loaded and a service worker active, ship a
      change to a core file and bump `sw.js`'s `CACHE_NAME` version
      suffix (see that file's own header comment for the exact
      convention), then reload the page or wait for the browser's
      periodic update check.
- [ ] The in-page "An updated version is available" banner appears with
      a Refresh button.
- [ ] Clicking Refresh reloads and the app continues working normally
      on the new version; devtools → Application → Service Workers
      shows only the new version active, and → Cache Storage shows only
      the new cache name (the old one was cleaned up automatically on
      activation).
- [ ] Without a version bump, a plain reload does *not* show the update
      banner (nothing actually changed from the service worker's point
      of view).

## 15. Data reset

- [ ] Settings → Clear Data shows a confirmation dialog explaining what
      will be removed (saved game, statistics, high scores) and what
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

---

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
