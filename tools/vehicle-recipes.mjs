// Per-vehicle build recipes for tools/normalize-vehicle.mjs.
//
// handoff.md 8.10: van.js rebuilds its rig at runtime from heuristics — it
// splits two van copies by X-gap, guesses the front from a material named
// "glass white", and tears axle meshes apart by vertex X. That "will not
// survive a second vehicle". This file is where those guesses become stated
// facts, measured once at build time instead of re-derived every page load.
//
// A recipe says only what cannot be measured: which source axis is forward,
// which nodes are scenery, and which nodes to mine for wheels. Everything
// else — hub positions, radii, track, wheelbase, body extents — is measured
// by the normalizer and written to the sidecar JSON, so nothing here
// duplicates a number that lives in the geometry.

/**
 * @typedef {object} VehicleRecipe
 * @property {string}   id            output basename under public/assets/vehicles/
 * @property {string}   srcDir        directory holding the OBJ + MTL + maps
 * @property {string}   obj           OBJ filename within srcDir
 * @property {number}   targetLength  metres; the model is uniformly scaled to this
 * @property {'+x'|'-x'|'+z'|'-z'} sourceForward  which source axis the front faces
 * @property {RegExp[]} strip         nodes deleted outright (shadow decals, dupes)
 * @property {RegExp[]} wheelSeeds    nodes mined for wheel islands
 * @property {number}   minWheelTris  islands below this are debris, not wheels
 * @property {number}   wheelCapture  capture-cylinder radius, as a multiple of the
 *                                    measured wheel radius. Islands whose bbox
 *                                    fits inside the cylinder ride with the wheel.
 */

/** @type {Record<string, VehicleRecipe>} */
export const RECIPES = {
  // ---------------------------------------------------------------------
  // Hyundai Grace–style Korean van — the original vehicle.
  //
  // Two copies sit side by side along X facing opposite ways, so the strip
  // list cannot name them: which copy is which is only knowable by measuring.
  // `dedupeByGap` reproduces van.js:25-56 at build time — split mesh nodes on
  // the largest X gap, keep the cluster whose headlight glass sits furthest
  // forward. Its wheel meshes each span a whole axle, which the capture
  // cylinder handles without a special case (one island per side, both
  // inside their own cylinder).
  // ---------------------------------------------------------------------
  van: {
    id: 'van',
    srcDir: '_source-assets/vehicles/grace-van',
    obj: 'f1870c351d15430db220bd403c731102.obj',
    targetLength: 4.5,          // unchanged from van-spec.js TARGET_LENGTH
    sourceForward: 'auto',      // resolved by the headlight-glass probe below
    dedupeByGap: { minGap: 1.2, keepBy: /glass white/i },
    frontProbe: /glass white/i, // clear lamp lens marks the nose
    strip: [],
    wheelSeeds: [/TIRE/i, /st wh/i],
    minWheelTris: 60,
    wheelCapture: 1.1,
  },

  // ---------------------------------------------------------------------
  // Seoul compact car — the second playable vehicle.
  //
  // Far better authored than the van: WheelFL/WheelFR are real per-corner
  // groups, and body_tire_0 holds exactly the two rear tires (plus one
  // 8-triangle sliver that minWheelTris discards). Front is +Z — the two
  // 72-tri headlight islands in body_Lights_0 sit at z=+44.9 and the rear
  // lamp bar at z=-32.4 — so no front probe is needed.
  //
  // The rear RIMS are not in body_tire_0; they are islands inside
  // body_paint_0 and body_Trims_0 centred on the rear hub, alongside a ring
  // of wheel-bolt islands at x=+/-30.4. The capture box collects all of them.
  // It must stay tight: the wheel ARCH (769 tris, centred 4.2 units above and
  // 1.5 behind the hub) is body, not wheel, and only its bbox spilling
  // outside the capture tells the two apart. At 1.05 the arch misses on both
  // Y and Z with ~1.7 units to spare — do not widen it without re-checking
  // the island report from `--report`.
  //
  // targetLength is a compromise the model forces. Its height/length ratio is
  // 0.53 — far boxier than a real car — so scaling until the wheels measure
  // right (3.5 m, r=0.33) leaves a 1.85 m roof that towers beside the 4.5 m
  // van, while scaling until the roof looks right shrinks the wheels to
  // scooter size. 3.2 m splits it: a 1.69 m roof, r=0.30 wheels, 1.42 m track
  // and a 2.19 m wheelbase. The oversized wheels are the asset's own styling
  // (see its thumbnail) and read as intentional at this scale.
  // ---------------------------------------------------------------------
  compact: {
    id: 'compact',
    srcDir: '_source-assets/vehicles/compact',
    obj: '0c7c915ab21a478a8856f998fb70decd.obj',
    targetLength: 3.2,
    sourceForward: '+z',
    strip: [/^Ground_ground/],  // flat baked shadow decal, 120 x 0 x 171
    wheelSeeds: [/^WheelF[LR]_tire/, /^body_tire/],
    minWheelTris: 100,
    wheelCapture: 1.05,
  },
};

export function getRecipe(id) {
  const r = RECIPES[id];
  if (!r) {
    throw new Error(`unknown vehicle recipe "${id}" (have: ${Object.keys(RECIPES).join(', ')})`);
  }
  return r;
}
