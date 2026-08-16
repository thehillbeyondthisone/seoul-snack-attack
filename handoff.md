# Seoul Delivery — development handoff

**Updated:** 2026-08-15  
**Status:** Paused midway through the city rebuild. **Not ready to deploy.**

## Goal

Build a reasonably sized, drivable, asymmetrical city that preserves the quality and density of the original Sketchfab scene. It should feel like several connected urban districts rather than one repeated rectangular tile. Water, embankments, bridges, elevation, and solid scenery should provide natural limits.

Visual references supplied by the user:

- `C:\Users\fillt\AppData\Local\Temp\codex-clipboard-d6753cab-a772-4891-a3c7-e8e405eb8a66.png` — desired low-rise facade quality and density.
- `C:\Users\fillt\AppData\Local\Temp\codex-clipboard-2db59b7d-ea76-4dfb-a1c8-632c77d69836.png` — source scene viewed from above.

## What went wrong

The earlier asset preparation pipeline ran glTF `flatten()` and `join()` over the city. That destructively combined objects with transforms and materials that should have remained separate, producing mangled buildings, displaced geometry, and broken-looking textures. Do **not** run `tools/prepare-city.mjs` on either city asset again.

The low-rise Buildings IV source also contains an exporter error of its own: 124 scene-root objects retained a `-15` authored-unit X offset after their original collection was flattened. These are mainly facade pieces, signs, AC units, walls, and street details, explaining why the raw scene appears exploded even without our optimizer.

## Asset findings and repairs

Two complete source assets are available:

- `_source-assets/city/hongkong-iii.glb` — 72.8 MB; intact but predominantly taller buildings and less like the user's reference.
- `_source-assets/city/hongkong-iv.glb` — copied from `_staging/full-gameready-city-buildings-iv-hongkong/source/Untitled2.glb`; 94.4 MB; the desired weathered low-rise block.

`tools/repair-city-iv.mjs` repairs Buildings IV by moving every affected scene-root child whose X translation is below `-10` by `+15` authored units. It repaired 124 nodes.

The repaired asset was then compressed without flattening or joining:

- Working result: `_work/city-rebuild/city-iv-repaired-safe.glb` — approximately 10.2 MB.
- Current live asset: `public/assets/world/city.glb` — a copy of that repaired result.

The repaired version is substantially reassembled and retains its textures/material separation. It still needs close street-level visual comparison against the reference before being called final. Some frontage props at the outer edge may be valid scene dressing rather than displacement.

Useful temporary QA captures are in `_work/city-rebuild/`:

- `city-iii-street.png`
- `city-iv-street.png`
- `city-iv-west.png` — illustrates the raw Buildings IV displacement.
- `city-iv-repaired.png`

`_work/city-rebuild/city-broken.glb` preserves the earlier mangled result for diagnosis only.

## Current code state

The repository is midway through conversion from a rectangular repeated grid to explicit district placement. These edits have **not yet been integrated or validated as a whole**:

- `src/world/city-constants.js`
  - Uses a scale of 3 for Buildings IV.
  - Defines a seven-piece irregular `TILE_LAYOUT` rather than a rectangular grid.
  - Disables the old clipping rule and rectangular district seals.
  - Sets district-level culling distance to 145 m.
- `src/world/tiling.js`
  - Accepts arbitrary `{ x, z, rotation }` placements and supports raycasting rotated districts.
  - The new path is unvalidated.
- `src/world/road-network.js`
  - Adds `createRoadGraph()` for explicit graph nodes and edges, routing, and road projection.
  - The new graph is not yet wired into the city.
- `vite.config.js`
  - Correctly excludes `_source-assets`, `_staging`, and `_work` from Vite file watching. This avoids Windows `EBUSY` crashes while large GLBs are processed.

Critical inconsistency: `src/world/city.js` still constructs the old grid, ladder graph, end zones, and Hong Kong III north quay. It does not yet pass `TILE_LAYOUT` to `makeTileGrid()` or use `createRoadGraph()`. Consequently, the current source is logically inconsistent even if it compiles.

Other stale pieces:

- `src/world/district-extension.js` contains the old Hong Kong III quay with hard-coded road coordinates. Replace it; do not adapt those coordinates to Buildings IV.
- `src/world/end-zones.js` assumes a rectangular ladder map.
- The HUD/minimap contains ladder-grid assumptions and needs an audit.
- `src/main.js` currently enables procedural shop dressing by default. Buildings IV already has dense storefront dressing, so this should default to off and be available only through `?shops=on` if retained.
- The temporary Buildings IV collider was generated with an old Hong Kong III clipping predicate and is unsuitable. Rebuild it after the layout is settled.

## Intended map shape

The provisional district centers form an irregular ring/branch footprint rather than a rectangle:

```text
(-85,   0)   rotation 0
(-28, -58)   rotation PI
( 55, -72)   rotation 0
(118, -14)   rotation PI
( 92,  68)   rotation 0
(  8,  88)   rotation PI
(-72,  70)   rotation 0
```

This gives an approximate 240 × 180 m playable footprint before adding boundaries. The layout is provisional: move districts as needed to make street connections convincing and preserve strong vistas.

The preferred performance strategy is to retain the source nodes and materials, then cull complete districts so only roughly two or three are visible. Do not recover performance by merging the city into destructive mega-meshes.

## Recommended next steps

1. Wire `TILE_LAYOUT` into `src/world/city.js` by passing it as `placements` to `makeTileGrid()`.
2. Replace the old north quay with a connector/boundary builder for the irregular layout.
3. Give each district a verified internal road loop based on its real road mesh bounds.
4. Connect neighboring districts with two independently routable street or bridge links where practical. Avoid graph bridges and unavoidable dead ends so driving routes remain interesting.
5. Fill negative space with water/canals, embankments, retaining walls, railings, terrain, and skyline dressing. Use visible geometry plus collision for every map limit; do not rely on invisible rectangular walls.
6. Replace `createLadderRoadGraph()` with `createRoadGraph()` and remove the old rectangular end-zone assumptions.
7. Place two to four delivery anchors per district only after raycasting them onto verified roads. Confirm all anchors are reachable.
8. Default procedural shop dressing to off.
9. Rewrite `tools/build-city.mjs` so the Buildings IV pipeline is: raw source → `repair-city-iv.mjs` → texture compression → meshopt compression. Remove `prepare-city.mjs` from the city build path.
10. Rebuild the gameplay collider and update tests for irregular placements, bridge collision, road projection, and graph connectivity.
11. Perform browser QA in daylight at street level first, then a night driving pass. Compare facade assembly and texture quality directly to the supplied reference.
12. Only after the map and visuals pass QA, run `npm run check`, `npm run build`, and verify the uploaded/static build.

## Validation status

Earlier checks passed before the latest Buildings IV and irregular-layout edits. Those results are stale. No complete validation has run after the changes to `city-constants.js`, `tiling.js`, and `road-network.js`.

The current build must therefore be treated as unvalidated and not upload-ready.

## Running locally

No development server was intentionally left running at handoff. Use the project scripts in `package.json` to start the local server. The earlier local-only backtick menu issue should be retested after the city refactor rather than debugged against this inconsistent checkpoint.
