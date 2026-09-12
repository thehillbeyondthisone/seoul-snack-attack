// Seoul Snack Attack — playable vehicle roster.
//
// handoff.md 7 asked for "the vehicle-definition schema and build-time rig
// normalization now so the other 9 are drop-in". This is the schema half; the
// build half is tools/normalize-vehicle.mjs.
//
// Every number under `rig` was MEASURED by the normalizer and copied from the
// sidecar it writes next to the GLB (public/assets/vehicles/<id>.json). They are
// repeated here only so tuning can be read in one place — if the two ever
// disagree, the sidecar is right and this file is stale. Nothing here is
// eyeballed except the handling constants, which are exactly the things that
// have no geometric answer.
//
// `params` are overrides onto physics.js DEFAULT_PARAMS. The van overrides
// nothing: its defaults ARE the tuned values, and van-spec.js:10-13 asks that
// they not be disturbed casually.
import { COLLISION_HALF, BUMPER_Y, TARGET_LENGTH } from '../../vehicle/van-spec.js';

export const VEHICLES = {
  // -------------------------------------------------------------------------
  // The original van. Still on the legacy runtime rig (src/vehicle/van.js),
  // which rebuilds wheels from heuristics at load time. A `van` recipe exists
  // in tools/vehicle-recipes.mjs and normalizes correctly, but switching it
  // over moves the physics bench: the normalizer measures the body bbox
  // EXCLUDING wheels, so the origin — and therefore the meaning of
  // comHeight = -0.78 — shifts. That migration belongs with a `npm run bench`
  // pass, not with adding a second vehicle.
  // -------------------------------------------------------------------------
  van: {
    id: 'van',
    nameKo: '그레이스 밴',
    nameEn: 'Grace-style van',
    blurb: 'Heavy, high-sided, and stable once it settles. The default hauler.',
    price: 0,
    asset: 'assets/vehicles/van.glb',
    loader: 'legacy',
    length: TARGET_LENGTH,
    collisionHalf: COLLISION_HALF,
    bumperY: BUMPER_Y,
    params: {},
  },

  // -------------------------------------------------------------------------
  // NOTE: the `compact` (bubble microcar) was retired on 2026-08-25 — it is
  // ripped commercial game content (see ATTRIBUTION.md, "Bubble microcar").
  // Its recipe, build outputs (public/assets/vehicles/compact.glb|.json) and
  // roster entry are gone; do not reintroduce them.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Pocha truck — the snack-van hero (slice C1). Quaternius "Sushi Truck",
  // CC0 (attribution: _source-assets/vehicles/LICENSES.md), built by the
  // `pocha` recipe in tools/vehicle-recipes.mjs.
  //
  // Geometry from public/assets/vehicles/pocha.json. Origin is the body bbox
  // centre, 2.363 m above the road (`groundY`) — high because the bbox is
  // dominated by the roof sushi sign and the serving-side awning, which also
  // push the bbox centre 0.40 src-units off the wheel plane's centre: the
  // hubs are NOT symmetric about x=0 (fl +0.79 / fr -1.29). `comLateral`
  // compensates for that visual-origin skew in the physics rig.
  // -------------------------------------------------------------------------
  pocha: {
    id: 'pocha',
    nameKo: '포차 트럭',
    nameEn: 'pocha snack truck',
    blurb: 'The snack van itself. Tall, boxy, and top-heavy in the fun way.',
    price: 0,
    asset: 'assets/vehicles/pocha.glb',
    loader: 'canonical',
    length: 5.0,

    // Measured body half is 1.596 x 2.219 x 2.500. Trimmed: x to 1.35 so the
    // awning (which reaches the full 1.596) overhangs kerbs instead of
    // catching them, y to 2.10 to shave the sushi sign, z to 2.42.
    collisionHalf: Object.freeze({ x: 1.35, y: 2.10, z: 2.42 }),
    // Front bumper ring ~0.66 m above the road (origin sits at 2.363 m).
    bumperY: -1.70,

    // Light mount points, converted from source-space island centroids with
    // the sidecar's sourceOrigin (0.401, 3.7756, -0.0168) and
    // sourceScale (0.62644433):
    //   headlamps  source (+/-1.58, 1.91, 3.75) -> (+/-0.739, -1.169, 2.359)
    //   rear bar   source (   0,   0.96, -3.94) -> (   0,    -1.764, -2.458)
    lights: {
      headlights: [[0.739, -1.169, 2.359], [-0.739, -1.169, 2.359]],
      tail: [0, -1.764, -2.458],
      heroFill: [0, 0.6, 0],
    },

    // The Atlas material carries the paint texture — no tints needed.
    // `Lights` covers both lamp clusters and stays lit; the model
    // has no separate brake-lens material, so braking only drives the tail
    // glow point light.
    materials: {
      glass: /^Glass$/i,
      lamps: /^Lights$/i,
      brake: /never/i,
      amber: /never/i,
    },

    // ---- Cockpit -----------------------------------------------------------
    // The first-person cabin (src/vehicle/interior.js). A vehicle without this
    // block simply has no cockpit view; the van is that case today.
    //
    // The asset's origin is the floor-pan underside, centred in XY, and its own
    // frame is the same one the truck uses (+Z forward, +X body LEFT). So
    // `offset` is the whole seating problem in three numbers, measured against
    // pocha.json rather than eyeballed:
    //
    //   x  -0.25  puts the cabin box on the WHEEL centreline, which is at
    //             (-1.2939 + 0.7915) / 2 = -0.2512 and not at x = 0 — the same
    //             visual-origin skew `comLateral` corrects for in the physics.
    //   y  -1.72  the road is at groundY = -2.3629, so this is a cab floor
    //             0.64 m above it and an eye point 1.88 m above it. The
    //             exterior's own Glass primitive spans -1.384 .. 0.134, so the
    //             seated eye lands inside the real windscreen opening.
    //   z  +0.25  slides the 3.4 m cabin forward onto the nose; the windscreen
    //             ends up at 1.95 against the exterior glass's 2.208.
    //
    // Every extent of the cabin stays inside the body half (1.596 x 2.219 x
    // 2.500) at this offset, so nothing pokes through the paint from outside.
    interior: {
      asset: 'assets/vehicles/pocha-interior.glb',
      offset: [-0.25, -1.72, 0.25],
      // Interior-local. The recipe fixes the seated eye at (0.55, -0.42, 1.24)
      // in its build frame; ground_center_group then shifts the set by
      // (0.055, 0.10) before export, which is where the 0.605 comes from.
      eye: [0.605, 1.24, 0.32],
      // Just under dome_lens, which the recipe hangs at ceiling height.
      dome: [0.055, 1.76, 0.64],
      // Rim radians per road-wheel radian. steerLockLow is 0.68, so full lock
      // at a standstill swings the rim 164 degrees — a little under half a turn
      // each way, which is what a long-wheelbase truck with a quick-ish rack does.
      steerRatio: 4.2,
      // The Blender recipe now labels the dial to match this scale.
      // maxSpeed 28 m/s is 101 km/h, which sits at two thirds of a
      // 150 km/h dial — the needle spends its life on the readable part of the
      // sweep instead of pinned at either end. It was a 100 km/h dial when the
      // truck could only reach 76; at the current top speed that dial pegs.
      speedFullScale: 150,
      // Degrees, CLOCKWISE from the driver's seat, zero first. A 250-degree
      // sweep with the rest position at lower-left, like every speedometer.
      needleSweep: [-125, 125],
      // The dashboard hippo (src/vehicle/dash-hippo.js), interior-local like
      // `eye`. The recipe's dash_top face is at z 0.99 spanning y -1.72 .. -1.28;
      // with the same (0.055, 0.10) shift that is y 0.99 and z 1.18 .. 1.62.
      // z 1.30 is the driver's half of that, and x 0.18 is 0.43 m inboard of the
      // wheel: at 22 cm the hippo spans roughly x 0.12 .. 0.25, clear of the
      // binnacle (0.335 .. 0.935), and the sightline from `eye` passes right of
      // it. Yaw points the snout at the passenger door, turned about 60 degrees
      // toward the driver: the photo's three-quarter view, open mouth and all.
      hippo: { asset: 'assets/vehicles/dash-hippo.glb', position: [0.18, 0.99, 1.3], yaw: -2.5 },
    },

    rig: {
      wheelRadius: 0.4064,
      trackFront: 2.0854,
      trackRear: 2.0854,
      wheelbase: 2.9521,
      groundY: -2.3629,
    },

    params: {
      // 1700 kg: a real pocha truck is a 1-ton chassis plus kitchen. Heavier
      // than the van's 1400 default, so it shoves props around convincingly.
      mass: 1700,
      inertiaScale: 1.25,
      // ---- Delivery-pace tune (see tools/bench/drive-feel.mjs) -------------
      // The truck used to top out at 74 km/h and need 14.9 m to stop from 50,
      // which is 0.66 g — you arrived at the shop already past it, and the only
      // way to hit a turn-in was to crawl. Every number below moves together:
      // speed is not fun on its own, it is fun when the brakes and the front
      // axle can cash the cheque it writes.
      engineForce: 13000,
      maxSpeed: 28,            // 101 km/h
      reverseMaxSpeed: 7,
      // 17500 N spread over four wheels left the FRONT axle brake-limited
      // rather than grip-limited under dive: 4375 N a corner against a
      // ~6.8 kN loaded front tire that can take 8.3. This is the number that
      // stops the overshooting, and it is sized to hand the limit back to the
      // tires so the friction ellipse — not a constant — decides the stop.
      brakeForce: 30000,
      handbrakeForce: 24000,
      drag: 0.46,
      rollingResistance: 150,
      // Grip has to rise with the brakes or the extra force is thrown away at
      // the friction ellipse; it is also what makes a corner makeable at pace.
      gripDry: 1.22,
      gripWet: 0.88,
      tireStiffness: 11,
      // Sketchbook exposes roll influence on its raycast car. A lower value on
      // this tall kitchen keeps it upright at delivery pace; only above 90%
      // of top speed does the physical lever arm fade back in. This leaves
      // normal city driving forgiving while preserving risky flat-out turns.
      rollInfluence: 0.55,
      rollInfluenceAtMax: 1,
      rollInfluenceSpeedStart: 0.94,

      // Long wheelbase (2.95 m) and a heavy nose, so still less lock than the
      // van — but the rack is quicker now and keeps real authority at speed.
      // steerLockHigh 0.12 rad was the "I have to stop to make this corner"
      // number; steerSpeedRef moves with maxSpeed so the fade is the same
      // FRACTION of top speed it always was rather than arriving 20 km/h early.
      steerLockLow: 0.68,
      steerLockHigh: 0.19,
      steerSpeedRef: 30,
      steerResponse: 6.5,

      // Corner mass ~425 kg on 26 kN/m is a 1.24 Hz ride at a 0.65 damping
      // ratio — soft, befitting a truck this tall.
      suspensionRest: 0.30,
      suspensionTravel: 0.14,
      springK: 26000,
      damperC: 4200,

      // CoM ~1.06 m above the road (origin sits at 2.363 m). The truck still
      // feels tall and can be upset by a hard kerb strike, but routine cornering
      // no longer balances it on a knife edge. Dropped 14 cm with the grip
      // rise above: rollover threshold is track/(2h), so 1.22 g of tire needs
      // 2.0854 / (2 x 1.06) = 0.98 g of geometry behind it to stay a choice
      // rather than a coin flip.
      comHeight: -1.30,
      // The wheel centreline is (-1.2939 + 0.7915) / 2 = -0.2512 m in model
      // space. Put the CoM on it so left and right turns have equal rollover
      // margins; the serving awning may skew the visual bbox, not the chassis.
      comLateral: -0.2512,

      antiRollFront: 4400,
      antiRollRear: 2700,
      downforce: 11,
      uprightTorque: 9000,
      angularDamping: 1.6,
      crashBounce: 0.25,

      // Chase-camera framing (src/vehicle/camera.js). The defaults frame a ~2 m
      // body around the CoM; this truck's box stands 4.4 m off the road, so the
      // stock offset puts the camera inside the cargo bay.
      cameraDist: 7.5,
      cameraHeight: 3.6,
      cameraLookUp: 1.8,
    },
  },
};

// The pocha snack truck is the hero vehicle; the van remains selectable via
// the in-game garage and ?car=van.
export const DEFAULT_VEHICLE = 'pocha';

/** Resolve a vehicle id to its definition, falling back to the default. */
export function getVehicle(id) {
  return VEHICLES[id] ?? VEHICLES[DEFAULT_VEHICLE];
}

export const VEHICLE_IDS = Object.keys(VEHICLES);
