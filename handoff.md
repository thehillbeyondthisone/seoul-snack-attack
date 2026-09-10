# 서울 스낵 어택 — Seoul Snack Attack — development handoff

## 2026-09-10 — Rebuild M5: shops, landmarks and a delivery loop that routes

- `?world=expanse2` no longer ships `pickupSites: []`. The eight menu
  restaurants are bound to eight of M4's generated storefronts — chosen by
  frontage, street class and height with no RNG, one per district and three in
  the station quarter, exactly as the roster asks — and the order system now
  picks up from a named building instead of falling back to a delivery anchor.
  `?world=expanse` and `?world=proc` are untouched; nothing is promoted until
  M6.
- The five anchors `expanse-layout.js` has authored since the beginning finally
  have something standing on them. A landmark is **a crown on a building that
  is already there**: no footprint, no land claimed, nothing that can collide,
  because re-settling 1,211 plots to make room for bespoke structures is not a
  trade M5 was worth. The mini-map draws them as named triangles under the shop
  pins.
- New: `src/world/expanse-pickups.js` and `src/world/expanse-landmarks.js`
  (both pure data plus a thin runtime half), a landmark layer and legend row in
  `src/ui/city-map.js`, and two review cameras — `shopBoard`, `landmarkTower`.
  Nothing in M1–M4 moved and all four of their gates still pass unchanged.
- New gate `npm run route-check` (`expanse-route-check.mjs`), 26 assertions in
  three halves: the bindings, the routes and the crowns. It routes all 308 legs
  the game can offer — shop to anchor, anchor to shop, shop to shop and spawn
  to shop — before the browser sees any of them. Longest route 1,002 m, worst
  detour 2.05× the straight line.
- The gate hands `createDeliveryAnchors` a flat-ground function rather than
  skipping the anchors it cannot raycast in Node. That is the rebuild's real
  ground: four flat quads at y = 0 with the river cut out of them.
- Runtime probe: booted clean at day and night, 8 labelled shops, an order
  offered from Hongdae Chimaek Street with the board legible in both lighting
  states, and the radio tower reading across two districts. `npm run check`,
  `npm run map-check`, `npm run expanse-check` and `npm run build` all pass.
- Carried into M6: road-surface art, props and street furniture, and the Market
  Hall being a local landmark rather than a skyline one. See `CITY-REBUILD.md`.

## 2026-09-09 — Rebuild M3: greybox massing, drivable at `?world=expanse2`

- The city rebuild is now something you can drive. `?world=expanse2` boots the
  generated city — 299 junctions, 452 roads, 143 blocks, 1,211 greybox
  buildings — with working collision, a routeable graph and the delivery loop
  running on it. `?world=expanse` and `?world=proc` are untouched; nothing is
  promoted until M6.
- New: `src/world/expanse-massing.js` (pure data: plot settling, storey model,
  volume stacking, pavement pads) and `src/world/expanse2-city.js` (the
  runtime). `expanse-blocks.js` gained a `block.kerb` line and a settle pass
  for it; nothing else in M1/M2 moved and both gates still pass unchanged.
- Two deliberate departures from `expanse-city.js`. **Collision is the ground,
  not the roads** — four flat quads, with the roads as paint lifted above them
  by class, because 452 carriageways overlapping at 299 junctions cannot all be
  collision slabs without z-fighting or a step at every junction. **The river
  is a hole** cut out of those quads, so the three bridges are the only
  crossings and driving off the quay is a fall.
- New gate `npm run massing-check` (`expanse-massing-check.mjs`), 20
  assertions in two halves. Clearance: nothing in a carriageway, no pad in a
  carriageway, ≥1.5 m of pavement at every frontage, and the 2.7 × 5.0 m pocha
  envelope swept along all 21.4 km of road. Budget: 39,162 visible triangles,
  37,226 collision, 51 draws, 12 materials — every one of them an order of
  magnitude inside contract, because a greybox box is twelve triangles.
- Fixing the clearance half found two real faults and cost very little: 24 kerb
  corners sat in the asphalt (worst 6.2 m) because `insetPolygon` averages
  shallow corners, and 121 buildings had a corner under 1.5 m from a road they
  did not front. 239 plots were trimmed (1,063 m² of footprint in total), one
  plot and two pavement pads were dropped outright.
- Review: `Quick Start.cmd` option **[6] Drive the rebuild**, plus
  `?world=expanse2&expanseView=plan|massingRing|massing<District>`. The district
  cameras were picked by scoring every street against the massing around it,
  not typed in by hand.
- Runtime probe: booted clean, 62 km/h with four wheels grounded, a delivery
  completed, 24k–58k triangles and 43–67 draws in play. `npm run check`,
  `npm run expanse-check` and `npm run build` all pass.
- M4 dressed the massing: facades, shopfronts, signage, parapets and
  district lighting. Shops the delivery loop can use, and props, are M5. See
  `CITY-REBUILD.md` for the milestone table and the gaps carried forward.

## 2026-09-04 — Expanse rich-layout trial rejected and rolled back

- The direct 74-node/113-edge runtime substitution was not playable: 53
  auto-generated connector edges rendered as physical roads, widened roads
  conflicted with authored building setbacks, and the vehicle spawned inside
  visible massing. The user rejected the result.
- `?world=expanse` is restored to the last validated 25-node/35-edge,
  1,000 × 720 m runtime with its coherent collision, spawn, dressing,
  street-life, shops, road art and 28-prop review slice.
- The rich JSON/GLB adapter files remain isolated for forensic/reference work;
  `expanse-city.js` does not import them. Do not reactivate them wholesale.
- Keep the new `M` north-up full-city overlay and cassette-deck mute behavior.
- Recovery validation: production build passed; browser boot reported 18
  buildings, eight shops, 25/35 graph, four grounded wheels, and a clear spawn.
- Next map iteration must start from a reviewed 2D road plan, classify routing
  connectors separately from drivable surfaces, and validate spawn/building/
  carriageway clearance before any runtime replacement.

## 2026-09-03 — Rejected experiment: original blueprint direct substitution

The statements in this section record the attempted state, not the current
runtime. It was rolled back by the recovery entry above.

- Live `?world=expanse` now uses the original authoring package under
  `_source-assets/world/seoul-expanse/`: the 74-node/113-edge road graph, curved
  Han channel, landmark/drop-off data, and authored visual GLB. The former
  25-node/35-edge procedural plan in `src/world/expanse-layout.js` is retained
  only as a legacy regression fixture and is not the live runtime layout.
- The current playtest applies 0.85 only to X/Z layout distances and authored
  massing, producing 850 × 612 m bounds. It independently applies 1.25 to road
  widths; heights and other physical object dimensions remain in metres.
- The resulting tightest orbital-road curve is approximately 75 m radius. This
  is intentionally a trial setting and needs full-speed, wet-road, and both-car
  playtesting before it is treated as final.
- `M` now opens a north-up full-city map drawn from the live route graph. It
  shows the road hierarchy, districts, river, restaurants, current player and
  active order route; `M` toggles and `Escape` closes it. While open it pauses
  driving physics, touch input, and order timers/state progression.
- Master mute moved to the cassette deck's mix controls; `M` no longer changes
  audio state.
- `src/world/expanse-blueprint.js` adapts the immutable authoring JSON for the
  runtime. `src/world/expanse-rich-runtime.js` loads and batches the matching
  GLB and derives building collision from it. Use `npm run blueprint-check` for
  the source/scale contract.
- Older Expanse density, road-art, chunk, and prop notes below describe the
  superseded 25-node greybox milestone. Revalidate or re-author those
  placements against the rich graph before treating their counts/captures as
  current live-runtime evidence.

## 2026-09-03 — Historical greybox: Expanse prop review slice

- Added `src/world/expanse-props.js`: pure deterministic placement records plus an asynchronous loader that batches instanced meshes by existing visual chunk and prop type.
- The review slice contains 28 desktop placements: Station 10, Hongdae 10, Hangang 8. Mobile selects eight unchanged records from the same seed and keeps all three clusters.
- Bodies: 20 dynamic, five static, three decor; dynamic props remain outside `city.raycast`. The compact-world scanner is never used for normal Expanse play.
- `npm run expanse-check` now includes `tools/bench/expanse-props-check.mjs`, covering fixed hash/counts, catalog keys/sizes, body policy, deterministic mobile selection, and every clearance contract.
- Review cameras: `expanseView=propsStation|propsHongdae|propsHangang`; captures are in `_work/expanse-props-*.png`.
- Runtime probes are clean: 66.5 km/h full-speed drive with four wheels grounded, grounded on-foot boot, and the real mobile 8-object/7-body subset. Production build passes.
- This is the approval slice only. Do not propagate props across all twelve chunks until the user approves it. Catalog assets remain internal-evaluation-only until their licenses are cleared.

## 2026-09-03 — Historical greybox: density + storefront + chunk/LOD milestone

- At this milestone, the 1,000 × 720 m procedural greybox was playable behind
  `?world=expanse`; the richer 850 × 612 m blueprint runtime above now
  supersedes it.
- Road plan, district art direction, and full six-district propagation were approved by the user.
- Density/street-life milestone: 18 primary buildings, 98 secondary buildings, 20 parked cars, 49 trees, six bus shelters, waterfront/road detail, and physical collision without road-envelope intrusions.
- All eight restaurant IDs now have fixed district-correct storefronts, bilingual signs, safe curbside pickup markers, and road-edge bindings shared by runtime and validation.
- The route gate covers all 144 shop-to-delivery combinations (10–892 m); live forced-order smoke reached the correct Pickup phase for all eight restaurants.
- Street-life visuals now use a deterministic 4 × 3 chunk grid with silhouette/detail/micro tiers. Desktop defaults are 720/260/~146 m; mobile defaults are 280/160/~70 m.
- `Quick Start.cmd` now offers Expanse play, full-map review, Expanse mobile QA, and classic-city modes; its 15-second default is the current Expanse build.
- In that superseded greybox, the approved road-art language covered all 35
  edges. These counts are historical, not a description of the live 113-edge
  graph.
- The next implementation brief is `EXPANSE-PROPS-HANDOFF.md`: a 25–40 object, chunk-aware Station/nightlife/Hangang review slice before citywide prop propagation.
- Collision and routing deliberately remain global. The existing single BVH stayed healthy under full-speed and on-foot probes, so it was not split merely to mirror visual chunks.
- Existing vehicle handling, on-foot locomotion, and enter/exit systems are unchanged.
- Latest smoke: 73.3 km/h through the north corridor with four wheels grounded, 58 draws / 16k triangles and 12/7/4 chunk tiers; mobile and on-foot budgets work; fixed-shop HUD/pickup checks, production build, and `npm run expanse-check` pass.
- Detailed architecture, review URLs, guardrails, and ordered remaining work: `EXPANSE-HANDOFF.md`.

**Updated:** 2026-08-25 (graphics pass 2)
**Status:** Playable and validated. The ripped `compact` vehicle is retired (blocker cleared) and the garage screen exists. `npm run build` has now been run — see validation status below for what remains before deploy.

## 2026-09-02 — shared orbit camera and pocha rollover tune

- Driving now accepts the same mouse/right-stick orbit input as on-foot play.
  Clicking the canvas captures the mouse in either mode; the vehicle camera
  retains its damping, speed FOV, crash shake, and adds city-BVH wall pull-in.
- Corrected the horizontal orbit sign in both modes and the on-foot strafe
  basis: positive mouse/right-stick X now looks right, and D moves screen-right.
- Vertical orbit is non-inverted in both modes: positive mouse/right-stick Y
  looks down.
- Kept the native Three.js/BVH vehicle solver. Ported Sketchbook/Cannon's
  effective `rollInfluence` concept instead of adding Cannon.js and a second
  collision world. After playtesting, the pocha now uses a forgiving 0.55 roll
  influence through 90% of top speed, a slightly lower physical CoM, and
  stronger grounded upright assistance. Steering alone should not topple it;
  hard kerb strikes and collisions can still upset the tall truck.
- `npm run vehicle-tuning-check` now covers both steering directions at 45,
  60, and near-maximum speed. Peak roll is currently 5.1, 5.6, and 6.8 degrees
  respectively, with matching left/right results. `npm run build` passes.

## 2026-09-02 — Historical: on-foot locomotion and Seoul Expanse brief

- Added a model-swappable, original on-foot courier controller under
  `src/character/`: camera-relative walk/sprint, buffered+coyote jump,
  idle/walk/sprint/jump/fall/vehicle-entry states, damped orientation, orbit
  camera, camera wall pull-in and a procedural gait.
- `src/world/capsule-collision.js` resolves a 1.72 m × 0.32 m upright capsule
  against the same tile-aware `three-mesh-bvh` collision used by vehicles.
  The parked player vehicle also acts as an oriented obstacle.
- `F` / Xbox `B` exits a sufficiently slow vehicle, chooses a collision-checked
  side, and walks the courier back to that side before re-entry. Vehicle doors
  are not animated because the existing GLBs do not contain door rigs.
- Keyboard, standard gamepad and touch bindings now switch context between
  driving and on-foot play. `?mode=foot` is the deterministic QA hook.
- Route bearing and the heading-up mini-map follow the active player while
  pickup/delivery dwell remains vehicle-based.
- `tools/bench/character-check.mjs` covers floor/wall capsule resolution,
  blocked spawns, vehicle exit and camera-relative walking. It is part of
  `npm run check`.
- Required preview: `tools/blender/previews/player-character.png`.
- `WORLD-SWARM-BRIEF.md` was the approved handoff contract for an overnight
  headless-Blender swarm: a source-scale 1,000 × 720 m Seoul world, 2.5 km
  high-speed ring,
  six frozen districts, walking/vehicle envelopes, chunk/LOD/collision budgets,
  export naming and automated validation.

## What this is

A self-contained fork of **Seoul Delivery** (서울 배달), rebranded as **서울 스낵 어택 / Seoul Snack Attack** — a late-night Korean street-snack delivery game. The fork lives entirely in `seoul-snack-attack/` with its own `package.json`, `node_modules`, `src/`, `public/` and asset pipeline; the parent project at the repo root is untouched.

Long-term goal: repeated graphics passes (texture mapping, advanced Three.js features) until the visuals are genuinely striking.

## Running locally

```bash
cd seoul-snack-attack
npm run quickstart   # or double-click Quick Start.cmd
```

- Dev server: **port 5273** (preview: 4273) — deliberately NOT the parent's 5173, so the two games (and other Vite apps on this machine) never fight for a socket.
- The Quick Start launcher reads the served page title: it reuses THIS game's server, refuses to kill a different Vite app's server (naming it), and recovers a wedged server. Classifier bench: `node tools/bench/quickstart-check.mjs`.

## Done so far

- **Fork bootstrap.** Copied and decoupled from Seoul Delivery; independent Vite app, scripts, toolchain; full 76 MB `public/assets` copy.
- **Colour bible v1.** `src/world/data/color-bible.js` + `color-bible.html`: tteokbokki red-orange = urgency/alarm, banana-milk cream-gold = money, fish-cake teal-cyan = nav; amber sodium night stage. District ids frozen (hills/hongdae/station/market/hangang/pocha); display names rethemed as food streets (떡볶이 골목, 김밥 대로, 호떡 시장, 빙수 한강, 포차 골목, 북악 산책).
- **Night lighting rig synced** to the bible (`src/world/lighting.js` imports STAGE; intensities rebalanced for the amber stage).
- **Snack roster.** Eight shops in `src/game/data/restaurants.js` (`tteokbokki|hotteok|eomuk|gimbap|chimaek|bingsu|gilgeori|pocha`), 20 dish sets, all mapped onto the 12 existing food GLBs — no new assets.
- **Identity & strings.** Title/loading/HUD/debug rebranded; all persisted keys `snack-attack-*` (saves never collide with the parent).
- **Fleet.** Hero vehicle `pocha` — Quaternius "Sushi Truck", CC0, 14.6k tris, through the build-vehicle normalize pipeline (`?car=pocha`). Licenses + rejected candidates in `_source-assets/vehicles/LICENSES.md`. Physics spawn fix in `vehicle/physics.js place()` for tall rigs; chase camera offsets param-overridable.
- **Default vehicle = pocha** (`DEFAULT_VEHICLE` in `src/game/data/vehicles.js`; `src/game/save.js` derives from it; van stays owned/selectable). Garage selection swaps vehicles in place — see the 2026-08-25 pass below.
- **Graphics pass 1 — texture mapping.** `src/world/proc/textures.js` (new): runtime-generated plaster/asphalt/paving normal+roughness pool (~2 MB VRAM, zero extra draws); world-scaled box UVs in `proc/mesh.js`; wetness now deepens roughness/env response in `proc/city.js`; mobile profile scales via new `detailIntensity` budget hook in `src/core/graphics-quality.js`.
- **Pickup hitch fixed.** Food GLBs now load one per browser idle slice and each
  receives a 4×4 offscreen render against the real scene lighting, warming
  geometry, textures, and shader variants before visible use. The offered dish
  is loaded immediately and promoted to the front of the GPU warm-up queue.

## Validation status (2026-08-25, after the blocker/garage/graphics-pass-2 run)

- `npm run check` — **all green** on an idle machine (exit 0, 69 PASS). The `tiling-check` wall-clock perf budget is load-sensitive: it failed only while four agents + headless probes were hammering the CPU, and passed once the machine was quiet. If it flakes again, re-run before suspecting a regression.
- Headless probes (desktop + mobile, day/night/wet, garage E2E) clean — no console errors; garage swap verified end-to-end (physics params, pose, save key).
- `npm run build` — **passes** (137 modules, ~15.7 s). `dist/assets/vehicles/` contains only `pocha` + `van`; no `compact.glb` references anywhere in `dist/`. Static output not yet smoke-tested in a browser (`npm run preview`) — do that before deploy.

## 2026-08-25 pass (blocker retirement + garage + graphics pass 2)

- **Compact retired**, **garage in-place vehicle swap**, and graphics items per the follow-ups list below.
- New files: `src/world/proc/decals.js`. Heavily edited: `proc/mesh.js`, `proc/signs.js`, `proc/city.js`, `time-of-day.js`, `lighting.js`, `main.js`, `hud3.js`, `debug.js`, `save.js`, `vehicles.js`.
- Integration notes: the sign light pool lives under the `proc_signs` group (`tools/probe.mjs`'s direct-children `pointLights` stat cannot see it — traverse the group for sign QA); road materials are albedo-modulated by `setWetness()`, so anything that recolours roads must do so after city load; `dressSigns()` accepts an optional `{ profile }`; `buildCityMesh()` accepts an optional `{ decals:false }`.

## 2026-08-25 pass (cassette deck music player)

- The audio chip (bottom-left `#hud3 .audio-status`) now opens a **cassette deck
  overlay** (`src/ui/cassette-deck.js`) instead of the old `.audio-menu`: door-eject
  open/close animation, per-track J-card colourways in the tape rack, ghost-tape
  insert animation, 3D tape in the window (`public/assets/ui/cassette.glb`, 0.5 MB,
  pruned from the 26 MB source to one shell per variant), DOM spool overlays that
  spin only while playing (projected onto the tape's real hub coordinates each
  frame — the GLB bakes the reels, so rotation is faked), compact mix row absorbs
  the old menu's volume/reset controls. The old `.audio-menu` markup/CSS/bindings
  were removed; `bindAudioControls({ soundtrack, audio })` signature unchanged.
- Provenance: cassette GLB is owner-provided, License TBD — see ATTRIBUTION.md.
- Bonus-track hook: `locked: true` on a `SOUNDTRACK` entry passes through
  `soundtrackTracks()`; the deck dims locked tapes and refuses to insert them.
  Nothing sets `locked` yet — no unlock logic built.
- Deck renderer discipline: lazy WebGL context on first open, rAF only while
  open (verified `deck._raf === 0` after close), pixel ratio capped at 2.

## Known blockers / follow-ups

1. ~~**RELEASE BLOCKER (inherited):** the `compact` vehicle~~ **RESOLVED 2026-08-25:** the ripped `compact` microcar (Agents of Mayhem watermark) is fully retired — removed from the roster, recipes, build pipeline and `public/assets`; source stays quarantined in `_source-assets/vehicles/compact/`. Stale saves fall back to `pocha` via `loadSave()`. Details in `ATTRIBUTION.md`.
2. ~~**Garage / vehicle selection screen**~~ **DONE 2026-08-25:** the existing HUD3 garage overlay now swaps vehicles in place (`switchVehicle()` in `main.js`) — same pose, physics params reset per rig, saved tuning restored, no page reload. Choice persists under `snack-attack-save`.
3. **Graphics pass 2** (from pass 1's queue; done items marked):
   - [x] Warm amber night skybox — canvas equirect painted from the colour bible STAGE (`createAmberNightSky` in `time-of-day.js`); old blue night cube no longer generated
   - [x] SSR-lite neon reflections on wet asphalt — stronger roughness/env/albedo response plus instanced additive streak quads along each streetlight street (`buildWetStreaks` in `proc/city.js`)
   - [ ] Per-instance facade UV scale (instanced attribute + `onBeforeCompile`) — removes the one-tile-per-facade stretch
   - [x] Contact AO / vertex AO at building bases and kerbs (`applyContactAO` in `proc/mesh.js`)
   - [x] Decals: crosswalks, manholes, patches, grease stains (`proc/decals.js`, 4 draw calls, budget scales with `detailIntensity`)
   - [x] Sign-layer LOD — district-clustered sign batches cull beyond `profile.cullDistance`; landmark PointLights are a nearest-first pool (desktop 8 / mobile 4) with hysteresis
   - [x] Per-instance facade UV scale (instanced attribute + `onBeforeCompile`) — `proc_buildings` carries an `aUvScale` float per building, picked from `[0.6, 1.0, 1.5, 2.2]` deterministically; `proc_roofs` gets the same treatment with the tighter `[0.9, 1.4, 2.0]` range. `installUvScaleChunk(material)` in `src/world/proc/mesh.js` scales `vMapUv` / `vNormalMapUv` / `vRoughnessMapUv` in the vertex stage so the multiply interpolates correctly. `npm run check` still 69 PASS. Roof scale is **structurally attached but currently a no-op** — `roofMat` has no maps, so there is nothing to stretch until a roof albedo/normal pool lands in `textures.js`. Re-captured `_work/texture-blend-{0,05,1,1-day}.png` from `?intro=off` with `phys.place(0, 0, -45)`; chase-cam vantage. Note: the new captures are not the same camera positions as the 2026-08-26 originals — those came from a hand-posed free-cam the user drove interactively; the new ones are the chase-cam view at the boulevard spawn. Recapture from the original vantage needs that camera rig back.
   - By-eye tuning done on SwiftShader screenshots only; final art values want a real-GPU pass.
   - User-flagged next: background buildings "need some love" — building texture maps discussion queued with the facade UV work.
4. **Cassette license** — **RESOLVED 2026-08-25:** owner confirmed the cassette
   tape pack is open license; ATTRIBUTION.md updated. No longer TBD.
5. **Comment headers** reading `// Seoul Delivery —` remain in several files under `src/` (internal only). Sweep opportunistically.
6. `city.js` drop-in comment could note that `physics.place()` lifts taller rigs (minor doc nit).
7. **Boundary drift shoulder (2026-08-25):** ground-edge walls now stand 5 m out
   from the drivable rim on a concrete shoulder apron (`SHOULDER` in
   `end-zones.js`), so the player can drift off the kerb before hitting the
   wall; apron top sits 4 cm below roadY to avoid z-fighting. **Verified
   2026-08-25 in-browser** (headless probe, `?time=day`): van placed on the +X
   rim rides the apron grounded (no kill, no water plunge) and the wall contains
   it; captures in `_work/probe-boundary-street*.png`.
8. **Order card moved (2026-08-25):** the offer docket now docks under the money
   rail, upper right (`#hud3 .order` in `hud3.js`, 324px, scaled-down type) —
   was centre-screen. **Verified 2026-08-25 in-browser** via `?offer=1` probe:
   card sits clear of the minimap on short viewports
   (`_work/probe-order-card2.png`).
9. **Downloaded asphalt PBR comparison (2026-08-26):** the city remains
   procedural by default. The debug menu now has a **텍스처 · Textures** folder
   with a `Procedural / Downloaded` source toggle and a 0..1 blend slider for
   the asphalt pool. The downloaded pack is ambientCG "Asphalt 033" (CC0),
   shipped under `public/assets/textures/asphalt/`, loaded async and blended
   into the existing road material by re-baking a single owned texture pair
   whenever the slider moves. Comparison captures in `_work/texture-blend-0.png`,
   `_work/texture-blend-05.png`, `_work/texture-blend-1.png`,
   `_work/texture-blend-1-day.png`. Files: `src/world/proc/texture-pack.js`
   (new), edits to `src/world/proc/textures.js`, `mesh.js`, `city.js`,
   `src/ui/debug.js`, and `ATTRIBUTION.md`.

## 2026-08-27 — headless Blender food recipes

- New lane: `tools/blender/`. Blender 5.2.1 LTS, `--background --factory-startup --python`.
- First originals: `tteokbokki-cup` (1 168 tris, 11.3 cm) and `hotteok` (1 660 tris, 14.4 cm). Wired into the tteokbokki and hotteok shops so those dishes no longer show a gochujang jar / roka bottle as a stand-in.
- `banana-milk` added as a **new** convenience-store dish (does not replace bingsu or samyang). Truths file: `TRUTHS_SEOUL-SNACK-ATTACK.md`.
- SSA-2: `soondae-platter` replaces the luncheon-meat stand-in on 순대 모둠 세트 (ssamjang kept).
- Commands: `npm run blender`, `npm run blender-check` (also part of `npm run check`). Living process: `tools/blender/README.md`.
- Preview stills live next to the recipes (`tools/blender/previews/`) so the next asset has a visual baseline.

## 2026-09-10 — the pocha cockpit is wired

`pocha-interior.glb` shipped on 2026-09-10 (commit 585e7cd) as an asset nothing
loaded. It is now a playable view.

- **`src/vehicle/interior.js`** parents the cabin into the vehicle group at
  `def.interior.offset` and drives the two instruments worth driving.
- **`src/vehicle/cockpit-camera.js`** is a separate camera, not a mode inside
  `ChaseCamera`: it composes the head onto `phys.quaternion` with quaternions
  rather than `lookAt`, so the truck's roll and pitch reach the player instead of
  being levelled away.
- **`C` / right-stick click** toggles it; `?view=cockpit` boots into it.
- **The exterior shell is hidden while you are inside it.** The assumption that
  single-sided materials would make it disappear was wrong — a raycast from the
  seated eye hits `body`'s Atlas primitive at 0.37 m, so Quaternius' cab carries
  a real bulkhead. `van.body` is exposed by `vehicle.js` for that toggle.
- **Seating numbers** live in the `interior` block of `src/game/data/vehicles.js`
  and are derived from `pocha.json`, not eyeballed — the comment there shows the
  working for all three offsets.

### Known gaps

- **No body shadow in the cockpit.** Hiding `body` takes it out of the shadow
  map too, so the truck stops casting its own shadow while you sit in it; the
  four wheel shadows remain. Fixing it means a layer the main camera skips and
  the shadow camera does not.
- **`needle_fuel` is parked.** There is no fuel system, and a gauge bound to
  something that is not fuel is a lie the player reads as one. The node stays
  addressable.
- **One extra point light, permanently.** The dome lamp never leaves the scene
  and rides its intensity to zero instead, because three recompiles every
  material when the visible light count changes — a lamp that switched on with
  the view would hitch the frame the player pressed C.
- **Cockpit values were judged on SwiftShader screenshots**, same caveat as the
  graphics passes above. Eye height, dome intensity and the needle sweep all
  want a real-GPU look.

## Conventions for new sessions

- Read `README.md` (game docs), `ATTRIBUTION.md` (licensing — check BEFORE adding any asset), and this file first.
- District ids in the colour bible are FROZEN; display names/palettes are the creative surface.
- Validate with `npm run check` + `node tools/probe.mjs` (headless Chrome, console + state + screenshot; use small `--size`).
- Useful QA params: `?car=pocha|van`, `?shop=<id>`, `?offer=1&accept=1`, `?time=night|day`, `?overview=1`, `?stats=1`, `?gfx=mobile|desktop`, `?props=gallery`, `?intro=off`.
