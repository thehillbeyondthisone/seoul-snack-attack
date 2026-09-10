// Seoul Expanse vertical-slice art kit.
//
// Everything here is procedural Three.js geometry: cheap enough to iterate,
// reusable across districts, and layered over the approved collision massing.
// This milestone deliberately dresses only the station/market spine and the
// central bridge so its art direction can be approved before city-wide use.
import * as THREE from 'three';
import { HUD, NEON, PAINT, SURFACES, cssHex } from './data/color-bible.js';

const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const SIGN_TEXTURE_CACHE = new Map();
const BLADE_TEXTURE_CACHE = new Map();

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function facadeTexture({ base, trim, glow, width, height, seed, market = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const emit = document.createElement('canvas');
  emit.width = 512;
  emit.height = 512;
  const ectx = emit.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 512, 512);
  const rng = seeded(seed);
  const floors = Math.max(3, Math.round(height / 3.2));
  const cols = Math.max(4, Math.min(14, Math.round(width / 5)));

  ctx.fillStyle = cssHex(base);
  ctx.fillRect(0, 0, 512, 512);
  const wash = ctx.createLinearGradient(0, 0, 512, 512);
  wash.addColorStop(0, 'rgba(255,245,222,.12)');
  wash.addColorStop(0.58, 'rgba(40,35,30,.03)');
  wash.addColorStop(1, 'rgba(20,18,18,.25)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal slab edges make the large blocks read as real storeys at speed.
  for (let floor = 1; floor < floors; floor++) {
    const y = 512 - (floor / floors) * 512;
    ctx.fillStyle = 'rgba(24,25,26,.20)';
    ctx.fillRect(0, y - 3, 512, 6);
  }

  const groundTop = 512 - 512 / floors * 1.25;
  ctx.fillStyle = market ? '#3c2416' : '#23272a';
  ctx.fillRect(0, groundTop, 512, 512 - groundTop);
  for (let col = 0; col < cols; col++) {
    const cell = 512 / cols;
    const x = col * cell + cell * 0.12;
    const w = cell * 0.76;
    ctx.fillStyle = col % 3 === 0 ? '#171d20' : '#273239';
    ctx.fillRect(x, groundTop + 30, w, 512 - groundTop - 44);
    ctx.strokeStyle = 'rgba(220,205,175,.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, groundTop + 30, w, 512 - groundTop - 44);
  }

  for (let floor = 1; floor < floors; floor++) {
    const bandTop = 512 - ((floor + 1) / floors) * 512;
    const bandBottom = 512 - (floor / floors) * 512;
    for (let col = 0; col < cols; col++) {
      const cell = 512 / cols;
      const marginX = cell * 0.20;
      const x = col * cell + marginX;
      const y = bandTop + (bandBottom - bandTop) * 0.25;
      const w = cell - marginX * 2;
      const h = (bandBottom - bandTop) * 0.46;
      const lit = rng() > 0.48;
      const windowColor = lit ? (rng() > 0.45 ? '#d7b26d' : '#79abb2') : '#263139';
      ctx.fillStyle = windowColor;
      ctx.fillRect(x, y, w, h);
      if (lit) {
        ectx.fillStyle = windowColor;
        ectx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = cssHex(trim);
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // A thin luminous shop band ties the whole frontage into the night palette.
  ctx.fillStyle = cssHex(glow);
  ctx.shadowColor = cssHex(glow);
  ctx.shadowBlur = 18;
  ctx.fillRect(0, groundTop + 9, 512, 12);
  // Keep the ground-floor ribbon luminous without turning it into a white
  // bloom bar under the shared night preset.
  ectx.fillStyle = market ? '#754015' : '#665b42';
  ectx.fillRect(0, groundTop + 9, 512, 12);
  ctx.shadowBlur = 0;
  return { map: canvasTexture(canvas), emissiveMap: canvasTexture(emit) };
}

function signTexture(ko, en, color, dark = '#100b08') {
  const key = `${ko}|${en}|${color}|${dark}`;
  if (SIGN_TEXTURE_CACHE.has(key)) return SIGN_TEXTURE_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `800 112px ${FONT}`;
  ctx.fillText(ko, 512, 104);
  ctx.shadowBlur = 10;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(en, 512, 196);
  const texture = canvasTexture(canvas);
  SIGN_TEXTURE_CACHE.set(key, texture);
  return texture;
}

function bladeTexture(ko, color) {
  const key = `${ko}|${color}`;
  if (BLADE_TEXTURE_CACHE.has(key)) return BLADE_TEXTURE_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#090707';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...ko];
  const step = 650 / chars.length;
  ctx.font = `800 ${Math.min(112, step * 0.72)}px ${FONT}`;
  chars.forEach((char, index) => ctx.fillText(char, 96, 60 + step * (index + 0.5)));
  const texture = canvasTexture(canvas);
  BLADE_TEXTURE_CACHE.set(key, texture);
  return texture;
}

function nearestRoadFront(block, edges) {
  let best = { distanceSq: Infinity, point: new THREE.Vector3() };
  const center = new THREE.Vector3(block.x, 0, block.z);
  for (const edge of edges) for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const ab = b.clone().sub(a).setY(0);
    const lengthSq = ab.lengthSq();
    if (lengthSq < 1e-6) continue;
    const t = THREE.MathUtils.clamp(center.clone().sub(a).dot(ab) / lengthSq, 0, 1);
    const point = a.clone().addScaledVector(ab, t);
    const distanceSq = point.distanceToSquared(center);
    if (distanceSq < best.distanceSq) best = { distanceSq, point };
  }
  const delta = best.point.sub(center);
  return Math.abs(delta.x) > Math.abs(delta.z)
    ? new THREE.Vector3(Math.sign(delta.x) || 1, 0, 0)
    : new THREE.Vector3(0, 0, Math.sign(delta.z) || 1);
}

function planeOnFront(block, normal, width, height, offset = 0.055) {
  const extent = normal.x ? block.sx * 0.5 : block.sz * 0.5;
  const position = new THREE.Vector3(block.x, height * 0.5, block.z)
    .addScaledVector(normal, extent + offset);
  const yaw = Math.atan2(normal.x, normal.z);
  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry);
  mesh.position.copy(position);
  mesh.rotation.y = yaw;
  return mesh;
}

function addFacade(group, block, edges, style) {
  // Station masses always address the north/south showcase boulevard.  A
  // generic nearest-road choice can make a corner building turn its blank
  // side toward that hero street when a side road happens to be closer.
  const normal = block.district === 2
    ? new THREE.Vector3(block.x < 0 ? 1 : -1, 0, 0)
    : nearestRoadFront(block, edges);
  const width = normal.x ? block.sz : block.sx;
  const facade = planeOnFront(block, normal, width, block.h - 0.3);
  facade.name = `expanse_facade_${block.id}`;
  const maps = facadeTexture({ ...style, width, height: block.h, seed: 0x5100 + Number(block.id.slice(5)) });
  const facadeMaterial = new THREE.MeshStandardMaterial({
    map: maps.map,
    emissiveMap: maps.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    color: 0xffffff,
    roughness: 0.76,
    metalness: 0.05,
  });
  facade.material = facadeMaterial;
  group.add(facade);

  const signWidth = Math.min(12, Math.max(5.5, width * 0.34));
  const sign = planeOnFront(block, normal, signWidth, 1.55, 0.12);
  sign.name = `expanse_sign_${block.id}`;
  sign.position.y = 3.85;
  sign.material = new THREE.MeshBasicMaterial({
    map: signTexture(style.ko, style.en, cssHex(style.glow)),
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: true,
    fog: true,
  });
  group.add(sign);

  // Shallow metal awning: enough silhouette to sell a walkable ground floor.
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(signWidth + 1.4, 0.16, 1.35),
    new THREE.MeshStandardMaterial({ color: style.awning, roughness: 0.68, metalness: 0.22 }),
  );
  awning.name = `expanse_awning_${block.id}`;
  awning.position.copy(sign.position).addScaledVector(normal, 0.58);
  awning.position.y = 2.65;
  awning.rotation.y = Math.atan2(normal.x, normal.z);
  group.add(awning);

  const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
  const blade = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 3.8),
    new THREE.MeshBasicMaterial({
      map: bladeTexture(style.blades[Number(block.id.slice(5)) % style.blades.length], cssHex(style.glow)),
      transparent: true, side: THREE.DoubleSide, toneMapped: true, fog: true,
    }),
  );
  blade.name = `expanse_blade_${block.id}`;
  blade.position.copy(facade.position)
    .addScaledVector(normal, 0.62)
    .addScaledVector(tangent, width * 0.34);
  blade.position.y = 5.4;
  blade.rotation.y = Math.atan2(normal.x, normal.z) + Math.PI * 0.5;
  group.add(blade);

  return { normal, width, material: facadeMaterial };
}

function addRooftop(group, block, material, index) {
  const unit = new THREE.Group();
  unit.name = `expanse_rooftop_${block.id}`;
  unit.position.set(block.x, block.h, block.z);
  const plant = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.1, 4.2), material);
  plant.position.set(block.sx * 0.15, 1.05, -block.sz * 0.15);
  unit.add(plant);
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 2.8, 12),
    new THREE.MeshStandardMaterial({ color: index % 2 ? 0xb7c4c4 : 0x78969a, roughness: 0.42, metalness: 0.48 }),
  );
  tank.position.set(-block.sx * 0.18, 1.4, block.sz * 0.14);
  unit.add(tank);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), material);
  antenna.position.set(block.sx * -0.26, 3, block.sz * -0.18);
  unit.add(antenna);
  group.add(unit);
}

function normalizedCollisionBox(width, height, depth, matrix) {
  const source = new THREE.BoxGeometry(width, height, depth);
  source.applyMatrix4(matrix);
  const geometry = source.toNonIndexed();
  source.dispose();
  geometry.deleteAttribute('uv');
  return geometry;
}

function addStationGate(group, collisionParts) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x676c70, roughness: 0.76, metalness: 0.16 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x202a30, roughness: 0.45, metalness: 0.62 });
  for (const x of [-12.2, 12.2]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 10, 2.2), concrete);
    pillar.position.set(x, 5, -65);
    group.add(pillar);
    collisionParts.push(normalizedCollisionBox(1.7, 10, 2.2, pillar.matrix.clone().setPosition(pillar.position)));
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(26.2, 1.5, 2.4), metal);
  beam.position.set(0, 10, -65);
  group.add(beam);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2.55),
    new THREE.MeshBasicMaterial({
      map: signTexture('서울역', 'SEOUL STATION', cssHex(NEON.warmWhite)),
      transparent: true, toneMapped: true, side: THREE.DoubleSide, fog: true,
    }),
  );
  face.name = 'expanse_seoul_station_sign';
  face.position.set(0, 10.05, -63.74);
  group.add(face);
}

function addBeam(group, a, b, width, height, material, name, collisionParts = null) {
  const direction = b.clone().sub(a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
  mesh.name = name;
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(FORWARD, direction.normalize());
  mesh.updateMatrix();
  group.add(mesh);
  if (collisionParts) collisionParts.push(normalizedCollisionBox(width, height, length, mesh.matrix));
  return mesh;
}

function addBridgeKit(group, layout, collisionParts, streetlightAnchors) {
  const bridge = layout.edges.find((edge) => edge.id === 'main_bridge');
  if (!bridge) return;
  const barrierMat = new THREE.MeshStandardMaterial({ color: SURFACES.barrier, roughness: 0.65, metalness: 0.28 });
  for (let i = 1; i < bridge.points.length; i++) {
    const a = bridge.points[i - 1];
    const b = bridge.points[i];
    for (const side of [-1, 1]) {
      const offset = new THREE.Vector3(side * (bridge.width * 0.5 + 0.42), 0.62, 0);
      addBeam(group, a.clone().add(offset), b.clone().add(offset), 0.42, 0.76,
        barrierMat, `expanse_bridge_rail_${i}_${side}`, collisionParts);
    }
  }
  for (const z of [128, 154, 180, 206, 232]) for (const x of [-10.2, 10.2]) {
    const point = bridge.points.reduce((best, candidate) =>
      Math.abs(candidate.z - z) < Math.abs(best.z - z) ? candidate : best, bridge.points[0]);
    streetlightAnchors.push({
      position: new THREE.Vector3(x, point.y, z), lamp: 0xbdefff, glow: HUD.nav,
    });
  }
}

function addRoadGraphics(group) {
  const white = new THREE.MeshBasicMaterial({ color: 0xe6e3d8, toneMapped: true, fog: true });
  const yellow = new THREE.MeshBasicMaterial({ color: HUD.money, toneMapped: true, fog: true });
  for (let z = -270; z <= 78; z += 13) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 6), yellow);
    dash.position.set(0, 0.045, z);
    group.add(dash);
  }
  for (let row = 0; row < 9; row++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.038, 0.55), white);
    bar.position.set(0, 0.05, -75 + row * 1.25);
    group.add(bar);
  }
  const kerbMat = new THREE.MeshStandardMaterial({ color: SURFACES.sidewalk, roughness: 0.92 });
  for (const x of [-10.6, 10.6]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 235), kerbMat);
    walk.position.set(x, 0.025, -67.5);
    walk.name = `expanse_spine_walk_${x}`;
    group.add(walk);
  }
}

function addDistrictRoof(group, block, _style, index) {
  if (block.district === 0 || block.district === 5) {
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 4),
      new THREE.MeshStandardMaterial({
        color: block.district === 0 ? 0x263f36 : 0x6f241b,
        roughness: 0.84,
        metalness: 0.06,
      }),
    );
    roof.name = `expanse_district_roof_${block.id}`;
    roof.position.set(block.x, block.h + 2.5, block.z);
    roof.scale.set(block.sx * 0.52, 5, block.sz * 0.52);
    roof.rotation.y = Math.PI * 0.25;
    group.add(roof);
  }

  if (block.district === 1) {
    const normal = new THREE.Vector3(block.x < -250 ? 1 : -1, 0, 0);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 3.2),
      new THREE.MeshBasicMaterial({
        map: signTexture(index % 2 ? '홍대 치맥' : '떡볶이 골목', 'HONGDAE NIGHT', cssHex(NEON.red)),
        transparent: true, side: THREE.DoubleSide, toneMapped: true, fog: true,
      }),
    );
    board.name = `expanse_hongdae_billboard_${block.id}`;
    board.position.set(block.x, block.h + 4, block.z);
    board.rotation.y = Math.atan2(normal.x, normal.z);
    group.add(board);
  }

  if (block.district === 4) {
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9ac6c4, roughness: 0.48, metalness: 0.52 });
    for (const z of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(block.sx * 0.78, 0.55, 0.16), railMat);
      rail.position.set(block.x, block.h + 0.55, block.z + z * block.sz * 0.34);
      group.add(rail);
    }
    for (const x of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, block.sz * 0.68), railMat);
      rail.position.set(block.x + x * block.sx * 0.39, block.h + 0.55, block.z);
      group.add(rail);
    }
  }
}

function addRadioTower(group, collisionParts) {
  const tower = new THREE.Group();
  tower.name = 'expanse_bukak_radio_tower';
  tower.position.set(-140, 0, -265);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7e888b, roughness: 0.52, metalness: 0.72 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.4, 58, 8), steel);
  mast.position.y = 29;
  tower.add(mast);
  for (const y of [13, 26, 39, 52]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8 - y * 0.08, 0.32, 0.32), steel);
    arm.position.y = y;
    tower.add(arm);
    const cross = arm.clone();
    cross.rotation.y = Math.PI * 0.5;
    tower.add(cross);
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 12, 8),
    new THREE.MeshBasicMaterial({ color: NEON.red, toneMapped: true, fog: true }),
  );
  beacon.position.y = 59;
  tower.add(beacon);
  group.add(tower);
  collisionParts.push(normalizedCollisionBox(4, 4, 4,
    new THREE.Matrix4().makeTranslation(-140, 2, -265)));
}

function addRiverPromenade(group) {
  const paving = new THREE.MeshStandardMaterial({ color: 0x53656a, roughness: 0.86, metalness: 0.08 });
  for (const z of [119, 211]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(640, 0.12, 5.5), paving);
    walk.name = `expanse_hangang_promenade_${z}`;
    walk.position.set(0, 0.04, z);
    group.add(walk);
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0xa8c9c8, roughness: 0.42, metalness: 0.62 });
  const spans = [[-320, -255], [-235, -10], [10, 225], [245, 320]];
  for (const z of [122, 208]) for (const [a, b] of spans) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.68, 0.18), railMat);
    rail.position.set((a + b) * 0.5, 0.55, z);
    group.add(rail);
  }
}

function addPochaRow(group, collisionParts, streetlightAnchors) {
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x40231c, roughness: 0.82 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xb43a27, roughness: 0.72, side: THREE.DoubleSide });
  const lanternMat = new THREE.MeshBasicMaterial({ color: NEON.orange, toneMapped: true, fog: true });
  [274, 292, 310, 328].forEach((x, index) => {
    const z = 220 + (index % 2) * 5;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.35, 1.3), counterMat);
    counter.position.set(x, 0.68, z);
    counter.name = `expanse_pocha_counter_${index}`;
    group.add(counter);
    counter.updateMatrix();
    collisionParts.push(normalizedCollisionBox(4.5, 1.35, 1.3, counter.matrix));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.4, 4), canopyMat);
    canopy.position.set(x, 3.3, z);
    canopy.rotation.y = Math.PI * 0.25;
    group.add(canopy);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 7), lanternMat);
    lantern.position.set(x, 2.45, z - 1.1);
    group.add(lantern);
    streetlightAnchors.push({
      position: new THREE.Vector3(x, 0, z), lamp: 0xff8a4d, glow: NEON.red,
    });
  });
}

export function buildExpanseDressing(group, layout) {
  const dressing = new THREE.Group();
  dressing.name = 'expanse_full_district_identity_pass';
  group.add(dressing);
  const collisionParts = [];
  const streetlightAnchors = [];
  const emissiveMaterials = [];
  const rooftopMat = new THREE.MeshStandardMaterial({ color: 0x343d40, roughness: 0.78, metalness: 0.35 });

  const styles = [
    {
      base: PAINT.cream, trim: PAINT.jade, glow: NEON.warmWhite, awning: 0x476154,
      ko: '북악 산책', en: 'BUKAK RIDGE', market: false, blades: ['찻집', '토스트', '다방'],
      lamp: 0xf2e2bc, lightGlow: 0xd8bd85,
    },
    {
      base: PAINT.nightPlaster, trim: PAINT.mauve, glow: NEON.red, awning: 0x7d281f,
      ko: '떡볶이 골목', en: 'TTEOKBOKKI ALLEY', market: false, blades: ['떡볶이', '노래방', '치맥'],
      lamp: 0xffa07d, lightGlow: NEON.red,
    },
    {
      base: PAINT.concrete, trim: PAINT.charcoal, glow: NEON.warmWhite, awning: 0x5b6b70,
      ko: '김밥 대로', en: 'GIMBAP BOULEVARD', market: false, blades: ['김밥', '만두', '분식'],
      lamp: 0xffc278, lightGlow: 0xff9a4a,
    },
    {
      base: PAINT.terracotta, trim: PAINT.cream, glow: NEON.gold, awning: 0xb15c31,
      ko: '호떡 시장', en: 'HOTTEOK MARKET', market: true, blades: ['호떡', '어묵', '시장'],
      lamp: 0xffdda4, lightGlow: NEON.gold,
    },
    {
      base: PAINT.jade, trim: PAINT.concrete, glow: NEON.cyan, awning: 0x376f75,
      ko: '빙수 한강', en: 'BINGSU HANFRONT', market: false, blades: ['빙수', '카페', '한강'],
      lamp: 0xb2ecdd, lightGlow: NEON.cyan,
    },
    {
      base: PAINT.terracotta, trim: PAINT.charcoal, glow: NEON.orange, awning: 0x8f2f24,
      ko: '포차 골목', en: 'POCHA ALLEY', market: true, blades: ['포차', '국밥', '소주'],
      lamp: 0xff964f, lightGlow: NEON.red,
    },
  ];
  const selected = layout.buildingBlocks;
  selected.forEach((block, index) => {
    const style = styles[block.district];
    const facade = addFacade(dressing, block, layout.edges, style);
    emissiveMaterials.push(facade.material);
    addRooftop(dressing, block, rooftopMat, index);
    addDistrictRoof(dressing, block, style, index);
    const extent = facade.normal.x ? block.sx * 0.5 : block.sz * 0.5;
    streetlightAnchors.push({
      position: new THREE.Vector3(block.x, 0, block.z).addScaledVector(facade.normal, extent + 3.2),
      lamp: style.lamp,
      glow: style.lightGlow,
    });
  });

  addStationGate(dressing, collisionParts);
  addBridgeKit(dressing, layout, collisionParts, streetlightAnchors);
  addRadioTower(dressing, collisionParts);
  addRiverPromenade(dressing);
  addPochaRow(dressing, collisionParts, streetlightAnchors);

  // A denser practical-light rhythm along the showcase boulevard.
  for (let z = -230; z <= 80; z += 34) for (const x of [-13.6, 13.6]) {
    streetlightAnchors.push({
      position: new THREE.Vector3(x, 0, z), lamp: 0xffc278, glow: 0xff9a4a,
    });
  }

  return {
    group: dressing,
    collisionParts,
    streetlightAnchors,
    emissiveMaterials,
    stats: { facades: selected.length, stationGate: 1, bridgeRails: 8, districtLandmarks: 4 },
  };
}
