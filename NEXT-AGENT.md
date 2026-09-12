# Handoff — 서울 스낵 어택 / Seoul Snack Attack

**Written:** 2026-09-12. **For:** an agent or developer with no prior context.
**Branch:** `seoul-rebuild` · **HEAD:** `f623c1b` · **Working tree: dirty on purpose** (see §3).

**Checkpoint update:** The user explicitly requested committing the current
settings/handling/cab/music pass and proceeding with M6c. P and Settings > Music
now open the cassette player as well as the HUD button; driving/orders pause
during selection. Both full suites, browser access/playback checks and build
passed. The dirty-tree inventory in §3 is historical after this checkpoint.
Keep the old `?world=expanse` available as a regression comparison during M6c.

Everything below was measured today, in this checkout, not recalled from a
previous session. Where a claim is a judgement rather than a measurement, it
says so.

**Latest user review (2026-09-12):** Escape settings are accepted. Backtick now
opens/closes tuning directly; F3 and pad View retain settings behavior. The cab
uses the exterior atlas's orange/green through the colour bible's local POCHA
palette, and the dashboard hippo is strawberry pink. Both Blender recipes and
their previews were rebuilt. Preserve these changes alongside the existing pass.

The user feels ready for the next stage. Treat screenshot `Screenshot 2026-09-12
123230.png` as an M6c visual-review target: abrupt rectangular boundaries between
textured and flat road/ground, large bare junction/roadside areas, repetitive
background facades and washed-out distant streets. These are visual observations,
not confirmed causes. Reproduce the same location and lighting, then distinguish
surface coverage/overlap from chunk culling and fog. Performance/LOD work alone
does not guarantee a fix. Keep these checks in the art work below before promotion.

---

## 1. Sixty-second orientation

A browser game: you drive a Korean street-snack truck (the *pocha*) around a
night-time Seoul, take orders, and deliver food before it goes cold. Three.js,
Vite, no framework, no backend. Everything is a static build.

There are **four worlds** behind one URL parameter, and this matters more than
anything else in the repo:

| `?world=` | What it is | State |
|---|---|---|
| *(none)* → `proc` | Compact procedural night circuit, 264 × 192 m | **Default. The shipping game.** |
| `expanse` | The approved kilometre-scale city, 25 authored nodes, greybox art | Live, superseded in practice |
| `expanse2` | **The rebuild.** A generated kilometre of Seoul — streets, blocks, 1,211 buildings, facades, signage, shops, road surface | Where all current work happens |
| `block` | One authored Seoul block, repeating | Regression comparison only |

The rebuild (`expanse2`) is built in milestones M1–M6. **M1 through M6b are done
and gated. M6c is the only phase left**, and it is the one that promotes the
rebuild over the live world. §2 is the whole answer to "what is left".

Read, in this order, and do not skip the first two:

1. `README.md` — how to run it, controls, every URL parameter.
2. `ATTRIBUTION.md` — **check before adding any asset.** Four shipped asset sets
   are unlicensed release blockers; adding a fifth is the one genuinely
   unrecoverable mistake available in this repo.
3. `CITY-REBUILD.md` — the rebuild's milestones, architecture and gates. The
   authoritative document for anything under `src/world/expanse*`.
4. `handoff.md` — the chronological log. It has grown from both ends, so search
   it rather than scrolling.
5. This file — current state, open work, traps.

---

## 2. What is left in the phases

### The ladder

| | Deliverable | Gate | State |
|---|---|---|---|
| M1 | Interior street generator, 2D plan | `npm run streets-check` | done |
| M2 | Blocks and building lots | `npm run blocks-check` | done |
| M3 | Greybox massing at `?world=expanse2` | `npm run massing-check` | done |
| M4 | Facades, signage atlas, colour bible, lighting | `npm run facade-check` | done |
| M5 | Landmarks, shops, routed delivery loop | `npm run route-check` | done |
| M6a | Road + pavement PBR, lane markings | `npm run surface-check` | done |
| M6b | Facade and roof relief (normal + roughness) | `npm run facade-check` (26 assertions) | done |
| **M6c** | **Perf/LOD/mobile, full suite, promotion** | full suite | **not started** |

### M6c, broken into the work it actually is

**(a) Measure performance. Nothing has.** The gates assert *geometry* budgets —
whole-city triangles against 800k, the worst four-chunk view against a 350k
mobile budget, collision against 250k, texture pool 42.0 MB desktop / 10.5 MB
mobile. **No gate and no probe has ever measured a frame time in `expanse2`**,
on desktop or on a phone. The LOD machinery exists and is untested under load:
`src/world/expanse-chunks.js:49` gives every chunk three tiers (`base`,
`detail`, `micro`) at 720 m / 420 m cull distances. The first deliverable of M6c
is numbers — ms/frame and draw calls from `?world=expanse2` and
`?world=expanse2&gfx=mobile` — and only then whatever LOD work those numbers
justify.

**(b) Kill the load-time hitch.** The city is generated in **one blocking pass**
on the loading screen: streets → blocks → massing → facades → signage atlas →
surface pool. The named fix is backlog item 10, *progressive model streaming*
(`handoff.md`, "Known blockers / follow-ups"): geometry fades/pops in over the
first seconds of play, the way food GLBs already load one per idle slice. It was
blocked on "the pocha interior has no transition to hide behind"; the Abyss dive
(§6) is now exactly that transition, so **this is unblocked**.

**(c) Decide what "full `npm run check`" means for the rebuild.** Today the two
suites are disjoint: `npm run check` (13 checks) is shaped around the compact
proc world and its shipped assets; `npm run expanse-check` (9 checks) is the
rebuild. `tiling-check`, `road-graph-check` and `props-check` assume proc-world
shapes. Somebody has to decide which of them a promoted `expanse2` must satisfy,
and fold the expanse gates into `check` if so.

**(d) The promotion itself.** Concretely, these are the touch points:

- `src/main.js:126` — the world allowlist and the `'proc'` default.
- `src/main.js:139` — the loader branch per world.
- `src/main.js:341` (dive enabled only in expanse2), `src/main.js:529`
  (expanse2 opts out of the prop pass).
- `tools/quickstart.mjs:43` — `LAUNCH_PROFILES`; `tools/bench/quickstart-check.mjs:43`
  asserts their contents.
- `src/ui/debug.js:124` — the in-game world switcher.
- `README.md` (`?world=` docs) and `CITY-REBUILD.md` (the milestone table).

An open product decision rides along: **does `?world=expanse` survive the
promotion?** It is the approved 25-node city and the only regression baseline
for the layout contract. Nobody has answered this.

**(e) The art gaps M6 was supposed to close.** This is a surface-**art** pass,
not only a perf pass — the user has been explicit about that:

- **No props or street furniture anywhere in `expanse2`.** It opts out of the
  prop pass on purpose: `public/assets/props/` is the Sketchfab-derived set
  `ATTRIBUTION.md` lists as a release blocker. Street furniture for the rebuild
  must be **original geometry or a licensed pack**. This is the most
  conspicuous missing layer between M4's facades and M5's shops.
- **Wet-road decals, drain covers, tactile paving.** The yellow guidance strips
  are per-location decals, not something a tiling texture can carry.
- **No light spills from a lit shop onto the pavement.** Wants a decal or a cheap
  pool light, not geometry.
- **Density.** 1,212 buildings, one per 17.7 m of street. The honest lever is
  courtyard infill — 22 blocks keep an interior no frontage reaches (+250–400).
- **A landmark is a crown, not a building** (masts and drums on existing roofs),
  and the **Market Hall is overtopped** by a station tower 152 m away.
- **Every art value in M6a/M6b was judged on SwiftShader screenshots.** Software
  rendering. Relief strengths, normal scales, the asphalt wear terms, the
  pavement tone under the day preset — none has been seen on a real GPU. The
  debug menu's **입체감 · Facade relief** folder exists precisely to sweep
  `normalScale` live when someone finally does.

---

## 3. The working tree is dirty, and it is a coherent unfinished pass

`git status` shows 14 modified files and 3 untracked paths. **This is one piece
of work — a delivery-pace handling tune plus a player-facing settings menu —
that has not been committed.** Do not `git checkout .` it, and do not commit it
blind either; read this section first.

### What it does

**A settings menu** (`src/ui/settings.js`, new). Escape /
F3 / pad **View** opens it; backtick opens tuning directly. Settings pauses the delivery loop the way the garage and
map do. Three sections: 조작 (controls reference), 화면 (graphics quality, which
reloads), 개발자 도구 (performance overlay + the door to the lil-gui tuning
tree). The consequence that matters: **the developer surfaces are no longer on
by default.** `?stats=1` now only sets the switch's initial position, and
`?debug=off` still removes the tuning row entirely for a build handed outside
the team. Persisted under `snack-attack-settings-v1`.

**A handling tune** (`src/vehicle/physics.js`, `src/game/data/vehicles.js`).
Both vehicles move together — speed, brakes, grip, steering lock, CoM height and
anti-roll — on the argument that speed is only fun if the brakes and the front
axle can cash the cheque. Van: 90 → 112 km/h, 26 kN brakes, μ 1.05 → 1.20, CoM
dropped to ~0.47 m. Pocha: 76 → 101 km/h, 30 kN brakes, μ 1.02 → 1.22, CoM
dropped 14 cm, dial rescaled to 150 km/h.

**A bench for it** (`tools/bench/drive-feel.mjs`, new; `npm run drive-feel`) —
the go / stop / turn envelope per vehicle, so a handling pass is arguable from
numbers instead of vibes. Measured today:

```
van    top 108.8 km/h · 0-60 2.60 s · 50-0 in 7.9 m  · 60 km/h corner 19.9 m @ 1.00 g
pocha  top  98.2 km/h · 0-60 2.67 s · 50-0 in 10.1 m · 60 km/h corner 21.6 m @ 0.98 g
```

**Supporting edits:** `bench.mjs` re-cuts the accel/brake/grip/roll target
windows to match the new envelope; `input.js` fixes a binding that never worked
(`KeyF3` is not a `KeyboardEvent.code`; it is `F3`); `hud3.js` turns the audio
chip into a persistent 3D cassette and adds a settings chip; `cassette-deck.js`
renders that chip; `graphics-quality.js` exports `applyGraphicsPreference` so
the menu and the chip share one path; `quickstart.mjs` drops `stats=1` from two
launch profiles; `debug.js` widens the brake slider and adds a
teleport-to-dive-ramp button; `README.md` and `RELEASE.md` document all of it.

`seoul-snack-attack/` (untracked) is an **empty directory containing only
`.claude/`** — a leftover from when the fork lived in a subdirectory. It is not
work. Delete it or ignore it.

### What is verified, and what is not

Measured in this checkout today:

| Command | Result |
|---|---|
| `npm run check` | **exit 0** — all 13 checks pass |
| `npm run expanse-check` | **exit 0** — all 9 rebuild gates pass |
| `npm run build` | **exit 0** — 4.0 s, `main` 1,441 kB / 427 kB gzip |
| `npm run bench` | **exit 1 — 12/20 within target** |
| `npm run drive-feel` | exit 0, numbers above |

**About that bench failure, because it will be the first thing you worry about:**
`bench` is a *tuning* gate, not a hard one, and it was already red. I ran it at
`HEAD` in a throwaway worktree today to be sure: **HEAD scores 9/20 and also
exits 1.** The tune moved it to 12/20 (`brakeDiveDeg`, `rollPerG`, `stepSteerT63`
came into range). The 8 that still fail — `staticSag`, `rideFrequencyHz`,
`rideDampingZeta`, `settleOvershoots`, `yawOvershoot`, `powerOversteerDeg`,
`obliqueWallSpin`, `wallSpeedRetention` — **all failed at HEAD too.** They are
suspension-feel and crash-behaviour metrics this pass did not touch. Per
`RELEASE.md`, an out-of-range bench metric is acceptable *if documented with a
reason*; that documentation does not exist yet for these eight. Writing it (or
fixing them) is real outstanding work.

**Not verified:**

- **Nobody has driven the new handling.** There is no record of an in-browser
  playtest of this tune. 112 km/h in a 1 km city with 5 m alleys is a claim, not
  a finding.
- **The settings menu has no automated coverage.** No `settings-check` exists,
  and no probe run is recorded. The `RELEASE.md` checklist now asserts its
  developer rows default OFF on a clean profile — that assertion is untested.
- **The HUD cassette holds a second WebGL context for the life of the page.** It
  renders a single static frame (no rAF — verified in `_ensureLauncher`), so
  there is no per-frame cost, but it is one more live context the mobile profile
  now carries. Unmeasured on a phone.

### The decision waiting for you

Commit this as one pass, or split settings from handling. It is coherent enough
to land as one commit naming both halves; it is also two reviewable things.
Either way, **do not promote it to `main` before someone drives it** — the
numbers are good and the feel is unwitnessed.

---

## 4. Everything else that is open

Numbered items are as they appear in `handoff.md` → "Known blockers / follow-ups".

**Regressions and small fixes (do these first; they are cheap):**

- **14 — the street-name blade is missing in `expanse2`.** `describeStreet` in
  `src/world/expanse-street-names.js` keys names by the 35 **layout** edge ids.
  `expanse2` re-cuts its graph (`e_a__b`, `perim_N`, `${id}__sN`, …) and only
  split segments carry `parentId`, so no name resolves. Fix: follow the
  `parentId` chain; decide whether perimeter/connector edges get names or stay
  blank. **This is a regression in the mode we are steering players toward.**
- **5** — comment headers still reading `// Seoul Delivery —` in several `src/`
  files. Sweep opportunistically.
- `README.md:252` still shows the parent project's port `5173` in an
  `npm run probe` example; this fork is `5273`. One-line doc nit.

**Navigation polish (11 + 12, deliberately grouped):**

- **11 — the full-city map (`M`) has no zoom.** `src/ui/city-map.js` fits the
  whole city to the canvas every frame. Want GTA-V-style wheel/pinch zoom with
  pan anchored on the cursor. `createMapProjection` already exposes
  `project`/`unproject`, so the work is an input layer plus a pan/zoom offset the
  projection reads, plus clamping. Scale bar and bounds box already recompute
  from `projection.scale`.
- **12 — minimap zoom is hard-coded.** `VIEW_M = 110` in `HUD3.setMiniMap`
  (`src/ui/hud3.js`). Want a persisted setting *and* a speed-driven mode that
  widens with speed, eased so it does not pump. The scale bar label is drawn from
  the constant and must follow whatever value the frame used.

**Art and content:**

- **13 — dish models sit low in the HUD previews.** `normalizeModel` in
  `src/game/food-display.js` rests the base at local Y=0 (correct for the world
  beacon on its pole); `src/ui/food-preview.js` and the marker render inherit it,
  so the model spins about its base in the 62 px disc. Give the previews their
  own centre-on-bbox-centre.
- **3 — graphics pass 2 leftovers.** Per-instance roof UV scale is structurally
  attached but a **no-op**: `proc_roof` has no maps until a roof pool lands in
  `src/world/proc/textures.js`. Note this is the *compact* city — a different
  material from M6b's expanse roofs. The user has also flagged background
  buildings as needing love.

**Release blockers (licensing — `ATTRIBUTION.md`):** four shipped-but-unlicensed
sets remain — street props, the procedural city shop-pack, district dressing,
order food displays — plus TBD items (`grace-van`, `Untitled4.glb`, the staged
media library). These block a public release, not development. **The practical
rule: new art in the rebuild must be generated, original, or provably licensed.**
The M6a/M6b pools are pure arithmetic specifically so they add nothing here.

---

## 5. How to run and verify anything

```bash
npm run quickstart
```

```bash
npm run dev
```

The launcher picks a world, manages port **5273** (preview 4273), only ever kills
processes on that port, and identifies a sibling Vite app by its served page
title before refusing to touch it.

```bash
npm run check
```

```bash
npm run expanse-check
```

```bash
npm run bench
```

```bash
npm run drive-feel
```

```bash
npm run plan
```

`check` (13 checks) and `expanse-check` (9 gates) are hard gates. `bench` is
advisory. `plan` regenerates the M1/M2 city-plan drawing.

```bash
npm run probe -- "http://localhost:5273/?stats=1" 30 --size 400,300 --shot out.png
```

`tools/probe.mjs` is headless Chrome: console + state dump + screenshot. **Use a
small `--size`** — it renders on SwiftShader, which is why every art value in
this project carries a "judged in software" caveat.

Useful URLs (full list in `README.md`):
`?world=expanse2` · `?view=cockpit` · `?dive=1|ramp` · `?time=night|day` ·
`?gfx=mobile|desktop` · `?offer=1&accept=1` · `?shop=<id>` · `?overview=1` ·
`?intro=off` · `?props=gallery` · `?stats=1` · `?expanseView=<camera>`

---

## 6. The Abyss, in case you trip over it

Drive the pocha off the north-bank ramp at x = 120 with speed and the Han opens
a whirlpool: an outside shot of the truck circling and going under, then into the
cab for a ~7 s spiral down **the Drain**, arriving in **the Abyss** driving a
submarine. `?world=expanse2` only. `?dive=1` jumps straight there; `?dive=ramp`
lines the truck up on the ramp.

It exists partly as **load-time cover**: the abyss build (geometry + BVH) is
kicked off at the top of the ramp and the fall hides it, because a fall down a
hole has no duration a player can be wrong about (`HOLD_AT` in `src/game/dive.js`).

Files: `src/world/dive-ramp.js`, `src/world/the-drain.js`, `src/world/abyss.js`,
`src/vehicle/submarine.js`, `src/game/dive.js`.

Open there: **the full ramp → whirlpool → cab sequence has never been watched
live end to end**; `HOLD_AT` has never engaged on this machine (the build is too
fast) and wants a throttled-CPU test; there is nothing to *do* down there yet;
`src/vehicle/interior.js`'s header comment is stale about shell visibility.

---

## 7. Rules that are not negotiable

- **District ids are frozen**: `hills`, `hongdae`, `station`, `market`,
  `hangang`, `pocha`. Display names and palettes are the creative surface.
- **Three HUD accents, and only three**: tteokbokki red-orange = urgency,
  banana-milk cream-gold = money, fish-cake teal-cyan = navigation. A gate
  enforces it; `color-bible.html` renders the bible.
- **`src/world/expanse-layout.js` is a frozen contract** — 25 nodes, 35 edges,
  asserted by `expanse-layout-check`. It carries three known faults (a bridge
  crossing the ring at grade, a zero-length edge, five sliver junctions) that the
  gates *report and do not fail on*, because fixing them is the user's call.
- **Metres, Y-up, north = −Z.** Guardrails inherited unchanged: vehicle handling,
  on-foot locomotion, camera, enter/exit, ring geometry, bridge count.
- **Check `ATTRIBUTION.md` before adding any asset**, without exception.
- **Every hard gate stays green.** An out-of-range `bench` metric must be
  documented with a reason.
- **Developer chrome is off-screen by default** — diagnostics live inside the
  settings menu, off on a clean profile.
- **The underwater truck never tumbles.** Its attitude is clamped angles, not
  torques. Keep it that way.
- **Show a set piece from outside first**, then cut into the cab, then hint the
  view change. That framing is deliberate.
- **Every custom 3D model ships a PNG preview** at `tools/blender/previews/<id>.png`
  (`AGENTS.md`). A recipe without a preview is unfinished.
- Run the narrowest relevant validation after a change, and report what you ran.

---

## 8. Traps that have already cost somebody a day

- **Piping a gate into `tail` eats its exit code.** `npm run bench | tail -40`
  reports success for a failing bench. Redirect to a file and check the code.
- **SwiftShader is not a GPU.** Every art value in the last three passes was
  tuned on software-rendered screenshots. Treat them as drafts.
- **Marking quads wound the wrong way render nothing**, which from the driver's
  seat is indistinguishable from a chunk-culling bug. It cost a debugging pass in
  M6a.
- **Assertions passed while the layout was visibly wrong**: M6a's first crossing
  layout put every crossing behind its own stop bar and every gate was green. A
  top-down screenshot caught it. Look at the thing.
- **`tiling-check` has a wall-clock budget** and flakes on a loaded machine.
  Re-run on a quiet box before suspecting a regression.
- **Changing the visible light count recompiles every material** — that is why
  the cockpit dome lamp never leaves the scene and rides its intensity to zero.
- **`chunk.detail` vs `chunk.base` matters**: a lane dash on `base` is a
  shimmering pixel at half a kilometre. Fine detail belongs on `detail` (420 m).
- **The surface pool's albedo maps are multiplicative about a mean of exactly
  1.0**, and a gate asserts it. If you change the noise fields, keep the mean, or
  you have silently re-tinted the city.
- **`ROAD_LIFT` lives in `expanse-road-paint.js`** and the markings must agree
  with the class lifts exactly; a stop bar at the wrong lift is invisible.
- **Two sessions on one dev server will hot-reload each other's page.** If the
  preview keeps reloading mid-test, that is why.

---

## 9. Repo map (the parts you will touch)

```
src/
  main.js                      boot, world selection (:126), the loop
  core/input.js                keyboard + gamepad map
  core/graphics-quality.js     desktop/mobile profiles, detailIntensity
  vehicle/physics.js           the road rig (DEFAULT_PARAMS at the top)
  vehicle/submarine.js         the underwater rig, same read surface
  game/data/vehicles.js        per-vehicle overrides (van, pocha)
  game/orders.js               order state machine, payout, save
  ui/hud3.js                   the DOM HUD
  ui/settings.js               settings overlay  [UNTRACKED — see §3]
  ui/debug.js                  lil-gui tuning tree, opened from settings
  ui/city-map.js               full-city map (M)
  world/expanse-streets.js     M1  street network
  world/expanse-blocks.js      M2  blocks and lots
  world/expanse-massing.js     M3  buildings
  world/expanse-facades.js     M4  what every building wears
  world/expanse-facade-art.js  M4  albedo/emissive + M6b relief canvases
  world/expanse-pickups.js     M5  the eight restaurants
  world/expanse-landmarks.js   M5  the five things you steer by
  world/expanse-surface-art.js M6a generated asphalt/paving/ground pool
  world/expanse-road-paint.js  M6a lane markings (owns ROAD_LIFT)
  world/expanse2-city.js       the rebuild's runtime assembly
  world/expanse-chunks.js      chunk grid + LOD tiers  <- M6c starts here
  world/abyss.js the-drain.js dive-ramp.js   the set piece
tools/
  quickstart.mjs               launcher + LAUNCH_PROFILES
  probe.mjs                    headless Chrome probe
  expanse-plan.mjs             the review drawing (npm run plan)
  bench/                       every gate; bench.mjs and drive-feel.mjs
  blender/                     headless Blender food recipes + previews
```

---

## 10. A suggested order

1. Read `README.md` and `ATTRIBUTION.md`. Run `npm run check` and
   `npm run expanse-check` to confirm you start from green.
2. Resolve §3: drive the new handling in a browser, then commit the pass (or
   split it) and document the eight advisory bench metrics.
3. Fix backlog 14 (street-name blade) — small, and it is a live regression in the
   mode players are being steered toward.
4. Start M6c with **(a) measure**: frame time and draw calls in `expanse2`,
   desktop and `?gfx=mobile`. Do not tune LOD before there are numbers.
5. Then **(b) streaming**, which is the load-time complaint the user actually
   feels, and is now unblocked.
6. Bring the art gaps in §2(e) to the user as choices before building them —
   props are licence-constrained and density is a re-generation decision.
7. Promotion last, and ask about the fate of `?world=expanse` before doing it.
