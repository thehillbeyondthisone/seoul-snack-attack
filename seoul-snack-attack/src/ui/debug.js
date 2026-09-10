// Seoul Snack Attack — debug menu (lil-gui, toggle with backtick, hidden by default).
import * as THREE from 'three';
import GUI from 'lil-gui';
import { VEHICLES, VEHICLE_IDS, DEFAULT_VEHICLE } from '../game/data/vehicles.js';

const SETTINGS_KEY = 'seoul-snack-attack-debug-settings-v1';

function loadSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage may be blocked */ }
}

function copySettings(settings, section, source, keys) {
  settings[section] = Object.fromEntries(keys
    .filter((key) => source[key] !== undefined)
    .map((key) => [key, source[key]]));
  saveSettings(settings);
}

function restoreSection(settings, section, target, keys) {
  const saved = settings[section];
  if (!saved || typeof saved !== 'object') return;
  for (const key of keys) {
    if (saved[key] !== undefined && typeof saved[key] === typeof target[key]) target[key] = saved[key];
  }
}

// The minimap's base orientation was corrected from south-up to true north-up
// (see minimapArrowRotation in src/ui/hud3.js). Anyone who ticked "flip Y" to
// work around the old upside-down map has that stored in localStorage, and
// restoring it would silently put their map back the way it was. Drop the
// stored flips once, per browser, rather than discarding every other tuned
// value by bumping SETTINGS_KEY.
const MAP_CONVENTION = 2;

function migrateMapConvention(settings) {
  if ((settings.mapConvention || 1) >= MAP_CONVENTION) return settings;
  if (settings.map) { delete settings.map.flipX; delete settings.map.flipY; }
  settings.mapConvention = MAP_CONVENTION;
  saveSettings(settings);
  return settings;
}

export function initDebug({ orders, rain, phys, post, van, cam, city, scene, timeOfDay, vehicleDef, hud }) {
  const settings = migrateMapConvention(loadSettings());
  const persist = (section, source, keys) => () => copySettings(settings, section, source, keys);
  const gui = new GUI({ title: '서울 스낵 어택 디버그 · Debug' });
  gui.hide();
  gui.domElement.style.zIndex = '20000';
  const originalLabels = new WeakMap();
  const originalOptions = new WeakMap();
  let menuEnglishMode = false;
  const translations = new Map([
    ['서울 스낵 어택 디버그', 'Seoul Snack Attack Debug'], ['무게 kg', 'Mass kg'],
    ['엔진 힘 N', 'Engine force N'], ['최고속도 m/s', 'Top speed m/s'],
    ['브레이크 N', 'Brake force N'], ['마른 그립 μ', 'Dry grip μ'],
    ['젖은 그립 μ', 'Wet grip μ'], ['타이어 강성', 'Tire stiffness'],
    ['서스펜션 스프링', 'Suspension spring'], ['서스펜션 댐퍼', 'Suspension damper'],
    ['저속 조향각', 'Low-speed steering'], ['고속 조향각', 'High-speed steering'],
    ['다운포스', 'Downforce'], ['픽업지로 텔레포트', 'Teleport to pickup'],
    ['배달지로 텔레포트', 'Teleport to drop-off'], ['블룸 강도', 'Bloom strength'],
    ['블룸 반경', 'Bloom radius'], ['블룸 임계값', 'Bloom threshold'],
    ['맑음 clear', 'Clear'], ['가랑비 light', 'Light rain'], ['폭우 heavy', 'Heavy rain'],
    ['밤 · Night', 'Night'], ['낮 · Day', 'Day'], ['없음 None', 'None'],
  ]);
  const englishLabel = (label) => {
    if (!label) return label;
    if (translations.has(label)) return translations.get(label);
    const parts = label.split(' · ');
    if (parts.length > 1) return parts.at(-1);
    return label;
  };
  const foldersRecursive = (root) => [root, ...(root.folders || []).flatMap(foldersRecursive)];
  const localizeMenu = (active, force = false) => {
    if (!force && menuEnglishMode === active) return;
    menuEnglishMode = active;
    for (const folder of foldersRecursive(gui)) {
      if (!originalLabels.has(folder)) originalLabels.set(folder, folder._title || '');
      const source = originalLabels.get(folder);
      folder.title(active ? englishLabel(source) : source);
    }
    for (const controller of gui.controllersRecursive()) {
      if (!originalLabels.has(controller)) originalLabels.set(controller, controller._name || '');
      const source = originalLabels.get(controller);
      controller.name(active ? englishLabel(source) : source);
    }
    for (const option of gui.domElement.querySelectorAll('option')) {
      if (!originalOptions.has(option)) originalOptions.set(option, option.textContent);
      const source = originalOptions.get(option);
      option.textContent = active ? englishLabel(source) : source;
    }
  };
  // Props load after the first frame, so their folder is built on arrival.
  let propsFolder = null;
  let weatherState = null;
  let mapState = null;

  // ---- Game -------------------------------------------------------------
  const gGame = gui.addFolder('게임 · Game');
  gGame.add({ offer: () => orders.offerNow() }, 'offer').name('지금 주문 생성 · Offer order now');
  gGame.add({ done: () => orders.completeNow() }, 'done').name('주문 즉시 완료 · Complete order');
  gGame.add({ cash: () => orders.addCash(100000) }, 'cash').name('+₩100,000');
  gGame.add({ reset: () => orders.resetSave() }, 'reset').name('세이브 초기화 · Reset save');
  if (settings.game?.freezeTimers !== undefined) orders.freezeTimers = !!settings.game.freezeTimers;
  gGame.add(orders, 'freezeTimers').name('타이머 정지 · Freeze timers')
    .onChange(persist('game', orders, ['freezeTimers']));
  gGame.close();

  // ---- Weather ------------------------------------------------------------
  const weather = {
    level: rain.level,
    density: rain.densityScale,
    windX: rain.wind.x,
    windZ: rain.wind.z,
    fog: rain.baseFog,
    fogWetBoost: rain.fogWetBoost,
    dryRate: rain.wetnessResponse,
    lockWetness: false,
    wetness: 0.65,
    wetGrip: phys.params.wetGripEnabled,
    readWetness: 0,
  };
  const weatherKeys = ['level', 'density', 'windX', 'windZ', 'fog', 'fogWetBoost', 'dryRate', 'lockWetness', 'wetness', 'wetGrip'];
  restoreSection(settings, 'weather', weather, weatherKeys);
  rain.setLevel(weather.level);
  rain.densityScale = weather.density;
  rain.wind.set(weather.windX, 0, weather.windZ);
  rain.baseFog = weather.fog;
  rain.fogWetBoost = weather.fogWetBoost;
  rain.wetnessResponse = weather.dryRate;
  rain.wetnessOverride = weather.lockWetness ? weather.wetness : null;
  phys.params.wetGripEnabled = weather.wetGrip;
  const gWx = gui.addFolder('날씨 · Weather');
  gWx.add(weather, 'level', { '맑음 clear': 'off', '가랑비 light': 'light', '폭우 heavy': 'heavy' })
    .name('날씨 · Condition')
    .onChange((v) => { rain.setLevel(v); persist('weather', weather, weatherKeys)(); });
  gWx.add(weather, 'density', 0, 1, 0.02).name('빗줄기 밀도 · Rain density')
    .onChange((v) => { rain.densityScale = v; persist('weather', weather, weatherKeys)(); });
  gWx.add(weather, 'windX', -8, 8, 0.1).name('바람 X · Wind X')
    .onChange((v) => { rain.wind.x = v; persist('weather', weather, weatherKeys)(); });
  gWx.add(weather, 'windZ', -8, 8, 0.1).name('바람 Z · Wind Z')
    .onChange((v) => { rain.wind.z = v; persist('weather', weather, weatherKeys)(); });

  const gWet = gWx.addFolder('노면 · Road surface');
  // Decoupling these is how you shoot a wet street under a clear sky.
  gWet.add(weather, 'lockWetness').name('젖음 고정 · Lock wetness')
    .onChange((v) => { rain.wetnessOverride = v ? weather.wetness : null; persist('weather', weather, weatherKeys)(); });
  gWet.add(weather, 'wetness', 0, 1, 0.01).name('젖음 정도 · Wetness')
    .onChange((v) => { if (weather.lockWetness) rain.wetnessOverride = v; persist('weather', weather, weatherKeys)(); });
  gWet.add(weather, 'dryRate', 0.05, 3, 0.05).name('건조 속도 · Dry rate')
    .onChange((v) => { rain.wetnessResponse = v; persist('weather', weather, weatherKeys)(); });
  gWet.add(weather, 'wetGrip').name('젖은 노면 그립 · Wet grip')
    .onChange((v) => { phys.params.wetGripEnabled = v; persist('weather', weather, weatherKeys)(); });
  const wetRead = gWet.add(weather, 'readWetness').name('현재 젖음 · Current').listen();
  wetRead.domElement.style.pointerEvents = 'none';

  const gFog = gWx.addFolder('안개 · Fog');
  const fogDensityController = gFog.add(weather, 'fog', 0.002, 0.06, 0.001).name('밀도 · Density')
    .onChange((v) => { rain.baseFog = v; persist('weather', weather, weatherKeys)(); });
  gFog.add(weather, 'fogWetBoost', 0, 2, 0.05).name('비올 때 증가 · Wet boost')
    .onChange((v) => { rain.fogWetBoost = v; persist('weather', weather, weatherKeys)(); });
  const fogColorState = { c: '#121a30' };
  if (settings.weather?.fogColor) fogColorState.c = settings.weather.fogColor;
  const fogColorController = gFog.addColor(fogColorState, 'c').name('색 · Colour')
    .onChange((v) => {
      if (city?.fog) city.fog.color.set(v);
      settings.weather = { ...(settings.weather || {}), fogColor: v };
      saveSettings(settings);
    });
  if (city?.fog) city.fog.color.set(fogColorState.c);
  gWx.close();
  weatherState = weather;

  // ---- Vehicle --------------------------------------------------------------
  const gVeh = gui.addFolder('차량 · Vehicle');
  const p = phys.params;

  // Vehicle picker. Swapping live would mean re-attaching the physics rig and
  // rebinding every consumer that captured the old object at boot (the
  // time-of-day preset owns the headlights, this menu owns `phys.params`), so
  // this reloads with ?car= instead. Other query params are preserved, which
  // matters because the useful case is comparing two cars under one set of
  // test flags.
  const carId = vehicleDef?.id ?? DEFAULT_VEHICLE;
  const carOptions = Object.fromEntries(
    VEHICLE_IDS.map((id) => [`${VEHICLES[id].nameKo} · ${VEHICLES[id].nameEn}`, id]),
  );
  gVeh.add({ car: carId }, 'car', carOptions).name('차량 선택 · Vehicle')
    .onChange((id) => {
      if (id === carId) return;
      const url = new URL(location.href);
      url.searchParams.set('car', id);
      location.href = url.toString();
    });

  // Tuning is persisted PER VEHICLE. On a shared key the van's saved mass and
  // spring rate would be restored straight over the pocha's on the next
  // boot, silently undoing everything in src/game/data/vehicles.js. The key
  // is read live: the garage swaps rigs in place and setVehicleId() moves
  // both persistence and restore onto the new id.
  let vehicleSection = `vehicle:${carId}`;
  const vehicleKeys = ['mass', 'engineForce', 'maxSpeed', 'brakeForce', 'gripDry', 'gripWet', 'tireStiffness', 'springK', 'damperC', 'steerLockLow', 'steerLockHigh', 'downforce'];
  restoreSection(settings, vehicleSection, p, vehicleKeys);
  const saveVehicle = () => copySettings(settings, vehicleSection, p, vehicleKeys);
  // Ranges span both vehicles: the van's springK 38000 and the pocha's
  // damperC 4200 would each fall outside a single-vehicle slider range.
  for (const [key, min, max, step, label] of [
    ['mass', 500, 2500, 10, '무게 kg'], ['engineForce', 3000, 20000, 100, '엔진 힘 N'],
    ['maxSpeed', 15, 60, 1, '최고속도 m/s'], ['brakeForce', 5000, 30000, 100, '브레이크 N'],
    ['gripDry', 0.4, 1.8, 0.01, '마른 그립 μ'], ['gripWet', 0.3, 1.5, 0.01, '젖은 그립 μ'],
    ['tireStiffness', 3, 20, 0.5, '타이어 강성'], ['springK', 8000, 100000, 500, '서스펜션 스프링'],
    ['damperC', 800, 12000, 100, '서스펜션 댐퍼'], ['steerLockLow', 0.2, 1.0, 0.01, '저속 조향각'],
    ['steerLockHigh', 0.03, 0.4, 0.01, '고속 조향각'], ['downforce', 0, 40, 0.5, '다운포스'],
  ]) gVeh.add(p, key, min, max, step).name(label).onChange(saveVehicle);
  gVeh.add({ tp1: () => orders.teleportPickup() }, 'tp1').name('픽업지로 텔레포트');
  gVeh.add({ tp2: () => orders.teleportDropoff() }, 'tp2').name('배달지로 텔레포트');
  gVeh.add({ rs: () => phys.resetToRoad() }, 'rs').name('스폰 리셋 · Reset');
  gVeh.close();

  // ---- Post FX ---------------------------------------------------------------
  const TONEMAPS = {
    'ACES 필믹': THREE.ACESFilmicToneMapping,
    'AgX': THREE.AgXToneMapping,
    'Neutral': THREE.NeutralToneMapping,
    'Cineon': THREE.CineonToneMapping,
    'Reinhard': THREE.ReinhardToneMapping,
    '없음 None': THREE.LinearToneMapping,
  };
  const renderer = post.renderer;
  const fx = {
    bloom: true,
    strength: post.bloom.strength,
    radius: post.bloom.radius,
    threshold: post.bloom.threshold,
    tonemap: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    scale: 1.0,
    postEnabled: true,
    fps: 0,
    draws: 0,
    tris: 0,
  };
  const fxKeys = ['bloom', 'strength', 'radius', 'threshold', 'tonemap', 'exposure', 'scale', 'postEnabled'];
  restoreSection(settings, 'post', fx, fxKeys);
  post.enabled = fx.postEnabled;
  post.setBloom(fx.bloom);
  post.setBloomStrength(fx.strength);
  post.bloom.radius = fx.radius;
  post.bloom.threshold = fx.threshold;
  renderer.toneMapping = Number(fx.tonemap);
  renderer.toneMappingExposure = fx.exposure;
  post.setScale(fx.scale);
  const saveFx = persist('post', fx, fxKeys);
  const gFX = gui.addFolder('후처리 · Post FX');
  gFX.add(fx, 'postEnabled').name('후처리 사용 · Post enabled')
    .onChange((v) => { post.enabled = v; saveFx(); });

  const gBloom = gFX.addFolder('블룸 · Bloom');
  gBloom.add(fx, 'bloom').name('사용 · Enabled').onChange((v) => { post.setBloom(v); saveFx(); });
  gBloom.add(fx, 'strength', 0, 2, 0.01).name('강도 · Strength').onChange((v) => { post.setBloomStrength(v); saveFx(); });
  gBloom.add(fx, 'radius', 0, 1.5, 0.01).name('반경 · Radius').onChange((v) => { post.bloom.radius = v; saveFx(); });
  // Above 1.0 only genuinely hot pixels bloom — below it, bright signage smears.
  gBloom.add(fx, 'threshold', 0, 2, 0.01).name('임계값 · Threshold').onChange((v) => { post.bloom.threshold = v; saveFx(); });

  const gTone = gFX.addFolder('톤 매핑 · Tone mapping');
  gTone.add(fx, 'tonemap', TONEMAPS).name('커브 · Curve').onChange((v) => {
    renderer.toneMapping = Number(v);
    // Every material has to recompile against the new tone-mapping curve.
    scene?.traverse?.((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) m.needsUpdate = true;
    });
    saveFx();
  });
  gTone.add(fx, 'exposure', 0.2, 3, 0.01).name('노출 · Exposure')
    .onChange((v) => { renderer.toneMappingExposure = v; if (city?.nightRig) city.nightRig.params.exposure = v; saveFx(); });

  gFX.add(fx, 'scale', 0.5, 1.5, 0.05).name('해상도 배율 · Res scale').onChange((v) => { post.setScale(v); saveFx(); });

  const gPerf = gFX.addFolder('성능 · Performance');
  for (const k of ['fps', 'draws', 'tris']) {
    const c = gPerf.add(fx, k).name({ fps: 'FPS', draws: '드로우콜 · Draw calls', tris: '삼각형 · Triangles' }[k]).listen();
    c.domElement.style.pointerEvents = 'none';
  }
  gFX.close();
  const fxState = fx;

  // ---- Lighting ----------------------------------------------------------
  // Art direction is a feedback loop, so every value in the night rig is live.
  if (city?.nightRig) {
    if (settings.lighting?.mode && timeOfDay) timeOfDay.set(settings.lighting.mode);
    const N = city.nightRig.params;
    const lightingKeys = ['mode', 'exposure', 'hemiIntensity', 'ambientIntensity', 'moonIntensity', 'envIntensity', 'fogDensity', 'emissiveBoost', 'lampIntensity', 'bloomStrength', 'bloomRadius', 'bloomThreshold'];
    restoreSection(settings, 'lighting', N, lightingKeys.filter((key) => key !== 'mode'));
    rain.baseFog = N.fogDensity;
    weather.fog = N.fogDensity;
    const saveLighting = () => {
      settings.lighting = { mode: timeOfDay?.mode || N.mode };
      copySettings(settings, 'lighting', { ...N, mode: settings.lighting.mode }, lightingKeys);
    };
    const re = () => city.nightRig.apply();
    const gL = gui.addFolder('조명 · Lighting');
    if (timeOfDay) {
      gL.add(timeOfDay.state, 'mode', { '밤 · Night': 'night', '낮 · Day': 'day' })
        .name('시간대 · Time of day')
        .onChange((v) => {
          const active = timeOfDay.set(v);
          weather.fog = active.fogDensity;
          fogColorState.c = `#${active.fogColor.toString(16).padStart(6, '0')}`;
          fx.exposure = active.exposure;
          fx.strength = active.bloomStrength;
          fx.radius = active.bloomRadius;
          fx.threshold = active.bloomThreshold;
          fogDensityController.updateDisplay();
          fogColorController.updateDisplay();
          for (const controller of gL.controllersRecursive()) controller.updateDisplay();
          for (const controller of gFX.controllersRecursive()) controller.updateDisplay();
          saveLighting();
        });
    }
    const live = (key, min, max, step, label) => gL.add(N, key, min, max, step).name(label).onChange(() => { re(); saveLighting(); });
    live('exposure', 0.4, 2.0, 0.01, '노출 · Exposure');
    live('hemiIntensity', 0, 1.5, 0.01, '하늘광 · Hemisphere');
    live('ambientIntensity', 0, 1.0, 0.01, '환경광 · Ambient');
    live('moonIntensity', 0, 2.5, 0.01, '주광 · Key light');
    live('envIntensity', 0, 2.0, 0.01, '반사 환경 · Env');
    gL.add(N, 'fogDensity', 0.002, 0.05, 0.001).name('안개 · Fog').onChange((v) => {
      rain.baseFog = v;
      weather.fog = v;
      fogDensityController.updateDisplay();
      re(); saveLighting();
    });
    gL.add(N, 'emissiveBoost', 0.2, 6, 0.05).name('네온 밝기 · Emissive')
      .onChange((v) => { for (const m of city.emissiveMaterials) m.emissiveIntensity = v; saveLighting(); });
    gL.add(N, 'lampIntensity', 0, 200, 1).name('가로등 · Lamp')
      .onChange((v) => {
        city.lights.streetlights.intensity = v;
        city.lights.streetlights.enabled = v > 0.01; saveLighting();
      });
    live('bloomStrength', 0, 2, 0.01, '블룸 강도');
    live('bloomRadius', 0, 1.5, 0.01, '블룸 반경');
    live('bloomThreshold', 0, 2, 0.01, '블룸 임계값');
    re();
    if (city.fog && settings.weather?.fogColor) city.fog.color.set(settings.weather.fogColor);
    gL.close();
  }

  // ---- Map ---------------------------------------------------------------
  if (city) {
    const map = { cull: city.cullDistance, tiles: city.grid.count, drawn: 0, flipX: false, flipY: false };
    restoreSection(settings, 'map', map, ['cull', 'flipX', 'flipY']);
    city.cullDistance = map.cull;
    hud?.setMiniMapFlip?.(map.flipX, map.flipY);
    const gM = gui.addFolder('맵 · Map');
    gM.add(map, 'tiles').name('타일 수 · Tiles').disable();
    gM.add(map, 'drawn').name('그려진 타일 · Drawn').listen().disable();
    gM.add(map, 'cull', 60, 400, 5).name('타일 컬링 거리 · Cull dist')
      .onChange((v) => { city.cullDistance = v; copySettings(settings, 'map', map, ['cull', 'flipX', 'flipY']); });
    const saveMapFlip = () => {
      hud?.setMiniMapFlip?.(map.flipX, map.flipY);
      copySettings(settings, 'map', map, ['cull', 'flipX', 'flipY']);
    };
    gM.add(map, 'flipX').name('미니맵 좌우 반전 · Flip minimap X').onChange(saveMapFlip);
    gM.add(map, 'flipY').name('미니맵 상하 반전 · Flip minimap Y').onChange(saveMapFlip);
    gM.close();
    mapState = map;
  }

  // ---- Textures ----------------------------------------------------------
  // Live comparison between the procedural asphalt pool (default) and a
  // downloaded CC0 ambientCG pack. Source toggle: hard switch. Blend slider:
  // 0..1 lerp between the two pairs, applied at runtime by re-baking a single
  // owned texture pair and reassigning the material's normalMap / roughnessMap.
  // The road shader is unchanged — only the textures it samples are.
  if (city?.textures?.asphalt) {
    const asphalt = city.textures.asphalt;
    const tex = {
      source: 'proc',     // 'proc' | 'downloaded'
      blend: 0,           // 0..1
      status: '절차적 only · Procedural only',
    };
    const texKeys = ['source', 'blend'];
    restoreSection(settings, 'textures', tex, texKeys);
    const saveTex = () => copySettings(settings, 'textures', tex, texKeys);

    // The downloaded pack may still be loading when the debug menu opens.
    // Wait on it, then wire the controls. Until then the downloaded option
    // is disabled and the status reflects "loading" so the user is not
    // confused by a missing toggle.
    const refreshStatus = () => {
      const both = asphalt.downloaded && asphalt.blend > 0 && asphalt.source === 'proc';
      if (!asphalt.available) {
        tex.status = asphalt.downloaded == null && asphalt.blend === 0
          ? '절차적 only · Procedural only'
          : '절차적 + 다운로드 · Procedural + downloaded';
      } else if (tex.source === 'downloaded') {
        tex.status = '다운로드 only · Downloaded only';
      } else if (tex.blend >= 0.999) {
        tex.status = '다운로드 only · Downloaded only';
      } else if (tex.blend <= 0.001) {
        tex.status = '절차적 only · Procedural only';
      } else {
        tex.status = `절차적 ${Math.round((1 - tex.blend) * 100)}% · 다운로드 ${Math.round(tex.blend * 100)}%`;
      }
      void both;
    };

    const apply = () => {
      asphalt.source = tex.source;
      asphalt.blend = tex.blend;
      asphalt.apply();
      refreshStatus();
      statusCtrl?.updateDisplay();
    };

    const gTex = gui.addFolder('텍스처 · Textures');
    const sourceCtrl = gTex.add(tex, 'source', {
      '절차적 Procedural': 'proc',
      '다운로드 Downloaded': 'downloaded',
    }).name('소스 · Source').onChange(() => { apply(); saveTex(); });
    const blendCtrl = gTex.add(tex, 'blend', 0, 1, 0.01).name('블렌드 · Blend').onChange(() => { apply(); saveTex(); });
    const statusCtrl = gTex.add(tex, 'status').name('상태 · Status').listen();
    statusCtrl.domElement.style.pointerEvents = 'none';

    // Park the current state onto the handle BEFORE awaiting, so that if the
    // pack has already landed we still re-apply with the user's blend value.
    asphalt.source = tex.source;
    asphalt.blend = tex.blend;
    city.texturesReady?.then((pack) => {
      // Enable the downloaded option now that the pack exists.
      if (pack) {
        sourceCtrl.enable(true);
        if (tex.source === 'downloaded') apply();
      } else {
        // Pack failed to load: force source back to procedural and disable
        // the downloaded option so the user is not left with a broken toggle.
        tex.source = 'proc';
        sourceCtrl.updateDisplay();
        sourceCtrl.disable(true);
        apply();
      }
      refreshStatus();
      statusCtrl.updateDisplay();
    });
    // Disable the downloaded option while the pack is still loading; leave
    // the blend slider usable so the user can dial in a partial blend
    // once it lands. If no pack is configured (handle.downloaded is null at
    // boot) blend falls back to full procedural via mixAsphaltMaps.
    if (!asphalt.available) sourceCtrl.disable(true);

    refreshStatus();
    gTex.close();
  }

  let fpsClock = 0;
  return {
    gui,
    getSettings() { return JSON.parse(JSON.stringify(settings)); },
    settingsKey: SETTINGS_KEY,
    setEnglishMode(active) { localizeMenu(!!active); },
    toggle() { gui._hidden ? gui.show() : gui.hide(); },
    get visible() { return !gui._hidden; },

    /** The garage swaps vehicles live; per-vehicle tuning follows the id. */
    setVehicleId(id) {
      if (`vehicle:${id}` === vehicleSection) return;
      vehicleSection = `vehicle:${id}`;
      restoreSection(settings, vehicleSection, p, vehicleKeys);
    },

    /** Called once the lazy prop load lands. Mass is the tuning knob here. */
    attachProps(props) {
      if (propsFolder) propsFolder.destroy();
      propsFolder = gui.addFolder('소품 물리 · Props');
      const state = { placed: props.stats.placed, awake: 0, propVsProp: props.world.propVsProp };
      restoreSection(settings, 'props', state, ['propVsProp']);
      props.world.propVsProp = state.propVsProp;
      propsFolder.add(state, 'placed').name('배치 수 · Placed').disable();
      propsFolder.add(state, 'awake').name('활성 · Awake').listen().disable();
      propsFolder.add(state, 'propVsProp').name('소품끼리 충돌 · Prop vs prop')
        .onChange((v) => { props.world.propVsProp = v; copySettings(settings, 'props', state, ['propVsProp']); });
      propsFolder.add({ r: () => props.reset() }, 'r').name('소품 리셋 · Reset props');

      // Per-type mass, so "weighted accurately" is a slider, not a rebuild.
      const masses = propsFolder.addFolder('무게 kg · Mass');
      const seen = new Set();
      for (const pl of props.placements) {
        if (seen.has(pl.key)) continue;
        seen.add(pl.key);
        const def = props.defs.get(pl.key);
        if (!def?.meta || def.meta.body !== 'dynamic') continue;
        const row = { kg: settings.props?.masses?.[pl.key] ?? def.meta.mass ?? 10 };
        props.setMass(pl.key, row.kg);
        masses.add(row, 'kg', 1, 2000, 1).name(`${def.meta.name} (${pl.key})`)
          .onChange((v) => {
            props.setMass(pl.key, v);
            settings.props = { ...(settings.props || {}), masses: { ...(settings.props?.masses || {}), [pl.key]: v } };
            saveSettings(settings);
          });
      }
      masses.close();
      propsFolder.close();
      localizeMenu(menuEnglishMode, true);
      this._propState = state;
      this._props = props;
    },

    update(dt) {
      if (this._propState) this._propState.awake = this._props.world.awakeCount;
      if (mapState && city) {
        mapState.drawn = city.tiles.reduce((n, t) => n + (t.root.visible ? 1 : 0), 0);
      }
      if (weatherState) weatherState.readWetness = +rain.wetness.toFixed(3);
      fpsClock += dt;
      if (fpsClock > 0.4) {
        fxState.fps = Math.round(1 / Math.max(dt, 1e-4));
        // renderer.info is reset at the top of the frame and accumulated across
        // every composer pass — see main.js.
        fxState.draws = renderer.info.render.calls;
        fxState.tris = renderer.info.render.triangles;
        fpsClock = 0;
      }
    },
  };
}
