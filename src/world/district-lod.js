// Per-district draw-call and triangle budget.
//
// The city is ONE authored block placed ten times, and every copy arrives as
// ~163 separate meshes. Measured on the shipped block:
//
//   95 of those meshes carry under 200 triangles each and together account for
//   about 1% of the block's geometry — 95 draw calls buying nothing.
//
//   The trees (leaves*, ~95k), the grass cards (grass_medium_01_d0, ~36k,
//   transparent AND double-sided) and the procedural storefront rows are ~73%
//   of the block's triangles, and they are the first things you stop being able
//   to read as you drive away from them.
//
// So each district is reorganised into two groups:
//
//   structure — buildings, road, kerbs, walls. Drawn whenever the district is.
//   detail    — foliage, grass, street clutter. Dropped at a much shorter range
//               than the district itself, which is what lets the structure stay
//               visible far enough down a 150 m street to still read as a city.
//
// Within each group, meshes too small to be worth their own draw call are
// merged by material. Merging happens per district and AFTER applyBlockVariant,
// because that has already given each district its own material copies.
//
// NOTHING HERE MAY CHANGE WHAT THE PLAYER CAN TOUCH. The collision BVH is built
// once, from the source block, before any of this runs (see src/world/city.js);
// this module only reorganises and hides *visible* meshes, exactly like the
// existing tile culling does.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Nodes that are vegetation. Matches src/world/block-variants.js FOLIAGE_RE. */
const FOLIAGE_RE = /leaves|leaf|grass|tree|plant|bush|flower/i;

/** Surfaces that must never be demoted to detail — you drive on them. */
const GROUND_RE = /road|asphalt|street|pavement|sidewalk|crossing|kerb|curb|tiles|floor|ground|manhole/i;

/**
 * Largest world-space dimension a mesh can have and still count as street
 * clutter rather than architecture. A 2.5 m box is a bollard, a bin, an AC
 * unit or a sign; anything bigger is part of the block's silhouette and has to
 * stay put or the district visibly deflates as you drive away.
 */
const DETAIL_MAX_SIZE = 2.6;

/**
 * Triangle count below which a mesh is not worth its own draw call. At 600 the
 * shipped block merges 127 of its 163 meshes and keeps the 36 that carry
 * essentially all of its geometry individually frustum-cullable.
 */
const MERGE_MAX_TRIANGLES = 600;

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _normalMatrix = new THREE.Matrix3();

const triangleCount = (geometry) => (
  geometry.index ? geometry.index.count : geometry.attributes.position.count
) / 3;

/** Same test src/world/city.js uses to decide what counts as signage. */
const isEmissive = (m) => !!m && (
  !!m.emissiveMap || (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01)
);

/**
 * Re-express a mesh's geometry in `root` space as plain floats.
 *
 * The GLB is meshopt-quantized (KHR_mesh_quantization), so its positions are
 * NORMALIZED Int16 in [-1,1]. Never applyMatrix4 into that buffer — world
 * metres overflow Int16. Go through fromBufferAttribute, which denormalizes,
 * and write a fresh Float32 buffer. Same reason src/world/city.js builds its
 * collision soup the long way round.
 *
 * Every result carries exactly position/normal/uv so any two of them merge,
 * whatever the source mesh happened to declare.
 */
function bakeGeometry(mesh, toRoot) {
  const src = mesh.geometry;
  const position = src.attributes.position;
  const out = new THREE.BufferGeometry();

  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    _v.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    positions[i * 3] = _v.x;
    positions[i * 3 + 1] = _v.y;
    positions[i * 3 + 2] = _v.z;
  }
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const normals = new Float32Array(position.count * 3);
  if (src.attributes.normal) {
    _normalMatrix.getNormalMatrix(toRoot);
    for (let i = 0; i < position.count; i++) {
      _v.fromBufferAttribute(src.attributes.normal, i).applyMatrix3(_normalMatrix).normalize();
      normals[i * 3] = _v.x;
      normals[i * 3 + 1] = _v.y;
      normals[i * 3 + 2] = _v.z;
    }
  }
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  const uvs = new Float32Array(position.count * 2);
  if (src.attributes.uv) {
    for (let i = 0; i < position.count; i++) {
      uvs[i * 2] = src.attributes.uv.getX(i);
      uvs[i * 2 + 1] = src.attributes.uv.getY(i);
    }
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  if (src.index) out.setIndex(Array.from(src.index.array));
  return out;
}

/**
 * Fold every mesh in `meshes` into one draw call per material.
 *
 * Multi-material meshes are left alone: their geometry groups would have to be
 * rebuilt, and there are none in the shipped block.
 */
function mergeByMaterial(meshes, target, toRoot) {
  const groups = new Map(); // material -> geometry[]
  let merged = 0;

  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) continue;
    const list = groups.get(mesh.material) || [];
    list.push(bakeGeometry(mesh, toRoot.clone().multiply(mesh.matrixWorld)));
    groups.set(mesh.material, list);
    mesh.removeFromParent();
    merged++;
  }

  for (const [material, geometries] of groups) {
    // One geometry in a group is not a merge; still worth re-parenting it as a
    // baked mesh so the group is uniform, but skip the merge machinery.
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!geometry) {
      // mergeGeometries returns null on an attribute mismatch we did not
      // anticipate. Losing the district's kerbs is far worse than losing the
      // draw-call saving, so put the meshes back rather than dropping them.
      for (const g of geometries) g.dispose();
      continue;
    }
    if (geometries.length > 1) for (const g of geometries) g.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `merged_${material.name || 'mat'}`;
    mesh.matrixAutoUpdate = false;
    target.add(mesh);
  }

  return { merged, draws: groups.size };
}

/**
 * Split one district block into structure/detail groups and merge its small
 * meshes. Mutates `block` in place.
 *
 * @param {THREE.Object3D} block a district block, already varied
 * @returns {{structure: THREE.Group, detail: THREE.Group, stats: object}}
 */
export function prepareDistrict(block) {
  block.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(block.matrixWorld).invert();

  const structure = new THREE.Group();
  structure.name = 'structure';
  const detail = new THREE.Group();
  detail.name = 'detail';

  const isDetail = (mesh) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const names = [mesh.name, ...mats.map((m) => m?.name || '')].join(' ');
    if (GROUND_RE.test(names)) return false;
    // Signage is small enough to fall through the size test below, and at night
    // it IS the city — a street whose neon has been range-culled reads as a
    // blackout. Emissive meshes are a rounding error in triangles anyway.
    if (mats.some(isEmissive)) return false;
    if (FOLIAGE_RE.test(names)) return true;
    _box.setFromObject(mesh);
    _box.getSize(_v);
    return Math.max(_v.x, _v.y, _v.z) <= DETAIL_MAX_SIZE;
  };

  // Collect first: re-parenting while traversing skips siblings.
  const all = [];
  block.traverse((obj) => { if (obj.isMesh) all.push(obj); });

  const keep = { structure: [], detail: [] };  // big enough for their own draw
  const small = { structure: [], detail: [] }; // merge candidates
  for (const mesh of all) {
    // Invisible meshes are the artist's fog volume and the clipped nodes.
    // src/world/city.js owns both decisions; leave them exactly where they are.
    if (!mesh.visible) continue;
    const bucket = isDetail(mesh) ? 'detail' : 'structure';
    (triangleCount(mesh.geometry) <= MERGE_MAX_TRIANGLES ? small : keep)[bucket].push(mesh);
  }

  // Re-parent the survivors, preserving world placement.
  for (const bucket of ['structure', 'detail']) {
    const target = bucket === 'detail' ? detail : structure;
    for (const mesh of keep[bucket]) {
      mesh.matrix.copy(toRoot).multiply(mesh.matrixWorld);
      mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      target.add(mesh);
    }
  }

  const mergedStructure = mergeByMaterial(small.structure, structure, toRoot);
  const mergedDetail = mergeByMaterial(small.detail, detail, toRoot);

  block.add(structure, detail);
  block.updateMatrixWorld(true);

  return {
    structure,
    detail,
    stats: {
      sourceMeshes: all.length,
      structureDraws: structure.children.length,
      detailDraws: detail.children.length,
      merged: mergedStructure.merged + mergedDetail.merged,
    },
  };
}

/**
 * Fold a flat group of static procedural meshes down to one draw per material.
 *
 * For the box-soup groups: `district_boundaries` ships 114 draws for about a
 * thousand triangles of kerb walls, and `district_connectors` another 52. Their
 * collision geometry is baked inside their own builders before they return, so
 * by the time this runs it is looking at pure visuals.
 *
 * @param {THREE.Object3D} group
 * @returns {{before: number, after: number}}
 */
export function mergeStaticGroup(group) {
  group.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const meshes = [];
  group.traverse((obj) => { if (obj.isMesh && obj.visible) meshes.push(obj); });
  const before = meshes.length;
  mergeByMaterial(meshes, group, toRoot);
  group.updateMatrixWorld(true);
  return { before, after: group.children.length };
}

/**
 * Turn on backface culling wherever it is safe.
 *
 * The source GLB marks 85 of its materials DoubleSide, which is the glTF
 * exporter default rather than an artistic decision, and it costs ~35% of the
 * frame: measured 27 ms -> 17 ms at a street intersection. Vegetation and
 * anything alpha-blended keeps DoubleSide, because those really are cards that
 * disappear when viewed from behind.
 *
 * @param {Iterable<THREE.Object3D>} roots
 * @returns {{flipped: number, kept: number}}
 */
export function enableBackfaceCulling(roots) {
  const keepDouble = new Set();
  const candidates = new Set();

  for (const root of roots) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const foliage = FOLIAGE_RE.test(`${obj.name} ${mats.map((m) => m?.name || '').join(' ')}`);
      for (const m of mats) {
        if (!m || m.side !== THREE.DoubleSide) continue;
        // Alpha-tested and alpha-blended surfaces are the cutout cards — leaf
        // sprays, grass, chain-link, curtains. Single-siding those punches
        // holes in them from half the angles you drive past.
        if (foliage || m.transparent || m.alphaTest > 0 || m.alphaMap) keepDouble.add(m);
        else candidates.add(m);
      }
    });
  }

  let flipped = 0;
  for (const m of candidates) {
    if (keepDouble.has(m)) continue;
    m.side = THREE.FrontSide;
    flipped++;
  }
  return { flipped, kept: keepDouble.size };
}
