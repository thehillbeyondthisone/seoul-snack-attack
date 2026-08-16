// Seoul Delivery — boot: renderer, loading, module wiring, main loop.
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Soundtrack } from './core/soundtrack.js';
import { AudioManager } from './core/audio.js';
import { Post } from './core/post.js';
import { createGraphicsQuality } from './core/graphics-quality.js';
import { loadCity } from './world/city.js';
import { loadDistrictDressing } from './world/district-dressing.js';
import { NIGHT } from './world/lighting.js';
import { createTimeOfDay } from './world/time-of-day.js';
import { loadProps } from './world/props.js';
import { Rain } from './world/rain.js';
import { loadVan } from './vehicle/van.js';
import { loadVehicle } from './vehicle/vehicle.js';
import { VehiclePhysics } from './vehicle/physics.js';
import { getVehicle, VEHICLE_IDS, DEFAULT_VEHICLE } from './game/data/vehicles.js';
import { loadSave } from './game/save.js';
import { ChaseCamera } from './vehicle/camera.js';
import { Orders } from './game/orders.js';
import { HUD3 } from './ui/hud3.js';
import { initDebug } from './ui/debug.js';

const app = document.getElementById('app');
const loadingEl = document.getElementById('loading');
const loadbar = document.getElementById('loadbar');
const loadstatus = document.getElementById('loadstatus');
const loadpercent = document.getElementById('loadpercent');
const loaderror = document.getElementById('loaderror');
const loadretry = document.getElementById('loadretry');
const graphicsQuality = createGraphicsQuality();

const assetLabel = (url = '') => {
  const name = decodeURIComponent(url.split('/').pop() || url);
  if (/city\.glb/i.test(name)) return '도시 불러오는 중 · Loading city';
  if (/van\.glb|compact\.glb/i.test(name)) return '차량 불러오는 중 · Loading vehicle';
  if (/storefront|diorama/i.test(name)) return '상점 불러오는 중 · Loading storefronts';
  if (/\.(webp|png|jpe?g)$/i.test(name)) return '텍스처 불러오는 중 · Loading textures';
  return `에셋 불러오는 중 · Loading ${name || 'assets'}`;
};

function setLoadingProgress(percent, status) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  loadbar.style.width = `${value}%`;
  loadpercent.textContent = `${value}%`;
  if (status) loadstatus.textContent = status;
}

// ---- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: graphicsQuality.profile.antialias,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, graphicsQuality.profile.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = NIGHT.exposure; // re-applied by the active time preset
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false; // perf: neon + fog carry the night mood
// EffectComposer renders several passes per frame and renderer.info resets on
// every one of them, so by the time we read it we would only see the final
// fullscreen blit. Accumulate across the whole frame and reset it ourselves.
renderer.info.autoReset = false;
app.appendChild(renderer.domElement);

// WebGL context loss: pause, tell the user, recover by reload.
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  loadingEl.classList.remove('done');
  loadingEl.querySelector('h1').textContent = 'GPU 오류';
  loadingEl.querySelector('.sub').textContent = 'WEBGL CONTEXT LOST — RELOADING';
  setTimeout(() => location.reload(), 1500);
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);

// ---- Loading progress ---------------------------------------------------------
const manager = new THREE.LoadingManager();
manager.onStart = (url) => setLoadingProgress(4, assetLabel(url));
manager.onProgress = (url, loaded, total) => {
  setLoadingProgress((loaded / Math.max(1, total)) * 92, assetLabel(url));
};
manager.onError = (url) => {
  loadstatus.textContent = '일부 파일을 불러오지 못했습니다 · An asset failed to load';
  loaderror.textContent = decodeURIComponent(url);
};
loadretry.addEventListener('click', () => location.reload());

async function boot() {
  const qp = new URLSearchParams(location.search);
  setLoadingProgress(2, '렌더러 시작 중 · Starting renderer');

  // ---- Which vehicle -------------------------------------------------------
  // ?car=van|compact remains an unrestricted test override. Normal boot uses
  // the player's selected owned vehicle; a fresh save starts with the van.
  const playerSave = loadSave();
  const requestedCarId = qp.get('car') ?? playerSave.vehicle ?? DEFAULT_VEHICLE;
  const carId = VEHICLE_IDS.includes(requestedCarId) ? requestedCarId : DEFAULT_VEHICLE;
  if (carId !== requestedCarId) {
    console.warn(`?car=${requestedCarId} is not a known vehicle (have: ${VEHICLE_IDS.join(', ')}); using ${DEFAULT_VEHICLE}`);
  }
  const vehicleDef = getVehicle(carId);

  const [city, van] = await Promise.all([
    loadCity(scene, manager, 'assets/world/seoul-block.glb', renderer, setLoadingProgress),
    // Assets built through tools/build-vehicle.mjs carry a baked rig and go
    // through the thin loader; the van is still on its runtime heuristics.
    // See the `van` note in src/game/data/vehicles.js for why it has not moved.
    vehicleDef.loader === 'canonical'
      ? loadVehicle(manager, vehicleDef)
      : loadVan(manager, vehicleDef.asset),
  ]);
  setLoadingProgress(94, '게임 시스템 준비 중 · Preparing game systems');
  console.log(`vehicle: ${vehicleDef.nameEn} (${vehicleDef.id}, ${vehicleDef.loader} rig)`);

  // Storefront dressing is ON by default. The Seoul block is one authored
  // corner repeated across the fabric, so the Korean shopfronts and neon signs
  // are what make each district read as a different street rather than the same
  // corner again — they are the map, not a garnish. `?shops=off` drops them for
  // performance QA.
  let district = null;
  if (qp.get('shops') !== 'off') {
    try {
      district = await loadDistrictDressing(scene, manager, city);
      city.pickupSites = district.pickupSites;
      console.log(
        `district: ${district.stats.shopsPlaced}/${district.stats.shopsRequested} shops placed ` +
        `on tile ${district.stats.tile}` +
        (district.stats.skipped.length ? ` — skipped: ${district.stats.skipped.join('; ')}` : '')
      );
    } catch (err) {
      city.pickupSites = [];
      console.warn('district dressing failed to load, using sampled pickups:', err);
    }
  } else {
    city.pickupSites = [];
    console.log('district: procedural shops off (?shops=off)');
  }
  setLoadingProgress(96, '첫 장면 준비 중 · Preparing the first scene');

  // ---- Test hooks (query params, documented in README) -------------------
  // ?time=night|day  ?rain=off|light|heavy  ?offer=1&accept=1

  // ---- Vehicle ------------------------------------------------------------
  const phys = new VehiclePhysics(city);
  // Definition overrides land BEFORE attach(): attach() reads comHeight to
  // build comOffset, so a later assignment would leave the CoM on the van's.
  Object.assign(phys.params, vehicleDef.params, {
    collisionHalf: vehicleDef.collisionHalf,
    bumperY: vehicleDef.bumperY,
  });
  phys.attach(van);
  phys.place(city.spawn.position, city.spawn.heading);
  scene.add(van.group);

  const chaseCam = new ChaseCamera(camera);
  chaseCam.snapTo(phys);

  // ---- World systems --------------------------------------------------------
  const rain = new Rain(scene);
  rain.bind({ city, physics: phys });

  const post = new Post(renderer, scene, camera);
  post.setSize(window.innerWidth, window.innerHeight);

  // Time presets own the sky, ambient/key light, practical lights, exposure,
  // bloom and base fog. Weather remains independent.
  setLoadingProgress(97, '조명 준비 중 · Preparing lighting');
  const timeOfDay = createTimeOfDay({
    scene, renderer, city, van, post, rain,
    initial: qp.get('time') || 'night',
  });

  // ---- Game systems -----------------------------------------------------------
  const input = new Input();
  const hud = new HUD3();
  hud.setControllerStatus(input.supported ? 'waiting' : 'unsupported');
  // Add uploaded MP3s here to expand the car stereo.
  //
  // The files MUST live in public/audio/music/ — that is the source, and vite
  // copies it into dist/audio/music/ on every build. A track dropped straight
  // into dist/ plays until the next `npm run build` empties the folder and it is
  // gone, which is exactly how Countdown / Rapid Fire / Supersonic Fire went
  // missing. Kebab-case the filenames to match: they end up in a URL.
  const soundtrack = new Soundtrack([
    { url: `${import.meta.env.BASE_URL}audio/music/budae-sizzle-hot.mp3`, title: 'BUDAE (Sizzle Hot)' },
    { url: `${import.meta.env.BASE_URL}audio/music/drop-it-red.mp3`, title: 'Drop It Red' },
    { url: `${import.meta.env.BASE_URL}audio/music/drop-it-red-remix.mp3`, title: 'Drop It Red (Remix)' },
    { url: `${import.meta.env.BASE_URL}audio/music/calorie-bomb.mp3`, title: 'Calorie Bomb' },
    { url: `${import.meta.env.BASE_URL}audio/music/crown-step.mp3`, title: 'Crown Step' },
    { url: `${import.meta.env.BASE_URL}audio/music/sizzle.mp3`, title: 'Sizzle' },
    { url: `${import.meta.env.BASE_URL}audio/music/supersonic-fire.mp3`, title: 'Supersonic Fire' },
    { url: `${import.meta.env.BASE_URL}audio/music/rapid-fire-cover.mp3`, title: 'Rapid Fire (Cover)' },
    { url: `${import.meta.env.BASE_URL}audio/music/countdown.mp3`, title: 'Countdown' },
  ]);
  const audio = new AudioManager({ music: soundtrack });
  hud.bindAudioControls?.({ soundtrack, audio });
  hud.setAudioStatus?.(audio.muted ? 'muted' : 'ready');
  const orders = new Orders({ scene, city, phys, hud, camera, audio });
  hud.configureGarage?.({
    vehicles: VEHICLE_IDS.map(getVehicle),
    currentId: vehicleDef.id,
    getSave: () => orders.save,
    onChoose: (vehicle) => {
      const result = orders.purchaseVehicle(vehicle);
      if (!result.ok) {
        hud.refreshGarage?.();
        return;
      }
      const url = new URL(location.href);
      url.searchParams.set('car', vehicle.id);
      location.href = url.toString();
    },
  });
  const firstRun = hud.isOnboardingVisible?.() ?? false;
  orders.setPaused?.(firstRun);
  input.setTouchSuspended(firstRun);
  hud.onStart?.(() => {
    input.setTouchSuspended(false);
    orders.setPaused?.(false);
    if (orders.state === 'idle') orders.offerNow(null, { first: true });
  });

  // Crash events also shake the camera.
  const orderCrash = phys.onCrash;
  phys.onCrash = (severity, point) => {
    orderCrash?.(severity, point);
    chaseCam.onCrash(severity);
    audio.event('impact', severity);
  };

  // The debug menu ships in PRODUCTION builds too: these are internal releases,
  // and the menu is the only way to change weather, time of day, lighting and
  // vehicle tuning in a bundle nobody can rebuild. It costs a hidden lil-gui
  // instance and stays invisible until backtick (or the pad View button), so a
  // player who never presses it cannot tell it is there.
  //
  // `?debug=off` opts out, for a build handed to someone outside the team.
  const debugEnabled = qp.get('debug') !== 'off';
  const debug = debugEnabled
    ? initDebug({ orders, rain, phys, post, van, cam: chaseCam, city, scene, timeOfDay, vehicleDef, hud })
    : { toggle() {}, update() {}, attachProps() {}, setEnglishMode() {} };

  // Apply the capability-selected rendering budget after debug settings have
  // restored. Desktop values are the existing defaults; only the active mobile
  // profile reduces visual work. Physics and game state are untouched.
  if (graphicsQuality.mobile) {
    post.setScale(graphicsQuality.profile.postScale);
    rain.densityScale *= graphicsQuality.profile.rainDensity;
    city.cullDistance = graphicsQuality.profile.cullDistance;
    city.lights.streetlights.setActiveCount(graphicsQuality.profile.streetlights);
  }

  // ---- ?ui=slice — HUD style slice (see src/ui/slice.js) -------------------
  let uiSlice = null;
  if (qp.get('ui') === 'slice') {
    const { startUISlice } = await import('./ui/slice.js');
    uiSlice = await startUISlice({ hudEl: hud.el, orders, params: qp });
  }

  // ---- Props: loaded AFTER the first frame ---------------------------------
  // The game is fully playable without them, so they must never delay
  // time-to-playable and a prop failure must never brick boot.
  // ?props=off | gallery
  // Declared up here, not next to the render loop that drains it: props can
  // finish loading during any await below and call queueWarm(), and a `const`
  // further down would still be in its temporal dead zone at that moment.
  const warmQueue = [];

  let props = null;
  const propMode = qp.get('props');
  if (propMode !== 'off') {
    loadProps(scene, city, {
      mode: propMode === 'gallery' ? 'gallery' : 'world',
      density: propMode === 'gallery' ? 1 : graphicsQuality.profile.propDensity,
    })
      .then((p) => {
        props = p;
        p.world.setVehicle({
          half: new THREE.Vector3(
            vehicleDef.collisionHalf.x, vehicleDef.collisionHalf.y, vehicleDef.collisionHalf.z,
          ),
          mass: phys.params.mass,
        });
        // Reuse the existing crash chain: order quality + camera shake.
        p.world.onImpact = (handle, impulse, point) => {
          const severity = impulse / phys.params.mass;
          if (severity > 1.2) phys.onCrash?.(severity, point);
        };
        // Real streetlamp props are better anchors than sampled road points.
        if (p.lampAnchors.length >= 8) city.lights.streetlights.setAnchors(p.lampAnchors);
        // Props arrive after the first frame, so their materials would otherwise
        // all compile in the single frame they first come into view. Queue them
        // to be warmed a few at a time instead.
        queueWarm(p.group);
        debug.attachProps(p);
        if (debugEnabled) window.__seoul.props = p;
        console.log(`props: ${p.stats.placed} placed, ${p.stats.types} types, ${p.stats.bodies} bodies`);
      })
      .catch((err) => console.warn('props failed to load, continuing without:', err));
  }

  // Console/automated probing handle (spawn placement, physics state). Tied to
  // the same switch as the menu, so tools/probe.mjs works against an internal
  // dist build and not just the dev server.
  if (debugEnabled) {
    window.__seoul = { city, district, van, phys, orders, input, camera, scene, renderer, grid: city.grid, timeOfDay, debug, audio, soundtrack, graphicsQuality, THREE };
  }

  // ---- Apply test hooks ---------------------------------------------------
  if (qp.get('rain')) rain.setLevel(qp.get('rain'));
  if (qp.get('offer')) {
    orders.offerNow(qp.get('restaurant'));
    if (qp.get('accept')) orders._accept();
  }
  const autoDrive = !!qp.get('auto');
  // ?stats=1 — on-screen physics/spawn readout (also readable via --dump-dom)
  let statsEl = null;
  if (qp.get('stats')) {
    statsEl = document.createElement('div');
    statsEl.id = 'stats';
    statsEl.style.cssText =
      'position:fixed;bottom:80px;left:12px;color:#7bff9e;font:12px monospace;z-index:99;white-space:pre;text-shadow:0 1px 2px #000';
    document.body.appendChild(statsEl);
  }
  // Static cameras for map QA. `shop=<restaurant id>` is deliberately a test
  // hook, not gameplay: it frames the authored pickup front for visual probes.
  const shopView = qp.get('shop');
  const overview = !!qp.get('overview') || !!shopView;
  if (overview) {
    const site = shopView && city.pickupSites.find((p) => p.id === shopView);
    if (site) {
      const localInward = new THREE.Vector3(site.toStreet.x, 0, site.toStreet.z);
      localInward.transformDirection(city.grid.matrices[site.tile]);
      camera.position.copy(site.point).addScaledVector(localInward, 6).add(new THREE.Vector3(0, 5.5, 0));
      camera.lookAt(site.point.x, site.point.y + 3, site.point.z);
    } else {
      const c = city.bounds.getCenter(new THREE.Vector3());
      const span = Math.max(
        city.bounds.max.x - city.bounds.min.x,
        city.bounds.max.z - city.bounds.min.z
      );
      camera.position.set(c.x + span * 0.45, c.y + span * 0.4, c.z + span * 0.45);
      camera.lookAt(c.x, c.y, c.z);
      // Overview is an explicit QA mode, so show the whole expanded grid even
      // though normal gameplay keeps the original distance culling budget.
      city.cullDistance = span * 2;
    }
  }

  // Do not call renderer.compileAsync() here. Despite its name, Three.js first
  // walks the entire scene and synchronously creates every material program
  // before returning its Promise. On slower GPUs that blocks the main thread
  // at 99% indefinitely (audio continues because it runs independently).
  // Starting the render loop lets Three compile only the visible first-frame
  // programs, with the rest created naturally when they are needed.
  setLoadingProgress(99, '첫 화면 준비 중 · Preparing first frame');

  // ---- Backgrounding -------------------------------------------------------
  // A phone that switches apps keeps <audio> playing: rAF stops, the game
  // freezes, and the soundtrack carries on over whatever the player opened next.
  // Nothing was listening for that.
  //
  // Only un-pause what WE paused. A player who hit M, or who paused the stereo
  // themselves, must not have it start up again just because they took a call —
  // hence the flag rather than a blind resume().
  let musicPausedByBackground = false;
  const handleVisibility = () => {
    if (document.hidden) {
      if (!soundtrack.paused) { soundtrack.pause(); musicPausedByBackground = true; }
      // Silences engine, tyres, rain and impacts too — they run on the
      // AudioContext, not on the <audio> element.
      audio.ctx?.suspend?.().catch(() => { /* context may already be closed */ });
    } else {
      if (musicPausedByBackground) { soundtrack.resume(); musicPausedByBackground = false; }
      if (audio.started) audio.ctx?.resume?.().catch(() => { /* needs a gesture; wake() retries */ });
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  // iOS Safari can background an app without ever firing visibilitychange.
  window.addEventListener('pagehide', () => {
    if (!soundtrack.paused) { soundtrack.pause(); musicPausedByBackground = true; }
    audio.ctx?.suspend?.().catch(() => {});
  });

  // ---- Resize ------------------------------------------------------------------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Main loop -----------------------------------------------------------------
  const clock = new THREE.Clock();
  const FIXED = 1 / 120;
  let acc = 0;
  let firstFrame = true;
  let lastInputMode = input.mode;
  let gamepadConnected = false;

  // Seed the warm-up queue with the districts — see warmNextDistrict().
  for (const tile of city.tiles) {
    warmQueue.push(tile.root);
    if (tile.detail) warmQueue.push(tile.detail);
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    renderer.info.reset();

    // Poll gamepads before consuming controls. Analog triggers retain their
    // full range instead of being flattened to keyboard-style on/off values.
    input.update();
    if (input.connected !== gamepadConnected) {
      gamepadConnected = input.connected;
      hud.setControllerStatus(gamepadConnected ? 'connected' : 'waiting', input.gamepadName);
      if (gamepadConnected) hud.toast('컨트롤러 연결됨', 'Xbox controller connected');
      else hud.toast('컨트롤러 연결 끊김', 'Controller disconnected', 'bad');
    }
    if (input.mode !== lastInputMode) {
      lastInputMode = input.mode;
      hud.setInputMode(input.mode);
    }
    const englishMode = input.held('translate');
    hud.setEnglishMode?.(englishMode);
    debug.setEnglishMode?.(englishMode);
    if (input.hadActivity) {
      if (!soundtrack.started) soundtrack.play();
      if (!audio.started || audio.ctx?.state === 'suspended') {
        audio.wake();
        hud.setAudioStatus?.(audio.muted ? 'muted' : audio.available ? 'on' : 'blocked');
      }
    }

    // Controls
    phys.controls.throttle = autoDrive ? 1 : input.actionValue('throttle');
    phys.controls.brake = input.actionValue('brake');
    phys.controls.steer = input.steerAxis();
    phys.controls.handbrake = input.isDown('handbrake');

    // Fixed-step physics. Props run on the SAME accumulator, so the van's pose
    // is current before contacts are found and its reaction is drained after.
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 12) {
      phys.step(FIXED);
      if (props) {
        props.world.setVehiclePose(phys.position, phys.quaternion, phys.velocity, phys.angularVelocity);
        props.world.step(FIXED);
        props.world.applyVanReaction(phys);
      }
      acc -= FIXED;
      steps++;
    }
    if (props) props.update();

    // Edge-triggered keys
    if (input.pressed('reset')) phys.resetToRoad();
    if (input.pressed('debug')) debug.toggle();
    if (input.pressed('mute')) {
      const muted = audio.toggleMute();
      soundtrack.audio.muted = muted;
      hud.setAudioStatus?.(muted ? 'muted' : 'on');
      hud.toast(muted ? '소리 꺼짐' : '소리 켜짐', muted ? 'Audio muted' : 'Audio on');
    }

    // phys.position is the CENTRE OF MASS; meshPosition is the model origin.
    van.group.position.copy(phys.meshPosition);
    van.group.quaternion.copy(phys.quaternion);
    van.update(dt, phys);
    van.setBraking(phys.controls.brake > 0 && phys.forwardSpeed > 0.5);

    if (!overview) chaseCam.update(dt, phys);
    city.update(dt, camera);
    rain.update(dt, camera);
    orders.update(dt, input);
    const rainAmount = rain.level === 'heavy' ? 1 : rain.level === 'light' ? 0.48 : 0;
    const skid = Math.min(1, Math.max(
      phys.controls.handbrake ? 0.75 : 0,
      phys.speedKmh > 18 ? Math.abs(phys.latG) * 0.9 : 0
    ));
    audio.update({
      speed: phys.forwardSpeed,
      throttle: phys.controls.throttle,
      skid,
      rain: rainAmount,
    });
    hud.setSpeed(phys.speedKmh);
    uiSlice?.update(dt, phys);
    debug.update(dt);

    post.render(dt);
    input.endFrame();

    // renderer.info is reset per render(), so it only means anything AFTER the
    // frame has actually been drawn.
    if (statsEl) {
      const p = phys.meshPosition;
      const tile = city.grid.indexAt(p.x, p.z);
      const vis = city.tiles.reduce((n, t) => n + (t.root.visible ? 1 : 0), 0);
      const det = city.tiles.reduce((n, t) => n + (t.root.visible && t.detail.visible ? 1 : 0), 0);
      const r = renderer.info.render;
      statsEl.textContent =
        `van (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) ` +
        `tile ${tile} of ${city.grid.count} (${vis} drawn, ${det} dressed) | ` +
        `grounded ${phys.groundedWheels}/4 | v ${phys.speedKmh.toFixed(1)} km/h | state ${orders.state}\n` +
        `draws ${r.calls} tris ${(r.triangles / 1000).toFixed(0)}k | ` +
        `props ${props ? props.stats.placed : 0} awake ${props ? props.world.awakeCount : 0} | ` +
        `dt ${dt.toFixed(4)} steps ${steps} vy ${phys.velocity.y.toFixed(2)} | killY ${city.killY.toFixed(2)}`;
    }

    if (firstFrame) {
      firstFrame = false;
      setLoadingProgress(100, '준비 완료 · Ready');
      loadingEl.setAttribute('aria-busy', 'false');
      loadingEl.classList.add('done');
    } else {
      warmNextDistrict();
    }
  });

  // ---- Shader warm-up --------------------------------------------------------
  // A district's materials compile the first time it is drawn, and they all
  // compile in that ONE frame. Measured while driving away from spawn: a single
  // 1,783 ms frame that created 22 programs, with zero geometry and zero texture
  // uploads — pure shader compilation, which is what the mid-drive stutter is.
  //
  // The fix is scheduling, not volume: compile ONE district per frame from the
  // second frame on, so the same total work is paid a few milliseconds at a time
  // while the player is still pulling away, and every district is warm long
  // before it comes into view. 35 districts = 35 frames.
  //
  // This is deliberately NOT renderer.compileAsync() over the whole scene at
  // boot. Despite the name, three walks the entire scene and creates every
  // program synchronously before yielding, which is what used to hang the
  // loading screen at 99% on slower GPUs (see the note above setLoadingProgress).
  // Passing one district root bounds the work per call.
  // The queue holds objects still to be warmed. Anything added to the scene
  // after boot must be queued too — PROPS are the ones that actually caused the
  // measured stutter. They finish loading after the first frame, so the profile
  // reads: one 122 ms frame uploading 32 geometries and 13 textures, then a
  // 1,505 ms frame compiling 22 programs and nothing else, the moment they are
  // first drawn. Districts alone were never the problem.
  function queueWarm(root) {
    if (!root) return;
    // Push children rather than the root when there are many: one compile() call
    // over a whole prop library is the same 1.5 s frame in a different place.
    if (root.children?.length > 4) warmQueue.push(...root.children);
    else warmQueue.push(root);
  }

  function warmNextDistrict() {
    const object = warmQueue.shift();
    if (!object) return;
    // compile() skips hidden objects, and culling may already have hidden this
    // one — force it visible for the call, then restore whatever culling chose.
    const wasVisible = object.visible;
    object.visible = true;
    // Third argument is the lighting context: programs must be compiled against
    // the scene's real lights or they are recompiled on first draw anyway.
    renderer.compile(object, camera, scene);
    object.visible = wasVisible;
  }
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  loadingEl.classList.remove('done');
  loadingEl.classList.add('error');
  loadingEl.setAttribute('role', 'alert');
  loadingEl.setAttribute('aria-busy', 'false');
  loadingEl.querySelector('h1').textContent = '로딩 실패';
  loadingEl.querySelector('.sub').textContent = 'LOAD ERROR';
  loadstatus.textContent = '게임을 시작할 수 없습니다 · The game could not start';
  loaderror.textContent = err?.message || String(err);
});
