# Seoul Expanse — city rebuild (M1–M6)

**Updated:** 2026-09-09
**Status:** M1 and M2 complete and gated. M3 not started.
**Live game is unchanged.** `?world=expanse` still runs the 25-node greybox and
`?world=proc` still runs the compact procedural circuit. Nothing in this
document has replaced a world yet.

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
| **M3** | Greybox massing behind `?world=expanse2` | clearance + budget | next |
| **M4** | Façades, signage atlas, colour bible, lighting | visual QA | not started |
| **M5** | Landmarks, shops, delivery loop | route + anchor gate | not started |
| **M6** | Perf/LOD/mobile, full `npm run check`, promote | full suite | not started |

Each milestone is reviewed before the next begins, and nothing replaces
`?world=expanse` until M6.

---

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
npm run expanse-check   # every Expanse gate, including both of the above
```

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

The first two will produce bad geometry when M3 extrudes them. Removing the
zero-length edge also requires updating `expanse-layout-check`, which asserts
25 nodes / 35 edges.

---

## Known gaps, carried into M3

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

Unchanged from `EXPANSE-HANDOFF.md`, and none of them were touched by M1 or M2:
vehicle handling, on-foot locomotion, camera, enter/exit, the three HUD accent
roles, metres/Y-up/north = -Z, ring geometry, bridge count, district ids.
