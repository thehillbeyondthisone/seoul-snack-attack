// Ground decals for the proc city — manholes, road patches, crosswalks and
// grease stains in front of shop faces. Everything is painted onto canvases at
// boot (same approach as the Hangul sign canvases) and laid as merged +Y quads
// a hair above the road, pulled toward the camera with polygonOffset so they
// never z-fight with the asphalt slabs or the painted centreline marks.
//
// Budget: four canvas textures and up to four draw calls total. The count
// scales with `detailIntensity` — the same gfx-profile hook that already dials
// detail-map strength — so mobile gets a sparser street for free. A budget of
// 0 (detailIntensity ≤ 0) disables decal generation entirely.
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.js';
import { ROAD_Y } from './layout.js';

/** Canvas → sRGB texture with the same sampling settings as the sign pool. */
function canvasTexture(w, h, paint, rng = Math.random) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d'), w, h, rng);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Circular manhole cover: dark disc, raised rim, bar pattern. */
function paintManhole(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = w * 0.44;
  // Dirt halo so the plate sits in the asphalt instead of floating on it.
  let grad = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, w * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1b160e';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4030';
  ctx.lineWidth = w * 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  // Two rows of grip bars, offset like a real twin-keyhole cover.
  ctx.fillStyle = '#241d12';
  const barH = h * 0.07;
  for (const [rowY, phase] of [[cy - r * 0.38, 0], [cy + r * 0.18, w * 0.09]]) {
    for (let x = phase; x < w - w * 0.12; x += w * 0.16) {
      ctx.fillRect(x, rowY, w * 0.09, barH);
    }
  }
}

/** Fresh asphalt patch: irregular dark blob with a faint tarred edge. */
function paintPatch(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  // Jagged radius polygon — patches never have smooth silhouettes.
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = w * (0.28 + 0.14 * Math.abs(Math.sin(i * 2.7 + 1.3)) + 0.06 * Math.sin(i * 5.1));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,5,3,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,10,0.9)';
  ctx.lineWidth = w * 0.02;
  ctx.stroke();
  // Tar streaks inside the patch.
  ctx.strokeStyle = 'rgba(30,25,16,0.5)';
  ctx.lineWidth = w * 0.015;
  for (let i = 0; i < 5; i++) {
    const y = h * (0.2 + 0.15 * i);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.25, y);
    ctx.quadraticCurveTo(cx, y + h * 0.05, cx + w * 0.28, y - h * 0.03);
    ctx.stroke();
  }
}

/**
 * Zebra crossing tile: worn white bars across the road. Bars run along the
 * travel direction and repeat across it, so the quad's U axis spans the road.
 */
function paintCrosswalk(ctx, w, h, rng) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(226,218,196,0.92)';
  const bars = 7;
  const pitch = w / bars;
  const barW = pitch * 0.55;
  for (let i = 0; i < bars; i++) {
    ctx.fillRect(i * pitch + (pitch - barW) * 0.5, 0, barW, h);
  }
  // Wheel-track wear: punch translucent holes along two lanes of noise.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const laneY = h * (rng() < 0.5 ? 0.3 : 0.7);
    const y = laneY + (rng() - 0.5) * h * 0.34;
    ctx.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.45})`;
    ctx.beginPath();
    ctx.arc(rng() * w, y, 1 + rng() * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Grease/oil stain: layered soft blobs, darkest at old drip centres. */
function paintStain(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  for (let i = 0; i < 6; i++) {
    const ox = cx + (Math.sin(i * 3.7 + 0.8) * w * 0.18);
    const oy = cy + (Math.cos(i * 2.3 + 0.4) * h * 0.18);
    const rr = w * (0.16 + 0.13 * Math.abs(Math.sin(i * 1.9)));
    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr);
    grad.addColorStop(0, 'rgba(10,8,5,0.62)');
    grad.addColorStop(0.7, 'rgba(14,11,7,0.35)');
    grad.addColorStop(1, 'rgba(14,11,7,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * One mesh per decal type: records are merged into a single +Y quad soup
 * (positions/uv/normals written by hand — no per-instance geometry objects).
 */
function quadMesh(records, material, name) {
  if (!records.length) return null;
  const n = records.length;
  const pos = new Float32Array(n * 12);
  const nor = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const idx = new Uint16Array(n * 6); // budgets keep n·4 far below 65 536
  const cos = [];
  const sin = [];
  for (let r = 0; r < n; r++) {
    const { x, z, w, d, yaw } = records[r];
    cos[r] = Math.cos(yaw);
    sin[r] = Math.sin(yaw);
  }
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let r = 0; r < n; r++) {
    const { x, z, w, d } = records[r];
    for (let c = 0; c < 4; c++) {
      const lx = corners[c][0] * w;
      const lz = corners[c][1] * d;
      const v = r * 4 + c;
      pos[v * 3] = x + lx * cos[r] + lz * sin[r];
      pos[v * 3 + 1] = ROAD_Y + 0.035;
      pos[v * 3 + 2] = z - lx * sin[r] + lz * cos[r];
      nor[v * 3] = 0;
      nor[v * 3 + 1] = 1;
      nor[v * 3 + 2] = 0;
      uv[v * 2] = uvs[c][0];
      uv[v * 2 + 1] = uvs[c][1];
    }
    const b = r * 6;
    const v = r * 4;
    idx[b] = v; idx[b + 1] = v + 2; idx[b + 2] = v + 1;
    idx[b + 3] = v; idx[b + 4] = v + 3; idx[b + 5] = v + 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

function decalMaterial(texture, { roughness = 0.82, color = 0xffffff } = {}) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    color,
    transparent: true,
    depthWrite: false,
    roughness,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: true,
    name: 'proc_decal',
  });
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Lay the decal set for this layout. `buildings` comes straight from
 * buildCityMesh (shop faces included) so stains can hug landmark storefronts.
 * Returns { group, materials, count, dispose } or null when disabled.
 */
export function createGroundDecals(layout, buildings, { detailIntensity = 1, seed = 0 } = {}) {
  const quality = Math.max(0, Math.min(1, detailIntensity));
  if (!(quality > 0)) return null;

  const rng = mulberry32((seed ^ 0xdeca1) >>> 0 || 0xdeca1);
  const budget = Math.round(170 * quality);
  // ---- Candidate gathering -------------------------------------------------
  const crossings = [];
  const manholes = [];
  const patches = [];

  for (const edge of layout.edges) {
    if (edge.bridge) continue;
    const a = layout.positions.get(edge.a);
    const b = layout.positions.get(edge.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 6) continue;
    const dirX = dx / len;
    const dirZ = dz / len;
    // Quad U axis spans the road, V runs along it. Yaw rotates local +X onto
    // the across-road direction (−dirZ, dirX) under three's Y-rotation.
    const acrossYaw = Math.atan2(-dirX, -dirZ);
    const clear = Math.max(edge.width, 8) * 0.5 + 1.6;
    const spanW = Math.min(edge.width - 1.4, 12.6);
    if (spanW > 2.4 && len > clear * 2 + 3.4) {
      crossings.push({ x: a.x + dirX * clear, z: a.z + dirZ * clear, w: spanW, d: 2.6, yaw: acrossYaw });
      crossings.push({ x: b.x - dirX * clear, z: b.z - dirZ * clear, w: spanW, d: 2.6, yaw: acrossYaw });
    }

    // Manholes sit mid-span, patches anywhere on the carriageway; both keep
    // clear of the kerbs so they never clip the sidewalk slabs.
    const lateralMax = Math.max(0.4, edge.width * 0.5 - 1.4);
    const midCount = Math.floor(len / 26);
    for (let i = 0; i <= midCount && i < 3; i++) {
      const t = 0.3 + rng() * 0.4;
      const off = (rng() * 2 - 1) * lateralMax;
      manholes.push({
        x: a.x + dirX * len * t - dirZ * off,
        z: a.z + dirZ * len * t + dirX * off,
        w: 1.15, d: 1.15, yaw: rng() * Math.PI,
      });
    }
    if (rng() < 0.55) {
      const t = 0.15 + rng() * 0.7;
      const off = (rng() * 2 - 1) * lateralMax;
      const size = 2.2 + rng() * 2.4;
      patches.push({
        x: a.x + dirX * len * t - dirZ * off,
        z: a.z + dirZ * len * t + dirX * off,
        w: size, d: size * (0.6 + rng() * 0.5), yaw: acrossYaw,
      });
    }
  }

  // Grease trails in front of shop faces — sidewalk first, gutter edge at the
  // far end. Food districts (market/pocha) get priority: that is where the
  // griddles are.
  const shops = buildings.filter((bd) => bd.shop);
  const foodFirst = shuffle(shops.slice(), rng).sort(
    (p, q) => Number(q.districtId === 'market' || q.districtId === 'pocha')
      - Number(p.districtId === 'market' || p.districtId === 'pocha'),
  );
  const stains = foodFirst.map((bd) => ({
    x: bd.faceX + bd.toStreet.x * (0.8 + rng() * 2.4) + (rng() * 2 - 1) * 1.2,
    z: bd.faceZ + bd.toStreet.z * (0.8 + rng() * 2.4) + (rng() * 2 - 1) * 1.2,
    w: 1.6 + rng() * 1.6,
    d: 1.6 + rng() * 1.6,
    yaw: rng() * Math.PI,
  }));

  // ---- Budget split --------------------------------------------------------
  shuffle(crossings, rng);
  shuffle(manholes, rng);
  shuffle(patches, rng);
  const take = (list, share) => list.slice(0, Math.round(budget * share));
  const crossRecs = take(crossings, 0.34);
  const manRecs = take(manholes, 0.16);
  const patRecs = take(patches, 0.26);
  const stainRecs = stains.slice(0, Math.max(0, budget - crossRecs.length - manRecs.length - patRecs.length));

  // ---- Build ----------------------------------------------------------------
  const textures = {
    crosswalk: canvasTexture(512, 128, paintCrosswalk, rng),
    manhole: canvasTexture(128, 128, paintManhole),
    patch: canvasTexture(256, 256, paintPatch),
    stain: canvasTexture(128, 128, paintStain),
  };
  const materials = {
    crosswalk: decalMaterial(textures.crosswalk, { roughness: 0.72 }),
    manhole: decalMaterial(textures.manhole, { roughness: 0.55, metalness: 0.35 }),
    patch: decalMaterial(textures.patch, { roughness: 0.9 }),
    stain: decalMaterial(textures.stain, { roughness: 0.42 }),
  };
  const meshes = [
    quadMesh(crossRecs, materials.crosswalk, 'proc_dec_crosswalk'),
    quadMesh(manRecs, materials.manhole, 'proc_dec_manholes'),
    quadMesh(patRecs, materials.patch, 'proc_dec_patches'),
    quadMesh(stainRecs, materials.stain, 'proc_dec_stains'),
  ].filter(Boolean);

  const group = new THREE.Group();
  group.name = 'proc_ground_decals';
  meshes.forEach((m) => group.add(m));

  return {
    group,
    materials: Object.values(materials),
    count: crossRecs.length + manRecs.length + patRecs.length + stainRecs.length,
    dispose() {
      meshes.forEach((m) => m.geometry.dispose());
      Object.values(textures).forEach((t) => t.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
