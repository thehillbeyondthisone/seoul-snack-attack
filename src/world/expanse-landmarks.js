// Seoul Expanse rebuild — the five things you steer by.
//
// M5 of the rebuild. A kilometre of generated city has a real problem the
// greybox never had: every street corner is plausible and none of them is
// memorable, so a driver who looks up has nothing to navigate by and the
// mini-map becomes the only way to know where you are.
//
// `expanse-layout.js` already authored five anchors for exactly this — the
// station, the radio tower, the market hall, the river plaza and the pocha
// row — and until now nothing built anything at them.
//
// The rule this module follows, and the reason it is small:
//
//   **A landmark is a crown on a building that is already there.**
//
// It adds no footprint, claims no land and cannot collide with anything: the
// generators settled 1,211 plots against the pavement in M2 and M3, and a
// sixth pass dropping bespoke structures into that would either overlap a plot
// or need the whole city re-settled. So each anchor adopts the tallest
// building near it and wears a mast, a drum or a lit crown on its own roof.
// The host is picked from the massing records, which is why the same city
// always crowns the same five buildings.
import * as THREE from 'three';

/**
 * The five anchors, in the order `expanse-layout.js` authors them.
 *
 * `radius` is how far from the anchor a host may be found. It is generous on
 * purpose: the anchor is a point in a district, not a plot, and insisting on
 * the nearest building would crown whatever alley shed happens to sit on the
 * coordinate.
 */
export const EXPANSE_LANDMARKS = Object.freeze([
  {
    id: 'radioTower', anchor: 'radioTower', districtId: 'hills',
    nameKo: '북악 송신탑', nameEn: 'BUKAK RADIO TOWER',
    kind: 'mast', height: 46, radius: 110, color: 0xff5a4d,
  },
  {
    id: 'station', anchor: 'station', districtId: 'station',
    nameKo: '서울역 광장', nameEn: 'SEOUL STATION PLAZA',
    kind: 'crown', height: 15, radius: 110, color: 0xffd166,
  },
  {
    id: 'marketHall', anchor: 'marketHall', districtId: 'market',
    nameKo: '시장 회관', nameEn: 'MARKET HALL',
    kind: 'drum', height: 12, radius: 110, color: 0xff8a3d,
  },
  {
    id: 'riverPlaza', anchor: 'riverPlaza', districtId: 'hangang',
    nameKo: '한강 광장', nameEn: 'HANGANG PLAZA',
    kind: 'mast', height: 20, radius: 130, color: 0x61d8ff,
  },
  {
    id: 'pochaRow', anchor: 'pochaRow', districtId: 'pocha',
    nameKo: '포차 거리 아치', nameEn: 'POCHA ROW ARCH',
    kind: 'drum', height: 9, radius: 130, color: 0x8bd3ff,
  },
]);

/** Margin kept between a crown and the edge of the roof it stands on. */
const ROOF_MARGIN = 0.9;

/** A crown narrower than this reads as an aerial, not a landmark. */
const MIN_CROWN_SIDE = 1.6;

/**
 * A host has to be worth crowning. Scoring the roof rather than taking the
 * nearest building is what stops a 46 m mast landing on a 4 m alley shed.
 */
function hostScore(building, anchor) {
  const distance = Math.hypot(building.x - anchor.x, building.z - anchor.z);
  const roof = Math.min(building.width, building.depth);
  return building.top * 3 + roof * 2 - distance * 0.08;
}

/**
 * Adopt one host building per anchor and size its crown to that roof.
 *
 * @param {object} massing `generateExpanseMassing()` output.
 * @param {object} layout `generateExpanseLayout()` output, for the anchors.
 */
export function generateExpanseLandmarks(massing, layout) {
  const taken = new Set();
  const landmarks = EXPANSE_LANDMARKS.map((spec) => {
    const anchor = layout.landmarks?.[spec.anchor];
    if (!anchor) throw new Error(`Expanse landmark ${spec.id} has no layout anchor`);

    let host = null;
    let best = -Infinity;
    for (const building of massing.buildings) {
      if (taken.has(building.id)) continue;
      // The host must stand in the district the anchor names. Without this the
      // score walks: the radio tower is 106 m from the nearest tall building,
      // and that building is over the district line in the station quarter,
      // which puts "Bukak Radio Tower" in the wrong neighbourhood.
      if (building.districtId !== spec.districtId) continue;
      if (Math.hypot(building.x - anchor.x, building.z - anchor.z) > spec.radius) continue;
      const score = hostScore(building, anchor);
      if (score > best) { best = score; host = building; }
    }
    if (!host) throw new Error(`Expanse landmark ${spec.id} found no host within ${spec.radius} m`);
    taken.add(host.id);

    // The crown never oversails the roof it stands on, so nothing a landmark
    // adds can reach a pavement, a neighbour or a carriageway.
    const roof = Math.min(host.width, host.depth);
    const side = Math.max(MIN_CROWN_SIDE, roof - ROOF_MARGIN * 2);
    // A mast on a small roof is stayed down rather than left as a pencil.
    const height = spec.kind === 'mast'
      ? spec.height * Math.min(1, 0.45 + roof / 22)
      : spec.height * Math.min(1, 0.55 + roof / 18);

    return {
      ...spec,
      buildingId: host.id,
      district: host.district,
      hostDistrictId: host.districtId,
      x: host.x,
      z: host.z,
      base: host.top,
      height,
      peak: host.top + height,
      side,
      yaw: host.yaw,
      anchor: { x: anchor.x, z: anchor.z },
      anchorDistance: Math.hypot(host.x - anchor.x, host.z - anchor.z),
      hostTop: host.top,
      hostWidth: host.width,
      hostDepth: host.depth,
      position: new THREE.Vector3(host.x, host.top, host.z),
    };
  });

  return {
    landmarks,
    byId: new Map(landmarks.map((landmark) => [landmark.id, landmark])),
    stats: {
      landmarks: landmarks.length,
      tallest: Math.max(...landmarks.map((landmark) => landmark.peak)),
      shortest: Math.min(...landmarks.map((landmark) => landmark.peak)),
      furthestFromAnchor: Math.max(...landmarks.map((landmark) => landmark.anchorDistance)),
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/**
 * Build the five crowns.
 *
 * Everything is a lathe-free primitive on two shared materials, because five
 * landmarks are not worth a draw call each and a mast seen from 600 m is a
 * silhouette and a light, not a model.
 */
export function buildExpanseLandmarks(parent, landmarks) {
  const group = new THREE.Group();
  group.name = 'expanse2_landmarks';
  parent.add(group);

  const steel = new THREE.MeshStandardMaterial({ color: 0x2a333c, roughness: 0.62, metalness: 0.55 });
  const emissiveMaterials = [];
  const beacons = [];

  for (const landmark of landmarks.landmarks) {
    const root = new THREE.Group();
    root.name = `landmark_${landmark.id}`;
    root.position.set(landmark.x, landmark.base, landmark.z);
    root.rotation.y = landmark.yaw;

    const lit = new THREE.MeshStandardMaterial({
      color: landmark.color, emissive: landmark.color, emissiveIntensity: 1.15,
      roughness: 0.35, metalness: 0.1,
    });
    emissiveMaterials.push(lit);

    if (landmark.kind === 'mast') {
      const radius = Math.max(0.32, landmark.side * 0.16);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.42, radius, landmark.height, 6, 1, true), steel,
      );
      shaft.position.y = landmark.height * 0.5;
      root.add(shaft);
      // Two lit strips run the full height, and the bands and the beacon are
      // sized for the distance they are read at, not for the distance they are
      // modelled at. A 0.09 m torus on a 46 m mast is sub-pixel from the far
      // bank, which is exactly where a landmark has to work: the first pass
      // put a black pole on the skyline with a dot on top of it.
      for (const sx of [-1, 1]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, landmark.height * 0.94, 0.16), lit,
        );
        strip.position.set(sx * radius * 0.72, landmark.height * 0.47, 0);
        root.add(strip);
      }
      for (const t of [0.34, 0.62, 0.88]) {
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(radius * (1 - t * 0.4) + 0.3, 0.17, 6, 14).rotateX(Math.PI / 2), lit,
        );
        band.position.y = landmark.height * t;
        root.add(band);
      }
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.75, radius * 1.15), 10, 8), lit,
      );
      beacon.position.y = landmark.height + radius * 0.6;
      root.add(beacon);
    } else if (landmark.kind === 'drum') {
      const radius = Math.max(1.1, landmark.side * 0.42);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, landmark.height * 0.55, 6), steel,
      );
      post.position.y = landmark.height * 0.275;
      root.add(post);
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, landmark.height * 0.42, 14, 1, true), lit,
      );
      drum.position.y = landmark.height * 0.55 + landmark.height * 0.21;
      root.add(drum);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.12, landmark.height * 0.2, 14), steel);
      cap.position.y = landmark.height * 0.86;
      root.add(cap);
    } else {
      // 'crown' — a lit parapet ring and four corner pylons, for a building
      // that is a plaza frontage rather than a tower.
      const half = landmark.side * 0.5;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(half, 0.13, 6, 20).rotateX(Math.PI / 2), lit,
      );
      ring.position.y = landmark.height * 0.72;
      root.add(ring);
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const pylon = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, landmark.height * 0.78, 0.24), steel,
        );
        pylon.position.set(sx * half * 0.72, landmark.height * 0.39, sz * half * 0.72);
        root.add(pylon);
      }
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(half * 0.34, half * 0.46, landmark.height * 0.26, 8), lit,
      );
      lantern.position.y = landmark.height * 0.87;
      root.add(lantern);
    }

    group.add(root);
    beacons.push({
      position: new THREE.Vector3(landmark.x, landmark.peak, landmark.z),
      lamp: landmark.color,
      glow: landmark.color,
    });
  }

  return {
    group,
    landmarks: landmarks.landmarks,
    emissiveMaterials,
    beacons,
    materials: [steel, ...emissiveMaterials],
    stats: { landmarks: landmarks.landmarks.length },
  };
}
