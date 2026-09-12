# Next agent — Seoul Snack Attack

Updated 2026-09-12 after the user requested cassette access, a checkpoint commit,
and the next stage. This file supersedes the old dirty-tree handoff preserved in
commit c74e9ef.

## Current state

- Branch: seoul-rebuild. Checkpoint c74e9ef contains the accepted settings,
  delivery handling, cab/hippo, audio collection and cassette-access pass.
- M1 through M6c implementation is present. The Expanse rebuild is the default
  world and Quick Start [1]. Previous Expanse stays at ?world=expanse and Quick
  Start [2]. The compact circuit remains ?world=proc and Quick Start [3].
- The user-approved controls: Escape/F3/controller View for Settings; backtick
  directly toggles tuning. P, the HUD cassette or Settings > Music opens the
  tape deck. The deck releases pointer lock and pauses driving/orders.
- Seven tapes start available. Deliveries unlock Abyssal Ramen Submarine at 3,
  Blade of Hatred at 6, Rapid-fire at 9 and Supersonic at 12. Dive is a separate
  ramp cue, not a rack tape. Selecting a locked tape never unlocks it.
- Cab paint follows POCHA in the colour bible: exterior orange/green and
  charcoal trim. Hippo enamel is strawberry pink. Keep its separate head pivot.

Read README.md, ATTRIBUTION.md, CITY-REBUILD.md, M6C-VALIDATION.md and
TRUTHS_SEOUL-SNACK-ATTACK.md. handoff.md is the chronological log.

## M6c delivered

- Measured the actual RTX 4060, with hardware identity included in the probe.
  Final daytime median/p95: 16.7/16.8 ms on both graphics profiles at 1280x720.
  Desktop draw calls: 107; mobile-profile draw calls: 98. These are desktop
  GPU measurements, not phone results. Night also held approximately 60 fps.
- Split CPU generation into phases/facade-sheet batches. Global collision and
  base buildings are ready at boot; 48 optional facade meshes and 12 street-kit
  batches build progressively, nearest first.
- CPU profiling traced the largest startup freeze to WebGLProgram.onFirstUse.
  Supported GPUs now prepare shaders asynchronously against the postprocessor's
  actual render target. The final largest observed task fell from 3,525 to
  906 ms on desktop; repeated measurements and mobile hardware remain useful.
- Road UVs use world X/Z so overlapping roads sample the same surface pixels.
- Split road names inherit their original handles; generated lanes show districts.
- Original street detail: 757 placements / 27,240 triangles. Bins, planters,
  bollards, drains, tactile crossing pads and eight night shop-light pools.
  These are visual details; collision is unchanged. Required preview:
  tools/blender/previews/seoul-street-kit.png.
- npm run check now combines core and rebuild gates, including runtime checks
  for UVs, names, progressive meshes and detail placement.

## Remaining work

1. Physical-phone testing: performance, memory, heat, landscape controls and
   long-route chunk transitions. The mobile profile on an RTX GPU is only a proxy.
2. Continue art review at the user's third screenshot location and saved lighting.
   Shared road UVs correct one real seam cause, but bare land, repetitive facades,
   fog preferences, courtyard infill and landmark silhouettes remain separate work.
   This pass deliberately did not regenerate lots or the frozen road layout.
3. Full-city map wheel/pinch zoom and pan; persisted/speed-driven minimap zoom.
4. Food-preview framing: center the mesh on its bounding-box centre for the HUD,
   while retaining floor-based origins in the world.
5. Watch the full ramp -> whirlpool -> cab -> Abyss transition end to end.
   Test its HOLD_AT loading pause on a throttled CPU; add underwater gameplay.
6. Public release still has the inherited asset-license blockers in ATTRIBUTION.md.

## Run and verify

Dev server: port 5273. In this sandbox use:

    npm run dev -- --configLoader native
    npm run build -- --configLoader native
    npm run check
    node tools/bench/cassette-browser-check.mjs --game
    node tools/bench/expanse-browser-check.mjs
    node tools/bench/expanse-browser-perf.mjs review
    node tools/bench/expanse-browser-perf.mjs review-night --night

Browser probes may need to run outside the sandbox: Chrome's DevTools connection
can stall inside it. Preserve failures instead of masking pipeline exit codes.
The main suites and browser cassette/default-world drive checks passed in this
session; M6C-VALIDATION.md holds the measured results and limits.

## Guardrails and traps

- Preserve user changes. Local .claude configuration and generated Python caches
  were excluded from commits; do not sweep them in with git add .
- Every custom 3D model needs a PNG preview shown to the user.
- Three HUD accents only: urgency red-orange, money cream-gold, navigation cyan.
  POCHA colours and hippo pink are local art, not new system accents.
- Metres, Y-up, north = -Z. Six district IDs are frozen. Collision stays global.
- expanse-layout.js remains a 25-node / 35-edge contract. Its old west-bridge
  crossing, zero-length edge and five narrow-angle joins are known, not new bugs.
- An explicit world=proc must remain in switcher URLs now that the default is
  expanse2. Deleting that query parameter silently opens the wrong city.
- Parallel shader compilation does not upload geometry/textures. M6c separately
  streams optional mesh construction. Devices without the extension retain the
  visible-first-frame fallback; do not promise zero startup stalls.
- No deployment or merge to main was performed. Promotion here means changing
  the game's default world and launcher, while retaining comparison worlds.
