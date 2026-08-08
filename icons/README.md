# icons/ — PWA icon assets

The three files below are generated, not hand-supplied — a 3×3 Sudoku
grid mark (with a couple of sample digits) in the app's own brand blue
(`#2b6cb0`, `manifest.webmanifest`'s `theme_color`), with the full
INSPIRE wordmark (derived from `../logo.png`, which the user does own —
see `CLAUDE.md`'s asset policy) as a badge underneath. Regenerating them
is a design decision, not a mechanical rebuild — if the artwork ever
needs to change, treat it the same way: propose a direction, render it,
get it approved before wiring it back in (see `DEVELOPMENT_LOG.md`'s
Phase 16e entry for how these were built).

| File | Size | Purpose | Notes |
|---|---|---|---|
| `icons/icon-192.png` | 192×192 | `any` | Standard home-screen/launcher icon. |
| `icons/icon-512.png` | 512×512 | `any` | Standard, used for splash screens and larger displays. |
| `icons/icon-maskable-512.png` | 512×512 | `maskable` | A *separate* render from `icon-512.png`, not the same image reused — see "Maskable icons" below. |

All three are opaque PNGs — a maskable icon's outer padding must be a
solid color, not transparent, since platforms crop it to arbitrary
shapes and a transparent edge would look broken.

Already wired in:

- `manifest.webmanifest`'s `icons` array.
- `sw.js`'s `OPTIONAL_ROOT_ASSETS` (precached for offline use, but a
  missing/corrupt icon still can't block the service worker from
  installing — same resilience policy as `logo.png`/the intro video).
- `index.html`'s `<link rel="icon">` (browser tab/favicon use — a
  separate concern from the manifest icons above, which only cover
  install/home-screen use).

## Maskable icons

Android (and some other platforms) can mask an app icon into a circle,
squircle, rounded square, or other shape, cropping whatever falls outside
that shape. A maskable icon must keep all meaningful content (logo, text)
inside the center **safe zone** — roughly the inner 80% of the image (a
circle of radius 40% of the icon's width, centered) — with the outer 20%
treated as croppable padding. Reusing a normal, edge-to-edge icon as a
"maskable" icon usually gets its edges clipped off badly, which is why
this is its own file rather than a `purpose` flag on the same image.
`icon-maskable-512.png`'s grid and logo badge were both explicitly
verified against this safe-zone circle (not just eyeballed) before being
finalized.
