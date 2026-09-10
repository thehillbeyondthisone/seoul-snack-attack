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
 * @property {string}   [obj]         OBJ filename within srcDir
 * @property {string}   [glb]         GLB filename within srcDir (skips obj2gltf)
 * @property {number}   targetLength  metres; the model is uniformly scaled to this
 * @property {'+x'|'-x'|'+z'|'-z'} sourceForward  which source axis the front faces
 * @property {RegExp[]} strip         nodes deleted outright (shadow decals, dupes)
 * @property {RegExp[]} wheelSeeds    nodes mined for wheel islands
 * @property {number}   minWheelTris  islands below this are debris, not wheels
 * @property {number}   [maxWheelTris] islands above this are body, not wheels.
 *                                    Needed when wheels share a node with body
 *                                    islands LARGER than the tires (one-mesh
 *                                    exports); the grace-van never hits this,
 *                                    but the pocha needs it (see its recipe).
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
  // Pocha truck — the snack-van hero vehicle (slice C1).
  //
  // Quaternius "Sushi Truck" from Poly Pizza, CC0 (see
  // _source-assets/vehicles/LICENSES.md). A single 14.6k-tri mesh in ONE node
  // ("Truck", one primitive per material: Atlas/Lights/Glass), so there are
  // no wheel nodes to seed — the four tires are islands
  // inside the body mesh, exactly the case the island miner was built for.
  //
  // Measured off the source (metres, +Z is front — the Lights-material lamp
  // islands sit at z=+3.77):
  //   tires   612 tris each, r=0.65, w=0.58, hubs (+/-1.66, 0.65, 2.02 / -2.69)
  //   rims    388-tri islands at x=+/-1.39 and +/-1.94 (both faces of the
  //           tire), plus 68-tri hubcaps — all ride along via wheelCapture
  //   body    the two biggest islands (1108 / 786 tris) are LARGER than a
  //           tire, so minWheelTris alone cannot separate seeds — hence
  //           maxWheelTris: 700 leaves exactly the four 612-tri tires.
  //   roof    a 576-tri sushi sign tops the model at y=7.32 (that is why the
  //           bbox is 7.3 m "tall"); it stays with the body, below minWheelTris.
  //
  // The source is a GLB, not OBJ+MTL, so the recipe names `glb` and
  // build-vehicle.mjs skips obj2gltf for it. The model ships textured (Atlas
  // map), so no paint tint is needed.
  //
  // targetLength 5.0 m: the box body reads ~0.5 m longer than the grace van,
  // which is what a pocha is. At that scale the wheels land at r=0.41 m.
  // ---------------------------------------------------------------------
  pocha: {
    id: 'pocha',
    srcDir: '_source-assets/vehicles/sushi-truck',
    glb: '737a333f-5c55-45e5-9742-011d97fd47f1.glb',
    targetLength: 5.0,
    sourceForward: '+z',
    strip: [],
    wheelSeeds: [/^Truck$/],
    minWheelTris: 600,
    maxWheelTris: 700,
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
