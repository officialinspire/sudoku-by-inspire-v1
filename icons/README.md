# icons/ — required PWA icon assets

This directory is intentionally empty right now. `manifest.webmanifest`
declares **no icons** (`"icons": []`) because none of these files exist yet
— per this project's asset policy (see `CLAUDE.md`), nothing here
fabricates a placeholder image in their place. Once real artwork is
supplied, drop the files below into this directory and wire them in as
described.

## Files needed

| File | Size | Purpose | Notes |
|---|---|---|---|
| `icons/icon-192.png` | 192×192 | `any` | Standard home-screen/launcher icon. |
| `icons/icon-512.png` | 512×512 | `any` | Standard, used for splash screens and larger displays. |
| `icons/icon-maskable-512.png` | 512×512 | `maskable` | See "Maskable icons" below — a *separate* file from `icon-512.png`, not the same image reused. |

All three should be PNG (opaque background — PNG transparency is fine for
the two `any` icons, but a maskable icon's outer padding should be a solid
color, not transparent, since platforms crop it to arbitrary shapes and a
transparent edge can look broken).

## Maskable icons

Android (and some other platforms) can mask an app icon into a circle,
squircle, rounded square, or other shape, cropping whatever falls outside
that shape. A maskable icon must keep all meaningful content (logo, text)
inside the center **safe zone** — roughly the inner 80% of the image (a
circle of radius 40% of the icon's width, centered) — with the outer 20%
treated as croppable padding. Reusing a normal, edge-to-edge icon as a
"maskable" icon usually gets its edges clipped off badly, which is why
this is listed as its own file rather than a `purpose` flag on the same
image.

## Wiring a supplied icon in

Once the files exist in this directory:

1. Add entries to `manifest.webmanifest`'s `icons` array, e.g.:

   ```json
   "icons": [
     { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
     { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
     { "src": "./icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
   ]
   ```

   (Paths are relative, matching every other asset reference in this repo,
   so the manifest keeps working at a GitHub Pages repository subpath.)

2. Add the same three paths to `sw.js`'s `OPTIONAL_ROOT_ASSETS` list so
   they get precached for offline use the same way `logo.png` and
   `inspiresoftwareintro.mp4` already are.

3. Bump `sw.js`'s `CACHE_NAME` version suffix (see the "Cache versioning"
   comment at the top of that file) so existing installs actually pick up
   the newly-added files instead of continuing to serve their old cache.

4. A `<link rel="icon">` in `index.html`'s `<head>` for browser tab/
   favicon use is a separate, optional addition — the manifest icons above
   only cover install/home-screen use.
