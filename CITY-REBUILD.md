# Seoul Expanse — city rebuild (M1–M6)

**Updated:** 2026-09-09
**Status:** M1, M2, M3 and M4 complete and gated. M5 not started.
**Live game is unchanged.** `?world=expanse` still runs the 25-node greybox and
`?world=proc` still runs the compact procedural circuit. The rebuild is now
drivable at `?world=expanse2`, alongside them, and replaces neither until M6.

---

## Why this exists

The Expanse had the right bones and no city. It carried a validated ring, three
bridges, a river and six districts across 1,000 × 720 m, but its buildings were
**18 hand-typed mass boxes** in an array in `expanse-layout.js` plus about 98
rule-placed secondaries. Measured in the browser, the whole Hongdae district
view drew 30k triangles and the entire overview 59k — against 197k for the
compact `?world=proc` circuit covering one twelfth of the area. It read as a
racetrack in a field.

The compact circuit, meanwhile, looks right and is too small: 264 × 192 m.

Every previous attempt failed the same way — by trying to **author** a
kilometre of city (hand-typed coordinate arrays, the overnight Blender swarm,
the rejected 74-node GLB substitution). The rebuild generates it instead, using
the compact circuit's own approach at the Expanse's scale.

**The missing step, in one sentence:** nothing turned a road network into
blocks, blocks into lots, and lots into buildings. M1 and M2 are that step.

---

## Milestones

| | Deliverable | Gate | State |
| --- | --- | --- | --- |
| **M1** | Interior street generator, 2D street plan | `expanse-streets-check` | done |
| **M2** | Blocks and building lots, full city plan | `expanse-blocks-check` | done |
| **M3** | Greybox massing behind `?world=expanse2` | `expanse-massing-check` | done |
| **M4** | Façades, signage atlas, colour bible, lighting | `expanse-facade-check` + visual QA | done |
| **M5** | Landmarks, shops, delivery loop | route + anchor gate | next |
| **M6** | Perf/LOD/mobile, full `npm run check`, promote | full suite | not started |

Each milestone is reviewed before the next begins, and nothing replaces
`?world=expanse` until M6.

---

## What M4 produced

The first milestone that looks like Seoul. Every one of M3's 1,211 grey boxes
now carries paint, windows, a shopfront, signage and a roofline, and the six
neighbourhoods read apart from a moving van.

| | |
| --- | ---: |
| Buildings dressed | 1,211 |
| Shopfronts | 1,052 |
| Lit signs | 3,006 |
| — fascia boards / blade signs | 1,661 / 830 |
| — wall banners / roof signs | 476 / 39 |
| Awnings | 757 |
| Parapets | 618 |
| Air-conditioners | 1,986 |
| Visible triangles, whole city | 128,172 |
| Worst four-chunk view (mobile) | 70,176 |
| Collision triangles | 37,226 — **unchanged from M3** |
| Draw calls | 146 merged meshes |
| Materials | 22 |
| Texture pool | 35.7 MB desktop, 8.9 MB mobile |

### The colour bible replaced the table

M3 shipped six hand-written district hues and a note saying M4 would delete
them. It has. A building's paint is now
`districtFacadePaint(district, index, tone)` in `data/color-bible.js`: one of
the district's own four facade paints, pulled `FACADE_GLOW_MIX` (a quarter) of
the way toward that district's own `glow` — the signature light hex no two
neighbourhoods share — then given a per-building value jitter.

That is why market and pocha can keep the same terracotta and still read apart:
they do not live under the same light. The closest pair of district means is
now hills/market at 75 on a redmean scale where 40 is "unmistakably different",
and the gate asserts it rather than trusting it.

The rule also refuses to produce a HUD accent. The bible reserves gold for
money, cyan for navigation and red-orange for urgency, and pulling Hotteok
Market toward banana-milk gold occasionally landed a wall on the money colour.
`clearOfHud()` darkens such a paint a step at a time until it is clear —
darkening because every accent is a bright saturated hue, so a step down in
value keeps the neighbourhood and loses the impersonation.

### Two sheets, not a thousand textures

Nothing is textured per building. The whole city runs on 13 generated canvases:

- **A wall sheet per district**, 25.6 × 25.6 m — eight window bays by eight
  storeys, tileable, painted once as albedo and once as emissive so night lights
  the windows and day merely warms them. The albedo is near-white where the wall
  is, because the building's own paint rides in the mesh's vertex colours and
  multiplies it.
- **A shopfront sheet per district**, 8.0 × 4.2 m — two shop units, exactly one
  podium high, so a ground floor never stretches and a wide plot gets *more*
  shops rather than wider ones. Roughly one unit in six is shuttered, which is
  what stops 1,052 lit windows reading as a stage set.
- **One roof sheet** and **one 2048 × 1024 signage atlas** for the whole city.

Variety comes from UVs, not from textures. A wall's `u` runs continuously around
the building's own perimeter and its `v` with world height, both divided by the
sheet's size **in metres**, with a whole-bay and whole-storey offset per
building. So a window band carries around a corner instead of restarting at it,
window rows land on floor lines at every height, and no two neighbours align.

### The signage atlas

32 cells: eight neon tubes from the bible's kit, two Korean words each, in two
shapes — a 4:1 fascia board and a 1:4 blade sign, matching the metres the mesh
gives them so no sign is ever stretched. The layout lives in
`data/expanse-signage.js` with no canvas and no three.js, which is what lets the
Node gate assert that every sign in the city references a real cell whose tube
is on its own district's list. `expanse-sign-art.js` paints the pixels in the
browser, in real Hangul, in whatever CJK face the device has.

The words are the food the order system sells. A player learning "the red sign
is tteokbokki" is learning the menu.

Because the atlas backing is painted near-black, it serves as both `map` and
`emissiveMap`, and a sign can be an ordinary opaque box merged into one mesh per
chunk rather than a sorted transparency.

### Projection is the part that can break the game

Everything that stands off a wall is measured against the same road index M3
settled the footprints on:

- **Awnings** hang at head height, so they end inside the pavement. Depth is cut
  to the measured clearance less 45 cm; the tightest in the city keeps 37 cm.
- **Blade signs** are the one element allowed over the carriageway, because they
  hang above anything that drives under. `OVERHANG_CLEAR` is 4.6 m — a real
  Seoul soffit height, clearing the 2.7 × 5.0 m pocha truck and an on-foot
  player with the margin a road tunnel would give. All 830 of them are at it or
  above it.
- **Nothing** reaches more than 1.4 m past its own building line.

Facade furniture is never collidable. A blade sign is not a wall, and putting
8,000 more elements into the BVH would cost the phone build for nothing — which
is why the collision figure above is M3's, to the triangle.

### Lighting

Streetlights take their colour from the district they stand in, using the same
`glow` hex the facade rule paints with, so a neighbourhood's light and its walls
agree. Windows, shop interiors and signage all ride the existing day/night
`emissiveBoost`; they are baked at different brightnesses on purpose, so one
multiplier lands right on a lit room and on a neon tube at the same time.

---

## What M3 produced

The first milestone you can drive. `?world=expanse2` boots the generated city:
299 junctions, 452 roads, 143 blocks and 1,211 greybox buildings, with working
collision, a routeable graph and the delivery loop running on it.

| | |
| --- | ---: |
| Buildings massed | 1,211 of 1,212 lots |
| Massing volumes | 2,952 |
| Mean storeys | 4.9 (3.2 m floor pitch) |
| Tallest / median | 49.1 m / 17.1 m |
| Floor area | 484 × 10³ m² |
| Pavement pads | 141 |
| Visible triangles, whole city | 39,162 |
| Collision triangles, whole world | 37,226 |
| Draw calls | 51 merged meshes |
| Materials | 12 |

Every one of those budgets has an order of magnitude of headroom against the
contract (800k visible, 350k mobile, 250k collision), because a greybox box is
twelve triangles. The number that mattered was what M4 would add on top of it:
in the event, façades and signage took the city from 39k visible triangles to
128k and collision not at all.

### Two things the runtime does differently

**Collision is the ground, not the roads.** 452 carriageways overlapping at 299
junctions cannot all be collision slabs without either z-fighting or a
centimetre step at every junction. The drivable surface is four flat quads;
roads are paint lifted above them by class (widest lowest), and the kerbs come
from the pavement pads. Bridge decks are the exception and are real collision,
because they are the only way across the water.

**The river is a hole.** The ground quads are cut around the channel, so
driving off the quay is a fall and a reset. The three authored bridges are the
only crossings, which is what the layout always intended.

### The two inherited faults, handled without touching the layout

- `spine_south` has zero length. It stays in the road graph, where it is
  harmless, and paves nothing: the mesh builder skips any edge under 0.5 m.
- `west_bridge` crossing `ring_south_w` at grade no longer z-fights, because
  the two roads are different classes and therefore at different lifts.

Both remain faults in `expanse-layout.js` and are still the user's call.

## What M1 and M2 produced

| | Before | Now |
| --- | ---: | ---: |
| Junctions | 25 | 299 |
| Roads | 35 | 452 |
| City blocks | ~4 | 143 |
| Building lots | 18 + ~98 | 1,212 |
| Shopfronts | — | 1,053 |
| Paved network | 3.4 km | 21.4 km |
| Land >60 m from a road | — | 0.3 % |
| Street metres per building | — | 17.7 |

Per district: hongdae 48 blocks / 404 lots · pocha 31/254 · market 29/229 ·
hangang 13/89 · station 12/103 · hills 10/133.

---

## Running it

```bash
npm run plan            # regenerate the city plan -> _work/expanse-city-plan.svg + .html
npm run plan -- --streets   # street network only (the M1 view)
npm run streets-check   # M1 gate
npm run blocks-check    # M2 gate
npm run massing-check   # M3 gate
npm run facade-check    # M4 gate
npm run expanse-check   # every Expanse gate, including all four of the above
```

`Quick Start.cmd` option **[6] Drive the rebuild** boots `?world=expanse2`.

Review cameras, all `?world=expanse2&expanseView=<id>&time=day&rain=off`:

| id | what it shows |
| --- | --- |
| `plan` | the whole city from 900 m up, against the M1/M2 drawing |
| `massingRing` | down the ring's 175 m west straight |
| `massingHills` `massingHongdae` `massingStation` `massingMarket` `massingHangang` `massingPocha` | eye height down each district's densest street |
| `facadeShop` | standing at a shopfront: glass, fascia board, awning, blade sign |
| `facadeRoofs` | the roofscape of the densest chunk — parapets, ledges, tanks |
| `facadeColour` | three districts at once from 210 m, which is the shot that reviews the colour rule |

The district views are not hand-placed: they were picked by scoring every
street in each district by the massing around it, so they stay pointed at
buildings rather than at whatever used to be at those coordinates. The three
`facade*` views are chosen the same way, by `tools/pick-facade-cameras.mjs` —
run it and paste the numbers into `expanseViews` in `src/main.js` if the seed
ever moves.

`Quick Start.cmd` option **[5] Review the city plan** regenerates the plan and
opens it in a browser. It is a real launch profile (`--launch=plan`), so it
always renders current generator output rather than a stale file.

The plan is written to `_work/`, which is build output. It is regenerated on
demand and is not a source of truth.

---

## Architecture

### `src/world/expanse-streets.js` — the street network

Consumes the approved layout, never edits it. Three rules, each of which exists
because breaking it killed an earlier attempt:

1. **Every edge emitted is a real paved carriageway.** There is no
   routing-only connector class, so a route can never be planned down something
   the mesh builder did not pave. This is exactly what sank the 74-node trial.
2. **Skeleton geometry is preserved exactly.** Cutting a junction into an edge
   interpolates along that edge's own polyline, so ring arcs keep their
   authored curvature. The gate asserts the ring centreline length is unchanged
   to the millimetre (2592.1 m in, 2592.1 m out).
3. **The ring is the least permeable road on the map.** Side streets meet
   arterials wherever they arrive, but reach the ring only at its sparse
   authored junctions — 8 over 2.59 km, one per ~320 m. Nothing crosses it at
   grade.

Pipeline: densify the skeleton into junction chains → grow a per-district
oriented lattice → terminate blocked lattice streets on the arterial they run
into as T-junctions → rescue stranded pockets → prune to a connected,
dead-end-free, bridge-free graph.

Two design decisions here go beyond the original plan and were signed off after
the fact:

- **The city is built on both sides of the ring** (268 roads inside, 140
  outside). Treating the ring as the world edge discarded 270,000 m².
- **A perimeter service road** runs just inside the world boundary. Outer
  streets had nothing to terminate on and were being pruned as dead ends; it
  also supplies the containment edge the handoff wanted. It clears the ring by
  44 m at the nearest point and never meets the river.

### `src/world/expanse-blocks.js` — blocks and lots

1. **Planarise a working copy.** Face-finding needs a graph whose edges meet
   only at junctions. The shipped road graph is never modified.
2. **Walk the half-edges** to recover the bounded faces. Those faces are the
   city blocks; no block is authored anywhere.
3. **Inset each block** by its own surrounding road widths plus a sidewalk, so
   a block facing the 22 m ring pulls back 15 m while its alley side pulls back
   4.5 m.
4. **Subdivide** into lots: a corner plot at every real turn, a run of
   frontages between them, and a courtyard where the block is deeper than two
   buildings.
5. **Settle**: step anything that ended up in a carriageway back onto its
   block, thin the few footprints that still interpenetrate, and drop any plot
   left without a street at its front door.

### `src/world/expanse-massing.js` — buildings

Pure data, no three.js. One rule makes the clearance gate cheap: **every volume
a lot produces stays inside that lot's own footprint prism.** Podiums fill the
plot, upper volumes only step inward, roof furniture is clamped to what is
left. M2 already proved no lot stands in a carriageway, so nothing extruded
from one can either.

1. **Settle the footprint.** M2's inset reserves a pavement against the road a
   plot *fronts*; a corner plot's flank can still land hard against the street
   it turns onto. This works out how far each of the four sides has to come in
   and rebuilds the rectangle, so the plot stays a rectangle. 239 plots were
   trimmed, costing 1,063 m² of footprint between them; one plot could not be
   freed at all and is not built.
2. **Height.** District range from the colour bible, multiplied by the class of
   road it fronts (ring 1.24 down to alley 0.86), corner plots 1.1, a small
   per-district share promoted to a local high point, then capped by the plot's
   own narrowest side so a 4.5 m hongdae frontage cannot become a pencil.
   Snapped to whole 3.2 m storeys over a 4.2 m ground floor.
3. **Stack.** Podium, a shaft stepped back 0.35 m at the sides and 0.45 m from
   the street so the shopfront keeps the pavement, a further cap on the tall
   ones, and a roof box on 42 % of them.
4. **Pavement.** One raised pad per block, from the kerb line inward, at 0.12 m.
   That is where every kerb in the city comes from.

The kerb line itself is M2's — `block.kerb`, the same per-vertex offset as the
building line, stopped at the carriageway instead of past the sidewalk. It
needed a settle pass of its own: `insetPolygon` averages the two offset lines
wherever a corner is too shallow to mitre, which at the building line a
sidewalk absorbs and at the kerb line put 24 pad corners in the asphalt, one of
them 6.2 m in. They are nudged back out along the road normal; two blocks are
slivers wedged between junctions where no nearby point is clear of both roads,
and they simply go without a pavement.

### `src/world/expanse-facades.js` — what every building wears

Pure data, no three.js and no canvas, so the gate and the runtime consume
identical records. Three decisions, in the order each constrains the next:

1. **Paint** — the colour-bible rule above, plus a per-building value jitter.
2. **Frame** — where on the shared wall sheet this building samples, in whole
   bays and whole storeys. A fractional offset would put a window sill halfway
   through a floor slab on every wall in the city.
3. **Furniture** — awnings, fascia boards, blade signs, banners, roof signs,
   parapets and air-conditioners. Everything that projects is clamped against
   the road index, which is the half of this module that can break the game.

Per-district grammar lives in `DISTRICT_FACADE_RULES`, but the two numbers that
decide how loud a street is are deliberately *not* there: `signChance` and
`shopChance` come from the colour bible, so retuning a neighbourhood there
retunes its signage with it.

### `src/world/expanse-facade-art.js` and `expanse-sign-art.js` — the pixels

The browser half. Canvases only; neither is imported by the gate. `-art` owns
the per-district wall and shopfront sheets plus the roof sheet;
`expanse-sign-art.js` paints the signage atlas that `data/expanse-signage.js`
lays out.

### `src/world/expanse-facade-mesh.js` — the geometry

Turns facade records into merged meshes. Two things about it are load-bearing:

- **Geometry is written straight into typed arrays.** M3 built a `BoxGeometry`
  per volume and merged 3,000 of them. M4 adds roughly 10,000 more elements, and
  paying for an object and a merge pass each would show in the loading bar.
- **A wall is four faces, not a box.** The underside of a box standing on a
  pavement is never seen, so it is never built; the top face is built
  separately, because a setback's ledge and a roof want the roof sheet rather
  than the wall sheet. That is 2 triangles saved per volume and the visible
  ledges gained.

Draw batching is by chunk, then by district for the two materials a district
owns. Signs, roofs, parapets, awnings and air-conditioners get one mesh per
chunk each. Which chunk group a family lands in decides when it stops drawing:
signs are the city's light and stay in the base tier, awnings and banners are
detail, air-conditioners are micro.

### `tools/expanse-plan.mjs` — the review drawing

Renders the network, blocks and lots to SVG at true size, plus a viewer page.
The rebuild ships pictures before it ships geometry.

---

## Design contracts

Per-district street rules live in `DISTRICT_STREET_RULES`
(`expanse-streets.js`) and lot rules in `DISTRICT_LOT_RULES`
(`expanse-blocks.js`). Together they are what "reasonably spaced buildings"
means as a number rather than a judgement.

| District | Grid spacing | Frontage | Depth | Street widths |
| --- | --- | --- | --- | --- |
| `hills` | 64 × 50 | 11–17 m | 9–14 m | 12 / 9 |
| `hongdae` | 36 × 30 | 4.5–7 m | 7–12 m | 12 / 7.5 / 5 |
| `station` | 58 × 47 | 14–28 m | 16–26 m | 16 / 11 |
| `market` | 42 × 34 | 4–6.5 m | 7–14 m | 13 / 8.5 / 5.5 |
| `hangang` | 72 × 50 | 14–22 m | 14–20 m | 14 / 10 |
| `pocha` | 34 × 28 | 4–6.5 m | 6–11 m | 12 / 7 / 5 |

Sidewalk by road class: ring 4.0 m, arterial 3.5 m, street 2.8 m, alley 1.8 m.

---

## Gates

`expanse-streets-check` — 21 assertions. Skeleton preserved, ring length and
radii unchanged, ring access sparse, nothing generated crosses the ring, graph
connected with no dead ends and no bridge dependency, no duplicate or
degenerate roads, no generated sliver junctions, hierarchy spans alley to ring,
every district owns roads, enough enclosed blocks, both sides of the ring
built, nothing in the river, everything in bounds, ≤2 % of land stranded from a
road, deterministic.

`expanse-massing-check` — 20 assertions, in two halves.

*Clearance.* Nothing may stand in a carriageway; no pavement pad may reach into
one; every frontage keeps at least 1.5 m of pavement; the 2.7 × 5.0 m pocha
truck envelope is swept along all 21.4 km of road without touching a building;
the spawn has 8 m of clear road ahead. Also: no volume exceeds its lot, base
volumes stack without gaps, heights are whole storeys, nothing is a pencil,
nothing is in the river or out of bounds, and the skyline has a real spread.

*Budget.* Whole-city triangles against 800k, the worst four-chunk view against
the 350k mobile budget, world collision against 250k, draw calls, material
roles, and that every visual chunk owns some city. Plus determinism.

`expanse-facade-check` — 24 assertions, in three halves. *Colour:* the six
district means separate by at least 40, no facade paint comes within 40 of a HUD
accent, every paint is reproducible from the bible's rule, and every district
paints a range rather than one wall. *Signage:* every sign points at a real
atlas cell, burns a tube its own district owns and uses the right cell shape;
every cell is used somewhere; the loud districts are at least 2.5× the quiet
ones per ten metres of frontage; every shop lot got a shopfront in its own
district's light. *Clearance:* no awning reaches a carriageway, every awning
clears 2.6 m, nothing overhanging hangs below 4.6 m, nothing reaches 1.4 m past
its building line, parapets and roof signs stay on their own roof, nothing hangs
over the river, no air-conditioner sits on a shopfront. *Budget:* desktop and
mobile triangles, collision unchanged from M3, draw calls, materials, texture
memory, and determinism.

`expanse-blocks-check` — 14 assertions. Every bounded face recovered (checked
against Euler's formula), exactly one outer face, density measured as street
metres per building, plausible footprints, nothing in the river, **zero lot
overlaps**, **zero lots in a carriageway**, **zero lots without a street at the
front door**, little dead land inside blocks, deterministic.

---

## Faults inherited from the approved layout

`expanse-streets-check` reports these separately and does not fail on them,
because fixing them means editing `expanse-layout.js`, which is a frozen
contract and the user's call. **They are live in `?world=expanse` today.**

- **`west_bridge` crosses `ring_south_w` at grade.** The west bridge's south
  landing sits past the ring's south run.
- **`spine_south` has zero length.** `south_bank` and `ring_s` are both at
  (0, 250) — two coincident nodes joined by a road.
- Five junctions where authored roads meet at 0–19.6°, tightest at `ring_se`
  where `pocha_link` runs 3.4° off the ring.

M3 works around the first two rather than fixing them: the zero-length edge
paves nothing, and the at-grade crossing no longer z-fights because the two
roads sit at different class lifts. Both are still faults in the layout.
Removing the zero-length edge also requires updating `expanse-layout-check`,
which asserts 25 nodes / 35 edges.

---

## Known gaps, carried into M5

- **No shops the loop can use.** `?world=expanse2` still ships
  `pickupSites: []`, so the order system falls back to delivery anchors — its
  documented path, and the loop does run end to end on it. M4 gave 1,052 plots
  a shopfront and a lit board; binding eight of them to the menu's restaurants
  is M5.
- **The road surface is still flat paint.** Lane markings, crossings, kerb
  detail and wet-road decals are the biggest remaining "unfinished" cue at
  street level, and the one thing a screenshot notices before the facades. It
  is outside M4's brief — façades, signage, colour, lighting — and belongs with
  the road art in M5/M6.
- **No props or street furniture.** `?world=expanse2` still opts out of the prop
  pass rather than drag the compact-world scanner over a kilometre. Bins, poles,
  cables and parked scooters are the layer between M4's facades and M5's shops.
- **Shopfronts read dark under an awning at night.** Correct for Seoul, and the
  awnings were already lifted to 3.15 m so the glass shows below them, but there
  is no light spilling onto the pavement from a lit shop — that wants a decal or
  a cheap pool light, not more geometry.
- **Empty land inside the ring.** Visible in the `plan` view, and the same
  density gap M2 recorded below: courtyards, the two fat blocks near the
  bridges, and the sparse band outside the ring.

## Known gaps inherited from M2

- **Density.** 1,212 buildings is one per 17.7 m of street. The blueprint
  estimated 3,000–4,000; that estimate assumed 22–31 plots per block, and the
  real figure is ~8.5 because depth is capped by the facing wall and corner
  plots consume ~9.7 m of frontage each. The honest lever is **courtyard
  infill** — 22 blocks keep an interior no frontage reaches, and a second row
  off a back alley would add perhaps 250–400 buildings.
- **Shop ratio.** 1,053 of 1,212 lots (87 %) are marked as shops, straight from
  the colour bible's own `shopChance` values. Plausible for a food-delivery
  game, high for a city.
- **Two fat blocks** near the bridges are still under-subdivided, holding
  31,000 m² between them that only their perimeter develops.
- **Block land accounting.** Faces are bounded by road *centrelines*, so
  reported block area includes half of every surrounding carriageway. Use inset
  area, not `block.area`, for any coverage calculation.

---

## Guardrails

Unchanged from `EXPANSE-HANDOFF.md`, and none of them were touched by M1, M2
or M3 — `?world=expanse2` reuses the shipped vehicle, camera and locomotion
systems exactly as they are:
vehicle handling, on-foot locomotion, camera, enter/exit, the three HUD accent
roles, metres/Y-up/north = -Z, ring geometry, bridge count, district ids.
