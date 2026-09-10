// Seoul Expanse density and street-life pass.
//
// The large-world road graph stays authoritative.  This module deterministically
// fills the safe land left around it with instanced background buildings and
// small street-life kits, returning collision boxes for every solid obstacle.
import * as THREE from 'three';
import { expanseDistrictAt, EXPANSE_BOUNDS, RIVER } from './expanse-layout.js';
import { NEON, PAINT, SURFACES, cssHex } from './data/color-bible.js';
import { buildExpanseVisualChunks, chunkAt } from './expanse-chunks.js';

const FORWARD = new THREE.Vector3(0, 0, 1);
const DISTRICT_BASE = [PAINT.cream, PAINT.nightPlaster, PAINT.concrete, PAINT.terracotta, PAINT.jade, 0x7a4939];
const DISTRICT_GLOW = [NEON.warmWhite, NEON.red, NEON.warmWhite, NEON.gold, NEON.cyan, NEON.orange];
const HEIGHTS = [[7, 15], [9, 20], [13, 26], [7, 15], [9, 18], [7, 14]];

function rngFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function segmentIntersectsRect(a, b, rect) {
  let enter = 0;
  let exit = 1;
  for (const [p, q] of [
    [-(b.x - a.x), a.x - rect.minX], [b.x - a.x, rect.maxX - a.x],
    [-(b.z - a.z), a.z - rect.minZ], [b.z - a.z, rect.maxZ - a.z],
  ]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) { if (t > exit) return false; enter = Math.max(enter, t); }
    else { if (t < enter) return false; exit = Math.min(exit, t); }
  }
  return true;
}

function overlaps(a, b, gap = 0) {
  return Math.abs(a.x - b.x) < (a.sx + b.sx) * 0.5 + gap
    && Math.abs(a.z - b.z) < (a.sz + b.sz) * 0.5 + gap;
}

function roadIntrusion(record, edges, margin = 4) {
  for (const edge of edges) {
    const padding = edge.width * 0.5 + margin;
    const rect = {
      minX: record.x - record.sx * 0.5 - padding,
      maxX: record.x + record.sx * 0.5 + padding,
      minZ: record.z - record.sz * 0.5 - padding,
      maxZ: record.z + record.sz * 0.5 + padding,
    };
    for (let i = 1; i < edge.points.length; i++) {
      if (segmentIntersectsRect(edge.points[i - 1], edge.points[i], rect)) return true;
    }
  }
  return false;
}

function nearestRoadFace(record, edges) {
  const center = new THREE.Vector3(record.x, 0, record.z);
  let bestPoint = null;
  let bestDistance = Infinity;
  let bestYaw = 0;
  for (const edge of edges) for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const ab = b.clone().sub(a).setY(0);
    const lenSq = ab.lengthSq();
    if (lenSq < 1e-6) continue;
    const t = THREE.MathUtils.clamp(center.clone().sub(a).dot(ab) / lenSq, 0, 1);
    const point = a.clone().addScaledVector(ab, t);
    const distance = point.distanceToSquared(center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = point;
      bestYaw = Math.atan2(ab.x, ab.z);
    }
  }
  const delta = (bestPoint || center.clone().add(new THREE.Vector3(0, 0, 1))).sub(center);
  const normal = Math.abs(delta.x) > Math.abs(delta.z)
    ? new THREE.Vector3(Math.sign(delta.x) || 1, 0, 0)
    : new THREE.Vector3(0, 0, Math.sign(delta.z) || 1);
  return { normal, roadYaw: bestYaw };
}

function pointOnPolyline(points, fraction) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += points[i - 1].distanceTo(points[i]);
  let target = length * fraction;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segment = a.distanceTo(b);
    if (target <= segment || i === points.length - 1) {
      const t = segment ? THREE.MathUtils.clamp(target / segment, 0, 1) : 0;
      const point = a.clone().lerp(b, t);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      return { point, yaw };
    }
    target -= segment;
  }
  return { point: points[0].clone(), yaw: 0 };
}

export function generateExpanseStreetLife(layout, seed = 20260904) {
  const rng = rngFrom(seed);
  const buildings = [];
  const occupied = layout.buildingBlocks.map((block) => ({ ...block }));
  for (let z = -325; z <= 330; z += 43) for (let x = -468; x <= 468; x += 46) {
    const district = expanseDistrictAt(x, z).index;
    const [hMin, hMax] = HEIGHTS[district];
    const record = {
      id: `secondary_${buildings.length}`,
      x: x + (rng() - 0.5) * 12,
      z: z + (rng() - 0.5) * 10,
      sx: 17 + rng() * 16,
      sz: 16 + rng() * 15,
      h: hMin + rng() * (hMax - hMin),
      district,
    };
    if (record.x - record.sx * 0.5 < EXPANSE_BOUNDS.minX + 8
      || record.x + record.sx * 0.5 > EXPANSE_BOUNDS.maxX - 8
      || record.z - record.sz * 0.5 < EXPANSE_BOUNDS.minZ + 8
      || record.z + record.sz * 0.5 > EXPANSE_BOUNDS.maxZ - 8) continue;
    if (record.x + record.sx * 0.5 > RIVER.minX - 3
      && record.x - record.sx * 0.5 < RIVER.maxX + 3
      && record.z + record.sz * 0.5 > RIVER.minZ - 7
      && record.z - record.sz * 0.5 < RIVER.maxZ + 7) continue;
    if (roadIntrusion(record, layout.edges, 4)) continue;
    if (occupied.some((block) => overlaps(record, block, 5))) continue;
    const face = nearestRoadFace(record, layout.edges);
    record.normal = face.normal;
    record.roadYaw = face.roadYaw;
    buildings.push(record);
    occupied.push(record);
  }

  const cars = [];
  for (let i = 0; i < buildings.length; i += 5) {
    const block = buildings[i];
    const away = block.normal.clone().multiplyScalar(-1);
    const extent = away.x ? block.sx * 0.5 : block.sz * 0.5;
    cars.push({
      x: block.x + away.x * (extent + 3.2),
      z: block.z + away.z * (extent + 3.2),
      y: 0.55,
      yaw: block.roadYaw,
      color: [0x5f6a70, 0x7c3028, 0x233d55, 0xc6b58d][cars.length % 4],
    });
  }

  const trees = [];
  for (const z of [108, 222]) for (let x = -305; x <= 305; x += 28) {
    if ([-245, 0, 235].some((bridgeX) => Math.abs(x - bridgeX) < 18)) continue;
    trees.push({ x: x + (rng() - 0.5) * 5, z: z + (rng() - 0.5) * 2.5, scale: 0.8 + rng() * 0.5 });
  }
  for (let x = -390; x <= 90; x += 44) {
    trees.push({ x: x + (rng() - 0.5) * 12, z: -330 + rng() * 16, scale: 0.9 + rng() * 0.65 });
  }

  const busStops = [
    { id: 'station', x: 14, z: -30, yaw: 0 },
    { id: 'hongdae', x: -210, z: -130, yaw: Math.PI * 0.5 },
    { id: 'market', x: 190, z: 32, yaw: Math.PI * 0.5 },
    { id: 'hills', x: -200, z: -270, yaw: Math.PI * 0.5 },
    { id: 'hangang', x: -90, z: 108, yaw: Math.PI * 0.5 },
    { id: 'pocha', x: 342, z: 214, yaw: 0 },
  ];

  // Network markings moved to expanse-road-art.js, where lane count, road
  // width, intersections and curbs are generated as one authoritative layer.
  const markings = [];

  return { buildings, cars, trees, busStops, markings };
}

function normalizedCollisionBox(width, height, depth, matrix) {
  const source = new THREE.BoxGeometry(width, height, depth);
  source.applyMatrix4(matrix);
  const geometry = source.toNonIndexed();
  source.dispose();
  geometry.deleteAttribute('uv');
  return geometry;
}

function facadeMaps(base, glow, seed) {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const emit = document.createElement('canvas');
  emit.width = emit.height = size;
  const ectx = emit.getContext('2d');
  const rng = rngFrom(seed);
  ctx.fillStyle = cssHex(base);
  ctx.fillRect(0, 0, size, size);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, size, size);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) {
    const x = 10 + col * 37;
    const y = 10 + row * 29;
    const lit = rng() > 0.55;
    const color = lit ? (rng() > 0.4 ? '#d8b979' : '#75aeb5') : '#263039';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 24, 14);
    if (lit) { ectx.fillStyle = color; ectx.fillRect(x, y, 24, 14); }
  }
  ctx.fillStyle = cssHex(glow);
  ctx.fillRect(0, 178, size, 5);
  ectx.fillStyle = '#614522';
  ectx.fillRect(0, 178, size, 5);
  const map = new THREE.CanvasTexture(canvas);
  const emissiveMap = new THREE.CanvasTexture(emit);
  for (const texture of [map, emissiveMap]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
  }
  return { map, emissiveMap };
}

export function buildExpanseStreetLife(group, layout) {
  const life = generateExpanseStreetLife(layout);
  const root = new THREE.Group();
  root.name = 'expanse_density_and_street_life';
  group.add(root);
  const visualChunks = buildExpanseVisualChunks(root, layout.bounds, 4, 3);
  const collisionParts = [];
  const emissiveMaterials = [];
  const streetlightAnchors = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.03, vertexColors: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.16, vertexColors: true });
  const facadeMaterials = DISTRICT_BASE.map((base, district) => {
    const maps = facadeMaps(base, DISTRICT_GLOW[district], 0x7200 + district);
    const material = new THREE.MeshStandardMaterial({
      map: maps.map, emissiveMap: maps.emissiveMap, emissive: 0xffffff,
      emissiveIntensity: 1, roughness: 0.78, metalness: 0.04,
    });
    emissiveMaterials.push(material);
    return material;
  });

  for (const chunk of visualChunks.chunks) {
    const chunkRecords = life.buildings.filter((record) => chunkAt(visualChunks, record.x, record.z).id === chunk.id);
    if (!chunkRecords.length) continue;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, chunkRecords.length);
    body.name = `expanse_secondary_bodies_${chunk.id}`;
    const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roofMat, chunkRecords.length);
    roofs.name = `expanse_secondary_roofs_${chunk.id}`;
    chunkRecords.forEach((record, i) => {
      body.setMatrixAt(i, matrix.compose(
        position.set(record.x, record.h * 0.5, record.z),
        quaternion.identity(), scale.set(record.sx, record.h, record.sz),
      ));
      body.setColorAt(i, new THREE.Color(DISTRICT_BASE[record.district]));
      roofs.setMatrixAt(i, matrix.compose(
        position.set(record.x, record.h + 0.24, record.z),
        quaternion.identity(), scale.set(record.sx * 0.92, 0.48, record.sz * 0.92),
      ));
      roofs.setColorAt(i, new THREE.Color(record.district === 0 ? 0x29463b : 0x34373a));
      collisionParts.push(normalizedCollisionBox(record.sx, record.h, record.sz,
        new THREE.Matrix4().makeTranslation(record.x, record.h * 0.5, record.z)));
    });
    for (const mesh of [body, roofs]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    chunk.base.add(body);
    chunk.detail.add(roofs);
    for (let district = 0; district < 6; district++) {
      const records = chunkRecords.filter((record) => record.district === district);
      if (!records.length) continue;
      const facades = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), facadeMaterials[district], records.length);
      facades.name = `expanse_secondary_facades_${chunk.id}_${district}`;
      records.forEach((record, i) => {
        const extent = record.normal.x ? record.sx * 0.5 : record.sz * 0.5;
        const width = record.normal.x ? record.sz : record.sx;
        facades.setMatrixAt(i, matrix.compose(
          position.set(record.x, record.h * 0.5, record.z).addScaledVector(record.normal, extent + 0.012),
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(record.normal.x, record.normal.z)),
          scale.set(width, record.h * 0.92, 1),
        ));
      });
      facades.instanceMatrix.needsUpdate = true;
      facades.computeBoundingSphere();
      chunk.detail.add(facades);
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.42, 3.4, 7);
  const crownGeometry = new THREE.DodecahedronGeometry(2.2, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4c3524, roughness: 0.96 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x315840, roughness: 0.94 });
  for (const chunk of visualChunks.chunks) {
    const records = life.trees.filter((tree) => chunkAt(visualChunks, tree.x, tree.z).id === chunk.id);
    if (!records.length) continue;
    const treeTrunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, records.length);
    const treeCrowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, records.length);
    records.forEach((tree, i) => {
      treeTrunks.setMatrixAt(i, matrix.compose(position.set(tree.x, 1.7, tree.z), quaternion.identity(), scale.set(tree.scale, tree.scale, tree.scale)));
      treeCrowns.setMatrixAt(i, matrix.compose(position.set(tree.x, 4.4 * tree.scale, tree.z), quaternion.identity(), scale.set(tree.scale, tree.scale, tree.scale)));
    });
    treeTrunks.instanceMatrix.needsUpdate = treeCrowns.instanceMatrix.needsUpdate = true;
    treeTrunks.computeBoundingSphere(); treeCrowns.computeBoundingSphere();
    chunk.detail.add(treeTrunks, treeCrowns);
  }

  const carBodyGeometry = new THREE.BoxGeometry(2, 0.7, 4.2);
  const carCabinGeometry = new THREE.BoxGeometry(1.65, 0.58, 2.15);
  const carBodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.38, vertexColors: true });
  const carCabinMaterial = new THREE.MeshStandardMaterial({ color: 0x26353d, roughness: 0.3, metalness: 0.5 });
  life.cars.forEach((car) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
    const carMatrix = new THREE.Matrix4().compose(new THREE.Vector3(car.x, 0.48, car.z), q, new THREE.Vector3(1, 1, 1));
    collisionParts.push(normalizedCollisionBox(2, 0.95, 4.2, carMatrix));
  });
  for (const chunk of visualChunks.chunks) {
    const records = life.cars.filter((car) => chunkAt(visualChunks, car.x, car.z).id === chunk.id);
    if (!records.length) continue;
    const carBodies = new THREE.InstancedMesh(carBodyGeometry, carBodyMaterial, records.length);
    const carCabins = new THREE.InstancedMesh(carCabinGeometry, carCabinMaterial, records.length);
    records.forEach((car, i) => {
      const q = quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
      carBodies.setMatrixAt(i, matrix.compose(position.set(car.x, 0.48, car.z), q, scale.set(1, 1, 1)));
      carBodies.setColorAt(i, new THREE.Color(car.color));
      carCabins.setMatrixAt(i, matrix.compose(position.set(car.x, 1.05, car.z), q, scale.set(1, 1, 1)));
    });
    carBodies.instanceMatrix.needsUpdate = carCabins.instanceMatrix.needsUpdate = true;
    if (carBodies.instanceColor) carBodies.instanceColor.needsUpdate = true;
    carBodies.computeBoundingSphere(); carCabins.computeBoundingSphere();
    chunk.detail.add(carBodies, carCabins);
  }

  const shelterMat = new THREE.MeshStandardMaterial({ color: 0x47545b, roughness: 0.58, metalness: 0.46 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x75a9b8, transparent: true, opacity: 0.32, roughness: 0.18, metalness: 0.15, side: THREE.DoubleSide });
  for (const stop of life.busStops) {
    const shelter = new THREE.Group();
    shelter.name = `expanse_bus_stop_${stop.id}`;
    shelter.position.set(stop.x, 0, stop.z);
    shelter.rotation.y = stop.yaw;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 1.65), shelterMat);
    roof.position.y = 2.8;
    const back = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.12), glassMat);
    back.position.set(0, 1.45, 0.72);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.65), shelterMat);
    bench.position.set(0, 0.62, 0.25);
    shelter.add(roof, back, bench);
    chunkAt(visualChunks, stop.x, stop.z).detail.add(shelter);
    shelter.updateMatrix();
    const world = shelter.matrix;
    const benchMatrix = new THREE.Matrix4().multiplyMatrices(world, new THREE.Matrix4().makeTranslation(0, 0.62, 0.25));
    collisionParts.push(normalizedCollisionBox(2.8, 1.0, 0.65, benchMatrix));
    streetlightAnchors.push({ position: new THREE.Vector3(stop.x, 0, stop.z), lamp: 0xbdefff, glow: NEON.cyan });
  }

  const markingMat = new THREE.MeshBasicMaterial({ color: SURFACES.asphaltMark, toneMapped: true, fog: true });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xd6b65b, toneMapped: true, fog: true });
  for (const chunk of visualChunks.chunks) for (const ring of [false, true]) {
    const records = life.markings.filter((mark) => mark.ring === ring && chunkAt(visualChunks, mark.x, mark.z).id === chunk.id);
    if (!records.length) continue;
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(ring ? 0.18 : 0.14, 0.026, ring ? 5 : 3.5), ring ? ringMat : markingMat, records.length);
    records.forEach((mark, i) => marks.setMatrixAt(i, matrix.compose(
      position.set(mark.x, mark.y, mark.z),
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mark.yaw), scale.set(1, 1, 1),
    )));
    marks.instanceMatrix.needsUpdate = true;
    marks.computeBoundingSphere();
    chunk.micro.add(marks);
  }

  const bollards = [];
  for (const z of [116, 214]) for (let x = -310; x <= 310; x += 12) {
    if ([-245, 0, 235].some((bridgeX) => Math.abs(x - bridgeX) < 12)) continue;
    bollards.push({ x, z });
  }
  const bollardGeometry = new THREE.CylinderGeometry(0.12, 0.16, 0.85, 8);
  const bollardMaterial = new THREE.MeshStandardMaterial({ color: 0xb6b3a9, roughness: 0.68, metalness: 0.32 });
  for (const chunk of visualChunks.chunks) {
    const records = bollards.filter((item) => chunkAt(visualChunks, item.x, item.z).id === chunk.id);
    if (!records.length) continue;
    const bollardMesh = new THREE.InstancedMesh(bollardGeometry, bollardMaterial, records.length);
    records.forEach((item, i) => bollardMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(item.x, 0.43, item.z)));
    bollardMesh.instanceMatrix.needsUpdate = true;
    bollardMesh.computeBoundingSphere();
    chunk.micro.add(bollardMesh);
  }

  return {
    group: root,
    records: life,
    visualChunks,
    collisionParts,
    emissiveMaterials,
    streetlightAnchors,
    stats: {
      secondaryBuildings: life.buildings.length,
      trees: life.trees.length,
      parkedCars: life.cars.length,
      busStops: life.busStops.length,
      roadMarks: life.markings.length,
    },
  };
}
