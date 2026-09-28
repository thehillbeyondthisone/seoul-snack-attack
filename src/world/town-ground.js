// 밤내 Bamnae — ground, water and road surfaces from the height field.
//
// T1. This is the first module that turns `town-terrain.js` into triangles, and
// it is deliberately the ONLY one that does: the collider, the preview, the
// Blender export and (later) the runtime all call the same builders, so there
// is no way for what you drive on and what you look at to disagree.
//
// Plain data out — typed arrays and plain objects, no three.js import — so the
// Node tooling can serialise it and the runtime can wrap it in a
// BufferGeometry without either owning the other. Same reasoning as
// city-constants.js.
//
// The ground is ONE heightfield mesh, not the Expanse's four flat quads with
// the river cut out. The channel is part of the same surface — it is a trench
// in the field, so the banks are real geometry and the bed is drivable if you
// are silly enough to get down there. Only the water is separate.
import { createTownTerrain } from './town-terrain.js';

/**
 * Ground cell size, metres.
 *
 * 4 m over the 720 x 570 m world including margin is 181 x 143 vertices and
 * about 51k triangles — roughly a fifth of what one Expanse district spends on
 * vegetation, for the entire town's terrain. Finer than 4 m buys nothing the
 * road conform does not already deliver: inside a carriageway the field is
 * flat by construction, and the steepest thing in town is a 25% hillside,
 * which 4 m samples to within 5 cm.
 */
export const GROUND_CELL = 4;

/** Road surfaces sit this far above the field so they never z-fight it. */
export const ROAD_LIFT = 0.04;

/** Metres of texture per world metre. Ground tiles far coarser than road. */
export const GROUND_UV = 1 / 12;

/**
 * Heightfield ground over the whole world including its margin.
 *
 * Normals come from the field's own analytic gradient rather than from face
 * averaging, because the conform makes sharp creases at carriageway edges that
 * face averaging rounds over — and a rounded kerb edge is exactly the artefact
 * that makes a road look painted on rather than cut in.
 */
export function buildTownGround(terrain, cell = GROUND_CELL) {
  const grid = terrain.sampleGrid(cell);
  const { cols, rows, minX, minZ, heights } = grid;
  const count = cols * rows;

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);

  for (let r = 0; r < rows; r++) {
    const z = minZ + r * cell;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = minX + c * cell;
      const y = heights[i];
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const n = terrain.normalAt(x, z, cell * 0.5);
      normals[i * 3] = n.x;
      normals[i * 3 + 1] = n.y;
      normals[i * 3 + 2] = n.z;
      uvs[i * 2] = x * GROUND_UV;
      uvs[i * 2 + 1] = z * GROUND_UV;
    }
  }

  const quads = (cols - 1) * (rows - 1);
  const indices = new Uint32Array(quads * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // Split each quad along its SHORTER diagonal. On a benched hillside the
      // two diagonals differ by metres, and picking the same one everywhere
      // puts a visible staircase down every cut face.
      if (Math.abs(heights[a] - heights[e]) <= Math.abs(heights[b] - heights[d])) {
        indices[k++] = a; indices[k++] = d; indices[k++] = e;
        indices[k++] = a; indices[k++] = e; indices[k++] = b;
      } else {
        indices[k++] = a; indices[k++] = d; indices[k++] = b;
        indices[k++] = b; indices[k++] = d; indices[k++] = e;
      }
    }
  }

  return { positions, normals, uvs, indices, cols, rows, cell, grid };
}

/**
 * The water surface: one ribbon down the channel at the authored per-point
 * water level, inset slightly so it tucks under the bank rather than ending in
 * a visible edge against it.
 */
export function buildTownWater(terrain) {
  const pts = terrain.stream.points;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    // 0.4 m of inset: enough to hide the seam, not enough to show bank between
    // the water and the wall.
    const half = pts[i].half + 0.4;
    positions.push(pts[i].x + nx * half, pts[i].water, pts[i].z + nz * half);
    positions.push(pts[i].x - nx * half, pts[i].water, pts[i].z - nz * half);
    const v = i / (pts.length - 1);
    uvs.push(0, v, 1, v);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/**
 * Road surfaces, one ribbon per edge at its own surveyed elevation.
 *
 * Non-bridge roads sit ROAD_LIFT above the field, which the conform has
 * already flattened to match — so the lift is purely a z-fight margin, not a
 * kerb. Bridge decks float at their authored height over the open channel and
 * get side beams, because a deck with no thickness read as a sticker.
 */
export function buildTownRoads(terrain) {
  const groups = [];

  for (const edge of terrain.layout.edges) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const half = edge.width / 2;
    let along = 0;

    for (let i = 0; i < edge.points.length; i++) {
      const p = edge.points[i];
      const a = edge.points[Math.max(0, i - 1)];
      const b = edge.points[Math.min(edge.points.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      if (i > 0) {
        const q = edge.points[i - 1];
        along += Math.hypot(p.x - q.x, p.z - q.z);
      }
      const y = p.y + ROAD_LIFT;
      positions.push(p.x + nx * half, y, p.z + nz * half);
      positions.push(p.x - nx * half, y, p.z - nz * half);
      uvs.push(0, along / edge.width, 1, along / edge.width);
    }

    for (let i = 0; i < edge.points.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }

    groups.push({
      id: edge.id,
      kind: edge.kind,
      name: edge.name,
      district: edge.districtId,
      bridge: !!edge.bridge,
      positions: new Float32Array(positions),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
    });
  }

  return groups;
}

/** Everything T1 needs, from one terrain instance. */
export function buildTownSurfaces(terrain = createTownTerrain()) {
  return {
    terrain,
    ground: buildTownGround(terrain),
    water: buildTownWater(terrain),
    roads: buildTownRoads(terrain),
  };
}
