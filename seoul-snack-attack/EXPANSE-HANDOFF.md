# Seoul Expanse — implementation handoff

> **Superseded in part by [CITY-REBUILD.md](CITY-REBUILD.md) (2026-09-09).**
> The "redesign from a reviewed 2D plan" task this document lists as the
> recommended next step is underway and past its first two milestones: the
> Expanse now has a generated 299-junction street network and 1,212 building
> lots, reviewable as a drawing via `npm run plan` or Quick Start `[5]`.
> Nothing below has been replaced in the running game — `?world=expanse` is
> still the 25-node/35-edge layout described here — but the guardrails and
> district contracts in this document remain authoritative for the rebuild.

**Updated:** 2026-09-04  
**Status:** Recovery complete. Live `?world=expanse` is restored to the last
validated 25-node/35-edge, 1,000 × 720 m playable runtime. The direct
74-node/113-edge GLB substitution was rejected because routing connectors became
physical roads and widened carriageways conflicted with massing and spawn. Its
adapter files remain isolated reference work and are not imported by the live
city. The default procedural city is unchanged.

## Product intent and user decisions

- Build a Seoul/GTA-style open world around the project's existing driving and Sketchbook-inspired on-foot locomotion.
- Preserve the current vehicle handling, on-foot feel, jumping, camera, and vehicle enter/exit flow.
- The map must support sustained full-speed driving without forcing hairpin turns.
- Work in visible milestones. Run major layout, handling, traffic, or art-direction changes past the user before propagating them.
- Texture diffusion is optional and can come later. The current procedural material lane must remain viable.
- The user requested, then rejected, a direct trial of the original rich
  blueprint using:
  - 85% of its 1,000 × 720 m X/Z footprint, yielding 850 × 612 m;
  - 125% of its authored carriageway widths;
  - the high-speed orbital road and three-bridge structure;
  - the station/market vertical-slice art language;
  - propagation of distinct identities across all six districts.
- Do not reactivate that trial wholesale. Any future attempt needs a reviewed
  2D road plan and explicit separation between routing connectors and rendered
  carriageways before scale/width tuning is applied.

## What exists now

Launch:

```text
http://127.0.0.1:5273/?world=expanse&intro=off
```

Windows users can double-click `Quick Start.cmd`: its launch menu defaults to
Expanse and also exposes full-map review, mobile/performance QA, and the classic
procedural city. `npm run quickstart` defaults directly to Expanse.

The current live world contains:

- 1,000 × 720 m playable bounds, metres/Y-up, north = -Z.
- A coherent 25-node/35-edge route graph with a 22 m ring, three river
  crossings, six frozen districts and verified road/building clearance.
- 18 primary and 98 secondary buildings, 20 parked cars, 49 trees, six bus
  shelters, fixed storefronts and complete road/tunnel/bridge art.
- Eight pickup sites, 18 delivery anchors and safe road reset projection.
- The normal delivery/order loop, routing, rain, lighting, vehicle, on-foot
  systems, heading-up minimap, and the north-up full-city map.
- `M` toggles the full-city map and `Escape` closes it. Opening the map releases
  pointer lock and pauses driving, touch input, and order progression. Master
  mute is available in the cassette deck instead of on `M`.

The isolated rich adapter still validates its source graph mathematically, but
that does not make it a playable road/massing plan. Do not use `blueprint-check`
alone as authorization to switch the runtime again.

## Architecture

### Active authoritative layout

`src/world/expanse-layout.js`

- Owns live bounds, river, districts, 25 nodes/35 edges, primary massing,
  landmarks and spawn. Runtime and `expanse-check` consume the same records.
- `_source-assets/world/seoul-expanse/`, `expanse-blueprint.js` and
  `expanse-rich-runtime.js` are quarantined reference/prototype inputs only.

### Runtime world contract

`src/world/expanse-city.js`

- Implements the same city API consumed by the current vehicle, character, orders, camera, weather, lighting, and HUD systems.
- Builds the validated road, primary/secondary-building and dressing collision
  into one `three-mesh-bvh` index in a worker.
- Uses Expanse-specific fog distances; the compact-city fog erased kilometre-scale sightlines.
- Currently exposes one logical tile. This is acceptable for the present geometry count but is not the final streaming design.

### Active procedural art modules

`src/world/expanse-dressing.js`, `expanse-street-life.js`,
`expanse-shops.js`, and `expanse-road-art.js`

- These modules supply the current façades, density, street life, shops, road
  markings, tunnel and bridge identities. Their hardcoded bindings match the
  active 25-node layout and pass the current clearance gate.

### Fixed restaurant storefronts

`src/world/expanse-shops.js`

- Eight fixed shop bindings produce carriageway dwell points, curbside façades
  and bilingual signs. Eighteen delivery anchors are derived across all six
  districts, and reset positions project to the active road graph.

### Visual chunks and LOD

`src/world/expanse-chunks.js`

- The 4 × 3 grid partitions the 1,000 × 720 m bounds into 12 cells of
  250 × 240 m. Secondary buildings and street life use its base/detail/micro
  groups; collision remains one global BVH.
- Desktop defaults: 720 m base visibility, 260 m detail visibility, approximately 146 m micro visibility.
- Mobile defaults: 280 m base visibility, 160 m detail visibility, approximately 70 m micro visibility.
- The explicit aerial `?overview=1` QA camera raises both base and detail distance to show the complete map. District review cameras retain gameplay LOD.
- `?stats=1` reports live `chunks visible/total`, detail count, and micro count.
- Do not split collision by chunk without new profiling evidence. Current full-speed and on-foot probes are healthy, and a visual optimization should not multiply physics seams.

### Full-city map

`src/ui/city-map.js`

- A north-up, whole-city overlay renders the live graph, districts, curved
  river, shops, delivery anchors, active route/target and player heading.
- `M` toggles it, `Escape` closes it, and `?map=1` opens it for QA. The overlay
  releases pointer lock and participates in the shared pause state so physics,
  touch controls and order progression resume correctly after closing.

### Selection and review cameras

`src/main.js`

- `?world=expanse` selects the world without changing the default `proc` mode.
- Review cameras:

```text
?world=expanse&expanseView=station&intro=off&time=day&rain=off
?world=expanse&expanseView=market&intro=off&time=day&rain=off
?world=expanse&expanseView=bridge&intro=off&time=day&rain=off
?world=expanse&expanseView=hills&intro=off&time=day&rain=off
?world=expanse&expanseView=hongdae&intro=off&time=night&rain=off
?world=expanse&expanseView=hangang&intro=off&time=day&rain=off
?world=expanse&expanseView=pocha&intro=off&time=night&rain=off
```

## Validation baseline

Required narrow gate:

```bash
npm run blueprint-check
npm run expanse-check
npm run build
```

`expanse-check` protects the live 1,000 × 720, 25/35 layout, its 18 delivery
anchors, shops, density, road art and 28-prop review slice. It also runs the
isolated `blueprint-check` so the rejected source adapter remains internally
consistent; those 74/113 assertions are not runtime approval.

Latest runtime smoke results:

- Recovery production build: passed, 153 transformed modules; the quarantined
  source visual GLB is no longer emitted.
- Fresh browser load: no console errors.
- Recovery browser state reports 1,000 × 720 bounds, 18 primary buildings,
  eight shops, 18 delivery anchors and 25 nodes / 35 edges.
- Spawn is visually clear and physically grounded on all four wheels.
- `expanse-rich-city-map.png` / `expanse-rich-overview.png` document the rejected
  trial and must not be used as target art.

Useful smoke URLs:

```text
?world=expanse&intro=off&props=off&time=day&rain=off&auto=1&stats=1
?world=expanse&intro=off&props=off&time=day&rain=off&mode=foot&stats=1
?world=expanse&overview=1&intro=off&props=off&time=day&rain=off&stats=1
?world=expanse&intro=off&props=off&time=day&rain=off&map=1
```

## Review captures

Current captures live in `_work/`:

- `expanse-recovered.png` (current playable spawn)
- `expanse-rich-city-map.png`
- `expanse-rich-overview.png`
- `expanse-density-overview-day.png`
- `expanse-density-station-day.png`
- `expanse-density-hongdae-night.png`
- `expanse-density-hangang-day.png`
- `expanse-density-pocha-night.png`
- Earlier milestone images use the `expanse-slice-*` and `expanse-district-*` prefixes.

`expanse-recovered.png` and the density/slice/district captures represent the
active playable lineage. The `expanse-rich-*` captures document the rejected
trial only. These are QA captures, not marketing shots.

## Remaining work, in recommended order

### 1. Redesign scale/width from a reviewed 2D plan

- Do not resize the whole runtime again first. Produce a readable 2D plan that
  distinguishes physical roads from route-only connectors and get user review.
- Apply scale and width to road/building/spawn/shop/prop contracts together,
  then gate every clearance before switching `?world=expanse`.
- Compare 0.85, 0.88 and 0.90 in review mode without changing vehicle handling.

### 2. Revalidate props and detailed road art

- The authored GLB supplies static street furniture now. Port any desired
  pieces from the historical procedural dressing/prop passes by road projection,
  not by copying old coordinates.
- Re-run rich-graph clearance before enabling dynamic props in normal play.
- Any new custom Blender model requires `tools/blender/previews/<id>.png` and
  must be shown in the report.

### 3. Terrain and perimeter containment

- Replace the flat terrain sheet with authored height zones that do not change approved road grades.
- Add shoulders/containment at the world perimeter using the recoverable boundary doctrine from the compact city.
- Textures can remain procedural; downloaded/diffused variants should be optional debug choices.

### 4. Traffic and pedestrians — requires user approval

No ambient traffic or pedestrian simulation exists yet.

- First propose density, spawn/despawn distance, collision consequence, and whether traffic follows Korean right-hand road conventions.
- Keep the high-speed ring readable; traffic must not turn the approved fast loop into stop-and-go congestion.
- Pedestrians need safe sidewalk/nav zones and must not share the vehicle road graph blindly.
- This is a major gameplay change and must be run past the user before implementation.

### 5. Atmosphere and audio zones

- District ambience: quieter ridge, Hongdae nightlife, market griddles, Hangang water/wind, Pocha crowd noise.
- Add rain occlusion only after tunnel/covered spaces have reliable bounds.
- Tune night practical-light pools per chunk rather than increasing global light count.
- Preserve the approved amber night stage and three HUD accent roles.

### 6. Final QA and release work

- Full route traversal in both directions, every bridge, every reset point, every shop, and on-foot exit/entry at representative curbs.
- Mobile graphics/load smoke, wet/night/day, both vehicles, order acceptance/delivery, garage swap, and save persistence.
- Run the full `npm run check` after Expanse work stabilizes; use `expanse-check` during iteration.
- Update `README.md`, this document, and `handoff.md` with final agreed settings when the user declares the work finished.

## Guardrails

- Do not change the trial road footprint, bridge count, map bounds, district IDs,
  or vehicle/on-foot handling without user approval.
- Do not narrow the ring or replace its source curves with intersections/hairpins.
- Preserve metres/Y-up/north=-Z.
- Do not restore global compile/upload spikes during boot.
- Preserve user changes and avoid destructive repository operations.
- Keep new street solids inside the clearance validation lane.
- Check asset licensing before importing external models or textures.

## Recommended immediate next task

Create and review a clean 2D plan with real roads separated from routing-only
connectors. Only then build a non-live scaled prototype with spawn and clearance
validation before replacing the active Expanse.
