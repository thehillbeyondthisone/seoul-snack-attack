// Shared between the runtime (src/world/city.js), the offline collider bake
// (tools/build-collider.mjs) and the headless bench (tools/bench/). Keep these
// in ONE place: if the bake and the runtime disagree, the physics world sits at
// a different scale than the visible city and nothing looks wrong until you
// drive into it.
// Plain data + pure functions only — no three.js import, so node tooling can
// read it.

/** Buildings IV is authored at roughly one-third useful game scale. */
export const CITY_SCALE = 3;

/** Artist's haze volume box; we have a real FogExp2, and it would box in the block. */
export const FOG_MESH_RE = /^fog/i;

/** Baked collision triangle soup, relative to the Vite base. */
export const COLLIDER_URL = 'assets/world/city.collider.bin';

// ---- Street layout ----------------------------------------------------------
// Measured off the repaired Buildings IV GLB at CITY_SCALE, so tile-local and
// world metres agree (see _work/city-rebuild/dump-ground.mjs and topdown.png).
// The drivable asphalt is one rectangle, x -28.8..24.1 / z -18.7..11.3, minus
// a central building island (x -10.9..4.9, z -11.5..4.3), a paved plaza east of
// it (x 10.2..26.0, z -11.5..4.3), and a backdrop building strip intruding
// onto the slab at x -30.3..-17.1, z -17.3..1.9. More backdrop buildings stand
// beyond the road on the south (x -9.9..12.3, z -17.9..-24.9) and scattered on
// the north — what makes abutting districts read as continuous street canyons.
// The routed streets form a ring around the island:
//
//   north street    z   4.3 .. 11.3    centreline z   7.8
//   south street    z -18.7 ..-11.5    centreline z -15.1
//   west street     x -17.1 ..-10.9    centreline x -14.0
//   middle street   x   4.9 .. 10.2    centreline x   7.55
//
// Mouths usable for inter-district links: east edge at z 7.8 and z -15.1,
// west edge at z 7.8 only (the backdrop strip blocks the west end of the
// south street), north edge at x -14 and x 7.55, south edge at x -14 and
// x 7.55. Rotation facts this layout relies on (rotation is about the
// footprint centre, which is NOT the origin):
//   - N/S neighbours keep mouth alignment when BOTH have the same rotation.
//   - E/W neighbours get two near-aligned links (1.5 m jog) only when the
//     WESTERN tile has rotation 0 and the EASTERN one rotation PI.

/**
 * Material name of the drivable asphalt. `road` is the detailed street surface
 * with markings, `road2` the base layer running under it and around the
 * backdrop clusters. Must NOT match unrelated `road*` props.
 */
export const ROAD_MAT_RE = /^road2?(\.\d+)?$/i;

/** Ring street centrelines (see the map above). */
export const STREET_Z_NORTH = 7.8;
export const STREET_Z_SOUTH = -15.1;
export const STREET_X_WEST = -14;
export const STREET_X_MID = 7.55;

/** Legacy ladder-graph rows; kept for tools/bench until those checks are rewritten. */
export const STREET_ROWS_Z = [STREET_Z_NORTH, STREET_Z_SOUTH];

/** Legacy ladder-graph crosses; kept for tools/bench until those checks are rewritten. */
export const STREET_CROSS_X = [STREET_X_WEST, STREET_X_MID];

/** Lane width. The ring streets measure 5.8-7 m between curbs; 8 routes cleanly. */
export const STREET_WIDTH = 8;

/** Legacy ladder-graph toggle; the district graph is explicit now. */
export const STREET_GATES = false;

/**
 * Street ends that open onto nothing, and want a building face across them.
 * Empty: the irregular layout terminates its streets over water, and the
 * connector bridges + edge walls are the visible limit instead.
 * Consumed by src/world/district-dressing.js (tile-local coordinates).
 */
export const DISTRICT_SEALS = [];

// ---- Clipped nodes ----------------------------------------------------------
// No nodes are clipped in the current map: the connector corridors of the old
// rectangular layout are gone, and the irregular layout routes its links over
// open water instead of through authored geometry. The predicate stays because
// both the runtime (src/world/city.js) and the collider bake
// (tools/build-collider.mjs) call it, and they must keep agreeing.

/** Node names removed from both the render and the collision soup. */
export const TILE_CLIP_RE = /$a/; // matches nothing

/** True for nodes that must be removed from render and collision alike. */
export function isClipped(_nodeName) { return false; }

// ---- Tiling -----------------------------------------------------------------
// The tiling machinery (src/world/tiling.js) still keeps exactly one tile-local
// MeshBVH, but the grid is no longer rectangular: TILE_LAYOUT places copies of
// the block at explicit positions/rotations. Target shape is a contiguous dense
// fabric (streets flow across seams, water only at the outer rim) — currently
// a TWO-district trial pair while the seam rules are validated in play.
// Pairing rules (from the street map above): E/W neighbours align when the
// western tile is rotation 0 and the eastern rotation PI (dx = 56.1, geometry
// flush); N/S neighbours align when both share a rotation (dz = 34.4).

export const TILE_LAYOUT = [
  { x: -28.05, z: -17.2, rotation: 0 },
  { x: 28.05, z: -17.2, rotation: Math.PI },
];
export const TILE_COLS = TILE_LAYOUT.length;
export const TILE_ROWS = 1;

/**
 * Which districts get street links between them, as index pairs into
 * TILE_LAYOUT. src/world/district-roads.js picks the two closest pairs of
 * street mouths for each link. Mesh redundancy means not every pair needs two
 * physical connectors — validateRoadGraph() proves no bridges/dead ends.
 */
export const DISTRICT_LINKS = [[0, 1]];

/**
 * Is the block actually repeated? This decides the tile FOOTPRINT — the cell
 * src/world/tiling.js uses to route rays — and the runtime and the offline bake
 * must agree on it or physics and visuals sit on different worlds.
 *
 * Repeating: footprint = the road slab, so tiles butt with no gap in the road.
 * Single:    footprint = all the geometry, so nothing the player can reach is
 *            outside the cell and therefore invisible to every raycast.
 */
export const TILE_REPEATING = false;

/** Rotate odd Z rows 180 degrees about Y. Inert at one row; kept for the math. */
export const TILE_FLIP_ODD_ROWS = true;

/** Metres of geometry allowed to spill past a tile cell. */
export const TILE_OVERHANG = 0.25;

/**
 * Hide whole tiles beyond this distance from the camera. With seven districts
 * in an irregular ring, roughly two or three are inside this radius at any
 * time; the rest are fully culled (geometry is shared, so this costs nothing).
 */
export const TILE_CULL_DISTANCE = 145;
