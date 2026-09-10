// Hangul signage on procedural facades.
//
// Photo shopfronts are gone. What you read at speed is Korean: pickup neon,
// vertical blades, lintel strips, and the hanging 3D Hangul pieces.
//
// Cost control: sign names cluster by district so each canvas batch stays
// spatially compact, sprite batches past the device cull distance hide
// wholesale, and the landmark practicals run as a fixed light pool that
// chases the player (tickSignLod below).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mulberry32 } from '../../core/rng.js';
import { resolveGraphicsProfile } from '../../core/graphics-quality.js';
import { RESTAURANTS } from '../../game/data/restaurants.js';
import { STREET_SHOPS } from '../data/shop-names.js';
import {
  HANGING_SIGNS, LANDMARK_SHOPS, DISTRICT_BY_ID, cssHex, pick,
} from '../data/color-bible.js';
import { PROC_SEED } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();

const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';

const LOD_TICK_MS = 250; // ms between distance-LOD passes
const FADE_RATE = 3.5;   // practical fade speed, normalized units/s — StreetlightPool parity
const NAME_SPREAD = 7;   // Hangul names drawn from each district's slice

// The LOD driver: render hooks only fire for objects actually drawn, and every
// real sign must stay free to hide itself — so an always-drawn, fully
// transparent speck parked under the map owns the tick. Two triangles.
let driverGeo = null;
let driverMat = null;

function makeLodDriver(onTick) {
  if (!driverGeo) {
    driverGeo = new THREE.PlaneGeometry(0.05, 0.05);
    driverMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
  }
  const driver = new THREE.Mesh(driverGeo, driverMat);
  driver.name = 'proc_sign_lod_driver';
  driver.position.set(0, -60, 0);
  driver.frustumCulled = false;
  driver.onBeforeRender = (_renderer, _scene, camera) => onTick(camera);
  return driver;
}

function paintHangul(ctx, ko, color, vertical) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 8, 14, .92)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = vertical ? 10 : 14;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...ko];
  if (vertical) {
    const step = (h - 28) / Math.max(1, chars.length);
    ctx.font = `700 ${Math.min(72, step * 0.78)}px ${FONT}`;
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 18 + step * (i + 0.5)));
  } else {
    ctx.font = `700 ${ko.length > 6 ? 64 : 78}px ${FONT}`;
    ctx.fillText(ko, w / 2, h / 2);
  }
}

function makeHangulMaterial(ko, vertical) {
  const canvas = document.createElement('canvas');
  if (vertical) { canvas.width = 160; canvas.height = 512; }
  else { canvas.width = 640; canvas.height = 160; }
  // White glyphs on black: InstancedMesh instanceColor tints the Hangul,
  // the black fascia stays black. One material per name, not per neon.
  paintHangul(canvas.getContext('2d'), ko, '#ffffff', vertical);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: true, fog: true,
  });
}

function makeLandmarkSign({ ko, color }) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  paintHangul(ctx, ko, color, false);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: true, fog: true,
  });
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), material), material };
}

function restaurantOf(id) {
  return RESTAURANTS.find((r) => r.id === id) || { id, nameKo: id, nameEn: id };
}

export async function dressSigns(group, buildings, { manager, seed = PROC_SEED, profile = resolveGraphicsProfile() } = {}) {
  const rng = mulberry32(seed ^ 0x51a1);
  const signGroup = new THREE.Group();
  signGroup.name = 'proc_signs';
  group.add(signGroup);

  // Sprite meshes with their instance XZ positions, fed to the distance LOD.
  const lodSprites = [];
  function trackSprite(mesh, points) {
    const xz = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      xz[i * 2] = points[i].x;
      xz[i * 2 + 1] = points[i].z;
    }
    lodSprites.push({ mesh, xz });
  }

  const hanging = [];
  try {
    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync('assets/props/signage.glb');
    const byName = new Map();
    gltf.scene.traverse((o) => { if (o.isMesh) byName.set(o.name, o); });
    for (const spec of HANGING_SIGNS) {
      const src = byName.get(spec.node);
      if (!src) continue;
      hanging.push({ geometry: src.geometry, material: src.material, scale: spec.scale });
    }
  } catch (err) {
    console.warn('proc signs: signage.glb failed, canvas Hangul only', err);
  }

  const hangRec = hanging.map(() => []);
  const candidates = buildings.filter((b) => b.shop);
  for (const b of candidates) {
    const d = DISTRICT_BY_ID[b.districtId];
    if (!d || rng() > d.signChance) continue;
    if (!hanging.length) continue;
    // Blade style clusters by district too, so these batches stay compact.
    const slot = (d.index * 2 + Math.floor(rng() * 2)) % hanging.length;
    const along = new THREE.Vector3(-b.toStreet.z, 0, b.toStreet.x);
    const side = (rng() < 0.5 ? -1 : 1) * (b.width * 0.22);
    hangRec[slot].push({
      x: b.faceX + b.toStreet.x * 0.55 + along.x * side,
      y: b.y + 3.6 + rng() * 0.8,
      z: b.faceZ + b.toStreet.z * 0.55 + along.z * side,
      quat: new THREE.Quaternion().setFromAxisAngle(UP, b.yaw + Math.PI / 2),
      sx: hanging[slot].scale,
      sy: hanging[slot].scale,
      sz: hanging[slot].scale,
    });
  }

  hanging.forEach((src, i) => {
    const rec = hangRec[i];
    if (!rec.length) return;
    const mesh = new THREE.InstancedMesh(src.geometry, src.material, rec.length);
    mesh.name = `hanging_sign_${i}`;
    rec.forEach((r, n) => {
      mesh.setMatrixAt(n, _m.compose(_p.set(r.x, r.y, r.z), r.quat, _s.set(r.sx, r.sy, r.sz)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Instance-aware bounds let the renderer reject the whole batch off-screen;
    // tickSignLod below handles what the frustum cannot.
    mesh.computeBoundingSphere();
    trackSprite(mesh, rec);
    signGroup.add(mesh);
  });

  const used = new Set();
  const pickupSites = [];
  const emissive = [];
  const practicalSites = [];

  for (const landmark of LANDMARK_SHOPS) {
    const rest = restaurantOf(landmark.id);
    const pool = candidates
      .filter((b) => b.districtId === landmark.district && !used.has(b) && b.width >= 6)
      .sort((a, b) => (b.major - a.major) || (b.width - a.width));
    const building = pool[0] || candidates.find((b) => !used.has(b));
    if (!building) continue;
    used.add(building);
    const color = cssHex(landmark.neon);
    const { mesh, material } = makeLandmarkSign({ ko: rest.nameKo, color });
    mesh.name = `shop_sign_${landmark.id}`;
    mesh.position.set(
      building.faceX + building.toStreet.x * 0.16,
      building.y + 3.55,
      building.faceZ + building.toStreet.z * 0.16,
    );
    mesh.quaternion.setFromAxisAngle(UP, building.yaw);
    signGroup.add(mesh);
    emissive.push(material);
    trackSprite(mesh, [mesh.position]);

    // Practical sites feed the light pool further down; desktop keeps all of
    // them lit exactly like the old per-landmark practicals.
    practicalSites.push({
      x: building.faceX + building.toStreet.x * 1.1,
      y: building.y + 2.8,
      z: building.faceZ + building.toStreet.z * 1.1,
      color: landmark.neon,
      intensity: 11,
    });

    const door = new THREE.Vector3(
      building.faceX + building.toStreet.x * 2.4,
      building.y,
      building.faceZ + building.toStreet.z * 2.4,
    );
    pickupSites.push({
      id: landmark.id,
      point: door,
      tile: 0,
      slot: 0,
      front: landmark.district,
      toStreet: { x: building.toStreet.x, z: building.toStreet.z },
      building,
    });
  }

  // Filler Hangul: one canvas per (name, neon, orientation), then instance.
  // Names come from a per-district slice of the roster — the same few shops
  // repeat around a neighbourhood, like any real commercial street. That is
  // what keeps each batch spatially compact enough for whole-batch culling.
  const batches = new Map();
  const hGeom = new THREE.PlaneGeometry(2.6, 0.64);
  const vGeom = new THREE.PlaneGeometry(0.52, 2.6);
  let hangulCount = 0;
  for (const b of candidates) {
    if (used.has(b)) continue;
    const d = DISTRICT_BY_ID[b.districtId];
    if (!d || rng() > d.signChance) continue;
    const ko = STREET_SHOPS[(d.index * 13 + Math.floor(rng() * NAME_SPREAD)) % STREET_SHOPS.length];
    const neon = pick(d.neon, rng);
    const vertical = rng() < 0.62;
    const key = `${vertical ? 'v' : 'h'}:${ko}`;
    let batch = batches.get(key);
    if (!batch) {
      const material = makeHangulMaterial(ko, vertical);
      emissive.push(material);
      batch = { material, geometry: vertical ? vGeom : hGeom, rec: [] };
      batches.set(key, batch);
    }
    const along = new THREE.Vector3(-b.toStreet.z, 0, b.toStreet.x);
    if (vertical) {
      const side = (rng() < 0.5 ? -1 : 1) * (b.width * 0.38);
      batch.rec.push({
        x: b.faceX + b.toStreet.x * 0.7 + along.x * side,
        y: b.y + 3.9,
        z: b.faceZ + b.toStreet.z * 0.7 + along.z * side,
        quat: new THREE.Quaternion().setFromAxisAngle(UP, b.yaw + Math.PI / 2),
        sx: 1, sy: 1, sz: 1, color: neon,
      });
    } else {
      batch.rec.push({
        x: b.faceX + b.toStreet.x * 0.12,
        y: b.y + 3.45,
        z: b.faceZ + b.toStreet.z * 0.12,
        quat: new THREE.Quaternion().setFromAxisAngle(UP, b.yaw),
        sx: Math.min(1.35, b.width / 2.8), sy: 1, sz: 1, color: neon,
      });
    }
    hangulCount++;
  }

  let n = 0;
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.rec.length);
    mesh.name = `hangul_${n++}`;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(batch.rec.length * 3), 3);
    const tint = new THREE.Color();
    batch.rec.forEach((r, i) => {
      mesh.setMatrixAt(i, _m.compose(_p.set(r.x, r.y, r.z), r.quat, _s.set(r.sx, r.sy, r.sz)));
      mesh.setColorAt(i, tint.setHex(r.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    trackSprite(mesh, batch.rec);
    signGroup.add(mesh);
  }

  // Practical neon pool — the StreetlightPool doctrine verbatim: the number of
  // VISIBLE lights is part of every lit material's program key, so the pool is
  // sized once from the device budget (desktop keeps every site, mobile caps
  // at profile.streetlights = 4) and afterwards only intensity ever moves.
  // Chasing the nearest landmarks is what prunes by distance.
  const budget = Math.min(practicalSites.length, profile.streetlights);
  const practicals = [];
  for (let i = 0; i < budget; i++) {
    const site = practicalSites[i];
    const light = new THREE.PointLight(site.color, site.intensity, 14, 2);
    // Visible from frame zero at full level — settled before the first render,
    // then never toggled again.
    light.visible = true;
    light.position.set(site.x, site.y, site.z);
    signGroup.add(light);
    practicals.push({ light, siteIndex: i, level: 1, base: site.intensity });
  }

  const order = practicalSites.map((_, i) => i);
  const siteDistSq = new Float32Array(practicalSites.length);
  const wanted = new Uint8Array(practicalSites.length);

  function retargetPracticals(camPos) {
    for (let i = 0; i < practicalSites.length; i++) {
      const s = practicalSites[i];
      const dx = s.x - camPos.x;
      const dz = s.z - camPos.z;
      siteDistSq[i] = dx * dx + dz * dz;
    }
    order.sort((a, b) => siteDistSq[a] - siteDistSq[b]);
    wanted.fill(0);
    let claimed = 0;
    for (let i = 0; i < order.length && claimed < budget; i++) {
      const idx = order[i]; // ascending distance
      if (siteDistSq[idx] > lodDistanceSq) break;
      wanted[idx] = 1;
      claimed++;
    }
    // Release lights whose site fell out of favour, then hand out the still-
    // wanted unclaimed sites nearest-first. Lights only jump position when
    // claimed, mirroring StreetlightPool._retarget().
    for (const p of practicals) {
      if (p.siteIndex >= 0 && !wanted[p.siteIndex]) p.siteIndex = -1;
    }
    for (const p of practicals) {
      if (p.siteIndex >= 0) continue;
      for (const idx of order) {
        if (!wanted[idx]) continue;
        if (practicals.some((o) => o.siteIndex === idx)) continue;
        p.siteIndex = idx;
        const s = practicalSites[idx];
        p.light.position.set(s.x, s.y, s.z);
        p.light.color.setHex(s.color);
        break;
      }
    }
  }

  function fadePracticals(dt) {
    for (const p of practicals) {
      const target = p.siteIndex >= 0 ? 1 : 0;
      if (p.level !== target) {
        p.level = target > p.level
          ? Math.min(target, p.level + FADE_RATE * dt)
          : Math.max(target, p.level - FADE_RATE * dt);
      }
      p.light.intensity = p.base * p.level;
    }
  }

  // Distance LOD: hide sprite batches whose every instance sits past the
  // device cull distance (profile.cullDistance — the same threshold main.js
  // feeds city.cullDistance), and let the practical pool chase the camera.
  // Runs ~4×/s; all scratch state above is allocated once at build time.
  const lodDistanceSq = profile.cullDistance * profile.cullDistance;
  let lastLodAt = performance.now();
  function tickSignLod(camera) {
    const now = performance.now();
    const elapsed = now - lastLodAt;
    if (elapsed < LOD_TICK_MS) return;
    lastLodAt = now;

    _c.setFromMatrixPosition(camera.matrixWorld);
    for (let i = 0; i < lodSprites.length; i++) {
      const entry = lodSprites[i];
      const xz = entry.xz;
      let best = Infinity;
      for (let k = 0; k < xz.length; k += 2) {
        const dx = xz[k] - _c.x;
        const dz = xz[k + 1] - _c.z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      entry.mesh.visible = best <= lodDistanceSq;
    }

    if (practicals.length) {
      retargetPracticals(_c);
      fadePracticals(Math.min(0.25, elapsed / 1000));
    }
  }
  signGroup.add(makeLodDriver(tickSignLod));

  return {
    group: signGroup,
    pickupSites,
    emissiveMaterials: emissive,
    stats: {
      hanging: hangRec.reduce((n, a) => n + a.length, 0),
      hangul: hangulCount,
      landmarks: pickupSites.length,
      practicalLights: budget,
    },
  };
}
