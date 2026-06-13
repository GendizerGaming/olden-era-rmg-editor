import { describe, expect, it } from "vitest";
import { analyzeBalance } from "../src/services/balanceAnalyzer.ts";
import type { Edge, MapSettings, Zone, ZoneMainObject } from "../src/types/editor.ts";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

const settings = { sizeX: 128, sizeZ: 128 } as MapSettings;

function spawnObject(player: number): ZoneMainObject {
  return { key: `s${player}`, type: 'Spawn', player, factionMode: 'random' };
}

function zone(id: string, wealth: number, player?: number): Zone {
  return {
    id,
    label: id,
    type: 'custom',
    x: 0.5,
    y: 0.5,
    size: 1,
    biomeMode: 'random',
    biomeSource: '',
    biomeId: 'Grass',
    mainObjects: player ? [spawnObject(player)] : [],
    guardedValue: wealth,
    unguardedValue: 0,
    resourcesValue: 0,
    objects: []
  };
}

function edge(from: string, to: string, guardValue = 40000): Edge {
  return { id: `${from}__${to}`, from, to, guardValue, road: true, connectionType: 'Direct' };
}

describe("balance analyzer", () => {
  it("gives a symmetric duel a top score", () => {
    // P1 — N1 — C — N2 — P2: a perfectly mirrored chain
    const zones = [
      zone('P1', 240000, 1),
      zone('N1', 240000),
      zone('C', 600000),
      zone('N2', 240000),
      zone('P2', 240000, 2)
    ];
    const edges = [edge('P1', 'N1'), edge('N1', 'C'), edge('C', 'N2'), edge('N2', 'P2')];

    const report = analyzeBalance(settings, zones, edges, t);
    expect(report.score).toBe(100);
    expect(report.summary.wealthSpread).toBe(0);
    expect(report.summary.players).toBe(2);
    expect(report.summary.totalWealth).toBe(1560000);
    // The single-exit notes are allowed (a chain duel has them by design),
    // but no imbalance findings.
    expect(report.findings.some(([, text]) =>
      text.startsWith('balanceWealthWarn') || text.startsWith('balanceWealthBad') ||
      text.startsWith('balanceDistance') && !text.startsWith('balanceDistanceOk')
    )).toBe(false);
  });

  it("flags a wealth skew towards one player", () => {
    // The treasury hangs directly off P1's spawn; P2 is four hops away
    const zones = [
      zone('P1', 240000, 1),
      zone('N1', 240000),
      zone('T', 800000),
      zone('N2', 240000),
      zone('P2', 240000, 2)
    ];
    const edges = [
      edge('P1', 'N1'), edge('N1', 'N2'), edge('N2', 'P2'),
      edge('P1', 'T', 80000)
    ];

    const report = analyzeBalance(settings, zones, edges, t);
    expect(report.summary.wealthSpread).toBeGreaterThan(0.1);
    expect(report.score).not.toBeNull();
    expect(report.score!).toBeLessThan(90);
    expect(report.findings.some(([, text]) => text.startsWith('balanceWealth'))).toBe(true);
  });

  it("warns about adjacent spawns and single exits", () => {
    const zones = [zone('P1', 240000, 1), zone('P2', 240000, 2)];
    const edges = [edge('P1', 'P2')];

    const report = analyzeBalance(settings, zones, edges, t);
    const texts = report.findings.map(([, text]) => text);
    expect(texts.some((text) => text.startsWith('balanceAdjacentSpawns'))).toBe(true);
    expect(texts.filter((text) => text.startsWith('balanceSingleExit'))).toHaveLength(2);
  });

  it("spots a rich zone behind a cheap entrance", () => {
    const zones = [
      zone('P1', 240000, 1),
      zone('N1', 100000),
      zone('T', 900000),
      zone('N2', 100000),
      zone('P2', 240000, 2)
    ];
    const edges = [
      edge('P1', 'N1'), edge('N1', 'T', 1000), edge('T', 'N2', 1000), edge('N2', 'P2')
    ];

    const report = analyzeBalance(settings, zones, edges, t);
    expect(report.findings.some(([, text]) => text.startsWith('balanceCheapEntrance'))).toBe(true);
  });

  it("skips the score when there are no spawns", () => {
    const zones = [zone('A', 100000), zone('B', 100000)];
    const report = analyzeBalance(settings, zones, [edge('A', 'B')], t);
    expect(report.score).toBeNull();
    expect(report.findings.some(([, text]) => text === 'balanceNoSpawns')).toBe(true);
  });

  it("analyzes a single-spawn PvE map structurally without symmetry checks", () => {
    const zones = [zone('P1', 240000, 1), zone('N1', 200000), zone('T', 800000)];
    const edges = [edge('P1', 'N1'), edge('N1', 'T', 120000)];

    const report = analyzeBalance(settings, zones, edges, t);
    expect(report.score).not.toBeNull();
    // The only player has one exit — structural note still applies
    expect(report.findings.some(([, text]) => text.startsWith('balanceSingleExit'))).toBe(true);
    // No symmetry findings for a single player
    expect(report.findings.some(([, text]) => text.startsWith('balanceWealth'))).toBe(false);
  });

  it("ignores springs when building the passage graph", () => {
    const zones = [zone('P1', 240000, 1), zone('P2', 240000, 2), zone('N1', 200000)];
    const edges: Edge[] = [
      edge('P1', 'N1'), edge('N1', 'P2'),
      { id: 'spring', from: 'P1', to: 'P2', guardValue: 0, road: false, connectionType: 'Proximity', length: 0.5 }
    ];

    const report = analyzeBalance(settings, zones, edges, t);
    expect(report.summary.connections).toBe(2);
    // The spring must not count as adjacency
    expect(report.findings.some(([, text]) => text.startsWith('balanceAdjacentSpawns'))).toBe(false);
  });
});
