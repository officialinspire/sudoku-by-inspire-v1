# DEVELOPMENT_LOG.md

Running, dated log of what happened each session. Append — don't rewrite
history. Newest entry at the top.

---

## 2026-08-07 — Phase 16b: Number-Pad "Digit Complete" Indicator

**Branch:** `claude/mobile-music-playback-issues-oymb5w`

Second in the requested polish series. The board already computed
everything needed for peer-note cleanup, conflict detection, and
same-digit highlighting, but never surfaced "you've placed all 9 of
this digit correctly" on the number pad — a well-liked, common Sudoku-
app convenience, and genuinely useful here since the board is dense
enough that manually noticing a digit is done takes real scanning.

**Design decision:** made the completed digit's button inert
(`disabled = true`), not just visually dimmed. This isn't arbitrary —
it's mathematically true: once a digit fills all 9 of its required
cells (one per row/column/box in a valid solution), every remaining
empty cell already shares a row, column, or box with one of those 9, so
no further placement of that digit can ever be valid again. Disabling
only guards the number-pad button itself; keyboard digit entry is
untouched and still registers as an ordinary mistake if someone types a
"complete" digit elsewhere, same as any other invalid placement — this
is a UI guardrail, not a new rules-enforcement layer (mistakes were
already fully enforced independently).

**Implementation (`js/ui/board-view.js`):** added a `correctDigitCounts`
tally (index 1-9) computed inside the existing single per-cell loop in
`render()` — no second pass over the board. Moved the number-pad
update block (previously running *before* that loop, since it only
needed `selectedValue`) to run *after* it instead, so it can also read
the finished tally; extended it to toggle `.is-complete` and set
`disabled` per button alongside the existing `.is-current-value` logic.

**Styling (`styles.css`):** `.number-btn.is-complete` reuses
`--color-success` (already the app's established "this succeeded"
token, e.g. `.status-chip--success`) for text/border color, rather than
the generic disabled treatment (`--color-border`/`--color-text-secondary`)
used elsewhere — reads as "done," not "broken." Added
`.number-pad.is-notes-mode .number-btn.is-complete` as a higher-
specificity override so a completed digit doesn't get repainted as an
available pencil-mark target while notes mode is on (a note for an
already-complete digit is exactly as impossible as a real entry would
be).

**Contrast verification:** computed WCAG contrast ratios directly (same
relative-luminance formula the project's prior a11y audits used) for
`--color-success` against `--color-surface` across all 8 theme/mode
combinations, checking *both* stops of every gradient surface
(Woodgrain/Paper use `linear-gradient` surfaces, and a prior phase's
comment on this exact CSS block already flagged that a token can pass
against one stop and fail against the other — worth checking properly
rather than assuming). All 12 checks (8 combos, 4 of them gradients with
2 stops each) clear WCAG AA's 4.5:1 for normal text; tightest is
Woodgrain/light's lighter stop at 4.83:1.

**Verification:** `node --check` clean, `npm test` 181/181. Headless
Chromium: dynamically imported `js/game-state.js` in-page to drive exact
digit placement (rather than guessing from the DOM) — filled all 9
correct instances of a digit, confirmed the matching button gets
`.is-complete` + `disabled` + the right computed color/opacity/cursor;
undid one placement and confirmed it re-enables immediately (fully
reactive, no stale state); confirmed an unrelated, incomplete digit's
button is untouched. Re-ran the same completion with notes mode on and
the Cyber/dark theme active — confirmed the higher-specificity override
correctly restores the solid border and resolves the theme's own
`--color-success` value. Zero page errors.

---

## 2026-08-07 — Phase 16a: On-Screen Undo Button

**Branch:** `claude/mobile-music-playback-issues-oymb5w`

First of a requested polish series: a review of the whole project against
its own goal ("light and sensible... easily accessed and played
anytime") turned up a concrete gap — `undo()` (`js/game-state.js`) was
fully implemented and wired to the Ctrl+Z keyboard shortcut, but had no
on-screen control. `js/ui/controls.js`'s own old comment admitted it:
*"leaving it wired to nothing reachable would be a half-finished
feature."* On a touch device — this app's stated priority — there was
simply no way to undo a mistake at all.

**Fix:**

- `index.html`: added `#btn-undo` to `.board-toolbar`, between Erase and
  Hint (`btn-secondary toolbar-btn`, matching the other three exactly —
  no new CSS classes needed, since `.toolbar-btn { flex: 1 }` already
  shares width evenly across however many siblings it has).
- `js/ui/controls.js`: wired `#btn-undo`'s click to the already-imported
  `undo()`. Updated the now-stale comment on the Ctrl+Z binding (it used
  to justify keeping undo keyboard-only; now it just notes the shortcut
  complements the button for desktop muscle memory).
- `js/ui/board-view.js`: added the button's disabled-state computation in
  `render()`, directly mirroring the existing `hintBtn` pattern —
  disabled whenever `undo()` itself would be a no-op (`!hasGame`,
  `status !== 'playing'`, or `history.length === 0`).

**Verification:** `node --check` clean, `npm test` 181/181. Headless
Chromium at 320px/375px/414px viewports confirmed all four toolbar
buttons stay in one row at the full 56px touch-target height with no
wrapping or overflow (this app has a history of exactly this class of
regression at narrow widths, so checked explicitly rather than assumed).
Functional pass: selected an empty editable cell, entered a digit (Undo
enables), clicked Undo (reverts the entry, Undo disables again), then
confirmed Ctrl+Z still works independently. Zero page errors.
`MANUAL_QA.md`'s existing "keyboard-only use" checklist item already
referenced reaching "Erase/Undo/Hint via Tab+Enter" — it had been
describing a button that didn't exist yet; it's accurate now, no edit
needed.

---

## 2026-08-07 — Phase 14s: Audio Edge-Case Review — Four Hardening Fixes

**Branch:** `claude/mobile-music-playback-issues-oymb5w`

Direct follow-up to Phase 14r: an explicit request to review `js/audio.js`
end-to-end against the standard categories of mobile/Web Audio bugs
(autoplay-gesture policy, AudioContext suspend/resume, unhandled play()
rejections, NaN/out-of-range propagation, asset-load failure handling,
stale scheduling) rather than just playtesting the happy paths again.
Found four real gaps — none reproduced as an active symptom, all
plausible on real mobile hardware and cheap to close.

1. **NaN could throw inside the fade loop and freeze it permanently.**
   `js/audio.js`'s own `clamp01()` (used for `<audio>.volume`) didn't
   guard against `NaN` the way `audio-settings.js`'s equivalent already
   does. Setting `<audio>.volume` to `NaN` throws a `DOMException`
   synchronously; since that assignment happens inside `fadeTrackTo`'s
   `requestAnimationFrame` loop, an uncaught throw there means the loop
   never reschedules itself — that track's fade dies silently and
   permanently. Unreachable today (`audio-settings.js` already validates
   `musicVolume`), but had no defense of its own. Fixed: `clamp01` now
   returns 0 for any non-finite input, matching `audio-settings.js`.
2. **`playCompletion()` read `audioContext.currentTime` before resuming
   the context.** Every other tone-scheduling path calls
   `ensureContextRunning()` first; this one computed its `base` timestamp
   before any resume attempt, then scheduled all four arpeggio notes
   relative to that frozen value. If the context happened to be
   suspended exactly at puzzle completion, the notes could all clamp to
   "now" once the context actually resumed, collapsing the arpeggio into
   one simultaneous chord instead of a staggered win cue. Fixed: moved
   `ensureContextRunning()` to the top of the function, before `base` is
   captured.
3. **A transient network/decode error permanently disabled a track.**
   The `error` listener unconditionally set `available = false` with no
   way back — correct for "this file doesn't exist," but indistinguishable
   from "this file loaded fine and then hit a momentary hiccup" (a
   plausible failure on a flaky mobile connection mid-loop re-buffer).
   Fixed: added a `hasLoadedOnce` flag (set once by `canplaythrough`,
   never cleared) — an error after that point now calls `.load()` to
   retry instead of giving up for the rest of the session. The
   `canplaythrough` listener is no longer `{ once: true }` so this retry
   path can re-fire it; the handler was already idempotent, so running it
   more than once is harmless.
4. **The menu track's first `play()` call isn't always gesture-linked.**
   If the player lets the intro video run to completion instead of
   tapping Skip, `finishIntro()` (`js/ui/intro-video.js`) runs off the
   video's `ended` event — not a user gesture — and that's what triggers
   the menu track's very first `.play()`. Browsers with a strict
   per-element "first play must be gesture-linked" policy (historically
   Safari, most strictly on iOS) could silently block that. Fixed: added
   `unlockMusicElements()`, called synchronously inside
   `initAudioEngine()` (which is itself required to run inside the real
   Start-screen gesture) — a `play()` immediately followed by `pause()`
   on both tracks while their volume is still 0, the standard mobile
   "unlock" trick. Whatever later triggers the real playback no longer
   matters, since the element is already unlocked.

**Verification:** `node --check` on every `.js` file, `npm test` 181/181.
Re-ran the Pixel-5-emulated Playwright harness from Phase 14r with
play()/pause() call logging added: confirmed the unlock play+pause fires
for both tracks within the same synchronous tick as the Start-screen
click (~0.3ms apart), the real menu-track playback follows shortly after
on an already-unlocked element, and the fade-in curve is unchanged from
Phase 14r's baseline — these fixes are defensive hardening, not
behavioral changes to the paths already verified working. `sw.js`
`CACHE_NAME` bumped again so an installed PWA picks these up.

---

## 2026-08-07 — Phase 14r: Mobile Audio Playtest Verification (No Code Changes Needed)

**Branch:** `claude/mobile-music-playback-issues-oymb5w`

Follow-up request after Phase 14q: verify menu and gameplay background
music actually play correctly on mobile, and that SFX/fade-in/fade-out
quality holds up, then push. This was a verification pass, not a
redesign — the plan going in was to fix whatever the playtest turned up,
but the playtest didn't turn anything up.

**Method.** Headless Chromium (Playwright) emulating a Pixel 5 device
profile, served the app with the real `Sudoku Zen.mp3`/`Logic Flow.mp3`
files already in this repo. Instrumented `window.Audio` via
`page.addInitScript` (before any app code runs) to sample every music
`<audio>` element's `.volume`/`.paused` every 100ms, and instrumented
`AudioContext.prototype.createOscillator` to confirm SFX tones actually
fire. This is the same category of instrumentation used to verify Phase
14q's crossfade math, extended here to cover the full audio surface the
user asked about.

**Verified, all correct:**

- **Menu music fade-in** (first gesture → landing on the main menu):
  smooth exponential ramp from 0 to the 0.5 default slider level over
  ~1.8s — sampled curve: 0.036 → 0.128 → 0.262 → 0.402 → 0.468 → 0.493 →
  0.498, no jumps or steps.
- **Menu → gameplay crossfade** (starting a new game): both tracks ramp
  simultaneously in opposite directions (menu 0.5→0, gameplay 0→0.5)
  with real overlap — gameplay's fade-in samples show it already
  audible (0.018, 0.1, 0.179...) while menu is still well above zero
  (0.482, 0.4, 0.321...), confirming the "incoming track starts before
  fade-in begins, outgoing track only pauses once fade-out actually
  finishes" design holds in practice, not just in the source.
- **Pause-overlay crossfade** (mid-game Escape): same clean overlapping
  fade in reverse (gameplay→menu), correctly re-verified against real
  audio after Phase 14q's rework of the fade mechanism.
- **Live volume-slider response**: dragging `#setting-music-volume`
  mid-playback updates the active track's audible volume immediately
  (not just on the next fade), confirmed by sampling right after a
  simulated drag.
- **Mute/unmute**: toggling the music checkbox off fades the active
  track smoothly to 0 over ~1.9s and then actually pauses the element
  (not just silences it); toggling back on fades it back up to the
  slider level. Both directions sampled end-to-end.
- **SFX**: confirmed `createOscillator` calls fire on generic button
  clicks (`js/ui/audio-bindings.js`), board-cell selection, and digit
  entry — the synthesized-tone pipeline Phase 14q left untouched (SFX
  still uses the shared AudioContext; only music was decoupled from it).
- **Zero page errors** across every run (three separate Playwright
  sessions covering fade-in, crossfade/SFX, and mute/pause-overlay
  respectively) — no unhandled promise rejections, no thrown exceptions.

**Not re-litigated:** Phase 14q's actual bug fix (decoupling music from
the AudioContext to survive Android's graph-death failure mode) — this
session's job was to confirm the resulting audio *quality* (smoothness,
timing, correctness of every trigger path), not to re-diagnose the
mobile-specific bug again. The real-device confirmation that Phase 14q's
fix actually holds under a genuine Android suspend/resume cycle is still
the one thing this sandbox categorically cannot produce (see Phase 14q's
own verification notes) — that remains the last open item in
`MANUAL_QA.md`'s mobile-music checklist.

**Outcome:** no code changes. `js/audio.js` already satisfies "background
music plays correctly for main menu and gameplay, with quality SFX and
fade in/out" as designed by Phase 14q; this entry exists so that
conclusion is backed by evidence rather than asserted.

---

## 2026-08-07 — Phase 14q: Mobile Music, Root-Cause Fix

**Branch:** `claude/mobile-music-playback-issues-oymb5w`

Direct follow-up to real-device testing: the user reported background
music on Android Chrome still stops and doesn't resume, specifically
around pausing/resuming the game and switching screens — meaning Phase
14d's and 14f's fixes (a per-track `pause` listener, an `AudioContext`
`statechange` listener, and a 2-second safety-net poll, all added
2026-07-30 to chase the same symptom) still weren't catching the real
failure mode.

**Diagnosis.** Re-read the whole music pipeline with the specific
question "what could make every one of those three recovery mechanisms
see 'looks fine' while staying silent?" All three checks ultimately boil
down to two flags: `track.element.paused` and `audioContext.state`.
Music was routed through the *same* AudioContext graph as the SFX
synthesis (`createMediaElementSource(track.element) → GainNode →
compressor → destination`) — and Android Chrome has a known fragility
where that specific graph shape (a `MediaElementAudioSourceNode` feeding
a Web Audio graph) can go silently dead across a suspend/resume cycle,
independent of whether the element itself is "playing" or the context
reports "running." When that happens, `.paused` stays `false` (the
element never stopped) and `.state` can read `'running'` (the context
resumed fine) — but the *connection* between them is severed, and
nothing reaches the speakers. That's a failure mode no amount of
watching those two flags can ever detect, which is exactly why two
successive targeted patches from the same angle didn't fully fix it.

**Fix (`js/audio.js`):** decoupled background music from the Web Audio
graph entirely.

- Removed `createMediaElementSource`/`GainNode` for music tracks. Each
  track's own `<audio>` element now controls its volume directly via the
  native `.volume` property.
- Replaced the `AudioParam.setTargetAtTime`-based crossfade
  (`fadeTrackGainTo`) with a `requestAnimationFrame`-driven equivalent
  (`fadeTrackTo`) that animates a plain per-track `fadeLevel` (0..1) and
  writes it to `element.volume` multiplied by the music-volume slider
  setting — same exponential-approach feel and ~`seconds`-to-settle
  timing as before, just without an AudioParam.
- `recoverMusicPlayback()` simplified to only check
  `track.element.paused` — there's no AudioContext state left to also
  resume, since music no longer touches the context at all. Removed the
  now-pointless `AudioContext` `statechange` listener along with it (SFX
  still uses the context normally; `ensureContextRunning()` still guards
  every `playTone()` call).
- Found and fixed a smaller, related bug while in this code:
  `updateMusicPlayback()`'s trailing `pause()` call (scheduled after
  fading out for a disabled-music/hidden-tab state) fired
  *unconditionally* once its timeout elapsed, even if music had been
  re-enabled again mid-fade — unlike `setActiveMusicTrack()`'s matching
  pause, which already re-checked before pausing. Added the same guard.

**Verification:**

- `node --check` across every `.js` file: clean.
- `npm test`: 181/181 (no existing test reaches into these internals
  directly, so this was a check that the refactor didn't disturb
  anything observable, not a targeted regression suite for the new
  code).
- Headless Chromium (Playwright), against the real `Sudoku Zen.mp3` /
  `Logic Flow.mp3` files already in this repo: started a new game,
  pressed Escape to pause, clicked Resume, then fired 6 rapid Escape
  presses in immediate succession (~150ms apart) to stress the crossfade
  scheduling. Zero page errors. Instrumented `Audio()` itself (via
  `page.addInitScript`) to log every real `play`/`pause` event and each
  track's final `.paused`/`.volume` — after the toggle sequence settled,
  the gameplay track was correctly active, unpaused, and at the slider
  volume (0.5), and the menu track was correctly paused and silent,
  exactly matching what that exact sequence of toggles should produce.
- **What this doesn't (and can't) prove:** the specific Android Chrome
  Web-Audio-graph-death behavior this fix targets can't be reproduced in
  this sandbox — same limitation already noted for the intro video
  (Phase 1) and for Phase 14f's `AudioContext.suspend()` simulation
  (real OS-level audio-focus loss isn't something headless Chromium
  running here experiences). This is a root-cause architectural fix for
  a well-documented class of mobile Web Audio bug, reasoned through and
  verified as far as this sandbox allows — not something provable
  end-to-end without the user's own device. `MANUAL_QA.md`'s mobile
  music checklist item is updated accordingly and still needs a real
  Android pass to close out.
- `sw.js` `CACHE_NAME` bumped so an already-installed PWA on a phone
  actually picks up this fix instead of continuing to serve the old
  cached `js/audio.js`.

---

## 2026-07-30 — Phase 14p: Final Polish & Performance Audit

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A closing audit, explicitly scoped as "no new features, no major
redesign": review the whole design system for inconsistency and the app
for performance problems, and fix only what the audit itself turns up.

**Tooling check first:** confirmed via `package.json` and a repo-wide
search that this project has no lint/type-check/build configuration at
all (no `eslint`, `prettier`, `tsconfig.json`, or `stylelint` config
anywhere) — consistent with `CLAUDE.md`'s vanilla-JS/no-build-step
constraint. The only real script is `"test": "node --test"`. Used
`node --check` across every JS file as the closest available stand-in
for "type-check"/"build" rather than silently skip those checklist items
or fabricate results for tools that don't exist in this project.

**Design-system consistency audit:** read the entire `:root` token block
and grepped every `font-size`, spacing, `border-radius`, `box-shadow`,
and hex-color declaration in `styles.css` against the token system built
up over Phases 14g/14h/14k. Found the codebase already highly consistent:
zero hardcoded border-radii anywhere, zero hardcoded spacing except one
justified sub-token value for the in-cell notes mini-grid, zero
hardcoded shadows outside the token scale, and only 3 hardcoded hex
colors — all pre-existing, all already documented in-code as
deliberately theme-independent (the intro Skip button's guaranteed-
contrast text over arbitrary video frames, the alpha-only SVG mask
color, and the intro-to-menu black fade). No real "duplicated colors"
issue found. The type scale's own pre-existing comment already flags
`--font-size-6`/`--font-size-8` as suspiciously close (0.95rem vs.
1.05rem) — re-confirmed this is real but reconciling it would ripple
into three other selectors for a 1.6px difference, out of scope for a
minimal pass; left as a documented, deliberately-deferred finding rather
than silently fixed.

**Button-state and unused-CSS audit:** every `cursor: pointer` selector
in the stylesheet (7 total) is covered by the shared interactive-states
block from Phase 14j; `.cell`'s documented brightness-only exception
re-confirmed as the sole deliberate deviation. Cross-checked every CSS
class against actual HTML/JS usage — two apparent "unused" classes
(`.is-shake`, `.is-value-enter`) turned out to be a false-positive from
grepping for literal `classList.add('...')` strings; both are genuinely
applied via `board-view.js`'s `retriggerAnimation()` helper (remove
class → force reflow → re-add), which a naive string search can't see.
No actual unused classes found.

**Performance audit — the substantive part of this phase.** Audited
every `transition`/`transition-property` declaration (14) and
`@keyframes` block (5) in `styles.css` for the requested "prefer
transform/opacity, avoid width/height/top/left" rule. All 14
transitions and 4 of 5 keyframe blocks are fully compliant
(`transform`/`opacity`/color-only). One real exception: `cyber-drift`
(the Cyber theme pack's ambient body-level background glow, added in
Phase 11) animates `background-position`, a paint-triggering property,
applied directly to `body` rather than scoped to any one screen — so
unlike the menu's own Sudoku-digit background, it runs on every screen
whenever Cyber theme is active, gated only by
`prefers-reduced-motion: no-preference`.

Rather than assume this either is or isn't a real problem, wrote a new
Playwright script (`final-perf-audit.mjs`) to check empirically:

1. **Menu-background leakage**, checked via `element.getAnimations()`
   (the Web Animations API), not just `getComputedStyle`: confirmed
   `.menu-sudoku-bg__pattern` has a genuinely running animation while on
   the menu, and exactly zero animations the instant the game screen
   becomes active — because `#screen-menu` is truly `display: none` at
   that point (verified both the computed style and the `.hidden`
   property), which is the actual mechanism that stops it from consuming
   compositor resources off-menu, not just visual overlap. This
   reconfirms the Phase 14e/14g design still holds exactly as intended.
2. **Gameplay responsiveness under load**: set Cyber/dark theme,
   confirmed via `getAnimations()` that the ambient `background-position`
   drift is actually running during gameplay (the worst-case scenario),
   then fired 10 rapid keyboard digit entries into 10 different cells.
   All 10 registered correctly in 162ms — no dropped input, no
   measurable lag from the concurrent paint-triggering animation.
3. **Reduced motion**: confirmed under `reducedMotion: 'reduce'` that
   both the menu pattern and the Cyber ambient drift report zero running
   animations.

All three passed. Given the empirical result (no measurable performance
impact), that this animation predates this phase's polish work (not
something introduced by it), and that the "correct" fix (extracting it
onto a new `body::before` pseudo-element to use `transform` instead of
`background-position`) would introduce a new z-index/stacking-context
surface with real regression risk for zero measured benefit — decided
*not* to restructure it, consistent with this phase's explicit "fix
issues caused by the polish work, don't refactor unrelated code"
instruction. Documented as a known, low-priority finding instead.

**Rerenders:** reviewed `board-view.js`'s `render()` — it unconditionally
walks all 81 cells and writes `textContent`/toggles classes on every
state change, with no diffing against previous state before writing.
At this scale (roughly 500 idempotent DOM operations per keystroke) this
is trivially inside a frame budget; confirmed empirically by the same
162ms/10-keystroke measurement above. Not a real problem — left
unchanged rather than adding diff/memoization complexity that would only
protect against a cost that doesn't exist here.

**Remaining checklist items** (abrupt state changes, mobile overflow,
desktop overexpansion, theme inconsistencies) were re-verified via the
existing regression suite rather than re-audited from scratch, since
Phases 14m (dialogs/overlays), 14n (6-breakpoint responsive pass), and
14h/14k (palette/board work) already covered this ground directly and
recently — all still pass with zero regressions.

**Net result: no source files needed changes.** Every checklist item
either was already compliant or, in the one exception found
(`cyber-drift`), was deliberately left as a documented finding rather
than fixed, per the explicit "no major redesign, don't refactor
unrelated code" scope for this phase. `sw.js`'s `CACHE_NAME` was **not**
bumped, since no cached file actually changed this phase.

**Verification:** `npm test` 181/181; `node --check` clean across every
JS file; the full existing Playwright regression suite — `final-
playtest.mjs`, `grid-gap-audit2.mjs`, `sbg-verify.mjs`, `board-
verify.mjs`, `board-scaling.mjs`, `number-feedback-verify.mjs`,
`dialog-verify.mjs`, `responsive-audit.mjs`, `a11y-contrast2.mjs`,
`a11y-verify.mjs` — plus the new `final-perf-audit.mjs`, all passing
with zero regressions. Updated `TASKS.md` with a new Phase 14p entry.

---

## 2026-07-30 — Phase 14o: Accessibility Audit

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A full accessibility pass against a checklist covering semantic
controls, icon-only accessible names, keyboard navigation, focus
order, `:focus-visible` indicators, contrast, touch-target sizing,
selected/disabled states, dialogs/overlays, decorative-content
handling, and reduced-motion behavior — with explicit constraints: no
product-scope changes, no color-alone communication where practical,
never remove a focus outline without replacing it, and minimal
targeted fixes over broad rewrites.

**Audit first, before touching anything:** read every HTML/CSS/JS file
against the checklist rather than assuming prior phases' work was
complete. Most of it held up well — native `<dialog>` elements
already had correct focus-trapping and `aria-labelledby`; the
difficulty filter (`js/ui/difficulty-filter.js`) already implements
the full WAI-ARIA tabs pattern with roving `tabindex` and arrow-key
navigation; `getCellAriaLabel` already announces row/column/value/
selected/conflict state on every board cell; `screens.js` already
moves focus to each new screen's root on navigation; `.menu-sudoku-bg`
was already `aria-hidden="true"`; there is no `outline: none` anywhere
in `styles.css`; and the sitewide `prefers-reduced-motion: reduce`
override already catches every animation/transition added across
every prior phase, verified directly rather than assumed. No
semantic-button, keyboard-navigation, focus-order, or reduced-motion
gaps were found — the two real issues were both narrower and more
specific than that.

**Issue 1 — contrast:** wrote a live Playwright contrast script using
the WCAG relative-luminance formula, checking every place
`--color-accent` is used as literal text color (as opposed to a fill
or a border/ring, both of which have different, already-audited
requirements) against all 8 theme/mode combinations. Woodgrain and
Paper's `--color-surface`/`--color-panel` are CSS gradients, and a
naive `getComputedStyle().backgroundColor` read returns `transparent`
for those (the color lives in `background-image`, a different
sub-property) — silently producing meaningless comparisons against
implicit black. Fixed by resolving each custom property's actual
string value and testing every gradient stop, taking the worst case.
That surfaced four real WCAG AA failures, all specific to Paper's dark
mode: `.brand span` ("by Inspire") at 4.23:1 against the desktop
`--color-panel` card (below the 4.5:1 minimum for normal text), the
pre-existing `.highscore-score` at 3.88:1 against `--color-surface`,
and two introduced by this project's own recent work without ever
being checked against this exact pairing — the notes-mode number-pad
digit text and the completion dialog's score (Phases 14l and 14m).

Fixed all four by switching from `--color-accent` to
`--color-entry-player` — a token in the same accent hue family per
theme (literally identical to `--color-accent` in Woodgrain/light,
closely related everywhere else) but one that was already
purpose-built and audited specifically for colored text sitting on
panel/surface backgrounds (it's what a player's own entered digits use
on the board). Re-verified: every one of the 8 theme/mode
combinations now clears 4.5:1 with a comfortable margin (Paper/dark's
worst case moved from 3.88:1 to 5.88:1). Screenshotted the result in
Paper/dark specifically — the corrected color reads as more legible,
not just numerically compliant, with no loss of the theme's warm
character.

**Issue 2 — the pause overlay lacked dialog semantics and a real focus
trap.** `#pause-overlay` is deliberately not a native `<dialog>` (it
has to appear instantly on a backgrounded tab or an Escape press,
without `showModal()`'s machinery), which meant it never got any of
`role="dialog"`, `aria-modal="true"`, or an accessible name — and,
more concretely, nothing stopped a keyboard user from tabbing straight
through the Resume button into the board underneath, which is
supposed to read (and now formally claims, via `aria-modal`) as inert
while paused. Fixed with two minimal, targeted changes:
- `index.html`: added `role="dialog" aria-modal="true" aria-label="Game paused"` to `#pause-overlay`.
- `js/ui/controls.js`: since Resume is the overlay's only focusable
  element and already receives focus the instant it opens (a Phase
  14m fix), a single `keydown` listener that calls
  `event.preventDefault()` on `Tab` is a complete, fully-correct trap
  for this specific single-control case — no generic multi-element
  trap machinery needed.

Confirmed every existing interaction still works exactly as before:
clicking Resume, clicking the backdrop, Escape to toggle pause,
pressing Enter on the already-focused Resume button, and — importantly
— that the new Tab-blocking listener is scoped tightly enough that
Settings-dialog keyboard navigation (a completely separate, unrelated
native `<dialog>`) is unaffected.

**Deliberately left unchanged, and why:** the board's "related" and
"matching-number" cell highlights (Phase 14k) still rely on hue/
luminance alone with no structural cue, unlike the selected cell
(accent ring) and conflicts (error-colored ring). Not fixed here —
the information they convey (row/column/box membership, which cells
share a digit) is independently available through non-color means
already on screen (grid position, the literal digit text itself), and
Phase 14k's explicit brief was to keep exactly these two states
visually subordinate/subtle relative to the selected cell's ring.
Adding rings to them now would reverse that considered, previously-
requested design decision and add exactly the kind of visual weight
this task's own "preserve existing visual identity" and "minimal
targeted changes" constraints argue against. Recorded here as a
deliberate, reasoned exception rather than a silently-skipped gap.

**Verification:** `npm test` 181/181. The corrected 8-combination
contrast script passes clean. A new Playwright script confirmed the
pause overlay's ARIA attributes, that focus starts on and stays
trapped on the Resume button through repeated Tab and Shift+Tab, and
that every existing way to resume the game still works with focus
correctly landing back on the selected board cell afterward. Re-ran
the full existing regression suite built up across every prior Phase
14 sub-phase — the playtest, grid-gap/centering audit, menu-background
suite, board-state suite, number-entry feedback suite, and dialog
suite — all still passing with zero regressions. `sw.js` `CACHE_NAME`
bumped `v15` → `v16`.

**Files changed:** `index.html`, `styles.css`, `js/ui/controls.js`,
`sw.js`, `TASKS.md`, `DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14n: Responsive Pass — Menu & Gameplay UI

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A focused responsive audit across the main menu and gameplay UI at six
requested widths (320/375/430/768/1024/1440px) plus a short-landscape
phone viewport, reviewing title scaling, menu width, board sizing,
number controls, toolbar placement, dialog sizing, safe-area spacing,
overflow, and desktop maximum widths. Constraint: fix with responsive
CSS (`clamp()`/`min()`/`max()`/`aspect-ratio`/existing layout tools),
never device-specific JavaScript, and preserve all functionality.

**Audit first:** wrote a Playwright script that loads the Start
screen, Menu, Game screen (with the difficulty picker and Settings
dialog), and separately the Statistics/High Scores screens, at every
requested width, and checks: `document.documentElement.scrollWidth`
vs. `clientWidth` (zero horizontal overflow anywhere), sibling
bounding-box overlap within the header/toolbar/number-pad/menu-nav,
every button/tile's tap-target size (>=44px, matching the app's
existing `--touch-target-min` token — board cells are intentionally
exempt, same as every prior phase, since a 9×9 grid's cell size is
inherent to the puzzle, not a "button"), board squareness and
containment, dialog width capped on desktop and clear of the screen
edges on mobile, and non-zero (safe-area-aware) screen padding on all
sides. Every check passed at every breakpoint except one real,
concretely-measured problem.

**The one real bug found and fixed:** the game screen's header
(`.game-header`) held three competing groups — the Menu button, four
meta stats (Difficulty/Time/Mistakes/Hints), and the Settings gear —
in a single `flex-wrap: wrap` row with `justify-content: space-
between`. Below roughly 440px this doesn't fail cleanly; it cascades
differently depending on exactly how many pixels are available.
Measured directly (the header's own rendered height, the clearest
single signal for "how many rows"): 134px — a genuine 3-row stack —
at 320px; 96px at 340-430px, but *not* the same 2-row split throughout
that range — at 375px it happened to land as Menu-alone / stats+gear-
together, while at 390-430px it flipped to Menu+stats-together /
gear-alone, orphaned on the far left of its own row instead of staying
paired top-right with Menu. Only from 440px up did all three
reliably fit on one line (44px height). None of this tripped the
overflow or tap-target checks — everything technically still fit and
was still tappable — but it's exactly the kind of "toolbar placement"
problem this pass exists to catch, and it wasted real vertical space
low on the exact narrow phones (390-430px covers a large share of
real-world devices) where "keep the board usable above the fold"
matters most.

**Fix:** replaced the flex-wrap header with an explicit CSS Grid
using `grid-template-areas`, so the arrangement is deliberate at every
width instead of an accidental cascade:
```css
.game-header {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "back settings" "meta meta";
  ...
}
#btn-game-back { grid-area: back; justify-self: start; }
#btn-game-settings { grid-area: settings; justify-self: end; }
.game-meta { grid-area: meta; justify-content: center; }

@media (min-width: 480px) {
  .game-header {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: "back meta settings";
  }
}
```
Below 480px, Menu and Settings now always share row one (pinned to
opposite corners) with the four stats centered on their own row below
— a stable, predictable 2-row layout regardless of exact pixel width
within that range, instead of the fragile 1-to-3-row cascade. The
480px threshold was chosen with a small safety margin above the
measured 440px natural single-row fit point. Re-verified across
320-470px after the fix: every sampled width now measures a
consistent 82px (clean 2-row), and 480px+ measures a consistent 44px
(clean 1-row) — no more inconsistency within either range. Grid-area
placement reorders visually without touching DOM order, so keyboard
tab order is completely unaffected — the app's only two focusable
elements in this header (Menu, Settings) were already in their
natural left-to-right visual order, so this was never a concern, but
worth confirming rather than assuming.

**Everything else reviewed was already correct, verified rather than
assumed:** title scaling (the `clamp()`-based fluid type from Phase
14i), menu width capping (Phase 14i/j), board sizing and
`aspect-ratio` (Phase 14k, including that phase's `flex-shrink: 0`
fix for short viewports), number-pad/toolbar tap targets (Phase
14j/l), dialog sizing and safe-area-aware padding (Phase 14m), and
the pre-existing short-landscape-phone and `>=1024px` wide-desktop
side-panel layouts. All were re-swept fresh under this pass's 6-
breakpoint-plus-landscape audit rather than taken on faith from prior
phases' own (narrower-scoped) testing. Also swept the Statistics and
High Scores screens' difficulty-filter tabs and stat cards at
320/768px — clean, no changes needed.

**Verification:** `npm test` 181/181. The full 6-breakpoint +
landscape audit script re-run clean after the fix. Re-ran the entire
existing regression surface built up across every prior Phase 14
sub-phase — `final-playtest.mjs`, `grid-gap-audit2.mjs`,
`sbg-verify.mjs`, the board cell-state suite, the board-scaling
checks, the number-entry feedback suite, and the dialog suite — all
still passing with zero regressions from the header change. `sw.js`
`CACHE_NAME` bumped `v14` → `v15`.

**Files changed:** `styles.css`, `sw.js`, `TASKS.md`,
`DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14m: Dialog, Overlay & Pause Screen Polish

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Polished every dialog, overlay, confirmation prompt, and the pause/
completion screens — no new dialogs, no new features. Explicit
constraints from the request: standardize surface/border/radius/
shadow/spacing/typography/button-layout, add subtle 150-250ms entrance/
exit motion, respect reduced motion, and preserve keyboard/focus
behavior.

**Audit first:** read `index.html` and every dialog controller module
(`settings.js`, `difficulty-dialog.js`, `hint-dialog.js`,
`completion-dialog.js`, `new-game-confirm-dialog.js`,
`clear-data-dialog.js`) before writing any CSS. Found the app already
had a strong foundation: all six `<dialog>` elements already share one
`.settings-dialog` class and all use native `showModal()`/`close()` —
so a single shared CSS change reaches every one of them, and none of
the six JS files needed touching. Screenshotted every dialog and the
pause overlay at 360px and 1280px before changing anything, which
surfaced two concrete, real issues rather than assumed ones: Settings'
3-button action row ("Reset Appearance"/"Clear Data"/"Close")
overflowed its container on a 360px screen — "Reset Appearance" wrapped
to two lines while its neighbors stayed on one — and no dialog or
overlay anywhere had any show/hide motion at all (native `<dialog>`
snaps open and closed instantly).

**Entrance/exit transition (`styles.css`, all six dialogs at once):**
Added `opacity`/`transform: scale(0.96 → 1)` to `.settings-dialog`
(200ms, inside the requested 150-250ms range, plain ease, no bounce or
overshoot) using `@starting-style` + `transition-behavior:
allow-discrete` — the current standard technique for animating a
native `<dialog>`'s open *and* close with zero JavaScript. This is
what lets the browser's own `close()` call be held on-screen for one
transition's length instead of vanishing instantly at
`display: none`; none of the six dialog controller files needed any
change for it to work. `::backdrop` gets its own opacity-only fade (no
transform — scaling a full-viewport backdrop box would visibly reveal
its shrunken edges against the page, the opposite of subtle).
Verified directly (not assumed) that the app's existing sitewide
`@media (prefers-reduced-motion: reduce)` override already forces
these new transitions' durations near-zero, same as every other
animation added in this project — no new gating code needed.

**Mobile button-row fix:** `.settings-actions` now stacks full-width
buttons in a column on narrow screens and becomes a right-aligned row
again at the app's existing `>=768px` desktop breakpoint. Column order
always matches DOM order (never reversed via `column-reverse`), so
visual order, reading order, and keyboard tab order stay in agreement —
a deliberate accessibility choice, not just convenience. This directly
fixes the observed Settings-dialog overflow and also cleans up a subtle
issue on the 2-button confirm dialogs, where a longer label like "Start
New Game" was wrapping to two lines inside a stretched-height button
next to a single-line "Cancel."

**Pause overlay standardized to match the dialog system:** it's not a
native `<dialog>` (pausing needs to work instantly on a hidden tab or
Escape press, without the modal machinery), but its content now lives
in a `.pause-card` using the exact same panel background,
`--radius-lg`, and `--shadow-lg` tokens as `.settings-dialog`, instead
of floating as plain white text directly on the dark scrim. The
scrim's own opacity was aligned to `0.5` to match `::backdrop` — one
"soften the interface behind a modal surface" treatment everywhere,
not a different one for the pause screen. It gets the same fade
(+ card scale) entrance/exit as real dialogs, via the same
`@starting-style`/`allow-discrete` technique applied to the plain
`hidden`-toggled overlay element instead of a native `<dialog>`
(verified this nested case — nested rule reachable through an
ancestor's display change — actually animates rather than snapping,
via a direct Playwright mid-transition opacity sample).

While standardizing its surface, found and fixed a genuine
accessibility gap: the pause overlay never moved keyboard focus onto
itself when shown, so a keyboard user's focus silently stayed on the
now-hidden board cell behind it — a gap a native `<dialog>` avoids
automatically via `showModal()`, but this hand-rolled overlay never
had. `js/ui/board-view.js` now focuses the Resume button the instant
the overlay actually becomes visible (diffed against its previous
`hidden` state, so it only fires on the real show transition, not
every render while already paused). The existing "keep focus on the
selected board cell" logic already correctly restores focus there on
resume — confirmed via a fresh keyboard-driven test, not modified.

**Completion dialog — "rewarding but calm," no confetti/sound/new
stats:** Score (always the last of the five stats in the DOM) now
spans both grid columns with a divider rule above it and renders
larger, in the theme's accent color — reusing the exact same
"this is a score" visual treatment the High Scores list already uses
elsewhere in the app, rather than inventing a new one. This reads as
the payoff "total," clearly separated from the difficulty/time/
mistakes/hints breakdown above it, with nothing new added: no
particles, no audio, no additional numbers. The existing one-shot
title-celebration animation (a scale+fade-in on "Puzzle Solved!",
already gated to `prefers-reduced-motion: no-preference`) was
verified and left completely unchanged.

**Already correct, verified not changed:** desktop dialog width was
already capped at `min(30rem, 92vw)` (measured 480px on a 1920px-wide
viewport); mobile content already had edge clearance via that same
92vw cap plus internal `--space-4` padding (measured zero overflow at
320px). Neither needed adjustment — confirmed by direct measurement
before deciding not to touch them.

**Verification:** `npm test` 181/181. A new Playwright script
confirmed: the dialog's `transition-duration` is 200ms; a genuinely
mid-flight sample during open shows `0 < opacity < 1` and a
non-identity `scale()` transform; the dialog is still `display: block`
30ms after `close()` fires (proof the browser is honoring the exit
transition, not skipping straight to `display: none`) and is fully
gone once the transition's duration has elapsed; `prefers-reduced-
motion` forces the duration to ~0; native focus-trap and Escape-close-
with-focus-return behavior are intact — with one documented, `git
stash`-confirmed pre-existing Chromium quirk where Tab transiently
touches `<body>` or the `<dialog>` element itself while wrapping from
the last focusable control back to the first (reproduces identically
on the prior commit with zero changes, so it's native browser
behavior, not a regression; the real accessibility guarantee — focus
never lands on an actual interactive element outside the dialog — was
verified to hold throughout); `.settings-actions` is a column at 360px
and a row at 1280px, with all three Settings buttons full container
width and equal (single-line) height on mobile; the pause overlay
fades in with a real panel/radius/shadow card and hands focus to
Resume, then back to the selected board cell on resume. Screenshotted
every dialog type plus the pause overlay across Light, Cyber-dark, and
Woodgrain-dark, at both mobile and desktop widths. Re-ran the full
existing regression suite (`final-playtest.mjs`) — zero regressions.
`sw.js` `CACHE_NAME` bumped `v13` → `v14`.

**Files changed:** `styles.css`, `index.html` (pause overlay markup
only — wrapped its existing content in a new `.pause-card` div, no new
controls), `js/ui/board-view.js`, `sw.js`, `TASKS.md`,
`DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14l: Number-Entry Controls & Gameplay Feedback Polish

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Polished the number pad and its gameplay feedback — no new gameplay
features, no changes to validation rules or number logic. Everything
here is either a `styles.css` addition or a `js/ui/board-view.js`
change that only reads existing state to drive class toggles;
`js/game-state.js` (the actual rules/validation module) was not
touched.

**Audit first:** before writing anything, checked which of the
requested items already existed. The number pad already had the full
Phase 14j tactile-press system (200ms transition, `scale(0.98)` + 1px
downward translate, brightness dip on press) — genuinely nothing to add
there, just re-verified it in this session's tests. "Unavailable or
completed number" states (e.g. graying out a digit once all 9 are
placed) do not exist anywhere in the codebase — per the request's own
"if they already exist" scope for that specific item, nothing was
added; inventing it now would have been a new feature, which was
explicitly out of scope.

**What was added:**
- **Selected-number identification:** the number pad now highlights
  the button matching the selected cell's current value with an accent
  ring (`.number-btn.is-current-value`) — the same visual language as
  the board's own accent-ringed selected cell and its soft
  matching-number tint (Phase 14k), just extended to the pad itself.
  `board-view.js` already computed `selectedValue` for the board's own
  match-highlighting; this reuses that same value rather than
  recomputing it.
- **Note-mode pad clarity:** switching Notes mode on now visibly
  changes all 9 number buttons (dashed accent border + accent digit
  color, `.number-pad.is-notes-mode .number-btn`), not just the
  toggle button's own label — so what a tap on the pad is about to *do*
  is clear before the tap, not just after.
- **Entry feedback:** a brief one-shot "settle in" pulse (scale
  0.8→1, opacity 0.4→1, 150ms) plays on a cell's digit the instant a
  value actually appears or changes there — covers both a fresh entry
  and directly overwriting an existing entry with a different digit
  (both real, already-supported flows). Implemented by capturing each
  cell's previously-rendered text before overwriting it each render and
  comparing; the animation only (re)plays when that text actually
  changed, using a remove-class → force-reflow → re-add-class sequence
  so it restarts cleanly even on rapid consecutive entries into the
  same cell. A module-level flag suppresses it for the very first
  render of a (re)started or restored game, so loading a save doesn't
  cascade a pulse across every already-filled cell.
- **Invalid-entry feedback:** a brief one-shot shake (`translateX`,
  max 3px amplitude, decaying over 2-3 oscillations, 300ms — a new
  `--duration-shake` token) plays the instant a cell's entry first
  becomes wrong (immediate error checking on), using the same
  before/after diffing technique against each cell's previous
  `is-error` state — so it fires exactly once per mistake and never
  repeats while the player works out the fix, which would read as
  nagging/flashing.

**Motion discipline:** both new animations only ever touch
`transform`/`opacity`/color — never a layout-affecting property, so
neither can introduce a layout shift or contend with anything else on
the page. Both are automatically neutralized by the existing sitewide
`@media (prefers-reduced-motion: reduce)` override (forces
`animation-duration` to ~0 and `animation-iteration-count` to 1) —
no new gating logic needed, same infrastructure the completion
celebration and menu background already rely on. Neither animation is
implemented with any `setTimeout`/blocking JS — they're fire-and-forget
CSS keyframes triggered by a synchronous `classList` toggle, so no
input is ever delayed waiting on one to finish, and rapid consecutive
keypresses (tested: 6 digits typed back-to-back with zero pause) all
register immediately with zero drops.

**Verification:** `npm test` 181/181. A new Playwright script
confirmed: selecting a clue highlights exactly its digit on the pad and
clears when an empty cell is selected; notes mode toggles the pad's
border style on and reverts it off; the entry pulse fires on a genuine
value change and does *not* start a new running animation
(`getAnimations()`, not just class presence — the class is deliberately
left attached after an animation finishes since that's visually
harmless) on an unrelated re-render; the shake fires once on becoming
wrong and does not fire again on a later re-render while the cell is
still (not newly) wrong; `prefers-reduced-motion` forces both new
animations' durations near zero; the existing number-button press
transform is still present; and 6 rapid-fire keyboard digit entries
into 6 different cells all land correctly with no drops in ~100ms
total. Screenshotted both a mouse click (number pad) and a touch tap
mid-animation to visually confirm the shake and pulse render correctly
via both input paths. Re-ran the full existing regression suite
(`final-playtest.mjs`, `grid-gap-audit2.mjs`, `sbg-verify.mjs`, the
Phase 14k board-scaling checks) — zero regressions. `sw.js`
`CACHE_NAME` bumped `v12` → `v13`.

**Files changed:** `styles.css`, `js/ui/board-view.js`, `sw.js`,
`TASKS.md`, `DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14k: Sudoku Board Cell-State Visual Hierarchy

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A visual-only refinement of the Sudoku board's cell states — default,
selected, related row/column/box, matching-number, fixed clue, player
entry, notes, and conflict — with an explicit constraint: no changes to
puzzle generation, validation, difficulty, or game rules. Everything in
this phase lives in `styles.css`; `js/ui/board-view.js` and
`js/game-state.js` were read to understand exactly which classes get
toggled and why, but neither was edited.

**Audit first:** wrote a Playwright scenario script that starts a real
game and, via `game-state.js`'s own exported functions (`selectCell`,
`applyNumberInput`, `toggleNote`, `getPeerIndices` — not by poking the
DOM or forging state), assembles every state at once on one board: a
selected cell with its row/column/box highlighted, a genuine structural
conflict (a duplicate value placed against a real peer), a cell with
notes, and matching-number cells sharing the selected clue's digit.
Screenshotted this in both color modes before touching any CSS.

Two real issues fell out of that screenshot, not assumption: the
"matching number" tint (`--color-cell-match: #fde68a`) was the single
most saturated color anywhere on the board — louder than the selected
cell itself, the opposite of "keep matching-number highlights subtle."
And the selected cell's soft blue fill read as barely distinguishable
from the related row/column's tint at a glance — both were flat
background-only tints competing on saturation with nothing to make
selection unambiguously outrank them.

**Cell-state hierarchy changes:**
- Selected cells gained an accent-colored inset ring
  (`box-shadow: inset 0 0 0 var(--cell-ring-width) var(--color-accent)`)
  layered on top of the existing soft blue fill — a second, structural
  channel (not just a stronger color) that makes selection unmistakably
  the top of the hierarchy. Related and matching cells deliberately stay
  ring-free flat tints, so they read as subordinate/subtle by
  construction, not just by convention.
- `:root`'s (Light theme pack) `--color-cell-match` softened from
  `#fde68a` to a muted warm cream `#f3e8c9` — brings it in line with how
  subdued the same token already was in Cyber (`#f3e3ee`), Woodgrain
  (`#e0b975`), and Paper (`#e8d9b0`); none of those or any dark-mode
  variant needed changing, they were already appropriately quiet.
- Conflict cells keep their existing red inset ring (now sharing the
  same `--cell-ring-width` token as selection, tokenized instead of a
  hardcoded `2px`) — declared after `.is-selected` in source order, so
  a cell that's both selected and in conflict shows the more urgent
  error-colored ring while the selected background tint still shows
  through underneath.
- Fixed clues vs. player entries now differ on three channels instead
  of two: entered digits are italic at semibold weight (reads as
  "handwritten in"), fixed clues are upright at extrabold weight
  (widened from bold) and their own color — distinguishable even in
  grayscale or for a color-vision-deficient player, not dependent on
  the blue/near-black color pairing alone.
- Added a `--duration-board: 0.15s` token (the requested 120-180ms
  range) and applied it as a `background-color`/`box-shadow` transition
  on `.cell` and a `color` transition on `.cell-value` — previously
  every cell-state change (selecting a cell, a conflict appearing)
  snapped instantly with zero transition. Purely visual properties
  (background-color, box-shadow, color never affect box size), so
  rapid arrow-key navigation across many cells never causes a layout
  shift, just a quick, calm color/ring settle.
- Tokenized the selection/conflict ring width as `--cell-ring-width`
  alongside the board's existing `--board-gap-width`/`--board-line-
  width` tokens rather than a repeated magic number.
- 3×3 box boundaries, the "no border on every ordinary cell" default,
  and notes rendering were already correct and needed no change —
  notes got one small legibility bump (`font-weight: semibold` on the
  tiny digits) since they're otherwise unrelated to this pass.

**A real bug found while verifying "scales cleanly on narrow mobile
screens":** at a short viewport (320×568 tested, but any height-
constrained case), the board was silently squashed into a non-square
rectangle (measured 288×119px, a 2.4:1 ratio) instead of staying
square. Root cause: `.board` has `overflow: hidden` (needed to clip the
grid to its rounded corners) — per the flexbox spec, a flex item with
non-visible overflow gets its automatic flex-shrink minimum floored at
`0` instead of at its `aspect-ratio`-derived size, so on a height-
starved flex column the browser was free to compress it far below
square instead of letting `.screen`'s own `overflow-y: auto` scroll the
remaining content into view the way it does for everything else on that
screen. Confirmed via `git stash` that this reproduces identically on
the prior commit with zero other changes — a genuine pre-existing bug,
not something the state-hierarchy work introduced — and fixed with a
single `flex-shrink: 0` on `.board`.

**Verification:** `npm test` 181/181 (puzzle logic untouched). A new
Playwright script confirmed: `.cell`'s transition-duration measures
150ms; ten cells' bounding rects are pixel-identical before and after a
selection change (zero layout shift); the selected cell has a non-none
box-shadow while a related cell has none; selected and related
backgrounds are genuinely different colors; a fixed clue is upright/
extrabold while an entered digit is italic/semibold in a different
color; the 3×3 `grid-line-left` border is still present. A second script
confirmed the board is exactly square (aspect ratio 1.000) with zero
horizontal page overflow at 320/390/768/1280/1920px and in a short-
landscape-phone viewport, both before and after the `flex-shrink: 0`
fix (broken before, fixed after — confirmed the difference directly).
Screenshotted the full multi-state scenario across all 4 theme packs ×
both color modes. Re-ran the full existing regression suite
(`final-playtest.mjs`, `grid-gap-audit2.mjs`, `sbg-verify.mjs`) with
zero regressions. `sw.js` `CACHE_NAME` bumped `v11` → `v12`.

**Files changed:** `styles.css`, `sw.js`, `TASKS.md`,
`DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14j: Consolidated Control Interaction States

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A pass over every clickable control in the app — menu buttons, dialog
buttons, the number pad, board toolbar, difficulty tabs, option tiles,
the skip button, and board cells — to make default/hover/pressed/
keyboard-focus/disabled/selected states consistent, calm, and reused
from one shared system instead of each component quietly diverging.
Explicit constraints from the request: no new controls, no navigation
changes, every existing button/label/`aria-*` preserved exactly.

**Audit first:** read the whole stylesheet plus every JS file that
toggles `disabled`, `aria-selected`, or `aria-pressed`
(`board-view.js`, `menu.js`, `difficulty-filter.js`) to build a
complete inventory of clickable controls and where their states were
already handled vs. missing. Found: `.number-btn` and `.skip-btn` had
no `transition` at all (their hover/press changes snapped instantly);
`.menu-nav button:disabled` and `.btn-primary/.btn-secondary:disabled`
were two copies of the same values; `#btn-notes-toggle[aria-pressed]`
and `.difficulty-filter-btn[aria-selected]` were two copies of the
same "selected" look; keyboard focus on a Settings dialog radio/
checkbox only ever ringed the tiny 1.1rem input, not the tile around
it; only the menu's "New Game" button had any elevation (`box-shadow`)
for a primary action, so "primary" didn't read consistently app-wide.

**Interaction system (`styles.css`):**
- New tokens: `--press-scale: 0.98` and `--press-translate-y: 1px`
  (within the requested 0.97-0.99 scale range), reusing the existing
  `--duration-fast` (200ms — inside the requested 120-220ms window)
  for every transition instead of inventing a separate timing token.
- One shared transition declaration
  (`background-color, color, border-color, box-shadow, transform` at
  200ms `ease`) now covers `.menu-nav button`, `.btn-primary`,
  `.btn-secondary`, `.number-btn`, `.difficulty-filter-btn`,
  `.option-tile`, and `.skip-btn` — replacing five near-identical
  per-component transition lists (and adding one to the two controls
  that had none).
- Pressed/`:active` state redesigned to match the requested direction:
  `transform: translateY(1px) scale(0.98)` plus `box-shadow: none`
  (the "subtle shadow reduction while pressed" cue — reads as the
  control settling flush against its surface) and a light
  `filter: brightness(0.94)` for color feedback. No bounce, no ripple,
  no glow. Board cells keep their own brightness-only press treatment
  (documented reason unchanged: they sit edge-to-edge in a grid, so
  scaling one down would open a visible gap against its neighbors).
- `.btn-primary` gained `box-shadow: var(--shadow-sm)` as a baseline,
  so every primary action in the app (dialog confirm buttons, pause
  overlay's Resume, the update banner's Refresh, the completion
  dialog's New Game) reads as the same elevated "primary" style the
  menu's New Game button already had, and the press-state shadow
  reduction has something real to reduce everywhere it appears.
- Disabled state consolidated into one rule covering
  `.menu-nav button`, `.btn-primary`, and `.btn-secondary` (previously
  two copies of identical values).
- "Selected" state consolidated into one rule covering
  `#btn-notes-toggle[aria-pressed="true"]` and
  `.difficulty-filter-btn[aria-selected="true"]` (previously two
  copies of identical values) — both read as the same accent-filled
  "on" look.
- Added `touch-action: manipulation` to the global `button` reset (not
  just `.cell`/`.number-btn` individually) so no control in the app has
  a tap-delay/double-tap-zoom window on touch.
- Added `.option-tile:has(input:focus-visible) { outline: ... }` so
  tabbing to a theme/mode/gameplay radio or checkbox rings the whole
  tile, matching every other control's focus ring — progressive
  enhancement, same pattern as the existing `:has(input:checked)`
  selected-state rule; browsers without `:has()` still show the
  input's own native focus ring.
- Hover stayed exactly as it already was: gated behind
  `@media (hover: hover) and (pointer: fine)`, which is what prevents
  a tap on a touch device from leaving a "stuck" hover state — this
  was already correct, just re-verified and re-documented while
  reorganizing the section.
- No HTML changes anywhere — no new controls, no navigation changes,
  every button's accessible label and every `aria-*` attribute is
  untouched.

**Verification:** wrote a new Playwright script exercising mouse,
keyboard, and touch-emulated input against the menu, Settings dialog,
Statistics screen, and game screen: measured the New Game button's
`transition-duration` at 200ms; measured its pressed `transform` as
`matrix(0.98, 0, 0, 0.98, 0, 1)` (i.e. exactly `scale(0.98)
translateY(1px)`) with `box-shadow` reduced to `none`; confirmed a real
keyboard Tab shows a solid `:focus-visible` outline on both the New
Game button and a Settings option-tile; confirmed a touch tap leaves no
stuck hover filter; confirmed Continue Game's disabled state
(`cursor: not-allowed`); confirmed the Notes toggle's `aria-pressed`
selected style and the difficulty tabs' selected/unselected contrast;
confirmed board cells never receive a scale/translate transform;
confirmed every checked touch target (New Game, Settings, number pad,
difficulty tabs, option tiles) measures at least 44×44px; confirmed
all 5 menu buttons keep their readable text labels. All checks passed.
Also re-ran the full existing regression suite (`npm test` 181/181,
the Phase 14 playtest suite, the grid-gap/centering audit, and the
menu-background suite) with zero regressions, and visually spot-checked
the menu in Light and Cyber-dark, the Settings dialog's keyboard-focus
ring, and the game screen's toolbar/number-pad states. `sw.js`
`CACHE_NAME` bumped `v10` → `v11`.

**Files changed:** `styles.css`, `sw.js`, `TASKS.md`,
`DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14i: Main Menu Typography & Hierarchy Refinement

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A CSS-only refinement of the title (Start) screen and main menu,
requested explicitly as typography/layout polish with hard constraints:
no navigation or feature changes, no new external fonts, every existing
menu action preserved, and responsive sizing via `clamp()` or
equivalent across small phones through desktop.

**Audit first:** screenshotted the Start and Menu screens at five
viewport sizes (320×568, 390×844, 768×1024, 1280×800, 1920×1080) before
touching any CSS. Found two real issues: (1) the Inspire logo on the
Start screen (`width: min(70%, 16rem)`, up to 256px) visually
outweighed the "Sudoku by Inspire" title beneath it, inverting the
hierarchy the request asked for (app title should outrank INSPIRE
branding); and (2) a grep across the whole stylesheet turned up exactly
one `line-height` declaration in the entire file (unrelated, on note
digits) — heading and prompt text had no explicit line-height at all.

**Typography changes (`styles.css`):**
- `.brand` (title): font-size changed from a fixed `--font-size-13`
  token (with a desktop-only media-query bump to `--font-size-14`) to a
  single fluid `clamp(var(--font-size-13), 1.7rem + 1.3vw,
  var(--font-size-14))` — both ends still anchored to the existing
  numbered type scale, just interpolated smoothly between a 360px and
  960px viewport instead of jumping at one breakpoint. Added
  `line-height: 1.1` (tight/confident, previously unset).
- `.brand--compact` (the menu screen's smaller title): same treatment,
  `clamp(var(--font-size-11), 1.2rem + 0.5vw, var(--font-size-12))`.
- `.start-prompt`: font-size changed to `clamp(var(--font-size-7),
  0.85rem + 0.4vw, var(--font-size-9))`, plus `line-height: 1.4` for
  comfortable reading — as a side effect this also let the prompt text
  fit on one line at 320px width instead of wrapping to two.
- `.start-logo`: shrunk from `min(70%, 16rem)` to `clamp(6rem, 22vw,
  9rem)` (max 144px vs. the old 256px) so it reads as a supporting
  brand mark under the title, not a competing graphic — restores the
  requested hierarchy order (title > INSPIRE branding > primary action
  > secondary controls).
- `.menu-nav` max-width: changed from a fixed 20rem (mobile) / 24rem
  (desktop, via media query) to `clamp(18rem, 60vw, 22rem)`, keeping
  the button column fluid while capping it slightly tighter on desktop
  than before.
- Removed the now-redundant `.brand { font-size }` and `.menu-nav {
  max-width }` overrides from inside `@media (min-width: 768px)`, since
  the new clamp() expressions already cover that range. Left every
  other rule in that block (`.difficulty-filter`, `body`, `#app`,
  `.screen`) completely untouched.
- Deliberately did **not** apply clamp() to `.menu-nav button` font-size
  (interactive controls read better with fixed, predictable text than
  fluid display-type scaling) and did **not** touch `.brand::after` (the
  small fixed accent underline doesn't need to scale with the heading).
- No HTML changes. No new fonts — everything still uses the existing
  system font stack and the existing `--font-size-*` token scale.

**Verification:**
- Re-screenshotted the Start and Menu screens at the same five viewport
  sizes; visually confirmed the improved hierarchy (logo now reads as
  a supporting mark, title is the dominant element) and no leftover
  dead space or overflow.
- Playwright checks at all five sizes: zero horizontal or vertical page
  overflow (`document.documentElement.scrollWidth/Height` vs.
  `clientWidth/Height`), and all five menu buttons (`btn-new-game`,
  `btn-continue-game`, `btn-statistics`, `btn-highscores`,
  `btn-settings`) present with correct IDs — confirms zero navigation/
  feature regression.
- `npm test`: 181/181 passing.
- Full Phase 14 regression playtest (`final-playtest.mjs`) and the
  menu-background restriction/animation suite (`sbg-verify.mjs`): all
  checks passing, zero console/page errors.
- `sw.js` `CACHE_NAME` bumped `v9` → `v10` so existing installs pick up
  the change.

**Files changed:** `styles.css`, `sw.js`, `TASKS.md`,
`DEVELOPMENT_LOG.md`.

---

## 2026-07-30 — Phase 14h: Light/Dark Palette Polish

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A focused color pass on the base "Light" theme pack's two color modes,
using the token system Phase 14g had just finished consolidating —
explicitly scoped to `:root` (light) and `[data-mode="dark"]` (dark),
not the Cyber/Woodgrain/Paper theme packs (each already has its own
warm/parchment/dark-technical identity by design and wasn't in scope).

**Why this was worth doing carefully, not just by eye:** the old light
palette was flat and slightly cold — `--color-bg: #eef0f2` and
`--color-panel`/`--color-surface` were both literally `#ffffff` (i.e.
not actually distinct from each other, despite being two different
tokens), and the old dark palette, while already reasonably good
(`#121212` isn't literally pure black), had room to feel more
deliberately "graphite" rather than just "dark gray." The request came
with a specific brief: warm neutral background in a named hex range,
distinct surfaces for cards/menus/controls/board, graphite (not pure
black) dark mode, comfortable off-white (not harsh pure white) dark
text, one consistent accent, refined borders/shadows, accessible
contrast throughout.

**Approach:** designed candidate palettes in HSL for controlled warm-
neutral (light) and cool-graphite (dark) generation, then wrote a small
WCAG contrast script (relative luminance + contrast ratio, same
formula used in the Phase 11 and Phase 14c audits) and checked every
text/UI-role color against every background it actually appears on
before writing any CSS — not tuned by eye and hoped for the best.

**Light mode result:**
- `--color-bg: #f6f4ef` (outer page — the most muted of the three)
- `--color-panel: #fcfaf8` (the #app card, dialogs — brightest/cleanest,
  the primary content surface)
- `--color-surface: #edeae6` (buttons, tiles, stat cards — a step more
  muted than panel, so controls read as a distinct recessed layer
  instead of blending into the card they sit on)
- `--color-border: #c2b9ad` (darkened from `#d0d3d6`)
- `--color-text: #2d261f` / `--color-text-secondary: #685e55` (warm
  near-black / warm mid-gray, replacing flat `#1a1a1a`/`#55595e`)

**Dark mode result:**
- `--color-bg: #161618`, `--color-panel: #1f1f23`, `--color-surface:
  #2a2a2f` — three deliberately elevated graphite steps (verified
  distinct via contrast math, not just eyeballed)
- `--color-border: #51515c` (lightened from `#3a3a3a` for legibility
  against the deeper background)
- `--color-text: #edebe8` (comfortable off-white, replacing the
  slightly harsher `#f0f0f0`) / `--color-text-secondary: #aeaaa2`

**What was deliberately left unchanged:** the accent (`#2b6cb0` light /
`#5b9bd5` dark) and focus-ring colors — checked first whether they
still cleared 4.5:1 against every *new* surface before deciding, and
they did (4.52-6.10:1 across the board), so retuning them would have
been change for its own sake, and the brief specifically asks to keep
one consistent accent rather than adjust it alongside the neutrals.
Board digit/state tokens (clue-fixed, entry-player, notes, cell-
selected/related/match) were also verified against the new panel color
and left alone — all still comfortably clear contrast, and the soft
state-highlight tints still pair correctly with their existing
structural cues (a ring/border, not color alone — the Phase 4 rule).
One exception: dark-mode `--color-cell-related` was updated from
`#232326` to `#2a2a2f` to stay in sync with the new `--color-surface`
— the two were literally the same hex in the original palette, by
design (a "related" cell reads as a neutral-surface-toned highlight),
not a coincidence worth breaking.

**One real, if narrow, accessibility fix along the way:**
`--color-success` (light) measured 4.48:1 against the new
`--color-surface` — a hair under WCAG AA's 4.5:1 minimum for normal
text. Darkened from `#1f7a3d` to `#1a7039`, which clears it with real
margin (5.1-5.9:1 against all three surfaces) instead of skating the
line.

**Shadows:** `--shadow-color` warmed slightly in light mode (a cool
navy `rgba(15,23,42,0.14)` didn't sit as naturally against the new warm
surfaces as a warm dark brown at slightly lower opacity,
`rgba(40,32,20,0.12)`) and softened a touch in dark mode (`0.55` →
`0.5` opacity — a graphite background already reads as "dark," so
shadows don't need to work as hard to show elevation).

**Verification:**
- Full WCAG contrast audit (script-based, not eyeballed) for text,
  text-secondary, success/warning/error, accent, and border against
  every background they actually appear on (bg/panel/surface) — every
  text-role pairing clears 4.5:1+, borders improved over the previous
  (already-accepted, already-documented-as-intentionally-subtle)
  1.3-1.65:1 range to roughly 1.6-2.3:1.
- Confirmed Cyber/Woodgrain/Paper and System mode are unaffected:
  checked each theme pack's computed `--color-bg` after the edit
  (unchanged) and that System mode still resolves to the new Light-pack
  values correctly.
- Visual verification via Playwright screenshots: main menu, game
  board, and the Settings dialog (which best shows the panel/surface
  distinction via its option tiles), in both light and dark mode, on
  both a desktop and a mobile viewport — board digits, grid lines, and
  button hierarchy all read cleanly in every shot.
- Full regression: `npm test` 181/181; the complete Phase 14 playtest
  suite; the grid-gap/digit-centering audit; the menu-background
  restriction, animation, and reduced-motion tests; the audio
  crossfade/recovery tests — all unchanged, all passing.
- `sw.js` `CACHE_NAME` bumped `v8` → `v9`.

---

## 2026-07-30 — Phase 14g: Design Token Consolidation

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

An explicitly scoped request: review the codebase, find duplicated
styling values, and consolidate them into reusable design tokens —
"do not redesign yet beyond consolidating safe design variables." Read
as a strict constraint: every value substitution had to render pixel-
identically to what it replaced.

**Audit.** `styles.css` is the only stylesheet in the project (1,600+
lines). Colors, spacing (`--space-1..5`), and the three non-pill radii
were already fully tokenized from earlier phases — this pass's actual
job was everything the earlier token block's own header comment didn't
cover: shadows, typography, motion. Grepped every `box-shadow`,
`font-size`, `font-weight`, `letter-spacing`, `border`/`border-radius`,
`transition`, and `animation` line to build an exact inventory before
touching anything:

- 4 distinct `box-shadow` patterns, reused 2-3x each across buttons,
  chips, the update banner, the settings dialog, and the desktop `#app`
  card.
- 14 distinct `font-size` values (excluding two `clamp()` expressions on
  the board's digits), several duplicated 2-5x (`0.85rem` alone: 5
  places).
- Exactly 3 `font-weight` values (600/700/800) used 20 times combined.
- 3 `letter-spacing` values, one (`0.05em`) reused 4x.
- `1px solid <color>` borders at 14 separate call sites.
- `0.2s ease` on 7 different `transition` declarations; `0.8s ease`,
  `0.5s ease-out`, and `26s ease-in-out` each used for a specific
  one-shot or ambient animation.

**Tokens added**, all theme-independent (in `:root`, alongside the
existing `--space-*`/`--radius-*` tokens): a 4-tier shadow scale built
on top of the existing `--shadow-color` so it still recolors correctly
per theme (`--shadow-sm/md/lg/panel`); a 14-step numbered type scale
(`--font-size-1` through `-14`) — numbered rather than t-shirt-sized
because there are more distinct steps here than `sm/md/lg` comfortably
covers, following the same numbering convention `--space-N` already
established; 3 font-weight tokens; 3 letter-spacing tokens;
`--border-width-thin` (1px, the pervasive chrome border) and
`--focus-ring-width` (3px); `--radius-pill` (999px); 4 motion durations
and 4 easings. Two more tokens — `--board-gap-width` (2px) and
`--board-line-width` (3px) — were deliberately kept *local* to `.board`
instead of joining the global scale: they exist for the specific,
already-documented DPI-legibility reason from Phase 14c, and just
happen to share a number with unrelated global concepts (the focus ring
is also 3px) — folding them together would create a false coupling
where changing one could someday silently resize the other.

**What was deliberately left alone**, each already documented in-code:
the two `clamp()` font-sizes on board digits (responsive, single-use,
structurally different from a flat token); the non-themed overlay
colors on `.skip-btn`, `.pause-overlay`, and dialog `::backdrop`s (their
whole point is guaranteed contrast against arbitrary video frames or a
dimmed background, independent of the active theme); the single-use
inset shadow on `.cell.is-conflict` (a functional state ring, not a
decorative elevation shadow).

**Mechanical replacement**, done with small Python regex passes per
category (not hand-editing 90+ call sites individually) to keep the
substitutions exact and verifiable: 28 font-size, 20 font-weight, 6
letter-spacing, 14 border-width, 5 box-shadow, and 22 transition/
animation duration+easing declarations swapped for their token, each
pass grepped immediately afterward to confirm the count matched and no
stray literals remained.

**Verification — this was the part actually worth being careful about.**
"Preserve current architecture and functionality" for a token-only pass
means the computed output has to be provably unchanged, not just
visually similar on a glance. Snapshotted `getComputedStyle()` (font
metrics, shadows, borders, radii, transition/animation timing) for ~20
representative selectors across all 8 theme/mode combinations *before*
making any edit — using `git stash` to briefly get the pre-edit file
back onto disk for that one snapshot, then restoring the edit. Diffed
that baseline against the same snapshot taken after. Ten properties
differed at first glance; every one traced to test methodology, not the
edit itself:

- `.cell-value`'s font-weight/color flipped between runs because the
  snapshot script queried the *first* `.cell-value` in DOM order, and
  each run generates a fresh random puzzle — sometimes that cell is a
  fixed clue (bold, `--color-clue-fixed`), sometimes a blank entry
  (regular weight, `--color-entry-player`). Confirmed by diffing the
  *post-edit* code against itself twice: the identical kind of "diff"
  reappeared with zero code changed in between.
- `.option-tile`'s `backgroundColor` (Woodgrain/Paper themes, whose
  `--color-panel`/`--color-surface` are CSS gradients) shifted by small
  amounts between runs. `getComputedStyle().backgroundColor` isn't
  guaranteed pixel-stable for a gradient-only background — same proof
  as above, running the *same* already-edited code twice reproduced
  equivalent noise.

With both explained and reproduced as pre-existing nondeterminism, the
real result stands: every shadow, font-size, font-weight, letter-
spacing, border-width, and transition/animation timing value matched
exactly, before and after, everywhere.

**Checks run:** `npm test` 181/181; `node --check` on every `.js` file;
the full Phase 14 regression playtest suite (all themes/modes, all
difficulties, full input surface, completion, reload/Continue); the
9-viewport grid-gap/digit-centering audit; the audio crossfade/recovery
regression tests; the menu-background restriction/animation/reduced-
motion tests — all unchanged, all passing. `sw.js` `CACHE_NAME` bumped
`v7` → `v8` (CSS changed).

**Explicitly not done, per the request's own scope:** no visual
redesign, no merging of the near-duplicate font-sizes that sit oddly
close together (`0.8rem`/`0.85rem`, `0.9rem`/`0.95rem`, `1.05rem`
sitting almost alone between `1rem` and `1.15rem`) — flagged as
"visual inconsistencies found" for a future intentional type-scale
pass instead of silently resolved now, exactly as asked.

---

## 2026-07-30 — Phase 14f: Fix Root Cause of Android Audio Cut-Outs

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Direct follow-up: the user was still hearing background music cut off,
now specifically tested on a real Android phone rather than desktop —
meaning Phase 14d's fix (a per-track `pause` event listener plus a 2s
safety-net poll) wasn't actually catching the failure mode Android hits.

**Diagnosis.** Re-read Phase 14d's recovery logic with fresh eyes: both
the `pause` listener and the poll checked `track.element.paused` and
called `track.element.play()` if it was `true` — but neither ever
touched the shared `AudioContext`'s own state. Android is known to
suspend a page's AudioContext readily whenever it reclaims audio focus
— locking the screen, an incoming call, another app grabbing the
session — and critically, when *only* the context suspends (not the
element itself), the `<audio>` element keeps reporting `paused: false`
throughout, because from the element's own perspective it never
stopped. That means Phase 14d's checks would see "looks fine" and do
nothing, while the AudioContext being suspended means literally nothing
reaches the speakers — total silence despite every one of the app's own
signals saying playback is fine. That mismatch — "the element thinks
it's playing, the destination is deaf" — is exactly what "gets cut off"
would sound like from the outside, and desktop testing never surfaces
it because desktop browsers are far less aggressive about suspending
contexts than Android is.

Verified this diagnosis concretely rather than assuming it: wrapped the
`AudioContext` constructor in a Playwright `addInitScript` spy to get a
real handle on the exact instance the app creates, called `.suspend()`
on it directly (not `.pause()` on the element — deliberately replicating
only the context-level interruption), and confirmed `element.paused`
stayed `false` the entire time. That's precisely the blind spot Phase
14d's checks had.

**Fix (`js/audio.js`):** consolidated the pause listener, the safety-net
poll, and a new `AudioContext.addEventListener('statechange', ...)`
handler into one shared `recoverMusicPlayback()` function that always
calls `ensureContextRunning()` (which resumes the context if
suspended) *before* checking whether the element itself also needs a
fresh `.play()`. The `statechange` listener is the fast path — it fires
the moment the browser reports the context transitioning, rather than
waiting up to 2 seconds for the poll to notice.

**Verification:**

- Re-ran the exact `.suspend()` simulation and confirmed the context
  recovers to `state: 'running'` automatically — timed it at ~50ms,
  confirming the `statechange` listener (not the slower poll) is doing
  the work.
- Re-ran every audio regression test from Phase 14b/14d unchanged: the
  external-`.pause()` simulation, the pause-overlay music crossfade, the
  "settings mid-game" and "rapid digit entry" reproductions, and the
  tab-hidden-stays-silent/resumes-on-visible test — all still pass, so
  this fix is additive and doesn't disturb any of the previously-fixed
  paths.
- `npm test`: 181/181. `node --check` on every JS file: clean. Full
  Phase 14 regression playtest suite: unchanged, all passing.
- `sw.js` `CACHE_NAME` bumped `v6` → `v7`.

**Scope decision:** considered adding the same recovery pattern to the
intro video, but didn't — it's a one-shot playback at app start (an
interruption there just means a frozen frame once, not a repeatedly-
breaking background loop), and it already has complete error/rejection
→ fallback-to-menu handling from Phase 1.

---

## 2026-07-30 — Phase 14e: Animated Sudoku-Digit Menu Background

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A fifth direct feature request: a subtle, animated Sudoku-digit texture
drifting behind the main menu, and only the main menu, with a fairly
detailed spec (opacity range, speed range, seamless looping, edge fade,
reduced-motion handling, mobile performance, no leaking into gameplay).

**Design decisions and why:**

- **CSS `mask-image` on one element, not a DOM grid of digits.** The
  spec asks for both "cover the screen with a drifting pattern" and
  "limit the number of rendered elements for mobile performance" —
  those pull in opposite directions if you build it as individual digit
  elements (covering a diagonally-scrolling viewport with headroom for
  the drift needs dozens to hundreds of them). A single element with a
  `mask-image` sidesteps the conflict entirely: `mask-repeat: repeat`
  tiles a small SVG pattern natively and pixel-perfectly, so the DOM
  cost is fixed at 2 elements regardless of how much area it covers.
- **The mask only carries shape, not color.** The referenced SVG draws
  the digits in plain black, but what actually reaches the screen is
  `background-color: var(--color-text-secondary)` clipped through that
  shape — so the pattern automatically follows whichever theme is
  active (it's the same "ink" token already used for the real board's
  grid lines) without needing a colored variant per theme.
- **Seamless loop by construction.** The animation translates the
  pattern by *exactly* one tile period (`--sbg-tile`, 420px) diagonally
  down-left. Since the mask repeats infinitely across the (deliberately
  oversized-by-one-tile) element, the frame at "moved by one full tile"
  is pixel-identical to the frame at "moved by zero" — the loop doesn't
  need any crossfade or special-casing, the two endpoints just happen
  to render the same.
- **Lives inside `#screen-menu`'s own DOM subtree**, as the first two
  children, rather than as a separate globally-mounted element toggled
  by JS. This app already has a single, well-tested mechanism for
  "only show this on one screen" — `.screen[hidden] { display: none }`
  — and putting the background inside that screen's own subtree gets
  the exact same guarantee for free: it structurally cannot render
  while any other screen (including the game screen) is active, with
  zero new JS logic to get wrong.

**Real bug found and fixed during implementation.** The pattern was
completely invisible on first build — not just "hard to see because
it's subtle," confirmed by temporarily boosting `--sbg-opacity` to 0.6
for debugging and still seeing nothing. Root cause: `.menu-sudoku-bg`
had `z-index: -1` (needed to paint it behind `#screen-menu`'s normal-
flow children — position:absolute elements otherwise paint *above*
static content by default, regardless of DOM order), but `#screen-menu`
only had `position: relative` set, not an explicit `z-index`. Per the
CSS stacking-context rules, `position: relative` alone does *not*
establish a new stacking context — only `position` combined with a
non-`auto` `z-index` does. Without that, the `-1` had no local
"stacking floor" to stop at, so it escaped upward past every ancestor
(`#app`, `body`, ...) looking for the nearest one that *did* establish a
stacking context, and ended up painting behind the very first opaque
background it found — invisible. Reproduced this in isolation (a
minimal standalone HTML page replicating just the stacking structure)
before touching the real CSS, confirmed the exact same failure, then
confirmed the fix (`#screen-menu { position: relative; z-index: 0; }`)
resolved it in that isolated case before applying it to the app.

**Checks run:**

- Isolated visual verification of the SVG tile pattern (rendered
  standalone, 2x2 tiling) before wiring it into the app, to confirm the
  loose-Sudoku-with-blanks look and seamless tiling independent of any
  app-integration bugs.
- Full restriction test: confirmed via `getBoundingClientRect()` (not
  `getComputedStyle().display`, which reports an element's own resolved
  display regardless of an ancestor's `display: none` and would have
  given a false pass here) that the background renders zero-size on the
  Start screen, has no presence inside Statistics/High Scores/Game
  screens' subtrees, and that `#screen-menu` itself is `display: none`
  (unmounted from rendering) the instant gameplay begins.
- Confirmed the New Game button is still the actual hit-test target at
  its own coordinates — the background never intercepts clicks.
- Confirmed the animation is genuinely running (sampled the computed
  `transform` matrix twice, 2 seconds apart, and it changed) and moving
  in the correct down-left direction (translateX growing more negative,
  translateY growing more positive).
- Confirmed `prefers-reduced-motion: reduce` sets `animationName: none`
  and the computed transform stops changing, while opacity stays > 0
  (a static pattern, not a removed one, per the request's own two
  allowed options).
- Confirmed exactly 2 elements are added to the DOM regardless of
  viewport size, and no page overflow is introduced (desktop and
  320px).
- Re-ran the full regression playtest suite, the real-audio crossfade/
  recovery checks, and the grid-gap/centering audit from prior phases:
  all still passing, unaffected by this round's changes.
- `npm test`: 181/181. `node --check` on every JS file: clean.
- `sw.js` `CACHE_NAME` bumped `v5` → `v6`.

---

## 2026-07-30 — Phase 14d: Mobile Music-Stops-Unexpectedly Fix

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A fourth direct feedback round, reported after the user played a real
game on a real mobile device — the first bug this session that only
showed up outside this sandbox's desktop-only headless testing.

**The report:** background music plays fine at first, but stops after
specific interactions: opening Settings and returning to the main menu;
selecting a number during gameplay; opening the menu during gameplay.
Explicit ask: fix the audio logic so the correct track "plays
consistently and loops during their appropriate times," while keeping
the fade in/out.

**Diagnosis.** Nothing in this app's own code intentionally pauses
music in response to any of those interactions — confirmed by tracing
every code path that touches a track's `.pause()` call (only ever the
*outgoing* track during a crossfade, or every track while the tab is
genuinely hidden) and every code path that could affect `activeTrackName`
resolution (screen changes, game-state pause/resume — neither of which
fires on "select a number" or "change a non-audio setting"). That
absence of any first-party cause, combined with the bug only appearing
on a real mobile browser and never in this session's desktop testing,
points at something *external* to the app: mobile browsers are known to
pause an already-playing `<audio>` element for reasons entirely outside
a page's control — a native `<dialog>` opening (Settings uses
`showModal()`), a brief OS-level audio-session interruption, even a
focus change onto a form control. This app had no mechanism to notice
when that happened, so a track interrupted this way just stayed silently
paused until some unrelated screen or settings change happened to
re-run `setActiveMusicTrack`/`updateMusicPlayback` and accidentally
re-sync it.

**Fix (`js/audio.js`):**

- Each track's `<audio>` element now has a `pause` event listener. Since
  this app's own code never intentionally pauses the *currently active*
  track (every explicit `.pause()` call either targets a track that has
  already stopped being `activeTrackName`, or runs specifically because
  the tab is hidden — in which case `canPlayMusicNow()` is also false),
  any `pause` event firing on the active track while `canPlayMusicNow()`
  is still true can only mean something external paused it. The
  listener just calls `.play()` again immediately.
- A low-frequency (2s) `setInterval` backs that up for the one gap the
  event can't cover: a `.play()` call whose promise silently rejected
  (every call site already swallows that rejection deliberately) never
  actually transitions the element *out of* paused, so no `pause` event
  fires for it at all. The poll catches that case within 2 seconds
  instead of leaving it stuck indefinitely.
- Both mechanisms defer to the exact same `canPlayMusicNow()` check
  already used everywhere else (mute setting + tab visibility), so
  neither one ever fights the intentional "stay silent" cases.

**Verification:**

- Simulated the exact browser-level behavior directly — grabbing a
  reference to the live `<audio>` element via a `HTMLMediaElement.
  prototype.play` patch and calling `.pause()` on it manually, the same
  effect a mobile OS interruption has — and confirmed both the menu
  track and the gameplay track auto-resume within under a second.
- Reproduced the user's literal repro steps in Playwright: started a
  game, opened in-game Settings, changed the theme, closed the dialog —
  gameplay music kept playing throughout (previously, with the bug
  un-fixed via a raw `.pause()` reproduction, it would have stayed
  silent). Selected five different numbers in a row — same result,
  music never stops.
- Re-verified the tab-hidden path is untouched by the new recovery
  logic: forced `document.visibilityState` to `'hidden'`, confirmed
  music stays paused across a full 2.5s window (crossing the safety-net
  poll interval), then confirmed it correctly resumes only once
  visibility flips back to `'visible'`.
- Re-ran the Phase 14b pause-overlay crossfade test and the Phase 14c
  smooth-fade verification: both still pass unchanged — the recovery
  mechanism is purely additive and doesn't alter the intentional
  crossfade/pause paths.
- `npm test`: 181/181. `node --check` on every JS file: clean. Full
  Phase 14 regression playtest suite: all passing, zero console/page
  errors.
- `sw.js` `CACHE_NAME` bumped `v4` → `v5`.

**Remaining limitations:** this fix addresses the general, well-known
class of "mobile browser silently paused our media" — it can't be
verified against the *exact* mobile browser/OS the user hit from this
sandbox (no real mobile device access here), but the mechanism is
robust to the underlying cause by design: it doesn't matter *why* the
track got paused, only that the app now notices and recovers.

---

## 2026-07-30 — Phase 14c: Smoother Fades, Real Desktop Grid Fix, Menu Icons

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A third direct user-feedback round: smoother music transitions, another
look at grid visibility ("display issues" specifically on desktop), more
menu polish, and the standing "test play to verify no bugs" instruction.

**Smoother music crossfades.** `js/audio.js`'s `fadeTrackGainTo()` switched
from `linearRampToValueAtTime` to `setTargetAtTime` (an exponential
approach toward the target), and `MUSIC_FADE_SECONDS` went from 1.2 to
1.8. Linear gain ramps sound abrupt near the end because loudness is
perceived roughly logarithmically, not linearly — the exponential curve
reads as genuinely smooth, and as a bonus it handles being re-triggered
mid-fade (e.g. a fast pause immediately after resume) without a click or
discontinuity, since it just keeps moving toward wherever the new target
is from wherever gain currently sits, rather than restarting a fixed-rate
ramp. Re-verified the full menu → gameplay → pause → resume sequence with
the same `play()`-observer technique from Phase 14b: still correct.

**Real bug fixed: board grid lines washed out on standard desktop
displays.** The user specifically said "on desktop" this time, which was
the right clue. Phase 14's fix (switching the 1px cell-gap color to
`--color-text-secondary`) was colorimetrically correct — but only ever
verified via `getComputedStyle()` contrast math, never actual rendered
pixels. Investigated by rendering the board at `deviceScaleFactor: 1`
(an ordinary 1x desktop monitor) vs `deviceScaleFactor: 2` (Retina-class)
and comparing screenshots: crisp at 2x, visibly faint at 1x, even though
the underlying color value never changed. Root cause: a genuine 1px CSS
line only ever paints as a true single device pixel at >=2x DPI; at 1x
the browser has to anti-alias a hairline across sub-pixel coverage,
which measurably washes out the color (confirmed with a
`getBoundingClientRect()` gap-precision audit across 9 viewport widths —
every gap was a mathematically exact 1px, so this was never a layout
bug, purely a sub-pixel rendering one). Fixed by widening the ordinary
cell gap from 1px to 2px, and the 3x3 box boundary lines from 2px to 3px
to keep them visibly heavier than the ordinary grid. Re-verified: clean,
solid lines at 1x DPI in every theme, gap widths a confirmed-exact 2px
across 9 viewport sizes, digit centering unaffected (still sub-2px of
true center).

**A genuine methodology bug in this session's own testing, found along
the way.** While investigating why the menu still looked "flat/gray" in
screenshots despite Phase 14b's hierarchy work, discovered that every
screenshot taken this session (including ones used to justify design
decisions) was capturing Phase 14's `.menu-fade-overlay` fade-from-black
*mid-transition* — the fade takes ~500-800ms to settle to the true
background color, and this round's screenshot scripts were only waiting
~200-300ms after reaching the menu. Confirmed by sampling actual PNG
pixel values (not `getComputedStyle`, which never changes during the
fade) at increasing delays: (56,56,56) at 0ms, (147,147,147) at 100ms,
(205,205,205) at 200ms, pure (255,255,255) by ~500ms — a clean, correct,
intentional fade the whole time, just measured too early. Fixed the
scratch test scripts' wait times; the app itself needed no change here.
This means some of Phase 14b's "the menu looks unfinished" framing was
overstated — the true, settled menu was already reasonably polished
before this round's icon work, though the icons are still a real
improvement.

**Third menu polish pass.** Added small inline SVG icons (play, clock,
bar-chart, 5-point star, sliders) before each nav button's label —
hand-authored geometric shapes (no traced/copied icon-library paths),
`fill`/`stroke="currentColor"` so each one automatically matches its
button's text color in every theme and the disabled state, `aria-hidden`
since the buttons already carry real text labels for assistive tech. No
new binary assets, zero runtime dependencies added.

**Checks run:**

- `node --check` across every `.js` file plus `sw.js`/`index.js`: clean.
- `npm test`: 181/181, unchanged.
- Real-audio crossfade + pause/resume verification (`play()` observer):
  still correct under the new fade curve, zero console errors.
- Grid-gap + digit-centering audit across 9 viewport widths (320px to
  1920px): every gap exactly 2px, centering offset ≤1.5px everywhere.
- 10-viewport × 4-theme overflow sweep: zero overflow cases.
- Full Phase 14 regression playtest suite: all passing after fixing one
  flake in the *test script itself* — a hardcoded guess digit
  occasionally coincided with the random puzzle's actual solution at
  that cell, so Hint was correctly disabled ("nothing to hint, this
  entry is already right") rather than incorrectly stuck; not an app
  bug, just a bad test fixture, fixed by computing a guaranteed-wrong
  digit instead of hardcoding one.
- `sw.js` `CACHE_NAME` bumped `v3` → `v4`.

**Remaining limitations:** same as Phase 14b — can't confirm the intro
video's audio is audible from this sandbox (codec limitation, not a code
issue).

---

## 2026-07-28 — Phase 14b: Pause Music, Real Video Audio, Menu Hierarchy

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A second direct user-feedback round, same day, continuing Phase 14's
thread rather than opening new scope.

**What was built:**

- **Pause-triggered music crossfade.** Opening the pause overlay
  mid-game (Escape, or tapping the overlay) now fades gameplay music out
  and menu music in, then crossfades back to gameplay on Resume.
  `js/audio.js` previously only switched tracks on `onScreenChange`
  (screen id), which never fires for pause/resume since the screen stays
  `'game'` the whole time — added `activeTrackForContext(screenId,
  gameStatus)` and `syncActiveMusicTrack()`, called both from
  `onScreenChange` and from the existing `onStateChange` reaction
  whenever `state.status` changes. Deliberately reads `getState().status`
  live rather than caching it: a fresh game's `showScreen('game')` fires
  *before* `startGame()` resolves (see `js/ui/difficulty-dialog.js`), so
  a cached status would leak the *previous* game's `'paused'` or
  `'complete'` state into the new game's very first track resolution.
  Verified end-to-end with a `HTMLMediaElement.prototype.play` observer:
  menu → gameplay → pause (menu track resumes) → resume (gameplay track
  resumes), zero console errors.
- **Real bug fixed: intro video was force-muted despite having real
  audio.** The user reported the intro plays with no sound. Rather than
  assume the file itself has no audio track (as Phase 14 had, based on
  the user's own description), inspected `inspiresoftwareintro.mp4`'s
  MP4 box structure directly this round: it contains exactly one `soun`
  handler and one `mp4a` codec box alongside the video track — a real
  audio track is genuinely present. The actual cause was
  `index.html`'s `<video>` element hardcoding the `muted` attribute.
  `playIntro()` already calls `video.play()` synchronously inside the
  Start screen's click/keydown gesture handler (see index.js's comment
  on why `initAudioEngine()` has to run there too), which is exactly the
  condition browsers require to allow *unmuted* autoplay — so removing
  `muted` is safe. Confirmed via Playwright that the video element no
  longer carries the attribute and the existing error/skip fallback path
  is unaffected; actual audible playback still can't be confirmed in
  this sandbox (this headless Chromium build lacks H.264/AAC decode
  support, documented back in Phase 1) and should be spot-checked by the
  user in a real browser.
- **Menu visual hierarchy.** Screenshotted the current menu across
  themes and found the real problem behind the user's repeated "make the
  UX/UI look better": five identically-styled accent-filled buttons with
  no hierarchy, sitting in a large mostly-empty card. Fixed by keeping
  New Game as the one solid-accent primary action and switching Continue
  Game/Statistics/High Scores/Settings to the `.btn-secondary` outline
  style already used for dialog buttons elsewhere (reused, not
  reinvented) — plus a small accent-colored divider under every
  `.brand` heading (shared by Start/Menu/Statistics/High Scores) for a
  consistent branded header, and more vertical breathing room on the
  menu screen (`#screen-menu` gap bumped to `--space-5`, nav button gap
  `--space-2` → `--space-3`).

**Investigated but found no code bug:** the user reported that scrolling
on desktop reveals the gameplay screen — the exact symptom of the
`#screen-game[hidden]` bug already fixed in Phase 14. Swept 10 realistic
desktop viewport sizes × 4 themes × before/after a real game session with
Playwright: zero overflow cases, `#screen-game` computed `display: none`
in every single case. The most likely explanation is a stale cached
build — `js/sw-register.js`'s "Update available" banner requires the user
to actually click Refresh before a new service-worker version's cached
JS/CSS take over an already-open tab (`sw.js`'s fetch handler serves
`styles.css`/`js/**` cache-first). Bumped `CACHE_NAME` `v2` → `v3`
regardless, since this round's HTML/CSS/JS changes need it anyway — if
the scrolling bug is still visible after this deploys, it's worth asking
the user to do a hard refresh / "Clear site data" to rule out cache
staleness before assuming a live regression.

**Checks run:**

- `node --check` across every `.js` file plus `sw.js`/`index.js`: clean.
- `npm test`: 181/181, unchanged (no pure-logic module touched).
- Real-audio crossfade verification (`play()` observer): menu track on
  reaching the menu, gameplay track on starting a game, menu track on
  pause, gameplay track on resume — all correct, zero console errors.
- 10-viewport × 4-theme overflow sweep, before and after playing a full
  game: zero overflow cases.
- Full Phase 14 regression playtest suite (all 4 difficulties, complete
  input surface, 8 theme/mode combinations, completion, reload +
  Continue, 320px keyboard-only): all passing, zero console/page errors.

**Remaining limitations:**

- Can't confirm the intro video is now actually *audible* in a real
  browser from this sandbox (codec limitation, not a code issue) — worth
  a manual spot-check.
- If the "scrolling reveals gameplay screen" report persists after this
  deploys and a hard refresh, that would mean there's a real bug this
  round's investigation didn't reproduce — would need the exact browser/
  OS/window size to chase further.

---

## 2026-07-28 — Phase 14 Follow-up: Real Music Files Merged and Verified

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

The Phase 14 entry below was written believing `Logic Flow.mp3` and
`Sudoku Zen.mp3` didn't exist anywhere. They did — the user had uploaded
both directly to GitHub (commit `9988845 "Add files via upload"`,
outside this sandboxed session) while this session was still working
from a local clone that predated the upload. Discovered when `git push`
was rejected for a diverged remote; per the git safety protocol, fetched
and inspected the new remote commit (`git show --stat`) before doing
anything, confirmed it only added the two expected MP3s with the exact
filenames `js/audio.js` was already built to look for, and merged
non-destructively (`git merge origin/claude/sudoku-inspire-setup-2jpef2`,
no conflicts — disjoint files).

**Real-file verification performed:**

- Confirmed both files decode correctly in-browser (`canplaythrough`,
  real durations — "Sudoku Zen.mp3" reports 151.15s) and that `sw.js`
  serves/precaches both with correct `encodeURI()`-escaped paths (space
  in each filename).
- Wrote a Playwright check that monkey-patches
  `HTMLMediaElement.prototype.play` (via `page.addInitScript()`) to
  observe, from outside the app, exactly which audio elements actually
  get `.play()` called on them as real screen transitions happen.
- **First run failed:** reaching the main menu never called `.play()` on
  "Sudoku Zen.mp3" at all.
- **Root cause (a real bug, only catchable with genuine files):**
  `setActiveMusicTrack()` normally runs synchronously off a screen
  transition, which is faster than a ~2.4MB MP3 finishing its
  `canplaythrough` load — so the *first* activation call almost always
  saw `track.available === false` and did nothing, and nothing ever
  retried once the file became available afterward. With no real audio
  file previously present, this path was never actually exercised, so it
  passed every prior no-throw/structural check while being silently
  broken.
- **Fix** (`js/audio.js`): `createMusicTrack` now takes the track's
  `name`, and its `canplaythrough` handler calls
  `updateMusicPlayback()` if that track is still the active one —
  turning the load-completion event into the missing retry.
- Re-ran the same monkey-patch check: "Sudoku Zen.mp3" now plays on
  reaching the menu, "Logic Flow.mp3" now plays on starting a game, zero
  console/page errors either way.
- Re-ran `npm test` (181/181, unchanged) and the full Phase 14 regression
  playtest (all themes/modes, all difficulties, full input surface,
  completion, reload/Continue, Clear Data, 320px keyboard-only) — all
  passing, zero console/page errors.

**Docs reconciled to match reality:** `README.md`'s Assets section,
`TASKS.md`'s Phase 14 and Outstanding/Blocked entries, and
`MANUAL_QA.md`'s §9 all previously described the music files as
missing/pending — updated to reflect that both exist, are wired
correctly, and are verified working end-to-end. (The Phase 14 entry
below is left as-is, since it accurately describes what was true and
known at the time it was written — this follow-up entry is the
correction, not an edit to history.)

**Remaining limitation, unchanged:** the intro video is still silent —
this is the user's own binary asset and out of scope for this codebase
to alter, per `CLAUDE.md`'s asset policy.

---

## 2026-07-28 — Phase 14: UX/Audio Polish and Three Real Bug Fixes

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

A direct user-feedback round (not a numbered "Prompt"), covering audio,
visual polish, and an explicit "test play to verify no bugs." Logged as
the new Phase 14 in `TASKS.md`, shifting Final QA to Phase 15 — same
insert-and-shift convention used for prior unplanned phases.

**Missing assets, flagged up front:** the user described `Logic
Flow.mp3` (gameplay music) and `Sudoku Zen.mp3` (menu music) as already
being "in repo main directory." Checked the actual filesystem and full
git history before writing any code — neither file exists anywhere.
Per `CLAUDE.md`'s binary-asset policy, nothing was fabricated in their
place; the full two-track playback system was built and verified with
both tracks absent (the same graceful-optional-asset pattern already
proven for `background-music.mp3` in Phase 9), ready to work the moment
the real files are supplied with those exact names. Told the user this
directly before starting the rest of the work, rather than silently
building around a gap or blocking on it.

**What was built:**

- **Two-track contextual music** (`js/audio.js`, substantially rewritten
  from Phase 9's single-track model): each track (`menu` → "Sudoku
  Zen.mp3", `gameplay` → "Logic Flow.mp3") gets its own `<audio>`
  element and its own gain node purely for fade in/out, both feeding
  into the existing shared `musicGain` (the actual volume-slider
  control) — so a crossfade is just ramping one track's gain to 0 while
  ramping the other's to 1, without either needing to know the other
  exists. `js/screens.js` gained a small `onScreenChange(listener)`
  subscription hook (mirrors the existing `onStateChange` pattern) so
  `audio.js` can pick the right track without `screens.js` knowing
  anything about audio. Menu/Statistics/High Scores share the "menu"
  track (switching every time you glance at Statistics would be more
  distracting than helpful); Game gets "gameplay"; puzzle completion
  explicitly stops music rather than leaving it looping under the
  completion dialog. `sw.js`'s optional-asset list and `CACHE_NAME` were
  updated to match (`v1` → `v2`, per its own documented versioning
  policy) — verified the service worker still installs cleanly with
  both new (currently-404ing) filenames.
- **Menu fade-in from black**: a fixed, full-screen black overlay
  (`#menu-fade-overlay`) that appears and fades to transparent whenever
  `finishIntro()` runs — whether the video played to completion or was
  skipped, both count as "the intro just finished." Skipped entirely
  (not just sped up) under `prefers-reduced-motion: reduce`.
- **`logo.png` on the Start screen**, above the "Sudoku by Inspire"
  heading — `alt=""` since the heading already conveys the same brand
  name textually (the image is a decorative reinforcement, not new
  information — the correct accessible-name pattern for that situation).
- **Typography/menu polish**: heavier, tighter brand heading
  (`font-weight: 800`, negative letter-spacing), a touch more size on
  body/prompt text, subtle shadow depth on menu buttons, tightened
  footer spacing — all CSS-only, no new font files. Considered
  self-hosting a distinct webfont for more visual character, but ruled
  it out: sourcing and verifying licensing for a new binary asset within
  this session carries real risk for a "nice to have," while the
  existing `system-ui` stack already renders each platform's own
  highest-quality native font — the safer, zero-risk path was extracting
  more visual quality from weight/spacing/hierarchy instead.

**Three real bugs found and fixed** (the user's "test play to verify no
bugs" instruction was taken literally — these were found by actually
measuring the rendered page with Playwright, not just eyeballing
screenshots):

1. **Page-level scrolling on desktop** (and some mobile widths). Root
   cause: Phase 11's `#screen-game { display: grid; ... }` desktop/
   landscape layout rules use an ID selector, which is *more specific*
   than the base `.screen[hidden] { display: none }` rule — so the
   hidden game screen kept its full ~720px layout height behind
   whatever screen was actually showing, inflating the page. Confirmed
   directly: `getComputedStyle(#screen-game).display` was `"grid"` even
   with `hidden` set. Fixed with an explicit `#screen-game[hidden] {
   display: none }` override (specificity now wins on its own terms,
   regardless of what other `#screen-game` rules exist or get added
   later). Separately, desktop's `#app { margin: var(--space-5) auto }`
   centering trick was independently leaking ~40px of collapsed margin
   into `documentElement.scrollHeight` (confirmed by comparing
   `document.documentElement.scrollHeight` against `document.body.
   scrollHeight` — 840 vs. 800) — replaced with flexbox centering on
   `body`, which doesn't have the same collapse behavior. Added a global
   backstop on top of both fixes: `html, body { overflow: hidden }`
   plus `max-height: 100dvh; overflow-y: auto` on every `.screen`, so
   even a future regression stays contained to one screen's own scroll
   instead of growing the whole page again.
2. **Board grid lines nearly invisible in 7 of 8 theme/mode
   combinations.** `.board`'s 1px cell gaps used `--color-border` as
   their color — measured at only 1.3-2.4:1 contrast against
   `--color-panel` across themes (WCAG's minimum for non-text UI
   boundaries is 3:1), so the inner grid essentially disappeared into
   the panel color everywhere except Light mode, confirmed visually
   before the fix in every theme's board screenshot. Fixed by reusing
   `--color-text-secondary` instead — already verified elsewhere (Phase
   11's contrast audit) to clear 4.5:1 against `--color-panel` in all 8
   combinations, so no new color values needed hand-tuning.
3. **Digits rendered ~15px off-center horizontally.** The exact same
   *class* of bug as #1, one level down: `.cell-notes { display: grid }`
   also beat the default `[hidden] { display: none }` for a "hidden"
   notes grid, which stayed present as a same-height flex sibling next
   to `.cell-value` inside each cell — skewing the flex centering by
   roughly the notes grid's own width. Measured precisely with
   Playwright (comparing each digit's rendered center to its cell's
   center) before and after: ~15px off before, ~1px (font-rendering
   rounding, not a real bug) after adding `.cell-notes[hidden]`/
   `.cell-value[hidden]` overrides. Worth calling out as a pattern for
   future CSS: **any element given its own explicit non-default
   `display` value needs an explicit `[hidden] { display: none }`
   sibling rule** — the browser's default `[hidden]` styling silently
   loses to an author rule of equal-or-lower specificity due to CSS
   origin precedence (author beats user-agent regardless of specificity
   ties), and this is now the *second* time that exact mechanism caused
   a real, user-visible bug in this codebase.

**Checks run:**

- `node --check` across all 46 `.js` files: clean.
- `npm test`: 181/181 passing, unchanged (no pure-logic module touched
  this phase — everything was CSS, markup, or the browser-only
  `js/audio.js`/`js/screens.js`, none of which have or need dedicated
  unit tests, consistent with this project's established
  browser-only-module precedent).
- Full Playwright playtest: all 4 difficulties generated and labeled
  correctly, complete input surface exercised (select, digit entry,
  notes toggle, erase, undo, hint with confirmation, pause/resume via
  Escape), a full puzzle solved to completion, reload + Continue Game
  correctly disabled afterward, Clear Data flow, all 8 theme/mode
  combinations checked for zero page overflow, and a 320px keyboard-only
  pass (Enter to start, Tab+Enter to open New Game, Escape to cancel
  with focus restored) — zero console/page errors across the entire run.
- Precise pixel-measurement checks (not just visual screenshots) for
  both the scrolling fix (`documentElement.scrollHeight` vs.
  `innerHeight`, exact match after the fix) and the centering fix
  (per-digit offset from cell center, sub-2px after the fix).

**Remaining limitations:**

- `Logic Flow.mp3` and `Sudoku Zen.mp3` still don't exist in the repo —
  the entire two-track system is unheard, verified only at the
  code-path level (no throws, correct track selected per screen, correct
  crossfade timing math). Needs a real listen once the files are
  supplied.
- The intro video's silence ("Main intro video has no audio :(") is
  acknowledged but not actionable from this codebase — it's the user's
  own binary asset, and `CLAUDE.md`'s policy is to never
  fabricate/replace/overwrite it. If audio is ever added to that file,
  no code change is needed (the video isn't force-muted by a hidden
  audio-availability check, just given the `muted` HTML attribute for
  autoplay-policy reasons — same as before this phase).
- Given how the "hidden but still displayed" bug pattern showed up
  twice, ran a preemptive audit of every other element toggled via
  `.hidden` in JS (`.pause-overlay`, `.menu-fade-overlay`,
  `.connection-status`, `.update-banner`, `#highscores-empty`) against
  its CSS: the first four already have correct `[hidden]` overrides
  (added defensively in earlier phases), and `#highscores-empty`
  (`.game-status`) has no conflicting `display` rule to begin with, so
  the browser's default `[hidden]` behavior already works there
  unaided. No third instance found.

---

## 2026-07-28 — Phase 13: Production Deployment Readiness

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Matches `TASKS.md`'s existing Phase 13 (GitHub Pages Deployment)
directly — no renumbering needed this time.

**Important constraint honored this phase:** the prompt explicitly said
not to push or change remote repository settings without permission.
Every file change below is committed locally to this branch as usual,
but **the commit has not been pushed**, and GitHub Pages has **not**
been enabled — both are real, external, hard-to-reverse actions (a
push is visible to others; enabling Pages exposes a live public URL)
that this project's own working agreement (`CLAUDE.md`) and this
prompt's explicit instruction both require a human's go-ahead for.
Deployment steps are fully documented and ready to run; none were run.

**What was built/verified:**

- **Absolute-path audit**: scripted `grep` across every HTML
  `href`/`src`, every CSS `url()`, every JS `import`/`fetch`, the
  manifest, and `sw.js` for anything starting with a bare `/` — zero
  matches. Every path in this repo was already relative (`./...` or
  `../...`), built that way deliberately since Phase 1, so this was
  confirmation of existing discipline, not a fix.
- **`.nojekyll`** (empty file, repo root) — tells GitHub Pages to skip
  its default Jekyll build step.
- **`.gitignore`** — `node_modules/`, OS/editor cruft, `.env*`. This
  project has zero dependencies today (`npm test` uses only Node's
  built-in test runner), so there's nothing to actually ignore yet, but
  it's cheap insurance against the first future `npm install` landing
  in a commit by accident.
- **Simulated-subpath deployment check**: served the repo through a
  local static server with a `/sudoku-by-inspire-v1/` URL prefix
  (mirroring the real shape of a GitHub Pages project-site URL —
  `https://<owner>.github.io/<repo>/`) and drove it with Playwright:
  confirmed the manifest resolves under the subpath, the service
  worker's registered `scope` is confined to the subpath (never the
  origin root), every core and optional asset precached under the
  correct subpath-prefixed URL, a complete game played start-to-finish
  with zero failed network requests and zero console errors. This is
  the same verification technique used in Phase 10's PWA work, re-run
  here specifically as this phase's deployment-readiness gate.
- **Full pre-deployment audit**, per the prompt's explicit checklist:
  - `npm test`: 181/181 passing.
  - `node --check` across all 46 `.js` files: clean.
  - `sw.js`'s `CORE_ASSETS`/`OPTIONAL_ROOT_ASSETS` cross-checked against
    what's actually on disk: all 5 core files exist, both existing
    optional assets (`logo.png`, `inspiresoftwareintro.mp4`) exist,
    `background-music.mp3` correctly does not.
  - Secrets/local-machine-path grep across every source file: no
    matches (the only "secret"/"token" hits were CSS "design token"
    terminology and unrelated English prose).
  - Largest tracked file is the intro video at 276KB — nowhere near any
    size concern.
  - `git log --follow` on `logo.png` and `inspiresoftwareintro.mp4`
    each show exactly one commit (the user's original upload) — neither
    has ever been touched by any phase since, confirmed by file-type
    signature and checksum as still valid, unmodified PNG/MP4 files.
  - `grep` for `https?://` across every runtime file (HTML, CSS, JS,
    manifest, service worker): zero matches — confirmed zero external
    runtime dependencies, consistent with CLAUDE.md's requirement.
- **`README.md`** fully rewritten (previously still Phase 0's
  placeholder "planning complete, application code not yet started"
  text) — overview, local development, a controls table, themes/modes,
  assets (including the optional-music and PWA-icon status), tests, PWA/
  offline verification steps, local-data behavior, cache reset/update
  instructions, exact GitHub Pages deployment steps (UI + optional CLI),
  `inspireclothing.art` integration options, suggested repository
  topics, and a troubleshooting section.

**Explanation (why repository subpaths break absolute URLs, what
GitHub Pages serves, when Actions are unnecessary, service-worker scope
vs. deployment path, connecting a custom domain later):**

- *Why repository subpaths break absolute URLs*: a path starting with
  `/` (like `/index.js` or `/styles.css`) is resolved by the browser
  against the current **origin** (scheme + host + port) — always the
  domain root, no matter how deep the current page's own URL is nested.
  `https://user.github.io/sudoku-by-inspire-v1/index.html` referencing
  `/styles.css` would actually request
  `https://user.github.io/styles.css` — one level too high, landing
  outside the repo's own subfolder entirely, a 404. A **relative** path
  (`./styles.css`) is resolved against the *current document's own URL*
  instead, so it correctly lands at
  `https://user.github.io/sudoku-by-inspire-v1/styles.css`. This is
  also exactly why a page that works perfectly when opened at a domain
  root (or via `file://`, or via a local dev server with nothing else
  under it) can silently break the moment it's hosted one folder deeper
  — the bug is invisible until the hosting path actually changes.
- *What GitHub Pages serves*: literally the files in the chosen
  branch/folder, over HTTP(S), completely unprocessed except for the
  optional Jekyll build step (skipped here via `.nojekyll`) — there is
  no server-side code execution, no environment variables, no backend
  of any kind. That's precisely why this app is a perfect fit for it:
  it's already "just static files that happen to talk to each other via
  relative URLs," which is all Pages can (or needs to) serve.
- *When Actions are unnecessary*: GitHub Actions exists to run a
  process — most commonly a build step — before publishing. A
  project with no build step has nothing for Actions to *do* on the way
  to Pages; "deploy from a branch" publishes the repository's own files
  directly, with one less moving part (no workflow YAML to maintain, no
  Actions minutes consumed, no extra point of failure) than an
  Actions-based deploy would add for zero benefit. The moment a real
  build step exists — a bundler, a TypeScript compile, anything that
  produces output *different* from the source files — Actions becomes
  the right tool, because "deploy from a branch" can only publish what's
  literally committed, not a build artifact.
- *Service-worker scope vs. deployment path*: a service worker's
  `scope` defaults to the directory containing the script it was
  registered from, and can never be broader than that (a worker at
  `/sudoku-by-inspire-v1/sw.js` can control pages under
  `/sudoku-by-inspire-v1/` but never anything outside it, even on the
  same origin) — this project's registration
  (`navigator.serviceWorker.register('./sw.js', { scope: './' })`, in
  `js/sw-register.js`) is written relative to wherever `index.html`
  itself was loaded from specifically so this resolves correctly
  whether that's a domain root or a repository subpath, without any
  environment-specific configuration. Verified directly this phase: the
  simulated-subpath check above confirmed `registration.scope` came
  back as the full subpath URL, not the origin root.
- *Connecting a custom domain later*: GitHub Pages can serve this exact
  same repository from a custom (sub)domain instead of `github.io`
  purely via DNS + a `CNAME` file — no application code changes needed,
  because the app's relative-path architecture already works
  identically at any origin. The domain owner adds a DNS `CNAME` record
  pointing the desired subdomain at `<owner>.github.io`, and either
  commits a `CNAME` file containing that domain to the repo root or sets
  it via Settings → Pages → Custom domain (which creates the file
  automatically); GitHub then provisions a TLS certificate for it
  automatically once DNS propagates. This is real, live-domain
  infrastructure — exactly the class of action this phase deliberately
  did not perform without explicit permission.

**Checks run:**

- `npm test`: 181/181 passing (unchanged from Phase 12 — no application
  code changed this phase, only deployment/documentation artifacts).
- `node --check` across all 46 `.js` files: clean.
- Full absolute-path grep audit: clean (see above).
- Simulated-subpath Playwright deployment check: all assertions passed,
  zero failed requests, zero console errors.

**Remaining manual actions (deliberately not performed this phase):**

- Push this branch / merge to the default branch.
- Enable GitHub Pages (Settings → Pages → Deploy from a branch) — exact
  steps are in `README.md`'s Deployment section.
- Run `MANUAL_QA.md`'s full checklist against the real, live Pages URL
  once deployed (this phase only verified a *simulated* subpath
  locally — a real deployment is still worth its own pass, especially
  for real-device video/audio playback and real screen-reader use,
  neither of which this sandboxed environment can confirm).
- Supply PWA icons (`icons/README.md`) and, if desired later, a real
  `background-music.mp3` — both optional, both already handled
  gracefully in their absence.
- Decide on and implement an `inspireclothing.art` integration option
  (see `README.md`'s three options) once that site's own platform is
  known — deliberately not assumed or chosen in this repo.
- Add the suggested repository topics (`sudoku`, `javascript`, `pwa`,
  `offline-first`, `indie-game`, `inspire`) via Settings → General →
  Topics — a repository-settings change, so left for the user.

---

## 2026-07-28 — Phase 12: Full Engineering Audit — Tests and Manual QA

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt didn't carry an explicit "Prompt NN" header, but its content
(comprehensive automated-test audit + a manual QA checklist) doesn't
match any existing `TASKS.md` phase — Phase 11 (Accessibility) was
already done, Phase 12 was GitHub Pages Deployment, Phase 13 was Final
QA. Inserted as the actual new Phase 12, shifting Deployment to 13 and
Final QA to 14, matching the same pattern used for prior insertions
(see the Phase 6 and Phase 7 log entries).

**What this phase actually was:** an audit, not a build. The explicit
instruction was "do not intentionally create failing exercises" and to
add tests only for genuine gaps — so the real work here was reading
every existing test file against its matching source module, function
by function, to find out whether the coverage the prompt asked for
already existed (much of it did, built incrementally as each earlier
phase landed its own module) versus where a real hole remained.

**Audit findings, by requested category** (file:describe-block, or
"gap closed" with what was added):

- Coordinate helpers → `sudoku-engine.test.js`: "coordinate conversion"
  (round-trips all 81 cells, rejects out-of-range input).
- Board validation → "board shape validation" (wrong length, non-array,
  out-of-range/non-integer cells).
- Valid placement → "placement legality" (row/column/box conflicts, a
  cell's own value never self-conflicting, out-of-range values).
- Solver success and failure → "solveBoard" (solves a solvable puzzle
  preserving every given; returns `null` for an unsolvable board with
  conflicting givens; returns `null` rather than throwing on malformed
  input).
- Solution-count limit → "countSolutions" (an empty board — which has
  an astronomically large solution count — stops at the requested limit
  in well under 5 seconds instead of exhaustively enumerating).
- Puzzle uniqueness → `sudoku-generator.test.js`'s "generatePuzzle" test
  asserts `countSolutions(result.puzzle, 2) === 1` for every difficulty,
  and the fallback-puzzle path is checked the same way.
- Difficulty configuration → "difficulty configuration" (every bundled
  config valid, clue bands match spec and never dip below the proven
  17-clue minimum, bands don't overlap and get strictly harder,
  malformed configs rejected on 8 different specific defects).
- Notes behavior → `game-state.test.js`'s "applyNumberInput — notes
  mode" and "toggleNote" (candidate bits toggle independently, don't
  touch entries/mistakes, survive being set/cleared twice).
- Peer-note cleanup → "removes the placed value from peer notes" (both
  for a normal entry and, separately, for `useHint`).
- Undo history → "undo" and "bounded undo history" (restores
  entries/notes/selection/mistakes/hints from before the last mutation;
  caps at `MAX_HISTORY_SIZE`, dropping the oldest).
- Timer/pause state transitions → "timer" (5 tests, all against a fake,
  advanceable clock — no real `setInterval` in the test process at all):
  accrual, pause freezing time, a named suspension reason freezing time
  independently of `status`, multiple simultaneous suspension reasons
  only releasing once all clear, completion freezing time permanently.
- Scoring boundaries → `scoring.test.js` (par-value baseline, harder
  difficulty scores higher, under/over-par speed bonus behavior, exact
  per-mistake/per-hint penalty amounts, **never negative**, always an
  integer, unknown-difficulty fallback).
- Storage corruption and validation → `storage.test.js` plus
  `active-game-store.test.js`/`statistics-store.test.js`/
  `high-scores-store.test.js`'s own "corrupt data fails safely" blocks
  (malformed JSON, validator rejection, storage-access-throws,
  `localStorage` entirely absent, and per-store shape-specific bad data
  like a stored high-scores list longer than 10 or a negative score).
- Statistics updates → `statistics-store.test.js` (started/completed
  counts, best/average time, streak increment and reset-on-abandon,
  independence across difficulties, division-by-zero guards for
  completion rate and average time already covered by the "empty state"
  test).
- Completion detection → `game-state.test.js`'s "completion" (filling
  every cell to match the solution marks it complete and clears
  selection; an incomplete board never is; placing notes on the last
  empty cell never triggers it, since notes never write to `entries`).
- Share-result formatting → `completion.test.js`'s "buildShareText"
  (includes difficulty/time/mistakes/hints/score, correct singular
  "1 mistake"/"1 hint" grammar, pure-function determinism).

**Two genuine gaps found and closed** (not padding — both are real,
previously-unexercised branches in existing source code):

- `getCandidates` had no test for the case where a cell's peers already
  cover all 9 digits (an empty array result) — only the "some digits
  used" and "no digits used" cases existed. Added a fixture that fills
  a target cell's box-peers with 1-8 and a row-peer with 9.
- `pauseGame()`/`resumeGame()` both have an early-return guard
  (`if (state.status !== 'playing') return;` and the paused-status
  equivalent) that had literally zero test coverage — every existing
  test only ever called them in the state where they're expected to
  actually do something. Added 3 tests: pausing an already-paused game
  is a no-op, resuming a non-paused game is a no-op, and resuming with
  no game in progress at all (`status: 'idle'`) is a no-op.

**`MANUAL_QA.md`** — a new top-level checklist covering everything a
`node:test` unit test structurally cannot reach: real video/audio codec
playback, the real service-worker install/update/cache lifecycle, real
viewport rendering at specific breakpoints, real dialog focus behavior
in an actual browser, and (explicitly flagged as a known gap, not
something this phase could close) real screen-reader software. Organized
around the exact 16 scenarios the prompt named, plus a closing "known
environment limitations" section documenting what this project's own
sandboxed dev environment specifically can't verify (the intro video's
codec, real assistive technology) so a future QA pass knows what's
already been checked here versus what still needs a real device/browser.

**Checks run:**

- `node --check` across **all 46** `.js` files in the repo (not just the
  ones touched this phase) — clean.
- `npm test`: **181/181 passing**, 57 suites (177 carried over + 4 new:
  1 `getCandidates` test, 3 `pauseGame`/`resumeGame` guard tests).
- One full Playwright end-to-end smoke run (start → menu → new game →
  deliberate mistake → hint → pause/resume → complete → statistics/high
  scores reflect it → reload → Continue correctly disabled → offline
  reload still boots) — zero console/page errors, confirming no
  regression across the accumulated work of every prior phase.
- **Zero automated-test failures found.** Nothing needed fixing this
  phase beyond closing the two coverage gaps above — an honest finding,
  not a shortcut: the prior phases' own "run checks" discipline (every
  phase's `DEVELOPMENT_LOG.md` entry already shows a full green test run
  before that phase was called done) is exactly why there was nothing
  broken left to find here.

**Explanation (testing pyramid, unit vs. manual QA, how regression tests
protect fixes, reading a Node test failure):**

- *The testing pyramid, for this project specifically*: a wide base of
  fast, deterministic `node:test` unit tests (181 of them, ~5 seconds
  total) covering every pure-logic module — the Sudoku engine, the
  generator, game state, scoring, storage, and every persisted store —
  each testable with zero DOM and zero real timers (see the "fake clock"
  pattern in `game-state.test.js`'s timer tests, or the in-memory
  `localStorage` polyfill in every store's test file). Above that, a
  thin layer of Playwright browser-automation scripts — used throughout
  Phases 7-12 for exactly the things unit tests can't reach (real
  `<dialog>` focus restoration, a real service worker's cache lifecycle,
  real CSS layout at specific viewports) — written ad hoc per phase
  rather than committed as a permanent suite, since this project
  deliberately has no browser-test framework installed (see the
  "do not add a large framework" instruction this phase itself
  received). At the very top, `MANUAL_QA.md`: the smallest, slowest
  layer, for the handful of things that need an actual human in an
  actual browser (or an actual screen reader) — video codec playback,
  real device rotation, real assistive technology.
- *What belongs in a unit test vs. manual QA*: the dividing line is
  "does this function's correctness depend on anything outside pure
  JavaScript values?" `calculateScore(result, config)` takes plain
  numbers and returns a plain number — trivially a unit test, no matter
  how complex the formula. Whether a `<video>` element actually decodes
  an MP4's specific codec depends on the browser's underlying media
  pipeline, which nothing in Node can construct or fake — that's
  manual-QA territory by necessity, not by choice. The useful test in
  between — "does the intro video's `error` handler correctly skip to
  the menu" — *is* unit/integration-testable, because it only depends on
  a DOM event firing, which Playwright can simulate; that's why it's a
  Playwright script in this project's history rather than either a unit
  test or a manual-QA line item.
- *How regression tests protect a fix*: every defect this project has
  ever found via testing (the Phase 7 `recordGameStarted` never being
  called, Phase 9's intro-video `error` listener able to bypass the
  Start gate, Phase 11's Paper/dark contrast failure) was fixed
  alongside a test or an assertion that would fail again if the same
  bug were reintroduced — not just a one-time manual confirmation that
  it currently works. That's the actual value of the 181-test suite:
  it's not there to prove the code is correct today (a human already
  just watched it work), it's there so that six phases from now, an
  unrelated change to `game-state.js` that accidentally breaks undo
  history gets caught by `npm test` in 5 seconds, instead of silently
  shipping and being discovered by a player instead.
- *How to read a Node test failure*: `node --test` output nests by
  `describe` block; a failing test prints `not ok N - <test name>`
  (versus `ok N - ...` for a pass) with a `---` YAML block underneath
  giving the failure location and, for `assert.equal`/`assert.deepEqual`
  failures, the actual vs. expected values directly (no separate
  diffing tool needed). The summary at the very end
  (`# tests`/`# pass`/`# fail`) is the fastest way to confirm "did
  anything break" without reading the full scrollback — `# fail 0` is
  the bar this project holds itself to before calling any phase done,
  and every `DEVELOPMENT_LOG.md` entry from Phase 3 onward records that
  exact line.

**Remaining limitations:**

- No browser-test framework (Playwright-as-a-committed-dependency,
  Cypress, etc.) was added, per this phase's own explicit instruction —
  every Playwright script written across Phases 7-12 lives in the
  session's scratch directory, not the repo, and would need to be
  rewritten if a future phase wants to re-run the same browser-level
  checks. `MANUAL_QA.md` is the durable, repo-committed record of what
  those checks were, in a form a human can re-run without any tooling
  at all.
- Real screen-reader software and a real (non-codec-limited) browser's
  intro-video playback remain genuinely unverified by anything in this
  repo or this session — both are called out explicitly in
  `MANUAL_QA.md`'s "known environment limitations" section rather than
  silently assumed fine.
- `README.md` is still the placeholder "planning complete, application
  code not yet started" version from Phase 0 — out of scope for this
  phase (that's explicitly Phase 14's job per `TASKS.md`), but worth
  flagging here so it isn't mistaken for an oversight.

---

## 2026-07-28 — Phase 11: Accessibility, Mobile Polish, and Desktop Mode

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 10" (accessibility/UX pass) is `TASKS.md`'s
Phase 11 (Accessibility Polish) — matches it directly, no renumbering
needed.

**What was built:**

- **`js/ui/cell-aria.js`** — `getCellAriaLabel(index, state)`, a pure,
  fully-tested function (14 tests) that is now the single source of
  truth for a board cell's accessible name: row/column, `clue` vs
  `editable`, its value (`given`/`entered`) or `empty` plus any notes,
  `conflicts with another cell` when either a peer clash or (with
  immediate error checking on) a wrong entry applies, `selected`, and —
  only on the selected, editable cell, where it's actually relevant — a
  concise `press 1 through 9 to enter a value`/`...to toggle a note`
  instruction. `js/ui/board-view.js`'s old private `describeCell` helper
  is gone; it now calls this directly on every render.
- **`js/ui/difficulty-filter.js`** rewritten onto the real WAI-ARIA tabs
  pattern: each button gets `role="tab"` + `aria-controls` pointing at a
  new `role="tabpanel"` results container, only the selected tab has
  `tabindex="0"` (roving tabindex — the other three are skipped when
  Tabbing through the page, exactly like a native tab widget), and
  Left/Right/Home/End move both focus and selection between tabs.
- **Responsive layout**: audited 320px portrait, phone landscape, tablet
  portrait/landscape, desktop, and ultrawide via Playwright screenshots
  at each size — no horizontal overflow anywhere already. Added two new
  breakpoints, both scoped to `#screen-game` specifically (not the
  shared `.screen-game` class, which Statistics/High Scores also use for
  an unrelated base layout, and would have broken under these grids):
  - `@media (min-width: 1024px)`: board and the toolbar/number-pad
    controls side by side as a genuine desktop "side panel," using CSS
    Grid named areas — no HTML restructuring needed, since Grid can
    place existing sibling elements into named areas directly.
  - `@media (orientation: landscape) and (max-height: 500px)`: the same
    two-column idea, sized down, specifically for short landscape
    phones — before this, reaching the number pad in landscape required
    scrolling past ~870px of stacked content; measured and confirmed the
    new layout fits entirely within a 375px-tall viewport with zero
    scroll (a first version still needed ~421px until the toolbar was
    left as a row instead of a stacked column — vertical space is the
    scarce resource at this breakpoint, so three stacked buttons costing
    3x one row's height was the actual problem, not the board).
- **Safe-area insets**: `.pause-overlay` (a fixed full-screen element)
  was missing them entirely — added, matching the pattern already used
  by `.screen`/`.skip-btn`/`.connection-status`/`.update-banner`.
- **Hover/active/focus-visible states**: added explicit `:hover` (gated
  behind `@media (hover: hover) and (pointer: fine)` — without that,
  touch browsers apply `:hover` on tap and it can stay visually "stuck"
  until an unrelated tap elsewhere) and `:active` press-down feedback
  (brightness dim, plus a small scale-down for standalone buttons —
  board cells get brightness only, since scaling one down in a
  seamless edge-to-edge grid would open a visible gap against its
  neighbors) across every button-like control.
- **Text-selection prevention**: `button { user-select: none; }` — one
  blanket rule, since every button in this app is a control, never
  readable prose to select/copy. Leaves paragraphs, stat values, and the
  completion dialog's share textarea normally selectable.
- **Intro Skip button**: switched from theme tokens to a fixed dark
  scrim + white text, independent of the active theme — it sits on top
  of arbitrary video frames, not this app's own themed background, so it
  needs guaranteed contrast against whatever's playing underneath it
  rather than whatever a theme pack's surface/text/border tokens happen
  to resolve to.
- **Non-color conflict/error cue**: `.cell-value.is-error` now gets a
  wavy underline (the familiar "spell-check" convention) alongside its
  color change, on top of the conflict ring's already-structural
  (color-independent) presence/absence cue.
- **Contrast re-check**: scripted a WCAG AA contrast audit across all 8
  theme/mode combinations for every significant text/background pairing
  in the app (body text, secondary text, button text, given/player
  digits, error/success/warning text, note digits). Found one genuine
  failure — Paper/dark's `--color-error` (`#e2695a`) against its panel
  background at 3.91:1, below the 4.5:1 AA threshold for normal text —
  and fixed it by lightening to `#ec8878` (5.10:1), staying in the same
  warm coral hue family as that theme's existing accent/entry-player
  tokens rather than introducing an unrelated color.
- **Completion celebration**: the completion dialog's "Puzzle Solved!"
  heading gets a one-shot scale+fade-in (`.celebrate` class, toggled
  off/reflowed/back-on so it re-triggers on back-to-back completions) —
  no confetti particles or new DOM, just a brief cue on text that was
  already there.
- **Cyber background animation**: two soft radial-gradient glows slowly
  drifting between opposite corners of the viewport, in both Cyber
  light and dark modes, declared *only* inside
  `@media (prefers-reduced-motion: no-preference)` — not just relying on
  the existing blanket `prefers-reduced-motion: reduce` override further
  up the file, which would still compute and then freeze the animation
  rather than never declaring it at all.

**Explanation (accessible names, focus vs. selection, native semantics,
`aria-live`, dialog focus restoration, reduced-motion media queries,
responsive layout decisions):**

- *Accessible names*: the "accessible name" is the string a screen
  reader actually announces for an element — computed from, in priority
  order, `aria-label`/`aria-labelledby`, then native semantics (a
  `<label>` for a form control, visible button text), then other
  fallbacks. Board cells have no useful visible text of their own to
  fall back to (a bare digit doesn't say "row 3 column 5"), which is
  exactly why `getCellAriaLabel` exists — it's the entire accessible
  name for each of the 81 `role="gridcell"` buttons, recomputed fresh
  every render so it can never drift from what's visually shown.
- *Focus vs. selection*: these are two different concepts that happen to
  usually move together in this app. "Selection" is `game-state.js`'s
  `selectedIndex` — pure application state, no DOM involved. "Focus" is
  the browser's own concept of which element receives keyboard input
  next. `js/ui/board-view.js` explicitly moves DOM focus to match
  `selectedIndex` on every render (`selectedEl.focus()`) so a sighted
  keyboard user's focus ring and a screen reader's announced position
  both track the same cell the game logic considers selected — but nothing
  requires this; a future feature could select a cell programmatically
  without touching focus at all, precisely because the two are kept
  separate rather than conflated into one concept.
- *Native semantics*: every interactive element in this app is a real
  `<button>`, `<input type="radio/checkbox/range">`, or `<dialog>` —
  ARIA is added on top to supplement what these already give for free
  (keyboard operability, correct default role, built-in focus handling),
  never to replace it with a `<div role="button">` reimplementation. The
  one deliberately-not-fully-native piece is the board itself
  (`role="grid"`/`role="gridcell"` on flat sibling buttons rather than a
  full `grid`>`row`>`gridcell` hierarchy) — building genuine `row`
  elements would need either restructuring the DOM away from a clean
  9x9 CSS Grid or duplicating row/column bookkeeping the CSS Grid
  already handles implicitly; the explicit row/column text in every
  cell's accessible name is the deliberate compensating choice for that
  gap, documented here rather than silently accepted.
- *`aria-live`*: an aria-live region (`#game-status`, `#connection-status`,
  `#copy-confirmation`, `#mode-current-hint`, `#vibration-support-hint`)
  is how a screen reader finds out about a text change that didn't come
  from the user's own focus moving — e.g. `#game-status`'s "Ready — Easy
  puzzle, 43 clues" appears after puzzle generation finishes, which
  isn't triggered by any element gaining focus, so without `aria-live`
  a screen-reader user would never hear it at all. `polite` (used
  everywhere here) waits for a natural pause rather than interrupting
  whatever's currently being read, appropriate for status updates that
  are useful but never urgent enough to justify cutting someone off.
- *Dialog focus restoration*: every dialog in this app uses the native
  `<dialog>` element's `showModal()`/`close()`, which — in every
  evergreen browser this app targets — automatically remembers and
  restores focus to whatever had it before `showModal()` was called, no
  extra code required. Verified this directly rather than assuming it:
  opened and closed all four buttons-that-open-a-dialog paths (Settings,
  New Game's difficulty picker, Hint, Settings-from-the-game-screen) via
  Playwright and confirmed `document.activeElement` was back on the
  triggering button every time.
- *Reduced-motion media queries*: `@media (prefers-reduced-motion:
  reduce)` reflects an OS-level accessibility setting for users who get
  disoriented, nauseated, or simply distracted by motion — this app
  already had a blanket override (near-zero animation/transition
  duration on everything) from Phase 2, which is a good safety net but
  only *freezes* an animation that still gets declared and computed.
  Both new animations added this phase (the Cyber background drift, the
  completion celebration) are additionally declared inside the *inverse*
  query, `@media (prefers-reduced-motion: no-preference)` — for a
  reduced-motion visitor, the animation rule doesn't exist in the
  cascade at all, not just get neutralized after the fact. Verified with
  Playwright's `reducedMotion: 'reduce'` context option, confirming
  `getComputedStyle(document.body).animationName` resolves to `'none'`.
- *Responsive layout decisions*: the two new breakpoints
  (`min-width: 1024px` and `orientation: landscape` + `max-height: 500px`)
  are both about the same underlying idea — reflow the board and its
  controls from a single stacked column into two side-by-side columns
  once there's enough width relative to height to make that worthwhile —
  applied at two different physical situations (a genuinely wide desktop
  window vs. a short landscape phone) with different sizing math for
  each, since a landscape phone's *height* is the scarce resource while
  a desktop window's *width* is the abundant one. Scoping both to
  `#screen-game` by id (not the `.screen-game` class shared with
  Statistics/High Scores) was a deliberate, necessary choice — those
  other two screens have a completely different set of child elements,
  and CSS Grid's named `grid-template-areas` only place children that
  have a matching `grid-area` assigned; anything else falls back to
  implicit auto-placement, which would have visually scrambled those
  screens had the rule been scoped to the shared class instead.

**Checks run:**

- `node --check` on every new/modified JS file — all clean; `styles.css`
  brace-balance check.
- `npm test`: **177/177 passing** (163 carried over + 14 new
  `cell-aria.test.js` tests), across 57 suites.
- Scripted WCAG AA contrast audit across all 8 theme/mode combinations
  for 11 text/background pairings each (88 checks) — 1 failure found and
  fixed (Paper/dark `--color-error`), all 88 pass after the fix.
- Playwright verification, organized as a keyboard-and-screen-reader-
  oriented inspection per the prompt's own instruction:
  - Focus restoration confirmed after closing all four
    button-triggered dialogs.
  - A fully keyboard-only playthrough: Tab to New Game, Enter to open
    the difficulty dialog, Escape to cancel it (native `<dialog>`
    behavior), reopen and start a game, arrow keys to move board
    selection, a digit keypress to enter a value, Escape to pause,
    Enter on the focused Resume button to resume — no mouse events used
    anywhere in this pass.
  - Difficulty filter: confirmed `role="tab"` on every button, roving
    tabindex (`[0, -1, -1, -1]` before any interaction), and that
    ArrowRight moves both `aria-selected` and the visible panel content
    to the next tab.
  - `getCellAriaLabel` spot-checked directly in the live DOM (not just
    unit tests): a fixed clue's `aria-label` includes "clue" and
    "given"; a selected empty editable cell's includes "editable",
    "selected", and the entry instruction.
  - No horizontal overflow re-confirmed at 320px and 1920px on the game
    screen specifically (the most layout-dense screen) after all this
    phase's CSS changes.
  - Full 4-theme x 2-mode visual sweep of the game screen — no console/
    page errors in any of the 8 combinations, spot-checked several
    screenshots for visual correctness.

**Remaining limitations:**

- The board's ARIA structure is `role="grid"`/`role="gridcell"` on flat
  sibling buttons rather than a complete `grid`>`row`>`gridcell`
  hierarchy (see the native-semantics explanation above) — a deliberate,
  documented tradeoff, not an oversight, but a stricter ARIA audit tool
  would still flag the missing `row` level.
- No automated screen-reader-software testing (VoiceOver/NVDA/JAWS)
  was performed — verification here is DOM/ARIA-attribute-level
  (confirming the right roles, states, and accessible-name strings exist
  and update correctly) via Playwright, not an actual assistive
  technology's rendering of them. A real screen-reader pass by the user
  is still worth doing before calling this fully done.
- The >=1024px and short-landscape-phone grid layouts are new and only
  tested at a handful of specific viewport sizes; an unusual in-between
  size could theoretically reveal a gap this pass didn't sample.

---

## 2026-07-28 — Phase 10: Offline-First PWA Behavior

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 9" (offline PWA) is `TASKS.md`'s Phase 10
(Offline / PWA) — matches it directly, no renumbering needed.

**What was built:**

- **`manifest.webmanifest`** — `name`, `short_name`, `description`,
  `start_url`/`scope` both relative (`"./index.html"` / `"./"`, resolved
  against the manifest's own URL, so it stays correct at a GitHub Pages
  repository subpath the same way every other path in this repo already
  is), `display: "standalone"`, `theme_color`/`background_color` matched
  to the Light theme pack's `--color-accent`/`--color-bg` (the default
  pack on first load), and `"icons": []` — deliberately empty, since no
  icon files exist yet (see below), rather than pointing at files that
  would 404.
- **`icons/README.md`** — documents the three PNGs a real install needs
  (192×192, 512×512, and a *separate* 512×512 maskable icon — reusing an
  edge-to-edge icon as "maskable" gets its content clipped by the
  platform's mask, which is why it has to be its own file with padding),
  and the exact steps to wire them into `manifest.webmanifest` and
  `sw.js` once supplied.
- **`sw.js`** — a versioned cache (`inspire-sudoku-shell-v1`) with:
  - `install`: precaches a small, explicit **mandatory** app-shell list
    (`./`, `./index.html`, `./index.js`, `./styles.css`,
    `./manifest.webmanifest`) via `cache.addAll()` — deliberately *not*
    every `js/**.js` module by hand, since that list would silently drift
    out of date as future phases add files; then, separately, attempts
    each **optional** root asset (`inspiresoftwareintro.mp4`, `logo.png`,
    `background-music.mp3`) individually with its own try/catch, so one
    404 (currently `background-music.mp3` — it doesn't exist, same as
    Phase 9) can't take the others down or fail the whole installation
    the way a single `cache.addAll()` covering all of them would.
  - `activate`: deletes every cache whose name isn't the current
    `CACHE_NAME`, then `clients.claim()`.
  - `fetch`: ignores non-GET and cross-origin requests entirely (never
    calls `respondWith()` for them, leaving the browser's normal handling
    untouched); navigations go network-first with a cached-`index.html`
    fallback (so an online visitor always gets current HTML, offline
    still boots); every other same-origin GET goes cache-first, filling
    the cache from the network on a miss — this is what makes the full
    `js/**` module graph end up cached after one real visit, without
    hand-listing it.
  - Cache-version bumps are entirely manual (edit the `CACHE_NAME`
    suffix) — documented at the top of the file, along with the
    devtools-based hard-reset path (Application → Service Workers →
    Unregister / Clear site data) for local development.
- **`js/sw-register.js`** — feature-detected (`'serviceWorker' in
  navigator`), registers after the `load` event with `{ scope: './' }`,
  and a `.catch()` that treats registration failure as "no offline
  caching this session," never a broken app. Also wires a small
  "Update available" banner: when `updatefound` fires and the *new*
  worker reaches `'installed'` while `navigator.serviceWorker.controller`
  is already set (i.e. this is a genuine update, not the very first
  install), the banner appears with a Refresh button that just calls
  `location.reload()`.
- **`js/ui/connection-status.js`** — a small `aria-live="polite"` status
  line, hidden by default, that only appears when `!navigator.onLine`
  (via the `online`/`offline` window events) — quiet when everything's
  normal, visible only when it's actually useful to know.
- **Settings dialog**: a new "Your data" section explaining, in plain
  language, that everything stays local (no account, no server) and
  pointing at Clear Data for a controlled reset versus clearing browser
  site data entirely.
- New CSS: `.connection-status` and `.update-banner`, both small fixed-
  position pills. `.connection-status` deliberately reuses the same
  "colored text + colored border on a neutral panel background" pattern
  already established by `.status-chip--warning`, rather than a solid
  `--color-warning` fill with white text — checked the contrast math for
  `--color-warning`-on-`--color-panel` across all 4 theme packs × their
  light/dark variants (8 combinations) and every one landed between 5.19
  and 10.49:1, comfortably above WCAG AA's 4.5:1 for normal text; a
  couple of the theme packs' `--color-warning` values are light amber
  tones meant to be read as foreground text, and would have failed
  contrast badly as a background fill under white text.

**Explanation (manifest vs. service worker, install/activate/fetch
lifecycle, cache versioning, precache failure behavior, navigation
fallback, relative paths):**

- *Manifest vs. service worker*: the web manifest is a static, declarative
  JSON file — the browser reads it to decide things like the app's name,
  icon, and start URL *if* the user installs it to their home screen/app
  list. It does nothing for offline behavior by itself. The service
  worker is the opposite: an actual background script the browser runs
  independently of any open tab, and it's the only piece that can
  intercept network requests and decide to serve a cached response
  instead — offline support is 100% the service worker's job, not the
  manifest's.
- *Install/activate/fetch lifecycle*: `install` fires once, the moment
  the browser sees a new-or-changed `sw.js`; this is where the mandatory
  and optional precaching above happens. `activate` fires once the new
  worker is about to start controlling pages; this is the correct (and
  really only sanctioned) place to clean up old caches, since at that
  point nothing is still relying on them. `fetch` fires on every network
  request the page makes for as long as the worker is active/controlling
  it, and is the only handler that can actually change what a request
  returns (via `event.respondWith()`).
- *Cache versioning*: `CACHE_NAME` is a plain string constant with a
  version suffix — nothing hashes file contents or bumps it
  automatically. That's a deliberate, simple, always-correct-by-
  construction choice for a project with no build step: the developer
  who changes a core file is the one person who reliably knows a bump is
  needed, and the `activate` handler's "delete anything that isn't the
  current name" logic means bumping is the *entire* update mechanism —
  no separate cleanup step to remember.
- *Precache failure behavior*: `cache.addAll()` is atomic — if any single
  URL in the list 404s or errors, the *whole* call rejects and `install`
  fails, meaning this service worker never activates at all (the browser
  falls back to whatever was controlling the page before, or none). That
  behavior is exactly right for the mandatory app-shell list (a missing
  core file means something is genuinely broken), but exactly wrong for
  optional assets — which is why they're precached in a separate loop
  with per-file `try`/`catch`, so `background-music.mp3` being absent
  can't drag `inspiresoftwareintro.mp4` and `logo.png` down with it, and
  can't fail installation at all.
- *Navigation fallback*: a "navigation" is specifically a request for a
  new document (typing the URL, hitting reload, following a link) as
  opposed to a request for a script/stylesheet/image a page already
  makes on its own. This app has exactly one real page (`index.html`) —
  every screen is a client-side show/hide, not a real navigation — so
  "app-shell fallback" here just means: if a navigation request fails
  (offline), serve the cached `index.html` instead of a browser error
  page, and everything downstream (its `<script type="module">` import,
  which pulls in the already-cached `js/**` graph) continues to work from
  there.
- *Why relative paths matter*: `start_url`/`scope` in the manifest and
  every `fetch`/`cache.addAll()` path in `sw.js` are written as `./...`,
  resolved against the file's own location rather than the site's domain
  root. Hard-coding `/index.html` would work fine at
  `https://user.github.io/` but break at
  `https://user.github.io/sudoku-by-inspire-v1/` (GitHub Pages' normal
  project-site URL shape) — the browser would look for
  `/index.html` at the domain root, not inside the repo's subpath. This
  is the exact same constraint CLAUDE.md already states for every other
  asset reference in the app; `sw.js` and the manifest just extend it to
  service-worker/PWA-specific paths too.

**Checks run:**

- `node --check` on every new/modified JS file — all clean; `styles.css`
  brace-balance check; `manifest.webmanifest` parsed as valid JSON.
- `npm test`: 163/163 passing, unchanged (this phase's code is
  browser/service-worker-runtime behavior with no pure logic to unit-test
  in Node — verified via Playwright instead, per the prompt's own test
  list).
- Playwright verification, covering every scenario the prompt named:
  - **First online visit**: manifest linked with a relative href, service
    worker reaches `'activated'`, exactly one clearly-named cache exists,
    all four mandatory app-shell files are in it, both existing optional
    root assets (`logo.png`, the intro video) are in it, the missing
    optional `background-music.mp3` correctly is *not*, no console/page
    errors.
  - **Reload**: online reload lands cleanly back on the Start screen, no
    errors.
  - **Offline reload**: after one online visit + a bit of navigation (to
    let the fetch handler runtime-cache the JS module graph),
    `context.setOffline(true)` + reload still renders the Start screen
    and can still dynamically `import()` an already-visited module —
    no errors.
  - **Service-worker update after cache-version change**: bumped
    `CACHE_NAME` in a scratch copy of `sw.js` (exactly the developer
    workflow documented at the top of the real file), triggered
    `registration.update()`, confirmed the "Update available" banner
    appeared, clicked Refresh, reloaded, and confirmed exactly one
    cache remained afterward and it was the *new* version — the old one
    was cleaned up automatically.
  - **Missing optional asset**: covered by the first-visit check above
    (`background-music.mp3` absent, install still succeeds, no errors).
  - **GitHub Pages-style subpath**: every one of the above tests ran
    against a local static server mounting the app under a
    `/sudoku-by-inspire-v1/` prefix (mimicking a GitHub Pages project
    site), not the domain root — manifest, service worker registration,
    and every cached path all resolved correctly.
  - Note: real browser devtools "Network: Offline" throttling wasn't
    available to drive from this sandboxed environment; `context.
    setOffline(true)` via Playwright (which actually blocks the
    network layer, not just simulates it) is the practical equivalent
    used instead, and exercises the same service-worker fetch-
    interception code path devtools throttling would.

**Remaining limitations:**

- No icon files exist yet (`icons/README.md` documents exactly what's
  needed); until they're supplied, the manifest's `"icons": []` means the
  app is installable but without a custom icon — some platforms may
  decline to show an install prompt at all without one.
- Background music still isn't a real file in this repo (correctly, per
  CLAUDE.md); the precache/offline behavior around its absence is
  verified, but there's nothing to actually hear yet.
- The update banner's Refresh button reloads the *current* tab; other
  open tabs on an old version won't be prompted until they're
  interacted with or reloaded themselves — acceptable for a small,
  single-tab-typical app, but worth knowing if that assumption ever
  stops holding.

---

## 2026-07-28 — Phase 9: Audio, Haptics, and User-Gesture Initialization

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 8" (audio/haptics) is `TASKS.md`'s Phase 9 (Audio)
— matches it directly, no renumbering needed this time.

**What was built:**

- **`js/audio-settings.js`** — persisted audio/haptics preferences
  (`musicEnabled`, `sfxEnabled`, `vibrationEnabled`, `musicVolume`,
  `sfxVolume`) under `inspireSudoku:v1:audioSettings`, on the same
  versioned-storage-with-safe-fallback pattern as `theme.js` and
  `game-settings.js`. Deliberately knows nothing about `AudioContext` —
  that split lets the Settings dialog show/persist volume and mute state
  even before the audio engine itself has ever been initialized.
  Following the existing precedent set by `theme.js` and
  `game-settings.js` (both thin settings wrappers with no dedicated test
  file of their own, since their real logic lives in — and is tested by —
  `storage.js`), this module has no dedicated test file either; this
  phase's own verification is manual/browser-driven per the prompt.
- **`js/audio.js`** — the AudioManager engine: one lazily-created, reused
  `AudioContext`; `playClick()`, `playSelect()`, `playError()`,
  `playCompletion()` — each a short synthesized oscillator+gain-envelope
  tone (see below); `vibrate(pattern)`; optional looping background
  music loaded from `./background-music.mp3` (absent in this repo — its
  `error` listener marks it unavailable and the app carries on silently,
  the same pattern already used for the intro video's missing-file
  handling); pauses music on `document.visibilitychange` to hidden,
  resumes only if the music toggle is still on and the file did load;
  reacts to `js/game-state.js`'s `onStateChange` by diffing the previous
  vs. current snapshot to decide when to play `select` (a real, in-play
  selection change), `error` (mistakes count went up), or `completion`
  (status just became `'complete'`) — game-state.js itself stays fully
  audio-agnostic, exactly as its own header comment already promises for
  DOM.
- **`js/ui/audio-bindings.js`** — one delegated `document`-level click
  listener plays the generic `click` tone for any `<button>` press,
  excluding `.cell` board buttons (which already get their own `select`
  tone from the state-diffing above — both firing on the same tap would
  just double up). This covers every button in the app — number pad,
  toolbar, dialogs, menu nav — without editing any of those individual
  UI modules.
- **`initAudioEngine()` wired to the Start screen's gesture handler**
  (`index.js`), called synchronously alongside `playIntro()`, not
  "sometime after" it — browsers only treat an `AudioContext` as
  user-unlocked if it's created/resumed from directly inside the actual
  call stack of a real click/keydown event; an `await` or a `.then()`
  later loses that unlocked status in some browsers (notably Safari).
  `initAudioEngine()` is idempotent (a no-op after the first call), so
  nothing needs to track "did this already run" itself.
- **Settings dialog**: new "Audio & Haptics" fieldset — Background music
  toggle + volume slider, Sound effects toggle + volume slider, Vibration
  toggle. The vibration checkbox is disabled (with an explanatory hint)
  when `navigator.vibrate` doesn't exist, rather than letting the player
  turn on a setting that can never do anything on their device/browser.
- New CSS: `.settings-slider` for the two volume rows — reuses the
  existing `--color-accent` via the `accent-color` property (same
  mechanism the checkbox/radio `.option-tile`s already lean on) so native
  range-input styling matches the rest of the theme automatically.

**Bug found and fixed during this phase's verification (unrelated to
audio, but directly blocking it):** `js/ui/intro-video.js`'s `error`
listener on the intro `<video>` called `finishIntro()` (→
`showScreen('menu')`) unconditionally. Browsers can start probing a
`<video>`'s `src` for metadata the instant the page loads, independent of
any user gesture — confirmed here, where this sandbox's headless
Chromium can't decode the video's codec and fires that `error` event
within tens of milliseconds of page load. That meant the app could skip
straight from the Start screen to the main menu before the player ever
clicked anything, silently bypassing the Start gate — and with it,
`initAudioEngine()`, since that only runs from inside the Start screen's
click handler. Caught by a Playwright test that reloaded the page twice
in the same browser process (the second load's codec probe resolved fast
enough to consistently lose the race; the first load's didn't, which is
why this had gone unnoticed in every previous phase's verification).
Fixed by only treating the video's `error` event as "the intro failed,
skip to menu" while the intro screen is actually the active one
(`getCurrentScreen() === 'intro'`) — an early probe failure that happens
before `playIntro()` was ever called is now just ignored, and the Start
gate can no longer be silently bypassed.

**Explanation (browser autoplay restrictions, AudioContext lifecycle,
oscillator frequency, gain envelopes, clipping prevention, feature
detection):**

- *Autoplay restrictions*: browsers block audio (and often video) from
  playing until a real user gesture — a click or keydown, not a
  programmatic event — has occurred on the page, specifically to stop
  sites from ambushing visitors with sound. Critically, the unlock only
  "counts" if the audio API call happens synchronously inside that
  gesture's own event handler; code that runs later (even a `.then()`
  chained off a promise started inside the handler) can lose that
  privilege in stricter browsers. That's why `initAudioEngine()` is
  called directly, synchronously, from the Start screen's click/keydown
  callback in `index.js`, not queued or deferred.
- *AudioContext lifecycle*: a fresh `AudioContext` starts in a
  `'suspended'` state until a user gesture resumes it (some browsers
  create it already-running post-gesture; others still require an
  explicit `.resume()` call). It can also be auto-suspended later by the
  browser during extended inactivity. `ensureContextRunning()` calls
  `.resume()` (fire-and-forget — its promise settling asynchronously is
  fine, since scheduling sounds against `audioContext.currentTime` is
  valid either way) before every sound is scheduled, so a sound
  attempted while suspended doesn't just silently vanish forever.
- *Oscillator frequency*: each SFX is one (or a few, for completion) sine
  or square wave at a chosen pitch — `click` at 620Hz (a short, neutral
  tick), `select` sweeping 720→900Hz (a small upward "chosen" cue),
  `error` sweeping 260→140Hz on a buzzier square wave (a downward "wrong"
  cue), `completion` as a four-note ascending arpeggio (C5, E5, G5, C6).
  Frequency sweeps are done with `exponentialRampToValueAtTime`, which
  the ear perceives as a smoother pitch glide than a linear ramp.
- *Gain envelopes*: every tone ramps its gain node from 0 up to a low
  peak (attack) and back down to ~0 (release) rather than jumping
  straight to full volume and back — a sound that starts or stops
  instantly at nonzero amplitude produces an audible "click" from that
  sudden discontinuity in the waveform, which is exactly the kind of
  artifact a short UI blip is most likely to expose.
- *Clipping prevention*: two layers. First, every tone's peak gain is
  kept deliberately low (0.12–0.16) so that even several sounds
  overlapping (e.g., a wrong digit fires `click` and `error` in the same
  instant) sums to well under full scale. Second, both the SFX and music
  gain chains funnel through one shared `DynamicsCompressorNode` before
  reaching the destination — a cheap safety margin against that sum ever
  clipping, not something load-bearing given the first layer already
  keeps levels conservative.
- *Feature detection*: `window.AudioContext || window.webkitAudioContext`
  is checked once; if neither exists, the engine never creates a context
  and every `playX()`/`vibrate()` call already checks for a live context
  or a real `navigator.vibrate` function before doing anything — so an
  unsupported browser gets a fully silent, error-free app rather than a
  thrown exception. The Settings dialog does the same check for
  vibration specifically, disabling that one toggle (with an explanatory
  hint) rather than leaving it live with no effect.

**Checks run:**

- `node --check` on every new/modified JS file — all clean.
- `npm test`: 163/163 passing, unchanged from Phase 7 (no automated
  tests added this phase — see the audio-settings.js note above; the
  prompt itself asked for manual/browser verification instead).
- Browser verification (headless Chromium via Playwright) covering every
  scenario the prompt named:
  - **First interaction**: `initAudioEngine()` reachable and
    `playClick()` callable with no throw immediately after the Start
    click.
  - **Mute/unmute**: toggling music/SFX off is reflected in
    `getAudioSettings()` immediately.
  - **Volume changes**: dragging both sliders persists the exact value
    and survives a full page reload.
  - **Hidden-tab behavior**: dispatching `visibilitychange` to hidden and
    back to visible runs the pause/resume-check logic with no throw.
  - **Missing music**: confirmed `./background-music.mp3` genuinely 404s
    in this repo, and no page error results from that.
  - **Repeated button presses**: 10 rapid Settings-dialog open/close
    cycles produced no console or page errors.
  - **Unsupported AudioContext**: deleted `window.AudioContext`/
    `webkitAudioContext` before load, then clicked through Start → menu →
    Statistics → New Game → Cancel with no errors.
  - **Unsupported vibration**: stubbed `navigator.vibrate` to `undefined`
    before load; confirmed the Settings checkbox is disabled with the
    "Not supported" hint, and that triggering a real mistake (which
    calls `vibrate()` internally via `playError()`) still doesn't throw.
  - A full gameplay pass (select a cell, move selection, make a mistake,
    solve the rest of the puzzle to completion) exercised the `select`/
    `error`/`completion` state-diff paths end-to-end with no errors.

**Remaining limitations:**

- No actual `background-music.mp3` ships with this repo (correctly, per
  CLAUDE.md's binary-asset policy — it's optional and not one of the two
  protected assets); background music itself hasn't been *heard* in this
  environment, only verified to fail absence-detection correctly. If the
  user supplies the file later, it should Just Work via the existing
  loader, but that's worth a quick real-browser spot-check when it lands.
- Sound quality (the specific oscillator waveforms/frequencies chosen)
  is a first pass, not something that can be meaningfully judged from
  automated verification — worth a real-ears listen and adjustment pass
  from the user when convenient.
- No visual "now playing"/mute-state indicator outside the Settings
  dialog (e.g. no persistent mute icon on the game screen) — not
  requested by this phase, but worth deciding on later if it turns out
  to matter in practice.

---

## 2026-07-28 — Phase 7: Save Data, Statistics, Best Times, and High Scores

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's "Phase 7" covers both `TASKS.md`'s Phase 7 (Persistence)
and Phase 8 (Statistics/High Scores) in one pass — both are now marked
done in `TASKS.md`.

**What was built:**

- **`js/storage.js`** — the generic safe-localStorage foundation every
  persisted feature now shares: `loadJSON(key, fallback, validator?)`,
  `saveJSON(key, value)`, `removeJSON(key)`. Every failure mode (storage
  denied/quota exceeded, malformed JSON, missing key, `localStorage`
  itself unavailable, a validator rejecting the shape) falls back to the
  caller's `fallback` value rather than throwing. `js/theme.js` and
  `js/game-settings.js` were migrated onto it, and their keys renamed
  under a shared versioned prefix: `inspireSudoku:v1:appearance` and
  `inspireSudoku:v1:gameplaySettings` (previously `sudoku-inspire:*`).
  Kept as two separate keys rather than one merged `...:settings` blob —
  they're read/written independently by unrelated modules, and merging
  would only add read-modify-write coordination between them for no
  functional benefit.
- **`js/active-game-store.js`** — persists exactly one in-progress game
  under `inspireSudoku:v1:activeGame` (versioned, validated on load:
  board-shape checks on puzzle/solution/entries/notes, difficulty must be
  a known id, counters must be non-negative integers, status must be
  `'playing'` or `'paused'` — a persisted `'complete'` status is never
  written in the first place). Any corrupt/incompatible save fails safely
  back to "no save," so Continue Game just stays disabled instead of
  crashing.
- **`js/statistics-store.js`** — per-difficulty counters under
  `inspireSudoku:v1:statistics`: games started/completed, total play
  time, best time, current streak, best streak, total hints, total
  mistakes. `completionRate` and `averageTimeSeconds` are *derived* on
  read from the raw counters, never stored, so they can't drift out of
  sync with them. `recordGameStarted`/`recordGameCompleted`/
  `recordGameAbandoned` are called directly by the specific UI code that
  unambiguously knows what just happened (see below) rather than
  inferred from generic state-change events, which would have to
  disambiguate "new game" from "Continue Game restore" and "abandon" from
  "ordinary pause."
- **`js/high-scores-store.js`** — top-10 leaderboard per difficulty under
  `inspireSudoku:v1:highScores`, sorted by score descending with ties
  broken by faster elapsed time. `recordHighScore` returns the entry's
  1-based rank, or `null` if it didn't place in the top 10.
- **`js/scoring.js`** — the single, centralized, documented scoring
  formula (previously an inline placeholder in `js/completion.js`, and a
  now-removed, redundant `HINT_SCORE_PENALTY` constant in
  `js/game-state.js`):
  `score = round(BASE_SCORE × difficulty.scoreMultiplier + speedBonus − mistakes×MISTAKE_PENALTY − hints×HINT_PENALTY)`,
  floored at 0. `speedBonus = max(0, parSeconds − elapsedSeconds) × SPEED_BONUS_PER_SECOND`
  — going over par costs you the bonus, never turns into a penalty.
  `js/completion.js`'s `estimateScore` now just delegates to it.
- **`js/game-persistence.js`** — the one place game-state changes turn
  into storage writes: debounced autosave (500ms, plus a `pagehide`
  listener to flush a save that's still pending when the tab closes)
  while `status` is `'playing'`/`'paused'`, and on the transition into
  `'complete'`: records the finished game into statistics, computes its
  score, records it into high scores, and clears the active-game save
  (nothing left to "continue"). `recordGameStarted`/`recordGameAbandoned`
  are deliberately *not* called from here — they're called directly from
  `js/ui/game-screen.js` (`startNewGame`, right before `startGame()`) and
  `js/ui/new-game-confirm-dialog.js` (on confirming a replacement),
  which are the actual unambiguous moments those things happen.
- **`restoreGame(saved, options?)`** and **`resetToIdle()`** added to
  `js/game-state.js`. `restoreGame` always lands in `'paused'` regardless
  of the save's own status — Continue Game should always show the pause
  overlay and require an explicit Resume, never drop the player straight
  into a mid-puzzle board. `resetToIdle` fully stops the timer and clears
  in-memory state, used by Clear Data so a stale in-memory game can't
  quietly resurrect a save on its next autosave tick.
- **New Game confirmation** (`js/ui/new-game-confirm-dialog.js`) — only
  interrupts with a dialog if there's actually an unfinished game
  (`status` is `'playing'` or `'paused'`); confirming records the
  abandonment (resets the current streak) and clears the save before
  opening the difficulty picker.
- **Clear Data confirmation** (`js/ui/clear-data-dialog.js`) — clears the
  active game, statistics, and high scores, and resets any in-memory
  game; leaves appearance/gameplay settings untouched (the dialog copy
  says so explicitly, pointing at Reset Appearance instead).
- **Statistics screen** (`js/ui/statistics-screen.js`) and **High Scores
  screen** (`js/ui/high-scores-screen.js`), both driven by a shared
  **`js/ui/difficulty-filter.js`** tab component (`role="tablist"`,
  `aria-selected` on the active button).
- New CSS: `.difficulty-filter`/`.difficulty-filter-btn` (a 2×2 grid on
  mobile, single row of 4 from the existing 768px breakpoint — a plain
  flex row wrapped unpredictably at narrow widths), `.stats-grid`/
  `.stats-item`, `.highscores-list`/`.highscore-row` and its rank/score/
  detail/date sub-elements. The two new confirmation dialogs needed no
  new CSS — they reuse the existing `.settings-dialog`/`.settings-form`/
  `.settings-actions` pattern.

**Key technical notes (serialization, defensive parsing, schema/
versioning, validation, debouncing, derived statistics, scoring):**

- *Serialization*: every store's public shape is a plain JSON-safe object
  (`{ version, ...fields }`); `JSON.stringify`/`JSON.parse` round-trip it
  as-is, with no `Map`/`Set`/`Date`-object fields to lose fidelity.
- *Defensive parsing*: `loadJSON` treats storage access itself, JSON
  parsing, and shape validation as three independently failable steps —
  any one failing returns the caller's `fallback`, never throws or
  returns a half-valid object.
- *Schema/versioning*: every stored object carries a `version` field;
  validators reject anything whose version doesn't match the current
  constant, so a future schema change can detect and discard (or, later,
  migrate) old-shaped data instead of silently misreading it.
- *Validation*: beyond the version check, each validator re-checks the
  invariants the rest of the app assumes hold (board-length arrays,
  known difficulty ids, non-negative integer counters, a bounded/sorted
  high-score list) — data is trusted only after passing the same checks
  fresh code would need anyway.
- *Debouncing*: `game-persistence.js` collapses rapid-fire state changes
  (each keystroke, each note toggle) into one write 500ms after the last
  one, trailing-edge, with a `pagehide` flush so nothing in the last
  500ms before a tab closes is lost.
- *Derived statistics*: `completionRate` and `averageTimeSeconds` are
  computed from raw counters on every read rather than stored, so they
  can never drift from the numbers they're derived from.
- *Scoring formula*: base value scaled by difficulty, plus a bonus for
  finishing under a per-difficulty par time, minus flat per-mistake and
  per-hint penalties, floored at zero — centralized in one module so
  every place that shows or ranks a score (completion dialog, high
  scores) uses the exact same number.

**Checks run:**

- `node --check` on every new/modified JS file — all clean.
- `npm test` (Node's built-in test runner): 163 tests across 56 suites,
  all passing, including the 5 new store/formula test files
  (`storage.test.js`, `scoring.test.js`, `active-game-store.test.js`,
  `statistics-store.test.js`, `high-scores-store.test.js`) plus the new
  `restoreGame`/`resetToIdle` coverage in `game-state.test.js`.
  - Testing note: Node has no global `localStorage`. Rather than change
    any production module's API to accept an injected storage object,
    each store's test file installs a small in-memory
    `globalThis.localStorage` polyfill in `beforeEach`/removes it in
    `afterEach` — production code is untouched and still exercised
    exactly as the browser would call it.
- Browser end-to-end pass (headless Chromium via Playwright, served over
  a local static HTTP server): start → menu → New Game → deliberate
  mistake → autosave → back to menu (Continue Game becomes enabled) → New
  Game confirmation (Cancel leaves the game untouched; Confirm abandons
  it, resets the streak, and opens the difficulty picker) → Continue Game
  restores the exact save (mistake count preserved, always paused) →
  solved the rest of the puzzle through the real `game-state.js` API
  (exercising the actual completion → statistics → high-score →
  clear-active-game path, not a mock) → completion dialog shows a
  positive score → Statistics screen reflects the finished game (1
  completed, 100% completion rate, 1 mistake) → High Scores screen shows
  the one ranked entry → Clear Data removes the save, statistics, and
  high scores in one action, leaving appearance/gameplay settings alone.
  No unexpected console/page errors (the known Phase 1 intro-video codec
  message in this sandbox's headless Chromium is excluded, as
  established in the Phase 1 log entry).
- **Bug caught by this verification pass, fixed before commit:**
  `recordGameStarted` existed in `statistics-store.js` and was documented
  in `game-persistence.js`'s own comment as being called from
  `js/ui/game-screen.js` — but it never actually was. "Games Started"
  read 0 while "Games Completed" read 1, and completion rate showed 0%
  instead of 100%. Fixed by calling `recordGameStarted(difficultyId)` in
  `startNewGame()` right before `startGame()`, the one unambiguous place
  a brand-new game begins.
- **CSS bug caught the same way:** `.difficulty-filter`'s plain
  `flex-wrap` layout wrapped unpredictably at a 420px mobile viewport
  (three buttons on one row with the third clipped, the fourth alone on
  its own row). Switched to a 2×2 CSS grid on mobile, reverting to a
  single row of 4 at the existing 768px desktop breakpoint.
- Also corrected leftover copy in the completion dialog that claimed
  scoring was "a provisional estimate — final scoring lands in a future
  phase," which stopped being true once this phase landed.

**Remaining limitations:**

- Audio/input-preference persistence is still deferred to Phase 9 —
  `js/audio.js` doesn't exist yet, so there's nothing to persist.
- No migration path exists yet for a future schema-version bump beyond
  "detect mismatch, discard" — acceptable for v1, would need revisiting
  if a real schema change ever needs to preserve old data.
- `js/game-persistence.js` itself isn't unit-tested (it's a thin,
  browser-only `window`/`onStateChange` wiring module with no pure logic
  of its own to isolate — consistent with how `theme.js` was already
  handled); it's covered by the browser end-to-end pass instead.

---

## 2026-07-28 — Phase 6: Gameplay Tools and Completion Flow

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

This prompt's own "Phase 6" (gameplay tools/completion) doesn't match
`TASKS.md`'s prior Phase 6 (Persistence). Same pattern as Prompts 3-5:
inserted as the actual Phase 6, Persistence and everything after shift
down by one (now Phases 7-13).

**What was built:**

- **`toggleNote(index, value)`** (`js/game-state.js`): pulled the notes-
  toggling logic out of `applyNumberInput` into its own function with
  its own guards — status playing, valid index/value, not a fixed clue,
  **and not already filled** (new: previously, toggling notes on a
  filled-but-not-fixed cell would silently accumulate note bits that
  were never rendered but never cleaned up either — harmless in
  practice since `eraseSelectedCell` already zeroed notes, but wasteful,
  inconsistent state that could resurface confusingly). `applyNumberInput`
  now delegates to it in notes mode instead of duplicating the logic.
- **Bounded undo history**: `MAX_HISTORY_SIZE = 50` (exported for
  transparency/testing), enforced in `pushHistory` by shifting the
  oldest snapshot off once the cap is exceeded. Entry, erase, notes, and
  (new) hint actions all route through the same `pushHistory`, so undo
  covers all four uniformly rather than needing per-action-type logic.
- **`useHint()`**: reveals `solution[selectedIndex]`, treated exactly
  like a normal entry afterward (clears that cell's notes, clears the
  value from peer notes) except it never counts as a mistake and
  increments `hintsUsed` instead. `HINT_SCORE_PENALTY` is exported as
  scoring metadata — Phase 8 (Statistics) owns the real formula, this
  just records what a hint costs at the moment it's used. Gated behind
  a confirmation `<dialog>` (`js/ui/hint-dialog.js`); the action itself
  stays a plain, directly-testable function with no confirmation logic
  baked in — that's a UI concern layered on top.
- **Timer redesign**: elapsed time is now timestamp-anchored
  (`state.elapsedSeconds` = confirmed seconds from completed segments,
  plus live `now() - segmentStartedAt` while a segment is running)
  instead of counted by a `setInterval` callback incrementing +1 each
  tick. Multiple independent pause causes compose through a `Set` of
  opaque suspension reasons (`suspendTimer('hidden')`,
  `suspendTimer('dialog')`) rather than a single boolean two callers
  could stomp on — the timer only actually resumes once *every* reason
  clears. `pauseGame()`/`resumeGame()` (explicit user pause) additionally
  stop/start the underlying `setInterval` itself, not just gate it,
  since an explicit pause can last indefinitely and there's no reason to
  keep a live interval ticking uselessly the whole time; suspension
  reasons (dialog/hidden-tab) are expected to be brief, so they only
  gate the interval's callback, leaving the interval itself running.
- **Immediate error checking setting** (`js/game-settings.js`, new,
  versioned localStorage, mirrors `js/theme.js`'s pattern exactly but as
  its own file/key — gameplay preferences vs. appearance preferences are
  different concerns): mistakes are *always* counted internally
  (`state.mistakes` doesn't know or care about this setting); the
  setting only controls whether `board-view.js` renders the red
  "wrong entry" styling live. Wired into a new "Gameplay" group in the
  Settings dialog.
- **Completion dialog** (`js/ui/completion-dialog.js`, new) replaces the
  old plain-text "Solved!" message in `#game-status`: difficulty,
  elapsed time, mistakes, hints, a score (`js/completion.js`'s
  `estimateScore` — explicitly labeled in the UI as a provisional
  placeholder, not the real Phase 8 formula), and generated Share
  Results text (`buildShareText`) with a Copy Results button
  (`navigator.clipboard`, falling back to "select the visible text
  by hand" if the Clipboard API is unavailable or denied — never a dead
  end either way). New Game reopens the difficulty picker; Menu returns
  to the main menu.
- **Never expose solution values in DOM attributes**: audited
  `board-view.js` and the new hint/completion code — the Hint button's
  enabled state, `is-error` styling, and everything else that needs to
  know a cell's correct value only ever does that computation in JS
  memory, never by writing it into a `data-*` attribute or similar a
  player could read via devtools. Verified with an automated check that
  serializes every still-empty cell's HTML and confirms no solution
  digit appears in it.

**A real product gap found during browser testing, not part of the
original plan:** Settings was only reachable from the main menu. That
directly undermines two of this phase's own features — the immediate-
error-checking setting is far more useful to toggle mid-game than from
the menu, and "a blocking dialog pauses the timer" has nothing to
demonstrate itself against if no dialog can ever open while a game is in
progress. Added a Settings (gear) button to the game screen's header,
wired to the same `openSettingsDialog()` Phase 2 already built — no new
dialog needed, just a second way to reach the existing one.

**Test results:**

```
# tests 101   (30 engine + 15 generator + 48 game-state + 8 completion)
# pass 101
# fail 0
```

18 new `game-state.test.js` tests cover: `toggleNote` (sets/clears bits,
preserves unrelated notes, rejects fixed and filled cells, confirms
`applyNumberInput` delegates to it in notes mode); bounded history
(pushing `MAX_HISTORY_SIZE + 10` times caps at exactly
`MAX_HISTORY_SIZE`); `useHint` (reveals the correct value without
counting a mistake, clears the hinted cell's and peers' notes, rejects
no-selection/fixed/already-correct, is undoable, can trigger completion,
and that `HINT_SCORE_PENALTY` is real metadata); and the timer (elapsed
time accrues from an injectable fake clock with zero real intervals;
pausing freezes it and resuming continues from where it left off, not
from zero; a suspension reason freezes it without touching `status`;
multiple simultaneous suspension reasons only release once *all* clear;
completion freezes it permanently). New `completion.test.js` (8 tests)
covers `estimateScore` (harder difficulty scores higher for identical
performance, mistakes/hints each reduce it, floors at 0) and
`buildShareText` (contains every expected field, correct singular/
plural wording, and is a pure function — same input always produces the
same output).

**Browser verification** (headless Chromium, 21 checks): Hint button
correctly disabled with no selection and enabled once an editable,
incorrect cell is selected; the confirm dialog reveals the value and
increments the counter; Cancel does nothing; Ctrl+Z undoes a hint
(value cleared, counter reverts); immediate-error-checking OFF hides the
red styling while still counting the mistake internally, ON shows it
again for the same entry; the timer is provably frozen (identical
displayed value before/after) across a 2-second real wait with the
Settings dialog open, and frozen via `suspendTimer('hidden')` directly;
the completion dialog shows the correct difficulty/mistakes/hints/a
numeric score, generates consistent share text, Copy Results shows
confirmation text, Menu and New Game both work; and the DOM-solution-
leak audit above. Zero unexpected console errors throughout (the one
pre-existing video-codec message aside). Screenshots spot-checked in
Paper/light: the new header (difficulty/time/mistakes/hints/settings
gear), the hint confirmation dialog, and the completion dialog all read
cleanly.

**Design concepts worth explaining** (also see inline comments in
`js/game-state.js`):

- *Set/array representation for notes*: a 9-bit integer per cell (bit
  `d-1` = digit `d` is a candidate) rather than a `Set<number>` or a
  9-element boolean array. The main win is peer cleanup: removing a
  placed digit from every peer's notes is `notes[peer] &= ~bit` — one
  cheap bitwise op per peer — instead of a `Set.delete` or an array
  search-and-splice repeated 20 times per placement. It's also trivially
  serializable as a plain number for the localStorage autosave the next
  phase adds, with no custom (de)serialization for a `Set`.
- *Snapshots vs. action history*: undo stores full snapshots (`entries`,
  `notes`, `selectedIndex`, `mistakes`, `hintsUsed` at that moment), not
  a log of "what action happened." Snapshots make `undo()` trivial and
  unconditionally correct — pop, restore, done — regardless of which of
  four different action types produced that snapshot. An action-log
  design would need an inverse operation defined for every action type
  (undo an entry vs. undo a hint vs. undo a note-toggle each look
  different) and would be easy to get subtly wrong for one of them.
  Snapshots cost more memory per entry (two 81-element array copies),
  which is exactly why bounding history size matters here in a way it
  wouldn't for a pure action log.
- *Interval lifecycle*: `startTimer()`/`stopTimer()` manage exactly one
  `setInterval`, always torn down (`clearInterval` + null the handle)
  before a new one is created — `startGame()`, and now `pauseGame()`/
  `resumeGame()`, all funnel through this pair rather than ever calling
  `setInterval` directly, which is what makes "avoid duplicate
  intervals" structurally true instead of just tested-and-hoped-for. The
  interval's callback does almost nothing (`if (canSegmentRun())
  notify()`) — it doesn't compute or store elapsed time itself, so
  whether it's running, throttled by a backgrounded tab, or briefly
  delayed under load has zero effect on the *correctness* of the elapsed
  value the next `getState()` call returns, only on how promptly the UI
  repaints it.
- *Visibility events*: `js/ui/controls.js` is the only place that
  reads `document.hidden`/`visibilitychange` — `game-state.js` never
  touches `document` at all, receiving only an opaque `'hidden'` string
  via `suspendTimer`/`resumeTimer`. That's what keeps the timer logic
  fully Node-testable (no DOM, no fake `document` needed in tests) while
  still letting the real app react to real tab-visibility changes.
- *Pause state*: two genuinely different mechanisms, both reachable
  through the timer, deliberately not merged into one. `status: 'paused'`
  is a full, potentially long-lived, user-visible state — it stops the
  interval outright and shows the obscuring overlay. Suspension reasons
  are brief, incidental interruptions (a 2-second dialog, a tab glance)
  that shouldn't cost the player time but also shouldn't interrupt the
  game with an overlay for something that minor. Conflating them would
  mean either dialogs triggering a jarring pause screen, or an explicit
  pause leaving a pointless interval running for however long the
  player leaves it paused.
- *Completion-state transitions*: `finishIfSolved()` (used by both
  `applyNumberInput` and `useHint`, previously duplicated between them)
  is the single place `status` becomes `'complete'` — checked via
  `isSolved()` on the merged board, never by counting empty cells or any
  other proxy. Once complete, `commitSegment()` + `stopTimer()` run
  immediately, so elapsed time is frozen at the exact moment of
  completion and can never tick further no matter how long the
  completion dialog stays open afterward.

**Remaining limitations:**

- The completion score is explicitly a placeholder formula
  (`SCORE_BASE * scoreMultiplier - mistakes*20 - hintsUsed*50`, floored
  at 0) — labeled as such in the UI itself. Phase 8 (Statistics) owns
  the real formula and will very likely replace this outright rather
  than tune it.
- Hint has no explicit keyboard shortcut (mouse/touch via the button
  only) — not in this phase's requirements, and unlike undo there's no
  "already fully built, just needs a trigger" argument for adding one
  unrequested.
- `js/game-settings.js` isn't unit-tested via `node --test` — like
  `theme.js`, it touches `localStorage` directly and has no meaningful
  pure logic to isolate from that; verified via the browser checks
  above instead, consistent with how `theme.js` was handled in Phase 2.
- Real device/screen-reader verification for the new Hint/completion UI
  remains open, same category of limitation already logged for Phase 5.

---

## 2026-07-28 — Phase 5: Playable Sudoku Board and Input System

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Earlier planning had this as two future phases (Board Rendering, then
Input Controls). Delivered as one, because they're not actually
separable in practice — a click both selects *and* needs to re-render,
a keypress both mutates *and* needs to re-render, and building the
renderer first with no way to change state (or the inputs first with no
renderer to show the result) would mean touching the same seams twice.
`TASKS.md` reflects this: Phase 5 is now "Playable Sudoku Board & Input
System," and Phases 6-12 (Persistence onward) shift down by one.

**What was built:**

- **`js/game-state.js`** (new): the single source of truth for an
  in-progress game. Every mutating function (`selectCell`,
  `applyNumberInput`, `eraseSelectedCell`, `toggleNotesMode`, `undo`,
  `moveSelection`, `pauseGame`/`resumeGame`) ends by calling one
  internal `notify()` — the one hook the UI (and, later, autosave)
  subscribes to via `onStateChange()`. Composes the Phase 3 engine
  (`isValidPlacement`, `isSolved`) rather than reimplementing conflict/
  completion logic. Notes are stored as a 9-bit integer per cell
  (bit `d-1` = digit `d` is a candidate) rather than a `Set` or array,
  mainly because it makes "clear this digit from every peer's notes"
  a single `&= ~bit` per peer instead of a search-and-splice.
- **`applyNumberInput(value)`**: the phase's central flow, checked in
  order — reject a non-1-9 value, reject if no game is in progress,
  reject if no cell is selected, reject if the selected cell is a fixed
  clue — then record undo history, then branch on notes mode (toggle a
  candidate bit) vs. normal mode (write the entry, clear that cell's own
  notes, clear the placed digit from every peer's notes, count a mistake
  if it doesn't match the stored solution), then run exactly one
  conflict recheck and one completion check, then `notify()` once. No
  intermediate state change is ever announced separately.
- **`js/game-state.test.js`**: 30 tests, one per state-transition
  concern in the phase's requirements list — guards, both entry modes,
  peer-note cleanup, mistake counting, conflict detection, completion
  detection, undo, selection movement/clamping, pause/resume, and (its
  own dedicated test) that exactly one `notify()` fires per mutation,
  and zero fire for a rejected no-op input.
- **`js/ui/board-view.js`** (new): builds the 81 cell buttons once, then
  a single `render(state)` function recomputes every cell's classes and
  text from the current state snapshot on every state change — fixed
  clue vs. player entry vs. notes-in-progress, selected/related/
  matching-value/conflict/error, all freshly derived, never read back
  from the DOM. A single delegated click listener on the board container
  resolves which cell was clicked from the event, rather than 81
  individual listeners.
- **`js/ui/controls.js`** (new): keyboard (1-9, Backspace/Delete, all 4
  arrow keys, N for notes, Escape to pause/resume) and number-pad/erase/
  notes-toggle clicks (also event-delegated for the pad). Guarded so
  none of it fires while a `<dialog>` is open or a form field has focus.
- **`js/ui/difficulty-dialog.js`** (new) + markup: New Game now opens a
  difficulty picker — reusing the exact `<dialog>` + option-tile pattern
  from the Phase 2 Settings dialog — before generating, instead of
  always defaulting to Easy as it did as a Phase 4 placeholder.
- **`js/ui/game-screen.js`**: now calls `game-state.js`'s `startGame()`
  once generation resolves, and announces completion once, on the
  transition into `status === 'complete'`, reading `elapsedSeconds`/
  `mistakes` from state rather than anything rendered.
- CSS: a responsive 9×9 grid (`width: min(100%, 32rem)`,
  `aspect-ratio: 1/1`), heavier borders on 3×3 box edges via
  `grid-line-left`/`grid-line-top` classes computed once at cell-build
  time, and the board-state tokens reserved back in Phase 2
  (`--color-cell-selected/-related/-match`, `--color-clue-fixed`,
  `--color-entry-player`, `--color-notes`) finally put to use. Conflicts
  render as an inset `box-shadow` ring (a different CSS property from
  the tint backgrounds) specifically so a conflicting cell's signal
  never has to fight a `background` cascade against selected/related/
  match — and so it's never color-alone, matching the Phase 2 rule.

**A real rendering bug caught by browser testing, not code review:**
`board-view.js`'s first draft only updated a cell's note-digit `<span>`
text inside the "cell is empty" render branch. When a cell went from
"has notes" to "has a real value," the notes container was correctly
hidden (`notesEl.hidden = true`), but the note-digit text nodes
underneath it were never cleared — invisible today, but no longer
actually reflecting `state.notes[index]`, which is exactly the failure
mode "render must derive from state, not from what the DOM already
says" is meant to prevent. An automated browser check caught it
directly (asserting on note-digit text content after a value was
entered, not just container visibility). Fixed by moving the note-digit
text update outside the if/else so it always runs from
`state.notes[index]`, regardless of which branch renders next.

**A deliberate scope decision beyond the phase's literal control list:**
`history`/undo was explicitly required in central state, and
"record undo history before mutation" was an explicit step of
`applyNumberInput`'s flow — so a real, tested `undo()` function exists.
The phase's keyboard-control list didn't mention a trigger for it,
though, and building a fully working, tested undo mechanism with no way
for a real user to ever reach it would be a half-finished feature. Added
Ctrl/Cmd+Z as the trigger — a standard, low-risk, zero-new-UI binding —
rather than leaving it silently unreachable or adding unrequested button
chrome.

**Test results:**

```
# tests 75   (30 engine + 15 generator + 30 game-state)
# pass 75
# fail 0
```

**Browser verification** (headless Chromium, two scripts): difficulty
dialog → New Game → board renders with the correct clue count for Easy;
click-to-select + 20-peer "related" highlighting + DOM focus following
selection; number pad entry and Erase; keyboard digit entry, arrow
navigation, Backspace; notes mode toggling candidates and being cleared
by a real entry (after the bug fix above); two equal values in the same
row flagged `is-conflict`; Escape → pause overlay → Resume; completion
driven by directly mutating the running app's live `game-state` module
instance via `page.evaluate(() => import(...))` to reach an
almost-solved board without 40+ manual clicks, then finishing it with
one real UI click and confirming the "Solved!" message and
`isSolved()`-based detection; Back to Menu. Separately: 320px viewport
has no horizontal overflow and number-pad buttons measure ≥44px;
desktop board cells measure ≥44px; selecting a fixed clue correctly
highlights other same-value cells as `is-match`. All checks pass; zero
unexpected console errors (the one pre-existing video-codec message
aside). Screenshots spot-checked in Cyber/dark (mobile) and Woodgrain/
light (desktop) — 3×3 boundaries read clearly, notes/selection/matching
states are visually distinct in both.

**Design concepts worth explaining** (also see inline comments in
`js/game-state.js` and `js/ui/board-view.js`):

- *State-driven rendering*: `board-view.js`'s `render(state)` treats
  `state` as the complete truth and recomputes every visual property
  from it on every call — never reads a cell's current class list or
  text to decide what it should become next. This is what makes the bug
  above possible to *state* precisely (a code path that skipped
  recomputing one piece of DOM from state) and easy to fix by making
  every path derive from state unconditionally, rather than needing to
  reason about what the DOM might already contain from a previous
  render.
- *Event delegation*: one `click` listener on the board container (and
  one on the number pad) instead of 81 (or 9) individual listeners.
  The handler reads `event.target.closest('.cell')` to find which
  specific cell was clicked at the moment of the click, rather than each
  cell needing its own closure capturing its own index. Fewer listeners
  to create, and cells added/rebuilt later wouldn't need new bindings.
- *Selected-cell logic*: `selectedIndex` lives in `game-state.js`, not
  in the DOM (no "which element has a CSS class" queries) and not
  duplicated into `board-view.js`'s own variable — there is exactly one
  place selection is remembered, and the renderer reads it fresh every
  time along with everything derived from it (related peers, matching
  value).
- *Normal entry vs. notes mode*: same entry point
  (`applyNumberInput`), same guards, then a single branch. Notes mode
  toggles one bit and stops — no mistake counting, no peer cleanup, no
  completion check, because a pencil mark is a guess-in-progress, not an
  answer. Normal mode does all of that, and additionally clears the
  target cell's own notes (an answered cell doesn't need candidates
  anymore) and removes the placed digit from every peer's notes (a
  digit placed in a peer cell is no longer a candidate anywhere it
  conflicts).
- *Peer cells*: "the 20 cells sharing a row, column, or box, excluding
  self" is defined exactly once (`getPeerIndices`, exported from
  `game-state.js`) and reused for both peer-note cleanup during input
  and "related cell" highlighting in the renderer. Two different
  features reading the same definition, rather than two independent
  implementations of "peer" that could quietly drift apart.
- *Why one update/render path prevents inconsistent UI*: every mutating
  function funnels through the same handful of steps and ends in the
  same `notify()`. If `applyNumberInput` and, say, a hypothetical
  separate "clear notes on entry" helper each independently decided
  when to tell the UI to re-render, it would be possible for the DOM to
  reflect a state that existed briefly *between* those two updates —
  notes cleared but the mistake not yet counted, or vice versa. With one
  path, a subscriber only ever sees complete, self-consistent snapshots,
  never a partial one — which is also exactly what made the "one
  `notify()` per mutation" test in `game-state.test.js` meaningful to
  write.

**Remaining limitations:**

- Board cells on very narrow phones (measured ~31px at 320px viewport)
  fall below the general 44px touch-target guideline — this is an
  inherent consequence of fitting 9 cells across a screen that narrow,
  not an oversight; the number pad (the more error-prone target for a
  fat-finger tap) is held to ≥44px. Every mainstream Sudoku app makes
  this same trade-off.
- The `history`/undo mechanism is capped only by memory (no maximum
  depth) — fine for a single game session, but Phase 6 (autosave) should
  decide whether history needs trimming or resetting before persisting.
- `hintsUsed` exists in state as required but nothing increments it yet
  — no hint feature was in this phase's scope; the field is reserved,
  not wired to anything.
- The elapsed-time clock is a plain `setInterval`, not deeply unit-
  tested for real-time accuracy (tests use `autoStartTimer: false` and
  assert state transitions, not wall-clock ticking) — consistent with
  how Phase 4's generation timing was verified (benchmarked/manually
  checked rather than asserted against tight real-time bounds in the
  main suite).
- Two manual-checklist items are explicitly unverified here and need a
  human on a real device: actual touch-tap accuracy (emulated Chromium
  touch isn't a real finger), and a real screen-reader pass over the
  board's `aria-label`s (designed for it, not run through one yet).
- Difficulty-dialog "Cancel" and the native `<dialog>` Escape-to-close
  both correctly leave `game-state` untouched (no game was started) —
  verified by code inspection, not a dedicated automated check.

---

## 2026-07-28 — Phase 4: Puzzle Generation and Difficulty Model

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

**What was built:**

- **`js/sudoku-generator.js`**: sits on top of the pure engine from Phase
  3 without modifying it. `generateSolvedBoard(random)` fills an empty
  board via the same backtracking approach as the engine's solver, but
  shuffles the candidate order at each cell (Fisher-Yates, driven by an
  injectable `random`) instead of trying 1-9 in order, so repeated calls
  produce different valid grids. `generatePuzzle(difficultyId, options)`
  then removes clues from a fresh solved grid one at a time, in a
  shuffled order, checking `countSolutions(puzzle, 2) === 1` after each
  removal and undoing it if uniqueness broke — the standard technique
  for "remove clues while guaranteeing a unique solution."
- **`DIFFICULTIES`**: centralized config for Easy/Intermediate/Advanced/
  Insane — `label`, `minClues`/`maxClues` (the exact bands given: 40-46/
  34-39/28-33/22-27), `scoreMultiplier` (1 / 1.5 / 2.25 / 3.5 — a
  monotonic v1 approximation, easy to retune), `maxAttempts`,
  `timeBudgetMs`, and `solverEffortRange` (an approximate backtracking-
  step range from a *separate*, step-counting solve — see below).
  `isValidDifficultyConfig()` validates the shape, including that
  `minClues` never drops below 17 — the proven minimum for any
  uniquely-solvable Sudoku (McGuire, Tugemann & Civario, 2012), so
  nothing below it could ever pass a uniqueness check regardless of
  tuning.
- **Fallback puzzles**: 2 per difficulty (8 total), all produced by
  running this module's own generator (never hand-typed), captured, and
  independently re-verified with a separate one-off script before being
  hardcoded into `FALLBACK_PUZZLES`. `validateFallbackPuzzles()`
  re-checks shape, that the stored solution actually solves, that every
  given matches it, that the clue count sits in the difficulty's
  configured range, and that `countSolutions` still reports exactly one
  solution — run both at module-load time (a non-fatal `console.warn` if
  anything's wrong) and as a dedicated test.
- **`js/ui/game-screen.js`** (new) + a `#game-status` element
  (`aria-live="polite"`) on the game screen: New Game now generates a
  real puzzle and shows status text through it ("Generating puzzle…" →
  "Ready — Easy puzzle, 43 clues (generated in 116ms, attempt 1)."), or
  a fallback-specific message if live generation didn't finish in time.
  Defaults to Easy — there's no difficulty picker yet, that belongs with
  Phase 5's board/menu UI, not this phase's generator work.

**A real bug found via benchmarking, not just review:** the first
version of `generatePuzzle` only checked its time budget *between*
whole attempts. Benchmarking Insane generation (see below) showed a
*single* attempt's clue-removal pass can itself take up to ~47 seconds
in this environment — so that outer check did nothing to stop one slow
attempt from blocking far past the configured budget. Fixed two ways:
the deadline is now checked before every individual removal (not just
between attempts), and `removeCluesForUniqueness` is now `async` and
`await`s a yield to the event loop every 6 removals, not only between
attempts. Verified with a heartbeat-timer script: over a 2.5s Insane
generation, a 50ms-interval heartbeat fired 5 times spread across the
run (max gap ~691ms) instead of the thread being held for the whole
2.5s — see "Remaining limitations" below for what that gap-size number
means honestly.

**Benchmark data used to tune the config** (mulberry32-seeded, 6-8
trials per difficulty, this sandbox environment):

| Difficulty   | Typical           | Observed max (before the mid-attempt yield fix) |
|--------------|--------------------|---------------------------------------------------|
| Easy         | ~15-50ms           | ~53ms |
| Intermediate | ~20-75ms           | ~74ms |
| Advanced     | ~60-350ms          | ~1.1s |
| Insane       | ~250ms-6.6s        | **~46.7s** (single attempt, pre-fix) |

Insane is genuinely expensive: removing clues down to 22-27 given cells
means most of the removal pass runs with very few clues left on the
board, and each remaining `countSolutions` check has to search a much
larger space than an early removal (going from 81 clues to 80 is nearly
free to verify; going from 24 to 23 is not). `timeBudgetMs`/
`maxAttempts` per difficulty were set from this data — generous enough
that Easy/Intermediate/Advanced essentially always succeed live
(observed 100% live-generation rate in benchmarking), while Insane is
expected to fall back to a bundled puzzle a meaningful fraction of the
time in practice, which is the explicitly intended design, not a bug.

**Test results** (`npm test`, engine + generator suites together):

```
# tests 45
# suites 12
# pass 45
# fail 0
```

15 new tests cover: `generateSolvedBoard` produces a valid solved board
and is deterministic under a seeded random source; every bundled
difficulty config passes `isValidDifficultyConfig` and the four bands
are non-overlapping and strictly harder in order; malformed configs are
rejected (below the 17-clue floor, inverted range, non-positive
multiplier, zero attempts, negative time budget, invalid effort range);
`generatePuzzle` produces a uniquely-solvable puzzle within its
configured clue range for all 4 difficulties, preserving every given;
an unknown difficulty id rejects with `RangeError`; a seeded run is
reproducible end-to-end (puzzle, solution, and status all identical
across two calls); the fallback path is exercised deterministically (by
temporarily setting `maxAttempts` to 0 and restoring it in a `finally`,
rather than depending on real slow generation to trigger it, which would
make the test itself slow and environment-dependent); `onStatus` fires;
and — using real timers, not the test-speed no-op yield — a marker timer
queued before generation starts is confirmed to fire *during*
generation, not just after, proving the yield actually hands control
back to the event loop. Also re-ran `js/sudoku-engine.test.js`
unchanged (30/30) to confirm Phase 3 wasn't touched.
Also verified end-to-end in a headless browser: Settings → New Game →
`#game-status` text updates live and settles on a "Ready — …" message,
no unexpected console errors (the one pre-existing video-codec message
from Phase 1 aside). Caught and fixed a real wiring bug this way — the
first draft of `js/ui/game-screen.js` was never actually imported by
`js/ui/menu.js`'s New Game handler, so nothing happened on click until
this check caught it.

**Design/CS concepts worth explaining** (also see inline comments in
`js/sudoku-generator.js`):

- *Randomized backtracking*: identical algorithm to the engine's
  `solveBoard`, with one change — candidate values at each cell are
  shuffled before being tried, instead of attempted in ascending order.
  Ascending-order backtracking from an empty board is deterministic (it
  always produces the same grid); shuffling the order it tries values in
  is what makes repeated calls produce different valid solved boards
  while still guaranteeing a valid one comes out, since every shuffled
  order is still just "some order to try 1-9 in."
- *Clue removal*: removing a clue is easy; knowing it's *safe* to remove
  is the hard part. A puzzle keeps a unique solution only as long as no
  combination of the remaining clues allows a second valid completion —
  that's a global property of the whole board, not something you can
  determine by looking at the removed cell in isolation. So the only way
  to check is to ask the solver "how many solutions does this board have
  now?" after every single removal.
- *Why uniqueness checks are expensive*: `countSolutions(puzzle, 2)` is
  a full (early-stopping) backtracking search — cheap when there are
  many clues constraining the board (few branches to explore), and
  progressively more expensive as clues thin out (more empty cells, more
  branching, more of the search tree has to be explored before the
  solver can prove — or disprove — uniqueness). A puzzle at 24 clues
  needs the same *kind* of check as one at 80 clues, but the search
  space behind that check is enormously larger. This is a direct,
  measured consequence, not a theoretical concern — it's the entire
  reason Insane generation is slow in this benchmark data.
- *Why clue count alone is insufficient*: two puzzles with identical
  clue counts can require completely different solving techniques —
  simple scanning for one, deep candidate-elimination chains for the
  other — depending on *where* the clues are, not just how many there
  are. `solverEffortRange` (steps a plain backtracking solver takes to
  fill a generated puzzle, tracked via a separate step-counting solve
  function rather than modifying the pure engine's solver) is recorded
  alongside clue count as a second, still-rough signal, precisely
  because clue count by itself is known to be an unreliable proxy for
  how hard a puzzle actually feels to a human solver. This is
  documented as a v1 approximation in `DIFFICULTIES`' own comment block,
  not presented as a rigorous rating.
- *How the time/attempt guard protects UX*: two layers, matching the two
  places JavaScript can get "stuck" — too many attempts (bounded by
  `maxAttempts`) and too much wall-clock time in one attempt (bounded by
  checking `deadline` before every removal, not just before every whole
  attempt, plus yielding to the event loop every few removals so a slow
  attempt is chopped into several event-loop turns instead of one
  uninterrupted stretch). Both layers exist because the first version of
  this module only had the outer one, and benchmarking showed that alone
  doesn't prevent a multi-second freeze — see the bug note above.

**Remaining limitations:**

- The yield-every-6-removals granularity bounds the *number* of
  `countSolutions` calls between yields, not wall-clock time between
  them — at very low clue counts a single one of those calls can itself
  take a few hundred milliseconds (observed up to ~691ms between
  heartbeats in the verification script above), so "never freezes" is
  accurate in the sense of "never blocks for its full multi-second
  duration in one stretch," not in the stricter sense of "guarantees a
  sub-100ms response time at all times." A truly hard guarantee would
  need the pure engine's solver itself to be interruptible mid-search,
  which would mean threading a deadline through `sudoku-engine.js`'s
  recursion — deliberately not done, to keep that module simple, pure,
  and untouched from Phase 3.
- Insane-difficulty live generation is expected to fall back to a
  bundled puzzle a real fraction of the time in this environment (per
  the benchmark data above) — that's the intended, documented behavior
  of the fallback system, not a defect, but it does mean Insane games
  will sometimes replay one of only 2 bundled puzzles rather than a
  fresh one.
- No difficulty picker UI yet — New Game always requests Easy. Belongs
  with Phase 5 (board rendering/menu UI), not this phase.
- The generated puzzle/solution isn't persisted or connected to a board
  yet (`getCurrentGame()` just holds it in memory) — Phase 5 renders it,
  Phase 6 will autosave it.

---

## 2026-07-28 — Phase 3: Pure Sudoku Engine + Automated Tests

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Redefined "Phase 3" to match the actual scope delivered: a pure,
UI-independent rules engine and its test suite — not yet puzzle
generation with difficulty tiers, which is real enough work to be its
own phase. `TASKS.md` renumbered: Phase 3 is now the engine (done),
Phase 4 is a new "Puzzle Generation (Difficulty Tiers)" phase (not
started, builds on Phase 3), and everything from the old Board Rendering
phase onward shifts down by one (now Phases 5–13).

**What was built:**

- **`js/sudoku-engine.js`**: board representation is a flat 81-element
  array, row-major (`index = row * 9 + col`), 0 = empty, 1–9 = filled.
  Exports: `rowColToIndex`, `indexToRowCol`, `getRowValues`,
  `getColumnValues`, `getBoxValues`, `isValidBoardShape`,
  `isValidPlacement`, `findEmptyCell`, `solveBoard`, `countSolutions`,
  `isSolved`, `getCandidates`. No DOM, no `localStorage`, no timers, no
  reference to anything outside the module — every function takes a
  board (and sometimes coordinates) in and returns a new value out.
- Validation policy, applied consistently: navigation helpers
  (`rowColToIndex`, `getRowValues`, `isValidPlacement`, `getCandidates`,
  etc.) `throw` on a malformed board/row/col/index/value — those are
  programmer-contract functions, called with values that should already
  be valid, so throwing surfaces a bug immediately. Pure predicates
  (`isValidBoardShape`, `isSolved`) never throw — "is this valid" is
  exactly the question they exist to answer, so malformed input is
  simply `false`. `solveBoard`/`countSolutions` also never throw on a
  malformed board (return their documented failure value — `null` and
  `0` respectively) since they represent a "try to do this" operation
  that may reasonably be called on questionable data (e.g. something
  loaded from storage) without every call site needing a try/catch.
- **Conflict pre-check** (`hasNoConflicts`, internal): found while
  implementing `solveBoard` — backtracking only ever fills currently
  *empty* cells, it never re-examines a given. So a board with two
  conflicting givens (say, two 5s in one row) could reach "no empty
  cells left" and get reported as solved, because nothing ever checked
  the givens against each other. `solveBoard` and `countSolutions` both
  check this upfront now, before backtracking starts.
- **`js/sudoku-engine.test.js`**: Node's built-in test runner
  (`node:test` + `node:assert/strict`), 8 `describe` blocks / 30 tests.
  Fixtures are generated, not transcribed — a "completed valid board" is
  built from the standard base-pattern formula for a valid Sudoku grid
  (`value(r,c) = ((3*(r%3) + Math.floor(r/3) + c) % 9) + 1`, verified by
  the tests themselves via `isSolved`), and a solvable puzzle is derived
  by deterministically zeroing out cells of that same grid — so
  solvability is guaranteed by construction and there was no risk of a
  copied puzzle turning out to be secretly broken.
- **`package.json`** (new): `{"type": "module", "private": true}` plus a
  `test` script. Added solely so Node treats `.js` files as ES modules
  for `node --test` — no dependencies, doesn't affect the shipped static
  app (browsers never read `package.json`).

**Test results** (`npm test`, i.e. `node --test`):

```
# tests 30
# suites 8
# pass 30
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Coverage maps directly to the required list: coordinate conversion
(including a full 81-cell round-trip and out-of-range rejection), valid/
invalid board shapes, row/column/box extraction (plus a check that
extraction returns fresh arrays, not board references), legal/illegal
placement (row, column, and box conflicts each tested separately),
solving a solvable board (asserting the result is fully solved *and*
every given was preserved, not just "some solved board came back"), an
unsolvable board (two conflicting givens), a completed valid board, a
completed invalid board (one duplicate introduced into an otherwise-
valid completed grid), `countSolutions` stopping at its limit against a
fully empty board — which has on the order of 10^21 solutions, so a
5-second wall-clock assertion is a meaningful proof it didn't try to
enumerate them all — candidate calculation (including a hand-checked
row/column/box exclusion case), and input immutability, checked
explicitly on `solveBoard`, `countSolutions`, and `getCandidates` by
diffing the input array before/after each call. `node --check` also ran
clean on both new files.

**Design/CS concepts worth explaining** (also see inline comments in
`js/sudoku-engine.js`):

- *81-cell flat array over a 9×9 nested array*: a single flat array with
  `index = row * 9 + col` avoids two levels of indirection
  (`board[row][col]`) for every access, serializes trivially to/from
  JSON and `localStorage` with no reshaping, and is exactly what
  `Array.prototype.indexOf(0)` needs to find the next empty cell in one
  call rather than a nested loop. The two representations hold the same
  information; the flat one is just more convenient for this module's
  access patterns.
- *Integer division for box lookup*: `Math.floor(row / 3) * 3` maps any
  row 0–8 down to the row where its 3×3 box starts (0, 3, or 6) — e.g.
  row 4 → `Math.floor(4/3)*3 = 3`. The same formula on `col` gives the
  box's starting column. A double loop over the 3 rows/columns from
  those starting points visits exactly the 9 cells in that box. No
  lookup table needed — it falls straight out of how the grid is
  numbered.
- *Pure functions*: every exported function's output depends only on
  its arguments, and none of them modify the array passed in. That's
  what makes `board.slice()` at the top of `solveBoard`/`countSolutions`
  load-bearing: the algorithm mutates a local copy freely (mutation is
  the efficient way to do backtracking — allocating a new 81-element
  array at every recursive step would be wasteful), but the caller's
  original array is never touched. Purity is also why the test suite
  can freely reuse `solvablePuzzle` and `completeBoard` across dozens of
  assertions without one test's call contaminating the next.
- *Backtracking recursion*: `backtrackFill` finds the first empty cell,
  tries digits 1–9 in order, and for each one that's currently legal
  (`isValidPlacement`), places it and recurses on the *rest* of the
  board. If that recursive call eventually returns `true`, the whole
  chain unwinds as solved. If none of the 9 digits lead anywhere, the
  function returns `false` and the *caller* (one level up) undoes its
  own placement and tries its next digit — that's backtracking: instead
  of detecting a dead end and giving up, the search retreats exactly one
  decision and tries the next option there.
- *Base case*: `findEmptyCell` returning nothing (`indexOf(0) === -1`)
  means every cell is filled. Combined with the upfront conflict check,
  "no empty cells and no conflicts" is the base case — a fully solved
  board — and the recursion stops growing and starts returning `true`
  back up the call stack.
- *Copying vs. mutation*: the public API is copy-in (never touches the
  argument), mutate-internally (the recursive helpers mutate their own
  local clone directly, which is both simpler to write and faster than
  threading immutable updates through 81 levels of recursion). This is
  a common, deliberate pattern — expose an immutable-feeling API on top
  of a mutable, efficient implementation.
- *Early termination*: `countSolutions`' recursive helper checks
  `state.count >= limit` both on entry and inside its digit loop. Once
  the limit is hit, every still-open frame on the call stack sees that
  check trip immediately and returns without exploring further branches
  — the search doesn't finish exploring a branch it's already given up
  on. That's the difference between finishing in milliseconds and never
  finishing at all on a near-empty board.

**Remaining limitations:**

- No puzzle *generator* yet — `js/sudoku-engine.js` can solve and count
  solutions for a given board, but nothing yet produces a puzzle with a
  target clue count or difficulty. That's the new Phase 4.
- The engine isn't wired into the app yet (no import from `index.js` or
  any `js/ui/*` module) — it's a standalone, tested module until the
  board UI (Phase 5) or generator (Phase 4) consumes it.
- Backtracking here is a plain constraint-check solver (no constraint
  propagation/MRV heuristics). It's fast enough for 9×9 Sudoku — the
  test suite's hardest case (an empty board search truncated at 2
  solutions) finishes in single-digit milliseconds — but a future
  difficulty-aware generator may want a smarter solver if it needs to
  solve many candidate boards quickly.

---

## 2026-07-28 — Phase 2: Theme System & Responsive Design

**Branch:** `claude/sudoku-inspire-setup-2jpef2`

Reordered the build plan so the visual design system lands right after
the app shell (previously slotted later as "Phase 7"). `TASKS.md` is
renumbered accordingly: Phase 2 is now Theme System & Responsive Design,
and the former Phases 2–6 (Sudoku engine, board rendering, input, save/
continue, statistics) shift down to Phases 3–7. Phases 8–12 (audio,
offline/PWA, accessibility polish, GitHub Pages, final QA) are unchanged.

**What was built:**

- **Design tokens** (`styles.css`): every color a component uses —
  background, panel, raised surface, primary/secondary text, border,
  accent, accent-contrast, focus, success/warning/error, selected/
  related/matching-value cell, fixed-clue, player-entry, notes, and
  shadow — is a CSS custom property, never a literal color in a
  component rule. 4 theme packs × 2 concrete color modes (dark/light)
  = 8 full palettes, selected via `[data-theme][data-mode]` attribute
  selectors on `<html>`. Woodgrain and Paper use `linear-gradient()`
  values directly as their background/panel/surface tokens (no images)
  — since `background: var(--color-bg)` accepts a gradient exactly like
  it accepts a hex color, no component rule had to change to support
  textured themes.
- **`js/theme.js`**: owns the persisted preference
  (`{ version: 1, theme, mode }` in `localStorage` under
  `sudoku-inspire:appearance`), validates it strictly on read (unknown
  version, garbage JSON, or an out-of-list theme/mode all fall back to
  `{ theme: 'light', mode: 'system' }` rather than being partially
  trusted), and resolves "system" mode to a concrete `dark`/`light`
  value via `matchMedia('(prefers-color-scheme: dark)')` before writing
  `data-mode` to the DOM — with a `change` listener so the app re-themes
  live if the OS preference flips while "System" is selected, no reload
  needed.
- **Anti-flash inline script** in `index.html <head>` (before the
  stylesheet link): reads and validates the same storage key
  synchronously and sets `data-theme`/`data-mode` before first paint, so
  there's no flash of the wrong palette. `js/theme.js` re-derives the
  same state right after and takes over from there (the OS-change
  listener, the Settings dialog); the small duplication between the two
  is a deliberate, common trade-off for avoiding FOUC.
- **Settings dialog** (`js/ui/settings.js`, wired from the menu's
  Settings button): a native `<dialog>` with radio groups for theme pack
  and color mode. Selecting either applies and persists immediately
  (live preview) — no separate "Apply" step. Includes a live preview
  swatch grid demonstrating the board-state tokens (selected/related/
  matching-value cells, fixed clue vs. player entry vs. notes text) and
  a status-chip row (success/warning/error) before the actual Sudoku
  board or validation logic exists, and a Reset Appearance button.
  Status chips pair color with an icon glyph, a text label, and their
  own outline — never color alone; the same requirement is documented as
  a constraint on `--color-cell-selected`/`-related`/`-match` for
  whoever builds the Phase 4 board (those tints are intentionally
  subtle and must be paired with a structural cue, not read on their
  own).
- **Responsive app frame**: mobile is unchanged full-bleed; at ≥768px
  `#app` becomes a centered, max-width card with a panel background and
  shadow (both theme tokens), demonstrating the "raised surface" token
  practically. Safe-area insets extended from just the Skip button
  (Phase 1) to all screen edges and `#app`.
- Menu wiring: `#btn-settings` now opens the dialog (was inert since
  Phase 1).

**Verification:**

- Scripted WCAG contrast check (custom Node script, relative-luminance
  formula) against all 8 palettes before writing any CSS: every text/
  background pairing hit AA (4.5:1 normal text, 3:1 for accent-as-UI and
  small notes text). Three initial color picks failed on the first pass
  (a couple of accent colors were too close to their background/panel)
  and were darkened/lightened until they cleared the bar — see the
  script's final palette values, which is what shipped.
- Headless Chromium (Playwright) end-to-end script covering: default
  attrs on first load; all 12 theme/mode combinations (including
  "system" resolving correctly against both light and dark emulated OS
  schemes) with no console errors and a resolved background on every
  combination; localStorage persistence across reload; three flavors of
  invalid/corrupt stored data all falling back to safe defaults; Reset
  Appearance restoring defaults and re-syncing the dialog controls; a
  live OS color-scheme flip updating `data-mode` without reload while
  "System" is selected, and explicit Dark/Light staying put regardless
  of OS changes; 320px mobile vs. 1280px desktop app-frame styling;
  ≥44px touch targets on menu/dialog controls; reduced-motion collapsing
  transition durations; Escape closing the dialog. 38 of 39 checks
  passed outright.
- The one failure was "no console errors on load," caused by the same
  pre-existing issue from Phase 1: this sandbox's headless Chromium
  build lacks proprietary H.264/AAC codec support, so the intro video
  still errors out here (confirmed it's the identical failure, not a
  regression — same `net::ERR_ABORTED` on `inspiresoftwareintro.mp4`,
  nothing else). Not a Phase 2 issue.
- Visually spot-checked 8 of the 12 combinations as screenshots (both
  viewport sizes, a mix of gradient and flat themes) — gradients render
  correctly, swatches and status chips are legible, and the desktop
  card frame looks intentional rather than accidental.
- `node --check` on all 7 JS modules.

**Design decisions worth explaining** (also see inline comments in
`styles.css`/`js/theme.js`):

- *CSS custom properties as the token layer*: a component rule like
  `.menu-nav button { background: var(--color-accent); }` never mentions
  a specific color. What `--color-accent` resolves to is entirely
  decided by which `[data-theme][data-mode]` block is in scope for that
  element (custom properties inherit down the DOM tree and the closest
  definition wins). This is why adding a 5th theme pack later means
  adding one more token block, not touching a single component rule —
  exactly the "avoid duplicating component rules per theme" requirement.
- *`data-theme`/`data-mode` as the switching mechanism*: attribute
  selectors on `<html>` (`:root[data-theme="cyber"][data-mode="dark"]`)
  let one JS call (`root.dataset.theme = 'cyber'`) instantly re-scope
  every custom property on the page — no re-render, no JS touching
  individual elements.
- *Why resolve "system" to a concrete `data-mode` in JS instead of an
  `@media (prefers-color-scheme: dark)` block in CSS*: the media-query
  approach would require duplicating every theme's dark-token block a
  second time (once for explicit `[data-mode="dark"]`, once inside the
  media query for `[data-mode="system"]`), which is exactly the kind of
  per-theme duplication the task asked to avoid. Resolving in JS means
  each theme's dark palette is written exactly once, and the OS-preference
  logic lives in exactly one place (`js/theme.js`) instead of being
  spread across CSS and JS.
- *Why gradients live directly in color tokens*: `background` accepts
  either a color or a gradient function, so `--color-bg` can hold
  `#eef0f2` for Light or `linear-gradient(...)` for Woodgrain/Paper
  without any component rule needing an `if (theme has gradient)`
  branch — the indirection that makes tokens valuable is exactly what
  makes this work for free.
- *Why semantic tokens over hard-coded colors generally*: hard-coding
  `#2b6cb0` in ten places means ten edits (and ten chances to miss one)
  every time a color needs to change, and makes "does this look right
  in Cyber dark mode" impossible to answer without literally switching
  themes and hunting for stragglers. A semantic name (`--color-accent`)
  documents *intent* at the call site and centralizes every theme's
  actual value in one place that's easy to audit (like the contrast
  script above) and easy to extend.
- *Versioned persistence with strict validation*: the stored payload
  carries a `version` field on purpose. If the schema ever changes
  (e.g. a future mode gets added or removed), bumping `SCHEMA_VERSION`
  and requiring an exact match means old stored data is never partially
  trusted — it's read as invalid and replaced with safe defaults, rather
  than crashing or rendering a broken hybrid state.

**Remaining limitations:**

- Intro video playback still can't be visually confirmed in this
  sandbox (codec limitation, not a code issue — see Phase 1 log entry
  and above).
- The `border`, `cell-selected`, `cell-related`, and `cell-match` tokens
  are deliberately soft (low contrast against their background) by
  design — they're meant to be subtle tints, not loud UI outlines. This
  means they don't independently clear a strict 3:1 non-text contrast
  bar against the page background. This is fine as long as the actual
  board (Phase 4) pairs them with a non-color structural cue (a ring/
  border/weight change) as documented in the token comments — that
  pairing doesn't exist yet since there's no board to attach it to.
- App icon source images for the PWA manifest are still outstanding
  (needed for Phase 9, unchanged from before).

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
