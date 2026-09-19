# Seoul building and shop: visual quality pilot

## Accepted approach — 2026-09-13

The user accepted one finished building with a ground-floor snack shop and its
immediate street as the quality standard for subsequent world generation.
Astra is the requested lead for this work. Finish and review this small sample
before generating variants, a short street, a district, and finally the city.

## Style direction — user preference

The user wants a **quirky, off-beat style** that fits the game's personality.
Carry that tone into the building and shop. On 2026-09-13 the user selected
**A — Patchwork Pocha: wonky renovations, weathered brick, handmade warmth**
from the three generated concepts. The user accepted the implemented building
on 2026-09-13: “this building looks great, run the next one. be cost effective.”

## Current implementation

The [coherence pass](tools/blender/COHERENCE-PASS.md) responds to the user's
review that the newer non-retail buildings had a visibly different quality
level. They now share the original deep-window construction and facade detail
scale. The mixed uses and palettes remain. Review the revised assembly before
district expansion; this is not recorded as user art acceptance.

Round 01 is ready in [the concept comparison](tools/art/hero-building/round-01/README.md):
A — Patchwork Pocha, B — Snackwave, and C — Midnight Snack Lab. The final
`-v2.png` images show the required four storeys. Prompts and the original
iterations are preserved in that folder. These are ImageGen concepts; no 3D
building or runtime quality was established by those images. The user selected
A, superseding the assistant's initial recommendation of B.

The implementation is `tools/blender/recipes/patchwork_pocha.py`, rebuilt with
`npm run blender -- patchwork-pocha`. Its editable checkpoint lives at
`_source-assets/world/hero-building/patchwork-pocha.blend`. Review controls are
at `/building-pilot.html`; `?world=pilot` loads the sample with the game's actual
vehicle, walking, collision, camera, lighting and post-processing systems.
The default city remains separate while the reusable kit is proved.

The original architectural/material ambition reference was
https://github.com/StarKnightt/night-street, supplied via the user's Reddit link.
The concept round established the user's preference. The accepted implementation
is documented in [the pilot guide and measured results](tools/blender/PATCHWORK-POCHA.md).
Existing HUD/gameplay accent meanings remain relevant. Concept art does not
establish runtime quality. Patchwork Pocha is accepted; after Moon Hotteok the
user requested the next building. Cloud Dumpling House is the third variant,
reviewed at `/building-pilot.html?building=cloud-dumpling`.

The second building reuses the approved materials, window helpers, bake/export
pipeline and runtime review. Its six-metre frontage, three storeys, pitched roof
and serving hatch test a different silhouette. Reduced texture resolutions give
21.3 MiB estimated image residency versus 85.3 MiB for the first building.
No additional concept generation was needed. See [Moon Hotteok](tools/blender/MOON-HOTTEOK.md).

Cloud Dumpling House adds an eight-metre-wide, five-storey mixed-use silhouette,
a dumpling shop, repair-studio frontage and roof terrace. It uses the same lower
texture resolutions and shared helpers. [The building kit guide](tools/blender/BUILDING-KIT.md)
records the inventory, authoring/runtime connections and remaining street work.
Individual exports still contain their own review roads and embedded textures.
The first assembly revealed that three similarly coloured restaurant shells did
not provide city-scale use or palette variety. Ochre Walk-up, Blue Ledger Offices
and Eulji Service Workshop now add residential, office and industrial frontages
without shop canopies or food signage. The corrected
[test assembly](tools/blender/STREET-ASSEMBLY.md) removes review components at
load time, places two copies of each of six buildings, shares matching surface
maps and builds a continuous 12 m road with 2.4 m pavements. Its broad return
bends passed full-throttle dry/wet truck tests. User review of the corrected
use/palette mix remains the next art gate before district expansion.

## First completed sample

- Four-storey corner building; detailed front and side, plausible rear and roof.
- Ground-floor late-night snack shop with an interior that has actual depth.
- Real window/door recesses, frames, sills, parapets, meaningful edge profiles.
- Distinct PBR brick/plaster/tile/metal/glass/fabric response, correct UV scale,
  authored wear and grime, no giant stretched facade-sheet windows.
- Legible, plausible Korean signage; deliberate awnings, services and clutter.
- Sidewalk, curb, drainage and road segment; a place for the delivery truck.
- Lighting and material response reviewed together, including local shop spill.
- Editable modeling recipes, .blend checkpoint, exported runtime geometry/maps,
  light-placement data, collision representation and preview PNGs.

The old city-wide 'boxes plus textures' optimization is not a requirement to
make this hero facade flat. Use geometry where it affects silhouette, parallax,
occlusion or shadows. Prove a reusable modular kit and measured runtime budgets
before propagating it. A detailed single building is not proof of city cost.

## Acceptance

1. User chooses a visual direction from concrete comparable samples.
2. Astra finishes the building and fixes visible defects before requesting art
   review. User acceptance of the actual runtime result is recorded explicitly.
3. Build three to five variants and a short street, then review repetition,
   composition, driving/walking clearance and performance before expansion.

Keep fixed front, corner, side, storefront, walking-height and truck-height
captures. Compare neutral daylight, morning, afternoon, dusk and night; wet and
dry pavement. Show rendered PNGs in replies. Every custom model needs its own
`tools/blender/previews/<id>.png`. No stale preview may pass a failed rebuild.

Final visual acceptance happens in the game's Three.js renderer, with the
actual camera, tone mapping, exposure and lighting. Blender studio renders are
authoring aids. Export/bake shader networks to glTF-compatible image maps; a
Blender procedural material looking good is not proof it survived export.

Measure triangles, draw calls, texture memory, loading and frame time; choose
budgets using the pilot/short-street measurements and target devices. Test
collision, vehicle clearance and delivery access. Desktop mobile-profile tests
are not physical-phone performance tests. Automated passes do not imply art
approval. Preserve accepted iterations, camera settings and unresolved issues.

## Tooling

See `tools/blender/mcp/README.md`. The project studio has named collections and
six framing cameras. It now contains the Patchwork Pocha pilot selected by the
user. Existing `npm run blender -- <id>` builds remain the
reproducible asset lane. MCP is for live scene work and inspection; save changes
back into recipes and named checkpoints.

The working game stays available during the pilot. The city is only replaced
after the sample and its larger-scale use have earned acceptance.
