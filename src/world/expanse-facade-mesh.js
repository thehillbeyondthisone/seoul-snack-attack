// Seoul Expanse — turning facade records into meshes.
//
// M4's geometry half. `expanse-facades.js` decided what every building wears;
// this builds it, and it builds it into a handful of merged meshes rather than
// 1,211 objects: one wall mesh per chunk per district, one shopfront mesh per
// chunk per district, and a single mesh per chunk for roofs, signs, awnings,
// parapets and air-conditioners each.
//
// Two things here are worth knowing before changing anything:
//
// **Geometry is written straight into typed arrays.** M3 built a
// `BoxGeometry` per volume and handed 3,000 of them to `mergeGeometries`. M4
// adds roughly 8,000 more elements, and paying for an object, six index
// buffers and a merge pass each would show up in the loading bar. Every
// element is pushed into a bucket's flat arrays and each bucket becomes
// exactly one `BufferGeometry`.
//
// **UVs are metres, not fractions.** A wall's `u` advances continuously around
// the building's own perimeter and its `v` advances with world height, both
// divided by the sheet's size in metres. That is what makes one 25.6 m sheet
// fit a 4 m shop and a 49 m tower without stretching either, keeps window rows
// on floor lines, and lets a whole-bay offset per building stop a terrace
// repeating. Nothing samples a pixel coordinate.
import * as THREE from 'three';
import { SIGN_CELLS } from './data/expanse-signage.js';
import { PODIUM_HEIGHT, SHEET_BAYS, SHEET_STOREYS } from './expanse-facades.js';

/** Contact shading baked into vertex colour: how dark, and over what height. */
const CONTACT_AO = { strength: 0.46, fade: 2.6 };

/** Roofs and parapets read better with a little sky-facing lift. */
const ROOF_TINT = 0.72;

/**
 * A bucket of raw vertex data that becomes one merged mesh. Positions and
 * normals always; UVs always; colours only where the material tints per
 * building, because `mergeGeometries` refuses a batch with mixed attributes
 * and the failure mode is an invisible city rather than an exception.
 */
class Bucket {
  constructor({ colours = true }) {
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.colour = colours ? [] : null;
    this.triangles = 0;
  }

  /**
   * One quad, given its centre, the unit vector its `u` runs along, its span,
   * its half-height and its outward normal. Winding is `u x up = normal`, which
   * is asserted by construction rather than by trusting a face order.
   */
  quad(cx, cy, cz, ux, uz, span, halfHeight, nx, ny, nz, u0, v0, u1, v1, r, g, b) {
    const hx = ux * span * 0.5;
    const hz = uz * span * 0.5;
    // a = (-u, -y)  b = (+u, -y)  c = (+u, +y)  d = (-u, +y)
    const ax = cx - hx; const ay = cy - halfHeight; const az = cz - hz;
    const bx = cx + hx; const by = ay; const bz = cz + hz;
    const cx2 = bx; const cy2 = cy + halfHeight; const cz2 = bz;
    const dx = ax; const dy = cy2; const dz = az;
    this.tri(ax, ay, az, bx, by, bz, cx2, cy2, cz2, nx, ny, nz, u0, v0, u1, v0, u1, v1, r, g, b);
    this.tri(ax, ay, az, cx2, cy2, cz2, dx, dy, dz, nx, ny, nz, u0, v0, u1, v1, u0, v1, r, g, b);
  }

  /** One horizontal quad at `y`, spanning `a` along +X' and `b` along +Z'. */
  flatQuad(cx, cy, cz, ax, az, halfA, bx, bz, halfB, ny, u0, v0, u1, v1, r, g, b) {
    const p = (sa, sb) => [
      cx + ax * halfA * sa + bx * halfB * sb,
      cy,
      cz + az * halfA * sa + bz * halfB * sb,
    ];
    const A = p(-1, -1); const B = p(-1, 1); const C = p(1, 1); const D = p(1, -1);
    this.tri(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], 0, ny, 0,
      u0, v0, u0, v1, u1, v1, r, g, b);
    this.tri(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2], 0, ny, 0,
      u0, v0, u1, v1, u1, v0, r, g, b);
  }

  tri(x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, u1, v1, u2, v2, u3, v3, r, g, b) {
    this.position.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
    this.normal.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(u1, v1, u2, v2, u3, v3);
    if (this.colour) this.colour.push(r, g, b, r, g, b, r, g, b);
    this.triangles++;
  }

  geometry() {
    if (!this.triangles) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colour) geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colour, 3));
    return geometry;
  }
}

const _colour = new THREE.Color();

/** Packed sRGB hex -> linear RGB triple, which is what a vertex colour is. */
function linear(hex) {
  _colour.setHex(hex, THREE.SRGBColorSpace);
  return [_colour.r, _colour.g, _colour.b];
}

/** Contact darkening at a height above the pavement. */
function ao(y) {
  const t = Math.min(1, Math.max(0, y / CONTACT_AO.fade));
  return 1 - CONTACT_AO.strength * (1 - t) * (1 - t);
}

/**
 * The four side walls of one volume, as a continuous ribbon.
 *
 * `u` accumulates around the perimeter — front, right, back, left — so a
 * window band carries round a corner instead of restarting at it, and `v`
 * tracks world height. Both are divided by the sheet's size in metres.
 */
function pushWalls(bucket, volume, facing, sheetWidth, sheetHeight, u0, v0, rgb) {
  const rx = facing.z;
  const rz = -facing.x;
  const fx = facing.x;
  const fz = facing.z;
  const hw = volume.width * 0.5;
  const hd = volume.depth * 0.5;
  const halfHeight = volume.height * 0.5;
  const cy = volume.base + halfHeight;
  const vTop = v0 + volume.height / sheetHeight;
  const shadeLow = ao(volume.base);
  const shadeHigh = ao(volume.top);
  // One colour per wall rather than per vertex: the ribbon is short enough
  // vertically that the two ends differ by less than a shade step, and a flat
  // colour per quad keeps the vertex buffer half the size it would otherwise be.
  const shade = (shadeLow + shadeHigh) * 0.5;
  const r = rgb[0] * shade;
  const g = rgb[1] * shade;
  const b = rgb[2] * shade;

  const faces = [
    // centre offset,      u direction,   span,           outward normal
    [fx * hd, fz * hd, rx, rz, volume.width, fx, fz],
    [rx * hw, rz * hw, -fx, -fz, volume.depth, rx, rz],
    [-fx * hd, -fz * hd, -rx, -rz, volume.width, -fx, -fz],
    [-rx * hw, -rz * hw, fx, fz, volume.depth, -rx, -rz],
  ];
  let u = u0;
  for (const [ox, oz, ux, uz, span, nx, nz] of faces) {
    const uEnd = u + span / sheetWidth;
    bucket.quad(volume.x + ox, cy, volume.z + oz, ux, uz, span, halfHeight,
      nx, 0, nz, u, v0, uEnd, vTop, r, g, b);
    u = uEnd;
  }
}

/** The top face of a volume: a roof, or the ledge a setback leaves behind. */
function pushCap(bucket, volume, facing, metres, rgb) {
  const rx = facing.z;
  const rz = -facing.x;
  const uSpan = volume.width / metres;
  const vSpan = volume.depth / metres;
  bucket.flatQuad(volume.x, volume.top, volume.z,
    rx, rz, volume.width * 0.5,
    facing.x, facing.z, volume.depth * 0.5,
    1, 0, 0, uSpan, vSpan, rgb[0], rgb[1], rgb[2]);
}

/**
 * A closed oriented box. `lit` names which faces carry the atlas cell; every
 * other face collapses to a single texel of the cell's own dark border, which
 * is how a sign keeps one material and still has unlit edges.
 */
function pushBox(bucket, box, facing, cell, lit, rgb, metres = 0) {
  const rx = facing.z;
  const rz = -facing.x;
  const fx = facing.x;
  const fz = facing.z;
  const hw = box.width * 0.5;
  const hd = box.depth * 0.5;
  const hh = box.height * 0.5;
  // The dark border inside every cell, one texel in from its corner.
  const du = cell ? cell.u0 + 0.0015 : 0;
  const dv = cell ? cell.v0 + 0.0015 : 0;
  if (!cell && !(metres > 0)) metres = 1;
  const dark = [du, dv, du, dv];
  const face = cell ? [cell.u0, cell.v0, cell.u1, cell.v1] : dark;

  const sides = [
    ['front', fx * hd, fz * hd, rx, rz, box.width, fx, fz],
    ['right', rx * hw, rz * hw, -fx, -fz, box.depth, rx, rz],
    ['back', -fx * hd, -fz * hd, -rx, -rz, box.width, -fx, -fz],
    ['left', -rx * hw, -rz * hw, fx, fz, box.depth, -rx, -rz],
  ];
  for (const [name, ox, oz, ux, uz, span, nx, nz] of sides) {
    const rect = cell
      ? (lit.includes(name) ? face : dark)
      : [0, 0, span / metres, box.height / metres];
    bucket.quad(box.x + ox, box.y, box.z + oz, ux, uz, span, hh,
      nx, 0, nz, rect[0], rect[1], rect[2], rect[3], rgb[0], rgb[1], rgb[2]);
  }
  // Lid and floor. A sign is read from the side and never from above, so both
  // collapse to the dark border; an untextured box tiles them like its walls.
  const lid = cell ? dark : [0, 0, box.width / metres, box.depth / metres];
  bucket.flatQuad(box.x, box.y + hh, box.z, rx, rz, hw, fx, fz, hd, 1,
    lid[0], lid[1], lid[2], lid[3], rgb[0], rgb[1], rgb[2]);
  bucket.flatQuad(box.x, box.y - hh, box.z, rx, rz, hw, -fx, -fz, hd, -1,
    lid[0], lid[1], lid[2], lid[3], rgb[0], rgb[1], rgb[2]);
}

/**
 * An awning: a slab that falls away from the wall. Built by hand rather than
 * rotated, because the tilt has to keep the inner edge flush against the
 * shopfront — a rotated box lifts off it and shows daylight through the join.
 */
function pushAwning(bucket, awning, facing, rgb) {
  const rx = facing.z;
  const rz = -facing.x;
  const hw = awning.width * 0.5;
  const inner = awning.y + awning.drop * 0.5;
  const outer = awning.y - awning.drop * 0.5;
  const innerX = awning.x - facing.x * awning.depth * 0.5;
  const innerZ = awning.z - facing.z * awning.depth * 0.5;
  const outerX = awning.x + facing.x * awning.depth * 0.5;
  const outerZ = awning.z + facing.z * awning.depth * 0.5;
  const [r, g, b] = rgb;
  const under = [r * 0.55, g * 0.55, b * 0.55];

  const corner = (x, z, y, side) => [x + rx * hw * side, y, z + rz * hw * side];
  const i0 = corner(innerX, innerZ, inner, -1);
  const i1 = corner(innerX, innerZ, inner, 1);
  const o1 = corner(outerX, outerZ, outer, 1);
  const o0 = corner(outerX, outerZ, outer, -1);
  const drop = awning.height;

  // Top surface, facing the sky and the street.
  const ny = Math.cos(Math.atan2(awning.drop, awning.depth));
  const nh = Math.sin(Math.atan2(awning.drop, awning.depth));
  bucket.tri(i0[0], i0[1], i0[2], o0[0], o0[1], o0[2], o1[0], o1[1], o1[2],
    facing.x * nh, ny, facing.z * nh, 0, 0, 0, 1, 1, 1, r, g, b);
  bucket.tri(i0[0], i0[1], i0[2], o1[0], o1[1], o1[2], i1[0], i1[1], i1[2],
    facing.x * nh, ny, facing.z * nh, 0, 0, 1, 1, 1, 0, r, g, b);
  // Underside, which is what a player standing under it actually sees.
  bucket.tri(i0[0], i0[1] - drop, i0[2], o1[0], o1[1] - drop, o1[2], o0[0], o0[1] - drop, o0[2],
    -facing.x * nh, -ny, -facing.z * nh, 0, 0, 1, 1, 1, 0, under[0], under[1], under[2]);
  bucket.tri(i0[0], i0[1] - drop, i0[2], i1[0], i1[1] - drop, i1[2], o1[0], o1[1] - drop, o1[2],
    -facing.x * nh, -ny, -facing.z * nh, 0, 0, 0, 1, 1, 1, under[0], under[1], under[2]);
  // Front valance: the striped lip, and the only part read from down the street.
  bucket.quad((o0[0] + o1[0]) * 0.5, outer - drop * 0.5, (o0[2] + o1[2]) * 0.5,
    rx, rz, awning.width, drop * 0.5, facing.x, 0, facing.z, 0, 0, 1, 1, r, g, b);
}

/** A parapet: four strips standing on the rim of a roof. */
function pushParapet(bucket, parapet, facing, rgb) {
  const t = parapet.thickness;
  const hw = parapet.width * 0.5;
  const hd = parapet.depth * 0.5;
  const strips = [
    { along: 'width', span: parapet.width, offX: facing.x * (hd - t * 0.5), offZ: facing.z * (hd - t * 0.5), depth: t },
    { along: 'width', span: parapet.width, offX: -facing.x * (hd - t * 0.5), offZ: -facing.z * (hd - t * 0.5), depth: t },
    { along: 'depth', span: parapet.depth - t * 2, offX: facing.z * (hw - t * 0.5), offZ: -facing.x * (hw - t * 0.5), depth: t },
    { along: 'depth', span: parapet.depth - t * 2, offX: -facing.z * (hw - t * 0.5), offZ: facing.x * (hw - t * 0.5), depth: t },
  ];
  for (const strip of strips) {
    if (strip.span <= 0.1) continue;
    const box = {
      x: parapet.x + strip.offX,
      z: parapet.z + strip.offZ,
      y: parapet.base + parapet.height * 0.5,
      width: strip.along === 'width' ? strip.span : strip.depth,
      depth: strip.along === 'width' ? strip.depth : strip.span,
      height: parapet.height,
    };
    pushBox(bucket, box, facing, null, [], rgb, 1);
  }
}

/** Nothing in this pass is collidable: the massing already owns the solids. */
export function buildExpanseFacadeMeshes({
  chunkById, massing, facades, textures, signAtlas, districts, deferDetails = false,
}) {
  const cells = SIGN_CELLS;
  const wallSheet = textures.metres.wall;
  const shopSheet = textures.metres.shop;
  const roofMetres = textures.metres.roof;

  // M6b relief. `rough` is the relief canvas itself — three.js reads roughness
  // from its green channel, so the sheet that fed the normal map is also the
  // roughness map and the pass costs two textures per sheet, not three. When
  // the pool is built without relief every map here is null, which is a plain
  // assignment three.js treats as "no map" and the material falls back to M4's
  // flat look rather than to a broken one.
  //
  // `roughness`/`metalness` stay at their M4 values: with a roughnessMap bound
  // they become multipliers on it, and the sheet is authored against 1.0.
  const wallMats = districts.map((district, index) => new THREE.MeshStandardMaterial({
    name: `expanse2_wall_${district.id}`,
    map: textures.walls[index].map,
    emissiveMap: textures.walls[index].emissive,
    normalMap: textures.walls[index].normal,
    roughnessMap: textures.walls[index].rough,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    vertexColors: true,
    roughness: textures.walls[index].rough ? 1 : 0.93,
    metalness: 0.03,
    envMapIntensity: 0.45,
  }));
  const shopMats = districts.map((district, index) => new THREE.MeshStandardMaterial({
    name: `expanse2_shop_${district.id}`,
    map: textures.shops[index].map,
    emissiveMap: textures.shops[index].emissive,
    normalMap: textures.shops[index].normal,
    roughnessMap: textures.shops[index].rough,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    vertexColors: true,
    roughness: textures.shops[index].rough ? 1 : 0.78,
    metalness: 0.06,
    envMapIntensity: 0.7,
  }));
  // The Expanse's roof finally has maps. NOT the same material as the compact
  // city's `proc_roof`, whose `aUvScale` is still the no-op graphics pass 2
  // recorded — that one waits on a roof pool in `src/world/proc/textures.js`.
  const roofMat = new THREE.MeshStandardMaterial({
    name: 'expanse2_rooftop', map: textures.roof, vertexColors: true,
    normalMap: textures.roofNormal,
    roughnessMap: textures.roofRough,
    roughness: textures.roofRough ? 1 : 0.95,
    metalness: 0.03,
  });
  const signMat = new THREE.MeshStandardMaterial({
    name: 'expanse2_signage',
    map: signAtlas, emissiveMap: signAtlas, emissive: 0xffffff, emissiveIntensity: 1,
    vertexColors: true, roughness: 0.42, metalness: 0.1, envMapIntensity: 0.8,
  });
  const awningMat = new THREE.MeshStandardMaterial({
    name: 'expanse2_awning', vertexColors: true, roughness: 0.88, metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const acMat = new THREE.MeshStandardMaterial({
    name: 'expanse2_aircon', color: 0x9a968d, vertexColors: true,
    roughness: 0.66, metalness: 0.35,
  });
  // Parapets are painted, not roofed, but they carry no map: a plain tinted
  // material keeps them out of the wall material's metres-based UV contract.
  const parapetMat = new THREE.MeshStandardMaterial({
    name: 'expanse2_parapet', vertexColors: true, roughness: 0.9, metalness: 0.03,
  });

  // One bucket per merged mesh. Keys carry the chunk so the visual-chunk LOD
  // can hide a whole neighbourhood by toggling one group.
  const buckets = new Map();
  const bucketFor = (key, colours = true) => {
    let bucket = buckets.get(key);
    if (!bucket) { bucket = new Bucket({ colours }); buckets.set(key, bucket); }
    return bucket;
  };

  const roofRgb = [ROOF_TINT, ROOF_TINT, ROOF_TINT];
  const white = [1, 1, 1];

  for (const building of massing.buildings) {
    const facade = facades.byBuilding.get(building.id);
    if (!facade) continue;
    const facing = building.facing;
    const rgb = linear(facade.paint);
    const u0 = facade.frame.bay / SHEET_BAYS;
    const v0 = facade.frame.storey / SHEET_STOREYS;
    const shopU0 = facade.frame.shop / 2;

    const base = building.volumes.filter((volume) => volume.tier !== 'detail');
    base.forEach((volume, index) => {
      if (index === 0) {
        // The podium is exactly one shopfront sheet tall, so `v` runs 0..1 and
        // a ground floor can never stretch or repeat vertically.
        pushWalls(bucketFor(`shop|${building.chunkId}|${building.district}`),
          volume, facing, shopSheet.width, PODIUM_HEIGHT, shopU0, 0, rgb);
      } else {
        pushWalls(bucketFor(`wall|${building.chunkId}|${building.district}`),
          volume, facing, wallSheet.width, wallSheet.height, u0, v0, rgb);
      }
      // Every base volume gets a lid: the crown's is the roof, and the ones
      // below are the ledges the setbacks leave.
      pushCap(bucketFor(`cap|${building.chunkId}`), volume, facing, roofMetres, roofRgb);
    });

    if (facade.parapet) {
      pushParapet(bucketFor(`parapet|${building.chunkId}`), facade.parapet, facing,
        [rgb[0] * 0.82, rgb[1] * 0.82, rgb[2] * 0.82]);
    }

    for (const sign of facade.signs) {
      const cell = cells[sign.cell];
      const flank = sign.faces === 'flanks';
      const box = {
        x: sign.x, y: sign.y, z: sign.z,
        width: flank ? sign.thickness : sign.width,
        depth: flank ? sign.width : sign.thickness,
        height: sign.height,
      };
      const lit = flank ? ['right', 'left']
        : sign.faces === 'both' ? ['front', 'back'] : ['front'];
      const key = sign.tier === 'base'
        ? `sign|${building.chunkId}` : `signDetail|${building.chunkId}`;
      pushBox(bucketFor(key), box, facing, cell, lit, white);
    }

    if (facade.awning) {
      pushAwning(bucketFor(`awning|${building.chunkId}`), facade.awning, facing,
        linear(facade.awning.color));
    }

    for (const unit of facade.units) {
      pushBox(bucketFor(`ac|${building.chunkId}`), {
        x: unit.x, y: unit.y, z: unit.z,
        width: unit.width, depth: unit.depth, height: unit.height,
      }, facing, null, [], white, 1);
    }
  }

  // Roof furniture stays boxes — it is seen from above — and keeps the roof
  // material so a water tank matches the felt it stands on.
  for (const building of massing.buildings) {
    for (const volume of building.volumes) {
      if (volume.tier !== 'detail') continue;
      pushBox(bucketFor(`furniture|${building.chunkId}`), {
        x: volume.x, y: volume.y, z: volume.z,
        width: volume.width, depth: volume.depth, height: volume.height,
      }, building.facing, null, [], roofRgb, roofMetres);
    }
  }

  const materialFor = (kind, district) => {
    switch (kind) {
      case 'wall': return wallMats[district] || wallMats[0];
      case 'shop': return shopMats[district] || shopMats[0];
      case 'cap': case 'furniture': return roofMat;
      case 'sign': case 'signDetail': return signMat;
      case 'awning': return awningMat;
      case 'ac': return acMat;
      case 'parapet': return parapetMat;
      default: return roofMat;
    }
  };

  // Which chunk group each mesh family lives in decides when it stops drawing.
  // Signs are the city's light and stay in the base tier; awnings, banners and
  // air-conditioners are street-level detail nobody misses from 300 m.
  const TIER = {
    wall: 'base', shop: 'base', cap: 'base', sign: 'base', parapet: 'base',
    signDetail: 'detail', awning: 'detail', furniture: 'detail', ac: 'micro',
  };

  let drawCalls = 0;
  const perKind = {};
  let triangles = 0;
  const pending = [];
  for (const [key, bucket] of buckets) {
    const [kind, chunkId, district] = key.split('|');
    const chunk = chunkById.get(chunkId);
    if (!chunk) continue;
    const build = () => {
      const geometry = bucket.geometry();
      if (!geometry) return;
      const material = materialFor(kind, Number(district));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `expanse2_${kind}_${chunkId}${district !== undefined ? `_d${district}` : ''}`;
      chunk[TIER[kind] || 'base'].add(mesh);
    };
    if (deferDetails && TIER[kind] !== 'base') pending.push({ chunk, build });
    else build();
    drawCalls++;
    triangles += bucket.triangles;
    perKind[kind] = (perKind[kind] || 0) + bucket.triangles;
  }

  return {
    get pendingDetails() { return pending.length; },
    streamNext(position) {
      if (!pending.length) return;
      let nearest = 0;
      for (let i = 1; i < pending.length; i++) {
        if (pending[i].chunk.center.distanceToSquared(position)
          < pending[nearest].chunk.center.distanceToSquared(position)) nearest = i;
      }
      pending.splice(nearest, 1)[0].build();
    },
    drawCalls,
    triangles,
    perKind,
    materials: [...wallMats, ...shopMats, roofMat, signMat, awningMat, acMat, parapetMat],
    // Everything with an emissive map, for the day/night rig to drive. The
    // signage is the loud one; windows and shop interiors are baked dim on
    // purpose so the same boost lands right on both.
    emissiveMaterials: [...wallMats, ...shopMats, signMat],
    dispose() {
      for (const material of this.materials) material.dispose();
    },
  };
}
