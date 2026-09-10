// Browser-side bridge between the authored Seoul Expanse GLB and the runtime.
// The source asset was exported from a Z-up Blender scene even though its JSON
// contract is Y-up.  We bake that one axis conversion here, then batch the
// useful visual meshes so the richer blueprint does not cost 2,000 draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESTAURANTS } from '../game/data/restaurants.js';

const VISUAL_URL = new URL(
  '../../_source-assets/world/seoul-expanse/seoul-expanse-visual.glb',
  import.meta.url,
).href;

const SHOP_COLORS = Object.freeze({
  tteokbokki: 0xff674d,
  hotteok: 0xff9f43,
  eomuk: 0xffb36b,
  gimbap: 0x69e0b7,
  chimaek: 0xff4f87,
  bingsu: 0x61d8ff,
  gilgeori: 0xffc857,
  pocha: 0x8bd3ff,
});

function renderCategory(name) {
  return /^CHUNK_.*__(?:bldg|roof)_/.test(name)
    || /^LANDMARK__/.test(name)
    || /^PROP__/.test(name)
    || /^SIDEWALK__/.test(name);
}

function collisionGeometry(source) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return geometry;
}

function segmentIntersectsRect(a, b, rect) {
  let low = 0;
  let high = 1;
  const clip = (origin, delta, min, max) => {
    if (Math.abs(delta) < 1e-8) return origin >= min && origin <= max;
    let enter = (min - origin) / delta;
    let exit = (max - origin) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    low = Math.max(low, enter);
    high = Math.min(high, exit);
    return low <= high;
  };
  return clip(a.x, b.x - a.x, rect.minX, rect.maxX)
    && clip(a.z, b.z - a.z, rect.minZ, rect.maxZ);
}

function buildingClearsRoads(geometry, layout) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  for (const edge of layout.edges) {
    const padding = edge.width * 0.5 + 0.65;
    const rect = {
      minX: box.min.x - padding,
      maxX: box.max.x + padding,
      minZ: box.min.z - padding,
      maxZ: box.max.z + padding,
    };
    for (let i = 1; i < edge.points.length; i++) {
      if (segmentIntersectsRect(edge.points[i - 1], edge.points[i], rect)) return false;
    }
  }
  return true;
}

/** Load, axis-correct and batch the original richer Expanse massing. */
export async function loadRichExpanseArt(parent, layout) {
  const gltf = await new GLTFLoader().loadAsync(VISUAL_URL);
  const source = gltf.scene;
  // Blender data is (x, map-z, -height). +90 degrees maps it to (x,height,map-z).
  source.rotation.x = Math.PI / 2;
  source.scale.set(layout.linearScale, layout.linearScale, 1);
  source.updateMatrixWorld(true);

  const batches = new Map();
  const blockers = [];
  let buildings = 0;
  let sourceMeshes = 0;
  source.traverse((object) => {
    if (!object.isMesh || !renderCategory(object.name)) return;
    sourceMeshes++;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // The authored kit uses one material per primitive. Multi-material meshes
    // are rare; retaining them unbatched is safer than losing their groups.
    if (materials.length !== 1 || object.geometry.groups.length > 1) {
      const mesh = object.clone();
      mesh.geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      parent.add(mesh);
      return;
    }
    const baked = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const material = materials[0];
    const signature = `${material.uuid}:${Object.keys(baked.attributes).sort().join(',')}:${baked.index ? 'i' : 'n'}`;
    if (!batches.has(signature)) batches.set(signature, { material, geometries: [] });
    batches.get(signature).geometries.push(baked);

    if (/^CHUNK_.*__bldg_/.test(object.name)) {
      buildings++;
      // Widening roads after the source GLB was built consumes a few original
      // setbacks. Keep those façades as visual massing, but never let an old
      // box collider form an invisible pinch point in the new carriageway.
      if (buildingClearsRoads(baked, layout)) blockers.push(collisionGeometry(baked));
    }
  });

  const group = new THREE.Group();
  group.name = 'expanse_authored_massing';
  const emissiveMaterials = [];
  let drawCalls = 0;
  for (const { material, geometries } of batches.values()) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `expanse_batch_${material.name || drawCalls}`;
    mesh.frustumCulled = true;
    group.add(mesh);
    drawCalls++;
    if (material.emissive || /lamp|sign|glass/i.test(material.name || '')) emissiveMaterials.push(material);
  }
  parent.add(group);
  return { group, blockers, emissiveMaterials, buildings, sourceMeshes, drawCalls };
}

function makeSignTexture(shop) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#071019';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `#${shop.color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = '#fff6dd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 48px sans-serif';
  ctx.fillText(shop.nameKo, canvas.width / 2, 60);
  ctx.fillStyle = '#c8d8df';
  ctx.font = '600 23px sans-serif';
  ctx.fillText(shop.nameEn.toUpperCase(), canvas.width / 2, 116);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function siteFromMarker(marker, graph) {
  const projection = graph.project(marker.position);
  if (!projection) throw new Error(`Rich Expanse pickup ${marker.id} is not near a routeable edge`);
  const edge = graph.edgeById.get(projection.edgeId);
  const direction = new THREE.Vector3(Math.sin(projection.heading), 0, Math.cos(projection.heading));
  const normal = new THREE.Vector3(-direction.z, 0, direction.x);
  const side = marker.position.clone().sub(projection.position).dot(normal) >= 0 ? 1 : -1;
  const pickupOffset = Math.max(2.2, Math.min(edge.width * 0.32, edge.width * 0.5 - 1.5));
  const facadeOffset = edge.width * 0.5 + 3.2;
  const restaurant = RESTAURANTS.find((item) => item.id === marker.id);
  return {
    id: marker.id,
    color: SHOP_COLORS[marker.id] || 0xffc857,
    district: marker.district,
    districtId: marker.districtId,
    nameKo: restaurant?.nameKo || marker.id,
    nameEn: restaurant?.nameEn || marker.id,
    edgeId: projection.edgeId,
    progress: projection.progress,
    point: projection.position.clone().addScaledVector(normal, side * pickupOffset),
    position: projection.position.clone(),
    roadPoint: projection.position.clone(),
    facadePoint: projection.position.clone().addScaledVector(normal, side * facadeOffset),
    direction,
    toStreet: normal.clone().multiplyScalar(-side),
    heading: projection.heading,
    side,
    tile: 0,
  };
}

/** Build named pickup sites from the immutable blueprint markers. */
export function buildRichExpanseShops(parent, layout, graph) {
  const pickupSites = layout.pickups.map((marker) => siteFromMarker(marker, graph));
  const group = new THREE.Group();
  group.name = 'expanse_rich_restaurants';
  parent.add(group);
  const emissiveMaterials = [];
  const streetlightAnchors = [];

  for (const shop of pickupSites) {
    const root = new THREE.Group();
    root.name = `restaurant_${shop.id}`;
    root.position.copy(shop.facadePoint);
    root.rotation.y = Math.atan2(shop.direction.x, shop.direction.z) - Math.PI / 2;
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(9, 4.8, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x15232b, roughness: 0.82, metalness: 0.1 }),
    );
    shell.position.y = 2.4;
    root.add(shell);
    const glow = new THREE.MeshStandardMaterial({
      color: shop.color, emissive: shop.color, emissiveIntensity: 0.7,
      roughness: 0.42, metalness: 0.08,
    });
    emissiveMaterials.push(glow);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.3, 2.9), glow);
    canopy.position.set(0, 3.25, shop.side > 0 ? -0.7 : 0.7);
    root.add(canopy);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 2.1),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(shop), toneMapped: false, side: THREE.DoubleSide }),
    );
    sign.position.set(0, 4.45, shop.side > 0 ? -0.78 : 0.78);
    sign.rotation.y = shop.side > 0 ? Math.PI : 0;
    root.add(sign);
    group.add(root);
    streetlightAnchors.push({
      position: shop.facadePoint.clone().addScaledVector(shop.toStreet, 1.2),
      lamp: shop.color,
      glow: shop.color,
    });
  }
  return { pickupSites, group, emissiveMaterials, streetlightAnchors, stats: { shops: pickupSites.length } };
}

/** Convert authored drop-off markers to curb-side, routeable order anchors. */
export function createRichDeliveryAnchors(layout, graph) {
  return layout.dropoffs.map((marker) => {
    const projection = graph.project(marker.position);
    if (!projection) throw new Error(`Rich Expanse drop-off ${marker.id} is not near a routeable edge`);
    const edge = graph.edgeById.get(projection.edgeId);
    const direction = new THREE.Vector3(Math.sin(projection.heading), 0, Math.cos(projection.heading));
    const normal = new THREE.Vector3(-direction.z, 0, direction.x);
    const side = marker.position.clone().sub(projection.position).dot(normal) >= 0 ? 1 : -1;
    const offset = Math.max(2.2, Math.min(edge.width * 0.32, edge.width * 0.5 - 1.5));
    return {
      id: marker.id,
      edgeId: projection.edgeId,
      progress: projection.progress,
      point: projection.position.clone().addScaledVector(normal, side * offset),
      position: projection.position.clone(),
      roadPoint: projection.position.clone(),
      heading: projection.heading + (side > 0 ? Math.PI : 0),
      side,
      district: marker.district,
      districtId: marker.districtId,
      tile: 0,
    };
  });
}

/** Ribbon geometry for the authored, gently curving Han channel. */
export function riverRibbonGeometry(river, y = 0.025) {
  const vertices = [];
  const points = river.centerline;
  for (let i = 0; i < points.length; i++) {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    const tangent = after.clone().sub(before).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const width = THREE.MathUtils.lerp(river.widthMin, river.widthMax, i / Math.max(1, points.length - 1));
    const left = points[i].clone().addScaledVector(normal, width * 0.5);
    const right = points[i].clone().addScaledVector(normal, -width * 0.5);
    left.y = y;
    right.y = y;
    vertices.push(left, right);
  }
  const positions = [];
  for (let i = 1; i < points.length; i++) {
    const pl = vertices[(i - 1) * 2];
    const pr = vertices[(i - 1) * 2 + 1];
    const nl = vertices[i * 2];
    const nr = vertices[i * 2 + 1];
    positions.push(pl.x, pl.y, pl.z, nr.x, nr.y, nr.z, nl.x, nl.y, nl.z);
    positions.push(pl.x, pl.y, pl.z, pr.x, pr.y, pr.z, nr.x, nr.y, nr.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
