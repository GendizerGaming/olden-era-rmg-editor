import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Synthetic template exercising every connection type and the optional guard
 * tuning fields. Unlike the official-template suite this does not require a
 * local game installation.
 */
function buildTemplate(): RmgTemplate {
  return {
    name: "Connection Types Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    variants: [
      {
        zones: [
          { name: "A", size: 1 },
          { name: "B", size: 1 },
          { name: "C", size: 1 }
        ],
        connections: [
          {
            name: "A-B-direct",
            from: "A",
            to: "B",
            connectionType: "Direct",
            guardValue: 1000,
            road: true,
            simTurnSquad: true,
            guardWeeklyIncrement: 0.15,
            guardEscape: false,
            guardRandomization: 0.2,
            guardZone: "Center",
            gatePlacement: "Center",
            guardMatchGroup: "spawn_main_guard"
          },
          {
            name: "B-C-default",
            from: "B",
            to: "C",
            connectionType: "Default",
            guardValue: 2000,
            road: false
          },
          {
            name: "A-C-portal",
            from: "A",
            to: "C",
            connectionType: "Portal",
            guardValue: 3000,
            road: true,
            portalPlacementRulesTo: [
              { type: "Crossroads", args: [], targetMin: 0.25, targetMax: 0.35, weight: 2 }
            ]
          },
          {
            name: "B-C-arena",
            from: "B",
            to: "C",
            connectionType: "GladiatorArena",
            guardValue: 5000,
            road: true
          },
          {
            name: "A-B-spring",
            from: "A",
            to: "B",
            connectionType: "Proximity",
            length: 0.5
          },
          {
            name: "A-C-untyped",
            from: "A",
            to: "C",
            guardValue: 700,
            road: true
          }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("connection types", () => {
  it("imports every connection type and the guard tuning fields", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const byId = new Map(imported.edges.map((edge) => [edge.id, edge]));

    const direct = byId.get("A-B-direct");
    expect(direct?.connectionType).toBe("Direct");
    expect(direct?.guardValue).toBe(1000);
    expect(direct?.simTurnSquad).toBe(true);
    expect(direct?.guardWeeklyIncrement).toBe(0.15);
    expect(direct?.guardEscape).toBe(false);
    expect(direct?.guardRandomization).toBe(0.2);
    expect(direct?.guardZone).toBe("Center");
    expect(direct?.gatePlacement).toBe("Center");
    expect(direct?.guardMatchGroup).toBe("spawn_main_guard");

    const fallback = byId.get("B-C-default");
    expect(fallback?.connectionType).toBe("Default");
    expect(fallback?.simTurnSquad).toBeUndefined();
    expect(fallback?.guardWeeklyIncrement).toBeUndefined();
    expect(fallback?.guardEscape).toBeUndefined();
    expect(fallback?.guardRandomization).toBeUndefined();
    expect(fallback?.guardZone).toBeUndefined();
    expect(fallback?.gatePlacement).toBeUndefined();
    expect(fallback?.guardMatchGroup).toBeUndefined();

    const portal = byId.get("A-C-portal");
    expect(portal?.connectionType).toBe("Portal");
    // Portal placement rules are now a first-class edge field (no longer rawFields).
    expect(portal?.portalPlacementRulesTo).toEqual([
      { type: "Crossroads", args: [], targetMin: 0.25, targetMax: 0.35, weight: 2 }
    ]);

    expect(byId.get("B-C-arena")?.connectionType).toBe("GladiatorArena");
    expect(byId.get("A-B-spring")?.connectionType).toBe("Proximity");

    // A missing connectionType means "Default" in the game format
    expect(byId.get("A-C-untyped")?.connectionType).toBe("Default");
  });

  it("exports connection types and guard fields faithfully", () => {
    const exported = exportImportedTemplate(
      importTemplateForRoundTrip(buildTemplate())
    );
    const connections = exported.variants[0].connections;
    const byName = new Map(connections.map((conn) => [conn.name, conn]));

    const direct = byName.get("A-B-direct");
    expect(direct?.connectionType).toBe("Direct");
    expect(direct?.simTurnSquad).toBe(true);
    expect(direct?.guardWeeklyIncrement).toBe(0.15);
    expect(direct?.guardEscape).toBe(false);
    expect(direct?.guardRandomization).toBe(0.2);
    expect(direct?.guardZone).toBe("Center");
    expect(direct?.gatePlacement).toBe("Center");
    expect(direct?.guardMatchGroup).toBe("spawn_main_guard");

    // Fields absent in the source must stay absent (game defaults intact)
    const fallback = byName.get("B-C-default");
    expect(fallback?.connectionType).toBe("Default");
    expect(fallback).not.toHaveProperty("simTurnSquad");
    expect(fallback).not.toHaveProperty("guardWeeklyIncrement");
    expect(fallback).not.toHaveProperty("guardEscape");
    expect(fallback).not.toHaveProperty("guardRandomization");
    expect(fallback).not.toHaveProperty("guardZone");
    expect(fallback).not.toHaveProperty("gatePlacement");
    expect(fallback).not.toHaveProperty("guardMatchGroup");

    const portal = byName.get("A-C-portal");
    expect(portal?.connectionType).toBe("Portal");
    expect(portal?.portalPlacementRulesTo).toEqual([
      { type: "Crossroads", args: [], targetMin: 0.25, targetMax: 0.35, weight: 2 }
    ]);

    expect(byName.get("B-C-arena")?.connectionType).toBe("GladiatorArena");
    expect(byName.get("A-B-spring")?.connectionType).toBe("Proximity");
    expect(byName.get("A-C-untyped")?.connectionType).toBe("Default");
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});
