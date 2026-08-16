// Build the explicit road graph for the district layout.
//
// Each district is the same Seoul block under a rigid transform. Its drivable
// asphalt wraps THREE sides of a central building island — west, south and
// east — with no street across the north (see the street map in
// city-constants.js). The routed network inside a district is therefore a U,
// not a closed ring, and the U's two open northern ends are that district's
// north mouths.
//
// Districts are then stitched together: for each pair listed in DISTRICT_LINKS
// we pick the two closest pairs of street mouths and lay a connector across the
// seam, so every district keeps two independently routable links to each
// neighbour and the graph has no bridges or dead ends (validateRoadGraph
// enforces this). Because the districts abut, most of those connectors are
// only 1-2 m long and read as the streets simply continuing.
//
// The one place that is not true is the fabric's edge, where a district's U has
// no neighbour to open onto and its north corners would sit at degree 1. Those
// get a PERIMETER edge: a procedural cross-street looping just outside the
// block's north face, closing the U into a ring. It is added by a post-pass over
// actual node degrees rather than from the layout table, so it stays correct
// whatever rotations and rows city-constants.js is given.
//
// Edge kinds: 'street' (the U), 'throat' (U corner -> mouth, over authored
// asphalt), 'connector' (procedural deck — both the seam links and the
// perimeter loops; connectors.js builds the visible geometry for these).
import * as THREE from 'three';
import {
  STREET_Z_NORTH, STREET_Z_SOUTH, STREET_X_WEST, STREET_X_EAST,
  DISTRICT_LINKS,
} from './city-constants.js';

// U corners, tile-local (scaled metres — see city-constants.js).
const CORNERS = {
  nw: [STREET_X_WEST, STREET_Z_NORTH],
  ne: [STREET_X_EAST, STREET_Z_NORTH],
  se: [STREET_X_EAST, STREET_Z_SOUTH],
  sw: [STREET_X_WEST, STREET_Z_SOUTH],
};
// West side down, south side across, east side back up. NO nw-ne edge: that
// span is the building island, not asphalt.
const RING = [['nw', 'sw'], ['sw', 'se'], ['se', 'ne']];

// Street mouths where the asphalt meets the road-slab edge (slab measured at
// x -29.76..13.27, z -13.86..16.47), each tied to the U corner it feeds.
// There is NO west mouth: the block's western building strip stands outside
// the slab and blocks the west end of the south street.
const MOUTHS = {
  nW: { at: [STREET_X_WEST, -13.4], corner: 'nw' },
  nE: { at: [STREET_X_EAST, -13.4], corner: 'ne' },
  sW: { at: [STREET_X_WEST, 15.9], corner: 'sw' },
  sE: { at: [STREET_X_EAST, 15.9], corner: 'se' },
  eN: { at: [12.6, STREET_Z_NORTH], corner: 'ne' },
  eS: { at: [12.6, STREET_Z_SOUTH], corner: 'se' },
};

/**
 * How far north of the block's face the perimeter loop runs, tile-local. The
 * slab ends at z -13.86, so this sits in the open space beyond it rather than
 * cutting across the block's northern sidewalk.
 */
const PERIMETER_Z = -16.5;

/**
 * @param {ReturnType<import('./tiling.js').makeTileGrid>} grid
 * @param {{roadY: number, links?: [number, number][]}} opts
 * @returns {{nodes: object[], edges: object[], districts: {index:number, bounds: THREE.Box3}[]}}
 */
export function buildDistrictGraph(grid, { roadY, links = DISTRICT_LINKS }) {
  const nodes = [];
  const edges = [];
  const nodeById = new Map();

  const degree = new Map();

  const local = (x, z) => new THREE.Vector3(x, roadY, z);
  const addNode = (id, t, xz, kind) => {
    const position = grid.localToWorld(t, local(xz[0], xz[1]), new THREE.Vector3());
    const node = { id, position, kind, district: t };
    nodes.push(node);
    nodeById.set(id, node);
    degree.set(id, 0);
    return node;
  };
  const addEdge = (id, a, b, kind, district, points) => {
    edges.push({ id, a, b, kind, district, ...(points ? { points } : {}) });
    degree.set(a, (degree.get(a) || 0) + 1);
    degree.set(b, (degree.get(b) || 0) + 1);
  };

  // One ring per district.
  for (let t = 0; t < grid.count; t++) {
    for (const [name, xz] of Object.entries(CORNERS)) addNode(`d${t}${name}`, t, xz, 'intersection');
    for (const [a, b] of RING) addEdge(`d${t}${a}${b}`, `d${t}${a}`, `d${t}${b}`, 'street', t);
  }

  // Mouth nodes are created lazily the first time a link uses them, so unused
  // mouths never exist as degree-1 stubs.
  const mouthNode = (t, name) => {
    const id = `d${t}m${name}`;
    if (nodeById.has(id)) return id;
    const mouth = MOUTHS[name];
    addNode(id, t, mouth.at, 'junction');
    addEdge(`${id}t`, id, `d${t}${mouth.corner}`, 'throat', t);
    return id;
  };

  const mouthWorld = (t, name) =>
    grid.localToWorld(t, local(MOUTHS[name].at[0], MOUTHS[name].at[1]), new THREE.Vector3());

  // Two closest distinct mouth pairs per district link.
  const usedMouths = new Set(); // `t:name` — a mouth serves one link only
  for (const [a, b] of links) {
    const candidates = [];
    for (const nameA of Object.keys(MOUTHS)) {
      if (usedMouths.has(`${a}:${nameA}`)) continue;
      const pa = mouthWorld(a, nameA);
      for (const nameB of Object.keys(MOUTHS)) {
        if (usedMouths.has(`${b}:${nameB}`)) continue;
        candidates.push({ nameA, nameB, d: pa.distanceToSquared(mouthWorld(b, nameB)) });
      }
    }
    candidates.sort((p, q) => p.d - q.d);
    const chosen = [];
    for (const c of candidates) {
      if (chosen.length >= 2) break;
      if (chosen.some((o) => o.nameA === c.nameA || o.nameB === c.nameB)) continue;
      chosen.push(c);
    }
    chosen.forEach((c, i) => {
      usedMouths.add(`${a}:${c.nameA}`);
      usedMouths.add(`${b}:${c.nameB}`);
      addEdge(`link${a}-${b}-${i}`, mouthNode(a, c.nameA), mouthNode(b, c.nameB), 'connector', -1);
    });
  }

  // Close any district whose U still has an open northern end. Only nw/ne can
  // be short: sw and se always carry two ring edges. The loop runs just outside
  // the block's north face (PERIMETER_Z) so it lays deck over open space rather
  // than over the authored sidewalk.
  for (let t = 0; t < grid.count; t++) {
    if ((degree.get(`d${t}nw`) ?? 0) >= 2 && (degree.get(`d${t}ne`) ?? 0) >= 2) continue;
    const points = [
      nodeById.get(`d${t}nw`).position.clone(),
      grid.localToWorld(t, local(STREET_X_WEST, PERIMETER_Z), new THREE.Vector3()),
      grid.localToWorld(t, local(STREET_X_EAST, PERIMETER_Z), new THREE.Vector3()),
      nodeById.get(`d${t}ne`).position.clone(),
    ];
    addEdge(`d${t}perimeter`, `d${t}nw`, `d${t}ne`, 'connector', -1, points);
  }

  const districts = [];
  for (let t = 0; t < grid.count; t++) districts.push({ index: t, bounds: grid.cellBounds[t] });

  return { nodes, edges, districts };
}
