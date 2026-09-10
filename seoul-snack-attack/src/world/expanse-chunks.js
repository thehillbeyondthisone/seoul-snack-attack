// Visual-only chunk grid for the kilometre-scale Expanse. Collision and road
// topology deliberately remain global and authoritative.
import * as THREE from 'three';

export function generateExpanseChunkGrid(bounds, cols = 4, rows = 3) {
  const width = (bounds.maxX - bounds.minX) / cols;
  const depth = (bounds.maxZ - bounds.minZ) / rows;
  const chunks = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const minX = bounds.minX + col * width;
    const minZ = bounds.minZ + row * depth;
    chunks.push({
      id: `c${col}_${row}`, index: row * cols + col, col, row,
      minX, maxX: minX + width, minZ, maxZ: minZ + depth,
      center: new THREE.Vector3(minX + width * 0.5, 0, minZ + depth * 0.5),
    });
  }
  return { bounds: { ...bounds }, cols, rows, width, depth, chunks };
}

export function chunkAt(grid, x, z) {
  const col = THREE.MathUtils.clamp(Math.floor((x - grid.bounds.minX) / grid.width), 0, grid.cols - 1);
  const row = THREE.MathUtils.clamp(Math.floor((z - grid.bounds.minZ) / grid.depth), 0, grid.rows - 1);
  return grid.chunks[row * grid.cols + col];
}

export function buildExpanseVisualChunks(parent, bounds, cols = 4, rows = 3) {
  const grid = generateExpanseChunkGrid(bounds, cols, rows);
  for (const chunk of grid.chunks) {
    const root = new THREE.Group();
    root.name = `expanse_chunk_${chunk.id}`;
    const base = new THREE.Group(); base.name = `${root.name}_base`;
    const detail = new THREE.Group(); detail.name = `${root.name}_detail`;
    const micro = new THREE.Group(); micro.name = `${root.name}_micro`;
    root.add(base, detail, micro);
    parent.add(root);
    Object.assign(chunk, { root, base, detail, micro });
  }
  return grid;
}

function distanceToRect(position, chunk) {
  const dx = Math.max(chunk.minX - position.x, 0, position.x - chunk.maxX);
  const dz = Math.max(chunk.minZ - position.z, 0, position.z - chunk.maxZ);
  return Math.hypot(dx, dz);
}

export function updateExpanseVisualChunks(grid, cameraPosition, {
  cullDistance = 720,
  detailDistance = 420,
  microDistance = 240,
} = {}) {
  let visible = 0;
  let detailed = 0;
  let micro = 0;
  for (const chunk of grid.chunks) {
    const distance = distanceToRect(cameraPosition, chunk);
    chunk.root.visible = distance <= cullDistance;
    chunk.detail.visible = chunk.root.visible && distance <= detailDistance;
    chunk.micro.visible = chunk.detail.visible && distance <= microDistance;
    if (chunk.root.visible) visible++;
    if (chunk.detail.visible) detailed++;
    if (chunk.micro.visible) micro++;
  }
  return { total: grid.chunks.length, visible, detailed, micro, cullDistance, detailDistance, microDistance };
}
