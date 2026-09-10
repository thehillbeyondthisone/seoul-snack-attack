# TRUTHS — Seoul Snack Attack

Portable facts. Not a diary. Copy into the next job.

- Headless Blender 5.2 LTS: `--background --factory-startup --python`. Override with `BLENDER`.
- Every custom model ships `tools/blender/previews/<id>.png`. No PNG = unfinished. Show the PNG when reporting the model.
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
