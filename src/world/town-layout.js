// 밤내 Bamnae — a small valley town, behind `?world=town`.
//
// This is the deliberate rebuild the Expanse's scale problem asked for. The
// Expanse is 1,140 x 860 m of six-lane Seoul with 1,212 plots; this is
// 600 x 450 m of one ribbon town in a river valley, and every street in it is
// authored by hand rather than generated. It exists to be finished, not to be
// filled.
//
// WHY A VALLEY, AND WHY THE ROADS CARRY ELEVATION.
//
// The Expanse authors X/Z and lets Y be zero everywhere except three bridges.
// That is why it is flat: not a rendering decision, an AUTHORING one. Here
// every node carries a real elevation, edges interpolate between them, and
// `town-terrain.js` builds its height field to AGREE with these roads rather
// than the other way round. Roads are the survey; terrain conforms.
//
// Doing it that way is what makes junctions work. Drape a road over sampled
// terrain and the four arms of a crossroads arrive at four different heights;
// author the junction height once and every arm is correct by construction.
//
// THE SHAPE OF THE TOWN.
//
//   north (-Z)  ridge topping out around 46 m, two summits with a saddle over
//               the town centre. 윗말 Upper Village: three terraced lanes at
//               10 / 19 / 28 m, joined by switchbacks, 정자 pavilion on top.
//   middle      중앙로 Main Street, west to east, LOW IN THE MIDDLE — the town
//               centre sits in the dip and the road climbs away both ways.
//               시장 market lanes tucked in behind it.
//   +Z          밤내, the stream the town is named for: its bed falls 2.8 m
//               west to east while the floor above it falls 0.3, so the banks
//               grow as you go and it opens into a weir pool at the east end.
//               천변로 runs its north bank.
//   south (+Z)  two bridges over to 남길, the bus terminal, the school, and
//               the paddies rising gently to the world edge.
//
// GRAPH CONTRACT. `validateRoadGraph()` requires degree >= 2 at every node and
// every edge on a cycle: no spurs anywhere. The plan below is therefore a set
// of nested loops — main street and the riverside road close at both valley
// mouths, the two bridges and 남길 close against the riverside road, each
// hillside terrace is reached by two switchbacks, and the market lanes are a
// rectangle. Adding a scenic dead end here will fail the gate, by design.
//
// Pure data + three.js math, like expanse-layout.js. The Node gates and the
// runtime read the same records.
import * as THREE from 'three';

export const TOWN_SEED = 20260920;

/** 600 x 450 m. A quarter the Expanse's area; ~45 s end to end on main street. */
export const TOWN_BOUNDS = Object.freeze({ minX: -300, maxX: 300, minZ: -225, maxZ: 225 });

/** Land past the bounds, so the world edge is a hillside and not a cliff. */
export const TOWN_MARGIN = 60;

// ---- Road widths ------------------------------------------------------------
// Small-town narrow, and that narrowness is most of the cosiness. The Expanse's
// ring is 22 m; nothing here is wider than 11, and the market lanes are 3.2 —
// tight enough that the truck's mirrors matter.
export const MAIN_WIDTH = 11;       // 중앙로 — two lanes, parking, bus stop
export const STREET_WIDTH = 7;      // 천변로 / 남길
export const CONNECTOR_WIDTH = 4.8; // 윗말 terraces and switchbacks
export const ALLEY_WIDTH = 3.2;     // 시장 arcade lanes
// Unpaved. 윗말3길 is a graded dirt lane through the trees to the 정자, and
// being unpaved is a BUDGET decision as much as an art one: a track gets no
// kerbs, no walls and no plots, and the gate holds it to 3.5 m of earthworks
// instead of the 6.5 m a benched paved lane is allowed. It has to follow the
// hill rather than cut into it.
export const TRACK_WIDTH = 3.6;
export const BRIDGE_WIDTH = 8;

/**
 * 밤내, from the west mouth to the weir.
 *
 * Every point carries its own `half` width, `bed` elevation and `water`
 * surface, because a stream is not a constant-depth trench subtracted from the
 * land. The first version of this WAS that — one depth, one water level — and
 * it produced a channel whose water sat below its own bed at one end and above
 * the bank at the other. A stream runs DOWNHILL, faster than the valley floor
 * does, which is exactly why it has cut a valley.
 *
 * So the bed falls 2.8 m from the west mouth to the weir pool while the floor
 * above it falls 0.3 m: the banks get taller as you go east, the channel gets
 * wider and deeper, and by the time it reaches 포차거리 it is a pool with
 * tents along it. Below the weir the water drops 0.8 m in one step — that step
 * is the 보 the quarter is named after.
 *
 * `half` also opens out into the pool, so the weir comes out of this one
 * polyline rather than needing a second shape.
 */
export const STREAM = Object.freeze({
  bank: 7.0,
  points: Object.freeze([
    Object.freeze({ x: -360, z: 74, half: 6.5, bed: -0.2, water: 1.0 }),
    Object.freeze({ x: -240, z: 70, half: 6.5, bed: -0.5, water: 0.9 }),
    Object.freeze({ x: -120, z: 63, half: 7.0, bed: -1.0, water: 0.75 }),
    Object.freeze({ x: -30, z: 60, half: 7.5, bed: -1.4, water: 0.6 }),  // 밤내교
    Object.freeze({ x: 70, z: 59, half: 8.0, bed: -1.8, water: 0.5 }),
    Object.freeze({ x: 150, z: 61, half: 9.0, bed: -2.1, water: 0.45 }), // 동교
    Object.freeze({ x: 200, z: 64, half: 17.0, bed: -2.6, water: 0.4 }), // the pool opens
    Object.freeze({ x: 245, z: 68, half: 22.0, bed: -3.0, water: 0.4 }), // 포장마차 line this
    Object.freeze({ x: 275, z: 72, half: 14.0, bed: -1.2, water: -0.4 }), // over the 보
    Object.freeze({ x: 360, z: 80, half: 8.0, bed: -1.6, water: -0.6 }),
  ]),
});

// ---- Quarters ---------------------------------------------------------------
// The six district IDs are frozen across the colour bible, the shop pack, the
// landmark shops and every delivery gate, so the town reuses them rather than
// inventing six new ones and re-baselining the whole art pipeline. Each maps
// onto a quarter that genuinely wants that palette:
//
//   hills   -> 윗말     the terraced hillside     (already means hills)
//   hongdae -> 중앙로    main street shopfronts    (the loud lit one)
//   market  -> 시장      the arcade lanes
//   hangang -> 밤내      the stream banks          (already means river)
//   pocha   -> 포차거리   tents along the weir pool
//   station -> 터미널     bus terminal, school, paddies
const DISTRICTS = [
  { id: 'hills', index: 0, name: '윗말', roman: 'Upper Village', color: 0x526f86,
    bounds: { minX: -300, maxX: 300, minZ: -225, maxZ: -85 } },
  { id: 'hongdae', index: 1, name: '중앙로', roman: 'Main Street', color: 0x9a566f,
    bounds: { minX: -300, maxX: 300, minZ: -85, maxZ: 30 } },
  { id: 'station', index: 2, name: '터미널', roman: 'Terminal', color: 0x5f8c7d,
    bounds: { minX: -300, maxX: 300, minZ: 78, maxZ: 225 } },
  { id: 'market', index: 3, name: '시장', roman: 'Bamnae Market', color: 0xa66e42,
    bounds: { minX: -75, maxX: 85, minZ: -85, maxZ: -38 } },
  { id: 'hangang', index: 4, name: '밤내', roman: 'Bamnae Stream', color: 0x557a91,
    bounds: { minX: -300, maxX: 300, minZ: 30, maxZ: 78 } },
  { id: 'pocha', index: 5, name: '포차거리', roman: 'Pocha Row', color: 0x9c6651,
    bounds: { minX: 150, maxX: 300, minZ: 10, maxZ: 78 } },
];

export const TOWN_DISTRICT_IDS = Object.freeze(DISTRICTS.map((d) => d.id));

/**
 * Ordered tests, not rectangle hit-testing: the quarters overlap on purpose so
 * a driver entering one is claimed by it before the one they are leaving.
 */
export function townDistrictAt(x, z) {
  if (z <= -85) return DISTRICTS[0];                        // 윗말, the hillside
  if (z >= 78) return DISTRICTS[2];                         // 터미널, over the stream
  if (x >= 150 && z >= 10) return DISTRICTS[5];             // 포차거리 at the weir
  if (z >= 30) return DISTRICTS[4];                         // 밤내 banks
  if (x >= -75 && x <= 85 && z <= -38) return DISTRICTS[3]; // 시장 lanes
  return DISTRICTS[1];                                      // 중앙로
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * A node is (x, z, y) — X/Z first because the plan is read in plan view, and
 * the elevation is the thing being added to a formerly flat world.
 */
function node(x, z, y) { return V(x, y, z); }

function addEdge(edges, nodes, id, a, b, width, kind, { points = null, name = null, ...extra } = {}) {
  const pa = nodes.get(a);
  const pb = nodes.get(b);
  if (!pa) throw new TypeError(`Bamnae layout: edge ${id} references unknown node ${a}`);
  if (!pb) throw new TypeError(`Bamnae layout: edge ${id} references unknown node ${b}`);
  // An edge's polyline must start and end ON its nodes, or the terrain conform
  // and the road mesh disagree about where the junction is.
  const line = (points ? [pa, ...points, pb] : [pa, pb]).map((p) => p.clone());
  const mid = line[Math.floor(line.length / 2)];
  const area = townDistrictAt(mid.x, mid.z);
  edges.push({
    id, a, b, width, kind, name,
    district: area.index,
    districtId: area.id,
    points: line,
    ...extra,
  });
}

/**
 * Every elevation below is authored, and the grades they imply are asserted by
 * `tools/bench/town-terrain-check.mjs`: 7% on main street, 9% on streets, 14%
 * on hillside lanes, and one deliberate 12% climb out over the east pass.
 */
export function generateTownLayout() {
  const nodes = new Map([
    // 중앙로 Main Street. The town centre is the LOW point at y 3.0; the road
    // climbs away west to the valley mouth and east over the pass.
    ['west_gate', node(-292, -18, 9.8)],
    ['main_w', node(-205, -22, 6.2)],
    ['main_nh', node(-120, -26, 4.1)],
    ['main_market_w', node(-62, -28, 3.2)],
    ['main_centre', node(-4, -27, 3.0)],
    ['main_market_e', node(58, -25, 3.5)],
    ['main_e', node(132, -22, 5.6)],
    ['main_pass', node(214, -28, 10.8)],
    ['east_pass', node(292, -34, 19.5)],

    // The west valley mouth, where main street and the riverside road close.
    ['west_mouth', node(-268, 28, 5.0)],
    // The east end cannot close the same way. The pass is 16 m above the water
    // and only 94 m of Z separates them, so a road joining them directly would
    // sit at 17%. Instead the east end is TWO loops sharing `main_pass`: a
    // hairpin lay-by above the town, and a descent to the weir that rejoins
    // main street rather than the pass.
    ['pass_lay', node(270, -62, 18.0)],
    ['weir_back', node(250, -2, 8.2)],

    // 천변로 the riverside road, north bank, just above the stream banks.
    ['river_w', node(-208, 46, 2.0)],
    ['river_wm', node(-140, 45, 2.2)],
    ['river_bridge_n', node(-30, 44, 1.5)],
    ['river_c', node(52, 43, 1.4)],
    ['river_e_bridge_n', node(150, 45, 1.6)],
    // Both sit clear of the weir pool: it opens to a 22 m half-width around
    // z 68, so anything south of z ~46 at this end is in the water.
    ['river_weir', node(228, 38, 3.2)],
    ['pocha_row', node(266, 24, 5.6)],

    // 남길 over the water: terminal, school, paddies.
    ['bridge_s', node(-30, 92, 1.8)],
    ['south_w', node(-160, 98, 2.6)],
    ['school', node(-160, 152, 4.2)],
    ['terminal', node(56, 150, 3.6)],
    ['south_c', node(56, 96, 2.2)],
    ['east_bridge_s', node(150, 92, 1.9)],

    // 시장 the market rectangle, tucked in behind main street's north side.
    ['mk_w', node(-58, -44, 3.6)],
    ['mk_e', node(52, -42, 3.9)],
    ['mk_n_w', node(-56, -68, 5.4)],
    ['mk_n_e', node(48, -66, 5.8)],

    // 윗말 three terraces up the ridge.
    ['t1_w', node(-168, -90, 10.0)],
    // 윗말 1길 gets a mid-terrace junction so the west switchback can arrive
    // square-on. Landing it at t1_w instead put the two carriageways 27 deg
    // apart, overlapping for 20 m with 2 m of height between them, and a
    // height field resolves that overlap by tilting the lane into the hill.
    ['t1_m', node(-104, -92, 9.7)],
    ['t1_c', node(-40, -94, 9.4)],
    ['t1_e', node(112, -88, 11.2)],
    ['t2_w', node(-128, -126, 19.4)],
    ['t2_c', node(-20, -130, 18.6)],
    ['t2_m', node(24, -128, 19.2)],
    ['t2_e', node(86, -124, 20.2)],
    // 윗말3길 follows the natural contour rather than a surveyed bench: these
    // three are the ground's own height, which is what makes it a track.
    ['t3_w', node(-80, -160, 31.9)],
    ['t3_c', node(-8, -164, 30.8)],
    ['t3_e', node(52, -158, 32.0)],
  ]);
  const edges = [];

  // ---- 중앙로 ---------------------------------------------------------------
  const main = '중앙로';
  addEdge(edges, nodes, 'main_1', 'west_gate', 'main_w', MAIN_WIDTH, 'arterial', { name: main });
  addEdge(edges, nodes, 'main_2', 'main_w', 'main_nh', MAIN_WIDTH, 'arterial', { name: main });
  addEdge(edges, nodes, 'main_3', 'main_nh', 'main_market_w', MAIN_WIDTH, 'arterial', { name: main });
  addEdge(edges, nodes, 'main_4', 'main_market_w', 'main_centre', MAIN_WIDTH, 'arterial', { name: main });
  addEdge(edges, nodes, 'main_5', 'main_centre', 'main_market_e', MAIN_WIDTH, 'arterial', { name: main });
  addEdge(edges, nodes, 'main_6', 'main_market_e', 'main_e', MAIN_WIDTH, 'arterial', { name: main });
  addEdge(edges, nodes, 'main_7', 'main_e', 'main_pass', MAIN_WIDTH, 'arterial', { name: main });
  // ---- 고갯길, the hairpin over the pass ------------------------------------
  // The one steep piece in town, and the only place the whole valley is behind
  // you in the mirror. Two 11% legs and a hairpin: a climb, not a wall. The
  // lay-by at the top exists so the pass can be a LOOP — a scenic dead end
  // would fail `validateRoadGraph`, and this is the better version anyway.
  addEdge(edges, nodes, 'pass_climb', 'main_pass', 'east_pass', MAIN_WIDTH, 'arterial',
    { name: '고갯길', feature: 'pass', maxGrade: 0.12 });
  addEdge(edges, nodes, 'pass_lay_a', 'east_pass', 'pass_lay', STREET_WIDTH, 'street',
    { name: '고갯길', feature: 'pass', maxGrade: 0.12 });
  addEdge(edges, nodes, 'pass_lay_b', 'pass_lay', 'main_pass', STREET_WIDTH, 'street',
    { name: '고갯길', feature: 'pass', maxGrade: 0.12 });

  // ---- west valley mouth, closing main street against the riverside road ---
  addEdge(edges, nodes, 'west_mouth_a', 'west_gate', 'west_mouth', STREET_WIDTH, 'street',
    { points: [node(-296, 6, 8.0)] });
  addEdge(edges, nodes, 'west_mouth_b', 'west_mouth', 'river_w', STREET_WIDTH, 'street',
    { points: [node(-244, 40, 3.0)] });

  // ---- the weir loop -------------------------------------------------------
  // Down a cutting from main street to the pool, along the tents, and back up.
  // A back lane, not a street: it drops off main street into a cutting and
  // comes out at the tents, and a lane is allowed the earthworks that needs.
  addEdge(edges, nodes, 'weir_loop_a', 'pocha_row', 'weir_back', CONNECTOR_WIDTH, 'connector',
    { name: '보뒷길' });
  addEdge(edges, nodes, 'weir_loop_b', 'weir_back', 'main_pass', CONNECTOR_WIDTH, 'connector',
    { name: '보뒷길' });

  // ---- 천변로 ---------------------------------------------------------------
  const riverside = '천변로';
  addEdge(edges, nodes, 'river_1', 'river_w', 'river_wm', STREET_WIDTH, 'street', { name: riverside });
  addEdge(edges, nodes, 'river_2', 'river_wm', 'river_bridge_n', STREET_WIDTH, 'street', { name: riverside });
  addEdge(edges, nodes, 'river_3', 'river_bridge_n', 'river_c', STREET_WIDTH, 'street', { name: riverside });
  addEdge(edges, nodes, 'river_4', 'river_c', 'river_e_bridge_n', STREET_WIDTH, 'street', { name: riverside });
  addEdge(edges, nodes, 'river_5', 'river_e_bridge_n', 'river_weir', STREET_WIDTH, 'street', { name: riverside });
  addEdge(edges, nodes, 'river_6', 'river_weir', 'pocha_row', STREET_WIDTH, 'street', { name: '포차거리' });

  // ---- main street down to the water --------------------------------------
  addEdge(edges, nodes, 'link_w', 'main_nh', 'river_wm', STREET_WIDTH, 'street',
    { name: '서천길', points: [node(-134, 8, 3.2)] });
  addEdge(edges, nodes, 'link_c', 'main_centre', 'river_bridge_n', STREET_WIDTH, 'street',
    { name: '다리목길', points: [node(-14, 8, 2.2)] });
  addEdge(edges, nodes, 'link_e', 'main_e', 'river_e_bridge_n', STREET_WIDTH, 'street',
    { name: '동천길', points: [node(142, 10, 3.4)] });

  // ---- bridges -------------------------------------------------------------
  // Decks clear the water by ~4.5 m and do NOT conform the terrain: the trench
  // stays cut underneath them. `town-terrain.js` skips every bridge edge when
  // it builds its road corridors, and the gate checks the bed is still there.
  addEdge(edges, nodes, 'bridge_main', 'river_bridge_n', 'bridge_s', BRIDGE_WIDTH, 'street', {
    name: '밤내교',
    points: [node(-30, 54, 2.1), node(-30, 64, 2.5), node(-30, 76, 2.4), node(-30, 86, 2.0)],
    bridge: true, clearance: 1.8,
  });
  addEdge(edges, nodes, 'bridge_east', 'river_e_bridge_n', 'east_bridge_s', BRIDGE_WIDTH, 'street', {
    name: '동교',
    points: [node(150, 54, 2.2), node(150, 64, 2.6), node(150, 76, 2.5), node(150, 86, 2.1)],
    bridge: true, clearance: 1.8,
  });

  // ---- 남길 and the terminal loop -----------------------------------------
  const south = '남길';
  addEdge(edges, nodes, 'south_1', 'bridge_s', 'south_w', STREET_WIDTH, 'street', { name: south });
  addEdge(edges, nodes, 'south_2', 'bridge_s', 'south_c', STREET_WIDTH, 'street', { name: south });
  addEdge(edges, nodes, 'south_3', 'south_c', 'east_bridge_s', STREET_WIDTH, 'street', { name: south });
  addEdge(edges, nodes, 'school_rd', 'south_w', 'school', STREET_WIDTH, 'street',
    { name: '학교길', points: [node(-166, 126, 3.4)] });
  addEdge(edges, nodes, 'paddy_rd', 'school', 'terminal', STREET_WIDTH, 'street',
    { name: '들길', points: [node(-70, 158, 4.4), node(10, 154, 4.0)] });
  addEdge(edges, nodes, 'terminal_rd', 'terminal', 'south_c', STREET_WIDTH, 'street', { name: '터미널길' });

  // ---- 시장 ----------------------------------------------------------------
  // A rectangle of arcade lanes, 3.2 m wide. The arcade roof goes on later;
  // what matters at this stage is that the geometry allows one.
  addEdge(edges, nodes, 'mk_in_w', 'main_market_w', 'mk_w', ALLEY_WIDTH, 'alley', { name: '시장길' });
  addEdge(edges, nodes, 'mk_in_e', 'main_market_e', 'mk_e', ALLEY_WIDTH, 'alley', { name: '시장길' });
  addEdge(edges, nodes, 'mk_front', 'mk_w', 'mk_e', ALLEY_WIDTH, 'alley', { name: '시장길', arcade: true });
  addEdge(edges, nodes, 'mk_up_w', 'mk_w', 'mk_n_w', ALLEY_WIDTH, 'alley', { name: '시장뒷길' });
  addEdge(edges, nodes, 'mk_up_e', 'mk_e', 'mk_n_e', ALLEY_WIDTH, 'alley', { name: '시장뒷길' });
  addEdge(edges, nodes, 'mk_back', 'mk_n_w', 'mk_n_e', ALLEY_WIDTH, 'alley', { name: '시장뒷길' });

  // ---- 윗말, the terraces --------------------------------------------------
  addEdge(edges, nodes, 't1_a', 't1_w', 't1_m', CONNECTOR_WIDTH, 'connector', { name: '윗말1길' });
  addEdge(edges, nodes, 't1_b', 't1_m', 't1_c', CONNECTOR_WIDTH, 'connector', { name: '윗말1길' });
  addEdge(edges, nodes, 't1_c_e', 't1_c', 't1_e', CONNECTOR_WIDTH, 'connector', { name: '윗말1길' });
  addEdge(edges, nodes, 't2_a', 't2_w', 't2_c', CONNECTOR_WIDTH, 'connector', { name: '윗말2길' });
  addEdge(edges, nodes, 't2_b', 't2_c', 't2_m', CONNECTOR_WIDTH, 'connector', { name: '윗말2길' });
  addEdge(edges, nodes, 't2_b_e', 't2_m', 't2_e', CONNECTOR_WIDTH, 'connector', { name: '윗말2길' });
  addEdge(edges, nodes, 't3_a', 't3_w', 't3_c', TRACK_WIDTH, 'track', { name: '윗말3길' });
  addEdge(edges, nodes, 't3_b', 't3_c', 't3_e', TRACK_WIDTH, 'track', { name: '윗말3길' });

  // Switchbacks. Every one of these is a zigzag rather than a straight climb,
  // because the straight version is 17-22% and the zigzag is 8-12%. The bends
  // are the reason the hillside reads as lived-in rather than as a ramp.
  addEdge(edges, nodes, 'sb_a', 'main_nh', 't1_w', CONNECTOR_WIDTH, 'connector',
    { name: '윗말오름', points: [node(-152, -52, 6.4)] });
  addEdge(edges, nodes, 'sb_b', 't1_e', 'main_e', CONNECTOR_WIDTH, 'connector',
    { name: '동편오름', points: [node(126, -56, 8.6)] });
  // Leaves 윗말1길 due south and arrives at 윗말2길 due north. The first
  // version left at 16 deg and ran alongside the terrace for 25 m, which a
  // height field turns into a lane tilted 14% into the hillside.
  addEdge(edges, nodes, 'sb_c', 't1_c', 't2_m', CONNECTOR_WIDTH, 'connector',
    { name: '윗말오름', points: [node(-40, -110, 11.2), node(22, -118, 18.1)] });
  // Four legs rather than two: the extra 20 m of run is what brings an
  // 18% climb down to 10%, and the last leg runs due north so it meets
  // 윗말1길 at a right angle instead of grazing it.
  addEdge(edges, nodes, 'sb_f', 't2_w', 't1_m', CONNECTOR_WIDTH, 'connector',
    { name: '서편오름',
      points: [node(-152, -114, 16.6), node(-128, -104, 13.9), node(-104, -108, 11.4)] });
  // The two ways up to 윗말3길, both unpaved. The west one leaves 윗말2길
  // heading NORTH into the hill rather than east along it, which is what keeps
  // it off terrace 2's carriageway, and it zigzags 147 m to climb 12.5 m.
  addEdge(edges, nodes, 'sb_d', 't2_e', 't3_e', TRACK_WIDTH, 'track',
    { name: '윗말오름', points: [node(108, -144, 24.8), node(64, -152, 30.8)] });
  addEdge(edges, nodes, 't3_down', 't2_w', 't3_w', TRACK_WIDTH, 'track',
    { name: '정자길',
      points: [node(-146, -140, 23.0), node(-96, -148, 28.6), node(-124, -158, 32.8)] });

  return {
    seed: TOWN_SEED,
    name: '밤내', roman: 'Bamnae',
    bounds: { ...TOWN_BOUNDS },
    margin: TOWN_MARGIN,
    districts: DISTRICTS.map(({ bounds, ...district }) => ({
      ...district,
      bounds: { min: { x: bounds.minX, z: bounds.minZ }, max: { x: bounds.maxX, z: bounds.maxZ } },
    })),
    nodes: [...nodes.entries()].map(([id, position]) => ({ id, position: position.clone() })),
    edges,
    stream: STREAM,
    // Outside the co-op on main street, pointed east at the market, with the
    // ridge filling the mirror.
    spawn: { position: node(-14, -27, 3.8), heading: Math.PI / 2, tile: 0 },
    landmarks: {
      coop: node(-4, -44, 3.4),         // 농협 — the tallest thing on main street
      marketHall: node(-2, -55, 4.6),   // 시장 arcade entrance
      // At the TOP OF THE VILLAGE, not on the mountain. Sited 55 m up the
      // slope it needed 150 m of switchback to reach at any drivable grade;
      // here the track passes below it and you walk the last twenty metres,
      // which is where a village 정자 actually sits.
      pavilion: node(-104, -166, 34.4),
      church: node(-64, -124, 18.8),    // red neon cross, visible from everywhere
      terminal: node(56, 150, 3.6),     // 시외버스터미널
      // Just above 윗말3길 where the apron tops out, not up the mountain
      // behind it: a water tower stands on a bench, and the bench is here.
      waterTower: node(96, -166, 35.5),
      weir: node(222, 64, -2.0),        // 보 — where the stream pools
    },
  };
}
