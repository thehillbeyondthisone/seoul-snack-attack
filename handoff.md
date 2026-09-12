# 서울 스낵 어택 — Seoul Snack Attack — development handoff

## 2026-09-12 — M6c implementation and default-world promotion

Checkpoint `c74e9ef` committed the accepted cab/music/settings/handling pass.
M6c then measured actual RTX 4060 rendering, batched generation and facade-sheet
painting, streamed 48 optional facade meshes and 12 original street-detail
batches, and used parallel shader preparation where supported. The dominant
startup stall was shader first use, proven by CPU profiling. Final daytime
median/p95 remained 16.7/16.8 ms; largest observed tasks fell from 3,525/2,214 ms
to 906/510 ms for desktop/mobile profiles. Both ran on the desktop GPU.

World-aligned road UVs fix roughness/normal-map seams between overlapping
ribbons. Split roads inherit their street names; new lanes show districts.
757 original street-detail placements add 27,240 triangles and eight night shop
light pools. The kit's preview is `tools/blender/previews/seoul-street-kit.png`.
All visual geometry comes from original code; collision/lot layout is unchanged.

The rebuild is now the default world and launcher [1]. Previous Expanse remains
available at `?world=expanse` / [2], classic at `?world=proc` / [3]. The tuning
switcher explicitly writes `world=proc` now that removing the parameter means
the rebuild. No merge to main or deployment was performed.

The combined `npm run check` passed, as did native-config production build,
real keyboard driving/default-world/stream-completion checks and classic-world
switching. Day furniture and night shop-light screenshots were inspected.
`M6C-VALIDATION.md` records measurements and reproducible browser commands.
`NEXT-AGENT.md` was rewritten to remove the stale pre-commit inventory.
Physical-phone testing, longer routes, courtyard/landmark art and an exact
match to the user's saved screenshot location remain open.

## 2026-09-12 — Cassette access accepted for checkpoint, M6c next

P, the HUD cassette button, and Settings > Music > Tape deck open the player.
Opening releases pointer lock and pauses driving/orders while songs continue;
Escape closes it. All seven initially available songs remain directly selectable,
and delivery locks are preserved. `cassette-browser-check.mjs --game` verifies
all three entry points, seven selections, locked selection rejection and parked
physics, alongside its existing nine-viewport and audio-crossfade checks.
`npm run check`, `npm run expanse-check`, the browser check and the production
build (`--configLoader native`) passed before the user-requested checkpoint.
Local assistant configuration and generated Python caches are excluded from it.

## 2026-09-12 — User review: direct tuning and matching cab paint

Escape settings are accepted; backtick now opens/closes tuning directly and
switches from Settings without stacking panels. F3 and pad View retain settings
behavior. README and the in-menu controls reference agree.

The cab shell is the exterior atlas's orange, with green dash/door cards/galley
fronts and charcoal trim. `POCHA` in the colour bible records the sampled sRGB
palette, mirrored in Blender's `BIBLE`; the optional `srgb` material argument
converts to linear without changing existing recipes. Hippo enamel now uses the
bible's strawberry pink. Both GLBs and all five PNG previews were regenerated
and visually inspected; geometry and animated nodes are unchanged.

`NEXT-AGENT.md` remains the next-stage handoff. Its latest-review note explicitly
tracks screenshot 3's hard surface boundaries, bare areas, repeated facades and
distant washout for M6c diagnosis; these are observations, not proven causes.

Validation: Blender rebuild, `blender-check`, `proc-check`, touch-controls check,
and `npm run build -- --configLoader native` passed.
The real-game headless Chrome check (`_work/menu-color-check.mjs`) also passed:
direct tuning/toggle, Escape, Settings-to-tuning, F3, and exact loaded sRGB
material colours. Screenshot: `_work/cab-colors-in-game.png`. Chrome required
running outside the sandbox after its initial DevTools connection timed out.

## 2026-09-12 — Blender cab, hippo and delivery tape collection

The cab now has a darker teal dash, copper shell, rounded edges, marked
0–150 km/h instruments, cassette stereo, stitched brown seats, cabinet doors,
tiles, an open sink and working-kitchen clutter. The wheel is lowered to keep
the dials visible. `pocha-interior.glb` is 19,200 triangles / ~896 KB, within
its existing 30,000-triangle gate. All four Blender preview angles are refreshed.

The user's lilac roadside hippo reference is now a Blender-authored dashboard
souvenir (`dash_hippo.py`, `dash-hippo.glb`, `previews/dash-hippo.png`), with a
wide white mouth and two lower tusks. Its head is a separate node; the existing
G-force/crash spring in `dash-hippo.js` animates that node. The toy has 21,140
triangles / ~555 KB. The cab's preview attaches the toy after exporting the cab,
matching the runtime's separate attachment. No exterior or physics asset changed.

The user confirmed **11 rack tapes plus Dive as a separate ramp-only song**.
Imported the new songs from Downloads and renamed the old Rapid Fire (Cover)
and Supersonic Fire files to `rapid-fire.mp3` and `supersonic.mp3`. Seven tapes
start available. Delivery milestones are in `data/soundtrack.js`: Abyssal Ramen
Submarine at **3**, Blade of Hatred at **6**, Rapid-fire at **9**, Supersonic at
**12**. These were announced as tunable defaults; the user specified delivery
unlocks but did not choose counts. The existing saved delivery count unlocks
them on reload. Save reset relocks them. Next/Prev/ended skip locked tapes.

The deck keeps every tape and its requirement visible in a wrapping grid,
including short/mobile windows; titles wrap. Transport and mix fit too.
`Soundtrack` owns two media elements and an equal-power 1.6-second crossfade.
`dive.js` starts Dive only at `armed → launched`, never on approach. The
selected cassette pauses at the end of its fade and resumes when Dive ends;
inserting another tape overrides the cue. Music remains full-band underwater.
Both lanes honor pause/resume, master, music level and mute. The master slider
now actually scales MP3 volume; it previously only affected procedural audio.

Validation:

- `npm run blender -- dash-hippo pocha-interior`; PNGs visually inspected.
- `npm run check`: complete suite passed, including expanded audio checks for
  milestones, skip/selection/reload locks, overlap, pause/mute, repeat jumps,
  user override, rapid pause/resume and missing-cue recovery.
- `npm run build -- --configLoader native`: passed. Native config loading
  avoids this sandbox's esbuild parent-directory permission error.
- `node tools/bench/cassette-browser-check.mjs --game`: passed. All 11 tapes,
  full titles, transport and mixer fit nine viewports (320×568 through
  1280×800); two real MP3s advanced concurrently during the fade. The real game
  loaded all animated cab/toy nodes without exceptions, and its actual dive
  controller fired the cue once at launch and zero times while approaching.
  This last check placed the real physics rig at the approach/lip and stepped
  it; it does **not** claim a manually watched end-to-end jump.

Screenshots are in `_work/cassette-qa/`; model deliverables remain under
`tools/blender/previews/`. The runner now uses `--python-exit-code 1` so Python
exceptions cannot pass using an old preview. Existing unrelated working-tree
changes were retained.

## 2026-09-10 — M6b: the facades stop being a flat print

Every window in `?world=expanse2` was a rectangle painted on an albedo. No
light ever caught a reveal, so a terrace under a raking sodium lamp read as
wallpaper. The facade sheets now carry relief.

- **`src/world/expanse-facade-art.js`** paints a third canvas per sheet in the
  same pass as albedo and emissive, sharing the one `rng` so the lit window,
  the dark reveal and the recessed glass are the same window. Red is height,
  green is roughness — and because three.js reads roughness from green, that
  canvas **is** the roughness map, so the pass costs two textures per sheet
  rather than three.
- Relief is painted through a **scaled context**, so every draw call is written
  once in albedo coordinates and lands on both sheets. Halving some coordinates
  by hand and not others would slide the normal map a few pixels off the paint
  everywhere, which reads as a soft blur rather than as a bug.
- `RELIEF_SCALE` is 0.5, and that is a **budget** decision, not an art one: the
  facade pool has a 48 MB ceiling and full-scale relief needs ~21 MB of it
  against the 6.5 MB this costs. The gate now asserts the arithmetic in both
  directions, so a later "just make it sharper" fails where the decision was
  made rather than somewhere else entirely.
- **The Expanse's roof finally has maps** (gravel, felt seams, dished puddles).
  This is *not* the `aUvScale` no-op from graphics pass 2 below: that one is on
  the compact city's `proc_roof` in `src/world/proc/mesh.js` and still waits on
  a roof pool in `src/world/proc/textures.js`. Different material, different
  city — the scope for this pass was expanse2 only.
- `relief` rides `detailIntensity`, so the `?gfx=` floor drops the pair and the
  materials fall back to M4's flat sheets rather than to a broken look.
- **New debug folder 입체감 · Facade relief** sweeps `normalScale` across all 13
  materials live, with a "compare flat" button. No texture rebuild — it is a
  multiplier on a bound map.
- `expanse-facade-check` is 26 assertions (was 24); pool is 42.0 MB desktop /
  10.5 MB mobile, against 35.7 / 8.9 before. `npm run check` 98 PASS,
  `npm run expanse-check` and `npm run build` all exit 0.

### Known gaps

- **The strengths are SwiftShader numbers again.** `RELIEF_STRENGTH` (wall 2.4,
  shop 2.8, roof 1.6) and every height in the `SURFACE` table were judged on
  software-rendered screenshots. The plaster mottle in particular looked a
  touch cloudy on a pink hongdae wall and may want backing off on real
  hardware — that is what the new slider is for.
- **Relief is per-sheet, not per-building.** Two neighbours sampling the same
  district sheet at different bay offsets get the same bumps in a different
  place, which is the same trade M4 made for the albedo.
- **Nothing is parallax or displaced.** These are detail bumps on flat mesh; a
  reveal seen from hard alongside is still a flat wall.

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
10. **Progressive model streaming (open):** GLB models should fade/pop in over
    the first seconds of play rather than all being parsed and uploaded during
    the loading screen, which is where the load-time hitch comes from. The food
    GLBs already do this (item under "Done so far" — one per idle slice, warmed
    offscreen); the pattern needs to reach props and any other deferred model
    geometry. **Explicitly excluded for now: the pocha interior** — it stays a
    load-time attach and gets its own deferral when cockpit entry becomes a
    "submersion" transition, not before. **2026-09-10: that transition now
    exists** (see "the abyssal dive" below) and the interior deferral is
    unblocked — the Drain is a ready-made cover for it.
11. **Full-city map zoom (`M`) — open:** the map (`src/ui/city-map.js`) fits the
    whole city to the canvas every frame; `linearScale` is the only knob and it
    is debug-only. Want GTA-V-style wheel / trackpad-pinch zoom with pan, anchored
    on the cursor (or the pinch centroid). `createMapProjection` already exposes
    `project` / `unproject`, so the work is an input layer + a pan/zoom offset
    the projection reads, plus clamping so you cannot lose the city off-screen.
    Scale bar and bounds box already recompute from `projection.scale`, so they
    follow for free. **Grouped with 12 as a navigation-polish pass.**
12. **Minimap zoom scale — setting + speed-driven — open:** `HUD3.setMiniMap`
    hard-codes `VIEW_M = 110` ("Fixed zoom, so the scale bar is a constant") in
    `src/ui/hud3.js`. Want (a) a persisted setting for the radar's metres-at-rim,
    wired into the debug menu next to `setMiniMapFlip`, and (b) a dynamic mode
    that widens `VIEW_M` as speed rises (more road ahead at 60 km/h, tight at a
    stop), eased so it does not pump. The scale bar and its `${VIEW_M/2} m` label
    are drawn from the constant, so they must move to whatever value the frame
    used. **Grouped with 11.**
13. **Pickup / dish 3D models sit off-centre — open:** `normalizeModel` in
    `src/game/food-display.js` centres X/Z but rests the base at local Y=0 (right
    for the world beacon it hovers on a pole). The two HUD previews —
    `src/ui/food-preview.js` (offer/ticket canvas) and the `FoodDisplay` marker
    render — inherit that, so the model sits low in the 62 px disc and spins
    about its base rather than its middle. Fix: give the previews their own
    centre-on-bbox-centre (vertical included) or derive `camera.lookAt` / distance
    from the measured height; re-check the multi-item `spacing` while there. The
    "loading is a bit better" the user noticed is the food GPU warm-up that
    already landed.
14. **`?world=expanse2` (Quick Start [2]) shows no street-name blade — open:**
    `describeStreet` in `src/world/expanse-street-names.js` keys
    `EXPANSE_STREET_NAMES` by the 35 **layout** edge ids. `?world=expanse` feeds
    `layout.edges` straight into `createRoadGraph`, so the ids match and the blade
    works. `?world=expanse2` builds its graph from `generateExpanseStreets(layout)`
    (`src/world/expanse2-city.js`), whose edges are re-cut — `e_a__b`, `perim_N`,
    `${id}__sN`, `r_…`, `t_…` — and only the split segments carry `parentId` back
    to the layout edge. Fix: fall back to `edge.parentId` (and its chain) in
    `describeStreet`; decide whether perimeter / roundabout / connector ids get
    their own names or the blade just stays hidden on them. This is a regression
    in the mode we are steering players toward and the fix is small — worth doing
    out of band from 11/12.

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

## 2026-09-10 — M6a: the Expanse's ground surface

`?world=expanse2` had 21.4 km of flat grey ribbon. It now has a generated PBR
surface and real road markings, both gated by `npm run surface-check` (30
assertions, also part of `npm run expanse-check`).

- **`src/world/expanse-surface-art.js`** — eight generated 256-square maps
  (asphalt, paving, bare land), 2.67 MB with mipmaps. Nothing is loaded from
  disk; the gate builds the pool twice with no filesystem and no GL context and
  requires bit-identical output, which is the licence argument made executable.
- **`src/world/expanse-road-paint.js`** — 7,079 marking quads from the street
  graph. One material, vertex colours, twelve chunk-culled draw calls.
- **`ROAD_LIFT` moved** out of `expanse2-city.js` into the paint module, because
  both have to agree on it exactly.
- **Four primitives were exported** from `src/world/proc/textures.js` (`fbm`,
  `normalDataTexture`, `roughDataTexture`, `makeTexture`) rather than copied.
  The compact city's own pool is untouched, including the bit-pinned weathered
  facade variant.
- **`detailIntensity` now reaches expanse2** from the gfx profile, so the mobile
  build gets softer relief off the same eight textures.

### Design decisions worth not relitigating

- **Albedo is multiplicative.** Both colour maps normalise to a mean of exactly
  1.0, so this pass adds grain and wear without moving any tone the colour bible
  or `expanse-facade-check` governs. If you change the fields, keep the mean.
- **UVs are metre-locked**, not mesh-locked. `SURFACE_TILE` is the single source
  of truth and the UV writers in `expanse2-city.js` divide by it.
- **Alleys are deliberately unmarked** (61 of 452 edges). That is not a gap.

### Known gaps

- **No wet-road decals, drain covers or tactile paving.** The yellow guidance
  strips on a Seoul pavement are a per-location decal, not something a tiling
  texture can carry; they belong with the kerb detail in a later pass.
- **Still no props or street furniture in expanse2**, and this pass did not
  change that on purpose: `public/assets/props/` is the Sketchfab-derived set
  ATTRIBUTION.md lists as a **release blocker**. Street furniture for the
  rebuild has to be original geometry or a licensed pack, not that catalog.
- **The tuning was done on SwiftShader screenshots again.** The first asphalt
  albedo had metre-scale wear terms at 0.10/0.20 and the ring road looked like a
  canal at a grazing angle; they are at 0.04/0.10 now. Normal scales (road 0.7,
  pavement 1.0, bridge 0.7, ground 0.5) and the pavement's tone under the day
  preset all want a real-GPU look before anyone calls them final.
- **M6b is untouched**: perf/LOD/mobile, full `npm run check` against the
  rebuild, and the promotion of `?world=expanse2` over `?world=expanse`.

## Conventions for new sessions

- Read `README.md` (game docs), `ATTRIBUTION.md` (licensing — check BEFORE adding any asset), and this file first.
- District ids in the colour bible are FROZEN; display names/palettes are the creative surface.
- Validate with `npm run check` + `node tools/probe.mjs` (headless Chrome, console + state + screenshot; use small `--size`).
- Useful QA params: `?car=pocha|van`, `?shop=<id>`, `?offer=1&accept=1`, `?time=night|day`, `?overview=1`, `?stats=1`, `?gfx=mobile|desktop`, `?props=gallery`, `?intro=off`, `?dive=1|ramp`.

## 2026-09-10 — the abyssal dive

Drive the pocha off the north-bank ramp at speed and the Han opens a plughole.
The view snaps to the cab, you spiral down **the Drain** for ~7 s, and arrive in
**the Abyss** driving a submarine. `?world=expanse2` only — the ramp is geometry
that world builds into its collider, so there is nothing to drive off elsewhere.

**The load-hiding idea, which is the reason the feature is shaped like this.**
The abyss has to be built (geometry + a BVH) and that takes an unknown time on
an unknown machine. Rather than a loading screen, the build hides inside a fall
down a hole, because a fall down a hole has no duration a player can be wrong
about. `dive.js` advances a 0..1 `progress` on a timer but clamps it at
`HOLD_AT` (0.82) until the abyss resolves, while the Drain's scroll rate keeps
climbing. Held, the sequence reads as "this is getting worse", not "this is
waiting". The build is kicked off at the top of the ramp, not at the water, so
the hold usually never engages at all.

### Files

| | |
|---|---|
| `src/world/dive-ramp.js` | Ramp geometry **and** the trigger volume, so the structure and the thing watching for it cannot drift apart. Sited at x = 120 on the north quay — the widest gap between the main and east bridges. |
| `src/world/the-drain.js` | The curtain. Two scrolling canvas-texture shells, a shrinking sky disc, and `pathAt(t)` — the scripted descent. No GLSL: a shader that fails to compile mid-transition has no way back. |
| `src/world/abyss.js` | The pocket: displaced floor, wall, ceiling with the mouth cut out, five sunken landmarks, drifting motes, its own BVH. All arithmetic, nothing loaded. |
| `src/vehicle/submarine.js` | A separate integrator, not a mode inside `physics.js`. Exposes the exact read surface `VehiclePhysics` does, which is why `CockpitCamera` works down there unchanged. |
| `src/game/dive.js` | The state machine, the trigger, and the load gate. |

### Decisions worth keeping

- **The submarine is a second rig, not a flag.** The road model is four
  suspension raycasts and a friction ellipse that took real tuning; none of it
  means anything in open water. `main.js` reads `dive.physics` and gets whichever
  rig is live. `attachFrom(phys)` borrows the wheel layout and `comOffset` so the
  truck still renders as a truck (wheels hanging at full droop, still spinning)
  and does not jump at the handover.
- **`needle_fuel` is no longer parked.** It was left unbound on the grounds that
  a gauge bound to something that is not fuel is a lie. `interior.setDepthMode()`
  binds it to depth while submerged, which is a quantity that is actually real.
  There is still no fuel system; above water it goes back to being parked.
- **The Drain's axis eases from the entry point to the abyss mouth.** Without
  that the descent ends directly under wherever the jump happened to land, which
  for this ramp is 123 m from the centre of a 95 m-radius pocket — outside its
  own wall. `pathAt(1)` now lands exactly on the arrival point, so the arrival
  blend is orientation-only.
- **Pocket size is budgeted against fog, not taste.** The first build was 300 m
  across and 185 m deep against a fog clearing at ~50 m, so the player arrived in
  a void with everything outside its own draw distance. `ABYSS.radius` and
  `UNDERWATER_FOG_DENSITY` are a pair; move one and you must move the other.

### Known gaps

- **Art values: first real-GPU pass done (pass 2, below).** Light intensities,
  bloom and the new life were checked on an RTX 4060 in the in-app browser.
  Fog colour/density are unchanged from the SwiftShader tuning and look right.
- **The hold path has never actually engaged here.** The abyss builds in well
  under the ~3 s of head start the ramp gives it, so `HOLD_AT` has not been
  exercised on this machine. It wants testing under a throttled CPU before anyone
  trusts it.
- **The return is composed now (pass 2).** The Drain runs in reverse from where
  you rose, and the Han spits the truck out backwards over the ramp onto the
  apron. Scripted arc, so it cannot land badly.
- **Nothing to do down there yet.** No orders, no collectables, no reason to
  visit twice. The ramen cup is modelled open and big enough to drive into, and
  there is deliberately nothing inside it.
- **`interior.js`'s header is now stale** — it still says the exterior shell is
  not hidden because the materials are single-sided. `main.js` has hidden it via
  `setShellVisible()` since the cockpit landed (handoff 2026-09-10 records why).
  Unrelated to the dive; noticed in passing.

### Pass 2 (same day) — fixes from the first playtest

The first playtest (chase view) showed the truck upside down, tumbling, against
a brown sky with two flat coloured slabs in it. Four separate bugs:

1. **The sub tumbled.** `submarine.js`'s pitch controller had its sign flipped
   (+X is body LEFT, so a positive rotation about it is nose-DOWN), and the
   righting torque is zero when inverted. **Attitude is now kinematic**: yaw,
   pitch and bank are clamped, smoothed angles (pitch <= 0.38, bank <= 0.28 rad)
   composed each step. Collisions move position/velocity only. The user's rule:
   the truck always stays upright. A 5-minute random-input fuzz never exceeded
   25 degrees of tilt.
2. **The Drain handed over nose-UP.** `pathAt` returned `pitch: -lerp(...)`
   believing negative was nose-down. It now returns `pitchUp` (positive up):
   look up the throat at the shrinking sky, then roll nose-down for the
   break-through. `setAttitude()` hands that pose straight to the sub.
3. **The floor and wall were invisible.** The floor was wound normal-down and
   the inward-wound wall used `BackSide`, so both were culled from inside. All
   shells are `DoubleSide` now, and the floor winding is fixed.
4. **The surface look leaked in.** The amber sky texture, the city's
   hemi/ambient/moon rig (on the scene root, so hiding the city did not hide
   them) and env reflections all stayed on. `dive.js` snapshots and restores
   them, plus headlights and bloom.

Also new in pass 2:

- **`src/world/abyss-life.js`**: camera-wrapped marine snow (the old lattice
  snap popped), light shafts in a ring around the mouth (never on the arrival
  axis — a camera inside stacked additive cones saw only teal), the gochujang
  Vent in the trench (glow, light, bubble column), instanced jellyfish,
  six lanternfish schools that scatter from the truck, and **the Bungeo**, a
  fifty-metre bungeoppang with an anglerfish lure circling the pocket.
- **Analytic containment** (`abyss.contain`): floor height, wall radius,
  domed ceiling and the mouth shaft as arithmetic, so the sub cannot tunnel
  the shell. The BVH probes now only matter for the landmarks.
- **Landmark skins**: canvas map + emissiveMap (vending machine buttons, bus
  windows, ramen label, soju label); the face lost its glow and gained eyes.
- **Break-through arrival**: the abyss is drawn from progress 0.8 while the
  throat dissolves, so arriving is a reveal, not a cut. It also hides the
  light-count shader recompile inside the throat.
- **Audio**: a master lowpass driven by `setUnderwater()`, a deep rumble,
  sonar pings, a leviathan groan when the Bungeo passes, and a splash.
- **Headlight beams**: additive cones on each lamp while submerged.

Light values were tuned on the real GPU. The SwiftShader numbers read as a
bright lagoon: shaft light 0.6, hemi 0.4, vent 260, lure 180, headlights 170,
bloom 0.9 / 0.7 / threshold 0.9.

## 2026-09-11 — the whirlpool shot, swimming depth, chase camera angles

Three playtest asks.

### 1. "Make it obvious you're being pulled down"

The dive cut to the cab at the splash, so the player only ever saw a dark tube.
There is now a **`caught`** state (~2.8 s) between `launched` and `descending`:

- **`createWhirlpool()`** (`src/world/the-drain.js`): two flat spiral-foam
  canvas discs over a black core, on the river surface. Flat on purpose — the
  river is an opaque slab, so anything modelled below y = 0 would be hidden.
- **The pool is solved at the splash.** Its centre sits ahead-left of the truck
  (0.9 rad off the tangent) and is clamped so a 20 m pool stays inside RIVER
  (z 125..205). The truck circles it on a spiral whose sweep is solved so it
  leaves at the splash speed and arrives turning at exactly `pathAt(0)`'s rate
  (`DRAIN_START_SPIN`). `pathAt`'s spin no longer eases in from zero (it starts
  at 0.75 of the mean rate and still settles at the bottom). The Drain opens on
  the pool's centre, so `caughtPose(1)` and `pathAt(0)` are the same pose.
- **Camera.** `dive.ownsCamera` / `dive.updateCamera()` frame an outside shot
  standing opposite the arc's midpoint; `dive.afterCamera()` (called by
  main.js after every camera) blends moves — 0.7 s out to the shot, 1.15 s back
  into the cab. The surface look (city, sky) is kept until the camera crosses
  the water; the body shell stays on until the flight is 96% in. On landing in
  the seat a toast says `Press C to change view · V camera angle` (gamepad and
  Korean variants). C and V are ignored during the outside shot.
- `setCockpit(on, { quiet })` — the dive's own toggles no longer toast.
- `chaseCam.city` is null during scripted stretches, so pressing C mid-Drain
  does not have the city collider yank the camera in from under the river bed.
- **Return fix:** `open()` takes the spiral's axis, so the ride up now ends ON
  `SPIT_FROM` instead of a 14 m hop from it.
- Audio: a `whirlpool` event, a bandpass roar that swells while you circle.

### 2. Swim down, climb slowly, sink hands-off

`submarine.js` now commands vertical speed instead of balancing buoyancy
against 13 kN of ballast (which made Space and Shift rockets): hands-off
0.7 m/s down, Shift/RB 4.4 m/s down, Space/A 1.8 m/s up, correction capped at
12 kN so hull strikes still bounce. Pitch is measured from the idle sink, so
drifting down stays level and only a deliberate dive or climb tips the nose.
The mouth's return trigger is now half the climb rate (it was a fixed 1 m/s).

### 3. Chase camera: low / medium / high

`CHASE_ANGLES` in `src/vehicle/camera.js` — pitch offsets and distance scales
on each rig's own framing, so the pocha and the van keep distinct framings.
**V** / **D-pad up** cycles (`camAngle` in input.js); the choice persists in
`localStorage['snack-attack-chase-angle']`. From the cab, V drops to the chase
at the current angle.

### Verification

- **Headless harness** (Node, stub DOM, the real `dive.js` / `the-drain.js` /
  `submarine.js`; kept in a session scratchpad, not the repo): it caught a
  one-frame stall at the whirlpool → Drain handover (~1200 m/s², the last
  circling step was clamped). Fixed by handing the leftover step time to the
  Drain; the seam now measures 29–41 m/s², about the circling's own centripetal
  load (v²/r ≈ 28). Speed across the seam 20.2 → 20.3 m/s; the pool stays in the
  river for headings 0 / ±0.35 at 10–20 m/s; the look swaps with the camera at
  y = −0.35; the return gap is 0; sub speeds and pitch are as listed above.
- **Browser:** the whirlpool was rendered on the river and screenshotted from the
  outside shot's vantage — it reads as a plughole.
- **Not verified live:** the full ramp → whirlpool → cab sequence was never
  watched end to end. The preview ran far below real time, and another chat's
  dev server kept hot-reloading the page. Watch one real jump before trusting
  the shot framing or the blend timings.
