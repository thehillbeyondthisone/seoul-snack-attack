// Authored storefront rows and restaurant-specific pickup anchors.
// Dressing is parented to city tile roots, so it inherits tile transforms and
// the existing distance culling without adding collision geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { STREET_ROWS_Z, DISTRICT_SEALS } from './city-constants.js';

const SHOP_URL = 'assets/district/storefronts.glb';
const DIORAMA_URL = 'assets/district/retro-arcade-diorama.glb';
const FACADE_URL = 'assets/district/textures/seoul-facade-weathered.webp';
const WINDOWS_URL = 'assets/district/textures/seoul-windows-night.webp';

const FACADE_TINTS = [
  0xfff3df, // warm plaster
  0xe5f0f2, // cool concrete
  0xf2e4d8, // faded terracotta wash
  0xe3eee8, // desaturated jade
  0xeee4ec, // old mauve paint
];

// Grid positions are normalized (0..1), so this remains stable if the district
// grows again. Slots run left-to-right across the six visible shop bays.
const SITE_LAYOUT = [
  { id: 'hongru',      grid: [0.00, 0.00], slot: 4, side: -1, ko: '서울 컵라면', en: 'CUP NOODLE LAB', color: '#ff4b32' },
  { id: 'bhc',         grid: [0.50, 0.00], slot: 2, side:  1, ko: '닭꼬치 포차', en: 'DAKGGOCHI STALL', color: '#ffd52a' },
  { id: 'sinjeon',     grid: [1.00, 0.00], slot: 1, side: -1, ko: '신전 떡볶이', en: 'TTEOKBOKKI', color: '#ff6638' },
  { id: 'jokbal',      grid: [0.17, 0.50], slot: 5, side:  1, ko: '쌈과 소주', en: 'SSAM & SOJU', color: '#ff9b36' },
  { id: 'bingsu',      grid: [0.83, 0.50], slot: 0, side: -1, ko: '서울 야간 편의점', en: 'NIGHT CONVENIENCE', color: '#58e8ff' },
  { id: 'pizzamaru',   grid: [0.00, 0.75], slot: 2, side:  1, ko: '한강 식료품', en: 'HANGANG GROCERY', color: '#7cff45' },
  { id: 'donkatsu',    grid: [0.50, 1.00], slot: 3, side: -1, ko: '경양식 돈까스', en: 'DONKATSU', color: '#ffca55' },
  { id: 'budae',       grid: [1.00, 1.00], slot: 4, side:  1, ko: '부대찌개 키트', en: 'ARMY STEW KITS', color: '#ff463e' },
  { id: 'naengmyeon',  grid: [0.50, 0.50], slot: 5, side: -1, ko: '평양면옥', en: 'MYEONOK', color: '#73c9ff' },
];

function makeSign({ ko, en, color }) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(5, 7, 12, .94)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 82px sans-serif';
  ctx.fillText(ko, canvas.width / 2, 76);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#f6fbff';
  ctx.font = '600 28px sans-serif';
  ctx.fillText(en, canvas.width / 2, 145);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: true,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), material);
}

function configureTexture(texture, { repeat = 1, color = true } = {}) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeStorefrontDetails(site, { slotX, rowY, frontZ, inward }) {
  const group = new THREE.Group();
  group.name = `street_details_${site.id}`;
  const accent = new THREE.Color(site.color);
  const facing = site.side < 0 ? 0 : Math.PI;

  // The source row is an upper building shell: several of its six bays are
  // open below the lintel, so a sign placed over one of those bays reads as a
  // floating shop. Give every named restaurant its own ground-floor frontage.
  // This also hides small height differences between the authored shell and
  // the pavement without adding collision geometry to the street.
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x171c22, roughness: 0.72, metalness: 0.12,
  });
  const interiorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x18252b).lerp(accent, 0.12),
    emissive: accent,
    emissiveIntensity: 0.11,
    roughness: 0.34,
    metalness: 0.14,
  });
  const frontageZ = frontZ + inward * 0.12;
  const frontage = new THREE.Group();
  frontage.name = `grounded_frontage_${site.id}`;

  const backing = new THREE.Mesh(new THREE.BoxGeometry(3.62, 3.16, 0.18), frameMat);
  backing.position.set(slotX, rowY + 1.58, frontageZ);
  frontage.add(backing);

  const leftWindow = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.58, 0.055), interiorMat);
  leftWindow.position.set(slotX - 0.99, rowY + 1.34, frontageZ + inward * 0.12);
  frontage.add(leftWindow);
  const rightWindow = leftWindow.clone();
  rightWindow.position.x = slotX + 0.99;
  frontage.add(rightWindow);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.98, 0.06), interiorMat);
  door.position.set(slotX, rowY + 1.04, frontageZ + inward * 0.125);
  frontage.add(door);

  const transom = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.48, 0.055), interiorMat);
  transom.position.set(slotX, rowY + 2.82, frontageZ + inward * 0.12);
  frontage.add(transom);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(3.78, 0.20, 0.34),
    new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.3), roughness: 0.7, metalness: 0.08,
    })
  );
  plinth.name = `storefront_plinth_${site.id}`;
  plinth.position.set(slotX, rowY + 0.10, frontageZ + inward * 0.02);
  frontage.add(plinth);
  group.add(frontage);

  // A shallow canopy gives the flat facade a readable street-level silhouette
  // and catches rain/neon highlights without requiring another texture atlas.
  const canopyMat = new THREE.MeshStandardMaterial({
    color: accent.clone().multiplyScalar(0.38), roughness: 0.52, metalness: 0.08,
  });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.13, 1.25), canopyMat);
  canopy.position.set(slotX, rowY + 2.55, frontZ + inward * 0.58);
  group.add(canopy);

  // Menu A-board, delivery crates, and an outdoor condenser break up the blank
  // kerb line at the exact place where the player stops for food.
  const dark = frameMat;
  const paper = new THREE.MeshStandardMaterial({
    color: accent.clone().lerp(new THREE.Color(0xffffff), 0.55),
    emissive: accent, emissiveIntensity: 0.28, roughness: 0.58,
  });
  const board = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.78, 0.07), paper);
  panel.position.y = 0.82;
  const legGeo = new THREE.BoxGeometry(0.07, 0.55, 0.07);
  const legA = new THREE.Mesh(legGeo, dark);
  legA.position.set(-0.22, 0.33, 0);
  const legB = legA.clone();
  legB.position.x = 0.22;
  board.add(panel, legA, legB);
  board.position.set(slotX - 1.35, rowY, frontZ + inward * 1.02);
  board.rotation.y = facing;
  group.add(board);

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x95452f, roughness: 0.82, metalness: 0.02 });
  for (let n = 0; n < 2; n++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.38, 0.45), crateMat);
    crate.position.set(slotX + 1.15 + n * 0.22, rowY + 0.19 + n * 0.37, frontZ + inward * 0.48);
    crate.rotation.y = facing + (n ? -0.12 : 0.08);
    group.add(crate);
  }

  const acBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.68, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x9ba3a2, roughness: 0.68, metalness: 0.24 })
  );
  acBody.position.set(slotX + 1.45, rowY + 3.35, frontZ + inward * 0.19);
  group.add(acBody);
  const fan = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.035, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x343b3c, roughness: 0.55, metalness: 0.45 })
  );
  fan.position.copy(acBody.position).add(new THREE.Vector3(0, 0, inward * 0.18));
  fan.rotation.y = facing;
  group.add(fan);

  // Only one small practical light per authored restaurant. Tile-root culling
  // ensures distant shops do not enter the forward light list.
  const practical = new THREE.PointLight(accent, 3.2, 7, 2);
  practical.position.set(slotX, rowY + 2.7, frontZ + inward * 1.15);
  group.add(practical);
  return { group, emissiveMaterial: paper };
}

function normalizeAsset(object, targetWidth) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetWidth / size.x;
  const root = new THREE.Group();
  object.position.set(
    -(box.min.x + box.max.x) * 0.5,
    -box.min.y,
    -(box.min.z + box.max.z) * 0.5
  );
  root.scale.setScalar(scale);
  root.add(object);
  root.updateMatrixWorld(true);
  return { root, width: size.x * scale, height: size.y * scale, depth: size.z * scale };
}

function tileIndex(grid, [gx, gz]) {
  // Site coords are normalized [0,1] across the world. The placements grid has
  // no meaningful cols/rows, so resolve through the real cell bounds instead of
  // grid arithmetic (which silently mapped every site into the phantom middle
  // tiles of a 7x1 strip).
  const b = grid.worldBounds;
  const t = grid.indexAt(
    b.min.x + gx * (b.max.x - b.min.x),
    b.min.z + gz * (b.max.z - b.min.z)
  );
  return t < 0 ? 0 : t;
}

// Walk inward from the storefront until we hit clear, street-level ground.
// This keeps pickup rings out of awnings, planters, and decorative geometry.
function findAccessibleLocal(city, x, edgeZ, inward) {
  const roadY = city.roadBox.min.y;
  for (let d = 3.2; d <= 10; d += 0.8) {
    for (const dx of [0, -0.8, 0.8, -1.6, 1.6]) {
      const z = edgeZ + inward * d;
      const hit = city.findGroundLocal(x + dx, z);
      if (!hit || Math.abs(hit.point.y - roadY) > 0.45) continue;
      if (!city.clearSkyLocal(x + dx, hit.point.y, z)) continue;
      return hit.point.clone();
    }
  }
  const z = THREE.MathUtils.clamp(
    edgeZ + inward * 7,
    city.tileBounds.min.z + 2,
    city.tileBounds.max.z - 2
  );
  const hit = city.findGroundLocal(x, z);
  return hit?.point.clone() || new THREE.Vector3(x, roadY, z);
}

// Measure the actual surface immediately in front of a shop instead of using
// one global road height. The source block includes curbs and raised pavement;
// using roadBox.min.y made frontage props sink or float when a bay landed on
// one of those surfaces. The median rejects an isolated stair/planter hit.
function findFrontageHeightLocal(city, x, edgeZ, inward) {
  const roadY = city.roadBox.min.y;
  const heights = [];
  for (const dz of [0.28, 0.62, 0.96]) {
    for (const dx of [0, -0.65, 0.65, -1.3, 1.3]) {
      const hit = city.findGroundLocal(x + dx, edgeZ + inward * dz);
      if (!hit || Math.abs(hit.point.y - roadY) > 1.2) continue;
      heights.push(hit.point.y);
    }
  }
  if (!heights.length) return roadY;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

export async function loadDistrictDressing(scene, manager, city) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new THREE.TextureLoader(manager);
  const [shopsGltf, dioramaGltf, facadeMap, windowsMap] = await Promise.all([
    loader.loadAsync(SHOP_URL),
    loader.loadAsync(DIORAMA_URL),
    textureLoader.loadAsync(FACADE_URL),
    textureLoader.loadAsync(WINDOWS_URL),
  ]);

  const shops = normalizeAsset(shopsGltf.scene, 23.2);
  const diorama = normalizeAsset(dioramaGltf.scene, 1);
  configureTexture(facadeMap, { repeat: 2.15 });
  configureTexture(windowsMap, { repeat: 1 });
  // The supplied shop5 diffuse PNG is visibly corrupted at source (a mosaic
  // of scrambled blocks). Keep the useful geometry and use a purpose-built,
  // tileable Seoul facade plus tint variants to keep repeated rows distinct.
  const facadeMaterials = FACADE_TINTS.map((color, i) => new THREE.MeshStandardMaterial({
    name: `district_facade_${i}`,
    map: facadeMap,
    bumpMap: facadeMap,
    bumpScale: 0.045,
    color,
    roughness: 0.82,
    metalness: 0.035,
  }));
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    name: 'district_windows',
    map: windowsMap,
    emissiveMap: windowsMap,
    emissive: 0x8fa9a6,
    emissiveIntensity: 1.2,
    color: 0x6f8492,
    roughness: 0.28,
    metalness: 0.16,
    side: THREE.DoubleSide,
  });
  shops.root.traverse((obj) => {
    if (!obj.isMesh) return;
    const names = [obj.name, ...(Array.isArray(obj.material) ? obj.material : [obj.material]).map((m) => m?.name || '')].join(' ');
    obj.userData.districtSurface = /glass|window/i.test(names) ? 'glass' : 'facade';
    obj.material = obj.userData.districtSurface === 'glass' ? glassMaterial : facadeMaterials[0];
  });
  city.emissiveMaterials.push(glassMaterial);
  const halfDepth = shops.depth * 0.5;
  const streetLevel = city.roadBox.min.y;

  // Probe for facades from the middle of the carriageway rather than from the
  // spawn point: spawn is wherever the collision search happened to land, which
  // on a district with more than one street is not reliably between the two
  // frontages we are dressing.
  const streetZ = STREET_ROWS_Z.reduce((a, b) => a + b, 0) / STREET_ROWS_Z.length;
  const wallProbeRange = (city.tileBounds.max.z - city.tileBounds.min.z) * 0.48;

  // ---- Spread the rows ALONG the frontage, not across tiles ----------------
  // Sites used to pick a tile via tileIndex() and then all sit at the tile
  // centre, which relied on there being many tiles to separate them. On a
  // single-tile district that collapses all nine rows onto two spots, one per
  // side of the street. Lay whole rows end to end along each frontage instead
  // and use each site's `slot` to pick its bay WITHIN a row — which is what
  // slot was always for. Several restaurants can then share one row.
  const frontMinX = city.tileBounds.min.x + 1;
  const frontMaxX = city.tileBounds.max.x - 1;
  const rowsPerSide = Math.max(1, Math.floor((frontMaxX - frontMinX) / shops.width));
  const rowCentreX = (index) => frontMinX + (index + 0.5) * ((frontMaxX - frontMinX) / rowsPerSide);

  const pickupSites = [];
  const usedTiles = new Set();
  const rowCache = new Map(); // "side:index" -> { frontZ, rowY }

  for (let i = 0; i < SITE_LAYOUT.length; i++) {
    const site = SITE_LAYOUT[i];
    const tile = tileIndex(city.grid, site.grid);
    const inward = site.side < 0 ? 1 : -1;
    const rowIndex = THREE.MathUtils.clamp(Math.round(site.grid[0] * (rowsPerSide - 1)), 0, rowsPerSide - 1);
    const rowX = rowCentreX(rowIndex);
    const key = `${site.side}:${rowIndex}`;

    let placement = rowCache.get(key);
    if (!placement) {
      // The block's streets run along local X. Probe outward from the clear
      // corridor to find the existing upper facade, then put our new facade
      // just in front of it. The shop depth extends into the old building mass
      // while the visible face stays offset, avoiding both road blockage and
      // z-fighting.
      const outward = new THREE.Vector3(0, 0, -inward);
      const wall = city.localRaycast(
        new THREE.Vector3(rowX, streetLevel + 6.2, streetZ),
        outward,
        wallProbeRange
      );
      const frontZ = wall?.point ? wall.point.z + inward * 0.7 : streetZ - inward * 5.5;
      const rowY = findFrontageHeightLocal(city, rowX, frontZ, inward) + 0.01;
      placement = { frontZ, rowY };
      rowCache.set(key, placement);

      // One storefront strip per (side, row). It sits behind the pickup points
      // and stays visual-only, so it cannot create invisible collision seams.
      const row = shops.root.clone(true);
      row.name = `storefront_${site.side < 0 ? 's' : 'n'}${rowIndex}`;
      row.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.material = obj.userData.districtSurface === 'glass'
          ? glassMaterial
          : facadeMaterials[(rowIndex + (site.side < 0 ? 0 : 2)) % facadeMaterials.length];
      });
      row.position.set(rowX, rowY, frontZ - inward * halfDepth);
      row.rotation.y = site.side < 0 ? 0 : Math.PI;
      city.tiles[tile].root.add(row);
    }

    const { frontZ, rowY } = placement;
    const slotX = rowX + (site.slot - 2.5) * (shops.width / 6);
    const localPickup = findAccessibleLocal(city, slotX, frontZ, inward);

    const sign = makeSign(site);
    sign.name = `pickup_sign_${site.id}`;
    sign.position.set(slotX, rowY + Math.min(3.8, shops.height * 0.43), frontZ + inward * 0.08);
    sign.rotation.y = site.side < 0 ? 0 : Math.PI;
    city.tiles[tile].root.add(sign);

    const details = makeStorefrontDetails(site, { slotX, rowY, frontZ, inward });
    city.tiles[tile].root.add(details.group);

    // Three sites get the supplied FFVII diorama as a small retro-arcade
    // sculpture. It is decorative, elevated, and intentionally not a waypoint.
    if (i === 1 || i === 4 || i === 7) {
      const display = diorama.root.clone(true);
      display.name = `retro_arcade_display_${i}`;
      display.scale.multiplyScalar(3.4);
      display.position.set(slotX, rowY + shops.height + 0.25, frontZ - inward * halfDepth);
      display.rotation.y = i * 0.7;
      city.tiles[tile].root.add(display);
    }

    pickupSites.push({
      id: site.id,
      point: city.grid.localToWorld(tile, localPickup, new THREE.Vector3()),
      tile,
      slot: site.slot,
      side: site.side,
    });
    usedTiles.add(tile);
  }

  // ---- Seal the street ends with a building face ---------------------------
  // Purely what the player looks at; end-zones.js already stops the van. A
  // storefront row is 24.3 m wide, which is almost exactly the boulevard's 23 m
  // carriageway, so one row closes each end.
  //
  // normalizeAsset centres the row on XZ with its base at y=0 and its facade
  // looking down +Z at rotation 0, so each seal rotates to face back into the
  // city and steps back half its depth to put that facade on the seal plane.
  const FACING_YAW = { '+z': 0, '-z': Math.PI, '-x': -Math.PI / 2, '+x': Math.PI / 2 };
  let sealsPlaced = 0;
  for (const seal of DISTRICT_SEALS) {
    const yaw = FACING_YAW[seal.facing];
    if (yaw === undefined) { console.warn(`district: seal ${seal.id} has bad facing ${seal.facing}`); continue; }
    const back = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const row = shops.root.clone(true);
    row.name = `district_seal_${seal.id}`;
    row.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.material = obj.userData.districtSurface === 'glass'
        ? glassMaterial
        : facadeMaterials[sealsPlaced % facadeMaterials.length];
    });
    const [ax, az] = seal.at;
    row.position.set(ax + back.x * halfDepth, streetLevel, az + back.z * halfDepth);
    row.rotation.y = yaw;
    city.tiles[0].root.add(row);
    sealsPlaced++;
  }

  return {
    group: scene,
    pickupSites,
    stats: {
      seals: sealsPlaced,
      storefrontRows: rowCache.size,
      pickupSites: pickupSites.length,
      rowsPerSide,
      arcadeDisplays: 3,
      texturedFacades: facadeMaterials.length,
      practicalLights: SITE_LAYOUT.length,
      tilesDressed: usedTiles.size,
    },
  };
}
