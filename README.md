# 서울 스낵 어택 — Seoul Snack Attack

A third-person late-night street-snack delivery driving game set in a rainy, neon-lit Seoul district. Crazy Taxi–style timed orders with semi-realistic driving physics, built with Three.js. You are running 야식 (late-night snacks) across the city — tteokbokki, hotteok, eomuk, gimbap, chimaek, bingsu, gilgeori toast and pocha plates — before they go cold, spill, or melt.

The default city is a **procedural night circuit** (~264 × 192 m) built from the colour bible: six coloured neighbourhoods, a wide station boulevard, a market plaza shortcut, a roundabout, tight Hongdae/pocha streets, and a canal with three bridges. Buildings are generated, then labelled with Hangul neon (vertical blades and lintel strips) plus hanging Korean signage. The authored repeating block remains at `?world=block`.

This fork is a self-contained subfolder bootstrapped from Seoul Delivery; see `handoff.md` for current status and `ATTRIBUTION.md` for inherited licensing.

## Run it

```bash
npm install
npm run dev        # dev server (Vite)
npm run build      # static build → dist/
npm run preview    # serve the production build locally
```

### Windows Quick Start

Double-click [Quick Start.cmd](Quick%20Start.cmd) and choose a launch mode. The
menu defaults to the current Seoul Expanse build after 15 seconds, and also
offers a complete-map review, an Expanse mobile/performance test, and the
classic procedural city. `npm run quickstart` launches Expanse directly;
advanced terminal use can select `--launch=expanse-review`,
`--launch=expanse-mobile`, or `--launch=classic`.
It closes only processes listening on port 5273, installs dependencies when
needed, then starts the game on all local network interfaces and opens it.
Use `http://<this-computer-LAN-IP>:5273/` from another device on the same LAN.

The live `?world=expanse` mode is currently the last validated 25-node/35-edge,
1,000 × 720 m playable city. A trial that directly substituted the separate
74-node authoring graph at 85% scale and 125% road width was rejected: its
auto-generated connector edges became physical roads and its massing conflicted
with the widened carriageways and spawn. That prototype remains isolated in
`expanse-blueprint.js` / `expanse-rich-runtime.js`; it is not loaded by play.

A local server is required — `file://` cannot fetch GLB models (CORS). To deploy, upload the contents of `dist/` to any static host (e.g. SiteGround `public_html`). If the server doesn't know `.glb` MIME types, add one `.htaccess` line.

## Controls

| Key | Action |
| --- | --- |
| W/A/S/D or arrows | Drive |
| Mouse | Orbit camera after clicking the game |
| Space | Handbrake |
| C | Cockpit / chase camera |
| F | Exit vehicle |
| E | Accept order |
| R | Reset van to road |
| Hold T | Show the HUD and open menus fully in English |
| M | Toggle the full-city map (Escape also closes it) |
| ` (backtick) or F3 | Debug menu |

Paired Xbox controllers use the standard browser gamepad mapping:

| Xbox control | Action |
| --- | --- |
| Left stick | Steer |
| Right stick | Orbit camera |
| RT / LT | Accelerate / brake and reverse |
| A | Handbrake |
| Right stick (click) | Cockpit / chase camera |
| X | Accept order |
| Y | Reset van to road |
| Hold LB | Show the HUD fully in English |
| View | Debug menu |
| B | Exit vehicle |

On foot, movement switches to a Sketchbook-inspired character controller:

| Keyboard / Xbox | Action |
| --- | --- |
| W/A/S/D or left stick | Camera-relative movement |
| Mouse or right stick | Orbit camera |
| Shift or RB | Sprint |
| Space or A | Jump |
| F or B | Enter a nearby vehicle |
| R or Y | Reset to a safe road point |

**C sits you in the cab.** The pocha truck ships a modelled interior
(`public/assets/vehicles/pocha-interior.glb`), so the camera can move to the
driver's seat: the steering wheel tracks the rack, the speedometer sweeps a
100 km/h dial, and the head rolls with the truck instead of levelling against
the horizon. Mouse or right stick looks around the cab and drifts back to the
road when you let go. Vehicles with no `interior` block in
`src/game/data/vehicles.js` — the van today — stay on the chase camera and say
so. `?view=cockpit` starts in the seat.

Click the game while driving or on foot to capture the mouse for camera orbit;
Escape releases it. Vehicle pickups and drop-offs still require the delivery vehicle
inside the marked zone, so walking does not bypass the driving game.

On touch-first devices, optional dual-thumb controls appear automatically:
the left thumb controls throttle, brake, and reverse; the right thumb steers.
Handbrake and reset remain separate buttons while driving. On foot they become
Jump, Vehicle and Reset; the order card can still be tapped
to accept. The small `TOUCH` control cycles Auto, Off, and On. Desktop keyboard
and gamepad input remain active, and `?touch=on` forces the overlay for testing.

The same touch-first phone/tablet detection selects a mobile graphics budget
without changing gameplay physics: DPR 1, reduced-resolution bloom, fewer rain
particles and practical lights, reduced prop density, and tighter visual tile
culling. Desktop keeps the original full-quality settings. The `GFX` control
cycles Auto, Desktop, and Mobile and reloads the renderer; `?gfx=mobile` and
`?gfx=desktop` are explicit test overrides.

The soundtrack starts automatically when the browser permits it. If autoplay is
blocked, clicking or pressing a keyboard key once unlocks playback. The audio
chip in the bottom-left corner opens the cassette tape deck (카세트 데크): browse
the tape rack, insert a tape to play it, and use the transport and mix controls
there — including master mute. Every soundtrack track is a cassette with its
own label colourway.

## Snack roster

Eight authored shops serve a twenty-item menu of meal-kit and ready-to-eat sets,
each mapped to food models from the on-demand catalog (`src/game/data/restaurants.js`):
tteokbokki (신당 떡볶이 골목), hotteok (호떡 로드 카트), eomuk (부산 어묵 포차),
gimbap (광장 김밥 트럭), chimaek (홍대 치맥 거리), bingsu (서울 야간 편의점),
gilgeori toast (길거리 토스트 대장), and pocha (한강 노가리 포차).

Food condition is core mechanics: soup dishes spill under lateral G, fragile
sets suffer G-spikes, melts decay fast on the clock, and every hit costs payout.

## Colour bible

Source of truth for district paint, neon, signage and HUD accents:
open [color-bible.html](color-bible.html) on the dev server (also mirrored in
`src/world/data/color-bible.js`). The v1 snack palette gives each accent one job:

- **Tteokbokki red-orange** — urgency and alarm: timers, damage flashes, crash costs.
- **Banana-milk cream-gold** — money and only money: cash, payouts, rating stars.
- **Fish-cake teal-cyan** — navigation and interaction: objectives, drop-off beacons, minimap route.

## Debug menu

Hidden by default; toggle with backtick.

- **게임 (Game)** — offer order now, complete current order, +₩100,000, reset save, freeze timers
- **날씨 (Weather)** — condition preset, continuous rain density, wind X/Z; **노면** sub-folder for road wetness (lock it independently of the rain to shoot a wet street under a clear sky), dry rate, wet-grip toggle and a live wetness readout; **안개** sub-folder for fog density, wet-boost and colour
- **차량 (Vehicle)** — physics tuning (mass, engine, brakes, grip dry/wet, suspension, steering, downforce), teleport to pickup/dropoff, reset to spawn
- **후처리 (Post FX)** — master post toggle; **블룸** (enable, strength, radius, threshold), **톤 매핑** (ACES / AgX / Neutral / Cineon / Reinhard / none, plus exposure), resolution scale, and a live **성능** readout (FPS, draw calls, triangles)
- **조명 (Lighting)** — instant **밤/낮 (Night/Day)** presets plus live exposure, hemisphere/ambient/key light, environment intensity, fog, neon emissive strength, lamp intensity, and bloom
- **맵 (Map)** — tile count, tiles currently drawn, tile cull distance, mini-map X/Y flips
- **소품 물리 (Props)** — placed/awake counts, prop-vs-prop toggle, reset props, and a live **kg slider per prop type**
- **텍스처 (Textures)** — live comparison between the procedural asphalt pool (default) and the downloaded ambientCG "Asphalt 033" CC0 pack; **Source** toggle (Procedural / Downloaded) plus a 0..1 **Blend** slider that lerps the two pairs into a single owned normal+roughness pair on the road material. State persists across sessions.

### Persistent state

All tunable debug-menu values persist automatically in browser `localStorage`
under `seoul-snack-attack-debug-settings-v1` and are restored on the next game
restart. This includes weather, road wetness, vehicle physics, post FX,
lighting, map culling, timer freeze, prop collision, and prop masses. Action
buttons such as reset, teleport, and add cash remain one-shot actions.

All other persisted state uses the `snack-attack-` prefix so saves never collide
with the parent Seoul Delivery game: progression save (`snack-attack-save`),
audio mix and mute flags, soundtrack selection, graphics profile, touch-control
preference, and the intro-seen flag.

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
npm run vehicle pocha       # one vehicle, by recipe id
npm run props               # just the 8 street-prop packs
npm run district            # storefront + decorative diorama packs
npm run food                # on-demand pickup food and drink models
npm run blender             # headless Blender recipes → custom food GLBs
```

Pipeline notes: textures are re-encoded via sharp (raw-pixel decode to dodge broken ICC metadata); meshopt runs in a separate process because `@gltf-transform/functions` ships a nested sharp that conflicts with the root one (two libvips instances). The collision bake (`city.collider.bin`) is dev-only for the headless physics bench (`node tools/bench/bench.mjs`) and is not shipped.

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
The playable fleet is the pocha snack truck (hero) + the parent's van; the ripped
`compact` microcar was retired on 2026-08-25 (see `ATTRIBUTION.md`).

Delivery tickets keep their total steady between occasional time/condition
deductions and crash penalties, with each loss flashed beside the amount.
Reaching zero on the clock begins overtime instead of failing the order
immediately, so late or damaged deliveries remain worth finishing.

**Order food displays.** The eight-shop, twenty-item menu is visual-first: every
dish names one to three entries from the on-demand catalog in
`src/game/food-display.js`. Accepted orders load only their required GLBs, show
them in the pickup beacon, then float the item or arranged meal-kit group above
the player's vehicle until delivery. `npm run food` copies the lightweight GLBs
and converts the three OBJ packs; none of these assets enter the initial load.
Custom snacks (tteokbokki cup, hotteok) are authored as headless Blender
recipes — `npm run blender`, process in `tools/blender/README.md`.

**Street props.** `tools/build-props.mjs` turns the 8 `_source-assets/props/NikolaJankovic/` packs into 78 individually placeable props (3.2 MB total). Each pack is one merged mesh holding a dozen-plus objects on a shared atlas, so the script welds vertices, finds connected components, merges them by proximity, and emits one primitive per resulting object plus `catalog.json`. The weld is load-bearing — these OBJs split every vertex per face, so without it a bicycle reports ~1169 "objects" instead of one.

Identify props with `?props=gallery`, then name and weight them in `src/world/data/props.js`.

## Checks

```bash
npm run bench        # 20-metric physics bench vs baseline.json
npm run check        # full bench suite: tiling, roads, props, audio, touch, gfx, notes, encoding, proc city
npm run road-check   # connected road graph, no dead ends/bridges, all routes reachable
npm run proc-check   # procedural city graph, colour bible, Hangul shop names
npm run character-check # capsule collision + camera-relative walk smoke test
npm run vehicle-tuning-check # pocha bilateral stability through near-top speed
npm run probe -- "http://localhost:5173/?stats=1" 30 --size 400,300 --shot out.png
```

`tools/probe.mjs` drives the app in headless Chrome over the DevTools protocol and returns console output, exceptions and live scene state with the screenshot — a screenshot alone can't tell you *why* something didn't render. Headless uses SwiftShader (~1 fps), so pass a small `--size` when you only want state.

## Test URL params

Handy for screenshots and automated checks:

- `?car=van|pocha` — pick the vehicle (default `pocha`, the CC0 snack truck)
- `?rain=off|light|heavy` — force weather
- `?time=night|day` — force the initial time-of-day preset
- `?offer=1&accept=1` — spawn (and auto-accept) an order
- `?restaurant=<id>` — with `?offer=1`, select a specific shop for repeatable pickup QA
- `?shops=off` — disable the authored storefront/district dressing for performance QA
- `?auto=1` — full throttle self-drive
- `?overview=1` — static aerial view of the block
- `?shop=tteokbokki|hotteok|eomuk|gimbap|chimaek|bingsu|gilgeori|pocha` — frame an authored pickup storefront
- `?stats=1` — physics/tile/prop readout overlay
- `?props=off` — skip street props entirely
- `?props=gallery` — lay every catalog prop out on a labelled grid (curation mode)
- `?touch=on|off|auto` — override touch-control detection
- `?gfx=mobile|desktop|auto` — override the graphics profile
- `?world=proc|block|expanse` — procedural night circuit (default), authored repeating block, or the approved kilometre-scale Expanse
- `?map=1` — open the north-up full-city map at boot for QA
- `?expanseView=station|market|bridge|westBridge|eastBridge|tunnel|hills|hongdae|hangang|pocha` — static review cameras for Expanse district art passes
- `?world=expanse2&expanseView=plan|massing*|facade*|shopBoard|landmarkTower` — the rebuild's own review cameras (see `CITY-REBUILD.md`)
- `?intro=off` — QA/probe hook: skip the release card without persisting the seen flag
- `?mode=foot` — start beside the current vehicle in on-foot mode
- `?view=cockpit` — boot into the first-person cab (pocha only; the van has no interior)

Example: `http://localhost:5273/?rain=heavy&offer=1&accept=1&auto=1`

The original Seoul/GTA world specification is in `WORLD-SWARM-BRIEF.md`, with
headless-Blender outputs under `_source-assets/world/seoul-expanse/`. Those
assets are reference material, not the current live world. The validated
25-node/35-edge city in `src/world/expanse-layout.js` is active again. Current
architecture, recovery status, and the ordered backlog live in
[EXPANSE-HANDOFF.md](EXPANSE-HANDOFF.md).

See `ATTRIBUTION.md` for asset sources/licensing status — this fork inherits all of the parent project's licensing constraints.

## Project layout

```
dist/                    STATIC UPLOAD: upload its contents to any static host
public/
  assets/world/          optimized city runtime model
  assets/vehicles/       optimized playable vehicles + rig sidecars
  assets/{props,food,district}/  categorized runtime models and textures
  audio/music/           normalized web soundtrack files; BUDAE is first
_source-assets/          local build inputs used by npm run assets (not upload)
_staging/unused/         quarantined unused originals/duplicates (not upload)
src/
  main.js               boot, renderer, fixed-timestep loop
  core/input.js         keyboard + gamepad
  core/post.js          EffectComposer + bloom
  core/rng.js           seeded PRNG + per-tile seed mixing
  world/city.js         city GLB, night lighting, BVH collision, tiling, delivery points
  world/skybox.js       procedural 360-degree storm sky + PBR environment
  world/time-of-day.js  cached day/night preset coordinator
  world/city-constants.js  scale, tile grid, clip predicate (shared with tools/)
  world/data/color-bible.js  night colour bible (districts, neon, snack palette)
  world/proc/           procedural city: layout, mesh, signs, loadProcCity
  world/tiling.js       tile transforms + tile-local raycast over ONE BVH
  world/road-network.js closed ladder graph, projection, routing, delivery anchors
  world/streetlights.js fixed light pool + instanced glow pools
  world/props.js        prop load, per-tile seeded placement, instanced render
  world/data/props.js   hand-authored prop names, masses, placement rules
  world/rain.js         rain streaks, splashes, wetness
  physics/prop-world.js rigid bodies for knockable props (Jolt-swappable facade)
  physics/shapes.js     inertia tensors, OBB SAT, support points
  vehicle/van.js        van GLB load/normalize, wheels, lights
  vehicle/physics.js    custom raycast vehicle (three-mesh-bvh), crash events
  vehicle/camera.js     chase cam
  vehicle/cockpit-camera.js  first-person seat: free look, head sway, truck roll
  vehicle/interior.js   cabin GLB, dome lamp, steering wheel and speedometer
  character/controller.js  fixed-step on-foot states + vehicle entry/exit
  character/camera.js   orbit camera, look-ahead and wall pull-in
  character/model.js    original swappable low-poly courier placeholder
  world/capsule-collision.js  upright capsule resolution against the city BVH
  game/data/restaurants.js  snack-shop roster and pickup menu
  game/orders.js        order state machine, quality/rating/payout, save
  ui/hud3.js            DOM HUD (Korean-first bilingual, three-accent style)
  ui/debug.js           lil-gui debug menu
tools/                  asset pipeline (obj2gltf, webp, meshopt) + build-props
tools/probe.mjs         headless Chrome probe (console + state + screenshot)
tools/bench/            physics bench + check suites
```
