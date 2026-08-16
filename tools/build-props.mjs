// Build individually-placeable prop GLBs from the NikolaJankovic OBJ packs.
// Usage: node tools/build-props.mjs [packId ...]        (default: all)
//        node tools/build-props.mjs --dry               (cluster only, no write)
//
// Why this is not just obj2gltf:
//   Each pack is ONE merged mesh holding a dozen-plus separate objects laid out
//   on a grid, sharing a single atlas material. To place a traffic cone we have
//   to cut it out of that soup first. So: weld -> connected components ->
//   merge components by proximity -> one primitive per resulting cluster.
//
// The weld is load-bearing. These OBJs have fully split vertices (v/vt/vn 1:1),
// so without welding on position every triangle is its own island and a bicycle
// reports ~1169 "objects" instead of 1.
//
// Texture policy: one atlas per pack means ONE material and ONE GLB per pack —
// splitting packs into separate files would duplicate the atlas N times. We
// keep albedo + normal + a packed ORM (R=AO, G=roughness, B=metallic, which is
// exactly glTF's metallicRoughness+occlusion layout) and drop opacity, which no
// pack in this set needs.
import { Document, NodeIO } from '@gltf-transform/core';
// Extensions only — NEVER @gltf-transform/functions here. This file imports
// sharp, and functions brings its own nested sharp; two libvips instances in
// one process break each other (see the note at the top of tools/optimize.mjs).
import { ALL_EXTENSIONS as GLB_EXTENSIONS } from '@gltf-transform/extensions';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC_ROOT = '_source-assets/props/NikolaJankovic';
const OUT_DIR = 'public/assets/props';
const TMP_DIR = 'public/assets/props/.tmp';
const TEX_SIZE = 1024;
const EMISSIVE_SIZE = 512;
const MIN_CLUSTER_TRIS = 8;

// `gap` = how close two connected components must be (in normalized units, the
// pack bbox max dim is exactly 2.0) before they are considered one object.
// Packs 05/06/07 need a wider gap because a sign plate and its pole are
// modelled as separate shells. Changing `gap` RENUMBERS a pack's props, so it
// is recorded in the catalog and the runtime warns if the authored data drifts.
//
// `packScale` converts normalized units to metres. One factor per pack is
// correct: each pack came from a single authored scene, so props within it are
// already mutually consistent. Calibrate with `?props=gallery`.
const PACKS = [
  { id: 'car-microvan', dir: '01- Car', gap: 0.02, packScale: 1.70 },
  { id: 'car-truck', dir: '02- Car', gap: 0.02, packScale: 2.50 },
  { id: 'bikes', dir: '03- Seoul.Props.10', gap: 0.02, packScale: 1.80 },
  { id: 'barriers', dir: '04- Seoul.Props.9', gap: 0.02, packScale: 1.60 },
  { id: 'signage', dir: '05- Seoul.Props.4', gap: 0.08, packScale: 1.40 },
  { id: 'hvac', dir: '06- Seoul.Props.7', gap: 0.08, packScale: 1.30 },
  { id: 'trafficsigns', dir: '07- Seoul.Props.2', gap: 0.08, packScale: 2.40 },
  { id: 'street', dir: '08- Seoul.Props.1', gap: 0.02, packScale: 3.00 },
];

// Packs that arrive as a finished GLB rather than a NikolaJankovic OBJ atlas.
// Nothing to weld or cluster: the mesh is already authored as one object, so
// this path just re-encodes the textures and records a catalog entry with the
// SAME shape the OBJ path emits, so loadProps() cannot tell them apart.
//
// `crates` is a back-of-shop crate-and-box stack — one 1.0 x 2.1 x 4.1 m pile,
// not separable crates, which is why it is a single prop and not a dozen.
const GLB_PACKS = [
  {
    id: 'crates',
    src: '_source-assets/props/crates/Crates and Boxes 1.glb',
    node: 'Mesh_0.005',
    scale: 1,
  },
];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const wanted = args.filter((a) => !a.startsWith('--'));
const packs = wanted.length ? PACKS.filter((p) => wanted.includes(p.id)) : PACKS;

// ---------------------------------------------------------------------------
// OBJ parsing
// ---------------------------------------------------------------------------
function parseOBJ(file) {
  const txt = readFileSync(file, 'utf8');
  const V = []; const VT = []; const VN = []; const F = [];
  for (const raw of txt.split('\n')) {
    if (raw.charCodeAt(0) !== 118 && raw.charCodeAt(0) !== 102) continue; // 'v' | 'f'
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const a = line.split(/\s+/);
      V.push(+a[1], +a[2], +a[3]);
    } else if (line.startsWith('vt ')) {
      const a = line.split(/\s+/);
      VT.push(+a[1], +a[2]);
    } else if (line.startsWith('vn ')) {
      const a = line.split(/\s+/);
      VN.push(+a[1], +a[2], +a[3]);
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1).map((s) => {
        const [v, t, n] = s.split('/');
        return [parseInt(v, 10) - 1, t ? parseInt(t, 10) - 1 : -1, n ? parseInt(n, 10) - 1 : -1];
      });
      // Fan-triangulate anything above a triangle.
      for (let i = 1; i + 1 < parts.length; i++) F.push([parts[0], parts[i], parts[i + 1]]);
    }
  }
  return { V, VT, VN, F };
}

// ---------------------------------------------------------------------------
// Clustering: weld -> connected components -> merge by proximity
// ---------------------------------------------------------------------------
function clusterOBJ({ V, F }, gap) {
  const nV = V.length / 3;

  // 1. Weld on rounded position — these OBJs split every vertex per face.
  const keyed = new Map();
  const weld = new Int32Array(nV);
  for (let i = 0; i < nV; i++) {
    const k = `${Math.round(V[i * 3] * 1e5)},${Math.round(V[i * 3 + 1] * 1e5)},${Math.round(V[i * 3 + 2] * 1e5)}`;
    let r = keyed.get(k);
    if (r === undefined) { r = i; keyed.set(k, i); }
    weld[i] = r;
  }

  // 2. Connected components over welded vertices.
  const par = new Int32Array(nV);
  for (let i = 0; i < nV; i++) par[i] = i;
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (const f of F) { uni(weld[f[0][0]], weld[f[1][0]]); uni(weld[f[0][0]], weld[f[2][0]]); }

  // 3. Island bboxes.
  const islands = new Map(); // root -> { min, max, faces: [] }
  for (const f of F) {
    const root = find(weld[f[0][0]]);
    let isl = islands.get(root);
    if (!isl) { isl = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], faces: [] }; islands.set(root, isl); }
    isl.faces.push(f);
    for (const c of f) {
      const vi = c[0];
      for (let k = 0; k < 3; k++) {
        const v = V[vi * 3 + k];
        if (v < isl.min[k]) isl.min[k] = v;
        if (v > isl.max[k]) isl.max[k] = v;
      }
    }
  }

  // 4. Merge islands whose bboxes are within `gap` on ALL axes, to a fixpoint.
  const list = [...islands.values()];
  const ip = new Int32Array(list.length);
  for (let i = 0; i < list.length; i++) ip[i] = i;
  const ifind = (x) => { while (ip[x] !== x) { ip[x] = ip[ip[x]]; x = ip[x]; } return x; };
  const near = (a, b) => {
    for (let k = 0; k < 3; k++) {
      if (a.min[k] - b.max[k] > gap || b.min[k] - a.max[k] > gap) return false;
    }
    return true;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = ifind(i); const b = ifind(j);
        if (a === b) continue;
        if (!near(list[i], list[j])) continue;
        ip[a] = b;
        // Grow the merged bbox so transitive neighbours find each other.
        const A = list[a]; const B = list[b];
        for (let k = 0; k < 3; k++) {
          B.min[k] = Math.min(B.min[k], A.min[k]);
          B.max[k] = Math.max(B.max[k], A.max[k]);
        }
        changed = true;
      }
    }
  }

  const merged = new Map();
  for (let i = 0; i < list.length; i++) {
    const r = ifind(i);
    let m = merged.get(r);
    if (!m) { m = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], faces: [] }; merged.set(r, m); }
    m.faces.push(...list[i].faces);
    for (let k = 0; k < 3; k++) {
      m.min[k] = Math.min(m.min[k], list[i].min[k]);
      m.max[k] = Math.max(m.max[k], list[i].max[k]);
    }
  }

  const clusters = [...merged.values()].filter((c) => c.faces.length >= MIN_CLUSTER_TRIS);
  const dropped = merged.size - clusters.length;

  // 5. Deterministic order — the runtime data module is keyed by index, so a
  //    rebuild must not renumber props.
  clusters.sort((a, b) =>
    (a.min[0] - b.min[0]) || (a.min[2] - b.min[2]) || (a.min[1] - b.min[1]));

  return { clusters, islands: list.length, dropped };
}

/** Build de-duplicated vertex arrays for one cluster, recentred on its base. */
function buildCluster(cluster, { V, VT, VN }, scale) {
  const map = new Map();
  const pos = []; const uv = []; const nrm = []; const idx = [];
  // Origin at base centre: props are placed by putting their origin on the ground.
  const ox = (cluster.min[0] + cluster.max[0]) / 2;
  const oy = cluster.min[1];
  const oz = (cluster.min[2] + cluster.max[2]) / 2;

  for (const f of cluster.faces) {
    for (const [vi, ti, ni] of f) {
      const key = `${vi}/${ti}/${ni}`;
      let at = map.get(key);
      if (at === undefined) {
        at = pos.length / 3;
        map.set(key, at);
        pos.push((V[vi * 3] - ox) * scale, (V[vi * 3 + 1] - oy) * scale, (V[vi * 3 + 2] - oz) * scale);
        // OBJ UV origin is bottom-left, glTF's is top-left.
        uv.push(ti >= 0 ? VT[ti * 2] : 0, ti >= 0 ? 1 - VT[ti * 2 + 1] : 0);
        nrm.push(ni >= 0 ? VN[ni * 3] : 0, ni >= 0 ? VN[ni * 3 + 1] : 1, ni >= 0 ? VN[ni * 3 + 2] : 0);
      }
      idx.push(at);
    }
  }
  return {
    position: new Float32Array(pos),
    uv: new Float32Array(uv),
    normal: new Float32Array(nrm),
    indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
    sizeNorm: [cluster.max[0] - cluster.min[0], cluster.max[1] - cluster.min[1], cluster.max[2] - cluster.min[2]],
    tris: cluster.faces.length,
  };
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function findTex(dir, suffix) {
  const f = readdirSync(dir).find((n) => new RegExp(`_${suffix}\\.(jpe?g|png)$`, 'i').test(n));
  return f ? path.join(dir, f) : null;
}

async function gray(file, size) {
  if (!file) return null;
  return sharp(file).resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer();
}

/** Pack AO/roughness/metallic into one RGB image — glTF's ORM convention. */
async function buildORM(dir, size) {
  const ao = await gray(findTex(dir, 'AO'), size);
  const rough = await gray(findTex(dir, 'roughness'), size);
  const metal = await gray(findTex(dir, 'metallic'), size);
  if (!rough && !metal && !ao) return null;
  const n = size * size;
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = ao ? ao[i] : 255;
    out[i * 3 + 1] = rough ? rough[i] : 255;
    out[i * 3 + 2] = metal ? metal[i] : 0;
  }
  return sharp(out, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

/** Sketchfab packs often ship an all-black emissive map — not worth the bytes. */
async function emissiveIfLit(dir, size) {
  const file = findTex(dir, 'emissive');
  if (!file) return null;
  const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let max = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  if (max < 12) return { buf: null, max };
  return {
    buf: await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer(),
    max,
  };
}

async function passthrough(file, size) {
  if (!file) return null;
  return sharp(file).resize(size, size, { fit: 'fill' }).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
if (!dry) {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });
}

const io = new NodeIO();
const catalog = { generated: new Date().toISOString(), texSize: TEX_SIZE, packs: [] };
let totalProps = 0;

for (const pack of packs) {
  const dir = path.join(SRC_ROOT, pack.dir);
  const objName = readdirSync(dir).find((f) => f.endsWith('.obj'));
  if (!objName) { console.warn(`! ${pack.id}: no .obj in ${dir}`); continue; }

  const obj = parseOBJ(path.join(dir, objName));
  const { clusters, islands, dropped } = clusterOBJ(obj, pack.gap);
  totalProps += clusters.length;

  const built = clusters.map((c) => buildCluster(c, obj, pack.packScale));
  console.log(
    `${pack.id.padEnd(13)} ${String(obj.F.length).padStart(6)} tris  ` +
    `${String(islands).padStart(4)} islands -> ${String(clusters.length).padStart(3)} props` +
    `${dropped ? ` (${dropped} scraps dropped)` : ''}  gap ${pack.gap}  scale ${pack.packScale}`
  );
  for (const b of built) {
    const m = b.sizeNorm.map((v) => v * pack.packScale);
    console.log(`   ${String(built.indexOf(b)).padStart(2)}  ${m.map((v) => v.toFixed(2).padStart(5)).join(' x ')} m  ${String(b.tris).padStart(5)} tris`);
  }

  const entry = {
    id: pack.id,
    url: `assets/props/${pack.id}.glb`,
    sourceDir: pack.dir,
    gap: pack.gap,
    packScale: pack.packScale,
    props: built.map((b, i) => ({
      index: i,
      node: `${pack.id}_${String(i).padStart(3, '0')}`,
      tris: b.tris,
      sizeNorm: b.sizeNorm.map((v) => +v.toFixed(5)),
      size: b.sizeNorm.map((v) => +(v * pack.packScale).toFixed(4)),
      // OBB volume + footprint — the density fallback for unauthored masses.
      volume: +(b.sizeNorm.reduce((a, v) => a * v * pack.packScale, 1)).toFixed(5),
      footprint: +(b.sizeNorm[0] * b.sizeNorm[2] * pack.packScale ** 2).toFixed(5),
      aspect: aspectOf(b.sizeNorm.map((v) => v * pack.packScale)),
    })),
  };
  catalog.packs.push(entry);

  if (dry) continue;

  // ---- Assemble the GLB -----------------------------------------------------
  const doc = new Document();
  doc.createExtensionChunk?.();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(pack.id);

  const mat = doc.createMaterial(pack.id)
    .setBaseColorFactor([1, 1, 1, 1])
    .setRoughnessFactor(1)
    .setMetallicFactor(1)
    .setDoubleSided(true);

  const albedo = await passthrough(findTex(dir, 'albedo'), TEX_SIZE);
  if (albedo) {
    mat.setBaseColorTexture(doc.createTexture(`${pack.id}_albedo`).setImage(albedo).setMimeType('image/png'));
  }
  const normal = await passthrough(findTex(dir, 'normal'), TEX_SIZE);
  if (normal) {
    mat.setNormalTexture(doc.createTexture(`${pack.id}_normal`).setImage(normal).setMimeType('image/png'));
  }
  const orm = await buildORM(dir, TEX_SIZE);
  if (orm) {
    // One image serving both slots: glTF reads G/B for metallicRoughness and R
    // for occlusion, which is exactly how we packed it.
    const t = doc.createTexture(`${pack.id}_orm`).setImage(orm).setMimeType('image/png');
    mat.setMetallicRoughnessTexture(t).setOcclusionTexture(t);
  }
  const emi = await emissiveIfLit(dir, EMISSIVE_SIZE);
  if (emi?.buf) {
    mat.setEmissiveTexture(doc.createTexture(`${pack.id}_emissive`).setImage(emi.buf).setMimeType('image/png'));
    mat.setEmissiveFactor([1, 1, 1]);
  } else if (emi) {
    console.log(`   (emissive map is black, max ${emi.max} — dropped)`);
  }

  built.forEach((b, i) => {
    const name = `${pack.id}_${String(i).padStart(3, '0')}`;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(b.position).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(b.uv).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(b.normal).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(b.indices).setBuffer(buffer))
      .setMaterial(mat);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  });

  const raw = path.join(TMP_DIR, `${pack.id}.raw.glb`);
  const webp = path.join(TMP_DIR, `${pack.id}.webp.glb`);
  const out = path.join(OUT_DIR, `${pack.id}.glb`);
  await io.write(raw, doc);
  // Separate processes: optimize.mjs's sharp and meshopt.mjs's gltf-transform
  // /functions each bring their own libvips and break each other in-process.
  execSync(`node tools/optimize.mjs "${raw}" "${webp}" ${TEX_SIZE}`, { stdio: 'pipe' });
  execSync(`node tools/meshopt.mjs "${webp}" "${out}"`, { stdio: 'pipe' });
  console.log(`   -> ${out} ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}

// ---- GLB-source packs ------------------------------------------------------
for (const pack of GLB_PACKS) {
  if (wanted.length && !wanted.includes(pack.id)) continue;
  if (!existsSync(pack.src)) { console.warn(`! ${pack.id}: missing ${pack.src}`); continue; }

  const src = await new NodeIO().registerExtensions(GLB_EXTENSIONS).read(pack.src);
  const root = src.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];

  let tris = 0;
  let node = null;
  scene.traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh || (pack.node && n.getName() !== pack.node)) return;
    node = n;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  });
  if (!node) { console.warn(`! ${pack.id}: node ${pack.node} not found in ${pack.src}`); continue; }

  // World-space bbox from the accessor extremes, transformed through the node.
  // glTF matrices are column-major; walk all 8 corners so a rotated node still
  // measures correctly.
  const world = node.getWorldMatrix();
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const pmin = pos.getMin([]);
    const pmax = pos.getMax([]);
    for (let corner = 0; corner < 8; corner++) {
      const x = corner & 1 ? pmax[0] : pmin[0];
      const y = corner & 2 ? pmax[1] : pmin[1];
      const z = corner & 4 ? pmax[2] : pmin[2];
      const wx = world[0] * x + world[4] * y + world[8] * z + world[12];
      const wy = world[1] * x + world[5] * y + world[9] * z + world[13];
      const wz = world[2] * x + world[6] * y + world[10] * z + world[14];
      const p = [wx, wy, wz];
      for (let k = 0; k < 3; k++) {
        if (p[k] < lo[k]) lo[k] = p[k];
        if (p[k] > hi[k]) hi[k] = p[k];
      }
    }
  }
  const size = hi.map((v, i) => (v - lo[i]) * pack.scale);
  // Rename so the runtime looks it up the same way as a clustered pack.
  node.setName(`${pack.id}_000`);
  totalProps += 1;

  console.log(`${pack.id.padEnd(13)} ${String(tris).padStart(6)} tris  GLB source -> 1 prop  scale ${pack.scale}`);
  console.log(`    0  ${size.map((v) => v.toFixed(2).padStart(5)).join(' x ')} m  ${String(tris).padStart(5)} tris`);

  catalog.packs.push({
    id: pack.id,
    url: `assets/props/${pack.id}.glb`,
    sourceDir: path.dirname(pack.src),
    gap: 0,
    packScale: pack.scale,
    props: [{
      index: 0,
      node: `${pack.id}_000`,
      tris,
      sizeNorm: size.map((v) => +(v / pack.scale).toFixed(5)),
      size: size.map((v) => +v.toFixed(4)),
      volume: +(size[0] * size[1] * size[2]).toFixed(5),
      footprint: +(size[0] * size[2]).toFixed(5),
      aspect: aspectOf(size),
    }],
  });

  if (dry) continue;
  mkdirSync(TMP_DIR, { recursive: true });
  const raw = path.join(TMP_DIR, `${pack.id}.raw.glb`);
  const webp = path.join(TMP_DIR, `${pack.id}.webp.glb`);
  const out = path.join(OUT_DIR, `${pack.id}.glb`);
  await new NodeIO().registerExtensions(GLB_EXTENSIONS).write(raw, src);
  execSync(`node tools/optimize.mjs "${raw}" "${webp}" ${TEX_SIZE}`, { stdio: 'pipe' });
  execSync(`node tools/meshopt.mjs "${webp}" "${out}"`, { stdio: 'pipe' });
  console.log(`   -> ${out} ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}

function aspectOf([x, y, z]) {
  const foot = Math.max(x, z);
  if (y > foot * 2.2) return 'upright';
  if (y < foot * 0.4) return 'flat';
  if (Math.min(x, z) < Math.max(x, z) * 0.25) return 'wall';
  return 'wide';
}

if (!dry) {
  writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  const bytes = catalog.packs.reduce((n, p) => n + statSync(path.join(OUT_DIR, `${p.id}.glb`)).size, 0);
  console.log(`\n${totalProps} props across ${catalog.packs.length} packs — ${(bytes / 1e6).toFixed(2)} MB total`);
  console.log(`catalog: ${path.join(OUT_DIR, 'catalog.json')}`);
} else {
  console.log(`\n${totalProps} props across ${packs.length} packs (dry run — nothing written)`);
}
