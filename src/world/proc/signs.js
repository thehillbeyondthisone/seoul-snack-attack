// Hangul signage on procedural facades.
//
// Photo shopfronts are gone. What you read at speed is Korean: pickup neon,
// vertical blades, lintel strips, and the hanging 3D Hangul pieces.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mulberry32 } from '../../core/rng.js';
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

const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';

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

export async function dressSigns(group, buildings, { manager, seed = PROC_SEED } = {}) {
  const rng = mulberry32(seed ^ 0x51a1);
  const signGroup = new THREE.Group();
  signGroup.name = 'proc_signs';
  group.add(signGroup);

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
    const slot = Math.floor(rng() * hanging.length) % hanging.length;
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
    mesh.frustumCulled = false;
    rec.forEach((r, n) => {
      mesh.setMatrixAt(n, _m.compose(_p.set(r.x, r.y, r.z), r.quat, _s.set(r.sx, r.sy, r.sz)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    signGroup.add(mesh);
  });

  const used = new Set();
  const pickupSites = [];
  const emissive = [];

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

    const practical = new THREE.PointLight(landmark.neon, 11, 14, 2);
    practical.position.set(
      building.faceX + building.toStreet.x * 1.1,
      building.y + 2.8,
      building.faceZ + building.toStreet.z * 1.1,
    );
    signGroup.add(practical);

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
  const batches = new Map();
  const hGeom = new THREE.PlaneGeometry(2.6, 0.64);
  const vGeom = new THREE.PlaneGeometry(0.52, 2.6);
  let hangulCount = 0;
  for (const b of candidates) {
    if (used.has(b)) continue;
    const d = DISTRICT_BY_ID[b.districtId];
    if (!d || rng() > d.signChance) continue;
    const ko = pick(STREET_SHOPS, rng);
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
    mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(batch.rec.length * 3), 3);
    const tint = new THREE.Color();
    batch.rec.forEach((r, i) => {
      mesh.setMatrixAt(i, _m.compose(_p.set(r.x, r.y, r.z), r.quat, _s.set(r.sx, r.sy, r.sz)));
      mesh.setColorAt(i, tint.setHex(r.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    signGroup.add(mesh);
  }

  return {
    group: signGroup,
    pickupSites,
    emissiveMaterials: emissive,
    stats: {
      hanging: hangRec.reduce((n, a) => n + a.length, 0),
      hangul: hangulCount,
      landmarks: pickupSites.length,
    },
  };
}
