// Shared between the runtime (src/world/city.js), the offline collider bake
// (tools/build-collider.mjs) and the headless bench (tools/bench/). Keep these
// in ONE place: if the bake and the runtime disagree, the physics world sits at
// a different scale than the visible city and nothing looks wrong until you
// drive into it.
// Plain data + pure functions only — no three.js import, so node tooling can
// read it.

/** The Seoul block is authored at roughly one-third useful game scale. */
export const CITY_SCALE = 3;

/** Artist's haze volume box; we have a real FogExp2, and it would box in the block. */
export const FOG_MESH_RE = /^fog/i;

/** Baked collision triangle soup, relative to the Vite base. */
export const COLLIDER_URL = 'assets/world/city.collider.bin';

// ---- Street layout ----------------------------------------------------------
// Measured off public/assets/world/seoul-block.glb at CITY_SCALE, so tile-local
// and world metres agree. Re-derive with `node _work/city-rebuild/seoul-measure.mjs`,
// which prints the ASCII surface map these numbers were read off.
//
// The block is a CITY BLOCK, not a straight street: a central building island
// with asphalt wrapping three of its four sides.
//
//   geometry     x -41.25 .. 13.27   z -13.86 .. 16.47   (54.52 x 30.33 m)
//   road slab    x -29.76 .. 13.27   z -13.86 .. 16.47   (43.03 x 30.33 m)
//
// The slab is centred in Z but NOT in X — an 11.49 m strip of sidewalk and
// building frontage (`tiles2`, x -39.78..-30.60) runs down the western side,
// outside the asphalt. That asymmetry is what drives the rotation rules below.
//
//   west street   x -29.76 ..-24.30   full depth      centreline x -27.0
//   east street   x   7.70 .. 13.27   full depth      centreline x  10.5
//   south street  z   8.60 .. 16.47   full width      centreline z  12.4
//   north side    NO street — the building island runs to the slab's north
//                 edge, so the two N/S streets simply open onto it.
//
// So the routed network inside one district is a U (west -> south -> east),
// not a closed ring. The open north ends are the district's north mouths, and
// they are what neighbouring districts connect to.
//
// Seam rules this layout relies on (rotation is about the FOOTPRINT centre,
// x -13.99 / z 1.305, which is NOT the origin and NOT the slab centre):
//   - N/S neighbours align when BOTH share a rotation (dz = 30.33). The slab is
//     symmetric in Z, so the northern tile's south street lands flush against
//     the southern tile's two north mouths — two T-junctions per seam.
//   - E/W neighbours align only when the WESTERN tile has rotation 0 and the
//     EASTERN one rotation PI (dx = 54.52). The mirror puts the eastern tile's
//     western building strip on its far side, so the two road slabs meet
//     exactly, and the two edge-running east streets merge into one ~11 m
//     carriageway. A rotation-PI tile followed by a rotation-0 tile does NOT
//     connect: that seam is 23 m of back-to-back building strip.

/**
 * Material name of the drivable asphalt. The Seoul block names its carriageway
 * `real road`; `concrete_pavement`/`tiles`/`tiles2` are the raised sidewalks and
 * must stay out, or the derived road box swallows the kerbs.
 */
export const ROAD_MAT_RE = /^real road$/i;

/** Street centrelines (see the map above). */
export const STREET_X_WEST = -27.0;
export const STREET_X_EAST = 10.5;
export const STREET_Z_SOUTH = 12.4;
/** North end of the two N/S streets — the U's open corners, just inside the slab. */
export const STREET_Z_NORTH = -11.0;

/** Legacy ladder-graph rows; kept for tools/bench until those checks are rewritten. */
export const STREET_ROWS_Z = [STREET_Z_SOUTH];

/** Legacy ladder-graph crosses; kept for tools/bench until those checks are rewritten. */
export const STREET_CROSS_X = [STREET_X_WEST, STREET_X_EAST];

/** Lane width. The three streets measure 5.46-7.87 m between kerbs; 5.5 routes cleanly. */
export const STREET_WIDTH = 5.5;

/** Legacy ladder-graph toggle; the district graph is explicit now. */
export const STREET_GATES = false;

/**
 * Street ends that open onto nothing, and want a building face across them.
 * Empty: this layout is a contiguous fabric, and its outer rim is handled by
 * end-zones.js rather than by per-street seals.
 * Consumed by src/world/district-dressing.js (tile-local coordinates).
 */
export const DISTRICT_SEALS = [];

// ---- Clipped nodes ----------------------------------------------------------
// No nodes are clipped: the districts abut directly and no connector corridor
// runs through authored geometry. The predicate stays because both the runtime
// (src/world/city.js) and the collider bake (tools/build-collider.mjs) call it,
// and they must keep agreeing.

/** Node names removed from both the render and the collision soup. */
export const TILE_CLIP_RE = /$a/; // matches nothing

/** True for nodes that must be removed from render and collision alike. */
export function isClipped(_nodeName) { return false; }

// ---- Tiling -----------------------------------------------------------------
// The tiling machinery (src/world/tiling.js) keeps exactly one tile-local
// MeshBVH; TILE_LAYOUT places copies of the block at explicit positions and
// rotations. Placement coordinates are where the FOOTPRINT CENTRE goes.
//
// Shape: two columns of five, the western column unrotated and the eastern one
// at PI, per the seam rules above. That is the widest fully-connected fabric
// this block tiles into without laying road over authored buildings —
// 109.04 x 151.65 m of contiguous asphalt, every street authored geometry.
//
// Growing it: add rows (dz = 30.33) freely. Adding a THIRD column does not
// work directly — see the E/W seam rule — it needs a gap plus procedural
// connector bridges, which is a separate piece of work.

const COL_PITCH = 54.52;
const ROW_PITCH = 30.33;
const ROWS = 5;

export const TILE_LAYOUT = [
  // Western column, rotation 0. Index 0 is the northernmost.
  ...Array.from({ length: ROWS }, (_, r) => ({
    x: -COL_PITCH / 2, z: (r - (ROWS - 1) / 2) * ROW_PITCH, rotation: 0,
  })),
  // Eastern column, rotation PI.
  ...Array.from({ length: ROWS }, (_, r) => ({
    x: COL_PITCH / 2, z: (r - (ROWS - 1) / 2) * ROW_PITCH, rotation: Math.PI,
  })),
];
export const TILE_COLS = 2;
export const TILE_ROWS = ROWS;

/**
 * Which districts get street links between them, as index pairs into
 * TILE_LAYOUT. src/world/district-roads.js picks the two closest pairs of
 * street mouths for each link.
 *
 * Each district has six mouths and every mouth serves at most one link, so a
 * district can carry at most three links. The middle row of each column already
 * uses all three (north, south, east), which is why the east/west rungs sit on
 * rows 0, 2 and 4 rather than on every row. Three rungs is enough for
 * validateRoadGraph() to prove no bridges and no dead ends.
 */
export const DISTRICT_LINKS = [
  // Western column, north to south.
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Eastern column, north to south.
  [5, 6], [6, 7], [7, 8], [8, 9],
  // Rungs across the shared middle street.
  [0, 5], [2, 7], [4, 9],
];

/**
 * Is the block actually repeated? This decides the tile FOOTPRINT — the cell
 * src/world/tiling.js uses to route rays — and the runtime and the offline bake
 * must agree on it or physics and visuals sit on different worlds.
 *
 * Repeating: footprint = the road slab, so tiles butt with no gap in the road.
 * Single:    footprint = all the geometry, so nothing the player can reach is
 *            outside the cell and therefore invisible to every raycast.
 *
 * FALSE here even though the block IS repeated: its western building strip
 * stands 11.49 m outside the road slab, and a slab-sized cell would leave that
 * frontage invisible to every raycast — the van would drive through it.
 */
export const TILE_REPEATING = false;

/** Rotate odd Z rows 180 degrees about Y. Rotation is explicit per placement now. */
export const TILE_FLIP_ODD_ROWS = false;

/** Metres of geometry allowed to spill past a tile cell. */
export const TILE_OVERHANG = 0.25;

/**
 * Hide whole tiles beyond this distance from the camera. Across a
 * 109 x 152 m fabric this keeps roughly four to six districts drawn at any
 * time; the rest are fully culled (geometry is shared, so this costs nothing).
 */
export const TILE_CULL_DISTANCE = 145;
