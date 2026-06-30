import { describe, expect, it } from "vitest";
import { validate } from "../src/services/validator.ts";
import type { Edge, MapSettings, Zone, ZoneMainObject } from "../src/types/editor.ts";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

const settings = {
  sizeX: 128,
  sizeZ: 128,
  players: 2,
  victoryMode: "classic",
  heroLimitMode: "fixed",
  terrainProfiles: []
} as unknown as MapSettings;

function spawnObject(player: number): ZoneMainObject {
  return { key: `s${player}`, type: "Spawn", player, factionMode: "random" };
}

function zone(id: string, player?: number): Zone {
  return {
    id,
    label: id,
    type: player ? "spawn" : "custom",
    x: 0.5,
    y: 0.5,
    size: 1,
    biomeMode: "random",
    biomeSource: "",
    biomeId: "Grass",
    mainObjects: player ? [spawnObject(player)] : [],
    guardedValue: 0,
    unguardedValue: 0,
    resourcesValue: 0,
    objects: []
  };
}

function edge(from: string, to: string, connectionType: Edge["connectionType"]): Edge {
  return { id: `${from}__${to}`, from, to, guardValue: 0, road: true, connectionType };
}

describe("validator connectivity ignores springs", () => {
  it("treats zones linked only by a spring as disconnected", () => {
    const zones = [zone("P1", 1), zone("P2", 2)];
    const edges = [edge("P1", "P2", "Proximity")];

    const texts = validate(settings, zones, edges, false, [], [], t).map(([, text]) => text);
    expect(texts.filter((text) => text.startsWith("disconnectedZone"))).toHaveLength(2);
    expect(texts.some((text) => text.startsWith("disconnectedGraph"))).toBe(true);
  });

  it("does not flag zones linked by a real passage", () => {
    const zones = [zone("P1", 1), zone("P2", 2)];
    const edges = [edge("P1", "P2", "Direct")];

    const texts = validate(settings, zones, edges, false, [], [], t).map(([, text]) => text);
    expect(texts.some((text) => text.startsWith("disconnectedZone"))).toBe(false);
    expect(texts.some((text) => text.startsWith("disconnectedGraph"))).toBe(false);
  });

  it("still counts a spring alongside a passage as connected", () => {
    // P1 — N (passage) plus P1 ~ P2 spring and N — P2 passage: everything reachable
    const zones = [zone("P1", 1), zone("N"), zone("P2", 2)];
    const edges = [
      edge("P1", "N", "Direct"),
      edge("N", "P2", "Portal"),
      edge("P1", "P2", "Proximity")
    ];

    const texts = validate(settings, zones, edges, false, [], [], t).map(([, text]) => text);
    expect(texts.some((text) => text.startsWith("disconnectedZone"))).toBe(false);
    expect(texts.some((text) => text.startsWith("disconnectedGraph"))).toBe(false);
  });
});

describe("validator connectivity is win-condition-aware", () => {
  const settingsWith = (extra: Partial<MapSettings>) =>
    ({ ...settings, ...extra }) as unknown as MapSettings;

  // Two internally-connected halves joined only by a spring — the Exodus shape:
  // each half is its own passage component, the only A<->B link is Proximity.
  const splitMap = () => ({
    zones: [zone("A1", 1), zone("A2"), zone("B1", 2), zone("B2")],
    edges: [
      edge("A1", "A2", "Direct"),
      edge("B1", "B2", "Direct"),
      edge("A1", "B1", "Proximity")
    ]
  });

  it("errors on a split passage graph for a combat win condition", () => {
    const { zones, edges } = splitMap();
    const graph = validate(settings, zones, edges, false, [], [], t)
      .find(([, text]) => text.startsWith("disconnectedGraph"));
    expect(graph).toBeDefined();
    expect(graph![0]).toBe("error"); // classic/combat: players could never meet — broken map
  });

  it("stays silent on a split passage graph for a tournament win condition", () => {
    const { zones, edges } = splitMap();
    const texts = validate(
      settingsWith({ tournamentEnabled: true, tournamentDays: [], tournamentAnnounceDays: [] }),
      zones, edges, false, [], [], t
    ).map(([, text]) => text);
    expect(texts.some((text) => text.startsWith("disconnectedGraph"))).toBe(false);
  });

  it("stays silent for a gladiator-arena win condition too", () => {
    const { zones, edges } = splitMap();
    const texts = validate(settingsWith({ gladiatorArenaEnabled: true }), zones, edges, false, [], [], t)
      .map(([, text]) => text);
    expect(texts.some((text) => text.startsWith("disconnectedGraph"))).toBe(false);
  });
});
