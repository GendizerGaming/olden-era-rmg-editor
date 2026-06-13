import { describe, expect, it } from "vitest";
import { generateTemplate } from "../src/services/jsonGenerator.ts";
import { initialSettings } from "../src/store/constants.ts";
import { defaultPresets, makeZone } from "../src/store/useEditorStore.ts";
import type { Edge, MapSettings, Zone, ZoneObject } from "../src/types/editor.ts";

/**
 * Editor-side export coverage: every UI control maps to a model field, and
 * every model field must land in the right JSON key. These tests build the
 * model directly (no import round-trip) — exactly what the buttons produce.
 */

const makeSettings = (overrides: Partial<MapSettings> = {}): MapSettings => ({
  ...initialSettings,
  terrainProfiles: [],
  contentLimitPresets: [],
  contentPoolPresets: [],
  ...overrides
});

function zone(id: string, type: string, overrides: Partial<Zone> = {}, player?: number): Zone {
  const base = makeZone([], [], [], { id, label: id, type, x: 0.5, y: 0.5, player }, defaultPresets[type] ?? defaultPresets.neutral);
  return { ...base, objects: [], ...overrides };
}

function edge(from: string, to: string, overrides: Partial<Edge> = {}): Edge {
  return { id: `${from}__${to}`, from, to, guardValue: 1000, road: true, connectionType: "Direct", ...overrides };
}

const baseZones = () => [zone("A", "spawn", {}, 1), zone("B", "neutral")];
const baseEdges = () => [edge("A", "B")];

const gen = (settings: MapSettings, zones = baseZones(), edges = baseEdges()) =>
  generateTemplate(settings, zones, edges, [], {}, defaultPresets, {});

describe("export coverage: map settings", () => {
  it("general fields: name, description, sizes, game mode", () => {
    const out = gen(makeSettings({
      name: "My Map",
      description: "story",
      sizeX: 160,
      sizeZ: 96,
      singleHeroMode: true
    }));
    expect(out.name).toBe("My Map");
    expect(out.description).toBe("story");
    expect(out.sizeX).toBe(160);
    expect(out.sizeZ).toBe(96);
    expect(out.gameMode).toBe("SingleHero");
    expect(gen(makeSettings()).gameMode).toBe("Classic");
  });

  it("hero limits: fixed pins min to max with zero increment", () => {
    const fixed = gen(makeSettings({ heroLimitMode: "fixed", heroMax: 5, heroMin: 1, heroIncrement: 3 }));
    expect(fixed.gameRules.heroCountMin).toBe(5);
    expect(fixed.gameRules.heroCountMax).toBe(5);
    expect(fixed.gameRules.heroCountIncrement).toBe(0);

    const perCastle = gen(makeSettings({ heroLimitMode: "perCastle", heroMin: 2, heroMax: 7, heroIncrement: 2 }));
    expect(perCastle.gameRules.heroCountMin).toBe(2);
    expect(perCastle.gameRules.heroCountMax).toBe(7);
    expect(perCastle.gameRules.heroCountIncrement).toBe(2);
  });

  it("desertion and hero lighting toggles with their parameters", () => {
    const on = gen(makeSettings({
      desertionEnabled: true, desertionDay: 5, desertionValue: 7000,
      heroLightingEnabled: true, heroLightingDay: 2
    }));
    expect(on.gameRules.winConditions.desertion).toBe(true);
    expect(on.gameRules.winConditions.desertionDay).toBe(5);
    expect(on.gameRules.winConditions.desertionValue).toBe(7000);
    expect(on.gameRules.winConditions.heroLighting).toBe(true);
    expect(on.gameRules.winConditions.heroLightingDay).toBe(2);

    const off = gen(makeSettings({ desertionEnabled: false, heroLightingEnabled: false }));
    expect(off.gameRules.winConditions.desertion).toBe(false);
    expect(off.gameRules.winConditions.heroLighting).toBe(false);
  });

  it("single hero loss flag is emitted only when set", () => {
    expect(gen(makeSettings({ singleHero: true })).gameRules.winConditions.lostStartHero).toBe(true);
    expect(gen(makeSettings({ singleHero: false })).gameRules.winConditions).not.toHaveProperty("lostStartHero");
  });

  it("all six victory modes set displayWinCondition and the right flags", () => {
    const classic = gen(makeSettings({ victoryMode: "classic" }));
    expect(classic.displayWinCondition).toBe("win_condition_1");
    expect(classic.gameRules.winConditions.classic).toBe(true);

    const capture = gen(makeSettings({ victoryMode: "capitalCapture" }));
    expect(capture.displayWinCondition).toBe("win_condition_2");
    expect(capture.gameRules.winConditions.lostStartCity).toBe(true);
    expect(capture.gameRules.winConditions.lostStartCityDay).toBe(0);

    const hold = gen(makeSettings({ victoryMode: "capitalHold", victoryDays: 4 }));
    expect(hold.displayWinCondition).toBe("win_condition_3");
    expect(hold.gameRules.winConditions.lostStartCity).toBe(true);
    expect(hold.gameRules.winConditions.lostStartCityDay).toBe(4);

    const arena = gen(makeSettings({ victoryMode: "gladiatorArena", gladiatorArenaEnabled: true }));
    expect(arena.displayWinCondition).toBe("win_condition_4");
    expect(arena.gameRules.winConditions.gladiatorArena).toBe(true);

    const cityHold = gen(makeSettings({ victoryMode: "cityHold", victoryDays: 6, victoryCityZoneId: "B" }));
    expect(cityHold.displayWinCondition).toBe("win_condition_5");
    expect(cityHold.gameRules.winConditions.cityHold).toBe(true);
    expect(cityHold.gameRules.winConditions.cityHoldDays).toBe(6);

    const tournament = gen(makeSettings({ victoryMode: "tournament", tournamentEnabled: true }));
    expect(tournament.displayWinCondition).toBe("win_condition_6");
    expect(tournament.gameRules.winConditions.tournament).toBe(true);
  });

  it("gladiator arena parameters", () => {
    const out = gen(makeSettings({
      victoryMode: "gladiatorArena",
      gladiatorArenaEnabled: true,
      gladiatorArenaDaysDelayStart: 10,
      gladiatorArenaCountDay: 4,
      gladiatorArenaRegistrationStartFight: false,
      gladiatorArenaChampionRule: "StartHero"
    }));
    const wc = out.gameRules.winConditions;
    expect(wc.gladiatorArenaDaysDelayStart).toBe(10);
    expect(wc.gladiatorArenaCountDay).toBe(4);
    expect(wc.gladiatorArenaRegistrationStartFight).toBe(false);
    expect(wc.championSelectRule).toBe("StartHero");
  });

  it("tournament parameters", () => {
    const out = gen(makeSettings({
      victoryMode: "tournament",
      tournamentEnabled: true,
      tournamentPointsToWin: 3,
      tournamentSaveArmy: false,
      tournamentDays: [2, 2],
      tournamentAnnounceDays: [5, 10]
    }));
    const wc = out.gameRules.winConditions;
    expect(wc.tournamentPointsToWin).toBe(3);
    expect(wc.tournamentSaveArmy).toBe(false);
    expect(wc.tournamentDays).toEqual([2, 2]);
    expect(wc.tournamentAnnounceDays).toEqual([5, 10]);
    expect(wc.championSelectRule).toBe("StartHero");
  });

  it("non-victory templates emit none of the optional condition fields", () => {
    const wc = gen(makeSettings({ victoryMode: "classic" })).gameRules.winConditions;
    for (const key of ["cityHold", "cityHoldDays", "gladiatorArena", "tournament", "championSelectRule", "lostStartCityDay"]) {
      expect(wc).not.toHaveProperty(key);
    }
  });

  it("fixed orientation pins the anchor zone", () => {
    const out = gen(makeSettings({ fixedOrientation: true, orientationAnchor: "A" }));
    expect(out.variants?.[0].orientation?.zeroAngleZone).toBe("A");
    expect(gen(makeSettings()).variants?.[0].orientation).toBeUndefined();
  });
});

describe("export coverage: zone fields", () => {
  const zoneOut = (z: Zone) => gen(makeSettings(), [z, zone("S", "spawn", {}, 1)], []).variants![0].zones.find((candidate) => candidate.name === z.id)!;

  it("size and name", () => {
    const out = zoneOut(zone("Big", "neutral", { size: 2.5 }));
    expect(out.name).toBe("Big");
    expect(out.size).toBe(2.5);
  });

  it("zone biome modes produce the four rule shapes", () => {
    expect(zoneOut(zone("Z1", "neutral", { biomeMode: "random" })).zoneBiome)
      .toEqual({ type: "FromList", args: [] });
    expect(zoneOut(zone("Z2", "neutral", { biomeMode: "specific", biomeId: "Sand" })).zoneBiome)
      .toEqual({ type: "FromList", args: ["Sand"] });
    expect(zoneOut(zone("Z3", "neutral", { biomeMode: "spawn", biomeSource: "S" })).zoneBiome)
      .toEqual({ type: "MatchZone", args: ["S"] });
    const own = zone("Z4", "spawn", { biomeMode: "own" }, 2);
    expect(zoneOut(own).zoneBiome).toEqual({ type: "MatchMainObject", args: ["0"] });
  });

  it("zone objects become mandatory content with counts, flags and variants", () => {
    const objects: ZoneObject[] = [
      {
        key: "o1", id: "chest", sid: "chest", label: "Chest", description: "", kind: "sid",
        guarded: true, count: 3, soloEncounter: true, variant: 2,
        roadDistance: "any", townDistance: "any"
      },
      {
        key: "o2", id: "lst", includeList: "basic_content_list_basic_storage", label: "L", description: "", kind: "list",
        guarded: false, count: 1, soloEncounter: false, variant: null,
        roadDistance: "any", townDistance: "any"
      }
    ];
    const out = gen(makeSettings(), [zone("Z", "neutral", { objects }), zone("S", "spawn", {}, 1)], []);
    const list = out.mandatoryContent!.find((entry) => entry.name === "mandatory_content_z")!;
    const sidEntries = list.content.filter((entry) => entry.sid === "chest");
    expect(sidEntries).toHaveLength(3);
    expect(sidEntries[0].isGuarded).toBe(true);
    expect(sidEntries[0].soloEncounter).toBe(true);
    expect(sidEntries[0].variant).toBe(2);
    const listEntry = list.content.find((entry) => entry.includeLists);
    expect(listEntry?.includeLists).toEqual(["basic_content_list_basic_storage"]);
    expect(listEntry?.isGuarded).toBe(false);
  });

  it("road and town distances become placement rules", () => {
    const objects: ZoneObject[] = [{
      key: "o1", id: "chest", sid: "chest", label: "Chest", description: "", kind: "sid",
      guarded: false, count: 1, soloEncounter: false, variant: null,
      roadDistance: "near", townDistance: "medium"
    }];
    const withTown = zone("T", "neutral", { objects });
    withTown.mainObjects = [{ key: "m1", type: "City", factionMode: "random" }];
    const out = gen(makeSettings(), [withTown, zone("S", "spawn", {}, 1)], []);
    const rules = out.mandatoryContent!.find((entry) => entry.name === "mandatory_content_t")!.content[0].rules!;
    expect(rules).toContainEqual({ type: "Road", args: [], targetMin: 0.1, targetMax: 0.25, weight: 1 });
    expect(rules).toContainEqual({ type: "MainObject", args: ["0"], targetMin: 0.25, targetMax: 0.5, weight: 1 });

    // Without a main object the town rule must not appear
    const noTown = zone("N", "neutral", { objects: structuredClone(objects) });
    const out2 = gen(makeSettings(), [noTown, zone("S", "spawn", {}, 1)], []);
    const rules2 = out2.mandatoryContent!.find((entry) => entry.name === "mandatory_content_n")!.content[0].rules!;
    expect(rules2.some((rule) => rule.type === "MainObject")).toBe(false);
  });
});

describe("export coverage: connections", () => {
  const connOut = (e: Edge) => gen(makeSettings(), baseZones(), [e]).variants![0].connections!.find((c) => c.name === e.id)!;

  it("every connection type round-trips through the editor model", () => {
    for (const type of ["Default", "Direct", "Portal", "GladiatorArena"] as const) {
      expect(connOut(edge("A", "B", { connectionType: type })).connectionType).toBe(type);
    }
  });

  it("proximity emits length and omits zero guard", () => {
    const spring = connOut(edge("A", "B", { connectionType: "Proximity", guardValue: 0, length: 4 }));
    expect(spring.length).toBe(4);
    expect(spring).not.toHaveProperty("guardValue");

    const guarded = connOut(edge("A", "B", { connectionType: "Proximity", guardValue: 5000, length: 0.1 }));
    expect(guarded.guardValue).toBe(5000);
  });

  it("passage flags: road, simTurnSquad, weekly increment, escape", () => {
    const out = connOut(edge("A", "B", {
      road: false,
      simTurnSquad: true,
      guardWeeklyIncrement: 0.2,
      guardEscape: false,
      guardValue: 12000
    }));
    expect(out.road).toBe(false);
    expect(out.simTurnSquad).toBe(true);
    expect(out.guardWeeklyIncrement).toBe(0.2);
    expect(out.guardEscape).toBe(false);
    expect(out.guardValue).toBe(12000);
  });
});
