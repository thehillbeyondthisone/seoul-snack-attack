// Per-district variation for the repeated Seoul block.
//
// The city is ONE authored block (public/assets/world/seoul-block.glb) placed
// ten times. Without this module every district is visibly the same corner, and
// that is exactly why this block was retired the first time round. Here we make
// each copy read as a different street.
//
// THE CONSTRAINT THAT SHAPES EVERYTHING BELOW: there is exactly one collision
// BVH, built in tile-local space before any district is cloned
// (src/world/city.js), and src/world/tiling.js routes rays into it per tile.
// So a variation may not change what the player can touch. That rules out
// hiding geometry (an invisible collider stays behind), moving it, or mirroring
// a tile root (the raycast transform would not follow). What is left, and what
// this module uses:
//
//   1. Material colour. No geometry change at all — completely safe, and the
//      biggest single win, because Seoul low-rise varies enormously in wall
//      colour along one street.
//   2. Emissive tint on the signage. Safe for the same reason, and the game is
//      mostly played at night, where the signs are what you actually see.
//   3. A uniform vertical scale on the building nodes. Footprints are untouched
//      and the change is entirely above head height, so the collider stays
//      inside the visible massing and the van can never reach the difference.
//
// Materials are shared by reference across clones (Object3D.clone() does not
// deep-copy them), so a tinted district needs its own copies — hence the
// per-tile material cache. Ten districts cost roughly 150 extra materials.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

/** Nodes that are foliage rather than architecture — tinted on a separate ramp. */
const FOLIAGE_RE = /leaves|leaf|grass|tree|plant/i;

/** Ground surfaces must keep their colour: the road has to read as asphalt. */
const GROUND_RE = /road|pavement|tiles|asphalt|manhole/i;

/** A mesh this tall (scaled metres) counts as architecture. */
const BUILDING_MIN_HEIGHT = 2.5;

/**
 * Wall washes seen along a Seoul back street: painted plaster, bare concrete,
 * tile cladding, faded brick. Deliberately desaturated — these multiply an
 * already-textured facade, and anything punchier reads as coloured lighting
 * rather than as paint.
 */
const FACADE_TINTS = [
  0xffffff, // untouched — some districts should look like the source block
  0xf6ece0, // warm plaster
  0xe4ecf2, // cool grey concrete
  0xf2e2d6, // faded terracotta wash
  0xe6efe8, // pale jade tile
  0xefe6ee, // old mauve paint
  0xf3efdc, // nicotine cream
  0xdfe6ec, // rain-stained grey
];

/** Sign glow, warm to cool. Applied as a gentle bias, not a recolour. */
const SIGN_TINTS = [0xffffff, 0xffe9d0, 0xd8ecff, 0xffd9e6, 0xdcffe8];

/**
 * Measure the block once, before it is cloned.
 *
 * @param {{obj: THREE.Object3D, box: THREE.Box3, fog: boolean, clipped: boolean}[]} meshes
 *        the inventory city.js already builds in its first pass — world boxes
 *        taken while the block sits at the origin, so they are block space at
 *        CITY_SCALE.
 * @param {number} scale CITY_SCALE, for converting those boxes back into the
 *        node-local units that position/scale are expressed in.
 * @param {THREE.Object3D} block the loaded scene root, so height variation can
 *        be restricted to its direct children — `position` is relative to the
 *        parent, and the base-keeping maths below only holds when that parent
 *        is the block itself.
 */
export function analyzeBlock(meshes, scale, block) {
  const facadeMaterials = new Set();
  const foliageMaterials = new Set();
  const signMaterials = new Set();
  /** @type {Map<string, {baseY: number, centerY: number}>} keyed by node name */
  const buildings = new Map();

  for (const { obj, box, fog, clipped } of meshes) {
    if (fog || clipped || !obj.isMesh) continue;
    const height = box.max.y - box.min.y;
    const foliage = FOLIAGE_RE.test(obj.name);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    for (const m of mats) {
      if (!m) continue;
      const emissiveSum = m.emissive ? m.emissive.r + m.emissive.g + m.emissive.b : 0;
      if (m.emissiveMap || emissiveSum > 0.01) { signMaterials.add(m); continue; }
      if (GROUND_RE.test(m.name || '')) continue;
      if (foliage) { foliageMaterials.add(m); continue; }
      if (height >= BUILDING_MIN_HEIGHT) facadeMaterials.add(m);
    }

    // Building nodes, with the numbers needed to grow them from the pavement
    // rather than from their own centre — these nodes are authored with their
    // origin at the middle of the massing, so a bare scale.y sinks them.
    if (!foliage && height >= BUILDING_MIN_HEIGHT && obj.name && obj.parent === block) {
      buildings.set(obj.name, { baseY: box.min.y / scale, centerY: obj.position.y });
    }
  }

  return { facadeMaterials, foliageMaterials, signMaterials, buildings };
}

/**
 * Apply district `index`'s variation to a cloned block, in place.
 *
 * @param {THREE.Object3D} clone   the per-tile clone (shares geometry, and
 *                                 initially materials, with the source block)
 * @param {number} index           district index, the variation seed
 * @param {ReturnType<analyzeBlock>} analysis
 * @param {{heroes?: Set<number>}} [opts] districts that keep the source look,
 *                                 so the map has fixed landmarks to navigate by
 * @returns {{materials: THREE.Material[], tint: number, heightScale: number}}
 */
export function applyBlockVariant(clone, index, analysis, { heroes } = {}) {
  const created = [];
  // Mixed into the seed so districts do not walk the palette in order — index 0
  // and index 1 should not be neighbouring shades.
  const rng = mulberry32((0x5e0d1a7 ^ (index * 0x9e3779b1)) >>> 0);

  if (heroes?.has(index)) {
    return { materials: created, tint: 0xffffff, heightScale: 1 };
  }

  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const facadeTint = pick(FACADE_TINTS);
  const signTint = pick(SIGN_TINTS);
  // Foliage gets its own small ramp: the same street tree in ten districts is
  // as obvious a repeat as the same wall.
  const foliageTint = new THREE.Color().setHSL(
    0.22 + (rng() - 0.5) * 0.06, 0.35 + rng() * 0.25, 0.42 + rng() * 0.12
  );
  const heightScale = 0.94 + rng() * 0.26; // 0.94 - 1.20

  // One cloned material per source material per district, so two meshes sharing
  // a wall material still share it after tinting.
  const cache = new Map();
  const variantOf = (m) => {
    let copy = cache.get(m);
    if (copy) return copy;
    copy = m.clone();
    if (analysis.facadeMaterials.has(m)) {
      copy.color.multiply(new THREE.Color(facadeTint));
    } else if (analysis.foliageMaterials.has(m)) {
      copy.color.lerp(foliageTint, 0.45);
    } else if (analysis.signMaterials.has(m)) {
      // Bias the glow rather than replace it: the sign artwork carries the hue,
      // and overriding it flattens every shopfront to one colour.
      if (copy.emissive) copy.emissive.lerp(new THREE.Color(signTint), 0.35);
    }
    copy.name = `${m.name || 'mat'}_d${index}`;
    cache.set(m, copy);
    created.push(copy);
    return copy;
  };

  clone.traverse((obj) => {
    if (!obj.isMesh) return;

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => (m && shouldVary(m, analysis) ? variantOf(m) : m));
    } else if (obj.material && shouldVary(obj.material, analysis)) {
      obj.material = variantOf(obj.material);
    }

    const building = analysis.buildings.get(obj.name);
    if (building) {
      // Keep the base planted: new centre = base + originalHalfHeight * scale.
      const halfHeight = building.centerY - building.baseY;
      obj.scale.y *= heightScale;
      obj.position.y = building.baseY + halfHeight * heightScale;
    }
  });

  return { materials: created, tint: facadeTint, heightScale };
}

function shouldVary(material, analysis) {
  return analysis.facadeMaterials.has(material)
    || analysis.foliageMaterials.has(material)
    || analysis.signMaterials.has(material);
}
