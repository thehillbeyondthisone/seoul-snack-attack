# Seoul Expanse — overnight Blender swarm brief

Copy everything below the divider into the Minimax swarm. It is intentionally
written as an execution contract rather than an art-direction mood board.

---

You are an overnight, headless-Blender production swarm building the new open
world for **Seoul Snack Attack**, a browser-based Three.js driving and on-foot
delivery game. Coordinate your subagents; do not let them independently invent
incompatible districts. Produce a phenomenal, original, game-ready Korean city
that feels like a compact GTA-style open world without copying GTA geometry,
branding, maps, or other protected content.

## Outcome

Build a coherent **1,000 m east-west × 720 m north-south** Seoul-inspired city
where a 90 km/h vehicle can remain at full speed for meaningful stretches.
The present map is only about 284 × 212 m and its longest road segment is 42 m.
This replacement must have a fast, legible arterial loop with 200–400 m runs and
sweeping bends, while preserving dense walkable food streets inside that loop.

The world is not a random megacity. It is one memorable game level with a clear
road hierarchy, skyline silhouettes, shortcuts, districts, landmarks, and a
continuous delivery circuit.

## Non-negotiable coordinate contract

- Blender and runtime units are metres.
- Y is up.
- North is **-Z**, south is +Z, east is +X, west is -X.
- World centre is (0, 0, 0).
- Intended playable bounds: X -500..+500, Z -360..+360.
- Primary road surface datum is Y = 0.
- Apply transforms before export. Scale must be (1,1,1).
- Mesh origins remain near their owning chunk; never export the whole kilometre
  world as objects whose origins are thousands of metres away.
- Face normals point outward. No duplicate coplanar surfaces or zero-area faces.
- +Z is the canonical forward axis for vehicles and directed marker empties.

## The layout — build this exact spatial idea

### 1. The high-speed Seoul ring

The main drive is a rounded rectangular/asymmetric loop approximately 2.5 km
around. It is the player's mental map and the route on which the vehicle can stay
fast.

- West run: centred around X=-405, from Z=-205 to Z=+150.
- North run: from roughly (-330,-275) through (0,-300) to (+320,-255).
- East run: centred around X=+410, from Z=-180 to Z=+150.
- South/river run: from (+330,+225) through (0,+205) to (-335,+220).
- Join the runs with broad asymmetric curves. Minimum centreline radius 80 m;
  preferred 95–130 m. There must be no hairpin, sudden 90-degree corner, or
  roundabout on the high-speed loop.
- Target 18–22 m total paved width: two lanes each direction where appropriate,
  a modest median or painted separator, and 1.5–2.5 m shoulders.
- Grade below 4.5%; crossfall subtle. Underpasses require 5.2 m clearance.
- Use long sightlines, overhead Korean direction signs, tunnel mouths, retaining
  walls, sound barriers, lamps, and wet reflective asphalt to sell speed.
- Give the ring three optional cinematic features: a 160–220 m shallow tunnel in
  the north-east, a short elevated west interchange, and a riverside expressway
  stretch in the south. All remain drivable in one unbroken loop.

### 2. The central spine

An iconic 16–18 m boulevard runs near X=0 from the northern hills at Z=-270,
through the station at Z=-70, through the market centre, and to the river at
Z=+180. Keep at least two 180 m sightline segments. Intersections may use large
signalised junctions, but the through alignment must remain visually obvious.

At (0,-65), build an original Seoul-station-inspired transit hall and forecourt,
not a replica. The forecourt is readable from the ring and becomes a navigation
landmark. An elevated rail/metro line may cross east-west nearby, with 5.2 m road
clearance and believable supports kept out of lanes.

### 3. River and bridges

A stylised Hangang-like river/canal occupies approximately Z=+115..+205. It may
vary in width, with quays and parks, but never becomes a flat rectangular trench.

- Main bridge at X=0 continues the central boulevard.
- West bridge around X=-245 is a broad road link into Hongdae/market routes.
- East bridge around X=+235 connects pocha streets to the eastern ring.
- Bridge approaches use 70 m or larger horizontal curves and gentle grades.
- Include pedestrian riverside paths, stairs/ramps, flood walls, convenience
  kiosks, exercise space, and under-bridge pocha activity.
- Water is a dedicated simple surface; do not bake reflections into textures.

### 4. Interior road hierarchy

Inside the fast loop, create a connected network rather than a uniform grid.

- Secondary arterials: 12–15 m paved width, 90–180 m between major junctions.
- Local commercial streets: 7–10 m paved width, 55–95 m blocks.
- Food alleys: 4.5–6.5 m, short and walkable, but never required for a through
  route or the only connection between districts.
- Sidewalks: continuous, normally 2.5–4 m, minimum 1.8 m at a deliberate pinch.
- Kerb height 0.10–0.14 m. Provide dropped kerbs at every marked crossing.
- Every primary/secondary road belongs to a cycle. No routing bridge edge and no
  mandatory dead end. Service alleys may dead-end only if marked non-routeable.
- Supply at least eight shortcuts: market arcade, petrol station forecourt,
  riverside underpass, station taxi loop, construction cut-through, two alleys,
  and one parking structure ramp. Each shortcut must be readable and physically
  wide enough for the 5 m pocha truck.

## Six frozen district identities

Use these exact ids in metadata. Their display styling is creative, but the ids
must never change.

1. `hills` — north, roughly Z -360..-185. Steep retaining walls, villas, stairs,
   pocket viewpoints, darker vegetation, radio/observation silhouette. Roads are
   winding but not hairpins; the high-speed ring skirts the base rather than
   climbing the tightest streets.
2. `hongdae` — west/north-west, X -500..-95 and Z -230..+55. Music basements,
   clubs, murals, fashion shops, compact mixed-use blocks, rooftop clutter and
   strong magenta/cyan nightlife. Keep branding fictional and Hangul plausible.
3. `station` — centre/north-centre, X -115..+120 and Z -210..+35. Transit hall,
   bus/taxi lanes, hotels, offices, broad crossings, median trees and long views.
4. `market` — centre/east-centre, X +70..+350 and Z -80..+105. Covered market
   seams, snack storefronts, delivery loading bays, a driveable plaza edge and
   dense signs. This is busy and tactile, not an indoor mall.
5. `hangang` — southern river band, X -500..+500 and Z +85..+285. Bridges,
   quays, flood walls, parks, apartment skyline, convenience culture and the
   fast riverside road.
6. `pocha` — south-east, X +115..+500 and Z +35..+260. Tent bars, late-night
   food street, under-bridge tables, motel/service blocks and warm practical
   lighting. Keep the expressway clear even when the local street feels crowded.

Blend district borders across one or two blocks; do not create six theme-park
islands. A driver at speed should identify districts from massing, road furniture,
light temperature and one skyline landmark before reading a sign.

## GTA-like qualities, interpreted correctly

- Dense authored routes, landmark navigation, believable back-of-house space,
  shortcuts, vertical layering, service access, parked traffic, and cinematic
  reveals—not copied missions or architecture.
- Buildings need convincing ground floors and silhouettes. Upper floors may use
  efficient modular kits and atlases.
- Design both at 90 km/h and at walking speed. From a car: big silhouettes,
  readable turns and luminous signs. On foot: doors, kerbs, awnings, utility
  boxes, stairs, loading bays and human-scale clutter.
- Preserve 2.0 m clear pedestrian corridors and 1.2 m × 2.2 m clear zones beside
  plausible vehicle doors so enter/exit gameplay is not blocked everywhere.
- Make roofs believable from elevated roads: HVAC, tanks, railings, signs and
  varied parapets, but instance repeated clutter.

## Visual direction

- Rainy late night Seoul: warm sodium/amber street stage, cool teal navigation
  accents, red-orange urgency accents, dark wet asphalt and selective neon.
- The game's semantic accents are fixed: red-orange means urgency/damage,
  cream-gold means money only, teal-cyan means navigation/interaction. Do not
  flood ordinary architecture with cream-gold UI colour.
- PBR materials: Principled BSDF only. Sensible roughness and restrained metal.
- Roads need macro variation, patched asphalt, manholes, lane wear and puddle
  logic, but no uniquely baked kilometre-scale 8K texture.
- Hangul should be plausible and intentionally composed. Use fictional business
  names; no real logos, brands, scraped street imagery, copyrighted characters,
  or unlicensed model packs.
- Model an original world. Do not use Sketchfab dumps, game rips, Google imagery,
  or assets whose redistribution licence is unknown.

## Game-ready performance contract

This is a WebGL/Three.js game and must remain viable on mobile.

- Divide the city into deterministic 100–150 m chunks with stable ids.
- Prefer instanced modular buildings over unique monoliths.
- Each ordinary building kit: preferably under 15k triangles before LOD.
- Each hero landmark: preferably under 60k triangles before LOD.
- Target under 800k visible triangles from a normal desktop street view and
  under 350k in a mobile LOD view.
- Provide LOD0/LOD1/LOD2 for hero buildings and repeated high-cost modules.
- Use shared 1K/2K texture atlases and trim sheets. Avoid hundreds of materials.
- Aim for no more than 96 global material roles and far fewer per chunk.
- Collision is a separate, watertight, low-detail surface. Target below 250k
  collision triangles for the entire world; roads/sidewalks should be broad
  simple slabs, walls simple boxes/planes, and tiny props excluded.
- Decorative props smaller than 0.35 m do not collide unless gameplay-critical.
- Do not export Blender lights as the primary lighting rig. Runtime owns lights,
  fog, wetness and time of day. Emissive meshes may be exported with named roles.
- Do not bake rain, bloom, fog, reflections or colour grading into albedo.

## Swarm coordination

Use a coordinator-led build. More parallel agents are not automatically better.
Assign non-overlapping ownership and enforce the shared contract.

Suggested lanes:

1. master road/terrain/river topology;
2. one owner for each of six districts;
3. station and landmark kit;
4. bridges/tunnel/elevated-road kit;
5. modular building kit and LODs;
6. road markings/signage/furniture kit;
7. storefront and Hangul kit;
8. vegetation/riverfront kit;
9. collision and navigation metadata;
10. texture atlases/material QA;
11. optimization/merge/export;
12. automated geometry and visual validation.

Every agent writes only inside its assigned source collection or temporary file.
One integration owner merges the final `.blend`. Never have 128 agents modify
one Blend file concurrently. Prefer many small deterministic outputs plus one
controlled assembly pass.

## Required Blender collection and naming contract

Master file collections:

- `EXP_VISUAL`
- `EXP_COLLISION`
- `EXP_ROADS`
- `EXP_SIDEWALKS`
- `EXP_BUILDINGS`
- `EXP_LANDMARKS`
- `EXP_PROPS_STATIC`
- `EXP_WATER`
- `EXP_MARKERS`

Object prefixes:

- `CHUNK_<x>_<z>__...`
- `COLLIDER__...`
- `ROAD__<class>__...`
- `SIDEWALK__...`
- `LANDMARK__...`
- `EMISSIVE__<role>__...`
- `SPAWN__...`
- `PICKUP__<restaurant_id>`
- `DROPOFF__<id>`
- `ROADNODE__<id>`
- `ROADEDGE__<id>`

Marker empties must be exported and face their intended +Z direction. Provide:

- one `SPAWN__PLAYER` on the central boulevard;
- one `SPAWN__VEHICLE` with 8 m forward clearance;
- at least 8 named pickup markers matching `tteokbokki`, `hotteok`, `eomuk`,
  `gimbap`, `chimaek`, `bingsu`, `gilgeori`, and `pocha`;
- at least 24 drop-off markers distributed across all districts;
- at least 12 safe vehicle-reset markers on major roads;
- road nodes/edges for every routeable primary and secondary segment.

## Deliverables

Write source work under:

`_source-assets/world/seoul-expanse/`

Required outputs:

1. `seoul-expanse.blend` — clean master, packed or with relative texture paths.
2. `seoul-expanse-visual.glb` — visuals, chunk names, LOD names, marker empties.
3. `seoul-expanse-collision.glb` — collision only, no materials/textures needed.
4. `seoul-expanse-roadgraph.json` — nodes, bidirectional edges, widths, classes,
   district ids and edge polylines in runtime coordinates.
5. `seoul-expanse-landmarks.json` — spawns, pickups, drop-offs, reset points,
   chunk bounds and district bounds.
6. `seoul-expanse-manifest.json` — units, axis contract, bounds, triangle counts,
   material counts, texture list, chunk list, Blender version and build seed.
7. `LICENSES.md` — list every input and licence. Ideally all geometry/textures
   are original procedural work; say so explicitly.
8. Preview PNGs: one for every custom kit/model at
   `tools/blender/previews/<id>.png`, plus overall `seoul-expanse-overview.png`,
   `seoul-expanse-ring-night.png`, `seoul-expanse-street-night.png`,
   `seoul-expanse-street-day.png`, and one image per district. A model without a
   preview is unfinished.

Road graph JSON shape:

```json
{
  "units": "metres",
  "north": "-Z",
  "nodes": [{"id":"station_n","position":[0,0,-160],"district":"station"}],
  "edges": [{
    "id":"station_spine_01",
    "a":"station_n",
    "b":"station_s",
    "class":"arterial",
    "district":"station",
    "width":16,
    "oneWay":false,
    "routeable":true,
    "points":[[0,0,-160],[4,0,-40],[0,0,80]]
  }]
}
```

## Automated validation before declaring success

- Open the master with Blender headless and save again without missing files.
- Export both GLBs headlessly from a clean process.
- Confirm metre scale, bounds, axes, finite transforms and no negative unapplied
  scales.
- Confirm no NaN vertices, zero-area faces, non-manifold collision holes,
  accidental duplicate objects, or texture paths outside the deliverable tree.
- Confirm every routeable node has degree at least 2.
- Remove each routeable edge in turn and ensure its endpoints remain connected;
  primary/secondary navigation must contain no bridge/dead-end dependency.
- Confirm every high-speed ring curve radius is at least 80 m, every ring lane is
  at least 3.2 m wide, and every overhead clearance is at least 5.2 m.
- Drive a simulated 2.7 m-wide, 5.0 m-long vehicle envelope around the entire
  ring and through every required shortcut without collision.
- Sweep a 0.32 m-radius, 1.72 m-high upright capsule along all designated
  sidewalks and crossings; flag discontinuities, low ceilings and blocked doors.
- Confirm all pickup/drop-off/reset markers have verified ground below and clear
  approach space.
- Produce a report containing per-chunk triangles, materials, texture memory,
  collision triangles and any budget exception with justification.
- Render all required previews at both night and day where specified. Inspect
  silhouettes, lane continuity, floating props, z-fighting, light leaks and
  obvious repetition. Fix issues, rerun validation, and only then finish.

## Final decision rule

Do not trade navigability or performance for decorative density. The world is
successful when a first-time player can recognize the ring, station, river,
Hongdae, market and pocha district from the road; drive at full speed without
hairpins; leave the vehicle and walk continuously through convincing streets;
and the exported package can be integrated without opening Blender manually.

Work autonomously overnight. When ambiguity is minor, choose the option that
improves high-speed readability, on-foot continuity, originality, deterministic
rebuilding and browser performance. Report exact outputs and validation results.

---
