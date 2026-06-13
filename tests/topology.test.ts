import { describe, expect, it } from "vitest";
import { buildTopologyPlan } from "../src/services/topologyGenerator.ts";
import type { TopologyOptions, TopologyPlan } from "../src/services/topologyGenerator.ts";

const base: TopologyOptions = {
  kind: "ring",
  players: 4,
  neutralsPerSegment: 1,
  extraNeutrals: 8,
  centerZone: false,
  isolatePlayers: false,
  seed: 42
};

function isConnected(plan: TopologyPlan): boolean {
  if (plan.zones.length === 0) return true;
  const neighbors = new Map<number, number[]>();
  plan.edges.forEach(([a, b]) => {
    neighbors.set(a, [...(neighbors.get(a) || []), b]);
    neighbors.set(b, [...(neighbors.get(b) || []), a]);
  });
  const visited = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    for (const next of neighbors.get(queue.pop()!) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited.size === plan.zones.length;
}

function hasPlayerPlayerEdge(plan: TopologyPlan): boolean {
  return plan.edges.some(([a, b]) =>
    plan.zones[a].role === "spawn" && plan.zones[b].role === "spawn"
  );
}

describe("topology generator", () => {
  it("builds a ring with the requested zone counts", () => {
    const plan = buildTopologyPlan({ ...base, kind: "ring", players: 4, neutralsPerSegment: 2 });
    expect(plan.zones.filter((z) => z.role === "spawn")).toHaveLength(4);
    expect(plan.zones.filter((z) => z.role === "neutral")).toHaveLength(8);
    expect(plan.edges).toHaveLength(12); // closed ring: edges = zones
    expect(isConnected(plan)).toBe(true);
    // Player numbers 1..4 assigned
    expect(plan.zones.filter((z) => z.role === "spawn").map((z) => z.player).sort()).toEqual([1, 2, 3, 4]);
  });

  it("adds a connected central zone to the ring", () => {
    const plan = buildTopologyPlan({ ...base, kind: "ring", players: 3, neutralsPerSegment: 1, centerZone: true });
    const centerIndex = plan.zones.findIndex((z) => z.role === "center");
    expect(centerIndex).toBeGreaterThanOrEqual(0);
    const centerEdges = plan.edges.filter(([a, b]) => a === centerIndex || b === centerIndex);
    expect(centerEdges).toHaveLength(3); // one per segment
    expect(isConnected(plan)).toBe(true);
  });

  it("forces a neutral between players when isolation is on", () => {
    const ring = buildTopologyPlan({ ...base, kind: "ring", neutralsPerSegment: 0, isolatePlayers: true });
    expect(hasPlayerPlayerEdge(ring)).toBe(false);
    const chain = buildTopologyPlan({ ...base, kind: "chain", players: 3, neutralsPerSegment: 0, isolatePlayers: true });
    expect(hasPlayerPlayerEdge(chain)).toBe(false);
  });

  it("builds a chain as a line", () => {
    const plan = buildTopologyPlan({ ...base, kind: "chain", players: 2, neutralsPerSegment: 3 });
    expect(plan.zones).toHaveLength(5);
    expect(plan.edges).toHaveLength(4);
    expect(plan.zones[0].role).toBe("spawn");
    expect(plan.zones[4].role).toBe("spawn");
    expect(isConnected(plan)).toBe(true);
  });

  it("builds a star with spokes through the center", () => {
    const plan = buildTopologyPlan({ ...base, kind: "star", players: 4, neutralsPerSegment: 1 });
    expect(plan.zones.filter((z) => z.role === "center")).toHaveLength(1);
    expect(plan.zones.filter((z) => z.role === "spawn")).toHaveLength(4);
    expect(plan.zones.filter((z) => z.role === "neutral")).toHaveLength(4);
    expect(plan.edges).toHaveLength(8); // each spoke: spawn-neutral + neutral-center
    expect(isConnected(plan)).toBe(true);
    expect(hasPlayerPlayerEdge(plan)).toBe(false);
  });

  it("builds a connected random topology without player-player edges when isolated", () => {
    const plan = buildTopologyPlan({ ...base, kind: "random", players: 4, extraNeutrals: 10, isolatePlayers: true });
    expect(plan.zones).toHaveLength(14);
    expect(isConnected(plan)).toBe(true);
    expect(hasPlayerPlayerEdge(plan)).toBe(false);
    // All coordinates stay inside the canvas
    for (const zone of plan.zones) {
      expect(zone.x).toBeGreaterThan(0);
      expect(zone.x).toBeLessThan(1);
      expect(zone.y).toBeGreaterThan(0);
      expect(zone.y).toBeLessThan(1);
    }
  });

  it("assigns richness tiers by distance from the players", () => {
    // Ring, 3 neutrals per segment: L–M–L between players
    const ring = buildTopologyPlan({ ...base, kind: "ring", players: 2, neutralsPerSegment: 3 });
    const ringTiers = ring.zones.filter((z) => z.role === "neutral").map((z) => z.distanceTier);
    expect(ringTiers).toEqual([0, 1, 0, 0, 1, 0]);

    // Star with 2-neutral spokes: near at the player, mid towards the center
    const star = buildTopologyPlan({ ...base, kind: "star", players: 3, neutralsPerSegment: 2 });
    const starTiers = star.zones.filter((z) => z.role === "neutral").map((z) => z.distanceTier);
    expect(starTiers).toEqual([0, 1, 0, 1, 0, 1]);

    // Star with 3-neutral spokes: the deepest layer becomes "far"
    const deepStar = buildTopologyPlan({ ...base, kind: "star", players: 2, neutralsPerSegment: 3 });
    const deepTiers = deepStar.zones.filter((z) => z.role === "neutral").map((z) => z.distanceTier);
    expect(deepTiers).toEqual([0, 1, 2, 0, 1, 2]);

    // Ring with 5 per segment reaches depth 3: the far tier appears
    const deepRing = buildTopologyPlan({ ...base, kind: "ring", players: 2, neutralsPerSegment: 5 });
    const deepRingTiers = deepRing.zones.filter((z) => z.role === "neutral").map((z) => z.distanceTier);
    expect(deepRingTiers).toEqual([0, 1, 2, 1, 0, 0, 1, 2, 1, 0]);

    // One neutral per segment: no gradient exists — everything is "near"
    const tight = buildTopologyPlan({ ...base, kind: "ring", players: 4, neutralsPerSegment: 1 });
    const tightTiers = tight.zones.filter((z) => z.role === "neutral").map((z) => z.distanceTier);
    expect(tightTiers).toEqual([0, 0, 0, 0]);

    // The center zone is not part of the neutral gradient
    const withCenter = buildTopologyPlan({ ...base, kind: "ring", players: 3, neutralsPerSegment: 1, centerZone: true });
    expect(withCenter.zones.find((z) => z.role === "center")?.distanceTier).toBeUndefined();
  });

  it("spreads crowded rings and spokes so the edges stay visible", () => {
    const minEdgeLength = (plan: TopologyPlan) => Math.min(...plan.edges
      .filter(([a, b]) => plan.zones[a].role !== 'center' && plan.zones[b].role !== 'center')
      .map(([a, b]) => Math.hypot(plan.zones[a].x - plan.zones[b].x, plan.zones[a].y - plan.zones[b].y))
    );

    // 4 players × 6 neutrals = a 28-slot ring: without the zigzag the
    // neighbours sit ~0.08 apart, fully hidden behind the zone circles.
    const crowdedRing = buildTopologyPlan({ ...base, kind: "ring", players: 4, neutralsPerSegment: 6 });
    expect(minEdgeLength(crowdedRing)).toBeGreaterThan(0.095);

    const crowdedStar = buildTopologyPlan({ ...base, kind: "star", players: 4, neutralsPerSegment: 5 });
    expect(minEdgeLength(crowdedStar)).toBeGreaterThan(0.085);

    // Everything stays inside the canvas
    for (const plan of [crowdedRing, crowdedStar]) {
      for (const zone of plan.zones) {
        expect(zone.x).toBeGreaterThan(0.02);
        expect(zone.x).toBeLessThan(0.98);
        expect(zone.y).toBeGreaterThan(0.02);
        expect(zone.y).toBeLessThan(0.98);
      }
    }

    // A roomy ring keeps the clean circle — no zigzag
    const roomyRing = buildTopologyPlan({ ...base, kind: "ring", players: 4, neutralsPerSegment: 1 });
    const radii = roomyRing.zones.map((z) => Math.hypot(z.x - 0.5, z.y - 0.5));
    radii.forEach((radius) => expect(radius).toBeCloseTo(0.36, 5));
  });

  it("is deterministic for a fixed seed", () => {
    const first = buildTopologyPlan({ ...base, kind: "random", seed: 7 });
    const second = buildTopologyPlan({ ...base, kind: "random", seed: 7 });
    expect(second).toEqual(first);
    const different = buildTopologyPlan({ ...base, kind: "random", seed: 8 });
    expect(JSON.stringify(different)).not.toBe(JSON.stringify(first));
  });
});
