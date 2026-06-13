export type TopologyKind = 'ring' | 'chain' | 'star' | 'random';

export interface TopologyOptions {
  kind: TopologyKind;
  /** Player count, 2..8. */
  players: number;
  /** Neutral zones between adjacent players (ring/chain) or per spoke (star). */
  neutralsPerSegment: number;
  /** Total neutral zone count for the random topology. */
  extraNeutrals: number;
  /** Ring only: add a central zone connected to every segment. */
  centerZone: boolean;
  /** Forbid direct player-player connections. */
  isolatePlayers: boolean;
  /** Seed for the random topology (deterministic for tests). */
  seed?: number;
}

export interface TopologyPlanZone {
  role: 'spawn' | 'neutral' | 'center';
  player?: number;
  x: number;
  y: number;
  /** Neutral richness tier by graph distance from the players: 0 near, 1 mid, 2 far. */
  distanceTier?: 0 | 1 | 2;
}

export interface TopologyPlan {
  zones: TopologyPlanZone[];
  /** Zone index pairs. */
  edges: Array<[number, number]>;
}

/** Deterministic PRNG (mulberry32) so generated layouts are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function onCircle(index: number, count: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / count) * TAU;
  return { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) };
}

function ringPlan(options: TopologyOptions): TopologyPlan {
  const { players, centerZone } = options;
  // The isolation rule needs at least one neutral between players.
  const perSegment = options.isolatePlayers
    ? Math.max(1, options.neutralsPerSegment)
    : options.neutralsPerSegment;
  const zones: TopologyPlanZone[] = [];
  const edges: Array<[number, number]> = [];
  const slots = players * (1 + perSegment);

  // On a crowded ring the neighbours sit closer than two zone circles and
  // the edges disappear behind them. Alternating the neutrals between an
  // inner and an outer radius turns the edges into visible diagonals; the
  // pattern repeats per segment, so every player sees the same picture.
  const chord = 2 * 0.36 * Math.sin(Math.PI / slots);
  const wobble = chord < 0.12 ? 0.07 : 0;

  const segmentMiddles: number[] = [];
  for (let p = 0; p < players; p++) {
    const playerIndex = zones.length;
    const slot = p * (1 + perSegment);
    zones.push({ role: 'spawn', player: p + 1, ...onCircle(slot, slots, 0.36) });
    for (let n = 0; n < perSegment; n++) {
      const radius = 0.36 + (n % 2 === 0 ? wobble : -wobble);
      zones.push({ role: 'neutral', ...onCircle(slot + 1 + n, slots, radius) });
      if (n === Math.floor((perSegment - 1) / 2)) segmentMiddles.push(zones.length - 1);
    }
    if (perSegment === 0) segmentMiddles.push(playerIndex);
  }
  // The zones are already laid out in ring order — connect them around the
  // circle (a two-zone "ring" degenerates into a single edge, not a double).
  for (let i = 0; i < slots; i++) {
    if (slots === 2 && i === 1) break;
    edges.push([i, (i + 1) % slots]);
  }

  if (centerZone) {
    const centerIndex = zones.length;
    zones.push({ role: 'center', x: 0.5, y: 0.5 });
    for (const middle of segmentMiddles) {
      // With no neutrals the "middles" are the players themselves; a direct
      // player-center link is allowed even with isolation (it is not p-p).
      edges.push([middle, centerIndex]);
    }
  }
  return { zones, edges };
}

function chainPlan(options: TopologyOptions): TopologyPlan {
  const { players } = options;
  const perSegment = options.isolatePlayers
    ? Math.max(1, options.neutralsPerSegment)
    : options.neutralsPerSegment;
  const zones: TopologyPlanZone[] = [];
  const edges: Array<[number, number]> = [];
  const total = players + (players - 1) * perSegment;

  for (let p = 0; p < players; p++) {
    zones.push({ role: 'spawn', player: p + 1, x: 0, y: 0 });
    if (p < players - 1) {
      for (let n = 0; n < perSegment; n++) zones.push({ role: 'neutral', x: 0, y: 0 });
    }
  }
  // Lay the chain out left to right with a gentle vertical wave so the
  // collinear edges remain clickable.
  zones.forEach((zone, index) => {
    const tPos = total === 1 ? 0.5 : index / (total - 1);
    zone.x = 0.1 + tPos * 0.8;
    zone.y = 0.5 + (index % 2 === 0 ? -1 : 1) * 0.05;
  });
  for (let i = 0; i < zones.length - 1; i++) edges.push([i, i + 1]);
  return { zones, edges };
}

function starPlan(options: TopologyOptions): TopologyPlan {
  const { players, neutralsPerSegment } = options;
  const zones: TopologyPlanZone[] = [{ role: 'center', x: 0.5, y: 0.5 }];
  const edges: Array<[number, number]> = [];

  // Long spokes get the same anti-crowding treatment as the ring: the
  // neutrals zigzag across the spoke axis so the edges stay visible.
  const spokeSpacing = 0.4 / (neutralsPerSegment + 1);
  const spokeWobble = spokeSpacing < 0.1 ? 0.06 : 0;

  for (let p = 0; p < players; p++) {
    const spawn = onCircle(p, players, 0.4);
    const spawnIndex = zones.length;
    zones.push({ role: 'spawn', player: p + 1, ...spawn });
    const spokeLength = Math.hypot(0.5 - spawn.x, 0.5 - spawn.y);
    const perpX = -(0.5 - spawn.y) / spokeLength;
    const perpY = (0.5 - spawn.x) / spokeLength;
    let previous = spawnIndex;
    for (let n = 0; n < neutralsPerSegment; n++) {
      // Spoke neutrals sit between the player and the center.
      const tPos = (n + 1) / (neutralsPerSegment + 1);
      const side = n % 2 === 0 ? 1 : -1;
      zones.push({
        role: 'neutral',
        x: spawn.x + (0.5 - spawn.x) * tPos + perpX * spokeWobble * side,
        y: spawn.y + (0.5 - spawn.y) * tPos + perpY * spokeWobble * side
      });
      edges.push([previous, zones.length - 1]);
      previous = zones.length - 1;
    }
    edges.push([previous, 0]);
  }
  return { zones, edges };
}

function randomPlan(options: TopologyOptions): TopologyPlan {
  const { players, extraNeutrals, isolatePlayers } = options;
  const random = mulberry32(options.seed ?? Date.now());
  const zones: TopologyPlanZone[] = [];

  // Players go on a circle for fairness; neutrals fill the inside with a
  // minimum-distance rejection so zones don't pile up.
  for (let p = 0; p < players; p++) {
    zones.push({ role: 'spawn', player: p + 1, ...onCircle(p, players, 0.38) });
  }
  const minDistance = 0.16;
  for (let n = 0; n < extraNeutrals; n++) {
    let placed = false;
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const x = 0.12 + random() * 0.76;
      const y = 0.12 + random() * 0.76;
      if (zones.every((zone) => Math.hypot(zone.x - x, zone.y - y) >= minDistance)) {
        zones.push({ role: 'neutral', x, y });
        placed = true;
      }
    }
    if (!placed) {
      // The map is saturated; a slightly cramped zone beats an endless loop.
      zones.push({ role: 'neutral', x: 0.12 + random() * 0.76, y: 0.12 + random() * 0.76 });
    }
  }

  // Minimum spanning tree guarantees connectivity; player-player edges get a
  // heavy penalty so isolation holds whenever neutrals exist at all.
  const isPP = (a: number, b: number) => zones[a].role === 'spawn' && zones[b].role === 'spawn';
  const weight = (a: number, b: number) => {
    const distance = Math.hypot(zones[a].x - zones[b].x, zones[a].y - zones[b].y);
    return distance + (isolatePlayers && isPP(a, b) ? 100 : 0);
  };
  const edges: Array<[number, number]> = [];
  const inTree = new Set<number>([0]);
  while (inTree.size < zones.length) {
    let best: [number, number] | null = null;
    let bestWeight = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < zones.length; b++) {
        if (inTree.has(b)) continue;
        const w = weight(a, b);
        if (w < bestWeight) {
          bestWeight = w;
          best = [a, b];
        }
      }
    }
    edges.push(best!);
    inTree.add(best![1]);
  }

  // A few extra short links so the map is not a pure tree.
  const degree = new Map<number, number>();
  const hasEdge = (a: number, b: number) =>
    edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  edges.forEach(([a, b]) => {
    degree.set(a, (degree.get(a) || 0) + 1);
    degree.set(b, (degree.get(b) || 0) + 1);
  });
  for (let a = 0; a < zones.length; a++) {
    if ((degree.get(a) || 0) >= 3) continue;
    let best = -1;
    let bestDistance = Infinity;
    for (let b = 0; b < zones.length; b++) {
      if (a === b || hasEdge(a, b) || (degree.get(b) || 0) >= 3) continue;
      if (isolatePlayers && isPP(a, b)) continue;
      const distance = Math.hypot(zones[a].x - zones[b].x, zones[a].y - zones[b].y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = b;
      }
    }
    if (best >= 0 && bestDistance < 0.4) {
      edges.push([a, best]);
      degree.set(a, (degree.get(a) || 0) + 1);
      degree.set(best, (degree.get(best) || 0) + 1);
    }
  }
  return { zones, edges };
}

/**
 * Richness gradient: neutrals adjacent to a player are "near" (tier 0), the
 * deepest ones are "far" (tier 2, only when the map is deep enough for a
 * middle layer to exist), everything between is "mid". Distances are graph
 * hops from the closest player, so symmetric topologies stay symmetric.
 */
function assignDistanceTiers(plan: TopologyPlan): TopologyPlan {
  const neighbors = new Map<number, number[]>();
  plan.edges.forEach(([a, b]) => {
    neighbors.set(a, [...(neighbors.get(a) || []), b]);
    neighbors.set(b, [...(neighbors.get(b) || []), a]);
  });

  // Multi-source BFS from every spawn at once.
  const distance = new Map<number, number>();
  const queue: number[] = [];
  plan.zones.forEach((zone, index) => {
    if (zone.role === 'spawn') {
      distance.set(index, 0);
      queue.push(index);
    }
  });
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) || []) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(current)! + 1);
        queue.push(next);
      }
    }
  }

  const neutralDistances = plan.zones
    .map((zone, index) => zone.role === 'neutral' ? distance.get(index) : undefined)
    .filter((d): d is number => d !== undefined);
  if (neutralDistances.length === 0) return plan;
  const minD = Math.min(...neutralDistances);
  const maxD = Math.max(...neutralDistances);

  plan.zones.forEach((zone, index) => {
    if (zone.role !== 'neutral') return;
    const d = distance.get(index) ?? minD;
    zone.distanceTier = d === minD ? 0 : (d === maxD && maxD >= minD + 2) ? 2 : 1;
  });
  return plan;
}

export function buildTopologyPlan(options: TopologyOptions): TopologyPlan {
  const clamped: TopologyOptions = {
    ...options,
    players: Math.min(8, Math.max(2, Math.trunc(options.players) || 2)),
    // Six per segment lets the ring/chain reach depth 3, where the "far"
    // richness tier starts (1-2-3-3-2-1).
    neutralsPerSegment: Math.min(6, Math.max(0, Math.trunc(options.neutralsPerSegment) || 0)),
    extraNeutrals: Math.min(40, Math.max(0, Math.trunc(options.extraNeutrals) || 0))
  };
  switch (clamped.kind) {
    case 'ring': return assignDistanceTiers(ringPlan(clamped));
    case 'chain': return assignDistanceTiers(chainPlan(clamped));
    case 'star': return assignDistanceTiers(starPlan(clamped));
    case 'random': return assignDistanceTiers(randomPlan(clamped));
  }
}
