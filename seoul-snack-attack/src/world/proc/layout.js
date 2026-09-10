// Procedural Seoul night circuit: roads, lots, canal, roundabout, plaza.
//
// Pure data + three.js math. The mesh builder and the Node graph check both
// call generateLayout() with the same seed so a bench failure is a game failure.
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.js';
import { DISTRICTS, districtAt } from '../data/color-bible.js';

export const PROC_SEED = 20260824;
export const SIDEWALK = 2.2;
export const KERB_H = 0.10;
export const ROAD_Y = 0;
export const CANAL_Y = -2.4;
export const WATER_Z0 = 32;
export const WATER_Z1 = 48;

const XS = [-132, -96, -60, -28, 0, 28, 60, 96, 132];
const ZS = [-102, -70, -38, -8, 24, 56, 90];
const COLS = XS.length;
const ROWS = ZS.length;
const BRIDGE_COLS = [1, 4, 7];
const BOULEVARD_C = 4;
const MARKET_R = 2;
const CANAL_R0 = 4;
const CANAL_R1 = 5;
const PLAZA = { c: 5, r: 1 };

function nid(c, r) { return `n${c}_${r}`; }

function widthFor(c0, r0, c1, r1) {
  if ((c0 === BOULEVARD_C && c1 === BOULEVARD_C)) return 14;
  if ((r0 === MARKET_R && r1 === MARKET_R)) return 10;
  if ((r0 === CANAL_R0 && r1 === CANAL_R0) || (r0 === CANAL_R1 && r1 === CANAL_R1)) return 10;
  if (c0 === c1 && BRIDGE_COLS.includes(c0) && Math.abs(r0 - r1) === 1
    && Math.min(r0, r1) === CANAL_R0) return 12;
  // Hongdae tight grid (west of boulevard, north of canal).
  if (Math.max(c0, c1) <= 3 && Math.max(r0, r1) <= CANAL_R0 && Math.min(r0, r1) >= 1) return 5.6;
  // Pocha south-east of the canal.
  if (Math.min(c0, c1) >= 5 && Math.min(r0, r1) >= CANAL_R1) return 5.6;
  return 8;
}

function isCanalCrossing(c0, r0, c1, r1) {
  if (c0 !== c1) return false;
  const lo = Math.min(r0, r1);
  const hi = Math.max(r0, r1);
  return lo === CANAL_R0 && hi === CANAL_R1;
}

function jittered(rng, c, r) {
  let x = XS[c];
  let z = ZS[r];
  const perimeter = c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1;
  const lockedX = c === BOULEVARD_C;
  const lockedZ = r === MARKET_R || r === CANAL_R0 || r === CANAL_R1;
  if (!perimeter) {
    if (!lockedX) x += (rng() - 0.5) * 9;
    if (!lockedZ) z += (rng() - 0.5) * 9;
  }
  return { x, z };
}

export function generateLayout(seed = PROC_SEED) {
  const rng = mulberry32(seed);
  const positions = new Map();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (c === BOULEVARD_C && r === MARKET_R) continue; // replaced by the roundabout
      positions.set(nid(c, r), jittered(rng, c, r));
    }
  }

  const roundabout = { x: XS[BOULEVARD_C], z: ZS[MARKET_R], radius: 12 };
  const ring = {
    rN: { x: roundabout.x, z: roundabout.z - roundabout.radius },
    rE: { x: roundabout.x + roundabout.radius, z: roundabout.z },
    rS: { x: roundabout.x, z: roundabout.z + roundabout.radius },
    rW: { x: roundabout.x - roundabout.radius, z: roundabout.z },
  };
  for (const [id, p] of Object.entries(ring)) positions.set(id, p);

  const plaza = {
    x: (XS[PLAZA.c] + XS[PLAZA.c + 1]) * 0.5,
    z: (ZS[PLAZA.r] + ZS[PLAZA.r + 1]) * 0.5,
  };
  positions.set('plaza', plaza);

  const nodes = [...positions.entries()].map(([id, p]) => ({
    id,
    position: new THREE.Vector3(p.x, ROAD_Y, p.z),
  }));

  const edges = [];
  const addEdge = (a, b, extra = {}) => {
    if (!positions.has(a) || !positions.has(b)) return;
    const pa = positions.get(a);
    const pb = positions.get(b);
    const mid = { x: (pa.x + pb.x) * 0.5, z: (pa.z + pb.z) * 0.5 };
    const district = districtAt(mid.x, mid.z);
    edges.push({
      id: `${a}__${b}`,
      a, b,
      width: extra.width || 8,
      kind: extra.kind || 'street',
      district: district.index,
      districtId: district.id,
      points: [
        new THREE.Vector3(pa.x, ROAD_Y, pa.z),
        new THREE.Vector3(pb.x, ROAD_Y, pb.z),
      ],
      ...extra,
    });
  };

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (c + 1 < COLS) {
        const a = nid(c, r);
        const b = nid(c + 1, r);
        // Roundabout occupies the market/boulevard crossing; skip the two
        // east-west segments that would have run through its centre.
        const throughRoundabout = r === MARKET_R && (c === BOULEVARD_C - 1 || c === BOULEVARD_C);
        if (!throughRoundabout) addEdge(a, b, { width: widthFor(c, r, c + 1, r) });
      }
      if (r + 1 < ROWS) {
        if (isCanalCrossing(c, r, c, r + 1) && !BRIDGE_COLS.includes(c)) continue;
        const throughRoundabout = c === BOULEVARD_C && (r === MARKET_R - 1 || r === MARKET_R);
        if (throughRoundabout) continue;
        addEdge(nid(c, r), nid(c, r + 1), {
          width: widthFor(c, r, c, r + 1),
          kind: isCanalCrossing(c, r, c, r + 1) ? 'street' : 'street',
          bridge: isCanalCrossing(c, r, c, r + 1),
        });
      }
    }
  }

  // Roundabout spokes + ring. Width 10 so it reads as a circulating carriageway.
  addEdge(nid(BOULEVARD_C, MARKET_R - 1), 'rN', { width: 14 });
  addEdge('rS', nid(BOULEVARD_C, MARKET_R + 1), { width: 14 });
  addEdge(nid(BOULEVARD_C - 1, MARKET_R), 'rW', { width: 10 });
  addEdge('rE', nid(BOULEVARD_C + 1, MARKET_R), { width: 10 });
  addEdge('rN', 'rE', { width: 10, kind: 'street' });
  addEdge('rE', 'rS', { width: 10, kind: 'street' });
  addEdge('rS', 'rW', { width: 10, kind: 'street' });
  addEdge('rW', 'rN', { width: 10, kind: 'street' });

  // Driveable market plaza — four spokes, so the square is a shortcut not a room.
  addEdge('plaza', nid(PLAZA.c, PLAZA.r), { width: 8, kind: 'street' });
  addEdge('plaza', nid(PLAZA.c + 1, PLAZA.r), { width: 8, kind: 'street' });
  addEdge('plaza', nid(PLAZA.c, PLAZA.r + 1), { width: 8, kind: 'street' });
  addEdge('plaza', nid(PLAZA.c + 1, PLAZA.r + 1), { width: 8, kind: 'street' });

  const blocks = [];
  for (let c = 0; c < COLS - 1; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const water = r === CANAL_R0;
      const plazaBlock = c === PLAZA.c && r === PLAZA.r;
      const roundaboutBlock = (c === BOULEVARD_C - 1 || c === BOULEVARD_C) && r === MARKET_R - 1;
      const corners = [
        positions.get(nid(c, r)) || (c === BOULEVARD_C && r === MARKET_R ? ring.rN : null),
        positions.get(nid(c + 1, r)) || (c + 1 === BOULEVARD_C && r === MARKET_R ? ring.rN : null),
        positions.get(nid(c + 1, r + 1)) || (c + 1 === BOULEVARD_C && r + 1 === MARKET_R ? ring.rS : null),
        positions.get(nid(c, r + 1)) || (c === BOULEVARD_C && r + 1 === MARKET_R ? ring.rS : null),
      ];
      // Roundabout cells are incomplete quads; skip building fill, keep the island.
      if (corners.some((p) => !p) || roundaboutBlock) {
        if (roundaboutBlock) {
          blocks.push({
            c, r, kind: 'roundabout', water: false, plaza: false,
            corners: null, district: districtAt(roundabout.x, roundabout.z),
          });
        }
        continue;
      }
      const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) * 0.25;
      const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25;
      const kind = water ? 'water' : plazaBlock ? 'plaza' : 'lot';
      blocks.push({
        c, r, kind, water, plaza: plazaBlock,
        corners, district: districtAt(cx, cz),
        center: { x: cx, z: cz },
        edgeWidths: [
          widthFor(c, r, c + 1, r),
          widthFor(c + 1, r, c + 1, r + 1),
          widthFor(c, r + 1, c + 1, r + 1),
          widthFor(c, r, c, r + 1),
        ],
      });
    }
  }

  const playMinX = XS[0] - 10;
  const playMaxX = XS[COLS - 1] + 10;
  const playMinZ = ZS[0] - 10;
  const playMaxZ = ZS[ROWS - 1] + 10;

  const districts = DISTRICTS.map((d) => {
    const xs = [];
    const zs = [];
    for (const block of blocks) {
      if (block.district.id !== d.id || !block.corners) continue;
      for (const p of block.corners) { xs.push(p.x); zs.push(p.z); }
    }
    if (!xs.length) {
      return {
        id: d.id, index: d.index, color: d.mapFill,
        bounds: { min: { x: 0, z: 0 }, max: { x: 0, z: 0 } },
      };
    }
    return {
      id: d.id,
      index: d.index,
      color: d.mapFill,
      bounds: {
        min: { x: Math.min(...xs), z: Math.min(...zs) },
        max: { x: Math.max(...xs), z: Math.max(...zs) },
      },
    };
  });

  return {
    seed,
    nodes,
    edges,
    blocks,
    positions,
    roundabout,
    plaza,
    playable: { minX: playMinX, maxX: playMaxX, minZ: playMinZ, maxZ: playMaxZ },
    districts,
    spawn: {
      position: new THREE.Vector3(3.2, ROAD_Y + 0.8, ZS[MARKET_R + 1]),
      heading: Math.PI, // face -Z, north, toward the roundabout
      tile: 0,
    },
  };
}
