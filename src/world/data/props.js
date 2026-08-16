// Hand-authored metadata for the props cut out of the NikolaJankovic packs.
// Follows the data-module pattern of src/game/data/restaurants.js.
//
// Keys are "<packId>:<index>" into public/assets/props/catalog.json. Indices
// are stable as long as a pack's `gap` does not change — build-props.mjs sorts
// clusters deterministically and records `gap` in the catalog, and loadProps()
// warns if the two drift apart.
//
// MASS IS THE FEATURE. Everything here is a number you can edit and re-drive.
// Anything without an entry is loaded but not placed, so it still shows up in
// `?props=gallery` for identification. That is the intended workflow: drive the
// gallery, read the index off the label, add a line here.
//
// body:  'dynamic' knockable | 'static' immovable but solid | 'decor' no collision
// place: 'curb'   sidewalk edge, facing the road
//        'road'   loose in the carriageway (the stuff you aim at)
//        'wall'   against a building facade, at height
//        'park'   parallel-parked at the kerb
// shape: 'box' | 'cylinder' — cylinder avoids corner-catch on round props

export const PROPS = {
  // ---- street furniture (pack scale 3.0) ---------------------------------
  // 'road' is off until loadProps() stops discarding the pack node transform:
  // pack geometry is normalized to y in [-1, 1], so every instance currently
  // renders ~3x oversized and half-sunk. On the kerb that reads as clutter; in
  // the middle of the lane it reads as a boulder you cannot drive around.
  'street:0': { name: 'traffic cone', body: 'dynamic', shape: 'cylinder', mass: 4.5, place: ['curb'], weight: 5, yaw: 'random' },
  'street:2': { name: 'trash bin', body: 'dynamic', shape: 'cylinder', mass: 11, place: ['curb'], weight: 3, yaw: 'random' },
  'street:5': { name: 'streetlamp', body: 'static', shape: 'cylinder', mass: 0, place: ['curb'], weight: 2, lampAnchor: 5.6 },
  'street:6': { name: 'utility cabinet', body: 'static', shape: 'box', mass: 0, place: ['curb'], weight: 1 },
  'street:7': { name: 'bollard', body: 'dynamic', shape: 'cylinder', mass: 25, place: ['curb'], weight: 5, yaw: 'random' },
  'street:8': { name: 'tall bollard', body: 'dynamic', shape: 'cylinder', mass: 30, place: ['curb'], weight: 3, yaw: 'random' },
  'street:9': { name: 'sign pole', body: 'static', shape: 'cylinder', mass: 0, place: ['curb'], weight: 1 },
  'street:10': { name: 'fire hydrant', body: 'dynamic', shape: 'cylinder', mass: 95, place: ['curb'], weight: 2, yaw: 'random' },
  'street:11': { name: 'short pole', body: 'static', shape: 'cylinder', mass: 0, place: ['curb'], weight: 1 },
  'street:13': { name: 'kerb post', body: 'dynamic', shape: 'cylinder', mass: 12, place: ['curb'], weight: 3, yaw: 'random' },

  // ---- bikes (pack scale 1.8) — the headline knockables -------------------
  'bikes:1': { name: 'cargo trike', body: 'dynamic', shape: 'box', mass: 45, place: ['curb'], weight: 2, yaw: 'street' },
  'bikes:2': { name: 'bicycle', body: 'dynamic', shape: 'box', mass: 14, place: ['curb'], weight: 5, yaw: 'street' },
  'bikes:3': { name: 'bicycle', body: 'dynamic', shape: 'box', mass: 14, place: ['curb'], weight: 5, yaw: 'street' },

  // ---- barriers & racks (pack scale 1.6) ---------------------------------
  'barriers:1': { name: 'guardrail', body: 'dynamic', shape: 'box', mass: 42, place: ['curb'], weight: 3, yaw: 'street' },
  'barriers:2': { name: 'guardrail panel', body: 'dynamic', shape: 'box', mass: 36, place: ['curb'], weight: 2, yaw: 'street' },
  'barriers:4': { name: 'bike rack', body: 'dynamic', shape: 'box', mass: 30, place: ['curb'], weight: 2, yaw: 'street' },
  'barriers:6': { name: 'guardrail panel', body: 'dynamic', shape: 'box', mass: 36, place: ['curb'], weight: 2, yaw: 'street' },
  'barriers:8': { name: 'tree guard', body: 'static', shape: 'cylinder', mass: 0, place: ['curb'], weight: 1 },

  // ---- HVAC / utility (pack scale 1.3) -----------------------------------
  'hvac:0': { name: 'condenser unit', body: 'static', shape: 'box', mass: 0, place: ['curb'], weight: 2, yaw: 'wall' },
  'hvac:1': { name: 'wall AC', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.2, 4.2] },
  'hvac:2': { name: 'wall AC', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.2, 4.2] },
  'hvac:5': { name: 'vent box', body: 'decor', place: ['wall'], weight: 2, heightBand: [1.8, 3.6] },
  'hvac:6': { name: 'vent box', body: 'decor', place: ['wall'], weight: 2, heightBand: [1.8, 3.6] },
  'hvac:8': { name: 'duct', body: 'decor', place: ['wall'], weight: 2, heightBand: [1.6, 4.0] },

  // ---- Korean shop signage (pack scale 1.4) ------------------------------
  // Hung perpendicular to the facade — the single most Seoul-looking thing here.
  'signage:1': { name: 'shop sign', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.6, 4.4], perpendicular: true },
  'signage:4': { name: 'shop sign', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.6, 4.4], perpendicular: true },
  'signage:5': { name: 'shop sign', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.6, 4.4], perpendicular: true },
  'signage:8': { name: 'vertical sign', body: 'decor', place: ['wall'], weight: 2, heightBand: [3.0, 5.0], perpendicular: true },
  'signage:9': { name: 'shop sign', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.6, 4.4], perpendicular: true },
  'signage:10': { name: 'shop sign', body: 'decor', place: ['wall'], weight: 3, heightBand: [2.6, 4.4], perpendicular: true },
  'signage:14': { name: 'billboard', body: 'decor', place: ['wall'], weight: 1, heightBand: [4.0, 6.5] },

  // ---- traffic signs (pack scale 2.4) ------------------------------------
  // Only the free-standing plate is placed; the rest of the pack is sign faces
  // that need a pole to mount on. See the note at the bottom of this file.
  'trafficsigns:3': { name: 'road sign', body: 'dynamic', shape: 'box', mass: 24, place: ['curb'], weight: 3, yaw: 'street' },

  // ---- parked vehicles ----------------------------------------------------
  'car-microvan:0': { name: 'parked microvan', body: 'dynamic', shape: 'box', mass: 1050, place: ['park'], weight: 3, yaw: 'street' },
  'car-truck:0': { name: 'parked truck', body: 'dynamic', shape: 'box', mass: 1600, place: ['park'], weight: 2, yaw: 'street' },

  // ---- back-of-shop crate stack (GLB pack, real metres) -------------------
  // A 1.0 x 2.1 x 4.1 m pile authored as one object, so it is one prop rather
  // than a dozen crates. 'static' on purpose: at 45k triangles it is by far the
  // heaviest thing in the catalog, and tumbling it would put that mesh in the
  // awake set. It reads as shop overflow against the frontage. `weight` is low
  // so a 4 m pile stays an accent and does not line the whole kerb.
  'crates:0': { name: 'crate stack', body: 'static', shape: 'box', mass: 0, place: ['curb'], weight: 1, yaw: 'street' },
};

/** Fallback density (kg/m^3 of bounding volume) for unauthored props. */
export const DEFAULT_DENSITY = 320;

/**
 * Unplaced-but-loaded props, kept deliberately:
 *  - street:1,3,4,12,14..19 are streetlamp heads and arms. They are modelled
 *    detached and belong on top of street:5/9/11, which needs a compose step
 *    rather than a placement rule.
 *  - trafficsigns:0..2,4..15 are sign faces and a convex mirror, same problem.
 *  - bikes:0 is a loose tarp.
 * All of them still appear in `?props=gallery`.
 */
