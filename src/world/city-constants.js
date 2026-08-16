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

/** Lane width. The three streets measure 5.46-7.87 m between kerbs; 5.5 routes cleanly. */
export const STREET_WIDTH = 5.5;

// ---- Clipped nodes ----------------------------------------------------------
// The block's western 11.49 m — the `tiles2` sidewalk and its building frontage,
// x -41.25..-29.76 — stands OUTSIDE the road slab. It has to go, and the reason
// is the tiling below, not art direction:
//
//   A repeating grid must use the road slab as its cell (see TILE_REPEATING),
//   or the roadway gaps at every seam. But anything outside the cell is
//   invisible to every raycast in src/world/tiling.js, so leaving the strip in
//   means the van drives through those buildings. Clip it and the slabs butt
//   edge to edge: 43.03 m of pitch, continuous asphalt, and the two columns'
//   streets merge into cross streets that run the full width of the map.
//
// This is a BOX test, not a name test — the strip is dozens of separately named
// nodes — so it cannot live in TILE_CLIP_RE. Both the runtime (src/world/city.js)
// and the offline bake (tools/build-collider.mjs) call isWestOfRoadSlab with
// their own boxes, and they must keep agreeing or physics and visuals diverge.

/** Node names removed from both the render and the collision soup. */
export const TILE_CLIP_RE = /$a/; // matches nothing

/** True for nodes that must be removed from render and collision alike. */
export function isClipped(_nodeName) { return false; }

/**
 * Tolerance for the clip test, in WORLD metres. Meshes that merely touch the
 * slab's western kerb must survive, so this is a hair over "entirely west of".
 */
export const CLIP_EPSILON = 0.1;

/**
 * True when a mesh lies entirely west of the road slab. Callers pass both
 * values in the SAME space — world metres at the runtime, block-local metres
 * times CITY_SCALE at the bake — so the epsilon means the same thing to both.
 */
export function isWestOfRoadSlab(meshMaxX, roadMinX) {
  return meshMaxX <= roadMinX + CLIP_EPSILON;
}

// ---- Tiling -----------------------------------------------------------------
// The tiling machinery (src/world/tiling.js) keeps exactly one tile-local
// MeshBVH and repeats the block on a TILE_COLS x TILE_ROWS grid, yawing odd Z
// rows by 180 degrees so neighbouring rows do not read as the same corner
// twice.
//
// Shape: seven columns of five on the ROAD SLAB pitch — 43.03 x 30.33 m —
// giving 301.2 x 151.7 m of contiguous asphalt across 35 districts. This works
// only because the western building strip is clipped (see isWestOfRoadSlab
// above); with it in, the cell has to grow to the full 54.52 m of geometry and
// the slabs stop butting.
//
// Growing it: rows and columns are both free now — the cell is the slab, so any
// COLS x ROWS tiles edge to edge. Cost is per-district variant/LOD/dressing work
// at boot (35 districts already), not tiling: the BVH stays at 1x.

export const TILE_COLS = 7;
export const TILE_ROWS = 5;

/**
 * Explicit placements, or null to use the TILE_COLS x TILE_ROWS repeating grid.
 *
 * Null. The two-column explicit layout this replaced kept the western building
 * strip, which forced a geometry-sized cell (54.52 m pitch) and left 11.49 m of
 * back-to-back frontage between the columns — no east/west continuity at all,
 * and a 109 x 152 m map. The repeating grid is 301.2 x 151.7 m: 2.76x the
 * drivable area, 35 districts, and cross streets that actually run.
 */
export const TILE_LAYOUT = null;

/**
 * Which districts get street links between them, as index pairs into the grid
 * (index = row * TILE_COLS + col, matching src/world/tiling.js).
 * src/world/district-roads.js picks the two closest pairs of street mouths for
 * each link.
 *
 * The hard constraint: each district has six mouths and every mouth serves at
 * most one link, so a district can carry AT MOST THREE links. A 7x5 grid's
 * interior districts have four neighbours, so the full mesh is not available
 * and the links have to be chosen.
 *
 * Shape chosen — a ladder. Every row is linked end to end (west/east), and the
 * rows are joined only at the outer columns:
 *
 *   0 - 1 - 2 - 3 - 4 - 5 - 6      each interior district: 2 links (E, W)
 *   |                       |      each outer district:    3 links (E|W, N, S)
 *   7 - 8 - 9 - ...        13
 *   |                       |
 *   ...
 *
 * Two rungs per seam rather than one is what keeps validateRoadGraph() happy:
 * a single rung per seam makes every rung a BRIDGE, and the validator rejects
 * bridges because a cut edge means a delivery route with no alternative. With
 * both outer columns joined, consecutive rows close a cycle and no edge is a
 * cut edge. 30 row links + 8 rungs = 38.
 *
 * Note this is only the ROUTED graph. The asphalt itself is continuous across
 * every seam — the slabs butt — so a district pair with no link here is still
 * drivable between, just not routed through.
 */
export const DISTRICT_LINKS = (() => {
  const links = [];
  const at = (row, col) => row * TILE_COLS + col;
  for (let row = 0; row < TILE_ROWS; row++) {
    for (let col = 0; col < TILE_COLS - 1; col++) links.push([at(row, col), at(row, col + 1)]);
  }
  for (let row = 0; row < TILE_ROWS - 1; row++) {
    for (const col of [0, TILE_COLS - 1]) links.push([at(row, col), at(row + 1, col)]);
  }
  return links;
})();

/**
 * Is the block actually repeated? This decides the tile FOOTPRINT — the cell
 * src/world/tiling.js uses to route rays — and the runtime and the offline bake
 * must agree on it or physics and visuals sit on different worlds.
 *
 * Repeating: footprint = the road slab, so tiles butt with no gap in the road.
 * Single:    footprint = all the geometry, so nothing the player can reach is
 *            outside the cell and therefore invisible to every raycast.
 *
 * TRUE: the block repeats on a slab-sized cell. The western building strip that
 * used to stand 11.49 m outside the slab — and forced this to false, because a
 * slab cell would have left it invisible to every raycast — is now clipped
 * before the cell is derived. See isWestOfRoadSlab above.
 */
export const TILE_REPEATING = true;

/**
 * Rotate odd Z rows 180 degrees about Y. The slab is symmetric in Z, so a
 * flipped row still butts flush; the yaw exists purely so consecutive rows do
 * not read as the same corner repeated.
 */
export const TILE_FLIP_ODD_ROWS = true;

/** Metres of geometry allowed to spill past a tile cell. */
export const TILE_OVERHANG = 0.25;

/**
 * Hide whole tiles beyond this distance from the camera — measured to the
 * district's world BOX, not its centre.
 *
 * This was once 145 against a fabric whose longest centre-to-centre span was
 * ~133 m, which meant it never culled anything: `?stats=1` read "10 of 10
 * drawn" from every street in the city. Culling is done by the view frustum
 * first (src/world/city.js `update`), and this is only the backstop for
 * districts that are ahead of you and too far to read.
 *
 * 105 m is the value the 7x5 fabric shipped with. It sits past the night fog's
 * half-visibility point (~79 m at NIGHT.fogDensity) so districts fade rather
 * than pop, and against a 301 m map it is now doing real work: the backstop
 * matters far more at 35 districts than it did at 10.
 */
export const TILE_CULL_DISTANCE = 105;

/**
 * Drop a district's DETAIL tier beyond this distance from the district CENTRE —
 * vegetation, grass cards and street clutter, as classified in
 * src/world/district-lod.js.
 *
 * Measured on the shipped block, a district splits into 27.6k triangles of
 * structure and 199k of detail: the trees and grass are seven eighths of its
 * geometry. Dropping them early is what makes it affordable to keep the
 * buildings drawn far enough down a 150 m street to still read as a city.
 *
 * 46 m against a 54.5 x 30.3 m block keeps the district you are on plus its
 * north/south neighbours (pitch 30.33) dressed, and drops the column across the
 * street (pitch 54.52). Night fog is already at half visibility by 79 m, so the
 * boundary sits well inside the haze.
 */
export const TILE_DETAIL_DISTANCE = 46;
