// Seoul Snack Attack — boot: renderer, loading, module wiring, main loop.
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Soundtrack } from './core/soundtrack.js';
import { AudioManager } from './core/audio.js';
import { Post } from './core/post.js';
import { createGraphicsQuality, applyGraphicsPreference } from './core/graphics-quality.js';
import { loadCity } from './world/city.js';
import { loadProcCity } from './world/proc/city.js';
import { loadExpanseCity } from './world/expanse-city.js';
import { loadExpanse2City } from './world/expanse2-city.js';
import { loadExpanseProps } from './world/expanse-props.js';
import { loadDistrictDressing } from './world/district-dressing.js';
import { NIGHT } from './world/lighting.js';
import { createTimeOfDay } from './world/time-of-day.js';
import { loadProps } from './world/props.js';
import { Rain } from './world/rain.js';
import { loadVan } from './vehicle/van.js';
import { loadVehicle } from './vehicle/vehicle.js';
import { VehiclePhysics, DEFAULT_PARAMS } from './vehicle/physics.js';
import { getVehicle, VEHICLE_IDS, DEFAULT_VEHICLE } from './game/data/vehicles.js';
import { soundtrackTracks, diveTrack } from './game/data/soundtrack.js';
import { loadSave } from './game/save.js';
import { ChaseCamera } from './vehicle/camera.js';
import { CockpitCamera } from './vehicle/cockpit-camera.js';
import { loadInterior } from './vehicle/interior.js';
import { createDiveController } from './game/dive.js';
import { ABYSS_DEPTH_M } from './world/abyss.js';
import { PlayerCharacter } from './character/controller.js';
import { OnFootCamera } from './character/camera.js';
import { Orders } from './game/orders.js';
import { startFoodBackgroundWarmup } from './game/food-display.js';
import { HUD3 } from './ui/hud3.js';
import { CityMap } from './ui/city-map.js';
import { Settings } from './ui/settings.js';
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
  if (/van\.glb|pocha\.glb/i.test(name)) return '차량 불러오는 중 · Loading vehicle';
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
  // ?car= remains an unrestricted test override. Normal boot uses the player's
  // selected owned vehicle; a fresh save starts with the hero pocha truck.
  const playerSave = loadSave();
  const requestedCarId = qp.get('car') ?? playerSave.vehicle ?? DEFAULT_VEHICLE;
  const carId = VEHICLE_IDS.includes(requestedCarId) ? requestedCarId : DEFAULT_VEHICLE;
  if (carId !== requestedCarId) {
    console.warn(`?car=${requestedCarId} is not a known vehicle (have: ${VEHICLE_IDS.join(', ')}); using ${DEFAULT_VEHICLE}`);
  }
  // Reassigned by the garage's live vehicle swap — see switchVehicle below.
  let vehicleDef = getVehicle(carId);

  // Procedural city remains the default. `?world=expanse` is the staged,
  // kilometre-scale greybox review build; it intentionally ships before its
  // permanent art pass. `?world=expanse2` is the M3 rebuild of that same
  // kilometre — generated streets, blocks and massing — reviewed alongside it
  // and promoted only at M6 (see CITY-REBUILD.md). `?world=block` keeps the
  // authored repeating Seoul block available for regression comparison.
  const requestedWorld = qp.get('world');
  const worldId = ['block', 'expanse', 'expanse2'].includes(requestedWorld)
    ? requestedWorld
    : 'proc';
  // Both kilometre-scale worlds need the far plane pushed out or the ring
  // disappears before its next corner.
  const kilometreWorld = worldId === 'expanse' || worldId === 'expanse2';
  if (kilometreWorld) {
    // The new city is 1 km wide.  Keep distant ring sightlines in the camera
    // frustum while leaving the normal city's depth precision unchanged.
    camera.far = 1600;
    camera.updateProjectionMatrix();
  }
  const [city, firstVehicle] = await Promise.all([
    worldId === 'block'
      ? loadCity(scene, manager, 'assets/world/seoul-block.glb', renderer, setLoadingProgress)
      : worldId === 'expanse'
        ? loadExpanseCity(scene, manager, renderer, setLoadingProgress)
      : worldId === 'expanse2'
        // M4's facade sheets and signage atlas are generated canvases, so the
        // mobile profile buys its VRAM back by painting them at half size.
        // Nothing downstream reads a pixel size — the meshes bake metres into
        // their UVs — so a phone gets the same city, only softer.
        ? loadExpanse2City(scene, manager, renderer, setLoadingProgress, {
          textureScale: graphicsQuality.mobile ? 0.5 : 1,
          // M6's road/pavement surface pool scales its bump strength off the
          // same profile knob the compact city uses, so a phone gets the same
          // city with softer relief rather than a second set of textures.
          detailIntensity: graphicsQuality.profile.detailIntensity,
        })
      : loadProcCity(scene, manager, renderer, setLoadingProgress, undefined, {
        // Detail-map bump strength scales with the gfx profile (mobile dials it down).
        detailIntensity: graphicsQuality.profile.detailIntensity,
      }),
    // Assets built through tools/build-vehicle.mjs carry a baked rig and go
    // through the thin loader; the van is still on its runtime heuristics.
    // See the `van` note in src/game/data/vehicles.js for why it has not moved.
    vehicleDef.loader === 'canonical'
      ? loadVehicle(manager, vehicleDef)
      : loadVan(manager, vehicleDef.asset),
  ]);
  // `let`: the garage swaps this object live — see switchVehicle below.
  let van = firstVehicle;
  setLoadingProgress(94, '게임 시스템 준비 중 · Preparing game systems');
  console.log(`vehicle: ${vehicleDef.nameEn} (${vehicleDef.id}, ${vehicleDef.loader} rig)`);

  // Authored-block dressing is only for `?world=block`. The procedural city
  // labels shops with Hangul neon from the colour bible.
  let district = null;
  if (worldId === 'proc' || kilometreWorld) {
    console.log(
      `world: ${worldId} — ${city.stats.buildings} buildings, ` +
      `${city.pickupSites?.length || 0} labelled shops, ` +
      `${city.stats.roadNodes} nodes / ${city.stats.roadEdges} edges`
    );
  } else if (qp.get('shops') !== 'off') {
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

  const chaseCam = new ChaseCamera(camera, city);
  chaseCam.snapTo(phys);

  // ---- Cockpit view --------------------------------------------------------
  // The interior is a second GLB parented into the vehicle group, not part of
  // the truck asset — src/vehicle/interior.js explains why. It loads AFTER the
  // boot Promise.all rather than inside it: a vehicle that has no cabin (the
  // van) must still reach the road, and a cockpit that fails to load should
  // cost the player the C key, not the game.
  let interior = null;
  const cockpitCam = new CockpitCamera(camera);
  let cockpit = false;
  async function attachInterior(def) {
    interior?.dispose();
    interior = null;
    try {
      interior = await loadInterior(manager, def);
    } catch (err) {
      console.warn(`interior failed to load for ${def.id}, cockpit view disabled:`, err);
    }
    if (!interior) {
      cockpit = false;
      return;
    }
    van.group.add(interior.group);
    cockpitCam.setEye(interior.eye);
    interior.setVisible(cockpit);
    setShellVisible(!cockpit);
  }
  // The exterior shell has to go while the camera is inside it. The cab of the
  // normalised Quaternius truck is not hollow — a raycast from the seated eye
  // hits `body`'s Atlas primitive at 0.37 m, before the windscreen — so this is
  // an occlusion problem, not something single-sided materials solve.
  //
  // KNOWN COST: an invisible mesh is also absent from the shadow map, so the
  // truck stops casting its own shadow on the road while you are sitting in it.
  // The wheels stay, and keep their four contact shadows. Recovering the body
  // shadow means a layer the main camera skips and the shadow camera does not,
  // which is more machinery than a first-person view of your own shadow earns.
  function setShellVisible(on) {
    if (van.body) van.body.visible = on;
  }
  function setCockpit(on, { quiet = false } = {}) {
    const wanted = on && !!interior && player.isDriving;
    if (on && !interior && player.isDriving) {
      // Silence here reads as a broken key. The van has no cabin asset and may
      // never get one; say so rather than swallow the press.
      if (!quiet) hud.toast?.('이 차량은 실내가 없습니다', 'This vehicle has no cabin');
      return;
    }
    if (wanted === cockpit) return;
    cockpit = wanted;
    interior?.setVisible(cockpit);
    setShellVisible(!cockpit);
    if (cockpit) cockpitCam.snapTo();
    else chaseCam.snapTo(phys);
    if (!quiet) hud.toast?.(
      cockpit ? '1인칭 시점' : '3인칭 시점',
      cockpit ? 'Cockpit view' : 'Chase view',
    );
  }

  // ---- World systems --------------------------------------------------------
  const rain = new Rain(scene);
  rain.bind({ city, physics: phys });

  const post = new Post(renderer, scene, camera);
  post.setSize(window.innerWidth, window.innerHeight);

  // Time presets own the sky, ambient/key light, practical lights, exposure,
  // bloom and base fog. Weather remains independent.
  setLoadingProgress(97, '조명 준비 중 · Preparing lighting');
  const timeOfDay = createTimeOfDay({
    scene, renderer, city, post, rain,
    // Forwarded getters: the garage swaps rigs live, and the presets must
    // always light the CURRENT vehicle's lamps.
    van: {
      get headlights() { return van.headlights; },
      get heroFill() { return van.heroFill; },
    },
    initial: qp.get('time') || 'night',
  });

  // ---- Game systems -----------------------------------------------------------
  const input = new Input();
  const hud = new HUD3();
  hud.setControllerStatus(input.supported ? 'waiting' : 'unsupported');
  // Playlist and play ORDER live in src/game/data/soundtrack.js — edit there.
  const soundtrack = new Soundtrack(soundtrackTracks(import.meta.env.BASE_URL), {
    deliveries: playerSave.deliveries, diveTrack: diveTrack(import.meta.env.BASE_URL),
  });
  const audio = new AudioManager({ music: soundtrack });
  hud.bindAudioControls?.({ soundtrack, audio });
  hud.setAudioStatus?.(audio.muted ? 'muted' : 'ready');
  const player = new PlayerCharacter({
    scene, city, phys, hud,
    getVehicleDef: () => vehicleDef,
  });
  const onFootCam = new OnFootCamera(camera, city);
  player.onModeChange = (mode) => {
    hud.setGameplayMode?.(mode);
    input.touch.setGameplayMode?.(mode);
    if (mode === 'driving') {
      chaseCam.snapTo(phys);
    } else if (mode === 'onFoot') {
      // You cannot sit in the cab from the pavement. Stepping out drops the
      // view rather than leaving a hidden cabin and a camera inside a truck
      // the player is no longer in.
      setCockpit(false);
      onFootCam.setHeading(player.heading);
    }
  };
  const orders = new Orders({ scene, city, phys, hud, camera, audio, player });
  // Deferred until here because setCockpit() reads player.isDriving.
  await attachInterior(vehicleDef);
  if (qp.get('view') === 'cockpit') setCockpit(true);

  // ---- The abyssal dive -----------------------------------------------------
  // Only in the rebuild: the ramp is geometry that expanse2-city.js builds into
  // its collider, so in any other world there is nothing to drive off and the
  // controller would be watching a trigger volume that stands in open air.
  const dive = createDiveController({
    scene, camera, city, phys, van, hud, audio, post,
    lights: city.lights,
    // Forwarded getters, same reason as timeOfDay's: the garage swaps rigs live.
    vehicle: { get headlights() { return van.headlights; } },
    onRumble: (severity) => { chaseCam.onCrash(severity); cockpitCam.onCrash(severity); },
    graphicsQuality,
    enabled: worldId === 'expanse2',
    // Quiet: the dive stages its own camera moves and tells the player how to
    // change view once it lands in the cab.
    setCockpit: (on) => setCockpit(on, { quiet: true }),
    setShellVisible,
    isCockpit: () => cockpit,
  });
  // `?dive=1` drops straight into the abyss, `?dive=ramp` lines the jump up.
  // Same shape as the other probe hooks documented in the README.
  const diveHook = qp.get('dive');
  if (diveHook) await dive.debugEnter(diveHook === 'ramp' ? 'ramp' : 'abyss');
  let onboardingPaused = hud.isOnboardingVisible?.() ?? false;
  let garagePaused = false;
  let mapPaused = false;
  let settingsPaused = false;
  let cassettePaused = false;
  const syncOverlayPause = () => {
    const paused = onboardingPaused || garagePaused || mapPaused || settingsPaused || cassettePaused;
    orders.setPaused?.(paused);
    input.setTouchSuspended(paused);
  };
  const cityMap = new CityMap({
    city, orders, player,
    onToggle: (open) => {
      mapPaused = open;
      syncOverlayPause();
    },
  });
  syncOverlayPause();
  hud.onStart?.(() => {
    onboardingPaused = false;
    syncOverlayPause();
    if (orders.state === 'idle') orders.offerNow(null, { first: true });
  });

  // ---- Garage ---------------------------------------------------------------
  // The HUD's garage overlay lists the roster. Choosing a car buys it when
  // needed (orders.purchaseVehicle persists through save.js under the
  // `snack-attack-save` key) and swaps the rig IN PLACE via switchVehicle
  // below — same loaders as boot, no page reload. The debug menu deliberately
  // keeps its reload picker so QA can compare cars under one set of URL flags.
  let vehicleSwap = Promise.resolve();

  async function switchVehicle(id) {
    const nextDef = getVehicle(id);
    if (!nextDef || nextDef.id === vehicleDef.id) return;
    hud.toast(`${nextDef.nameKo}로 교체 중…`, `Switching to ${nextDef.nameEn}…`);
    // Capture the pose BEFORE the await: loading yields to the render loop,
    // which keeps moving (and could crash) the rig we are about to replace.
    const position = phys.meshPosition.clone();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(phys.quaternion);
    const heading = Math.atan2(forward.x, forward.z);

    // Same load path as boot — see the Promise.all near the top of boot().
    const next = nextDef.loader === 'canonical'
      ? await loadVehicle(manager, nextDef)
      : await loadVan(manager, nextDef.asset);

    scene.remove(van.group);
    // Reset to DEFAULT_PARAMS first: each def overrides only a subset, and
    // keys unique to the outgoing rig (the pocha's camera offsets, say) would
    // otherwise linger. attach() reads comHeight/mass, so it must follow.
    Object.assign(phys.params, DEFAULT_PARAMS);
    Object.assign(phys.params, nextDef.params, {
      collisionHalf: nextDef.collisionHalf,
      bumperY: nextDef.bumperY,
    });
    phys.attach(next);
    van = next;
    vehicleDef = nextDef;
    phys.place(position, heading);
    scene.add(van.group);
    // The cabin belongs to the rig, so it goes with it. attachInterior keeps
    // the current view if the new vehicle has a cabin; a swap onto one that
    // does not (the van) clears `cockpit` and drops the player to the chase.
    await attachInterior(nextDef);
    if (player.isDriving && !cockpit) chaseCam.snapTo(phys);
    // Props may still be loading (?props=off leaves them null); their loader
    // reads `vehicleDef` on arrival, which now points at the new rig too.
    props?.world.setVehicle({
      half: new THREE.Vector3(nextDef.collisionHalf.x, nextDef.collisionHalf.y, nextDef.collisionHalf.z),
      mass: phys.params.mass,
    });
    debug.setVehicleId?.(nextDef.id);
    if (debugEnabled) window.__seoul.van = van;
    hud.toast(`${nextDef.nameKo} 탑승`, `Driving ${nextDef.nameEn}`);
  }

  function queueVehicleSwap(id) {
    // Serialize: a second click while a GLB loads queues behind it instead of
    // racing two swaps onto one physics rig.
    vehicleSwap = vehicleSwap
      .then(() => switchVehicle(id))
      .catch((err) => console.error('vehicle swap failed:', err));
  }

  hud.configureGarage?.({
    vehicles: VEHICLE_IDS.map(getVehicle),
    currentId: () => vehicleDef.id,
    getSave: () => orders.save,
    onToggle: (open) => {
      // The overlay is a pause screen: timers stop offering/decaying and the
      // pedals go dead until it closes.
      garagePaused = open;
      syncOverlayPause();
    },
    onChoose: (vehicle) => {
      const result = orders.purchaseVehicle(vehicle);
      if (!result.ok) {
        hud.refreshGarage?.();
        return;
      }
      hud.closeGarage?.();
      queueVehicleSwap(vehicle.id);
    },
  });

  // Crash events also shake the camera.
  const orderCrash = phys.onCrash;
  phys.onCrash = (severity, point) => {
    orderCrash?.(severity, point);
    chaseCam.onCrash(severity);
    cockpitCam.onCrash(severity);
    // The dash hippo's head too: a collision never shows up in latG / longG.
    interior?.bump(severity);
    audio.event('impact', severity);
  };
  // Hull strikes in the abyss shake and thump, but spill nothing: the delivery
  // loop is paused down there, so they skip the orders hook on purpose.
  dive.submarine.onHull = (severity) => {
    chaseCam.onCrash(severity);
    cockpitCam.onCrash(severity);
    interior?.bump(severity);
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
    : { toggle() {}, update() {}, attachProps() {}, setEnglishMode() {}, visible: false };

  // Apply the capability-selected rendering budget after debug settings have
  // restored. Desktop values are the existing defaults; only the active mobile
  // profile reduces visual work. Physics and game state are untouched.
  if (graphicsQuality.mobile) {
    post.setScale(graphicsQuality.profile.postScale);
    rain.densityScale *= graphicsQuality.profile.rainDensity;
    city.cullDistance = kilometreWorld ? 280 : graphicsQuality.profile.cullDistance;
    if (kilometreWorld) city.detailDistance = 160;
    city.lights.streetlights.setActiveCount(graphicsQuality.profile.streetlights);
  }

  // ---- ?ui=slice — HUD style slice (see src/ui/slice.js) -------------------
  let uiSlice = null;
  if (qp.get('ui') === 'slice') {
    const { startUISlice } = await import('./ui/slice.js');
    uiSlice = await startUISlice({ hudEl: hud.el, orders, params: qp });
  }

  // Decode and actually render one catalog model per idle slice. This warms
  // geometry, textures, and the real gameplay shader variants without one
  // catalog-wide compile spike. Offered dishes jump to the front of the queue.
  startFoodBackgroundWarmup(renderer, scene);

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
  const richExpanse = worldId === 'expanse'
    && city.expanseData?.layout?.source === 'seoul-expanse-authoring-contract';
  // Gallery mode never scans the city, so it remains shared. Normal Expanse
  // play uses its own deterministic, chunk-owned review slice; the compact
  // layoutWorld() scanner is never invoked over the kilometre-scale map — and
  // the M3 rebuild has no prop pass at all yet, so `?world=expanse2` opts out
  // of it entirely rather than dragging the compact scanner over a kilometre.
  const greyboxRebuild = worldId === 'expanse2' && propMode !== 'gallery';
  if (propMode !== 'off' && !greyboxRebuild && (!richExpanse || propMode === 'gallery')) {
    const loader = propMode === 'gallery'
      ? loadProps(scene, city, { mode: 'gallery', density: 1 })
      : worldId === 'expanse'
        ? loadExpanseProps(scene, city, { density: graphicsQuality.profile.propDensity })
        : loadProps(scene, city, { mode: 'world', density: graphicsQuality.profile.propDensity });
    loader
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
        if (p.group) queueWarm(p.group);
        for (const group of p.groups || []) queueWarm(group);
        debug.attachProps(p);
        if (debugEnabled) window.__seoul.props = p;
        console.log(`props: ${p.stats.placed} placed, ${p.stats.types} types, ${p.stats.bodies} bodies`
          + (p.stats.stage ? `, ${p.stats.stage}` : ''));
      })
      .catch((err) => console.warn('props failed to load, continuing without:', err));
  } else if (richExpanse && propMode !== 'off') {
    // The restored GLB already contains its authored street furniture. The
    // separate 28-object review slice was clearance-tested against the retired
    // 25-node schematic, so do not layer it onto the rich graph by default.
    console.log('props: using authored rich-Expanse street furniture');
  }

  // Console/automated probing handle (spawn placement, physics state). Tied to
  // the same switch as the menu, so tools/probe.mjs works against an internal
  // dist build and not just the dev server.
  if (debugEnabled) {
    window.__seoul = { city, district, van, phys, dive, player, onFootCam, orders, input, cityMap, camera, scene, renderer, grid: city.grid, timeOfDay, debug, audio, soundtrack, graphicsQuality, THREE };
  }

  // ---- Apply test hooks ---------------------------------------------------
  if (qp.get('rain')) rain.setLevel(qp.get('rain'));
  if (qp.get('offer')) {
    orders.offerNow(qp.get('restaurant'));
    if (qp.get('accept')) orders._accept();
  }
  const autoDrive = !!qp.get('auto');
  if (qp.get('mode') === 'foot') player.exitVehicle({ force: true });
  if (qp.get('map') === '1') cityMap.show();

  // Mouse orbit is opt-in through pointer lock in both driving and on-foot
  // modes, so UI overlays and the tape deck remain ordinary clickable DOM.
  // Escape releases it as browsers expect.
  renderer.domElement.addEventListener('pointerdown', () => {
    if (!overview && !document.pointerLockElement && !onboardingPaused && !garagePaused && !mapPaused && !settingsPaused && !cassettePaused) {
      renderer.domElement.requestPointerLock?.();
    }
  });
  // On-screen physics/spawn readout. It used to be `?stats=1` and nothing else,
  // which meant the only way to have it was to have it permanently, parked over
  // the road in monospace green. It is a settings toggle now (Developer tools >
  // Performance overlay, persisted per browser); `?stats=1` starts it on so
  // tools/probe.mjs --dump-dom keeps working against a plain URL.
  const statsForced = qp.get('stats') === '1';
  const statsEl = document.createElement('div');
  statsEl.id = 'stats';
  statsEl.style.cssText =
    'position:fixed;bottom:80px;left:12px;color:#7bff9e;font:12px monospace;z-index:99;white-space:pre;text-shadow:0 1px 2px #000';
  document.body.appendChild(statsEl);
  const setStatsVisible = (on) => {
    statsEl.hidden = !on;
    // `hidden` alone loses to the inline `position:fixed` cascade in some
    // browsers, so take the layout out too.
    statsEl.style.display = on ? '' : 'none';
  };
  setStatsVisible(statsForced);

  // ---- Settings --------------------------------------------------------------
  // Player settings also link to tuning; backtick opens tuning directly.
  // `?stats=1` selects the switch's initial position,
  // but the player can still turn it off during that run.
  const settings = new Settings({
    graphicsQuality,
    setGraphicsPreference: applyGraphicsPreference,
    debugMenuAvailable: debugEnabled,
    initialPerfOverlay: statsForced ? true : null,
    onOpenDebugMenu: () => debug.toggle(),
    onOpenCassette: hud.deck ? () => hud.deck.open() : null,
    onPerfOverlay: (on) => setStatsVisible(on),
    onToggle: (open) => {
      settingsPaused = open;
      syncOverlayPause();
    },
  });
  setStatsVisible(settings.perfOverlay);
  if (hud.deck) hud.deck.onToggle = (open) => {
    cassettePaused = open;
    if (open) {
      settings.close();
      if (debug.visible) debug.toggle();
      if (cityMap.isOpen) cityMap.hide();
      hud.closeGarage?.();
      input.keys.clear();
    }
    syncOverlayPause();
  };
  hud.onSettings?.(() => settings.toggle());
  // Escape is the conventional pause/settings door. Other overlays consume it
  // first; when none is open it brings up Settings, and it also backs out of
  // the internal tuning tree.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (debug.visible) {
      event.preventDefault();
      debug.toggle();
    } else if (garagePaused) {
      event.preventDefault();
      hud.closeGarage?.();
    } else if (!mapPaused && !settings.isOpen()) {
      event.preventDefault();
      settings.open();
    }
  });

  // Static cameras for map QA. `shop=<restaurant id>` is deliberately a test
  // hook, not gameplay: it frames the authored pickup front for visual probes.
  const shopView = qp.get('shop');
  // Both kilometre worlds get staged review cameras; the rebuild adds its own
  // because M3 is reviewed before it is played (see CITY-REBUILD.md).
  const expanseView = kilometreWorld ? qp.get('expanseView') : null;
  const overview = !!qp.get('overview') || !!shopView || !!expanseView;
  if (overview) {
    const site = shopView && city.pickupSites.find((p) => p.id === shopView);
    const expanseViews = {
      station: { camera: [4, 11, -4], target: [0, 5, -100] },
      market: { camera: [84, 12, 48], target: [176, 5, -16] },
      bridge: { camera: [32, 12, 240], target: [0, 4, 158] },
      westBridge: { camera: [-214, 12, 238], target: [-245, 7, 170] },
      eastBridge: { camera: [272, 10, 238], target: [235, 4, 170] },
      hills: { camera: [-60, 22, -330], target: [-175, 12, -235] },
      hongdae: { camera: [-170, 14, -175], target: [-260, 6, -65] },
      hangang: { camera: [-30, 14, 230], target: [-115, 6, 300] },
      pocha: { camera: [245, 12, 205], target: [290, 5, 300] },
      tunnel: { camera: [415, 6.5, -205], target: [415, 5, -145] },
      propsStation: { camera: [4, 7, -101.8], target: [-11, 1.6, -101.8] },
      propsHongdae: { camera: [-308, 7, -160], target: [-305, 1.6, -174] },
      propsHangang: { camera: [-130, 6.5, 197], target: [-130, 1, 210.7] },
      // M3 rebuild review slice. `plan` is the whole city from directly above,
      // for comparison against the M1/M2 drawing. The rest are eye-height views
      // down the densest street each district generated — chosen from the
      // generator output rather than guessed, so they stay pointed at buildings
      // if the seed ever moves.
      plan: { camera: [0, 900, 1], target: [0, 0, 0] },
      massingHills: { camera: [-173.5, 5.2, -213], target: [-119.8, 7, -203.2] },
      massingHongdae: { camera: [-268, 5.2, -115.7], target: [-286.1, 7, -157.2] },
      massingStation: { camera: [-54.1, 5.2, -62.4], target: [-56.2, 7, -22.6] },
      massingMarket: { camera: [98.9, 5.2, 31.8], target: [148.3, 7, 22.7] },
      massingHangang: { camera: [-128.7, 5.2, 90], target: [-85.7, 7, 90] },
      massingPocha: { camera: [303.4, 5.2, 57.2], target: [290.9, 7, 18.8] },
      // Down the ring's 175 m west straight: the sightline the whole map exists
      // for, and the one place massing intruding on the carriageway would show.
      massingRing: { camera: [-430, 6.5, -20], target: [-430, 7.5, -186] },
      // M4 facade review slice. Picked by tools/pick-facade-cameras.mjs from
      // the generator output rather than guessed, on the same principle as the
      // M3 district views: each one frames what M4 actually delivers.
      //
      //   facadeShop   — a shopfront at standing height: glass, fascia board,
      //                  awning and blade sign in one frame.
      //   facadeRoofs  — the roofscape of the densest chunk, where the parapets
      //                  and the setback ledges are the whole picture.
      //   facadeColour — three districts at once from 210 m, which is the only
      //                  shot that reviews the colour rule rather than one
      //                  district's palette.
      facadeShop: { camera: [-230.7, 2.3, 91.5], target: [-230.7, 2.6, 76.5] },
      facadeRoofs: { camera: [-242, 58, -114.9], target: [-147, 12, -19.9] },
      facadeColour: { camera: [-91.4, 210, 201.9], target: [-91.4, 8, -88.1] },
      // M5 review slice.
      //   shopBoard     — standing outside Hongdae Chimaek Street: the bound
      //                   storefront, its name board and its blade. This is
      //                   the same frontage `facadeShop` reviews, which is how
      //                   M5 is checked against M4 rather than beside it.
      //   landmarkTower — the Bukak radio tower across two districts, which is
      //                   the shot that asks whether a landmark is doing its
      //                   job at the far end of a sightline.
      shopBoard: { camera: [-230.7, 5.4, 94.5], target: [-230.7, 5.05, 81.5] },
      landmarkTower: { camera: [-44.5, 45, -53.3], target: [-194.5, 45.3, -203.3] },
    };
    const staged = expanseView && expanseViews[expanseView];
    if (staged) {
      camera.position.fromArray(staged.camera);
      camera.lookAt(...staged.target);
      city.cullDistance = 1500;
    } else if (site) {
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
      city.detailDistance = span * 2;
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
  // Only un-pause what WE paused. A player who paused or muted the tape deck
  // must not have it start up again just because they took a call —
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
    soundtrack.update(dt);
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
    settings.setEnglishMode(englishMode);
    if (input.hadActivity) {
      if (!soundtrack.started) soundtrack.play();
      if (!audio.started || audio.ctx?.state === 'suspended') {
        audio.wake();
        hud.setAudioStatus?.(audio.muted ? 'muted' : audio.available ? 'on' : 'blocked');
      }
    }

    if (input.pressed('cassette')) hud.deck?.toggle();
    if (!cassettePaused && input.pressed('map')) {
      if (cityMap.isOpen) cityMap.hide();
      else {
        if (garagePaused) hud.closeGarage?.();
        settings.close();
        cityMap.show();
      }
    }

    // Controls. Written to whichever rig is live, so W/A/S/D mean the same
    // things in the trench that they mean on the ring road — the submarine
    // reinterprets them as thrust and rudder, and adds ballast on Space/Shift.
    const drive = dive.physics;
    drive.controls.throttle = player.isDriving ? (autoDrive ? 1 : input.actionValue('throttle')) : 0;
    drive.controls.brake = player.isDriving ? input.actionValue('brake') : 0;
    drive.controls.steer = player.isDriving ? input.steerAxis() : 0;
    drive.controls.handbrake = player.isDriving && input.isDown('handbrake');
    if (garagePaused || mapPaused || settingsPaused || cassettePaused || !player.isDriving) {
      drive.controls.throttle = 0;
      drive.controls.brake = 0;
      drive.controls.steer = 0;
      // The brake input also means reverse at low speed. Use the rear
      // handbrake as a true parking brake while the courier is outside.
      drive.controls.handbrake = !player.isDriving;
    }

    if (!garagePaused && !mapPaused && !settingsPaused && !cassettePaused && input.pressed('interact')) {
      if (player.isDriving) player.exitVehicle();
      else if (player.mode === 'onFoot') player.beginEnterVehicle();
    }

    // Fixed-step physics. Props run on the SAME accumulator, so the van's pose
    // is current before contacts are found and its reaction is drained after.
    if (!mapPaused && !cassettePaused) acc += dt;
    else acc = 0;
    let steps = 0;
    const footForward = onFootCam.forward;
    while (acc >= FIXED && steps < 12) {
      // While the dive owns the truck it is writing the pose itself — on a
      // scripted rail down the Drain, or through the submarine integrator — so
      // the road model must not also be stepping it.
      if (dive.suspendRoadPhysics) dive.stepFixed(FIXED, input);
      else phys.step(FIXED);
      player.updateFixed(FIXED, input, footForward);
      // Props are a surface-city system: there is nothing to bump into 200 m
      // under the Han, and feeding them a submarine's pose would have them
      // chasing the truck down the hole.
      if (props && !dive.suspendRoadPhysics) {
        props.world.setVehiclePose(phys.position, phys.quaternion, phys.velocity, phys.angularVelocity);
        props.world.step(FIXED);
        props.world.applyVanReaction(phys);
      }
      acc -= FIXED;
      steps++;
    }
    if (props) props.update();
    if (!cassettePaused) dive.update(dt, input);
    // The rig whose pose is real this frame: the road model on the surface, the
    // submarine below it. Everything downstream reads this rather than `phys`.
    const rig = dive.physics;

    // Edge-triggered keys
    if (!mapPaused && !settingsPaused && !cassettePaused && input.pressed('reset')) {
      // R underwater would hand the truck back to a road model that is not
      // running and drop it at a carriageway 200 m above. Put it back under the
      // mouth instead, which is the only "known good" pose the abyss has.
      if (dive.isSubmerged) dive.resetInAbyss();
      else if (player.isDriving) phys.resetToRoad();
      else player.resetToRoad();
    }
    // Backtick opens tuning directly, including from Settings. Keep one menu
    // visible at a time; Escape retains its existing overlay/back behavior.
    if (!mapPaused && !cassettePaused && debugEnabled && input.pressed('debug')) {
      settings.close();
      debug.toggle();
      if (debug.visible) document.exitPointerLock?.();
    }
    if (!mapPaused && !cassettePaused && input.pressed('settings')) {
      if (debug.visible) debug.toggle();
      else settings.toggle();
    }
    // Neither view key works during the outside whirlpool shot: the dive owns the
    // camera and has deliberately put the body shell back on.
    if (!mapPaused && !settingsPaused && !cassettePaused && !dive.ownsCamera && input.pressed('view')) setCockpit(!cockpit);
    // V / D-pad up cycles the chase framing, low -> medium -> high. From the cab
    // it drops to the chase at the current angle rather than doing nothing.
    if (!mapPaused && !settingsPaused && !cassettePaused && !dive.ownsCamera && player.isDriving && input.pressed('camAngle')) {
      if (cockpit) setCockpit(false);
      else {
        const angle = chaseCam.cycleAngle();
        hud.toast?.(`카메라 각도 · ${angle.ko}`, `Camera angle · ${angle.en}`);
      }
    }

    // rig.position is the CENTRE OF MASS; meshPosition is the model origin.
    // Both rigs use the same comOffset, so this line is identical either way.
    van.group.position.copy(rig.meshPosition);
    van.group.quaternion.copy(rig.quaternion);
    van.update(dt, rig);
    van.setBraking(rig.controls.brake > 0 && rig.forwardSpeed > 0.5);
    // The second dial is a depth gauge underwater and a parked needle above it —
    // see setDepthMode() in src/vehicle/interior.js.
    interior?.setDepthMode(dive.isSubmerged ? ABYSS_DEPTH_M : null);
    // Cheap while hidden: update() rides the dome lamp to zero and returns
    // before touching an instrument the player cannot see.
    interior?.update(dt, rig);

    if (!overview && !mapPaused && !cassettePaused) {
      const lookAxes = input.consumeLookAxes();
      // Pull the chase camera in against whichever world the truck is in — the
      // city's collider is 60 m overhead and knows nothing about the abyss walls.
      // Scripted stretches (the whirlpool, the Drain, the spit) get no pull-in:
      // the truck is under the river bed there, and the city collider would
      // yank the camera into the cab from below.
      chaseCam.city = dive.isSubmerged && dive.abyss ? dive.abyss
        : dive.suspendRoadPhysics ? null : city;
      if (dive.ownsCamera) dive.updateCamera(dt, camera);
      else if (!player.isDriving && !dive.suspendRoadPhysics) onFootCam.update(dt, player, lookAxes);
      else if (cockpit) cockpitCam.update(dt, rig, lookAxes);
      else chaseCam.update(dt, rig, lookAxes);
      dive.afterCamera(dt, camera);
    }
    player.updateVisual(dt);
    // Surface-city systems. The city is hidden while the dive owns the camera,
    // so its chunk culling and streetlight pool have nothing to decide, and the
    // delivery loop's navigation would be routing a submarine along a road.
    if (!dive.suspendRoadPhysics) {
      city.update(dt, camera);
      rain.update(dt, camera);
      orders.update(dt, input);
    }
    const rainAmount = rain.level === 'heavy' ? 1 : rain.level === 'light' ? 0.48 : 0;
    const skid = Math.min(1, Math.max(
      rig.controls.handbrake ? 0.75 : 0,
      rig.speedKmh > 18 ? Math.abs(rig.latG) * 0.9 : 0
    ));
    audio.update({
      speed: player.isDriving && !mapPaused ? rig.forwardSpeed : 0,
      throttle: player.isDriving && !mapPaused ? rig.controls.throttle : 0,
      // No tire noise underwater, and no rain under the river.
      skid: mapPaused || dive.suspendRoadPhysics ? 0 : skid,
      rain: dive.suspendRoadPhysics ? 0 : rainAmount,
    });
    hud.setSpeed(player.isDriving ? rig.speedKmh : 0);
    uiSlice?.update(dt, rig);
    debug.update(dt);

    post.render(dt);
    input.endFrame();

    // renderer.info is reset per render(), so it only means anything AFTER the
    // frame has actually been drawn.
    if (!statsEl.hidden) {
      const p = rig.meshPosition;
      const tile = city.grid.indexAt(p.x, p.z);
      const vis = city.tiles.reduce((n, t) => n + (t.root.visible ? 1 : 0), 0);
      const det = city.tiles.reduce((n, t) => n + (t.root.visible && t.detail.visible ? 1 : 0), 0);
      const chunks = city.chunkStats;
      const r = renderer.info.render;
      statsEl.textContent =
        `van (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) ` +
        `tile ${tile} of ${city.grid.count} (${vis} drawn, ${det} dressed) | ` +
        `mode ${player.mode} | locomotion ${player.state} | grounded ${player.isDriving ? `${rig.groundedWheels}/4` : player.grounded}\n` +
        `v ${rig.speedKmh.toFixed(1)} km/h | order ${orders.state} | dive ${dive.state}` +
        (dive.isSubmerged ? ` | depth ${dive.depthM.toFixed(0)} m` : '') + `\n` +
        (chunks ? `chunks ${chunks.visible}/${chunks.total} detail ${chunks.detailed} micro ${chunks.micro} | ` : '') +
        `draws ${r.calls} tris ${(r.triangles / 1000).toFixed(0)}k | ` +
        `props ${props ? props.stats.placed : 0} awake ${props ? props.world.awakeCount : 0} | ` +
        `dt ${dt.toFixed(4)} steps ${steps} vy ${rig.velocity.y.toFixed(2)} | killY ${city.killY.toFixed(2)}`;
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
