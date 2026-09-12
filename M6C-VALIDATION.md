# M6c implementation and validation — 2026-09-12

The Expanse rebuild is now the default game and Quick Start [1]. The previous
city survives at `?world=expanse` (Quick Start [2]); `?world=proc` remains the
classic circuit. No branch merge, deployment or public release was performed.

## What changed

- City generation yields between major phases and individual facade sheets.
- Base buildings and global collision are ready at boot. Forty-eight optional
  facade meshes and twelve street-kit batches build over subsequent frames,
  nearest first. This streams optional geometry creation; it does not claim
  to stream the global collision BVH or fetch the city over the network.
- On GPUs with `KHR_parallel_shader_compile`, shader preparation yields while
  the loading screen stays responsive. It uses the composer's actual render
  target to avoid recompiling a different tone-mapping variant on first use.
  The cassette launcher also prepares its shaders before its single render.
- Asphalt UVs share world X/Z coordinates. Intersections no longer rotate and
  restart roughness/normal-map sampling between adjacent road ribbons.
- Split roads resolve their original names. Unnamed generated lanes display
  the district, preserving readable navigation without exposing graph IDs.
- Original street kit: 757 placements, 27,240 triangles, twelve draw batches.
  Bins, planters, bollards, drain grates and tactile warning pads are generated
  from pavement and road records. The kit is visual only; driving collision
  and lot layouts stay unchanged. Eight cheap shop-light pools appear at night.
- `npm run check` now runs `check:core` plus all rebuild gates, including the
  new runtime checks for road UVs, names, streaming convergence and detail placement.

## Measurements

Chrome headless, **NVIDIA RTX 4060 / ANGLE D3D11**, 1280×720, DPR 1, light rain.
Each sample records eight seconds of steady rendering at spawn. Both graphics
profiles were run on the same desktop GPU; this is **not a physical-phone test**.

| Day profile | Median / p95 frame | Draw calls | Largest main-thread task | Observed startup |
|---|---:|---:|---:|---:|
| Desktop, before | 16.7 / 16.8 ms | 101 | 3,525 ms | 6,893 ms |
| Desktop, after | 16.7 / 16.8 ms | 107 | 906 ms | 5,445 ms |
| Mobile profile, before | 16.7 / 16.7 ms | 94 | 2,214 ms | 3,601 ms |
| Mobile profile, after | 16.7 / 16.8 ms | 98 | 510 ms | 2,579 ms |

Night after: desktop 16.7 / 16.8 ms, 108 draw calls; mobile profile
16.7 / 16.7 ms, 99 draw calls. Both finished all pending detail construction.
Startup is one run per configuration and sensitive to shader/cache/OS state;
the original probe observed the exposed game object, while the final probe
explicitly waits for the first rendered loading-screen completion. Treat these
as observed runs, not statistically established speedups. CPU sampling located
the dominant original stall in `WebGLProgram.onFirstUse`, not city generation.

Reproduce with the dev server on 5273:

```sh
node tools/bench/expanse-browser-perf.mjs review
node tools/bench/expanse-browser-perf.mjs review-night --night
node tools/bench/expanse-browser-check.mjs
```

JSON and screenshots are written to `_work/m6c/`. The model preview is kept at
`tools/blender/previews/seoul-street-kit.png`; its rendering fixture is
`tools/bench/fixtures/street-kit.html`.

## Checks and remaining work

The combined `npm run check` passed. Production build with `--configLoader native`
passed. Actual browser keyboard input moved the truck through the new default
world with valid ground contact; streaming completed. Day furniture and night
shop-light screenshots were inspected. The cassette browser suite verifies P,
HUD and Settings access, all seven initially available songs, locks and paused
driving, in addition to nine viewport layouts and real media playback.

Still open: physical-phone frame/memory/thermal testing; longer driving routes
and chunk-boundary review; courtyard infill and landmark silhouettes; a manual
match to the precise position and saved lighting in the user's third screenshot.
The UV seam cause is corrected, but that screenshot's large bare spaces and
repeated facades are not all solved by this pass. Existing asset-license release
blockers and inherited frozen-layout faults remain documented in ATTRIBUTION.md
and CITY-REBUILD.md.
