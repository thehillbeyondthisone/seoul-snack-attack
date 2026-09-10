// Visual + collision mesh for the procedural city.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng.js';
import { SURFACES, pick } from '../data/color-bible.js';
import { SIDEWALK, KERB_H, ROAD_Y, CANAL_Y, WATER_Z0, WATER_Z1, PROC_SEED } from './layout.js';
import { createCityDetailTextures, mixAsphaltMaps, clearTextureSampleCache } from './textures.js';
import { createGroundDecals } from './decals.js';

const UP = new THREE.Vector3(0, 1, 0);
const _along = new THREE.Vector3();
const _into = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function quatAlongInto(along, into) {
  _along.copy(along).setY(0);
  if (_along.lengthSq() < 1e-8) _along.set(1, 0, 0);
  _along.normalize();
  _into.copy(into).setY(0);
  if (_into.lengthSq() < 1e-8) _into.set(-_along.z, 0, _along.x);
  _into.normalize();
  const crossY = _along.z * _into.x - _along.x * _into.z;
  if (crossY < 0) _along.negate();
  const zAxis = new THREE.Vector3().crossVectors(_along, UP).normalize();
  if (zAxis.dot(_into) < 0) zAxis.negate();
  _m.makeBasis(_along, UP, zAxis);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}

function appendBox(list, { w, h, d, x, y, z, yaw = 0, quat = null, uvTile = 0 }) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h * 0.5, 0);
  if (uvTile > 0) scaleBoxUV(g, { w, h, d }, uvTile);
  const q = quat || new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  g.applyMatrix4(_m.compose(_p.set(x, y, z), q, _s.set(1, 1, 1)));
  list.push(g);
}

/**
 * BoxGeometry UVs are 0..1 per face, which would stretch one texture tile
 * across a whole road slab. Rescale them so `uvTile` metres of world space
 * equals one tile, keeping detail-grain scale consistent per material family.
 * Face order is +x -x +y -y +z -z with four verts each.
 */
function scaleBoxUV(geo, { w, h, d }, uvTile) {
  const uv = geo.attributes.uv;
  const spans = [
    [d, h], [d, h], // ±x
    [w, d], [w, d], // ±y
    [w, h], [w, h], // ±z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = spans[f];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * su / uvTile, uv.getY(i) * sv / uvTile);
    }
  }
}

/**
 * Bake contact occlusion into a vertex-colour attribute: vertices at or below
 * `groundY` darken by up to `strength`, easing back to unlit over `fade`
 * metres/units of height with a quadratic falloff. Runs once at generation,
 * costs nothing per frame — the shader already multiplies vertex colour.
 */
function applyContactAO(geo, { groundY = ROAD_Y, fade = 0.5, strength = 0.55 } = {}) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - groundY) / fade));
    const shade = 1 - strength * (1 - t) * (1 - t);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function inward(a, b, center) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len;
  let nz = dx / len;
  const mx = (a.x + b.x) * 0.5;
  const mz = (a.z + b.z) * 0.5;
  if ((center.x - mx) * nx + (center.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
  return { x: nx, z: nz };
}

function insetQuad(corners, insets, center) {
  const n = corners.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = corners[(i + n - 1) % n];
    const curr = corners[i];
    const next = corners[(i + 1) % n];
    const nPrev = inward(prev, curr, center);
    const nNext = inward(curr, next, center);
    const iPrev = insets[(i + n - 1) % n];
    const iNext = insets[i];
    out.push({
      x: curr.x + nPrev.x * iPrev + nNext.x * iNext,
      z: curr.z + nPrev.z * iPrev + nNext.z * iNext,
    });
  }
  return out;
}

function mat(hex, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: extra.roughness ?? 0.86,
    metalness: extra.metalness ?? 0.04,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 0,
    map: extra.map || null,
    normalMap: extra.normalMap || null,
    roughnessMap: extra.roughnessMap || null,
    emissiveMap: extra.emissiveMap || null,
    envMapIntensity: extra.envMapIntensity ?? 1,
    vertexColors: extra.vertexColors ?? false,
    fog: true,
    name: extra.name || 'proc',
  });
}

function makeInstanced(name, geometry, material, records, tinted = false, scaleAttr = null, variantAttr = null) {
  if (!records.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  if (tinted) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(records.length * 3), 3);
  }
  if (scaleAttr) {
    // Re-attach each call so a re-issued buildCityMesh() always lands the
    // new per-instance scale; the shared geometry might still hold a stale
    // attribute from the previous build.
    mesh.geometry.deleteAttribute?.('aUvScale');
    mesh.geometry.setAttribute('aUvScale', new THREE.InstancedBufferAttribute(scaleAttr, 1));
  }
  if (variantAttr) {
    // Same story as aUvScale — always re-attach so a re-issued build lands
    // the new per-instance variant routing. The fragment stage reads this
    // as a float in [0, 3] and casts to int to index a sampler2D array.
    mesh.geometry.deleteAttribute?.('aVariant');
    mesh.geometry.setAttribute('aVariant', new THREE.InstancedBufferAttribute(variantAttr, 1));
  }
  records.forEach((r, i) => {
    mesh.setMatrixAt(i, _m.compose(
      _p.set(r.x, r.y, r.z),
      r.quat,
      _s.set(r.sx, r.sy, r.sz),
    ));
    if (tinted) mesh.setColorAt(i, _c.setHex(r.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (tinted) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * Per-instance UV scale + variant routing. `aUvScale` and `aVariant` are
 * `InstancedBufferAttribute(float, 1)` on the geometry; Three's instance
 * system already routes them as `attribute float` in the vertex shader, we
 * just have to declare them ourselves because the stock instancing chunk
 * only knows about the matrix + color.
 *
 * `aUvScale` scales every map UV at the vertex stage so the multiply
 * interpolates the same as any other UV. `aVariant` is passed through as
 * `vVariant` and consumed at the fragment stage to index
 * `uFacadeNormal[4]` / `uFacadeRough[4]`. A `sampler2D` array is the WebGL
 * idiom for variant routing; the alternative (four if/else branches) costs
 * the same on modern drivers and is more code.
 *
 * Each map UV multiply is guarded by its own `#ifdef` so we never touch
 * varyings the program did not declare. The roof path uses only `aUvScale`
 * (single family), the facade path uses both.
 *
 * v2 of this hook supports the four-variant facade pool; bump the cache
 * key if the fragment-stage shape ever changes again.
 */
function installUvScaleChunk(material, { withVariant = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          '#ifdef USE_INSTANCING',
          'attribute float aUvScale;',
          withVariant ? 'attribute float aVariant;' : '',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <uv_vertex>',
        [
          '#include <uv_vertex>',
          '#ifdef USE_INSTANCING',
          '#ifdef USE_MAP',
          '  vMapUv *= aUvScale;',
          '#endif',
          '#ifdef USE_NORMALMAP',
          '  vNormalMapUv *= aUvScale;',
          '#endif',
          '#ifdef USE_ROUGHNESSMAP',
          '  vRoughnessMapUv *= aUvScale;',
          '#endif',
          withVariant ? 'vVariant = aVariant;' : '',
          '#endif',
        ].join('\n'),
      );
    if (withVariant) {
      // Declare the varying + sampler arrays once in the fragment stage.
      // The samplers are populated by the per-material uniform map below.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            '#ifdef USE_INSTANCING',
            'varying float vVariant;',
            'uniform sampler2D uFacadeNormal[4];',
            'uniform sampler2D uFacadeRough[4];',
            '#endif',
          ].join('\n'),
        )
        // Override the per-fragment normal-map sample to read from the
        // variant-indexed array. The default chunk reads
        // `texture2D(normalMap, vNormalMapUv)`.
        .replace(
          'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
          'vec3 mapN;\n#ifdef USE_INSTANCING\n  mapN = texture2D( uFacadeNormal[int(vVariant + 0.5)], vNormalMapUv ).xyz * 2.0 - 1.0;\n#else\n  mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n#endif',
        )
        // Same for the roughness-map sample. The default chunk reads
        // `texture2D(roughnessMap, vRoughnessMapUv).g`.
        .replace(
          'float roughnessFactor = texture2D( roughnessMap, vRoughnessMapUv ).g;',
          'float roughnessFactor;\n#ifdef USE_INSTANCING\n  roughnessFactor = texture2D( uFacadeRough[int(vVariant + 0.5)], vRoughnessMapUv ).g;\n#else\n  roughnessFactor = texture2D( roughnessMap, vRoughnessMapUv ).g;\n#endif',
        );
    }
  };
  // Different materials (facade / roof) share this hook, so key by a unique
  // tag to keep their programs from colliding in the WebGL cache.
  material.customProgramCacheKey = () => withVariant ? 'uvScale_v2_variant' : 'uvScale_v2_roof';
}

export function buildCityMesh(layout, textures, seed = PROC_SEED, { detailIntensity = 1, decals = true } = {}) {
  const rng = mulberry32(seed ^ 0x51ed);
  const group = new THREE.Group();
  group.name = 'proc_city';

  const collision = [];
  const roadMats = [];
  const emissiveMats = [];
  const buildings = [];

  // Shared generated-detail pool (see textures.js). Roughness scalars are set
  // a touch above the old flat values because the maps average below 1.0 and
  // multiply the scalar in the shader.
  const detail = createCityDetailTextures(detailIntensity);

  const roadMat = mat(SURFACES.asphalt, {
    name: 'proc_road', roughness: 0.52, metalness: 0.08, envMapIntensity: 1.15,
    normalMap: detail?.asphaltNormal, roughnessMap: detail?.asphaltRough,
  });
  if (detail) roadMat.normalScale.set(0.9, 0.9);

  // Asphalt blend handle. Procedural pair is fixed; downloaded pair arrives
  // async after the build returns (texture-pack.js), and `apply()` re-bakes
  // a single owned pair whenever the debug menu moves its blend slider. The
  // material only ever sees ONE pair — never two samplers, never a shader
  // uniform — so the road material is unchanged for the shader; only its
  // `normalMap` / `roughnessMap` slots get reassigned.
  //
  // The handle is the integration point with the debug menu; see
  // city.js where it is attached to the returned city object.
  const asphaltBlendHandle = detail ? {
    material: roadMat,
    proc: { normal: detail.asphaltNormal, rough: detail.asphaltRough },
    downloaded: null, // filled in by city.js after loadAsphaltTexturePack resolves
    source: 'proc',   // 'proc' | 'downloaded'
    blend: 0,         // 0..1
    available: false, // true once the downloaded pair lands
    baseNormalScale: roadMat.normalScale.x,
    _active: { normal: detail.asphaltNormal, rough: detail.asphaltRough },
    apply() {
      if (this.source === 'downloaded' && this.downloaded) {
        roadMat.normalMap = this.downloaded.normal;
        roadMat.roughnessMap = this.downloaded.rough;
        roadMat.normalScale.set(this.baseNormalScale, this.baseNormalScale);
      } else {
        const t = Math.max(0, Math.min(1, this.blend));
        const { normal, rough } = mixAsphaltMaps(this.proc, this.downloaded, t);
        roadMat.normalMap = normal;
        roadMat.roughnessMap = rough;
        // Both pools average to similar bump heights; halve the scale at full
        // blend so the downloaded pool does not double up on micro-grain.
        const s = this.baseNormalScale * (1 - 0.4 * t);
        roadMat.normalScale.set(s, s);
      }
      roadMat.needsUpdate = true;
    },
    /** Called by city.js once the downloaded pack resolves. */
    setDownloaded(pack) {
      if (!pack) { this.available = false; this.downloaded = null; return; }
      this.downloaded = { normal: pack.normal, rough: pack.rough };
      this.available = true;
      clearTextureSampleCache();
      this.apply();
    },
  } : null;
  const walkMat = mat(SURFACES.sidewalk, {
    name: 'proc_sidewalk', roughness: 0.95,
    normalMap: detail?.pavingNormal, roughnessMap: detail?.pavingRough,
  });
  if (detail) walkMat.normalScale.set(0.8, 0.8);
  const plazaMat = mat(SURFACES.plaza, {
    name: 'proc_plaza', roughness: 0.85,
    normalMap: detail?.pavingNormal, roughnessMap: detail?.pavingRough,
  });
  if (detail) plazaMat.normalScale.set(0.7, 0.7);
  const wallMat = mat(SURFACES.canalWall, { name: 'proc_wall', roughness: 0.7 });
  const kerbMat = mat(SURFACES.kerb, { name: 'proc_kerb', roughness: 0.62, vertexColors: true });
  const canalMat = mat(SURFACES.canal, {
    name: 'proc_canal', roughness: 0.12, metalness: 0.35, envMapIntensity: 1.4,
    emissive: SURFACES.canal, emissiveIntensity: 0.18,
  });
  const roofMat = mat(SURFACES.roof, { name: 'proc_roof', roughness: 0.9 });
  // Roofs are flat, far, and a different material family from the facades —
  // a tighter range keeps neighbouring roofs from ringing the eye.
  const ROOF_UV_SCALES = [0.9, 1.4, 2.0];
  const FACADE_UV_SCALES = [0.6, 1.0, 1.5, 2.2];
  // Facade variant routing. The four variant ids match keys in
  // `detail.facades`; the int is what the per-instance `aVariant` attribute
  // stores. `mix` is a per-district flag (not a variant id) — buildings in a
  // mix district pick one of the four at generation time, see the building
  // loop below. Keep this in lockstep with the per-fragment sampler indexing
  // in installUvScaleChunk.
  const VARIANT_INDEX = { stucco: 0, weathered: 1, tiled: 2, painted: 3 };
  const MIX_VARIANTS = ['stucco', 'weathered', 'tiled', 'painted'];
  // Plain arrays — converted to Float32Array when the instanced meshes are
  // built, by which point the per-building loop has populated them.
  const bodyScale = [];
  const bodyVariant = [];
  const roofScale = [];
  const markMat = new THREE.MeshBasicMaterial({
    color: SURFACES.asphaltMark, fog: true, name: 'proc_mark',
  });
  const goldMark = new THREE.MeshBasicMaterial({
    color: SURFACES.asphaltCenter, fog: true, name: 'proc_centerline',
  });
  roadMats.push(roadMat, walkMat, plazaMat);
  emissiveMats.push(canalMat);

  const facadeMat = mat(0xffffff, {
    name: 'proc_facade',
    roughness: 0.92,
    metalness: 0.04,
    envMapIntensity: 0.35,
    normalMap: detail?.plasterNormal,
    roughnessMap: detail?.plasterRough,
    // Baked base AO rides in the geometry's colour attribute and multiplies
    // the district instance tint in-shader (see aoUnitBox below).
    vertexColors: true,
  });
  if (detail) facadeMat.normalScale.set(0.6, 0.6);
  installUvScaleChunk(facadeMat);
  installUvScaleChunk(roofMat);
  // Painted lintel, not a photo. Hangul signs sit in front of this band.
  const fasciaMat = mat(0xffffff, {
    name: 'proc_fascia',
    roughness: 0.58,
    metalness: 0.06,
    emissive: 0xffffff,
    emissiveIntensity: 0.16,
  });
  emissiveMats.push(fasciaMat);

  // ---- Continuous land ----------------------------------------------------
  // The first version paved only the graph edges as 16 cm ribbons over a city-
  // sized water plane. Any seam, courtyard, or jittered node was a hole, and
  // the camera dropped into the teal void. Land is now two solid slabs with
  // overlapping bridge decks; the canal has a floor. Paint (sidewalks, marks)
  // sits on top and does not participate in collision.
  const { minX, maxX, minZ, maxZ } = layout.playable;
  const SLAB_H = 0.45;
  const pad = 8;
  const nodeWidth = new Map(layout.nodes.map((n) => [n.id, 8]));
  for (const e of layout.edges) {
    nodeWidth.set(e.a, Math.max(nodeWidth.get(e.a) || 0, e.width));
    nodeWidth.set(e.b, Math.max(nodeWidth.get(e.b) || 0, e.width));
  }

  const roadVisual = [];
  const walkVisual = [];
  const plazaVisual = [];
  const wallVisual = [];
  const kerbVisual = [];
  const markVisual = [];
  const goldVisual = [];

  const addSlab = (x0, x1, z0, z1, top = ROAD_Y, into = collision, visual = roadVisual) => {
    const spec = {
      w: x1 - x0,
      h: SLAB_H,
      d: z1 - z0,
      x: (x0 + x1) * 0.5,
      y: top - SLAB_H,
      z: (z0 + z1) * 0.5,
      uvTile: 3, // asphalt aggregate tile, metres
    };
    appendBox(into, spec);
    if (visual) appendBox(visual, spec);
  };

  addSlab(minX - pad, maxX + pad, minZ - pad, WATER_Z0 + 0.8);
  addSlab(minX - pad, maxX + pad, WATER_Z1 - 0.8, maxZ + pad);

  const bridgeXs = [layout.positions.get('n1_4')?.x ?? -96, 0, layout.positions.get('n7_4')?.x ?? 96];
  for (const bx of bridgeXs) {
    addSlab(bx - 9, bx + 9, WATER_Z0 - 1.2, WATER_Z1 + 1.2);
  }

  // Canal floor — if you go in you land on water, you do not fall out of the world.
  addSlab(minX - pad, maxX + pad, WATER_Z0, WATER_Z1, CANAL_Y, collision, null);
  const canalMesh = new THREE.Mesh(
    new THREE.BoxGeometry(maxX - minX + pad * 2, 0.12, WATER_Z1 - WATER_Z0),
    canalMat,
  );
  canalMesh.position.set((minX + maxX) * 0.5, CANAL_Y, (WATER_Z0 + WATER_Z1) * 0.5);
  canalMesh.name = 'proc_canal';
  group.add(canalMesh);

  const wallH = ROAD_Y - CANAL_Y + 1.2;
  for (const z of [WATER_Z0, WATER_Z1]) {
    let cursor = minX - pad;
    const cuts = [...bridgeXs].sort((a, b) => a - b);
    for (const bx of [...cuts, maxX + pad + 1]) {
      const gap = 9;
      const x0 = cursor;
      const x1 = Math.min(bx - gap, maxX + pad);
      if (x1 - x0 > 2) {
        appendBox(wallVisual, { w: x1 - x0, h: wallH, d: 1.2, x: (x0 + x1) * 0.5, y: CANAL_Y, z });
        appendBox(collision, { w: x1 - x0, h: wallH, d: 1.2, x: (x0 + x1) * 0.5, y: CANAL_Y, z });
      }
      cursor = bx + gap;
    }
  }

  for (const edge of layout.edges) {
    const a = layout.positions.get(edge.a);
    const b = layout.positions.get(edge.b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const along = { x: dx / len, z: dz / len };
    const quat = quatAlongInto(new THREE.Vector3(along.x, 0, along.z), new THREE.Vector3(-along.z, 0, along.x));
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const trim = ((nodeWidth.get(edge.a) || 8) + (nodeWidth.get(edge.b) || 8)) * 0.5 + 0.6;
    const walkLen = Math.max(0.8, len - trim);

    if (edge.a !== 'plaza' && edge.b !== 'plaza' && !edge.bridge) {
      const side = edge.width * 0.5 + SIDEWALK * 0.5;
      const intoA = new THREE.Vector3(-along.z, 0, along.x);
      const qL = quatAlongInto(new THREE.Vector3(along.x, 0, along.z), intoA);
      const qR = quatAlongInto(new THREE.Vector3(along.x, 0, along.z), intoA.clone().negate());
      for (const [sign, q] of [[1, qL], [-1, qR]]) {
        const sx = mx + -along.z * side * sign;
        const sz = mz + along.x * side * sign;
        appendBox(walkVisual, {
          w: SIDEWALK, h: 0.04, d: walkLen,
          x: sx, y: ROAD_Y, z: sz, quat: q, uvTile: 2,
        });
        appendBox(kerbVisual, {
          w: 0.16, h: 0.06, d: walkLen,
          x: mx + -along.z * (edge.width * 0.5) * sign,
          y: ROAD_Y, z: mz + along.x * (edge.width * 0.5) * sign,
          quat: q,
        });
      }
    }

    if (edge.width >= 12) {
      appendBox(goldVisual, {
        w: 0.18, h: 0.02, d: Math.max(1, len - 6),
        x: mx, y: ROAD_Y + 0.02, z: mz, quat,
      });
    } else if (edge.width >= 9) {
      appendBox(markVisual, {
        w: 0.12, h: 0.02, d: Math.max(1, len - 4),
        x: mx, y: ROAD_Y + 0.02, z: mz, quat,
      });
    }

    if (edge.bridge) {
      const railH = 1.05;
      const railW = 0.22;
      const side = 8.6;
      for (const sign of [-1, 1]) {
        appendBox(wallVisual, {
          w: railW, h: railH, d: len * 0.95,
          x: mx + -along.z * side * sign,
          y: ROAD_Y, z: mz + along.x * side * sign,
          quat,
        });
        appendBox(collision, {
          w: railW, h: railH, d: len * 0.95,
          x: mx + -along.z * side * sign,
          y: ROAD_Y, z: mz + along.x * side * sign,
          quat,
        });
      }
    }
  }

  const plaza = layout.plaza;
  appendBox(plazaVisual, { w: 26, h: 0.03, d: 26, x: plaza.x, y: ROAD_Y, z: plaza.z, uvTile: 2 });

  // ---- Roundabout island --------------------------------------------------
  const island = layout.roundabout;
  const islandGeo = new THREE.CylinderGeometry(5.4, 5.4, 0.45, 20);
  islandGeo.translate(0, 0.22, 0);
  // Shares kerbMat, which reads vertex colours — bake its ground contact too.
  applyContactAO(islandGeo, { fade: 0.09, strength: 0.5 });
  const islandMesh = new THREE.Mesh(islandGeo, kerbMat);
  islandMesh.position.set(island.x, ROAD_Y, island.z);
  islandMesh.name = 'roundabout_island';
  group.add(islandMesh);
  appendBox(collision, { w: 9.2, h: 0.5, d: 9.2, x: island.x, y: ROAD_Y, z: island.z });

  // ---- Buildings ----------------------------------------------------------
  const bodyRec = [];
  const roofRec = [];
  const fasciaRec = [];

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  // Building instances share an AO-baked clone: local y −0.5 is ground level
  // for every body regardless of scale, so one gradient covers all bases.
  // Roofs keep the clean box — they never touch the street.
  const aoUnitBox = unitBox.clone();
  applyContactAO(aoUnitBox, { groundY: -0.5, fade: 0.14, strength: 0.55 });
  const unitPlane = new THREE.PlaneGeometry(1, 1);

  for (const block of layout.blocks) {
    if (block.kind !== 'lot' || !block.corners) continue;
    const d = block.district;
    const insets = block.edgeWidths.map((w) => w * 0.5 + SIDEWALK + 0.15);
    const inner = insetQuad(block.corners, insets, block.center);
    const innerW = Math.hypot(inner[1].x - inner[0].x, inner[1].z - inner[0].z);
    const innerD = Math.hypot(inner[3].x - inner[0].x, inner[3].z - inner[0].z);
    if (innerW < 7 || innerD < 7) continue;

    for (let e = 0; e < 4; e++) {
      const a = inner[e];
      const b = inner[(e + 1) % 4];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const edgeLen = Math.hypot(dx, dz);
      if (edgeLen < 6) continue;
      const along = new THREE.Vector3(dx / edgeLen, 0, dz / edgeLen);
      const into = new THREE.Vector3(
        block.center.x - (a.x + b.x) * 0.5,
        0,
        block.center.z - (a.z + b.z) * 0.5,
      );
      if (into.lengthSq() < 1e-6) continue;
      into.normalize();
      const quat = quatAlongInto(along, into);
      const toStreet = into.clone().negate();
      const maxDepth = Math.min(11, Math.max(5.5, Math.min(innerW, innerD) * 0.38));

      let t = 0.35;
      while (t < edgeLen - 0.35) {
        let width = 5.6 + rng() * 6.4;
        if (t + width > edgeLen - 0.35) width = edgeLen - 0.35 - t;
        if (width < 4.4) break;
        const depth = 5.4 + rng() * (maxDepth - 5.4);
        const height = d.height[0] + rng() * (d.height[1] - d.height[0]);
        const mid = t + width * 0.5;
        const fx = a.x + along.x * mid + into.x * (depth * 0.5);
        const fz = a.z + along.z * mid + into.z * (depth * 0.5);
        const color = pick(d.facades, rng);
        const shop = rng() < d.shopChance;
        const yaw = Math.atan2(toStreet.x, toStreet.z);
        // Per-instance UV scale. Picked from a small table so adjacent
        // buildings don't all stretch the same plaster tile; consumed at the
        // tail of the per-building block so it slots into the rng sequence
        // after the existing shop pick without disturbing earlier outputs.
        const uvScale = pick(FACADE_UV_SCALES, rng);
        const roofUvScale = pick(ROOF_UV_SCALES, rng);
        // Per-building variant routing. The `mix` district (only `station` in
        // the colour bible) is the one place where adjacent buildings get
        // different variants; everywhere else the variant is fixed by district
        // so the street reads as a coherent facade family. The `pick` for
        // `mix` is deterministic and slots after the existing picks without
        // disturbing earlier outputs.
        const variantId = d.facadeVariant === 'mix'
          ? pick(MIX_VARIANTS, rng)
          : d.facadeVariant;
        bodyScale.push(uvScale);
        bodyVariant.push(VARIANT_INDEX[variantId] ?? VARIANT_INDEX.weathered);
        roofScale.push(roofUvScale);

        bodyRec.push({
          x: fx, y: KERB_H + height * 0.5, z: fz,
          sx: width, sy: height, sz: depth, quat, color,
        });
        roofRec.push({
          x: fx, y: KERB_H + height + 0.2, z: fz,
          sx: width + 0.35, sy: 0.4, sz: depth + 0.35, quat, color: SURFACES.roof,
        });
        appendBox(collision, {
          w: width, h: height + 0.4, d: depth,
          x: fx, y: KERB_H, z: fz, quat,
        });

        const faceX = fx + toStreet.x * (depth * 0.5 + 0.04);
        const faceZ = fz + toStreet.z * (depth * 0.5 + 0.04);
        const shopH = 3.15;
        const faceQuat = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        if (shop) {
          fasciaRec.push({
            x: faceX, y: KERB_H + shopH * 0.5, z: faceZ,
            sx: width * 0.94, sy: shopH, sz: 1, quat: faceQuat,
            color: pick(d.shops, rng),
          });
        }

        buildings.push({
          x: fx, y: KERB_H, z: fz,
          width, height, depth, quat, yaw, toStreet,
          districtId: d.id, districtIndex: d.index,
          shop, faceX, faceZ,
          major: block.edgeWidths[e] >= 10,
        });
        t += width + 0.4;
      }
    }
  }

  const addMesh = (mesh) => { if (mesh) group.add(mesh); };
  addMesh(makeInstanced('proc_buildings', aoUnitBox, facadeMat, bodyRec, true, Float32Array.from(bodyScale)));
  addMesh(makeInstanced('proc_roofs', unitBox, roofMat, roofRec, false, Float32Array.from(roofScale)));
  addMesh(makeInstanced('proc_fascia', unitPlane, fasciaMat, fasciaRec, true));

  const mergeNamed = (geos, material, name) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  // Kerb contact: the 6 cm kerb face gets a full-height gradient so its base
  // melts into the asphalt while the top edge stays lit. Boxes are already in
  // world space at this point, so ROAD_Y is the contact height.
  for (const g of kerbVisual) applyContactAO(g, { fade: 0.09, strength: 0.5 });
  mergeNamed(roadVisual, roadMat, 'proc_roads');
  mergeNamed(walkVisual, walkMat, 'proc_sidewalks');
  mergeNamed(plazaVisual, plazaMat, 'proc_plaza');
  mergeNamed(wallVisual, wallMat, 'proc_walls');
  mergeNamed(kerbVisual, kerbMat, 'proc_kerbs');
  mergeNamed(markVisual, markMat, 'proc_marks');
  mergeNamed(goldVisual, goldMark, 'proc_centerline');

  // ---- Ground decals --------------------------------------------------------
  // Manholes / patches / crosswalks / shop-front stains. Count scales with the
  // same detailIntensity hook as the detail maps (mobile profile → sparser);
  // their materials join roadMaterials so setWetness also polishes them.
  const decalSet = decals && detailIntensity > 0
    ? createGroundDecals(layout, buildings, { detailIntensity, seed })
    : null;
  if (decalSet) {
    group.add(decalSet.group);
    roadMats.push(...decalSet.materials);
  }

  // ---- Perimeter walls + outer water --------------------------------------
  const wallT = 1.1;
  const wallHeight = 2.4;
  const ring = [
    { w: maxX - minX + wallT * 2, h: wallHeight, d: wallT, x: (minX + maxX) * 0.5, z: minZ - wallT * 0.5 },
    { w: maxX - minX + wallT * 2, h: wallHeight, d: wallT, x: (minX + maxX) * 0.5, z: maxZ + wallT * 0.5 },
    { w: wallT, h: wallHeight, d: maxZ - minZ, x: minX - wallT * 0.5, z: (minZ + maxZ) * 0.5 },
    { w: wallT, h: wallHeight, d: maxZ - minZ, x: maxX + wallT * 0.5, z: (minZ + maxZ) * 0.5 },
  ];
  const periVisual = [];
  for (const p of ring) {
    appendBox(periVisual, { ...p, y: ROAD_Y });
    appendBox(collision, { ...p, y: ROAD_Y });
  }
  mergeNamed(periVisual, wallMat, 'proc_perimeter');

  // Water only OUTSIDE the walls — never under the streets.
  const outer = 18;
  const waterStrips = [
    { w: maxX - minX + outer * 2, d: outer, x: (minX + maxX) * 0.5, z: minZ - wallT - outer * 0.5 },
    { w: maxX - minX + outer * 2, d: outer, x: (minX + maxX) * 0.5, z: maxZ + wallT + outer * 0.5 },
    { w: outer, d: maxZ - minZ, x: minX - wallT - outer * 0.5, z: (minZ + maxZ) * 0.5 },
    { w: outer, d: maxZ - minZ, x: maxX + wallT + outer * 0.5, z: (minZ + maxZ) * 0.5 },
  ];
  for (const s of waterStrips) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.12, s.d), canalMat);
    mesh.position.set(s.x, CANAL_Y, s.z);
    mesh.name = 'proc_outer_water';
    group.add(mesh);
  }

  const colliderGeo = mergeGeometries(collision, false) || new THREE.BoxGeometry(1, 1, 1);
  collision.forEach((g) => g.dispose());
  colliderGeo.computeBoundingBox();
  colliderGeo.computeBoundingSphere();

  const roadBox = new THREE.Box3(
    new THREE.Vector3(minX, ROAD_Y - 0.2, minZ),
    new THREE.Vector3(maxX, ROAD_Y + 0.2, maxZ),
  );

  return {
    group,
    colliderGeo,
    buildings,
    materials: { roadMat, walkMat, plazaMat, facadeMat, fasciaMat, canalMat, roofMat },
    roadMaterials: roadMats,
    emissiveMaterials: emissiveMats,
    roadBox,
    decals: decalSet,
    asphaltBlend: asphaltBlendHandle,
    stats: {
      buildings: buildings.length,
      shopFaces: fasciaRec.length,
      decals: decalSet ? decalSet.count : 0,
    },
  };
}
