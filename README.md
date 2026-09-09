# 서울 배달 — Seoul Delivery

A third-person delivery driving game set in a rainy, neon-lit Seoul district. Crazy Taxi–style timed orders with semi-realistic driving physics, built with Three.js.

The default city is a **procedural night circuit** (~264 × 192 m) built from the colour bible: six coloured neighbourhoods, a wide station boulevard, a market plaza shortcut, a roundabout, tight Hongdae/pocha streets, and a canal with three bridges. Buildings are generated, then labelled with Hangul neon (vertical blades and lintel strips) plus hanging Korean signage. The authored repeating block remains at `?world=block`.

## Run it

```bash
npm install
npm run dev        # dev server (Vite)
npm run build      # static build → dist/
npm run preview    # serve the production build locally
```

### Windows Quick Start

Double-click [Quick Start.cmd](Quick%20Start.cmd), or run `npm run quickstart`.
It closes only processes listening on port 5173, installs dependencies when
needed, then starts the game on all local network interfaces and opens it.
Use `http://<this-computer-LAN-IP>:5173/` from another device on the same LAN.

A local server is required — `file://` cannot fetch GLB models (CORS). To deploy, upload the contents of `dist/` to any static host (e.g. SiteGround `public_html`). If the server doesn't know `.glb` MIME types, add one `.htaccess` line.

## Controls

| Key | Action |
| --- | --- |
| W/A/S/D or arrows | Drive |
| Space | Handbrake |
| E | Accept order |
| R | Reset van to road |
| Hold T | Show the HUD and open menus fully in English |
| M | Mute/unmute soundtrack |
| ` (backtick) or F3 | Debug menu |

Paired Xbox controllers use the standard browser gamepad mapping:

| Xbox control | Action |
| --- | --- |
| Left stick | Steer |
| RT / LT | Accelerate / brake and reverse |
| A | Handbrake |
| X | Accept order |
| Y | Reset van to road |
| Hold LB | Show the HUD fully in English |
| View | Debug menu |

On touch-first devices, optional dual-thumb controls appear automatically:
the left thumb controls throttle, brake, and reverse; the right thumb steers.
Handbrake and reset remain separate buttons, and the order card can be tapped
to accept. The small `TOUCH` control cycles Auto, Off, and On. Desktop keyboard
and gamepad input remain active, and `?touch=on` forces the overlay for testing.

The same touch-first phone/tablet detection selects a mobile graphics budget
without changing gameplay physics: DPR 1, reduced-resolution bloom, fewer rain
particles and practical lights, reduced prop density, and tighter visual tile
culling. Desktop keeps the original full-quality settings. The `GFX` control
cycles Auto, Desktop, and Mobile and reloads the renderer; `?gfx=mobile` and
`?gfx=desktop` are explicit test overrides.

The soundtrack starts automatically when the browser permits it. If autoplay is
blocked, clicking or pressing a keyboard key once unlocks playback.

## Debug menu

Hidden by default; toggle with backtick.

- **게임 (Game)** — offer order now, complete current order, +₩100,000, reset save, freeze timers
- **날씨 (Weather)** — condition preset, continuous rain density, wind X/Z; **노면** sub-folder for road wetness (lock it independently of the rain to shoot a wet street under a clear sky), dry rate, wet-grip toggle and a live wetness readout; **안개** sub-folder for fog density, wet-boost and colour
- **차량 (Vehicle)** — physics tuning (mass, engine, brakes, grip dry/wet, suspension, steering, downforce), teleport to pickup/dropoff, reset to spawn
- **후처리 (Post FX)** — master post toggle; **블룸** (enable, strength, radius, threshold), **톤 매핑** (ACES / AgX / Neutral / Cineon / Reinhard / none, plus exposure), resolution scale, and a live **성능** readout (FPS, draw calls, triangles)
- **조명 (Lighting)** — instant **밤/낮 (Night/Day)** presets plus live exposure, hemisphere/ambient/key light, environment intensity, fog, neon emissive strength, lamp intensity, and bloom
- **맵 (Map)** — tile count, tiles currently drawn, tile cull distance, mini-map X/Y flips
- **소품 물리 (Props)** — placed/awake counts, prop-vs-prop toggle, reset props, and a live **kg slider per prop type**

### Persistent debug settings

All tunable debug-menu values persist automatically in browser `localStorage`
under `seoul-delivery-debug-settings-v1` and are restored on the next game
restart. This includes weather, road wetness, vehicle physics, post FX,
lighting, map culling, timer freeze, prop collision, and prop masses. Action
buttons such as reset, teleport, and add cash remain one-shot actions.

In a development build, the current saved values are available at
`window.__seoul.debug.getSettings()` for inspection or handoff.

## Assets

The active night or day sky is generated at boot by `src/world/skybox.js`; the alternate is generated lazily on its first menu switch. Each 360-degree panorama is prefiltered into a matching PBR environment, keeping the visible sky and wet-street reflections consistent without shipping external HDRIs.

Build inputs that are actually used live under `_source-assets/`. Optimized
runtime assets are generated into the categorized `public/assets/` tree. Media
that is not used by either the site or its asset pipeline is isolated under
`_staging/unused/` and is never deployed:

```bash
npm run assets              # every vehicle + city + props + district + food
npm run vehicle compact     # one vehicle, by recipe id
npm run props               # just the 8 street-prop packs
npm run district            # storefront + decorative diorama packs
npm run food                # on-demand pickup food and drink models
```

Pipeline notes: textures are re-encoded via sharp (raw-pixel decode to dodge broken ICC metadata); meshopt runs in a separate process because `@gltf-transform/functions` ships a nested sharp that conflicts with the root one (two libvips instances). The collision bake (`city.collider.bin`) is dev-only for the headless physics bench (`node tools/bench/bench.mjs`) and is not shipped.

The city build first runs `tools/prepare-city.mjs`, which keeps the authored scene but joins compatible primitives before WebP and meshopt compression. This reduces the raw city from 466 nodes / 563 materials to 57 nodes / 98 materials; the runtime collision BVH is generated in a worker so its 1.85 million collision vertices do not freeze the loading overlay.

**Vehicles.** `tools/build-vehicle.mjs <recipeId>` runs obj2gltf →
`normalize-vehicle.mjs` → optimize → meshopt. The normalize step is what lets a
second vehicle exist at all: it measures the rig once at build time and emits a
canonical GLB (`body`, `wheel_fl/fr/rl/rr`, +Z forward, +X body left) plus a
sidecar JSON of hub positions, radii, track, wheelbase and ground plane. It has
to run *before* meshopt, while accessors are still Float32 — meshopt quantizes
POSITION to normalized Int16 and moves the real scale onto the node transform.

Per-vehicle build settings live in `tools/vehicle-recipes.mjs` (which axis is
forward, which nodes are scenery, which nodes to mine for wheels); handling and
material roles live in `src/game/data/vehicles.js`. `src/vehicle/vehicle.js`
just reads the baked rig. The van is still on the older runtime-heuristic
loader (`src/vehicle/van.js`) — see the `van` note in `vehicles.js` for why.

The garage starts with the van. The yellow compact costs **₩100,000**, persists
as an owned vehicle after purchase, and can then be selected from the garage.
The debug vehicle picker and `?car=van|compact` remain unrestricted for testing.

Delivery tickets keep their total steady between occasional time/condition
deductions and crash penalties, with each loss flashed beside the amount.
Reaching zero on the clock begins overtime instead of failing the order
immediately, so late or damaged deliveries remain worth finishing.

**Order food displays.** The six-shop, fourteen-item menu is visual-first: every
dish names one to three entries from the on-demand catalog in
`src/game/food-display.js`. Accepted orders load only their required GLBs, show
them in the pickup beacon, then float the item or arranged meal-kit group above
the player's vehicle until delivery. `npm run food` copies the lightweight GLBs
and converts the three OBJ packs; none of these assets enter the initial load.

**Street props.** `tools/build-props.mjs` turns the 8 `_source-assets/props/NikolaJankovic/` packs into 78 individually placeable props (3.2 MB total). Each pack is one merged mesh holding a dozen-plus objects on a shared atlas, so the script welds vertices, finds connected components, merges them by proximity, and emits one primitive per resulting object plus `catalog.json`. The weld is load-bearing — these OBJs split every vertex per face, so without it a bicycle reports ~1169 "objects" instead of one.

Identify props with `?props=gallery`, then name and weight them in `src/world/data/props.js`.

## Checks

```bash
npm run bench        # 20-metric physics bench vs baseline.json
npm run check        # tiling correctness + prop physics behaviour
npm run road-check   # connected road graph, no dead ends/bridges, all routes reachable
npm run proc-check   # procedural city graph, colour bible, Hangul shop names
npm run probe -- "http://localhost:5173/?stats=1" 30 --size 400,300 --shot out.png
```

`tools/probe.mjs` drives the app in headless Chrome over the DevTools protocol and returns console output, exceptions and live scene state with the screenshot — a screenshot alone can't tell you *why* something didn't render. Headless uses SwiftShader (~1 fps), so pass a small `--size` when you only want state.

## Test URL params

Handy for screenshots and automated checks:

- `?car=van|compact` — pick the vehicle (default `van`)
- `?rain=off|light|heavy` — force weather
- `?time=night|day` — force the initial time-of-day preset
- `?offer=1&accept=1` — spawn (and auto-accept) an order
- `?restaurant=<id>` — with `?offer=1`, select a specific restaurant for repeatable pickup QA
- `?shops=off` — disable the authored storefront/district dressing for performance QA
- `?auto=1` — full throttle self-drive
- `?overview=1` — static aerial view of the block
- `?shop=hongru|bhc|sinjeon|jokbal|bingsu|pizzamaru|donkatsu|budae|naengmyeon` — frame an authored pickup storefront
- `?stats=1` — physics/tile/prop readout overlay
- `?props=off` — skip street props entirely
- `?props=gallery` — lay every catalog prop out on a labelled grid (curation mode)
- `?touch=on|off|auto` — override touch-control detection
- `?gfx=mobile|desktop|auto` — override the graphics profile
- `?world=proc|block` — procedural night circuit (default) or the authored repeating block

Colour bible (source of truth for district paint, neon, and HUD accents): open [color-bible.html](color-bible.html) on the dev server.

Example: `http://localhost:5173/?rain=heavy&offer=1&accept=1&auto=1`

See `ATTRIBUTION.md` for asset sources/licensing status.

## Project layout

```
dist/                    SITEGROUND UPLOAD: upload its contents to public_html
public/
  assets/world/          optimized city runtime model
  assets/vehicles/       optimized playable vehicles + rig sidecars
  assets/{props,food,district}/  categorized runtime models and textures
  audio/music/           normalized web soundtrack files; BUDAE is first
_source-assets/          local build inputs used by npm run assets (not upload)
_staging/unused/         quarantined unused originals/duplicates (not upload)
src/
  main.js               boot, renderer, fixed-timestep loop
  core/input.js         keyboard
  core/post.js          EffectComposer + bloom
  core/rng.js           seeded PRNG + per-tile seed mixing
  world/city.js         city GLB, night lighting, BVH collision, tiling, delivery points
  world/district-extension.js unique quay roads, canal, rail and collision BVH
  world/skybox.js       procedural 360-degree storm sky + PBR environment
  world/time-of-day.js  cached day/night preset coordinator
  world/city-constants.js  scale, tile grid, clip predicate (shared with tools/)
  world/data/color-bible.js  night colour bible (districts, neon, shop pack)
  world/proc/           procedural city: layout, mesh, signs, loadProcCity
  world/tiling.js       tile transforms + tile-local raycast over ONE BVH
  world/road-network.js closed ladder graph, projection, routing, delivery anchors
  world/end-zones.js    connector roads, markings, signage, barriers + second BVH
  world/streetlights.js fixed light pool + instanced glow pools
  world/props.js        prop load, per-tile seeded placement, instanced render
  world/data/props.js   hand-authored prop names, masses, placement rules
  world/rain.js         rain streaks, splashes, wetness
  physics/prop-world.js rigid bodies for knockable props (Jolt-swappable facade)
  physics/shapes.js     inertia tensors, OBB SAT, support points
  vehicle/van.js        van GLB load/normalize, wheels, lights
  vehicle/physics.js    custom raycast vehicle (three-mesh-bvh), crash events
  vehicle/van-spec.js   the van's collision box, shared with prop collision
  vehicle/camera.js     chase cam
  game/data/restaurants.js  Korean restaurant/dish data
  game/orders.js        order state machine, quality/rating/payout, save
  ui/hud.js             DOM HUD (Korean-first bilingual)
  ui/debug.js           lil-gui debug menu
tools/                  asset pipeline (obj2gltf, webp, meshopt) + build-props
tools/probe.mjs         headless Chrome probe (console + state + screenshot)
tools/bench/            physics bench, tiling-check, props-check
```
