# Overdub — the city becomes the visualizer

Design proposal · 2026-09-28 · researched against the current game source.
This document is a plan; the powerup, dependencies and proposed review flags are not implemented.

**A special cassette gives the courier thirty seconds inside a living mixtape.**
Puddles open onto flowing colour, the upper windows answer the drums, and a
clean landing sends a ripple around the block. The player can still read the
road, hit the ramp, leave the truck and find the delivery door.

The central idea is to give the visualizer **places to live and actions to
remember**. MilkDrop supplies the moving imagery. The game decides where it
appears, how strongly it appears, and how the courier's actions disturb it.

## 1. Engine choice

| Candidate | Role in this project | Decision |
| --- | --- | --- |
| MilkDrop through Butterchurn | Browser implementation with an audio-node input, canvas output and preset blending | First implementation candidate |
| Acidspunk | Artistic reference for flowing, evolving compositions | Keep as a reference; a usable source licence and browser port were not established in this research |
| projectM | MilkDrop-compatible C++ library with OpenGL rendering and an Emscripten build route | Reserve for a later native integration or a concrete Butterchurn limitation |

Butterchurn documents WebGL 2 and an MIT engine licence. Its separate preset
repository contains converted MilkDrop presets and its own MIT licence. Use a
small, recorded selection, retaining author names, source files, licence notices
and any texture attribution. The first spike must select and pin compatible
engine/preset versions; do not build against an unpinned development branch.
[Engine documentation](https://github.com/jberg/butterchurn),
[preset repository](https://github.com/jberg/butterchurn-presets),
[preset licence](https://github.com/jberg/butterchurn-presets/blob/master/LICENSE).

The author's [MilkDrop page](https://www.geisswerks.com/milkdrop/) is the primary
historical reference. Acidspunk's author lists it in his
[project history](https://dk.linkedin.com/in/sholstebroe); the old project site
could not be retrieved. That does not establish that its source is unavailable,
only that it is not yet a dependable integration choice.
[projectM's repository](https://github.com/projectM-visualizer/projectm) documents
its OpenGL/PCM architecture, WebAssembly build route and LGPL-2.1 core licence.
Choosing Butterchurn here is an engineering judgment based on this game's browser stack.

## 2. What thirty seconds should feel like

**0–2 seconds: the tape catches.** A small cassette click accompanies a soft
wave travelling outward from the truck or courier. Nearby puddles acquire
depth and moving ink. Window bays begin responding in sequence. Keep the
current song playing; Overdub is an effect cassette attached to the deck, not
another soundtrack lane or a replacement song.

**2–27 seconds: Seoul performs with you.** One coherent preset runs through
the whole activation. Surface placement and the courier's actions provide
variety. A local envelope follows the active player, strongest within roughly
40 metres and fading out by 60 metres. Those distances are tuning proposals.

| Surface or action | Response | What makes it readable |
| --- | --- | --- |
| Puddles and wet gutter strips | Actual MilkDrop imagery flows below a restrained surface sheen | Asphalt grain, lane paint and kerb edges stay visible |
| Selected upper windows | Vertical samples of the same image move between window bays; midrange energy controls their brightness | Doorways, Hangul shop names and objective markers retain their normal treatment |
| Sky above the roofline | A broad, slow ribbon carries the same visual flow across the skyline | The horizon stays level; the effect does not rotate the camera |
| Bass hits | A soft ring travels across eligible ground surfaces from the player's position | Rounded pulses with limited brightness, not abrupt exposure changes |
| Controlled drift | A short luminous wake curls behind the truck and bends the nearby texture flow | It follows the driven path and fades promptly |
| Ramp landing | A circular disturbance expands through puddles and window accents | Triggered by the landing event, even between musical beats |
| Courier dive and recovery | A brief decorative echo follows the tumble; recovery gathers it back into the courier | The actual character remains crisp and fully visible |

**27–30 seconds: the tape runs out.** Effects recede in reverse order. The last
moving pattern lingers in a puddle before returning to the normal material.
The powerup meter gives the exact expiry; visual fading never obscures it.

These are the eventual layers. The first playable demonstration contains only
**puddles, one window group and the landing ripple**. Sky ribbons, drift wakes
and character echoes follow only if that small scene feels good to drive.

## 3. A powerup with a simple benefit

Working item name: **Overdub cassette**. Present it beside the existing tape
deck, reusing the cassette visual language and existing model where possible.

- In the opted-in stunt prototype, start with one charge. A successful delivery
  replenishes it, capped at one. The player chooses when to spend it.
- Propose **K / controller Menu** for activation, plus an accessible cassette
  button. The current input map leaves K and standard pad button 9 unused;
  confirm the physical binding during controller review. Modal menus consume
  their own input. Keep P dedicated to opening the deck.
- Activation lasts **30 seconds of unpaused gameplay**. No stacking or duration
  extensions in the first version. Driving and on-foot play share the charge.
- **Double the existing style rewards first earned during that window.** This
  uses the current drift, jump and courier categories. Base pay and time tips
  keep their current formulas. No action has to land on a detected beat.
- Record qualifying categories when they are earned. Their extra reward remains
  payable if Overdub expires before delivery. Already-earned categories cannot
  be earned again by activating, changing tracks or repeating the animation.
- Show the extra amount as an Overdub line in the result. The additional reward
  is bounded by the existing total style allowance, currently 25% of base pay.
  Use the same payout calculation for live HUD and final result to avoid rounding drift.
- Powerup availability is optional. Separately offer **Full / Gentle / Off**
  visual presentation with identical charge, duration and reward behavior.
  Music mute, blocked playback and render fallback never remove the benefit.

On a failed delivery, use the existing failure payout behavior. End the active
effect on results or prototype restart. The experimental charge is session
state; the prototype restart explicitly restores its initial charge.

## 4. Two outputs from one piece of music

The implementation should expose two independent products:

1. **A living texture:** Butterchurn renders a selected MilkDrop preset into a
   small private canvas. Three.js samples its output across eligible surfaces.
2. **A small signal packet:** a separate analyser produces smoothed bass, mids,
   treble, overall energy and a transient pulse. Decorative motion uses these
   numbers plus speed, drift and landing events.

Read music from [Soundtrack](src/core/soundtrack.js), which already owns two
media lanes and their crossfade gains. [AudioManager](src/core/audio.js) owns
a separate context for engine, rain and effects; tapping that context would
miss the cassette music.

Add one analysis-only mix node in the **Soundtrack context**, fed from both
existing lane gains after their crossfade/mute gain. Feed Butterchurn and the
feature analyser from that node. Keep existing speaker connections and avoid
an additional audible route. Reuse the media-element sources already created
by Soundtrack; never wrap the same media element again on activation.
Butterchurn's current [audio implementation](https://github.com/jberg/butterchurn/blob/master/src/audio/audioProcessor.js)
accepts an AudioNode and connects it to its analysis graph.

The analysis node is attached only after the existing graph is available.
Keep current gesture-unlock, cue priming, track selection and mute semantics.
Follow the actual audible blend, including Dive, instead of inferring music
from the selected cassette's metadata. No microphone or system-audio capture.

Use fast attack, slower release and a silence floor. A transient detector can
start soft rings; it need not infer reliable BPM or bars. Do not delay button
activation or scoring to wait for music. When playback stops, let musical
motion settle while action feedback and the gameplay clock still work.

## 5. Rendering that respects the existing scene

Start with an engine adapter around the public canvas/API boundary. The current
development source has an internal WebGL canvas and copies to a 2D output;
other versions must be checked independently. Canvas-to-Three.js transfer can
cost real frame time. Prove this boundary first, including frame freshness,
colour handling and resizing. Do not assume shared GPU textures or zero-copy
integration. [Visualizer source](https://github.com/jberg/butterchurn/blob/master/src/visualizer.js).

Render the visualizer before the game samples its canvas in the same animation
frame. Mark the Three.js texture dirty only when a new visualizer frame exists.
Avoid CPU pixel readback, screenshots or image encoding in the frame loop.

Register eligible surfaces explicitly in a small world adapter: puddle areas,
selected window bays and, later, sky decoration. The existing building assembly
shares materials and uses instancing. Scope shader additions to registered
batches and instance/world-space masks; cloning every building material would
discard those savings. Verify the world-to-surface mapping across rotated lots.

Sample the flow through wetness and surface masks. Use one shared texture with
different UV projections and blends, not a separate visualizer for each facade.
Where there are no puddles, window and action layers still provide the effect;
do not change rain or tyre grip to create an artificial wet road.

The current post chain is **scene → bloom → output** in
[post.js](src/core/post.js). Keep the first version in scene materials so it
works with post-processing disabled. Bound the emissive contribution and keep
the DOM HUD untouched. A full-screen distortion pass is unnecessary for this slice.

[Time of day](src/world/time-of-day.js) owns sky, exposure, fog, lamps and bloom.
Let it continue owning those values. Overdub supplies a separate contribution
that reaches zero at expiry; restoring a captured lighting snapshot would erase
legitimate day/weather changes made during the effect. Use a separate sky ribbon
later, without rebuilding the scene's PMREM environment every visualizer frame.

Roads, ramps, collision meshes, traction, steering, camera and interaction
positions retain their physical behavior. Spatial distortion lives inside the
projected imagery and decorative geometry. Preserve objective cyan, money gold
and warning red-orange as readable gameplay signals.

## 6. Budget and lifecycle

Proposed starting budgets, **not measurements**:

| Presentation | Work performed |
| --- | --- |
| Full | One 384 × 384 visualizer at 30 updates/second; interpolate decorative envelopes at the game's render rate |
| Gentle | Smoothed light and action accents using the small analyser; no feedback imagery, sky motion or character echoes |
| Off | Normal scene and a powerup timer; no visualizer or analysis work |

Use Gentle as the initial mobile/reduced-motion default. Full remains an
explicit option after capability checks. On desktop, seek less than 3 ms added
p95 frame time in a controlled comparison with enough baseline frame headroom.
If sustained cost exceeds the budget, reduce Full to 256 × 256 at 20 updates/sec,
then fall back to Gentle. Record actual results before choosing shipping limits.

Lazy-load only when the feature is enabled. Prewarm the selected preset and
scene material variants before the charge becomes ready, using the composer's
render-target format to avoid the project's known first-use shader stalls.
Idle/paused/hidden states render no visualizer frames. Reuse prepared resources
between charges; disabling the feature or unloading the world releases owned
GPU resources and disconnects only its analysis branches.

Use an explicit lifecycle: disabled, preparing, ready, active, then ready-empty.
Check expiry before awarding a style category. Pause the clock with the existing
orders/modal/background pause gate, clear pending action pulses on resume, and
do not replay a backlog of visual beats. Suspend surface effects and the clock
while a scripted Dive transition owns gameplay; later underwater support is a
separate surface adapter. Context loss or preset failure falls back to Gentle
without interrupting music, orders or an already-active reward.

## 7. Implementation milestones and acceptance

**M0 — prove one genuine visualizer surface.** On the existing two-block stunt
street, feed the current cassette mix to one pinned Butterchurn preset and show
it in one puddle. Check Vite production packaging, any required WASM assets,
deployment base paths, audio unlock and canvas transfer. Record the exact preset,
engine version, licence and baseline/active frame times. Gate: recognisable
MilkDrop motion, unchanged sound, fresh frames and affordable transfer.

**M1 — make one corner feel alive.** Add a window group, local fade and landing
ripple. Prepare shaders before activation. Drive the ramp, walk to the shop and
switch chase/cockpit views. Gate: moving imagery follows the music, landing
feedback follows contact, and the route/door/props remain easy to read. Capture
an ordinary-play clip with audio; a static screenshot cannot prove reactivity.

**M2 — make it an optional powerup.** Add charge state, activation, expiry,
earned-category tracking, result breakdown and presentation settings. Extend
the existing stunt and audio fixtures for pause/resume, mute, cue crossfade,
duplicate-award prevention, expiry-before-delivery and reset behavior. Gate:
Full/Gentle/Off produce identical gameplay rewards and physical outcomes.

**M3 — curate and test the whole experience.** Add at most three authored looks:
liquid ink, warm ribbon flow and restrained geometric echoes. These are art
directions until exact source presets are selected. One preset per activation;
no random switching during a corner. Reject flashes, rapid global contrast
changes and illegible surfaces. Add sky/wake/character layers individually,
keeping only those that improve the drive. Test physical controller use,
day/night, wet/dry, mobile fallback, background return and repeated activations.

Likely new modules: `src/core/music-features.js`,
`src/render/visualizer-texture.js`, `src/world/reactive-city.js`, and
`src/game/overdub-powerup.js`. Integrate through the existing Soundtrack,
StuntOrders/style payout, input, cassette/settings UI and main loop. Keep
world-specific surface registration separate from powerup rules.

Future focused checks: `node tools/bench/audio-check.mjs`,
`npm run stunt-check`, and `npm run build -- --configLoader runner` after the
relevant code changes. Add a narrow visualizer browser check for texture updates,
fallback and lifecycle; use one foreground tab on real hardware for performance.
Build and automated results remain separate from visual and player acceptance.

First proposed review route:
`?world=pilot&building=stunt-block&gameplay=stunt&intro=off&overdub=review`.
The `overdub` flag and a matching Night Tour entry are future work. Keep initial
feature settings under an isolated `snack-attack-stunt-overdub-v1` key. Expand
to other cities after this route passes; preserve their saves and world data.

**Current gate:** plan complete; M0 is the next implementation step. No game
code, dependencies, custom models or saved defaults were changed for this plan.
