import type { Edge, MapSettings, Zone } from '../types/editor';

export type BalanceSeverity = 'ok' | 'warn' | 'bad';
export type BalanceFinding = [BalanceSeverity, string];

export interface BalanceReport {
  /** 0–100; null when the map has no spawn zones to judge. */
  score: number | null;
  findings: BalanceFinding[];
  summary: {
    zones: number;
    connections: number;
    players: number;
    /** Sum of guarded + unguarded + resource values over all zones. */
    totalWealth: number;
    wealthPerPlayer: number;
    /** Relative spread (max−min)/max of the per-player accessible wealth, 0..1. */
    wealthSpread: number;
    averageGuard: number;
  };
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Absolute zone wealth. The perArea components are deliberately excluded:
 * their in-game unit is not confirmed, and for symmetry comparisons they
 * scale the same way on both sides anyway.
 */
function zoneWealth(zone: Zone): number {
  return (Number(zone.guardedValue) || 0)
    + (Number(zone.unguardedValue) || 0)
    + (Number(zone.resourcesValue) || 0);
}

/** BFS hop distances from a zone over the passage graph (springs excluded). */
function distancesFrom(start: string, neighbors: Map<string, string[]>): Map<string, number> {
  const distance = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of neighbors.get(current) || []) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(current)! + 1);
        queue.push(next);
      }
    }
  }
  return distance;
}

function spread(values: number[]): number {
  if (values.length < 2) return 0;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max > 0 ? (max - min) / max : 0;
}

/**
 * Balance analysis of the assembled template. Everything is heuristic and
 * advisory: the score starts at 100 and loses points for player asymmetry
 * (wealth, distances, exit guards) and structural smells. Correctness
 * problems (disconnected graphs etc.) belong to the validator, not here.
 */
export function analyzeBalance(
  settings: MapSettings,
  zones: Zone[],
  edges: Edge[],
  t: TranslateFn
): BalanceReport {
  const passages = edges.filter((edge) => edge.connectionType !== 'Proximity');
  const neighbors = new Map<string, string[]>(zones.map((zone) => [zone.id, []]));
  for (const edge of passages) {
    if (!neighbors.has(edge.from) || !neighbors.has(edge.to)) continue;
    neighbors.get(edge.from)!.push(edge.to);
    neighbors.get(edge.to)!.push(edge.from);
  }

  const spawns = zones
    .map((zone) => ({
      zone,
      player: zone.mainObjects?.find((mo) => mo.type === 'Spawn')?.player ?? null
    }))
    .filter((entry) => entry.zone.mainObjects?.some((mo) => mo.type === 'Spawn'));

  const totalWealth = zones.reduce((sum, zone) => sum + zoneWealth(zone), 0);
  const averageGuard = passages.length
    ? Math.round(passages.reduce((sum, edge) => sum + (Number(edge.guardValue) || 0), 0) / passages.length)
    : 0;

  const findings: BalanceFinding[] = [];

  if (spawns.length === 0) {
    return {
      score: null,
      findings: [['warn', t('balanceNoSpawns')]],
      summary: {
        zones: zones.length,
        connections: passages.length,
        players: 0,
        totalWealth,
        wealthPerPlayer: 0,
        wealthSpread: 0,
        averageGuard
      }
    };
  }

  let score = 100;
  const playerName = (entry: typeof spawns[number]) =>
    entry.player ? t('balancePlayer', { num: entry.player }) : entry.zone.id;

  // ── Per-player metrics ────────────────────────────────────────────────
  const perPlayer = spawns.map((entry) => {
    const distance = distancesFrom(entry.zone.id, neighbors);
    // "Gravity" wealth: every reachable zone contributes its wealth damped
    // by graph distance — a rich zone two steps away is worth more to this
    // player than the same zone five steps away.
    let gravity = 0;
    for (const zone of zones) {
      const d = distance.get(zone.id);
      if (d === undefined) continue;
      gravity += zoneWealth(zone) / (1 + d);
    }
    const othersDistances = spawns
      .filter((other) => other !== entry)
      .map((other) => distance.get(other.zone.id))
      .filter((d): d is number => d !== undefined);
    const exitGuards = passages
      .filter((edge) => edge.from === entry.zone.id || edge.to === entry.zone.id)
      .map((edge) => Number(edge.guardValue) || 0);
    return {
      entry,
      gravity,
      averageOpponentDistance: othersDistances.length
        ? othersDistances.reduce((sum, d) => sum + d, 0) / othersDistances.length
        : 0,
      minExitGuard: exitGuards.length ? Math.min(...exitGuards) : 0,
      exitCount: exitGuards.length
    };
  });

  // Wealth symmetry (the heaviest weight: unequal access decides games)
  const wealthSpread = spread(perPlayer.map((p) => p.gravity));
  if (spawns.length > 1) {
    score -= Math.min(45, Math.round(wealthSpread * 180));
    if (wealthSpread > 0.25) {
      const poorest = perPlayer.reduce((a, b) => (a.gravity < b.gravity ? a : b));
      findings.push(['bad', t('balanceWealthBad', {
        spread: Math.round(wealthSpread * 100),
        player: playerName(poorest.entry)
      })]);
    } else if (wealthSpread > 0.1) {
      findings.push(['warn', t('balanceWealthWarn', { spread: Math.round(wealthSpread * 100) })]);
    } else {
      findings.push(['ok', t('balanceWealthOk', { spread: Math.round(wealthSpread * 100) })]);
    }

    // Distance symmetry: everyone should be equally far from the action
    const distanceSpread = spread(perPlayer.map((p) => p.averageOpponentDistance));
    score -= Math.min(25, Math.round(distanceSpread * 100));
    if (distanceSpread > 0.25) {
      findings.push(['bad', t('balanceDistanceBad', { spread: Math.round(distanceSpread * 100) })]);
    } else if (distanceSpread > 0.1) {
      findings.push(['warn', t('balanceDistanceWarn', { spread: Math.round(distanceSpread * 100) })]);
    } else {
      findings.push(['ok', t('balanceDistanceOk')]);
    }

    // Exit guard symmetry: a cheaper way out is an earlier tempo
    const guardSpread = spread(perPlayer.map((p) => p.minExitGuard));
    score -= Math.min(15, Math.round(guardSpread * 50));
    if (guardSpread > 0.3) {
      findings.push(['warn', t('balanceExitGuardWarn', { spread: Math.round(guardSpread * 100) })]);
    }

    // Direct neighbours: early rush distance
    const pairDistances: number[] = [];
    for (let i = 0; i < spawns.length; i++) {
      const distance = distancesFrom(spawns[i].zone.id, neighbors);
      for (let j = i + 1; j < spawns.length; j++) {
        const d = distance.get(spawns[j].zone.id);
        if (d !== undefined) pairDistances.push(d);
      }
    }
    const minPair = pairDistances.length ? Math.min(...pairDistances) : 0;
    if (minPair === 1) {
      score -= 10;
      findings.push(['warn', t('balanceAdjacentSpawns')]);
    }
  }

  // ── Structural smells (apply to PvE single-spawn maps too) ───────────
  let structuralPenalty = 0;

  // A single exit is a legitimate design choice (every classic duel chain
  // has it), so it is reported as a note without a score penalty.
  for (const player of perPlayer) {
    if (player.exitCount === 1) {
      findings.push(['warn', t('balanceSingleExit', { player: playerName(player.entry) })]);
    }
  }

  // A rich zone with a cheap door: the guard should cost a meaningful share
  // of what it protects.
  const wealthValues = zones.map(zoneWealth).filter((w) => w > 0);
  const averageWealth = wealthValues.length
    ? wealthValues.reduce((sum, w) => sum + w, 0) / wealthValues.length
    : 0;
  for (const zone of zones) {
    if (zone.mainObjects?.some((mo) => mo.type === 'Spawn')) continue;
    const wealth = zoneWealth(zone);
    if (wealth < averageWealth * 1.5 || wealth === 0) continue;
    const entranceGuards = passages
      .filter((edge) => edge.from === zone.id || edge.to === zone.id)
      .map((edge) => Number(edge.guardValue) || 0);
    if (!entranceGuards.length) continue;
    const cheapest = Math.min(...entranceGuards);
    if (cheapest < wealth / 20) {
      structuralPenalty += 5;
      findings.push(['warn', t('balanceCheapEntrance', {
        id: zone.id,
        guard: cheapest,
        wealth: Math.round(wealth / 1000)
      })]);
    }
  }

  score -= Math.min(20, structuralPenalty);
  score = Math.max(0, Math.min(100, score));

  if (findings.every(([severity]) => severity === 'ok')) {
    findings.push(['ok', t('balanceAllGood')]);
  }

  return {
    score,
    findings,
    summary: {
      zones: zones.length,
      connections: passages.length,
      players: spawns.length,
      totalWealth,
      wealthPerPlayer: spawns.length ? Math.round(totalWealth / spawns.length) : 0,
      wealthSpread,
      averageGuard
    }
  };
}
