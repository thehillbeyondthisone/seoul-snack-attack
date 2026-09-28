# 밤내 Bamnae — the deliberate build

A small South Korean valley town, replacing the Expanse's flat kilometre of
Seoul as the world the game is actually built for. Started 2026-09-20.

**Status: T0 and T1 complete.** `?world=town` boots and is drivable. Nothing is
dressed — no plots, no buildings, no props, no signage, no road paint.

    npm run quickstart -- --launch=town          drive it
    npm run quickstart -- --launch=town-review   clear daylight, no rain, stats
    npm run quickstart -- --launch=town-preview  orbit the height field, no HUD
    npm run town-check                           the plan/height-field gate
    npm run town-plan                            draws _work/town-plan.svg
    npm run town-render                          OBJ + Blender stills

Or by hand: `/?world=town`. Add `&time=day&rain=off` to judge the landform —
the morning rig plus rain is most of what a greybox can hide behind.

---

## Why this world exists

The Expanse is 1,140 x 860 m, six districts, 1,212 plots, and completely flat.
Two problems, and the second is the one that matters:

1. **Scale.** At that size every block has to be generated, which means no
   block can be authored, which means no block can be *good*. Detail is spread
   until it is even, and even detail reads as wallpaper.
2. **Flatness is an authoring decision, not a rendering one.** The vehicle has
   never assumed flat ground — `src/vehicle/physics.js` springs along
   `hit.face.normal` and projects tire forces into the contact plane, and has
   since M2. The flatness comes from four modules that each independently
   author geometry at y = 0: the ground is four quads, plots extrude from a
   constant `base`, road paint is a ribbon at a constant lift, street detail is
   dropped on a plane. None is hard to change alone. The problem is that
   **nothing knows how high the ground is**, so changing one means changing all
   four and hoping they agree.

So Bamnae is 600 x 450 m — about a quarter the area — and the first thing built
is the thing the Expanse never had: one module that owns elevation.

## The decisions

| | |
|---|---|
| Landform | River valley with one ridge |
| Footprint | 600 x 450 m + 60 m margin |
| Placement | New `?world=town`; the Expanse is untouched |
| Quarters | The six frozen district IDs, remapped |

The six district IDs are frozen across the colour bible, the shop pack, the
landmark shops and every delivery gate. Bamnae reuses them rather than
inventing six new ones and re-baselining the entire art pipeline:

| ID | Quarter | |
|---|---|---|
| `hills` | 윗말 | the terraced hillside — already means hills |
| `hongdae` | 중앙로 | main street shopfronts — the loud lit one |
| `market` | 시장 | the arcade lanes |
| `hangang` | 밤내 | the stream banks — already means river |
| `pocha` | 포차거리 | tents along the weir pool |
| `station` | 터미널 | bus terminal, school, paddies |

## The architecture

**`town-layout.js` surveys. `town-terrain.js` conforms. Everything else
samples.**

Every road node carries an authored elevation. The height field builds its
landform first, then each road corridor stamps its surveyed elevation into the
field, blended out across a shoulder. Inside a carriageway the field *is* the
road, exactly; a metre outside it is already bending back toward the hillside.

This is the opposite of the obvious approach, and the reason is junctions.
Drape a road over sampled noise and four arms of a crossroads arrive at four
different heights — the junction becomes a funnel. Author the junction height
once and every arm is correct by construction.

`heightAt(x, z)` is the contract. Ground mesh, building pads, kerbs, road
paint, props, delivery anchors and the collider all come through it or they are
wrong. That single sampling point is the whole reason to do this at 600 m
before doing it at 1,100.

### What it deliberately cannot do

A height field has one Y per X/Z. No overpasses, no tunnels, no caves. The two
bridges work only because bridge edges are excluded from the conform — the deck
is separate geometry and the stream bed stays cut underneath it. A real tunnel
through the ridge would be separate geometry merged into the collider, not a
change to the field.

## The town

```
  north (-Z)   ridge, two summits with a saddle over the town centre
               윗말: three terraced lanes at 10 / 19 / 28 m, four switchbacks,
               정자 pavilion on top, water tower above the third terrace
  middle       중앙로, west to east, LOW IN THE MIDDLE — the centre sits in the
               dip at 3.0 m and the road climbs away both ways
               시장 market lanes tucked in behind it, 농협 on the corner
  +Z           밤내, the stream the town is named for: bed falling 2.8 m west to
               east while the floor above it falls 0.3, so the banks grow as you
               go. Opens into the weir pool at 포차거리. 천변로 runs the north
               bank; two bridges cross it
  south (+Z)   남길, the bus terminal, the school, paddies rising to the edge
```

### The graph is all loops, and that is not a style choice

`validateRoadGraph()` requires degree >= 2 at every node and every edge on a
cycle — a cut edge means a delivery route with no alternative. So: main street
and the riverside road close at the west valley mouth; the two bridges and 남길
close against the riverside road; each hillside terrace is reached by two
switchbacks; the market lanes are a rectangle; the pass is a hairpin with a
lay-by at the top rather than a scenic dead end.

The east end could not close the way the west end does. The pass is 16 m above
the water with only 94 m of Z between them, so a road joining them directly
sits at 17%. It is two loops sharing `main_pass` instead: the hairpin above the
town, and a descent to the weir that rejoins main street.

## Measured, 2026-09-20

    footprint      600 x 450 m (+60 m margin)
    graph          40 nodes, 51 edges, 3.80 km of road
    중앙로          585 m end to end
    relief         -3.0 m to 102.9 m
    ground mesh    4 m heightfield, 26,344 verts, 51,480 tris
    steep ground   1.5% of cells over 25%
    conform error  0.0013 m worst
    worst camber   10.7%
    steepest road  15.8% (정자길, a track, limit 16%)
    pass           11.1% both legs (limit 12%)
    밤내교          deck 2.0 m, 2.0 m of water, 3.4 m over the bed
    동교            deck 2.5 m, 2.6 m of water, 4.7 m over the bed

### Enclosure, measured from eye height

The number that matters for "does this feel like a valley", and the one no
plan view and no gate could have produced:

    중앙로 -> north ridge     19.3 deg   (was 10.5 before the mountain)
    중앙로 -> south wall       7.9 deg
    west 중앙로 -> north      21.1 deg
    east 중앙로 -> north      21.2 deg
    천변로 -> north           15.0 deg
    터미널 -> south wall      17.8 deg
    중앙로 -> west gate        1.8 deg   (open, correctly — it is a valley mouth)
    중앙로 -> east pass        2.8 deg   (open, correctly)

An enclosing valley wall reads at 18-30 degrees. Ten degrees is open country
with a hill in it.

### What the gate caught that a screenshot would not

Worth recording, because every one of these was invisible in plan view:

- **The conform filled the stream in under both bridges.** The check that was
  supposed to catch it sampled the polyline's middle element, which for a
  six-point deck sits 14 m downstream of the channel.
- **The water sat below its own bed.** A constant-depth trench subtracted from
  the valley floor gives a dry channel at one end and an overflowing one at the
  other. A stream runs downhill faster than its valley does; the bed is now
  authored per point.
- **Junction blending dragged roads off their surveyed heights.** Five arms
  converge on `main_pass`; a plain weighted average of all five sat 0.62 m off
  the road actually under the wheels. Inverse-square distance weighting fixed
  it (0.62 m to 0.7 mm).
- **Two switchbacks grazed their terrace roads** at 16° and 18° for 20-25 m,
  which a height field resolves by tilting the lane into the hillside. Both now
  arrive square-on, via new mid-terrace junctions `t1_m` and `t2_m`.
- **The east summit came out 17 m too tall,** because the pass's rise stacked
  onto the ridge instead of being masked by it.

### What only the 3D view caught

Two more, and both were invisible to the plan, the sections AND the gate:

- **The valley did not read as a valley.** The first landform ran ONE 25%
  slope from the floor to the crest — the gradient the terraces need — which
  put the skyline at 10.5 degrees from main street. A real 산 behind a 읍내 is
  a gentle apron the houses terrace into and then a 50-60% mountain above it.
  Rebuilt that way, plus a south wall the valley previously did not have, it
  measures 19.3 degrees. There was no way to find this except by standing in
  it: every number the gate checks was green.
- **Both valley walls were terraced into steps.** The cross-section
  interpolated with smoothstep, which has zero slope at BOTH ends of every
  span, so every control point became a flat spot and a chain of them became a
  flight of concentric terraces down each side. It is invisible in plan,
  invisible in section, and unmissable the moment the mesh is rendered as
  clay. Now Fritsch-Carlson monotone cubic: tangents match across joins, so no
  flat spots, and they are clamped so the curve cannot overshoot — which
  matters because an overshoot on the stream bed would be a dam.

The lesson for the rest of the build: the gate measures whether the world is
CORRECT. It cannot measure whether the world is any good. Both passes are
needed, and the cheap one does not substitute for the other.

### The 13 walls this town owes

Every place the surveyed road disagrees with the landform by more than 2 m,
marked orange on the plan. These are not defects — a lane descending at 13%
across a 25% hillside is a cut-and-fill bench, and a bench has a 옹벽 on its
uphill side. They are the art pass's list.

    5.7 m  retaining wall  정자길      (-138, -185)   the pavilion knoll
    4.2 m  retaining wall  윗말오름    (-40, -110)
    4.1 m  retaining wall  서편오름    (-104, -108)
    4.1 m  embankment      동편오름    (125, -58)
    3.9 m  retaining wall  보뒷길      (250, -2)      the cutting down to the pool
    3.5 m  retaining wall  정자길      (-92, -194)
    3.4 m  retaining wall  윗말오름    (102, -145)
    3.1 m  retaining wall  —           (-293, 8)      the west gate cutting

The west gate cutting and the 보뒷길 cutting are both deliberate: you come
round a corner in a concrete trench and the town, or the pool, opens up.

## Staging

- **T0 — plan and height field.** ✅ Done. `town-layout.js`, `town-terrain.js`,
  `tools/bench/town-terrain-check.mjs`, `tools/town-plan.mjs`.
- **T1 — ground and water.** ✅ Done. `town-ground.js` builds a 4 m
  heightfield, the channel as part of the same surface rather than a hole in
  it, water as its own ribbon at the authored per-point level, and a road
  ribbon per edge. `town-city.js` owns collision, lighting and the world
  contract. Measured in the browser: 51,638 collision triangles, 30 draw calls,
  70k triangles drawn, four wheels grounded on terrain, bridge decks, the
  track and the 11% pass.
- **T2 — plots on a slope.** Reuse `expanse-blocks.js` face-finding, but each
  lot gets a **pad** at its frontage road's elevation with a retaining skirt to
  the terrain. This is the piece with no equivalent in the Expanse and the one
  most likely to need a second attempt.
- **T3 — massing and facades.** Reuse `expanse-massing.js` and
  `expanse-facades.js` against pad elevations. ~150-220 buildings, not 1,212.
- **T4 — the eight things that make it a town.** 농협, the 시장 arcade roof,
  the terminal, the school and its dirt track, the church's neon cross on the
  ridge, the 정자, the water tower, the weir. Hand-placed, each with a preview.
- **T5 — the walls.** The 13 above, plus stairs between the terraces.
- **T6 — dressing and night.** Street detail, the pocha tents, lighting.

## Three shared-code bugs T1 found

All three had been latent for as long as the project has been flat, and all
three are fixed in shared modules rather than worked around in the town.

- **`physics.js place()` measured its wheel clearance from y = 0.** The clamp
  that lifts a tall rig so its hubs are not under the road is
  `0.05 - lowestHub` — an absolute world height, which is the same thing as a
  ground-relative one only while the road is at zero. 밤내 put the valley
  floor at 3 m, the clamp silently stopped applying, and the pocha spawned
  1.2 m underground with its suspension rays pointing into empty space. It
  fell through the planet on spawn and on every reset. Now measured from
  `findGround`; flat worlds are bit-identical.
- **`rain.js` owns live fog density and re-seeded from the raw preset.** So a
  world could not scale fog for its own sightlines — `time-of-day.js` threw the
  scale away every time the clock moved. It now reads the density the rig
  actually applied.
- **The ground albedo was an order of magnitude too bright.** Not a bug so much
  as my error, but worth the same note: the Expanse's ground is `0x1c2028`, and
  treating the landform bands as tints over a white material made 밤내 a
  snowfield. They are albedos now, in the bible's register.

### And one tuning value that is a world property, not a preference

The Expanse's presets put fog at **113 m half-visibility** by day. That is
right for dense streets and wrong for a valley: 밤내's ridge is 220 m from
중앙로 and its far wall 300 m, so at city density the enclosure this world was
rebuilt to have is invisible from inside it. `createNightRig` now takes a
`fogScale`, and the town passes 0.33 — about 500 m half-visibility, so the
ridge reads at ~90% by day and as a silhouette in haze at night.

## Still open from the plan review

- **시장 is 110 x 24 m** between lane centrelines — about 30 stalls. Honest for
  a town this size, thin for a signature location. Growing it to ~160 x 32 m
  was recommended and is NOT done.
- **윗말 is 29% of the road for 8% of the buildable land.** Resolved by making
  윗말3길 and its two climbs unpaved track — no kerbs, no walls, no plots, and
  held to 3.5 m of earthworks instead of 6.5. The 정자 moved to the top of the
  village rather than up the mountain: sited at 55 m it needed 150 m of
  switchback to reach at any drivable grade, and a village 정자 sits at the top
  of the village anyway. You park below and walk.
- **터미널 has 5 ha of flat land with no road within 35 m.** Left as paddy
  deliberately. The empty fields are what make the town feel like it is
  somewhere rather than a set.

## Open questions

- **The Drain.** The Expanse's dive ramp sits on the Han's north quay and the
  whirlpool opens in the river. The weir pool is the obvious equivalent here
  and the geometry already suits it, but nothing is wired. Not started, and not
  to be assumed.
- **Deliveries** run, but on road anchors rather than shopfronts: with no
  buildings there are no pickup sites, so `orders.js` falls back to its
  dressing-failure path and binds restaurants to delivery anchors. That is the
  correct T1 behaviour and it should become real in T3.
- **The map** draws quarters and streets but no footprints, because
  `buildingBlocks` is empty until T2.
- **The Expanse's future.** Untouched at `?world=expanse2`, still the default.
  Nothing has been promoted or deleted.

## Guardrails

- Nothing computes a ground elevation except through `heightAt(x, z)`.
- Metres, Y-up, north = -Z, same as every other world here.
- No dead ends. The graph gate will reject them, and it is right to.
- Every custom 3D model needs a PNG preview shown to the user.
- Three HUD accents only: urgency red-orange, money cream-gold, navigation cyan.
