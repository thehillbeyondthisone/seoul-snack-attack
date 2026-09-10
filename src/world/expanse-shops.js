// Fixed Seoul Expanse restaurant bindings and compact roadside storefronts.
// The generator is pure data so the runtime and Node route gate share the
// exact same shop transforms.
import * as THREE from 'three';
import { RESTAURANTS } from '../game/data/restaurants.js';

const EPS = 1e-6;
const SHOP_BINDINGS = Object.freeze([
  { id: 'gilgeori',  edgeId: 'ring_north_w',   fraction: 0.58, side:  1, color: 0xffc857 },
  { id: 'chimaek',   edgeId: 'hongdae_w',      fraction: 0.56, side: -1, color: 0xff4f87 },
  { id: 'hotteok',   edgeId: 'spine_station',  fraction: 0.54, side:  1, color: 0xff9f43 },
  { id: 'gimbap',    edgeId: 'spine_market',   fraction: 0.68, side: -1, color: 0x69e0b7 },
  { id: 'bingsu',    edgeId: 'spine_northbank', fraction: 0.54, side: 1, color: 0x61d8ff },
  { id: 'tteokbokki', edgeId: 'market_e',      fraction: 0.42, side: -1, color: 0xff674d },
  { id: 'eomuk',     edgeId: 'market_s_e',     fraction: 0.62, side:  1, color: 0xffb36b },
  { id: 'pocha',     edgeId: 'southbank_w',    fraction: 0.47, side: -1, color: 0x8bd3ff },
]);

function samplePolyline(points, fraction) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = points[i - 1].distanceTo(points[i]);
    lengths.push(length);
    total += length;
  }
  let target = THREE.MathUtils.clamp(fraction, 0, 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const a = points[i];
      const b = points[i + 1];
      const t = lengths[i] > EPS ? THREE.MathUtils.clamp(target / lengths[i], 0, 1) : 0;
      const center = a.clone().lerp(b, t);
      const direction = b.clone().sub(a).setY(0).normalize();
      return { center, direction, progress: fraction };
    }
    target -= lengths[i];
  }
  return null;
}

export function generateExpanseShops(layout) {
  const byEdge = new Map(layout.edges.map((edge) => [edge.id, edge]));
  const byRestaurant = new Map(RESTAURANTS.map((restaurant) => [restaurant.id, restaurant]));
  return SHOP_BINDINGS.map((binding) => {
    const edge = byEdge.get(binding.edgeId);
    const restaurant = byRestaurant.get(binding.id);
    if (!edge || !restaurant) throw new Error(`Invalid Expanse shop binding: ${binding.id}/${binding.edgeId}`);
    const sample = samplePolyline(edge.points, binding.fraction);
    if (!sample) throw new Error(`Empty Expanse shop edge: ${binding.edgeId}`);
    const normal = new THREE.Vector3(-sample.direction.z, 0, sample.direction.x);
    const pickupOffset = Math.min(edge.width * 0.31, edge.width * 0.5 - 1.4);
    const facadeOffset = edge.width * 0.5 + 2.7;
    const point = sample.center.clone().addScaledVector(normal, binding.side * pickupOffset);
    const facadePoint = sample.center.clone().addScaledVector(normal, binding.side * facadeOffset);
    point.y += 0.06;
    return {
      ...binding,
      district: edge.district,
      districtId: edge.districtId,
      nameKo: restaurant.nameKo,
      nameEn: restaurant.nameEn,
      point,
      position: sample.center.clone(),
      roadPoint: sample.center.clone(),
      facadePoint,
      direction: sample.direction,
      toStreet: normal.clone().multiplyScalar(-binding.side),
      progress: binding.fraction,
      heading: Math.atan2(sample.direction.x, sample.direction.z),
      tile: 0,
    };
  });
}

function makeSignTexture(shop) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#071019';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `#${shop.color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#fff6dd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 60px sans-serif';
  ctx.fillText(shop.nameKo, canvas.width / 2, 72);
  ctx.fillStyle = '#c8d8df';
  ctx.font = '600 28px sans-serif';
  ctx.fillText(shop.nameEn.toUpperCase(), canvas.width / 2, 138);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

export function buildExpanseShops(parent, layout) {
  const shops = generateExpanseShops(layout);
  const group = new THREE.Group();
  group.name = 'expanse_fixed_restaurants';
  parent.add(group);
  const emissiveMaterials = [];
  const streetlightAnchors = [];

  for (const shop of shops) {
    const root = new THREE.Group();
    root.name = `restaurant_${shop.id}`;
    root.position.copy(shop.facadePoint);
    root.rotation.y = Math.atan2(shop.direction.x, shop.direction.z) - Math.PI / 2;

    const shellMat = new THREE.MeshStandardMaterial({ color: 0x16232b, roughness: 0.8, metalness: 0.12 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: shop.color,
      emissive: shop.color,
      emissiveIntensity: 0.65,
      roughness: 0.45,
      metalness: 0.08,
    });
    // Keep this practical trim below the citywide neon boost. The shared
    // day/night controller deliberately retunes registered façade materials,
    // but applying that value to these broad awnings washes out their shape.
    const shell = new THREE.Mesh(new THREE.BoxGeometry(9, 4.6, 1.2), shellMat);
    shell.position.y = 2.3;
    root.add(shell);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.15, 1.45), shellMat);
    counter.position.set(0, 1.05, shop.side > 0 ? -0.25 : 0.25);
    root.add(counter);
    const counterGlow = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.16, 1.52), accentMat);
    counterGlow.position.set(0, 1.58, shop.side > 0 ? -0.25 : 0.25);
    root.add(counterGlow);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.28, 2.8), accentMat);
    canopy.position.set(0, 3.2, shop.side > 0 ? -0.7 : 0.7);
    root.add(canopy);

    const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(shop), toneMapped: false, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.1), signMat);
    sign.position.set(0, 4.35, shop.side > 0 ? -0.62 : 0.62);
    sign.rotation.y = shop.side > 0 ? Math.PI : 0;
    root.add(sign);

    for (const x of [-3.8, 3.8]) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 7), accentMat);
      lantern.position.set(x, 3.2, shop.side > 0 ? -1.25 : 1.25);
      root.add(lantern);
    }
    group.add(root);
    streetlightAnchors.push({
      position: shop.facadePoint.clone().addScaledVector(shop.toStreet, 1.1),
      lamp: shop.color,
      glow: shop.color,
    });
  }
  return { pickupSites: shops, emissiveMaterials, streetlightAnchors, stats: { shops: shops.length } };
}
