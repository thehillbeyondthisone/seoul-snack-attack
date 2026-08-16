# Topography blueprint — hills without breaking the tile grid

How to give the district elevation so driving has crests, dips, grades and
off-camber corners, without discarding the single-BVH tiling architecture.

Status: **design note, nothing implemented — and now measured against a retired
block.** Every number below was taken from the old `city.glb`: an 18.2 x 10.1 m
street corner with 4.1 m buildings, scaled x3 and tiled 7x5. The shipped world
is now the Hong Kong III district at 1:1 on a 1x1 grid (101.9 x 96.0 m,
`CITY_SCALE = 1`), so the tile pitch, triangle densities and vertex spacing here
no longer describe anything that ships.

The *approach* still stands — a global Y-shear height field is still the way to
add elevation without breaking the single-BVH architecture, and the vehicle
still needs no changes. Re-measure before scheduling any of it.

## Why the vehicle needs no changes

`src/vehicle/physics.js` never assumes flat ground:

- suspension springs push along `hit.face.normal` (`physics.js:264-276`);
- tire forces are projected into the contact plane (`:280-281`);
- gravity enters as a plain world-space `(0, -mg, 0)` (`:218`);
- anti-roll bars and the upright assist are keyed to the averaged ground
  normal (`:330-357`).

Feed that sloped normals and grade-limited climbing, gravity-assisted
descents, crests that unload the suspension and off-camber cornering all fall
out for free. The work is in the world module, not the vehicle.

## Why the obvious approaches fail

The city is ONE block cloned 35x with rigid transforms, and there is exactly
ONE `MeshBVH`, built in tile-local space, with rays transformed into each tile
(`src/world/tiling.js:122-187`). That is the architecture's central trick, and
it constrains everything:

- **Per-tile Y offsets** — vertical cliffs at every tile seam. Dead on
  arrival.
- **Per-tile deformed geometry** — needs 35 distinct BVHs of 226k triangles
  each. Boot cost and memory stop being independent of grid size, which is the
  entire point of `tiling.js`.
- **Re-author the district with real terrain in Blender** — correct, and a
  different, much larger project. See "What this cannot give you".

## The approach that fits: a global Y-shear height field

Define one world-space function `H(x, z)`. Treat all existing geometry as
living in "flat space", displaced by

    y' = y + H(x, z)

Because `H` is global and continuous in world space, **tile seams stay
seamless** — which is precisely why this survives the tiling. Neighbouring
tiles sample the same field at the same world coordinates and agree at the
boundary by construction.

A pure Y-shear keeps verticals vertical. Buildings do not lean; they get
tilted floors and roofs and a base that follows the ground. That dissolves the
usual "how do I sit a building on a slope" problem, and it means visuals and
collision agree *exactly*, because both are driven by the same `H`.

### Physics: one wrapper, ~30 lines

Wrap the raycast returned by `grid.makeRaycast(...)` in `src/world/city.js`:

```js
function warpedRaycast(o, d, far) {
  _flat.set(o.x, o.y - H(o.x, o.z), o.z);
  const hit = flatRaycast(_flat, d, far);      // direction unchanged
  if (!hit) return null;
  hit.point.y += H(hit.point.x, hit.point.z);
  const n = hit.face.normal;
  const [hx, hz] = gradH(hit.point.x, hit.point.z);
  hit.face.normal.set(n.x - hx * n.y, n.y, n.z - hz * n.y).normalize();
  hit.distance = hit.point.distanceTo(o);
  return hit;
}
```

The normal correction is the whole feature — it is what turns a flat city into
hills the car reacts to. It is the inverse transpose of the shear's Jacobian:
for `phi(x,y,z) = (x, y + H, z)`, `J^-T` maps `n` to
`(n.x - Hx*n.y, n.y, n.z - Hz*n.y)`.

Accuracy: the flat-space preimage of a warped-space ray is a *curve*, not a
line, so the shifted-origin straight ray above is an approximation — except
for perfectly vertical rays, where it is exact. That covers all four
suspension rays. The eight horizontal bumper rays are 0.55 m long
(`physics.js:399-409`), so at a 6% grade they are off by ~3 cm, hitting walls
that are vertical over metres. Not a concern. Recomputing `hit.distance` from
the warped point (as above) keeps the suspension compression math honest.

One wrap in `city.js` and everything downstream inherits it: prop physics
(`src/physics/prop-world.js:274`), the rain ground probe
(`src/world/rain.js:132`), `findGround`, order beacons.

Also expand `bounds` and `killY` by the field's amplitude, or the low ground
falls through the respawn threshold.

### Visuals: displace in the vertex shader

Patch every city material via `onBeforeCompile` to apply the same
displacement in world space, plus the same `J^-T` correction on the normal so
lighting follows the hills. Materials are shared across all 35 tile clones
(`city.js:157` clones share materials by reference), so one patch covers the
whole grid.

Gotcha: `onBeforeCompile` does not touch the depth pass. Shadow casters need a
matching `customDepthMaterial` or shadows detach from the geometry.

CPU-placed objects do not need shader work — they are small enough to rigid
lift. Add `H(x, z)` after `grid.localToWorld(...)` for props
(`src/world/props.js`), streetlight anchors (`city.js:300-303`), delivery
points (`city.js:284-291`) and district dressing.

The tile-local scans in `props.js` (`scanCurbs`, `scanRoad`) and
`district-dressing.js` stay in flat space and need no changes: they classify
by height *relative to the road slab*, and a Y-shear preserves relative
heights exactly.

## The number that sets the schedule

A density pass over the shipped `city.glb` (triangle counts, world extents at
`CITY_SCALE = 3`):

| mesh | material | tris | extent | tris/m² |
| --- | --- | --- | --- | --- |
| `Plane.004` | `real road` | 193 | 21.7 x 30.3 m | 0.29 |
| `Plane.005` | `real road` | 193 | 21.4 x 30.3 m | 0.30 |
| `Plane.022` | `concrete_pavement` | 270 | 30.1 x 16.0 m | 0.56 |
| `Plane.022` | `concrete_pavement.001` | 214 | 30.1 x 16.0 m | 0.44 |
| `Plane.023` | `Material.010` | 116 | 31.7 x 16.8 m | 0.22 |
| `Plane.001` | `tiles` | 28 | 29.5 x 15.4 m | 0.06 |

**Roughly one road vertex every 6 metres.** Vertex displacement cannot bend
geometry that is not there, and the error is quadratic in edge length. For a
3 m amplitude at ~100 m wavelength, an unbroken 30 m edge sags ~1.3 m away
from the true surface; at a 2 m grid the same field is off by ~6 mm.

So the road, pavement and ground slabs must be re-tessellated to a ~1-2 m
grid before any of this looks like anything. That is a subdivide pass in
`tools/build-city.mjs` restricted to those large flat primitives (~1,030 tris
in, ~15-20k out), then a regenerated `city.glb` and a re-baked
`city.collider.bin` via `tools/build-collider.mjs`. Runtime cost is
negligible — the block is already 226k triangles and the geometry is shared
across all 35 tiles — but it is a pipeline change plus a re-bake, and it is
the single biggest work item.

Vertical surfaces need far less: building footprints span 6-14 m, so their
bottom edges deviate by 5-25 cm at these wavelengths. Either subdivide
anything with an edge over ~4 m, or sink building bases ~0.3 m so the ground
always cuts into them rather than leaving a gap.

## Work breakdown

Roughly 3-5 days total.

| Task | Estimate |
| --- | --- |
| `src/world/terrain.js` — `H`, gradient, flatten mask near spawn | 0.5 d |
| Raycast wrap; expand `bounds` / `killY` by the amplitude | 0.5 d |
| Shader displacement, normal correction, shadow depth pass | 1-2 d |
| Re-tessellate road/pavement in the build pipeline; re-bake collider | 0.5-1 d |
| Lift CPU-placed props, streetlights, beacons, dressing by `H` | 0.5 d |

`tools/bench/worlds.js` already defines the exact raycast contract
(`raycast(origin, dir, far) -> { point, face: { normal }, distance } | null`),
so a synthetic warped world can validate grade behaviour headlessly before any
of the art pipeline work lands.

## Tuning notes

**Pick a wavelength that is not a multiple of the tile pitch.** The grid pitch
is 43.03 x 30.33 m (`city-constants.js:45-47`). Terrain that beats against
that grid amplifies the visible repetition; terrain that is coprime with it —
say 137 m x 91 m — actively *disguises* the fact that the player is looking at
one block 35 times. This is a real second benefit of the approach, not a
footnote.

**Keep grades at 4-8%.** That is ~2.6 m of rise per tile and ~15 m of relief
across the 301 m district: enough for crests, dips and blind rises. Past ~8%
the sheared buildings start reading wrong.

**Flatten near spawn.** Multiply `H` by a mask that goes to zero around the
spawn tile, so the drop-in at `city.js:246` and `resetToRoad()` stay
predictable.

**Cross-slope is free.** `H` can carry a road-crowning or banking term keyed
to distance from the street centreline, using the same machinery. Banked
corners are a cheap fun multiplier once the field exists.

## What this cannot give you

A Y-shear is a height field, so:

- no roads crossing over each other, no true multi-level topography;
- no retaining walls, cuttings or vertical terrain features;
- no San Francisco. 15% grades need authored terrain and abandoning the
  single-BVH tiling.

## Cheaper alternative

Hand-model one or two ramps, an overpass and an underpass as separate GLBs and
merge them into the collider triangle soup. About a day, gives actual air time
and one memorable crest, and does not touch the tiling or the build pipeline.
It does not make the whole city breathe, but it is the fastest route to "this
is more fun to drive".
