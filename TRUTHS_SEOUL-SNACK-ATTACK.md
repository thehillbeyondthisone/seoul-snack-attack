# TRUTHS — Seoul Snack Attack

Portable facts. Not a diary. Copy into the next job.

- The default world is now `expanse2`. Keep `world=proc` explicitly in URLs;
  deleting it no longer selects the compact circuit. The old Expanse remains
  available as a comparison at `world=expanse`.
- M6c GPU profiling found the major startup stall in shader `onFirstUse`.
  With KHR parallel compilation, prepare programs against the same render target
  as the postprocessor or the first frame recompiles a tone-mapping variant.
  Async compilation still does not upload geometry/textures. Optional detail
  mesh construction streams separately, with global collision ready at boot.
- Asphalt uses world X/Z UVs so intersecting roads sample the same normal and
  roughness pixels. Metre scale alone does not prevent orientation seams.

- Escape/F3/pad View open Settings; backtick opens/closes tuning directly,
  including from Settings. Preserve this user-approved split.
- The pocha cab shares the exterior atlas's orange `#e3a000`, green `#83b716`
  and trim `#3d3d3d`, recorded as `POCHA` in the colour bible and mirrored in
  Blender's `BIBLE`. Use `principled(..., srgb=True)` for these sampled paint
  hexes so exported linear factors match the sRGB atlas. The hippo enamel is
  the bible's strawberry pink `#ff85b5`, also authored as sRGB.

- Headless Blender 5.2 LTS: `--background --factory-startup --python`. Override with `BLENDER`.
- Pass `--python-exit-code 1` before `--python`: Blender otherwise reports
  success after Python exceptions and can leave an old preview beside a new GLB.
- Every custom model ships `tools/blender/previews/<id>.png`. No PNG = unfinished. Show the PNG when reporting the model.
- The cab's hippo is a separate Blender GLB with a `hippo_head` pivot. Keep the
  node transform and animation in `dash-hippo.js`; do not merge the head into
  the fixed body. The cab preview attaches the toy only after exporting the cab.
- Add new snacks as new dishes. Do not remap an existing dish to prove a mesh.
- Food GLBs: metres, origin at ground-centre, Principled BSDF only (`Base Color` / Roughness / Metallic / Specular IOR Level). Colour-bible hexes; a fourth hue is local snack colour, never a new HUD accent.
- Runtime `food-display.js` normalises largest dimension to 1 m. Silhouette and colour beat millimetres.
- Preview studio is for a ~12 cm subject. Key energy ~4. `view_transform = Standard`. Character-scale lights wash bible hexes to white.
- A filled cone is a lidded cup. `end_fill_type='NOTHING'` plus a bottom disk, or you cannot see the contents.
- When a still looks wrong, read `baseColorFactor` first. If the factor is right, the bug is the studio.
- Do not treat Sketchfab dumps as a modelling method. `dakggochi.glb` is 165k tris of KakaoTalk photo planes.
- Dev server is port **5273**, not 5173. Probe: `?intro=off&offer=1&accept=1&restaurant=<shopId>`. Look for `food display: <id> loaded on demand`.
- Vehicles are a different axis contract (`normalize-vehicle.mjs`, +Z forward). Do not run food recipes through that pipeline.
- District ids in the colour bible are frozen. Display names and palettes are the creative surface.
- Pipeline: `tools/blender/` (`lib.py`, `recipes/`, `catalog.mjs`). `npm run blender` / `npm run blender-check`.
- Four originals add **160 KB** of GLB. Preview PNGs live in `tools/blender/previews/` and are not shipped. Do not replace the 317 procedural buildings with unique GLBs — instance boxes + textures. Blender is for countable close-up objects (food, a shop kit, roof clutter), not the city mass.
- Player locomotion is native to the current Three.js/BVH stack, not an embedded
  Sketchbook/Cannon engine. Capsule: 1.72 m high, 0.32 m radius; fixed 120 Hz.
- Mouse/right-stick horizontal look uses positive X = look right in both modes;
  the vehicle chase camera is orbitable and pulls in against the city BVH.
- Mouse/right-stick vertical look uses positive Y = look down in both modes.
- Food GLBs are decoded and GPU-warmed incrementally after boot. An order offer
  prioritizes its dish before acceptance; do not restore the catalog-wide
  `compileAsync()` call, which did not upload geometry/textures and could spike.
- Vehicle physics stays on the native BVH solver. The pocha uses a speed-ramped
  Sketchbook-style roll influence, a wheel-centred lateral CoM, and forgiving
  steering stability through its useful speed range. Steering alone should not
  topple it; guard bilateral 45/60/near-max behavior with
  `npm run vehicle-tuning-check`.
- `F` / Xbox `B` is vehicle enter/exit. Space/A is contextual handbrake/jump.
  `?mode=foot` starts the on-foot QA path.
- Orders navigate from the active player's pose, but pickup/drop-off dwell is
  deliberately still measured from the vehicle.
- The external large-world contract is `WORLD-SWARM-BRIEF.md`: north is -Z,
  metres/Y-up, 1,000 × 720 m, six frozen district ids, high-speed curve radius
  at least 80 m, and separate visual/collision/roadgraph/landmark deliverables.
- Live `?world=expanse` uses the validated 25-node/35-edge, 1,000 × 720 m
  `expanse-layout.js` city. The direct 74/113 GLB substitution was rejected:
  routing connectors became roads and widened lanes collided with massing and
  spawn. Keep `expanse-blueprint.js` / `expanse-rich-runtime.js` isolated until
  a reviewed road plan and clearance gate replace that approach.
- `M` opens the north-up full-city map and `Escape` closes it. The map draws the
  live route graph and pauses physics/orders; master mute lives in the cassette
  deck.
- The mini-map blade names the street from `expanse-street-names.js`, keyed by
  edge id. Generated roads have routing handles, not signage, so a new edge
  ships unnamed until that table covers it; `npm run expanse-check` gates it.
  Off the carriageway the blade names the district instead, and a world with
  no entry hides the blade rather than printing `ring_north_w` at the player.
- Expanse collision remains one global BVH and street-life visuals use a 4 × 3
  base/detail/micro grid. Do not introduce chunk-boundary physics seams without
  profiling evidence that the BVH is a bottleneck.
- A road network is not a city. The step every attempt at this world skipped is
  the one that turns roads into blocks, blocks into lots and lots into
  buildings. Generate it (`expanse-streets.js` → `expanse-blocks.js`); a
  kilometre of hand-authored coordinates has failed here three times.
- Side streets must **terminate on** an arterial as a T-junction, not keep
  clear of it. Holding a clearance band around every skeleton road consumed
  40 % of the ring interior as dead space and yielded 56 interior nodes; cutting
  real junctions instead turned those corridors into frontage. That single
  change is most of the density.
- The ring is a belt through the city, not its coastline. Building only inside
  it discards 270,000 m² of a 720,000 m² map.
- A zero-length edge has no bearing, so it scrambles the rotation order at its
  node and a planar face walk silently loses every block around it. Weld
  coincident nodes before walking, and check the recovered face count against
  Euler (`E − V + 1`) — silence is the failure mode.
- `inradius = 2·area/perimeter` is an average. A block can average 18 m of
  half-width and still pinch to 10 m, where opposing frontages grow through
  each other. Clamp each side's depth by ray-casting to the wall that faces it.
- When a per-edge polygon inset collapses, fall back to the **widest** setback
  on the boundary, never the narrowest — the narrowest puts the block line
  inside the ring's carriageway.
- Offset lines for two nearly-parallel segments meet hundreds of metres away.
  Treat turns under ~6° as straight and clamp any surviving mitre, or one block
  corner lands on the far side of the map.
- A junction whose roads leave within ~25° of each other is not a junction: it
  encloses a sliver and reads on a plan as a road dangling in open ground.
  Gate it, and size a corner plot from the depth of the road it turns *into*.
- Review a generated city as a 2D drawing before extruding anything
  (`npm run plan`, Quick Start `[5]`). Stats hide geometry faults that are
  obvious in one picture.
- Faces of a road graph are bounded by centrelines, so face area includes half
  of every surrounding carriageway. Never compute building coverage from it.
- `expanse-layout.js` carries real faults that the new gates surface and report
  separately rather than fix: `west_bridge` crosses the ring at grade, and
  `spine_south` joins two coincident nodes at (0, 250). Both are live.
- A landmark added to a city whose plots are already settled belongs **on a
  roof**, not on the ground. Crowning an existing building claims no land, can
  collide with nothing, and needs none of the clearance rules the rest of the
  city obeys. Dropping bespoke structures in means re-settling every plot.
- Score a landmark host inside its own district. Score it citywide and the
  score walks: the tallest building near an anchor is often over the district
  line, which puts a named tower in the wrong neighbourhood.
- Size an emissive detail for the distance it is *read* at, not the distance it
  is modelled at. A 9 cm band on a 46 m mast is sub-pixel from the far bank,
  which is exactly where a landmark has to work.
- A pickup marker goes on the carriageway, not the pavement — the van has to be
  able to stop on it. Offset it by a share of that road's own width, or a wide
  arterial puts it in oncoming traffic and an alley puts it in a wall.
- Prove a delivery loop routes in Node before the browser sees it: build the
  road graph from the generator output and route every shop/anchor pair. Where
  a helper wants a ground raycast, hand it the world's real ground as a
  function (flat quads with the river cut out) rather than skipping what it
  cannot test.
- Bind gameplay to a **building id**, not a coordinate. A site that names its
  `bld_*` and takes frontage, facing and district from that record cannot drift
  when the generator is retuned; a hand-typed transform silently can.
