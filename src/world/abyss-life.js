// Seoul Snack Attack — what lives in the Abyss.
//
// src/world/abyss.js builds the place; this builds the reason to look at it.
// The first pocket was a correct, empty bowl: a floor, a wall, five glowing
// props, and nothing moving. Open black water with nothing moving in it reads
// as a loading error, not as the deep.
//
// Everything here is generated, instanced, and additive:
//
//   marine snow   — soft sprites falling through a camera-wrapped cube
//   light shafts  — soft billboards hanging from the mouth, slowly breathing
//   the Vent      — a gochujang-red glow and bubble column in the trench floor
//   jellyfish     — translucent instanced bells with five trailing filaments
//   lanternfish   — six schools that orbit, and scatter when the truck noses in
//   the Bungeo    — a fifty-metre bungeoppang (fish-shaped pastry) with an
//                   anglerfish lure, circling the pocket at the edge of the fog
//
// NO GLSL, same rule as the Drain: a shader that fails to compile on somebody's
// driver has no fallback down here. Canvas textures and MeshBasicMaterial only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shaftTexture } from './abyss-art.js';

const TAU = Math.PI * 2;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Soft round dot. PointsMaterial without a map draws hard squares. */
function dotTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Golden-brown bungeoppang crust with the pressed scale pattern. */
function crustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b8792f';
  ctx.fillRect(0, 0, 256, 128);
  const rand = seeded(0xb00e0);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${90 + rand() * 60},${50 + rand() * 30},${15 + rand() * 15},${0.08 + rand() * 0.14})`;
    ctx.fillRect(rand() * 256, rand() * 128, 2 + rand() * 6, 2 + rand() * 4);
  }
  // Scales: overlapping arcs, the mould's signature.
  ctx.strokeStyle = 'rgba(70,36,10,0.55)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 14; col++) {
      const x = col * 20 + (row % 2) * 10;
      const y = row * 18 + 6;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const additive = (opts) => new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide, ...opts,
});

/**
 * @param {THREE.Group} group    the abyss group — everything here inherits its visibility
 * @param {object} o
 * @param {boolean} o.dense
 * @param {(x:number,z:number)=>number} o.floorAt
 * @param {{centre:{x:number,z:number}, radius:number, ceilingY:number, trenchY:number, mouthRadius:number}} o.bounds
 */
export function createAbyssLife(group, { dense = true, floorAt, bounds }) {
  const rand = seeded(20260911);
  const { centre, radius, ceilingY, trenchY, mouthRadius } = bounds;
  const disposables = [];
  const keep = (...things) => { disposables.push(...things); return things[0]; };

  const dot = keep(dotTexture());
  const softShaft = keep(shaftTexture());

  // ---- Marine snow ---------------------------------------------------------
  // Positions are recomputed around the camera every frame (wrapped modulo the
  // cube), so the field never pops — the first build snapped it to a 4 m
  // lattice, which teleported every mote at once each time you crossed a cell.
  const SNOW_SPAN = 44;
  const snowCount = dense ? 1400 : 600;
  const snowBase = new Float32Array(snowCount * 3);
  const snowDrift = new Float32Array(snowCount * 3);
  for (let i = 0; i < snowCount; i++) {
    snowBase[i * 3] = rand() * SNOW_SPAN;
    snowBase[i * 3 + 1] = rand() * SNOW_SPAN;
    snowBase[i * 3 + 2] = rand() * SNOW_SPAN;
    snowDrift[i * 3] = (rand() - 0.5) * 0.25;
    snowDrift[i * 3 + 1] = -(0.12 + rand() * 0.35);  // marine snow falls
    snowDrift[i * 3 + 2] = (rand() - 0.5) * 0.25;
  }
  const snowGeo = keep(new THREE.BufferGeometry());
  const snowPos = new Float32Array(snowCount * 3);
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowMat = keep(new THREE.PointsMaterial({
    map: dot, color: 0x89b4c2, size: 0.13, sizeAttenuation: true,
    transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  snow.name = 'abyss_snow';
  group.add(snow);

  // ---- Light shafts from the mouth ------------------------------------------
  const shafts = [];
  const shaftGeo = keep(new THREE.PlaneGeometry(1, 1));
  shaftGeo.translate(0, -0.5, 0); // hang from the top
  for (let i = 0; i < (dense ? 9 : 5); i++) {
    const mat = keep(additive({ map: softShaft, color: 0x6fc4dc, opacity: 0.12 }));
    const mesh = new THREE.Mesh(shaftGeo, mat);
    const a = rand() * TAU;
    // A RING around the axis, never on it: the arrival point is directly under
    // the mouth, and a camera inside stacked additive cones sees nothing but
    // teal (first real-GPU look, 2026-09-10).
    const r = mouthRadius * (0.4 + rand() * 0.45);
    const top = 1.2 + rand() * 1.6;
    const length = 60 + rand() * 55;
    mesh.position.set(centre.x + Math.cos(a) * r, ceilingY + 5, centre.z + Math.sin(a) * r);
    mesh.scale.set(top * 6, length, 1);
    mesh.name = 'abyss_shaft';
    group.add(mesh);
    shafts.push({ mesh, mat, phase: rand() * TAU, speed: 0.2 + rand() * 0.35, base: 0.10 + rand() * 0.08 });
  }

  // ---- The Vent: the trench floor glows gochujang red -----------------------
  const ventY = floorAt(centre.x, centre.z);
  const ventGlowMat = keep(new THREE.SpriteMaterial({
    map: dot, color: 0xff4a1c, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const ventGlow = new THREE.Sprite(ventGlowMat);
  ventGlow.position.set(centre.x, ventY + 10, centre.z);
  ventGlow.scale.setScalar(18);
  ventGlow.name = 'abyss_vent_glow';
  group.add(ventGlow);
  const ventLight = new THREE.PointLight(0xff5a22, 260, 95, 1.5);
  ventLight.position.set(centre.x, ventY + 14, centre.z);
  group.add(ventLight);

  const BUBBLE_H = 70;
  const bubbleCount = dense ? 220 : 90;
  const bubbleSeed = new Float32Array(bubbleCount * 4);
  for (let i = 0; i < bubbleCount; i++) {
    const a = rand() * TAU;
    const r = Math.pow(rand(), 1.6) * 16;
    bubbleSeed.set([centre.x + Math.cos(a) * r, centre.z + Math.sin(a) * r, rand() * BUBBLE_H, 2 + rand() * 4], i * 4);
  }
  const bubbleGeo = keep(new THREE.BufferGeometry());
  const bubblePos = new Float32Array(bubbleCount * 3);
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
  const bubbleMat = keep(new THREE.PointsMaterial({
    map: dot, color: 0xa5bac0, size: 0.22, transparent: true, opacity: 0.38,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
  bubbles.frustumCulled = false;
  bubbles.name = 'abyss_vent_bubbles';
  group.add(bubbles);

  // ---- Jellyfish -------------------------------------------------------------
  const JELLY_HUES = [0x6db6c9, 0x84c5d4, 0x9c91c7, 0x73bca9, 0xc19aa8];
  const jellyCount = dense ? 34 : 16;
  const bellGeo = keep(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI * 0.55));
  // Five actual filaments replace the solid cone underneath each bell.
  const strands = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU, points = [];
    for (let j = 0; j <= 8; j++) points.push(new THREE.Vector3(
      Math.cos(a) * .52 + Math.sin(j * .7 + a) * .09,
      -j / 8, Math.sin(a) * .52 + Math.cos(j * .6 + a) * .09));
    strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .018, 4, false));
  }
  const tentGeo = keep(mergeGeometries(strands));
  strands.forEach(g => g.dispose());
  const bellMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
    opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }));
  const tentMat = keep(additive({ color: 0xffffff, opacity: 0.32 }));
  const bells = new THREE.InstancedMesh(bellGeo, bellMat, jellyCount);
  const tents = new THREE.InstancedMesh(tentGeo, tentMat, jellyCount);
  bells.frustumCulled = tents.frustumCulled = false;
  bells.name = 'abyss_jelly_bells';
  tents.name = 'abyss_jelly_tentacles';
  const jellies = [];
  const tint = new THREE.Color();
  for (let i = 0; i < jellyCount; i++) {
    const a = rand() * TAU;
    const r = 12 + rand() * (radius - 30);
    const x = centre.x + Math.cos(a) * r;
    const z = centre.z + Math.sin(a) * r;
    const floor = floorAt(x, z);
    const y = THREE.MathUtils.lerp(floor + 12, ceilingY - 10, rand());
    const size = 1.0 + rand() * 2.6;
    jellies.push({ home: new THREE.Vector3(x, y, z), size, phase: rand() * TAU, rate: 0.7 + rand() * 0.7, drift: rand() * TAU });
    tint.setHex(JELLY_HUES[i % JELLY_HUES.length]);
    bells.setColorAt(i, tint);
    tents.setColorAt(i, tint);
  }
  group.add(bells, tents);

  // ---- Lanternfish schools ---------------------------------------------------
  const SCHOOLS = 6;
  const perSchool = dense ? 60 : 26;
  const fishGeo = keep(new THREE.ConeGeometry(0.16, 0.9, 4));
  fishGeo.rotateX(Math.PI / 2); // point +Z
  const fishMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const fish = new THREE.InstancedMesh(fishGeo, fishMat, SCHOOLS * perSchool);
  fish.frustumCulled = false;
  fish.name = 'abyss_lanternfish';
  const schools = [];
  const fishState = [];
  const SCHOOL_HUES = [0x64f0ff, 0xb7ff6a, 0x6aa8ff, 0xff7ad9, 0x8bffd6, 0xfff07a];
  for (let s = 0; s < SCHOOLS; s++) {
    schools.push({
      a: rand() * TAU, speed: (0.05 + rand() * 0.05) * (rand() < 0.5 ? -1 : 1),
      r: 25 + rand() * (radius - 45), bob: rand() * TAU,
      yMid: THREE.MathUtils.lerp(trenchY + 30, ceilingY - 12, rand()),
      centre: new THREE.Vector3(), scatter: 0,
    });
    for (let f = 0; f < perSchool; f++) {
      fishState.push({
        school: s, orbit: 1.5 + rand() * 6, phase: rand() * TAU, speed: 0.8 + rand() * 1.2,
        tilt: (rand() - 0.5) * 1.4, prev: new THREE.Vector3(),
      });
      tint.setHex(SCHOOL_HUES[s]).multiplyScalar(1.5);
      fish.setColorAt(s * perSchool + f, tint);
    }
  }
  group.add(fish);

  // ---- The Bungeo --------------------------------------------------------------
  // A fish-shaped pastry the size of a ferry, with an anglerfish lure. It is on
  // the menu upstairs. Nobody down here has been told.
  const crust = keep(crustTexture());
  const crustMat = keep(new THREE.MeshStandardMaterial({
    map: crust, color: 0xffffff, roughness: 0.85, metalness: 0,
    emissive: 0x3a1c06, emissiveIntensity: 0.6,
  }));
  const spotMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff6ff).multiplyScalar(2.2) }));
  const eyeMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2b0).multiplyScalar(3) }));
  const pupilMat = keep(new THREE.MeshBasicMaterial({ color: 0x050302 }));
  const segGeo = keep(new THREE.SphereGeometry(1, 20, 12));
  const spotGeo = keep(new THREE.SphereGeometry(0.55, 8, 6));
  const finGeo = keep(new THREE.ConeGeometry(1, 1, 4, 1, true));

  const BUNGEO_SEGMENTS = 10;
  const SEG_SPACING = 5.2;
  // Height profile nose -> tail: blunt head, deep belly, pinched tail stock.
  const profile = [5.2, 7.4, 8.4, 8.6, 8.0, 7.0, 5.6, 4.0, 2.7, 1.8];
  const segments = [];
  for (let i = 0; i < BUNGEO_SEGMENTS; i++) {
    const seg = new THREE.Group();
    const body = new THREE.Mesh(segGeo, crustMat);
    const h = profile[i];
    body.scale.set(h * 0.42, h, SEG_SPACING * 0.95);
    seg.add(body);
    if (i > 0 && i < BUNGEO_SEGMENTS - 2) {
      for (const side of [-1, 1]) {
        const spot = new THREE.Mesh(spotGeo, spotMat);
        spot.position.set(side * h * 0.42, -h * 0.25, 0);
        seg.add(spot);
      }
    }
    segments.push(seg);
    group.add(seg);
  }
  // Head dressing: eyes and the lure.
  const head = segments[0];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(spotGeo, eyeMat);
    eye.scale.setScalar(2.1);
    eye.position.set(side * 2.1, 1.3, 2.2);
    const pupil = new THREE.Mesh(spotGeo, pupilMat);
    pupil.scale.setScalar(0.9);
    pupil.position.set(side * 0.75, 0.1, 0.55);
    eye.add(pupil);
    head.add(eye);
  }
  const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.18, 0.3, 9, 6)), crustMat);
  rod.position.set(0, 7.5, 4.5);
  rod.rotation.x = 0.7;
  head.add(rod);
  const lureMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4c0).multiplyScalar(4) }));
  const lure = new THREE.Mesh(keep(new THREE.SphereGeometry(1.1, 14, 10)), lureMat);
  lure.position.set(0, 10.5, 8.2);
  head.add(lure);
  const lureLight = new THREE.PointLight(0xffe2a0, 180, 55, 1.6);
  lure.add(lureLight);
  const lureHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({
    map: dot, color: 0xffd88a, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  lureHalo.scale.setScalar(12);
  lure.add(lureHalo);
  // Tail fan and dorsal fin, flattened cones.
  const tail = new THREE.Mesh(finGeo, crustMat);
  tail.scale.set(0.35, 9, 7);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -5.5;
  segments[BUNGEO_SEGMENTS - 1].add(tail);
  const dorsal = new THREE.Mesh(finGeo, crustMat);
  dorsal.scale.set(0.3, 6, 9);
  dorsal.position.y = 8.5;
  segments[3].add(dorsal);

  const BUNGEO_R = radius * 0.64;
  const bungeoMid = THREE.MathUtils.lerp(trenchY, ceilingY, 0.55);
  const pathPoint = (s, out) => out.set(
    centre.x + Math.cos(s) * BUNGEO_R * (1 + 0.12 * Math.sin(s * 3)),
    bungeoMid + Math.sin(s * 2.0) * 13,
    centre.z + Math.sin(s) * BUNGEO_R * 0.86,
  );

  // ---- Update -------------------------------------------------------------------
  const dummy = new THREE.Object3D();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _p = new THREE.Vector3();
  let t = 0;
  let bungeoS = rand() * TAU;
  const bungeoHead = new THREE.Vector3();

  return {
    get bungeoHead() { return bungeoHead; },

    update(dt, camera, subPosition = null) {
      t += dt;

      // Snow, wrapped around the camera.
      const cx = camera.position.x - SNOW_SPAN / 2;
      const cy = camera.position.y - SNOW_SPAN / 2;
      const cz = camera.position.z - SNOW_SPAN / 2;
      const wrap = (v, origin) => origin + (((v - origin) % SNOW_SPAN) + SNOW_SPAN) % SNOW_SPAN;
      for (let i = 0; i < snowCount; i++) {
        const j = i * 3;
        snowPos[j] = wrap(snowBase[j] + snowDrift[j] * t + Math.sin(t * 0.3 + i) * 0.4, cx);
        snowPos[j + 1] = wrap(snowBase[j + 1] + snowDrift[j + 1] * t, cy);
        snowPos[j + 2] = wrap(snowBase[j + 2] + snowDrift[j + 2] * t, cz);
      }
      snowGeo.attributes.position.needsUpdate = true;

      for (const s of shafts) {
        s.mat.opacity = s.base * (0.65 + 0.35 * Math.sin(t * s.speed + s.phase));
        s.mesh.rotation.y = Math.atan2(camera.position.x - s.mesh.position.x, camera.position.z - s.mesh.position.z);
      }

      // Vent flicker and bubbles.
      const flicker = 0.85 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.05;
      ventGlowMat.opacity = 0.4 * flicker;
      ventLight.intensity = 260 * flicker;
      for (let i = 0; i < bubbleCount; i++) {
        const j = i * 4;
        const rise = (bubbleSeed[j + 2] + t * bubbleSeed[j + 3]) % BUBBLE_H;
        bubblePos[i * 3] = bubbleSeed[j] + Math.sin(t * 1.3 + i) * (0.3 + rise * 0.04);
        bubblePos[i * 3 + 1] = ventY + rise;
        bubblePos[i * 3 + 2] = bubbleSeed[j + 1] + Math.cos(t * 1.1 + i) * (0.3 + rise * 0.04);
      }
      bubbleGeo.attributes.position.needsUpdate = true;

      // Jellyfish: contract, lurch up, relax, sink.
      for (let i = 0; i < jellyCount; i++) {
        const j = jellies[i];
        const cycle = t * j.rate + j.phase;
        const pulse = Math.sin(cycle);
        const lift = Math.sin(cycle - 0.8) * 0.9 + (cycle % TAU) * 0.08;
        _p.copy(j.home);
        _p.x += Math.sin(t * 0.07 + j.drift) * 6;
        _p.z += Math.cos(t * 0.05 + j.drift) * 6;
        _p.y += lift;
        dummy.position.copy(_p);
        dummy.rotation.set(Math.sin(t * 0.3 + j.drift) * 0.18, 0, Math.cos(t * 0.27 + j.drift) * 0.18);
        dummy.scale.set(j.size * (1 + pulse * 0.14), j.size * (0.8 - pulse * 0.12), j.size * (1 + pulse * 0.14));
        dummy.updateMatrix();
        bells.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(j.size * (0.9 - pulse * 0.1), j.size * (3.2 + pulse * 0.5), j.size * (0.9 - pulse * 0.1));
        dummy.updateMatrix();
        tents.setMatrixAt(i, dummy.matrix);
      }
      bells.instanceMatrix.needsUpdate = true;
      tents.instanceMatrix.needsUpdate = true;

      // Lanternfish: each school orbits the pocket; each fish orbits its school.
      for (const school of schools) {
        school.a += school.speed * dt;
        school.centre.set(
          centre.x + Math.cos(school.a) * school.r,
          school.yMid + Math.sin(t * 0.2 + school.bob) * 6,
          centre.z + Math.sin(school.a) * school.r,
        );
        const near = subPosition ? subPosition.distanceTo(school.centre) : 1e9;
        school.scatter = THREE.MathUtils.lerp(school.scatter, near < 16 ? 1 : 0, 1 - Math.exp(-dt * (near < 16 ? 4 : 0.6)));
      }
      for (let i = 0; i < fishState.length; i++) {
        const f = fishState[i];
        const school = schools[f.school];
        const ang = t * f.speed + f.phase;
        const orbit = f.orbit * (1 + school.scatter * 2.6);
        _a.set(
          school.centre.x + Math.cos(ang) * orbit,
          school.centre.y + Math.sin(ang * 1.3 + f.tilt) * orbit * 0.35,
          school.centre.z + Math.sin(ang) * orbit,
        );
        dummy.position.copy(_a);
        if (f.prev.distanceToSquared(_a) > 1e-6) dummy.lookAt(_b.copy(_a).multiplyScalar(2).sub(f.prev));
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        fish.setMatrixAt(i, dummy.matrix);
        f.prev.copy(_a);
      }
      fish.instanceMatrix.needsUpdate = true;

      // The Bungeo: segments follow the head along the path, each facing the one
      // ahead of it, so the body undulates for free.
      bungeoS += dt * 4.2 / BUNGEO_R;
      for (let i = 0; i < BUNGEO_SEGMENTS; i++) {
        const s = bungeoS - (i * SEG_SPACING) / BUNGEO_R;
        pathPoint(s, _a);
        // A lateral wiggle that travels down the body.
        const wig = Math.sin(t * 1.6 - i * 0.55) * (0.3 + i * 0.25);
        _a.x += Math.cos(s) * wig;
        _a.z += Math.sin(s) * wig;
        pathPoint(s + 0.02, _b);
        segments[i].position.copy(_a);
        segments[i].lookAt(_b);
        if (i === 0) bungeoHead.copy(_a);
      }
      lure.position.y = 10.5 + Math.sin(t * 1.9) * 0.6;
      const lureK = 0.85 + Math.sin(t * 3.7) * 0.15;
      lureLight.intensity = 180 * lureK;
    },

    dispose() {
      for (const d of disposables) d.dispose?.();
      bells.dispose();
      tents.dispose();
      fish.dispose();
    },
  };
}
