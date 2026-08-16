# Seoul Delivery release checklist

## Current browser build

This is a private portfolio vertical slice. It is a static Vite build intended
to be uploaded as the contents of `dist/` to SiteGround `public_html`.

Before a public or commercial release, replace or clear every item marked TBD
in `ATTRIBUTION.md`, especially the shipped prop packs, branded storefronts,
recognizable vehicle material, and the retro-arcade diorama.

## Build and verify

```text
npm.cmd run build
npm.cmd run check
npm.cmd run bench
```

The tiling and prop checks are hard gates. The physics bench is a tuning gate;
any accepted out-of-range metric must be documented with a reason before upload.

Test the production output with a local static server, then verify in a clean
browser session:

- no missing GLB, texture, JavaScript, or audio requests;
- first interaction enables audio and `M` toggles all audio;
- keyboard and standard gamepad controls work;
- a complete order persists cash, delivery count, and rating after reload;
- no debug menu or debug query behavior is exposed in production;
- HTTPS and relative asset paths work on the SiteGround URL.

## Car stereo tracks

Additional MP3s can be added to `public/audio/music/` using lowercase,
hyphenated filenames and listed in the soundtrack
array in `src/main.js`. Only the currently selected track is loaded by the
browser, so adding tracks increases SiteGround storage but does not increase
the initial download by the full size of every song. Keep MP3s around 128–192
kbps for a practical web mix; a five-minute track is commonly about 5–8 MB.

## SiteGround

Upload **only the files and directories inside `dist/`** into `public_html`.
Do not upload the `dist` directory as an extra nesting level. Do not upload
`src/`, `public/`, `node_modules/`, `_source-assets/`, `_staging/`, `tools/`, or
the repository itself. If the host does
not supply useful content types, add these rules to `.htaccess`:

```apache
AddType model/gltf-binary .glb
AddType application/octet-stream .bin
AddType audio/mpeg .mp3
```

Keep the portfolio URL unlisted while asset rights remain unresolved.

## Godot port handoff

The desktop-first Godot port should be a new project, not a line-by-line
translation. Rebuild the stable design around `Main`, `World`, `Van`,
`VehicleController`, `DeliveryManager`, `HUD`, `AudioManager`, `SaveService`,
and typed content resources. Preserve the delivery loop and food-condition
rules first; add multiple vehicles, upgrades, districts, traffic, and shift
structure only after the port reaches feature parity with this browser slice.
