// Authoritative road topology for the closed district.
//
// The tiled city supplies five east/west streets and seven repeated cross
// streets. Unique end zones close that grid: every edge belongs to a cycle,
// every node has at least two exits, and no driveable road dead-ends.
import * as THREE from 'three';

const EPS = 1e-6;

function edgeLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]);
  return total;
}

function closestOnEdge(edge, position) {
  let best = null;
  let walked = 0;
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1];
    const b = edge.points[i];
    const ab = b.clone().sub(a);
    const len = ab.length();
    if (len < EPS) continue;
    const t = THREE.MathUtils.clamp(position.clone().sub(a).dot(ab) / (len * len), 0, 1);
    const point = a.clone().addScaledVector(ab, t);
    const lateralDistance = point.distanceTo(position);
    if (!best || lateralDistance < best.lateralDistance) {
      best = { point, lateralDistance, segment: i - 1, segmentT: t, distanceAlong: walked + len * t };
    }
    walked += len;
  }
  return best;
}

function reconstruct(prev, endId) {
  const ids = [endId];
  while (prev.has(ids[0])) ids.unshift(prev.get(ids[0]));
  return ids;
}

function shortestNodePath(graph, startId, endId) {
  if (startId === endId) return { nodeIds: [startId], edgeIds: [], distance: 0 };
  const dist = new Map(graph.nodes.map((n) => [n.id, Infinity]));
  const prev = new Map();
  const prevEdge = new Map();
  const open = new Set(graph.nodes.map((n) => n.id));
  dist.set(startId, 0);
  while (open.size) {
    let current = null;
    let bestScore = Infinity;
    const goal = graph.byId.get(endId).position;
    for (const id of open) {
      const score = dist.get(id) + graph.byId.get(id).position.distanceTo(goal);
      if (score < bestScore) { current = id; bestScore = score; }
    }
    const currentDist = current == null ? Infinity : dist.get(current);
    if (current == null || currentDist === Infinity) break;
    open.delete(current);
    if (current === endId) break;
    for (const item of graph.adjacency.get(current) || []) {
      const nextDist = currentDist + item.edge.length;
      if (nextDist >= dist.get(item.node)) continue;
      dist.set(item.node, nextDist);
      prev.set(item.node, current);
      prevEdge.set(item.node, item.edge.id);
    }
  }
  if (!Number.isFinite(dist.get(endId))) return null;
  const nodeIds = reconstruct(prev, endId);
  return {
    nodeIds,
    edgeIds: nodeIds.slice(1).map((id) => prevEdge.get(id)),
    distance: dist.get(endId),
  };
}

function routeManeuver(polyline) {
  if (polyline.length < 3) return null;
  for (let i = 1; i < polyline.length - 1; i++) {
    const incoming = polyline[i].clone().sub(polyline[i - 1]).setY(0);
    const outgoing = polyline[i + 1].clone().sub(polyline[i]).setY(0);
    if (incoming.lengthSq() < EPS || outgoing.lengthSq() < EPS) continue;
    incoming.normalize(); outgoing.normalize();
    const angle = Math.atan2(incoming.x * outgoing.z - incoming.z * outgoing.x, incoming.dot(outgoing));
    if (Math.abs(angle) < 0.35) continue;
    // In the game's +Z-forward convention, the prior screen-space test was
    // inverted relative to the driver's turn. Keep this classification in
    // world/driver space so every UI consumer receives the corrected side.
    return { type: angle > 0 ? 'right' : 'left', angle, point: polyline[i].clone() };
  }
  return { type: 'straight', angle: 0, point: polyline[polyline.length - 1].clone() };
}

/**
 * Build a routeable graph from explicitly authored nodes and polyline edges.
 * Used by irregular districts whose roads cannot be described as one ladder.
 */
export function createRoadGraph({ nodes, edges, bounds, roadWidth = 8 }) {
  const graphNodes = nodes.map((node) => ({ ...node, position: node.position.clone() }));
  const byId = new Map(graphNodes.map((node) => [node.id, node]));
  const graphEdges = edges.map((edge) => {
    const points = (edge.points || [byId.get(edge.a).position, byId.get(edge.b).position])
      .map((point) => point.clone());
    return {
      ...edge,
      points,
      width: edge.width || roadWidth,
      length: edgeLength(points),
      oneWay: false,
    };
  });
  const graph = {
    nodes: graphNodes,
    edges: graphEdges,
    byId,
    edgeById: new Map(graphEdges.map((edge) => [edge.id, edge])),
    adjacency: new Map(graphNodes.map((node) => [node.id, []])),
    bounds: bounds.clone(),
    roadWidth,
    gates: false,
    rows: [],
    crosses: [],
  };
  for (const edge of graphEdges) {
    graph.adjacency.get(edge.a).push({ node: edge.b, edge });
    graph.adjacency.get(edge.b).push({ node: edge.a, edge });
  }

  graph.project = (position) => {
    let best = null;
    for (const edge of graphEdges) {
      const hit = closestOnEdge(edge, position);
      if (!hit || (best && hit.lateralDistance >= best.lateralDistance)) continue;
      const segment = edge.points[hit.segment + 1].clone().sub(edge.points[hit.segment]).setY(0).normalize();
      best = {
        edgeId: edge.id,
        position: hit.point,
        heading: Math.atan2(segment.x, segment.z),
        lateralDistance: hit.lateralDistance,
        progress: edge.length > EPS ? hit.distanceAlong / edge.length : 0,
      };
    }
    return best;
  };

  graph.findRoute = (start, destination) => {
    const from = start?.edgeId ? start : graph.project(start);
    const to = destination?.edgeId ? destination : graph.project(destination);
    if (!from || !to) return null;
    const fromEdge = graph.edgeById.get(from.edgeId);
    const toEdge = graph.edgeById.get(to.edgeId);
    const candidates = [];
    if (from.edgeId === to.edgeId) {
      candidates.push({
        distance: Math.abs(to.progress - from.progress) * fromEdge.length,
        edgeIds: [from.edgeId],
        polyline: [from.position.clone(), to.position.clone()],
      });
    }
    const starts = [
      { node: fromEdge.a, cost: from.progress * fromEdge.length },
      { node: fromEdge.b, cost: (1 - from.progress) * fromEdge.length },
    ];
    const goals = [
      { node: toEdge.a, cost: to.progress * toEdge.length },
      { node: toEdge.b, cost: (1 - to.progress) * toEdge.length },
    ];
    for (const source of starts) for (const goal of goals) {
      const middle = shortestNodePath(graph, source.node, goal.node);
      if (!middle) continue;
      candidates.push({
        distance: source.cost + middle.distance + goal.cost,
        edgeIds: [from.edgeId, ...middle.edgeIds, to.edgeId]
          .filter((id, index, all) => index === 0 || id !== all[index - 1]),
        polyline: [
          from.position.clone(),
          ...middle.nodeIds.map((id) => graph.byId.get(id).position.clone()),
          to.position.clone(),
        ],
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const route = candidates[0];
    if (!route) return null;
    route.polyline = route.polyline.filter((point, index, all) =>
      index === 0 || point.distanceToSquared(all[index - 1]) > EPS
    );
    route.maneuver = routeManeuver(route.polyline);
    route.start = from;
    route.destination = to;
    return route;
  };

  return graph;
}

/**
 * Build the closed network from the authored tile's real street centrelines.
 *
 * `gates` decides where the cycles come from, and the two modes suit different
 * source blocks:
 *
 *  - `gates: true` — the block supplies parallel streets that never meet, so
 *    unique west/east connector roads are added OUTSIDE it (see end-zones.js)
 *    and every row is closed through them.
 *  - `gates: false` — the block's own streets already interconnect, so the
 *    cycles are formed by the cross streets alone and no geometry is invented.
 *    Rows then run cross-to-cross; carriageway beyond the outermost cross is
 *    still drivable, just not routed. Needs at least two crosses.
 *
 * @param {{coreBounds: THREE.Box3, rowCenters: number[], crossCenters?: number[], roadY: number, endDepth?: number, roadWidth?: number, gates?: boolean}} opts
 */
export function createLadderRoadGraph({ coreBounds, rowCenters, crossCenters = [], roadY, endDepth = 16, roadWidth = 9, gates = true }) {
  const westX = coreBounds.min.x - endDepth * 0.62;
  const eastX = coreBounds.max.x + endDepth * 0.62;
  const rows = [...rowCenters].sort((a, b) => a - b);
  const crosses = [...crossCenters].sort((a, b) => a - b);
  if (!gates && crosses.length < 2) {
    throw new Error('road graph: gates:false needs at least two cross streets to form a cycle');
  }
  const nodes = [];
  const edges = [];
  for (let row = 0; row < rows.length; row++) {
    if (gates) nodes.push({ id: `w${row}`, position: new THREE.Vector3(westX, roadY, rows[row]), kind: 'junction', district: 'WEST GATE' });
    for (let cross = 0; cross < crosses.length; cross++) {
      nodes.push({ id: `x${cross}r${row}`, position: new THREE.Vector3(crosses[cross], roadY, rows[row]), kind: 'intersection', district: `CROSS ${cross + 1}` });
    }
    if (gates) nodes.push({ id: `e${row}`, position: new THREE.Vector3(eastX, roadY, rows[row]), kind: 'junction', district: 'EAST GATE' });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const addEdge = (id, a, b, kind) => {
    const points = [byId.get(a).position.clone(), byId.get(b).position.clone()];
    edges.push({ id, a, b, kind, width: roadWidth, points, length: edgeLength(points), oneWay: false });
  };
  const rowLines = [];
  for (let row = 0; row < rows.length; row++) {
    const inner = crosses.map((_, cross) => `x${cross}r${row}`);
    const ids = gates ? [`w${row}`, ...inner, `e${row}`] : inner;
    for (let segment = 0; segment < ids.length - 1; segment++) {
      addEdge(`row${row}s${segment}`, ids[segment], ids[segment + 1], 'street');
    }
    rowLines.push({ id: `row${row}`, index: row, z: rows[row], nodeIds: ids, points: ids.map((id) => byId.get(id).position.clone()) });
  }
  for (let row = 0; row < rows.length - 1; row++) {
    if (gates) {
      addEdge(`west${row}`, `w${row}`, `w${row + 1}`, 'connector');
      addEdge(`east${row}`, `e${row}`, `e${row + 1}`, 'connector');
    }
    for (let cross = 0; cross < crosses.length; cross++) {
      addEdge(`cross${cross}r${row}`, `x${cross}r${row}`, `x${cross}r${row + 1}`, 'cross');
    }
  }

  const graph = {
    nodes, edges, byId, edgeById: new Map(edges.map((e) => [e.id, e])),
    adjacency: new Map(nodes.map((n) => [n.id, []])),
    bounds: coreBounds.clone(), roadWidth, endDepth, gates, rows: rowLines,
    crosses: crosses.map((x, index) => ({ id: `cross${index}`, index, x })),
  };
  // With gates the network reaches endDepth outside the block. Without them it
  // lives entirely inside it, and widening by endDepth would push the district
  // boundary out past the authored geometry into empty space.
  if (gates) {
    graph.bounds.min.x -= endDepth;
    graph.bounds.max.x += endDepth;
  }
  for (const edge of edges) {
    graph.adjacency.get(edge.a).push({ node: edge.b, edge });
    graph.adjacency.get(edge.b).push({ node: edge.a, edge });
  }

  graph.project = (position) => {
    let best = null;
    for (const edge of edges) {
      const hit = closestOnEdge(edge, position);
      if (!hit || (best && hit.lateralDistance >= best.lateralDistance)) continue;
      const seg = edge.points[hit.segment + 1].clone().sub(edge.points[hit.segment]).setY(0).normalize();
      best = {
        edgeId: edge.id,
        position: hit.point,
        heading: Math.atan2(seg.x, seg.z),
        lateralDistance: hit.lateralDistance,
        progress: edge.length > EPS ? hit.distanceAlong / edge.length : 0,
      };
    }
    return best;
  };

  graph.findRoute = (start, destination) => {
    const from = start?.edgeId ? start : graph.project(start);
    const to = destination?.edgeId ? destination : graph.project(destination);
    if (!from || !to) return null;
    const fromEdge = graph.edgeById.get(from.edgeId);
    const toEdge = graph.edgeById.get(to.edgeId);
    const candidates = [];

    if (from.edgeId === to.edgeId) {
      candidates.push({
        distance: Math.abs(to.progress - from.progress) * fromEdge.length,
        edgeIds: [from.edgeId],
        polyline: [from.position.clone(), to.position.clone()],
      });
    }
    const starts = [
      { node: fromEdge.a, cost: from.progress * fromEdge.length },
      { node: fromEdge.b, cost: (1 - from.progress) * fromEdge.length },
    ];
    const goals = [
      { node: toEdge.a, cost: to.progress * toEdge.length },
      { node: toEdge.b, cost: (1 - to.progress) * toEdge.length },
    ];
    for (const s of starts) for (const g of goals) {
      const middle = shortestNodePath(graph, s.node, g.node);
      if (!middle) continue;
      const nodePoints = middle.nodeIds.map((id) => graph.byId.get(id).position.clone());
      candidates.push({
        distance: s.cost + middle.distance + g.cost,
        edgeIds: [from.edgeId, ...middle.edgeIds, to.edgeId].filter((id, i, a) => i === 0 || id !== a[i - 1]),
        polyline: [from.position.clone(), ...nodePoints, to.position.clone()],
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const route = candidates[0];
    if (!route) return null;
    route.polyline = route.polyline.filter((p, i, a) => i === 0 || p.distanceToSquared(a[i - 1]) > EPS);
    route.maneuver = routeManeuver(route.polyline);
    route.start = from;
    route.destination = to;
    return route;
  };

  return graph;
}

/**
 * Delivery anchors tucked against a curb.
 *
 * Ladder graphs (graph.rows): five anchors per row at fixed fractions, offset
 * in Z — the original rectangular-district behaviour.
 *
 * Explicit graphs (createRoadGraph): three anchors per district, spread across
 * its 'street' edges, offset PERPENDICULAR to the edge's travel direction so
 * rotated districts work. Anchors without verified street-level ground are
 * skipped — a stranded anchor would crash order generation (orders.js binds
 * every restaurant to one).
 */
export function createDeliveryAnchors(graph, findGround = null) {
  if (graph.rows?.length) {
    const anchors = [];
    const fractions = [0.16, 0.32, 0.5, 0.68, 0.84];
    for (const row of graph.rows) {
      const a = row.points[0], b = row.points[row.points.length - 1];
      fractions.forEach((progress, i) => {
        const center = a.clone().lerp(b, progress);
        const projection = graph.project(center);
        const side = (i + row.index) % 2 ? 1 : -1;
        const point = center.clone();
        // Leave the objective in the curb lane instead of the middle of the
        // carriageway. At 46% of road width the stop reads as a shop/customer
        // pull-over while retaining a little clearance from sidewalk geometry.
        point.z += side * graph.roadWidth * 0.46;
        const ground = findGround?.(point.x, point.z);
        if (ground) point.y = ground.point.y;
        anchors.push({
          id: `${row.id}-${i}`,
          edgeId: projection.edgeId,
          progress: projection.progress,
          point,
          position: projection.position,
          roadPoint: center,
          heading: Math.atan2(b.x - a.x, b.z - a.z) + (side > 0 ? Math.PI : 0),
          side,
        });
      });
    }
    return anchors;
  }

  const anchors = [];
  const fractions = [0.24, 0.52, 0.8];
  const byDistrict = new Map();
  for (const edge of graph.edges) {
    if (edge.kind !== 'street' || edge.district == null || edge.district < 0) continue;
    if (!byDistrict.has(edge.district)) byDistrict.set(edge.district, []);
    byDistrict.get(edge.district).push(edge);
  }
  for (const [district, edges] of [...byDistrict.entries()].sort((a, b) => a[0] - b[0])) {
    fractions.forEach((fraction, i) => {
      const edge = edges[i % edges.length];
      // Walk the polyline to `fraction` of its length.
      const target = fraction * edge.length;
      let walked = 0;
      let center = null;
      let dir = null;
      for (let s = 1; s < edge.points.length; s++) {
        const a = edge.points[s - 1];
        const b = edge.points[s];
        const len = a.distanceTo(b);
        if (walked + len >= target || s === edge.points.length - 1) {
          const t = len > EPS ? THREE.MathUtils.clamp((target - walked) / len, 0, 1) : 0;
          center = a.clone().lerp(b, t);
          dir = b.clone().sub(a).setY(0).normalize();
          break;
        }
        walked += len;
      }
      if (!center || !dir) return;
      const side = (i + district) % 2 ? 1 : -1;
      const normal = new THREE.Vector3(-dir.z, 0, dir.x);
      // 32% of road width, not the ladder's 46%: these streets are 5.8-7 m
      // between curbs, and 3.7 m off centre overshoots the carriageway.
      const point = center.clone().addScaledVector(normal, side * graph.roadWidth * 0.32);
      const ground = findGround?.(point.x, point.z);
      if (!ground || Math.abs(ground.point.y - center.y) > 2) return;
      point.y = ground.point.y;
      const projection = graph.project(center);
      if (!projection) return;
      anchors.push({
        id: `d${district}-${i}`,
        edgeId: projection.edgeId,
        progress: projection.progress,
        point,
        position: projection.position,
        roadPoint: center,
        heading: Math.atan2(dir.x, dir.z) + (side > 0 ? Math.PI : 0),
        side,
      });
    });
  }
  return anchors;
}

export function validateRoadGraph(graph) {
  const errors = [];
  if (!graph.nodes.length || !graph.edges.length) errors.push('graph is empty');
  for (const node of graph.nodes) {
    const degree = graph.adjacency.get(node.id)?.length || 0;
    if (degree < 2) errors.push(`${node.id} has degree ${degree}`);
  }
  const seen = new Set();
  const visit = (id, skipEdge = null) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const item of graph.adjacency.get(id) || []) if (item.edge.id !== skipEdge) visit(item.node, skipEdge);
  };
  if (graph.nodes[0]) visit(graph.nodes[0].id);
  if (seen.size !== graph.nodes.length) errors.push(`graph is disconnected (${seen.size}/${graph.nodes.length} nodes reached)`);
  for (const edge of graph.edges) {
    seen.clear(); visit(edge.a, edge.id);
    if (!seen.has(edge.b)) errors.push(`${edge.id} is a bridge/dead-end dependency`);
  }
  return { ok: errors.length === 0, errors };
}
