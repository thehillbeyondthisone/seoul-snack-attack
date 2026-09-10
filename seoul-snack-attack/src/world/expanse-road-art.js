// Seoul Expanse road-art layer. Runtime visuals and Node validation share the
// pure record generator; approved road geometry, routing, grades and BVH stay
// untouched.
import * as THREE from 'three';
import { NEON, PAINT, SURFACES } from './data/color-bible.js';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const EPS = 1e-6;
export const EXPANSE_BRIDGE_STYLES = Object.freeze(['main-cable-stayed', 'west-steel-arch', 'east-riverside-truss']);

function segmentRecord(a, b, lateral = 0, width = 0.14, height = 0.028, insetStart = 0, insetEnd = 0) {
  const delta = b.clone().sub(a);
  const fullLength = delta.length();
  if (fullLength < EPS || fullLength <= insetStart + insetEnd) return null;
  const direction = delta.clone().normalize();
  const flat = delta.clone().setY(0).normalize();
  const normal = new THREE.Vector3(-flat.z, 0, flat.x);
  const start = a.clone().addScaledVector(direction, insetStart).addScaledVector(normal, lateral);
  const end = b.clone().addScaledVector(direction, -insetEnd).addScaledVector(normal, lateral);
  return {
    position: start.clone().lerp(end, 0.5).addScaledVector(UP, height * 0.5 + 0.052),
    quaternion: new THREE.Quaternion().setFromUnitVectors(FORWARD, end.clone().sub(start).normalize()),
    scale: new THREE.Vector3(width, height, start.distanceTo(end)),
  };
}

function pointAtDistance(edge, distance) {
  let remaining = THREE.MathUtils.clamp(distance, 0, edge.length);
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const length = a.distanceTo(b);
    if (remaining <= length || i === edge.points.length - 1) {
      const t = length > EPS ? THREE.MathUtils.clamp(remaining / length, 0, 1) : 0;
      return { point: a.clone().lerp(b, t), direction: b.clone().sub(a).normalize() };
    }
    remaining -= length;
  }
  return { point: edge.points[0].clone(), direction: FORWARD.clone() };
}

function shortRecord(edge, distance, lateral, width, length, transverse = false) {
  const sample = pointAtDistance(edge, distance);
  const flat = sample.direction.clone().setY(0).normalize();
  const normal = new THREE.Vector3(-flat.z, 0, flat.x);
  const direction = transverse ? normal : sample.direction;
  const center = sample.point.clone().addScaledVector(normal, lateral).add(new THREE.Vector3(0, 0.07, 0));
  return {
    position: center,
    quaternion: new THREE.Quaternion().setFromUnitVectors(FORWARD, direction.clone().normalize()),
    scale: new THREE.Vector3(width, 0.028, length),
  };
}

function addDashed(records, edge, offsets, spacing = 12, dashLength = 5) {
  for (let distance = 9; distance <= edge.length - 7; distance += spacing) {
    for (const offset of offsets) records.push(shortRecord(edge, distance, offset, 0.13, dashLength));
  }
}

function addRoadEdgeRecords(data, edge) {
  const half = edge.width * 0.5;
  const laneOffsets = edge.width >= 21 ? [-6.5, -3.25, 3.25, 6.5]
    : edge.width >= 17 ? [-4.35, 4.35]
      : edge.width >= 13 ? [-3.35, 3.35] : [];
  if (laneOffsets.length) addDashed(data.laneDashes, edge, laneOffsets);
  else addDashed(data.yellowDashes, edge, [0], 12, 5);

  for (let i = 1; i < edge.points.length; i++) {
    const insetStart = i === 1 ? 6 : 0;
    const insetEnd = i === edge.points.length - 1 ? 6 : 0;
    const a = edge.points[i - 1];
    const b = edge.points[i];
    if (edge.width >= 14) for (const offset of [-0.24, 0.24]) {
      const record = segmentRecord(a, b, offset, 0.11, 0.026, insetStart, insetEnd);
      if (record) data.centerLines.push(record);
    }
    for (const offset of [-(half - 0.75), half - 0.75]) {
      const record = segmentRecord(a, b, offset, 0.14, 0.026, insetStart, insetEnd);
      if (record) data.edgeLines.push(record);
    }
    for (const offset of [-(half + 0.24), half + 0.24]) {
      const record = segmentRecord(a, b, offset, 0.38, 0.18, insetStart, insetEnd);
      if (record) data.curbs.push(record);
    }
  }
  if (!edge.bridge) for (let distance = 18; distance < edge.length - 12; distance += 38) {
    for (const side of [-1, 1]) data.drains.push(shortRecord(edge, distance, side * (half - 0.62), 0.62, 1.8));
  }
}

function addIntersectionRecords(data, layout) {
  const degree = new Map(layout.nodes.map((node) => [node.id, 0]));
  for (const edge of layout.edges) {
    degree.set(edge.a, degree.get(edge.a) + 1);
    degree.set(edge.b, degree.get(edge.b) + 1);
  }
  for (const edge of layout.edges) {
    if (edge.bridge || edge.kind === 'ring') continue;
    if (degree.get(edge.a) >= 3) data.stopLines.push(shortRecord(edge, 7.5, 0, 0.32, edge.width - 1.8, true));
    if (degree.get(edge.b) >= 3) data.stopLines.push(shortRecord(edge, edge.length - 7.5, 0, 0.32, edge.width - 1.8, true));
  }
  for (const nodeId of ['station', 'spine_c', 'market_mid', 'west_cross', 'north_bank']) {
    const edge = layout.edges.find((candidate) => candidate.a === nodeId || candidate.b === nodeId);
    if (!edge) continue;
    const distance = edge.a === nodeId ? 10.5 : edge.length - 10.5;
    const half = edge.width * 0.5 - 1.2;
    for (let lateral = -half; lateral <= half; lateral += 1.25) {
      data.crosswalks.push(shortRecord(edge, distance, lateral, 0.68, 4.2));
    }
  }
}

export function generateExpanseRoadArt(layout) {
  const data = {
    centerLines: [], yellowDashes: [], laneDashes: [], edgeLines: [], curbs: [], drains: [],
    stopLines: [], crosswalks: [], edgeIds: [],
  };
  const edges = layout.edges.map((edge) => ({
    ...edge,
    length: edge.points.slice(1).reduce((sum, point, i) => sum + point.distanceTo(edge.points[i]), 0),
  }));
  for (const edge of edges) {
    data.edgeIds.push(edge.id);
    addRoadEdgeRecords(data, edge);
  }
  addIntersectionRecords(data, { ...layout, edges });
  return data;
}

function instancedRecords(parent, name, geometry, material, records) {
  if (!records.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  mesh.name = name;
  const matrix = new THREE.Matrix4();
  records.forEach((record, i) => mesh.setMatrixAt(i, matrix.compose(record.position, record.quaternion, record.scale)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

function roadTextTexture(ko, en) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8ede7';
  ctx.font = '900 190px sans-serif';
  ctx.fillText(ko, 512, 135);
  ctx.fillStyle = '#d7c35d';
  ctx.font = '800 72px sans-serif';
  ctx.fillText(en, 512, 298);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addRoadText(parent, layout, edgeId, fraction, ko, en, width = 13) {
  const edge = layout.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return;
  const sample = pointAtDistance(edge, edge.length * fraction);
  const heading = Math.atan2(sample.direction.x, sample.direction.z);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.38), new THREE.MeshBasicMaterial({
    map: roadTextTexture(ko, en), transparent: true, depthWrite: false, toneMapped: true, fog: true,
  }));
  mesh.name = `expanse_road_text_${edgeId}`;
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = heading;
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.PI;
  mesh.position.copy(sample.point).add(new THREE.Vector3(0, 0.095, 0));
  parent.add(mesh);
}

function boxRecord(size, position) {
  return {
    position: new THREE.Vector3(...position),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(...size),
  };
}

function segmentMatrix(a, b, radius = 0.055) {
  const delta = b.clone().sub(a);
  return new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, delta.clone().normalize()),
    new THREE.Vector3(radius, delta.length(), radius),
  );
}

function instancedSegments(parent, name, material, segments, sides = 7) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, sides), material, segments.length);
  mesh.name = name;
  segments.forEach((segment, i) => mesh.setMatrixAt(i, segmentMatrix(segment.a, segment.b, segment.radius)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
}

function addNortheastTunnel(root, emissiveMaterials) {
  const tunnel = new THREE.Group();
  tunnel.name = 'expanse_roadart_ne_tunnel';
  root.add(tunnel);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3c4245, roughness: 0.9, metalness: 0.06 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x171d20, roughness: 0.82, metalness: 0.12 });
  const light = new THREE.MeshStandardMaterial({ color: 0xffd39a, emissive: 0xff9b45, emissiveIntensity: 0.72, roughness: 0.35 });
  emissiveMaterials.push(light);
  const concreteBoxes = [
    ...[403.5, 426.5].map((x) => boxRecord([2.4, 8.5, 62], [x, 4.25, -135])),
    boxRecord([27.5, 2.0, 2.0], [415, 8.9, -166]),
  ];
  const lightBoxes = [];
  for (const z of [-164, -151, -138, -125, -112]) {
    concreteBoxes.push(boxRecord([25.8, 0.55, 0.75], [415, 8.25, z]));
    for (const x of [409, 421]) lightBoxes.push(boxRecord([3.8, 0.12, 0.32], [x, 8.0, z + 1.2]));
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  instancedRecords(tunnel, 'ne_tunnel_concrete', unitBox, concrete, concreteBoxes);
  instancedRecords(tunnel, 'ne_tunnel_ceiling', unitBox, inner, [boxRecord([25.4, 1.4, 62], [415, 9.1, -135])]);
  instancedRecords(tunnel, 'ne_tunnel_strip_lights', unitBox, light, lightBoxes);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.4), new THREE.MeshBasicMaterial({
    map: roadTextTexture('북악터널', 'BUKAK TUNNEL'), transparent: true, toneMapped: false,
  }));
  portal.name = 'ne_tunnel_bilingual_portal';
  portal.position.set(415, 7.1, -167.05);
  portal.rotation.y = Math.PI;
  tunnel.add(portal);
}

function addBridgeIdentities(root, emissiveMaterials) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x46535a, roughness: 0.48, metalness: 0.62 });
  const cyan = new THREE.MeshStandardMaterial({ color: NEON.cyan, emissive: 0x2b8fa3, emissiveIntensity: 0.38, roughness: 0.32, metalness: 0.38 });
  const archMat = new THREE.MeshStandardMaterial({ color: 0xa75a38, emissive: 0x3b1108, emissiveIntensity: 0.22, roughness: 0.52, metalness: 0.48 });
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x668276, roughness: 0.56, metalness: 0.58 });
  emissiveMaterials.push(cyan, archMat);

  const main = new THREE.Group(); main.name = 'expanse_bridge_main_cable_stayed'; root.add(main);
  const stays = [];
  const mainSteel = [];
  for (const z of [153, 207]) {
    for (const x of [-11.5, 11.5]) mainSteel.push(boxRecord([1.35, 22, 1.8], [x, 11, z]));
    mainSteel.push(boxRecord([24.4, 1.2, 1.6], [0, 20.5, z]));
    for (const x of [-11.5, 11.5]) for (const deckZ of [z - 36, z - 22, z + 22, z + 36]) {
      stays.push({ a: new THREE.Vector3(x, 20, z), b: new THREE.Vector3(x, 1.4, deckZ), radius: 0.075 });
    }
  }
  instancedRecords(main, 'main_bridge_steel_pylons', new THREE.BoxGeometry(1, 1, 1), steel, mainSteel);
  instancedSegments(main, 'main_bridge_stay_cables', cyan, stays);

  const west = new THREE.Group(); west.name = 'expanse_bridge_west_steel_arch'; root.add(west);
  const archSegments = [];
  for (const x of [-253.2, -236.8]) {
    let previous = null;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const z = THREE.MathUtils.lerp(124, 224, t);
      const y = 2.1 + Math.sin(t * Math.PI) * 13;
      const point = new THREE.Vector3(x, y, z);
      if (previous) archSegments.push({ a: previous, b: point, radius: 0.16 });
      if (i > 0 && i < 12 && i % 2 === 0) archSegments.push({ a: point, b: new THREE.Vector3(x, 1.25, z), radius: 0.065 });
      previous = point;
    }
  }
  instancedSegments(west, 'west_bridge_arch_and_hangers', archMat, archSegments, 9);

  const east = new THREE.Group(); east.name = 'expanse_bridge_east_riverside_truss'; root.add(east);
  const truss = [];
  for (const x of [227.0, 243.0]) for (let z = 125; z < 225; z += 12.5) {
    const a = new THREE.Vector3(x, 1.4, z);
    const b = new THREE.Vector3(x, 6.4, z + 6.25);
    const c = new THREE.Vector3(x, 1.4, z + 12.5);
    truss.push({ a, b, radius: 0.12 }, { a: b, b: c, radius: 0.12 }, { a, b: c, radius: 0.1 });
  }
  instancedSegments(east, 'east_bridge_triangular_truss', trussMat, truss, 8);
}

export function buildExpanseRoadArt(parent, layout) {
  const root = new THREE.Group();
  root.name = 'expanse_complete_road_art';
  parent.add(root);
  const data = generateExpanseRoadArt(layout);
  const white = new THREE.MeshBasicMaterial({ color: SURFACES.asphaltMark, toneMapped: true, fog: true });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xd5b843, toneMapped: true, fog: true });
  const curb = new THREE.MeshStandardMaterial({ color: PAINT.concrete, roughness: 0.92 });
  const drain = new THREE.MeshStandardMaterial({ color: 0x252c30, roughness: 0.55, metalness: 0.55 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  instancedRecords(root, 'expanse_double_yellow', unitBox, yellow, data.centerLines);
  instancedRecords(root, 'expanse_yellow_dashes', unitBox, yellow, data.yellowDashes);
  instancedRecords(root, 'expanse_lane_dashes', unitBox, white, data.laneDashes);
  instancedRecords(root, 'expanse_edge_lines', unitBox, white, data.edgeLines);
  instancedRecords(root, 'expanse_network_curbs', unitBox, curb, data.curbs);
  instancedRecords(root, 'expanse_drain_grates', unitBox, drain, data.drains);
  instancedRecords(root, 'expanse_stop_lines', unitBox, white, data.stopLines);
  instancedRecords(root, 'expanse_crosswalks', unitBox, white, data.crosswalks);
  for (const args of [
    ['ring_north_w', 0.48, '북악순환로', 'BUKAK RING', 15],
    ['cross_w', 0.54, '홍대입구', 'HONGDAE', 12],
    ['spine_station', 0.66, '서울역', 'SEOUL STATION', 13],
    ['market_e', 0.42, '호떡시장', 'HOTTEOK MARKET', 13],
    ['southbank_w', 0.42, '한강공원', 'HANGANG PARK', 13],
    ['pocha_link', 0.48, '포차거리', 'POCHA STREET', 11],
  ]) addRoadText(root, layout, ...args);

  const emissiveMaterials = [];
  addNortheastTunnel(root, emissiveMaterials);
  addBridgeIdentities(root, emissiveMaterials);
  return {
    group: root, emissiveMaterials, data,
    stats: {
      roadEdgesDressed: layout.edges.length,
      lineInstances: data.centerLines.length + data.yellowDashes.length + data.laneDashes.length + data.edgeLines.length,
      curbSegments: data.curbs.length,
      drainGrates: data.drains.length,
      stopLines: data.stopLines.length,
      crosswalkBars: data.crosswalks.length,
      tunnelInteriors: 1,
      bridgeSilhouettes: EXPANSE_BRIDGE_STYLES.length,
    },
  };
}
