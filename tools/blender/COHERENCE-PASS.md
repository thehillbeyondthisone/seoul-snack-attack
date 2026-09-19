# Building kit coherence pass

The user liked the broader building-use mix, but could distinguish the quality
of the original food buildings from the later non-retail buildings. Keep their
different uses, heights and palettes; share the accepted Pocha's construction
and detail quality. This pass is ready for user art review, not recorded as art
acceptance.

## Common construction

Ochre Walk-up, Blue Ledger Offices and Eulji Service Workshop now call the
original `patchwork_pocha.window` helper. Frames and mullion counts are optional
parameters, so the original three food recipes keep their existing defaults.
The common window includes a real opening, plaster reveal, projecting stone
sill, inset glass, curtains, a shelf, room contents and a warm bulb. Balconies
reuse the pilot's railing and planted pots.

`seoul_nonretail.py` collects window openings and segments the front masonry
around them before export. The same wall pieces define visible geometry and
collision. Entrance pockets extend behind the threshold. Coping, drainpipes,
pipe collars, local repairs, service boxes and roof condensers add a common
detail scale. Floor edges use plaster. The office retains its blue/bronze
palette; the apartment remains ochre/sage and the workshop charcoal/mustard.
Quieter render/concrete textures avoid the conspicuous repeating wave pattern
on broad party walls. The workshop roof slopes are planar and have closed
front ends.

All three assets are rebuilt with contact AO, their editable Blender checkpoints,
runtime GLBs and JSON, and individual PNGs. The first three building exports
are preserved. The shared-helper additions retain their previous defaults.

## Startup and driving

The assembly's practical lights used `visible` as a distance cutoff. This changes
the number of shader lights, invalidating facade programs both on the first
frame and when moving down the street. The pool now keeps eight visible light
objects and sets out-of-range intensity to zero. The regression checks light
counts at near and distant camera positions.

Playable pilot scenes prepare textures in short batches and compile shaders
asynchronously against the postprocessor's render target. Food warming starts
after the first frame and asynchronously prepares both the gameplay and upload
scene shader variants. Actual small offscreen draws still upload food geometry
and textures; this is not a catalog-wide synchronous compilation pass.

Startup measurements live in the `startup` section of
`reports/street-assembly-runtime.json`. They include navigation-to-ready,
long tasks, texture preparation and shader preparation. These are local Chrome
observations, not a guaranteed startup time on every machine. The original
10-second user observation was not reproduced exactly in the isolated browser.

Final review-to-drive check: **3.99 s to ready**, longest observed main-thread
task **469 ms**, and **6.36 m** travelled during the 1.4-second keyboard drive
check. An earlier local probe found a 3,209 ms task before the fixes, but the
runs were not controlled hardware benchmarks. The revised block has 221
InstancedMeshes (442 part instances), 495 draws including shadows/post, and
84 renderer textures. This session's GPU timings were heavily contended by
other open applications and do not establish a dedicated-device frame budget.

All three individual PBR/AO, doorway/walking and driving browser checks pass.
The final assembly passes twelve entrances, twelve top-speed straight runs,
dry/wet full-throttle laps and real keyboard driving. All 12 Blender recipe
gates, the 16-model food warmup browser check, encoding check and production
build also pass.

## Review and next step

Review `/building-pilot.html?building=street-assembly`, then use **Drive & walk
here**. Required assembly preview: `previews/street-assembly.png`. Individual
Blender and actual-game PNGs are beside it.

The project Blender MCP endpoint is `127.0.0.1:9877`. Running
`mcp/review_kit.py` through that endpoint creates a separate comparison scene,
preserves the existing scenes, and saves `coherent-kit-studio.blend` under
`_source-assets/world/hero-building/`. It is an authoring comparison workspace;
Three.js remains the final lighting and gameplay review.

Next proposed step: make this short street a delivery loop with named shop
anchors, then add asymmetric placement and a few reusable street details.
Measure that populated block before expanding into a district.
