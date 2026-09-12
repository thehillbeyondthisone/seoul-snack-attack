// Seoul Expanse — human-readable street names for the 35 layout edges.
//
// The road graph is generated, so its edge ids ('ring_north_w', 'spine_market')
// are routing handles, not signage. This module is the one place that turns an
// edge id into something a driver can read, so the mini-map blade, painted road
// text and any future navigation copy cannot drift apart.
//
// Names follow the district ids frozen in the colour bible; the display strings
// themselves are the creative surface. Where a name is already painted on the
// tarmac by expanse-road-art.js, the blade below matches it.

const S = (ko, en) => Object.freeze({ ko, en });

export const EXPANSE_STREET_NAMES = Object.freeze({
  // ---- Ring: one belt road, signed by the side of the city it is on --------
  ring_nw_arc: S('북악순환로', 'BUKAK RING'),
  ring_north_w: S('북악순환로', 'BUKAK RING'),
  ring_north_e: S('북악순환로', 'BUKAK RING'),
  // This corner is the authored tunnel, so it is signed as one.
  ring_ne_arc: S('북악터널', 'BUKAK TUNNEL'),
  ring_east_n: S('동부순환로', 'EAST RING'),
  ring_east_s: S('동부순환로', 'EAST RING'),
  ring_se_arc: S('동부순환로', 'EAST RING'),
  ring_south_e: S('남부순환로', 'SOUTH RING'),
  ring_south_w: S('남부순환로', 'SOUTH RING'),
  ring_sw_arc: S('남부순환로', 'SOUTH RING'),
  ring_west_s: S('서부순환로', 'WEST RING'),
  ring_west_n: S('서부순환로', 'WEST RING'),

  // ---- Spine: the north/south arterial through the station and the river ---
  spine_north: S('북악대로', 'BUKAK-DAERO'),
  spine_station: S('서울역대로', 'SEOUL STATION-DAERO'),
  spine_market: S('세종대로', 'SEJONG-DAERO'),
  spine_northbank: S('한강대로', 'HANGANG-DAERO'),
  main_bridge: S('한강대교', 'HANGANG BRIDGE'),
  spine_south: S('남부대로', 'NAMBU-DAERO'),

  // ---- Cross-town routes ---------------------------------------------------
  hongdae_w: S('홍대서로', 'HONGDAE WEST'),
  hongdae_e: S('홍대로', 'HONGDAE-RO'),
  market_w: S('시장로', 'MARKET-RO'),
  market_e: S('호떡시장로', 'HOTTEOK MARKET-RO'),
  cross_w: S('연남로', 'YEONNAM-RO'),
  cross_c: S('홍대입구로', 'HONGDAE ENTRANCE-RO'),
  northbank_w: S('한강북로', 'NORTH BANK-RO'),
  northbank_cw: S('한강북로', 'NORTH BANK-RO'),
  northbank_ce: S('한강북로', 'NORTH BANK-RO'),
  northbank_e: S('한강북로', 'NORTH BANK-RO'),
  southbank_w: S('한강공원로', 'HANGANG PARK-RO'),
  southbank_e: S('한강남로', 'SOUTH BANK-RO'),
  pocha_link: S('포차거리', 'POCHA STREET'),
  market_s_w: S('남대문로', 'NAMDAEMUN-RO'),
  market_s_e: S('시장남로', 'MARKET SOUTH-RO'),

  // ---- The two flanking river crossings ------------------------------------
  west_bridge: S('서강대교', 'SEOGANG BRIDGE'),
  east_bridge: S('동호대교', 'DONGHO BRIDGE'),
});

// Shown instead of a street name when the player has left the carriageway.
export const EXPANSE_DISTRICT_NAMES = Object.freeze({
  hills: S('북악 언덕', 'BUKAK HILLS'),
  hongdae: S('홍대', 'HONGDAE'),
  station: S('서울역 일대', 'STATION QUARTER'),
  market: S('시장 골목', 'MARKET LANES'),
  hangang: S('한강', 'HANGANG'),
  pocha: S('포차 거리', 'POCHA ROW'),
});

export function streetNameForEdge(edgeId) {
  return EXPANSE_STREET_NAMES[edgeId] || null;
}

// Metres of kerb, footpath and forecourt still counted as "on" a street. Past
// this the driver is in a lot or a plaza, and the district blade reads truer.
const SHOULDER_M = 6;

/**
 * Resolve what the player should see on the mini-map blade.
 *
 * Returns null for worlds whose edge ids this table does not cover (the legacy
 * procedural city), which is the HUD's signal to hide the blade rather than
 * print a routing id at the player.
 */
export function describeStreet(graph, projection) {
  if (!projection?.edgeId) return null;
  const edge = graph?.edgeById?.get(projection.edgeId);
  let id = projection.edgeId;
  let name = null;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    name = streetNameForEdge(id);
    if (name) break;
    const parent = graph?.edgeById?.get(id)?.parentId;
    // Re-cut parents can be absent from the live graph; nested split ids
    // still retain their original authored road handle.
    const unsplit = id.replace(/__s\d+$/, '');
    id = parent || (unsplit !== id ? unsplit : null);
  }
  if (!name) {
    // New generated lanes have no authored street name. Show the district
    // instead of an internal graph id; legacy worlds still hide the blade.
    const district = edge?.streetClass && EXPANSE_DISTRICT_NAMES[edge.districtId];
    return district ? { ...district, onStreet: false } : null;
  }
  const shoulder = (edge?.width ?? 10) * 0.5 + SHOULDER_M;
  if ((projection.lateralDistance ?? 0) <= shoulder) {
    return { ko: name.ko, en: name.en, onStreet: true };
  }
  const district = EXPANSE_DISTRICT_NAMES[edge?.districtId];
  if (!district) return { ko: name.ko, en: name.en, onStreet: false };
  return { ko: district.ko, en: district.en, onStreet: false };
}
