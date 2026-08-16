// Seoul Delivery — playable vehicle roster.
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
  // Bubble microcar — the nimble counterpart. A metre shorter than the van,
  // 40% lighter, and on a 2.39 m wheelbase it turns inside anything the van
  // can manage.
  //
  // Geometry is from public/assets/vehicles/compact.json. Model origin is the body
  // bbox centre, which sits 0.950 m above the road (`groundY`), so every
  // height below is quoted as "origin-relative = road-relative - 0.950".
  // -------------------------------------------------------------------------
  compact: {
    id: 'compact',
    nameKo: '버블 경차',
    nameEn: 'bubble microcar',
    blurb: 'Light, short, and eager to rotate. Less to carry, far less to park.',
    price: 100000,
    // 3.2 m against the van's 4.5, on a 2.19 m wheelbase — see the recipe in
    // tools/vehicle-recipes.mjs for why the scale is a compromise.
    asset: 'assets/vehicles/compact.glb',
    loader: 'canonical',
    length: 3.2,

    // Measured body half is 0.885 x 0.847 x 1.60. Trimmed inside that: the
    // half-width is the wheel-arch bulge, flush with the tires' outer faces,
    // and a hull that wide catches on kerbs the bodywork would clear.
    collisionHalf: Object.freeze({ x: 0.82, y: 0.80, z: 1.54 }),
    // Bumper ring ~0.49 m above the road (origin sits at 0.950 m).
    bumperY: -0.46,

    // Light mount points, converted from source-space island centroids with
    // the sidecar's sourceOrigin (0.0002, 35.6687, 1.491) and
    // sourceScale (0.02658254):
    //   headlamps  source (+/-23.30, 33.25,  44.94) -> (+/-0.619, -0.064,  1.155)
    //   rear lens  source (      0,   51.79, -32.52) -> (      0,   0.429, -0.904)
    lights: {
      headlights: [[0.619, -0.064, 1.155], [-0.619, -0.064, 1.155]],
      tail: [0, 0.429, -0.904],
      heroFill: [0, 1.5, -0.1],
    },

    // Material roles. `Lights` covers both lamp clusters and stays lit; only
    // the rear lens material reacts to braking, which is what a brake light
    // actually is.
    materials: {
      glass: /^glass$/i,
      lamps: /^(Lights|light-glass)$/i,
      brake: /^light-glass$/i,
      amber: /never/i,
    },

    // The pack's MTL gives paint, trim and interior no maps and a flat white
    // Kd, so untinted the car renders as a featureless white blob — the yellow
    // in the source thumbnail is not in the files we have. Because `paint` is
    // its own material covering only bodywork, a tint is all it needs, and it
    // doubles as the livery hook if this ever becomes a chooser.
    tints: [
      { match: /^paint$/i, color: 0xf2b41c, roughness: 0.38, metalness: 0.10 },
      { match: /^Trims$/i, color: 0x1b1d21, roughness: 0.62, metalness: 0.05 },
      { match: /^int_d_rgh$/i, color: 0x24272c, roughness: 0.88, metalness: 0.0 },
    ],

    rig: {
      // All four wheels measure the same 0.295 m because they ARE the same
      // wheel: the front pair only read larger while the source model's 10°
      // posed steer was still baked into them (sidecar `desteerDeg`).
      wheelRadius: 0.2947,
      trackFront: 1.4198,
      trackRear: 1.3787,
      wheelbase: 2.1873,
      groundY: -0.9499,
    },

    params: {
      // 850 kg: a real Twizy is 450, a Korean kei-van about 1000. This sits
      // between, so it is tossable without feeling weightless against props
      // that mass 1000-1600 kg (src/world/data/props.js).
      mass: 850,
      inertiaScale: 1.15,
      // 8.5 N/kg against the van's 6.8 — the whole point of the second choice.
      engineForce: 7200,
      maxSpeed: 24,
      reverseMaxSpeed: 7,
      brakeForce: 10200,
      handbrakeForce: 11500,
      drag: 0.34,
      rollingResistance: 85,
      gripDry: 1.08,
      gripWet: 0.80,
      tireStiffness: 9.5,

      // Short wheelbase + light nose: more lock and a quicker rack. Keep its
      // turning advantage after tightening the van's steering envelope.
      steerLockLow: 0.78,
      steerLockHigh: 0.15,
      steerResponse: 6.5,

      // Suspension is authored against the measured hub geometry rather than
      // guessed (handoff.md 8.9). Corner mass ~212 kg on 16 kN/m is a 1.38 Hz
      // ride with a 0.65 damping ratio — soft enough to lean, damped enough to
      // settle. rayLen (rest + travel = 0.22) is deliberately close to the
      // 0.13 m static compression so the body rides at a believable height;
      // the remaining gap is taken up visually in vehicle.js.
      suspensionRest: 0.14,
      suspensionTravel: 0.08,
      springK: 16000,
      damperC: 2400,

      // CoM ~0.55 m above the road (origin sits at 0.950 m). Against the
      // 1.420 m front track that is a rollover threshold of
      // track/(2h) = 1.26 g — above the ~1.08 g the tires make, so it leans
      // hard in a corner without going over, but with far less margin than
      // the van. On a tall, short, light car that is the intended character.
      comHeight: -0.40,

      antiRollFront: 2400,
      antiRollRear: 1300,
      downforce: 4,
      uprightTorque: 5500,
      angularDamping: 1.8,
      crashBounce: 0.30,
    },
  },
};

export const DEFAULT_VEHICLE = 'van';

/** Resolve a vehicle id to its definition, falling back to the default. */
export function getVehicle(id) {
  return VEHICLES[id] ?? VEHICLES[DEFAULT_VEHICLE];
}

export const VEHICLE_IDS = Object.keys(VEHICLES);
