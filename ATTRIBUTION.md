# Asset Attribution

Seoul Delivery — asset sources and licenses.

## Vehicles

- `_source-assets/vehicles/grace-van/` — Korean van (Hyundai Grace style), OBJ + PBR texture set. Source: owner-provided asset pack. License: TBD by owner.

### Bubble microcar — **SHIPPED, RIPPED GAME CONTENT (hard release blocker)**

`_source-assets/vehicles/compact/` is built by
`tools/build-vehicle.mjs` into `public/assets/vehicles/compact.glb` and is selectable
in-game via `?car=compact`.

Despite the pack name it is not a Seoul compact car: it is a stylised two-seat
bubble microcar, and its `Thumbnail.jpg` carries a visible **AGENTS OF MAYHEM**
watermark — i.e. it is extracted content from the Volition / Deep Silver
commercial game. The sibling pack `02- Seoul.Small.Van/` is from the same rip
and carries a `JEGUNG` livery from the same game.

This is a worse provenance than anything else in the project: the Sketchfab
packs are at least unattributed third-party uploads, whereas this is
first-party content from a shipped commercial title, used here as the *hero*
vehicle rather than as background dressing.

**Retained deliberately** — the owner selected it on 2026-08-14 for an
internal demo on the grounds that it has the best rig data of any vehicle in
the original media library now quarantined under `_staging/unused/media-library/`
(per-corner wheel groups, semantic tire/light materials).
It must be replaced before any public, external or commercial use of this
build. The replacement cost is low by design: the rig lives in a recipe
(`tools/vehicle-recipes.mjs`), not in code, so swapping the asset is a recipe
edit plus a rebuild.

Candidates evaluated and rejected for this slot, for the record:

| Asset | Rig quality | Why not |
|---|---|---|
| `MERRORStudio/01- …Seoul.Taxi` | none — wheels welded into the body mesh | best thematic fit and legitimate studio work (ME.RROR), but needs a manual wheel split in Blender first |
| `TimSamedov/01- SsangYong.Transtar.Bus` | good — named front wheels, splittable rear axle | 11.5 m; will not turn in the block grid without its own vehicle class |
| `baronkri/02- Seoul.Small.Van` | fair — named front wheels, no tire material | same Agents of Mayhem rip; rear wheels not separable by material |
| `NikolaJankovic/01–02 Car` | none — single `defaultMaterial` group | already shipped as static props |
| `ConorNorwood/01- Seoul.Streetcar` | none | rail-bound, single group |

## City
- `_source-assets/city/Untitled4.glb` — hand-built Seoul-inspired city block (Blender, exported via Khronos glTF Blender I/O v4.4.56). Contains embedded third-party props (Sketchfab "Orange Bollard vjctceu", leaf assets). License: TBD by owner.

## Street texture kit
- `_staging/unused/media-library/textures/` — currently unused sidewalk/road/manhole/tactile-paving PBR sets (Poly Haven / ambientCG-style naming), Korean storefront facades (Google Street View–style captures and Gemini-generated images), Korean road decals. License: TBD by owner.

## Street props — **SHIPPED, UNLICENSED (release blocker)**

`_source-assets/props/NikolaJankovic/` — 8 OBJ + PBR packs, attributed only by the
folder name. The GUID filenames, `Thumbnail.jpg` and channel-suffixed maps are a
Sketchfab bulk-download signature, so "NikolaJankovic" is almost certainly the
Sketchfab username; no license file, URL or author statement ships with them.

These are no longer just raw material: `tools/build-props.mjs` cuts them into 78
individual props and writes them to `public/assets/props/*.glb`, which **is**
build output and **is** committed. That moves them from a gitignored working
directory into the shipped payload.

| Pack | Built as | Contents |
|---|---|---|
| `01- Car` | `car-microvan.glb` | Korean microvan — a recognisable real vehicle |
| `02- Car` | `car-truck.glb` | walk-through delivery truck — likewise |
| `03- Seoul.Props.10` | `bikes.glb` | 3 bicycles + cargo trike |
| `04- Seoul.Props.9` | `barriers.glb` | pedestrian guardrails, bike rack, tree guard |
| `05- Seoul.Props.4` | `signage.glb` | Korean shop signage (contains real brand/shop names) |
| `06- Seoul.Props.7` | `hvac.glb` | AC condensers, utility boxes, ducts |
| `07- Seoul.Props.2` | `trafficsigns.glb` | Korean traffic and speed-limit signs |
| `08- Seoul.Props.1` | `street.glb` | bollards, cone, hydrant, bin, lamp posts |

Before any public release: obtain the source URLs and licenses, confirm
redistribution of derivative (re-cut, re-textured) geometry is permitted, and
check the vehicle packs for trademark exposure. Until then treat
`public/assets/props/` as internal-only.

## Procedural city shop-pack — **SHIPPED, UNLICENSED (release blocker)**

`_staging/asian-shop-pack-free-gameready/` was copied into
`public/assets/district/shop-pack/` for an earlier facade pass. The procedural
city no longer stamps those atlas pages; streets are labelled with original
Hangul neon instead. The files remain in the tree but are unused at runtime.

The colour bible is original to this project: `src/world/data/color-bible.js`
and `color-bible.html`.

## District dressing — **SHIPPED, UNLICENSED (release blocker)**

- `_source-assets/district/storefronts/` — Asian/Korean
  storefront strip used for the nine authored restaurant pickup rows. The pack
  contains visible real-world brands and bank/shop signage. Source URL, author
  identity, and redistribution license were not included.
- `_source-assets/district/retro-arcade/` — Final Fantasy VII / Sony
  PlayStation fan diorama used only as three small decorative retro-arcade
  displays. It contains recognizable copyrighted/trademarked subject matter.
  Source URL and redistribution license were not included.

`tools/build-district.mjs` writes derived runtime files to
`public/assets/district/`. Both packs are internal-only until their licenses and
brand/IP exposure are cleared; the FFVII display should be replaced before any
public or commercial release even if model redistribution is otherwise allowed.

## Generated district textures

- `public/assets/district/textures/seoul-facade-weathered.webp` — tileable
  weathered concrete/plaster façade surface generated for this project with
  OpenAI ImageGen on 2026-08-13; contains no logos or readable text.
- `public/assets/district/textures/seoul-windows-night.webp` — tileable dark
  glazing and varied illuminated-window surface generated for this project with
  OpenAI ImageGen on 2026-08-13; contains no logos or readable text.

These replace the visibly corrupted source diffuse image while retaining the
owner-supplied storefront geometry.

## Order food displays — **SHIPPED, UNLICENSED (release blocker)**

- `_source-assets/food/{jin-ramen_cup_noodle,ramen,dakggochi}.glb`
- `_source-assets/food/{luncheon_meat_fake_spam,roka_korean_sauce_in_army}.glb`
- `_source-assets/food/{gochujang_korea,ssamjang_korea}.glb`
- `_source-assets/food/{low_poly_soju_bottle__soda_bottle,packaged-rice}.glb`
- `_source-assets/food/{buldak-cup,samyang-cup,korean-cans}/` — OBJ/MTL/texture packs

`tools/build-food.mjs` copies or converts these into twelve on-demand GLBs in
`public/assets/food/`. The 31 MB bibimbap scan, 52 MB lollipop, and 77 MB Shin
Ramyun scan are deliberately excluded. The older real-brand Spam GLB is also no
longer built; the menu uses the smaller fictional luncheon-meat package.

Several retained packages still display real brands. Embedded generator
metadata and folder structure identify Sketchfab-style exports, but no source
URL, author statement, or redistribution license was included. Treat them as
internal-only and replace or license them before public distribution.

All items to be replaced or properly licensed before public release (see handoff.md §10).
