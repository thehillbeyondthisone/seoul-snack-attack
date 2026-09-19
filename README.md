# 서울 스낵 어택 — Seoul Snack Attack

A third-person late-night street-snack delivery driving game set in a rainy, neon-lit Seoul district. Crazy Taxi–style timed orders with semi-realistic driving physics, built with Three.js. You are running 야식 (late-night snacks) across the city — tteokbokki, hotteok, eomuk, gimbap, chimaek, bingsu, gilgeori toast and pocha plates — before they go cold, spill, or melt.

The default city is the **Expanse rebuild** (`expanse2`): a kilometre of Seoul,
1,211 buildings, six colour-bible districts, eight delivery restaurants, three
bridges, surfaced roads, Hangul signage and original street details. Optional
details stream in over the first seconds of play. The compact procedural night
circuit remains at `?world=proc`, the earlier Expanse at `?world=expanse`, and the
authored repeating block at `?world=block`.

This fork is a self-contained subfolder bootstrapped from Seoul Delivery; see `handoff.md` for current status and `ATTRIBUTION.md` for inherited licensing.

**Building quality pilot:** [WORLD-BUILDING-PILOT.md](WORLD-BUILDING-PILOT.md)
records the accepted one-building-and-shop approach. Open **Blender World
Studio.cmd** for its authoring workspace; setup and MCP verification are in
[the studio guide](tools/blender/mcp/README.md).

**Building kit:** open [the building review](building-pilot.html) on
the dev server to orbit the model and compare lighting. Its **Drive & walk
here** link enters `?world=pilot` with the real game controls. The selector includes
three snack-shop buildings plus a residential walk-up, office and service workshop.
[Patchwork Pocha](tools/blender/PATCHWORK-POCHA.md) ·
[Moon Hotteok](tools/blender/MOON-HOTTEOK.md) ·
[Cloud Dumpling House](tools/blender/CLOUD-DUMPLING.md) ·
[Ochre Walk-up](tools/blender/OCHRE-WALKUP.md) ·
[Blue Ledger Offices](tools/blender/BLUE-OFFICE.md) ·
[Eulji Service Workshop](tools/blender/SERVICE-WORKSHOP.md) ·
[How the kit fits together](tools/blender/BUILDING-KIT.md).

The [coherence pass](tools/blender/COHERENCE-PASS.md) aligns the newer facades
with the accepted Pocha kit and addresses startup shader stalls.

**Test street assembly:** choose **Snack Street · assembly** in the review, or
press backtick and choose **야식 투어 → 스낵 스트리트 운전**, or play
`?world=pilot&building=street-assembly&intro=off&props=off`. Twelve buildings—
two of each of six types—share a 12 m road and 2.4 m pavements, with broad return bends for
full-speed testing. Patchwork Pocha, Moon Hotteok and Cloud Dumpling House now
form a compact playable delivery loop: accept with **E**, collect at the named
shop entrance and deliver to one of the other two shops. [Dimensions and validation](tools/blender/STREET-ASSEMBLY.md).

## Run it

```bash
npm install
npm run dev        # dev server (Vite)
npm run build      # static build → dist/
npm run preview    # serve the production build locally
```

### Windows Quick Start

Double-click [Quick Start.cmd](Quick%20Start.cmd) and choose one of three: play
the current rebuild (`?world=expanse2`), the previous Expanse, or the classic
procedural circuit. It defaults to the current game after 15 seconds.

Everything else is in-game — **Escape** (or F3) opens **설정 · Settings**, and
the **튜닝 메뉴 · Tuning menu** inside it has a **도시 · World** switcher and all
the graphics/weather/vehicle controls — or via the terminal: `npm run quickstart -- --launch=<name>`, where `<name>` is
`expanse-review`, `expanse-mobile`, `plan`, `expanse2`, or `cockpit` (boots the
rebuild straight into the pocha's first-person cab; `C` toggles it in any mode).
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
| V | Chase camera angle: low / medium / high |
| F | Exit vehicle |
| E | Accept order |
| R | Reset van to road |
| Hold T | Show the HUD and open menus fully in English |
| M | Toggle the full-city map (Escape also closes it) |
| P | Open/close the cassette player and choose an unlocked song |
| Escape or F3 | Settings (and back out of the tuning menu) |
| ` (backtick) | Open/close the tuning menu directly |

Paired Xbox controllers use the standard browser gamepad mapping:

| Xbox control | Action |
| --- | --- |
| Left stick | Steer |
| Right stick | Orbit camera |
| RT / LT | Accelerate / brake and reverse |
| A | Handbrake |
| Right stick (click) | Cockpit / chase camera |
| D-pad up | Chase camera angle: low / medium / high |
| X | Accept order |
| Y | Reset van to road |
| Hold LB | Show the HUD fully in English |
| View | Settings |
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
150 km/h dial, and the head rolls with the truck instead of levelling against
the horizon. Mouse or right stick looks around the cab and drifts back to the
road when you let go. Vehicles with no `interior` block in
`src/game/data/vehicles.js` — the van today — stay on the chase camera and say
so. `?view=cockpit` starts in the seat.

Click the game while driving or on foot to capture the mouse for camera orbit;
Escape releases it. Vehicle pickups and drop-offs still require the delivery vehicle
inside the marked zone, so walking does not bypass the driving game.

On touch-first devices, optional dual-thumb controls appear automatically:
the left thumb controls throttle, brake, and reverse; the right thumb steers.
Compact icons provide reset and vehicle entry/exit; Jump and Sprint appear on
foot, and Rise/Dive appear underwater. Tap an order card to accept. The language
icon at the right toggles English and remembers the choice. Settings contains
Garage, camera view/height and Touch controls (Auto / On / Off). Desktop keyboard
and gamepad input remain active, and `?touch=on` forces the overlay for testing.

The same touch-first phone/tablet detection selects a mobile graphics budget
without changing gameplay physics: DPR 1, reduced-resolution bloom, fewer rain
particles and practical lights, reduced prop density, and tighter visual tile
culling. Desktop keeps the original full-quality settings. The `GFX` control
cycles Auto, Desktop, and Mobile and reloads the renderer; `?gfx=mobile` and
`?gfx=desktop` are explicit test overrides.

The soundtrack starts automatically when the browser permits it. If autoplay is
blocked, clicking or pressing a keyboard key once unlocks playback. The persistent
3D cassette in the bottom-left corner, **P**, or **Settings → Music → Tape deck**
opens the cassette tape deck (카세트 데크). Opening releases the mouse and pauses
driving/orders while music continues. Click any unlocked cassette to play it; browse
the tape rack, insert a tape to play it, and use Previous, Play/Pause, Next and
Mute. Audio uses a fixed balance; the mixing sliders have been removed. Every soundtrack track is a cassette with its
own label colourway.

The rack contains **12 cassettes**, with seven available at the start.
Each working day takes **four successful deliveries**: morning (06:00),
afternoon (12:00), dusk (18:00), then night (00:00). Finishing the fourth
delivery starts the next morning. The HUD shows the day, phase and delivery
progress; waiting, pickups, expired offers and menus do not advance the day.
Sky, reflections, lighting and lamps blend to each new phase over three seconds.

Completing days **1–4** unlocks **Abyssal Ramen Submarine**, **Blade of Hatred**,
**Rapid-fire**, then **Supersonic** (4/8/12/16 deliveries). The cycle continues
after all four rewards are collected. Existing saves keep tapes earned under
the former 3/6/9/12 milestones. Day progress and earned tapes survive reloads.
Locked tapes show their requirements and are skipped by automatic playback and Next/Prev.

Crossing the Drain ramp's launch lip crossfades **Dive** over the playing
cassette in 1.6 seconds. Its first successful playback permanently unlocks
the Dive tape in the rack. The selected cassette resumes afterward; selecting
another tape overrides the cue. Web Audio gains handle the fade, both media
elements are prepared on user interaction, and pause/mute cover both lanes.

The Drain leads into an underwater pocket with sunken landmarks and drifting
jellyfish. **Shift / RB** dives; **Space / A** rises slowly. The depth display
replaces the delivery panels, and the pale opening overhead leads home.
**C** still switches between the dimmed cab and chase view. Review shortcuts:
`?dive=ramp` lines up the jump; `?dive=1` enters the abyss directly.

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

## Settings

Escape (or F3, **View** on a pad, or the **설정 · SETTINGS** chip in the
bottom-left stack) opens and closes the settings menu. It pauses the
delivery loop while it is up, the same way the garage and the city map do.

- **조작 (Controls)** — the complete keyboard, mouse and controller bindings.
  A compact copy remains on the HUD only until the first delivery is completed.
- **화면 (Display)** — graphics quality: 자동 / 데스크톱 / 모바일. Mobile trims
  resolution, rain, props and streetlights; physics and progression are
  untouched. Changing it reloads, because the profile is read once at boot.
- **개발자 도구 (Developer tools)** — **성능 오버레이** turns on the physics /
  draw-call readout (off by default; `?stats=1` starts it on for probes),
  and **튜닝 메뉴 · 열기** opens the lil-gui tuning tree below.

Both developer rows persist per browser under `snack-attack-settings-v1`.

## Tuning menu

Opened directly with backtick, or from Settings > 개발자 도구 > 튜닝 메뉴.
Backtick closes it again; Escape also backs out of it.

- **야식 투어 (Night tour)** — one-click travel to the driveable or orbit-camera test street, building kit, current Seoul, hippo cockpit, Drain jump, Abyss, prop gallery and colour bible. Navigation actions use the bible's cyan accent and clear stale review flags.
- **게임 (Game)** — offer order now, complete current order, +₩100,000, reset save, freeze timers
- **날씨 (Weather)** — condition preset, continuous rain density, wind X/Z; **노면** sub-folder for road wetness (lock it independently of the rain to shoot a wet street under a clear sky), dry rate, wet-grip toggle and a live wetness readout; **안개** sub-folder for fog density, wet-boost and colour
- **차량 (Vehicle)** — physics tuning (mass, engine, brakes, grip dry/wet, suspension, steering, downforce), teleport to pickup/dropoff, reset to spawn
- **후처리 (Post FX)** — master post toggle; **블룸** (enable, strength, radius, threshold), **톤 매핑** (ACES / AgX / Neutral / Cineon / Reinhard / none, plus exposure), resolution scale, and a live **성능** readout (FPS, draw calls, triangles)
- **조명 (Lighting)** — morning/day/dusk/night review presets plus live exposure, hemisphere/ambient/key light, environment intensity, fog, neon emissive strength, lamp intensity, and bloom. The next delivery resumes the working-day cycle.
- **맵 (Map)** — tile count, tiles currently drawn, tile cull distance, mini-map X/Y flips
- **소품 물리 (Props)** — placed/awake counts, prop-vs-prop toggle, reset props, and a live **kg slider per prop type**
- **텍스처 (Textures)** — live comparison between the procedural asphalt pool (default) and the downloaded ambientCG "Asphalt 033" CC0 pack; **Source** toggle (Procedural / Downloaded) plus a 0..1 **Blend** slider that lerps the two pairs into a single owned normal+roughness pair on the road material. State persists across sessions.

### Persistent state

All tunable debug-menu values persist automatically in browser `localStorage`
under `seoul-snack-attack-debug-settings-v1` and are restored on the next game
restart. This includes weather, road wetness, vehicle physics, post FX,
lighting, map culling, timer freeze, prop collision, and prop masses. Action
buttons such as reset, teleport, and add cash remain one-shot actions.
Delivery lighting takes precedence at boot: the saved delivery count restores
the working-day phase. A `?time=` review override lasts until the next delivery.

All other persisted state uses the `snack-attack-` prefix so saves never collide
with the parent Seoul Delivery game: progression save (`snack-attack-save`),
audio mute, soundtrack selection, graphics profile, touch-control
preference, and the intro-seen flag.

In a development build, the current saved values are available at
`window.__seoul.debug.getSettings()` for inspection or handoff.

## Assets

The saved delivery count selects the initial sky. Morning, day, dusk and night
panoramas are generated and cached on first use; their prefiltered environments
drive both sky transitions and PBR reflections without external HDRIs or per-frame rebaking.

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

**Night Shift truck graphics.** After completing your first delivery, accepting
the second order spawns a floating spray can beside its food pickup. Drive or
walk into the can to permanently equip the pocha makeover: metre-scaled paint
normal/roughness maps, distinct steel/rubber response, and original Korean
night-market graphics with a framed enamel side sign. Missing it is fine: it
returns at later accepted pickups until collected, including for older saves.
Reloads and garage swaps keep the unlock; Reset save removes it. Preview:
`tools/blender/previews/pocha-night-shift.png`. With Vite running, regenerate
previews and check progression using `node tools/bench/truck-makeover-browser-check.mjs`.

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

The pocha cab and dashboard hippo also have Blender recipes. The cab has a
green dash and orange shell matching the exterior, rounded trim, marked instruments, cassette stereo, stitched seats
and a fitted galley. `dash-hippo.glb` preserves a separate head pivot for its
acceleration- and impact-driven bobble. Rebuild both with
`npm run blender -- dash-hippo pocha-interior`; PNGs are in
`tools/blender/previews/`.

**Street props.** `tools/build-props.mjs` turns the 8 `_source-assets/props/NikolaJankovic/` packs into 78 individually placeable props (3.2 MB total). Each pack is one merged mesh holding a dozen-plus objects on a shared atlas, so the script welds vertices, finds connected components, merges them by proximity, and emits one primitive per resulting object plus `catalog.json`. The weld is load-bearing — these OBJs split every vertex per face, so without it a bicycle reports ~1169 "objects" instead of one.

Identify props with `?props=gallery`, then name and weight them in `src/world/data/props.js`.

## Checks

```bash
npm run bench        # 20-metric physics bench vs baseline.json
npm run drive-feel   # per-vehicle go / stop / turn envelope, every car in the roster
npm run check        # full bench suite: tiling, roads, props, audio, touch, gfx, notes, encoding, proc city
npm run road-check   # connected road graph, no dead ends/bridges, all routes reachable
npm run proc-check   # procedural city graph, colour bible, Hangul shop names
npm run character-check # capsule collision + camera-relative walk smoke test
npm run surface-check # M6: generated road/pavement pool + road markings (part of expanse-check)
npm run vehicle-tuning-check # pocha bilateral stability through near-top speed
npm run probe -- "http://localhost:5173/?stats=1" 30 --size 400,300 --shot out.png
```

`tools/probe.mjs` drives the app in headless Chrome over the DevTools protocol and returns console output, exceptions and live scene state with the screenshot — a screenshot alone can't tell you *why* something didn't render. Headless uses SwiftShader (~1 fps), so pass a small `--size` when you only want state.

## Test URL params

Handy for screenshots and automated checks:

- `?car=van|pocha` — pick the vehicle (default `pocha`, the CC0 snack truck)
- `?rain=off|light|heavy` — force weather
- `?time=morning|day|dusk|night` — force the initial review preset; the next delivery resumes the cycle
- `?offer=1&accept=1` — spawn (and auto-accept) an order
- `?restaurant=<id>` — with `?offer=1`, select a specific shop for repeatable pickup QA
- `?shops=off` — disable the authored storefront/district dressing for performance QA
- `?auto=1` — full throttle self-drive
- `?overview=1` — static aerial view of the block
- `?shop=tteokbokki|hotteok|eomuk|gimbap|chimaek|bingsu|gilgeori|pocha` — frame an authored pickup storefront
- `?stats=1` — force the physics/tile/prop readout overlay on (it is otherwise a
  settings toggle, off by default)
- `?props=off` — skip street props entirely
- `?props=gallery` — lay every catalog prop out on a labelled grid (curation mode)
- `?touch=on|off|auto` — override touch-control detection
- `?gfx=mobile|desktop|auto` — override the graphics profile
- `?world=expanse2|proc|block|expanse` — current rebuild (default), compact circuit, authored block, or previous Expanse
- `?map=1` — open the north-up full-city map at boot for QA
- `?expanseView=station|market|bridge|westBridge|eastBridge|tunnel|hills|hongdae|hangang|pocha` — static review cameras for Expanse district art passes
- `?world=expanse2&expanseView=plan|massing*|facade*|shopBoard|landmarkTower` — the rebuild's own review cameras (see `CITY-REBUILD.md`)
- `?intro=off` — QA/probe hook: skip the release card without persisting the seen flag
- `?mode=foot` — start beside the current vehicle in on-foot mode
- `?view=cockpit` — boot into the first-person cab (pocha only; the van has no interior)
- `?dive=1` — drop straight into the Abyss (`?world=expanse2` only); `?dive=ramp` lines the truck up on the north-bank dive ramp instead

Example: `http://localhost:5273/?rain=heavy&offer=1&accept=1&auto=1`

Drive the pocha off the north-bank ramp at x = 120 with some speed and the Han
opens a whirlpool: the camera pulls out to show the truck circling it and going
under, then flies into the cab as you spiral down the Drain, and you come out in
the Abyss driving a submarine. `W`/`S` are thrust, `A`/`D` the rudder,
**Shift** (RB) swims down, **Space** (A) climbs — slowly — and hands off the
truck sinks gently. Rising back up
through the mouth you came down puts you back on the quay. The cab's second
dial — parked since it shipped, because there is no fuel system — becomes a
depth gauge for the duration. `?world=expanse2` only: the ramp is geometry that
world builds, so there is nothing to drive off anywhere else.

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
  world/time-of-day.js  delivery-driven lighting and cached sky transitions
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
  world/expanse-surface-art.js  generated asphalt/paving/ground PBR pool
  world/expanse-road-paint.js   lane lines, stop bars and crossings from the street graph
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
  ui/settings.js        player-facing settings + the door to the developer tools
  ui/debug.js           lil-gui tuning menu (opened from settings)
tools/                  asset pipeline (obj2gltf, webp, meshopt) + build-props
tools/probe.mjs         headless Chrome probe (console + state + screenshot)
tools/bench/            physics bench + check suites
tools/bench/drive-feel.mjs  per-vehicle go/stop/turn envelope (npm run drive-feel)
```

### Mobile controls and validation

Touch controls use a shared line-icon style: door for vehicle entry/exit, return
arrow for reset, folded map for navigation, gear for Settings and cassette for
music. The right-side language icon toggles English / Korean with a saved choice.
Drag an unobstructed part of the street to orbit the camera. Jump and Sprint
appear on foot; Rise and Dive appear underwater. Garage, camera view/height,
graphics quality and touch preferences live in Settings. Compact order/pickup
cards leave the driving view clear in portrait and landscape; very short windows
move the card beside the throttle pad. Browser zoom gestures, text selection and
touch callouts are disabled; menus still scroll and pause gameplay.

`node tools/mobile-probe.mjs` runs the Chrome touch regression against port 5273
when Playwright is installed (or supplied through `PLAYWRIGHT_PATH`).
`CHROME_PATH` overrides the default Windows Chrome executable. Emulation covers
layout and input behavior across nine viewport sizes, including 568×240 and
320×568, with overlap and tap-target checks for offers, pickup, delivery and
on-foot states. It also exercises gestures, language persistence, settings,
garage, music, underwater input and a delivery loop. Actual iPhone Safari
performance and browser chrome require a device.
