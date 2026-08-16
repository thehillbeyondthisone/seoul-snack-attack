// Build the explicit road graph for the irregular district layout.
//
// Each district is the same Buildings IV block under a rigid transform, and
// its drivable asphalt is one rectangle wrapped around the central building
// island (see the street map in city-constants.js). The routed network inside
// a district is therefore a four-corner ring around that island. Districts are
// then stitched together: for each pair listed in DISTRICT_LINKS we pick the
// two closest pairs of street mouths and lay a connector across the gap, so
// every district keeps two independently routable links to each neighbour and
// the graph has no bridges or dead ends (validateRoadGraph enforces this).
//
// Edge kinds: 'street' (ring), 'throat' (ring corner -> mouth, over authored
// asphalt), 'connector' (mouth -> mouth across the seam gap; connectors.js
// builds the visible deck for these).
import * as THREE from 'three';
import {
  STREET_Z_NORTH, STREET_Z_SOUTH, STREET_X_WEST, STREET_X_MID, DISTRICT_LINKS,
} from './city-constants.js';

// Ring corners, tile-local (scaled metres — see city-constants.js).
const CORNERS = {
  nw: [STREET_X_WEST, STREET_Z_NORTH],
  ne: [STREET_X_MID, STREET_Z_NORTH],
  se: [STREET_X_MID, STREET_Z_SOUTH],
  sw: [STREET_X_WEST, STREET_Z_SOUTH],
};
const RING = [['nw', 'ne'], ['ne', 'se'], ['se', 'sw'], ['sw', 'nw']];

// Street mouths where the asphalt meets the road-slab edge (slab measured at
// x -28.81..24.11, z -18.70..11.30), each tied to the ring corner it feeds.
// There is NO south-west mouth: the backdrop building strip intruding at
// x -30.3..-17.1 blocks the west end of the south street.
const MOUTHS = {
  wN: { at: [-28.4, STREET_Z_NORTH], corner: 'nw' },
  eN: { at: [23.7, STREET_Z_NORTH], corner: 'ne' },
  eS: { at: [23.7, STREET_Z_SOUTH], corner: 'se' },
  nW: { at: [STREET_X_WEST, 10.9], corner: 'nw' },
  nE: { at: [STREET_X_MID, 10.9], corner: 'ne' },
  sW: { at: [STREET_X_WEST, -18.4], corner: 'sw' },
  sE: { at: [STREET_X_MID, -18.4], corner: 'se' },
};

/**
 * @param {ReturnType<import('./tiling.js').makeTileGrid>} grid
 * @param {{roadY: number, links?: [number, number][]}} opts
 * @returns {{nodes: object[], edges: object[], districts: {index:number, bounds: THREE.Box3}[]}}
 */
export function buildDistrictGraph(grid, { roadY, links = DISTRICT_LINKS }) {
  const nodes = [];
  const edges = [];
  const nodeById = new Map();

  const local = (x, z) => new THREE.Vector3(x, roadY, z);
  const addNode = (id, t, xz, kind) => {
    const position = grid.localToWorld(t, local(xz[0], xz[1]), new THREE.Vector3());
    const node = { id, position, kind, district: t };
    nodes.push(node);
    nodeById.set(id, node);
    return node;
  };
  const addEdge = (id, a, b, kind, district) => edges.push({ id, a, b, kind, district });

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

  const districts = [];
  for (let t = 0; t < grid.count; t++) districts.push({ index: t, bounds: grid.cellBounds[t] });

  return { nodes, edges, districts };
}
