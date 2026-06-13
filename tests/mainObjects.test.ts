import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/** Outposts, arenas, owners and building sets must survive the round trip. */
function buildTemplate(): RmgTemplate {
  return {
    name: "Main Objects Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    variants: [
      {
        zones: [
          {
            name: "A",
            size: 1,
            mainObjects: [
              {
                type: "Spawn",
                spawn: "Player1",
                buildingsConstructionSid: "default_buildings_construction",
                placement: "Uniform",
                placementArgs: ["true", "0.7", "0"]
              }
            ]
          },
          {
            name: "B",
            size: 1,
            mainObjects: [
              {
                type: "City",
                owner: "Player2",
                buildingsConstructionSid: "rich_buildings_construction",
                guardValue: 25000,
                guardChance: 0.5,
                guardWeeklyIncrement: 0.2,
                removeGuardIfHasOwner: true,
                placement: "Center"
              },
              // An unguarded city: the export must not invent guard fields
              { type: "City", placement: "Center" },
              {
                type: "AbandonedOutpost",
                guardChance: 1,
                guardValue: 40000,
                guardWeeklyIncrement: 0.1,
                buildingsConstructionSid: "poor_buildings_construction",
                faction: { type: "Match", args: ["0", "A"] },
                placement: "Uniform",
                placementArgs: ["true", "0.8", "2"]
              },
              // A specific faction: the engine reads candidates from
              // faction.args only (the `factions` array is a dead field)
              { type: "City", faction: { type: "FromList", args: ["human"] }, placement: "Center" }
            ]
          },
          {
            name: "C",
            size: 1,
            mainObjects: [
              { type: "GladiatorArena", placement: "Uniform", placementArgs: ["true", "0", "0"] }
            ]
          }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true },
          { name: "B-C", from: "B", to: "C", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("main objects round trip", () => {
  it("imports outposts, arenas, owners and building sets", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const zoneB = imported.zones.find((zone) => zone.id === "B");
    const zoneC = imported.zones.find((zone) => zone.id === "C");

    const city = zoneB?.mainObjects.find((mo) => mo.type === "City");
    expect(city?.owner).toBe(2);
    expect(city?.buildingsConstructionSid).toBe("rich_buildings_construction");
    expect(city?.guardValue).toBe(25000);
    expect(city?.guardChance).toBe(0.5);
    expect(city?.guardWeeklyIncrement).toBe(0.2);
    expect(city?.removeGuardIfHasOwner).toBe(true);

    const unguardedCity = zoneB?.mainObjects.filter((mo) => mo.type === "City")[1];
    expect(unguardedCity?.guardValue).toBeUndefined();
    expect(unguardedCity?.guardChance).toBeUndefined();

    const outpost = zoneB?.mainObjects.find((mo) => mo.type === "AbandonedOutpost");
    expect(outpost).toBeDefined();
    expect(outpost?.buildingsConstructionSid).toBe("poor_buildings_construction");
    // Faction rule mapped to the editor's faction mode
    expect(outpost?.factionMode).toBe("spawn");
    expect(outpost?.factionSource).toBe("A");

    expect(zoneC?.mainObjects[0]?.type).toBe("GladiatorArena");
  });

  it("exports the objects faithfully", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(buildTemplate()));
    const zones = exported.variants[0].zones;
    const zoneB = zones.find((zone) => zone.name === "B");
    const zoneC = zones.find((zone) => zone.name === "C");

    const city = zoneB?.mainObjects?.find((mo) => mo.type === "City");
    expect(city?.owner).toBe("Player2");
    expect(city?.buildingsConstructionSid).toBe("rich_buildings_construction");
    expect(city?.guardValue).toBe(25000);
    expect(city?.guardChance).toBe(0.5);
    expect(city?.guardWeeklyIncrement).toBe(0.2);
    expect(city?.removeGuardIfHasOwner).toBe(true);

    const unguardedCity = zoneB?.mainObjects?.filter((mo) => mo.type === "City")[1];
    expect(unguardedCity).not.toHaveProperty("guardValue");
    expect(unguardedCity).not.toHaveProperty("guardChance");
    expect(unguardedCity).not.toHaveProperty("guardWeeklyIncrement");
    expect(unguardedCity).not.toHaveProperty("removeGuardIfHasOwner");

    const outpost = zoneB?.mainObjects?.find((mo) => mo.type === "AbandonedOutpost");
    expect(outpost?.type).toBe("AbandonedOutpost");
    expect(outpost?.faction).toEqual({ type: "Match", args: ["0", "A"] });

    // The specific faction goes through faction.args, never `factions`
    const factionCity = zoneB?.mainObjects?.filter((mo) => mo.type === "City")[2];
    expect(factionCity?.faction).toEqual({ type: "FromList", args: ["human"] });
    expect(factionCity).not.toHaveProperty("factions");

    const arena = zoneC?.mainObjects?.find((mo) => mo.type === "GladiatorArena");
    expect(arena).toBeDefined();
    // The arena stays minimal: no invented guard or construction fields
    expect(arena).not.toHaveProperty("guardValue");
    expect(arena).not.toHaveProperty("buildingsConstructionSid");
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});
