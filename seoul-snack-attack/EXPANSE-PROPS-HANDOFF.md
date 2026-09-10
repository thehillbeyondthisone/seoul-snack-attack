# Seoul Expanse — next-pass handoff: props and street detail

**Prepared:** 2026-09-03  
**Starting state:** The kilometre-scale Expanse has approved roads, six district identities, fixed restaurants, visual chunk/LOD tiers, complete network markings/curbs, a finished Bukak tunnel, and three distinct bridge silhouettes. Vehicle/on-foot handling and the global collision BVH are stable.
**Implementation status:** The 28-object review slice is implemented and validated; citywide propagation is intentionally waiting for user approval.

> **2026-09-04 recovery note:** The rejected 74-node substitution has been
> removed from live play. `?world=expanse` uses this document's validated
> 25-node runtime again, so the 28-object review slice and its clearance gate
> are active and relevant. Any future layout replacement must reproject and
> revalidate all placements before enabling them.

## Goal

Make normal-speed street-level play feel inhabited without compromising the fast driving loop. Add deterministic, chunk-aware sidewalk and storefront props to the Expanse instead of enabling the compact-world scanner over the entire map.

This is a detail-density pass, not a traffic or pedestrian pass. Do not add moving cars or people without a separate user approval gate.

## Review slice awaiting approval

- `src/world/expanse-props.js` now separates pure placement from asynchronous runtime loading. It never calls the compact-world `layoutWorld()` scanner.
- Desktop: 28 placements across Station (10), Hongdae (10), and Hangang (8), owned by chunks `c1_1`, `c0_0`, and `c1_2` respectively.
- Mobile: eight unchanged records selected deterministically from the desktop seed, with every review cluster retained.
- Eight catalog families: bike rack, bicycle, bin, bollard, fire hydrant, utility cabinet, vending machine, and bagged rubbish.
- Collision policy: 20 dynamic `PropWorld` bodies, five static `PropWorld` bodies, and three decor-only placements. No dynamic prop enters `city.raycast`.
- The Node gate asserts the fixed placement hash, catalog metre sizes, body policy, cluster/mobile coverage, and zero road, river, building, shop-path, delivery, spawn, bridge, tunnel, parked-car, bus-shelter, or prop-to-prop intrusion.
- Reproducible review cameras: `expanseView=propsStation|propsHongdae|propsHangang`.
- Captures: `_work/expanse-props-station-day.png`, `_work/expanse-props-hongdae-night.png`, and `_work/expanse-props-hangang-day.png`.
- Current review-camera draw calls on the headless QA renderer: Station 201, Hongdae 102, Hangang 76.
- `public/assets/props/` remains internal-evaluation-only under `ATTRIBUTION.md`; the slice adds no new Blender model.
- Passed: `npm run expanse-check`, `npm run props-check`, `npm run build`, desktop full-speed, on-foot, and mobile runtime probes.

## Required first implementation

Create `src/world/expanse-props.js` with two clearly separated layers:

1. `generateExpanseProps(layout, shops, streetLife, seed)` — pure placement records usable from Node validation.
2. `loadExpanseProps(scene, city, options)` or an equivalent runtime builder — asynchronous catalog loading, instanced rendering by chunk/type, and optional `PropWorld` bodies.

Do not call the compact `layoutWorld()` scanner from `src/world/props.js`. It assumes a small repeated tile, searches one local collision volume, and disables frustum culling on city-wide prop instances.

## Placement hierarchy

Prioritize authored clusters over uniform noise:

- Restaurant forecourts: menu boards, bins, crates, stools, vending machines, bike racks. Preserve a clear pickup dwell zone and an on-foot path to the counter.
- Station boulevard: bollards, wayfinding, newspaper/recycling clusters, utility cabinets, sparse bicycles.
- Market: crates, handcarts, awning supports, stacked goods, hydrants, waste stations.
- Hongdae: poster frames, club queue barriers, parked scooters/bikes, utility clutter.
- Hills: planters, trail signs, benches, guardrails; much lower density.
- Hangang: benches, bike racks, exercise/park furniture, bins; protect the promenade and bridge approaches.
- Pocha: stools, propane/utility silhouettes, crates, small tables; keep the vehicle lane open.
- Tunnel and bridges: emergency cabinets, reflectors, delineators, signs. No loose dynamic objects in high-speed lanes.

## Budgets

- Desktop target: 180–260 visible placements across the complete map, with normal gameplay showing only nearby chunks.
- Mobile target: 60–90 placements, selected deterministically from the same seed—not scaled or physics-altered versions of desktop objects.
- Start with at most 8 prop families and reuse them well. Prefer one instanced mesh per `(chunk, prop type)`.
- Props belong to the existing 4 × 3 chunk grid. Their visual tier should normally be `micro`; landmark-scale signs may use `detail`.
- Avoid `frustumCulled = false` for map-wide instances.

## Safety and clearance contracts

Every placement gate must be asserted in Node:

- Outside the bound road carriageway plus at least 1.0 m, except explicitly approved flush objects such as drains or tunnel reflectors.
- At least 8 m from the player spawn.
- At least 12 m from every shop pickup marker unless the record belongs to that shop’s authored forecourt and passes its clear-path test.
- At least 6 m from delivery markers.
- No overlap with primary/secondary building rectangles, bus shelters, parked cars, bridge pylons, or tunnel walls.
- Preserve a continuous 1.2 m-wide pedestrian path; remember the player capsule is 0.32 m radius and 1.72 m tall.
- Never place a dynamic prop where a full-speed vehicle is expected to travel.

Static solid props may join the global BVH only after the clearance gate passes. Dynamic props remain in `PropWorld` and must not be added to `city.raycast`, because bumper rays would incorrectly brake the vehicle merely for passing them.

## Asset and licensing rule

`public/assets/props/` is currently documented in `ATTRIBUTION.md` as shipped but unlicensed and therefore an internal-release blocker. It may be used for local evaluation only; do not describe it as publicly distributable.

Preferred routes:

1. Use procedural primitives for the first safe slice, or
2. Curate existing catalog items for internal testing while preserving the release warning, then replace/clear licensing before public release.

Any newly created Blender model is unfinished until it has a PNG at `tools/blender/previews/<id>.png`. Show every such preview in the completion report.

## Integration points

- Normal Expanse play loads the validated review slice asynchronously;
  `?props=gallery` remains the explicit catalog-curation path.
- Keep props asynchronous and post-first-frame. They must never delay the 100% ready screen or restore a global compile spike.
- Reuse the existing `warmQueue` scheduling so newly loaded prop materials compile gradually.
- Expose placement/body/type totals through `city.stats` or the existing debug HUD.
- Connect prop chunk visibility to `src/world/expanse-chunks.js` rather than creating a second distance system.

## Required review slice

Before citywide propagation, show three street-level captures:

1. Station/restaurant forecourt in daylight.
2. Hongdae or Pocha at night.
3. Hangang promenade in daylight or rain.

The slice should contain roughly 25–40 props total. Run it past the user before filling all twelve chunks.

## Validation

Add Expanse prop assertions to `tools/bench/expanse-layout-check.mjs` or a narrow `expanse-props-check.mjs` called by `npm run expanse-check`.

Required gates:

- deterministic record hash/count for a fixed seed;
- all twelve chunks represented where district intent permits;
- zero road, river, building, shop-dwell, delivery, spawn, bridge, or tunnel intrusions;
- every catalog key resolves;
- desktop/mobile counts satisfy their budgets;
- static and dynamic body policies match metadata;
- normal driving, full-speed ring, on-foot exit/entry, order pickup, and mobile smoke remain clean;
- `npm run expanse-check`, `npm run props-check`, and `npm run build` pass.

## Out of scope

- Ambient traffic or pedestrian AI.
- Road-layout, width, curve, grade, bridge, or handling changes. (Historical
  scope boundary; the user explicitly authorized the 0.85/1.25 rich-layout
  trial in the subsequent 2026-09-04 pass.)
- Terrain deformation.
- Global texture diffusion.
- Replacing the single collision BVH without profiling evidence.

## Completion handoff

Report exact placement counts by district/type/chunk, collision body counts, draw calls at the three review cameras, mobile counts, license status, and all validation commands. Update `EXPANSE-HANDOFF.md`, `handoff.md`, and this document when the slice is approved and propagated.
