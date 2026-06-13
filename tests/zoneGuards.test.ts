import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/** Zone-level guard tuning fields must survive import/export verbatim. */
function buildTemplate(): RmgTemplate {
  return {
    name: "Zone Guards Test",
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
            guardCutoffValue: 2500,
            guardRandomization: 0.5,
            guardMultiplier: 1.8,
            guardWeeklyIncrement: 0.2,
            guardReactionDistribution: [1, 1, 4, 4, 2, 1],
            diplomacyModifier: -0.5,
            guardedContentValuePerArea: 2400,
            unguardedContentValuePerArea: 300,
            resourcesValuePerArea: 420,
            encounterHolesSettings: { affectedEncounters: 0.66, twoHoleEncounters: 0.5 },
            zoneBiome: { type: "FromList", args: ["Grass"] },
            contentBiome: { type: "FromList", args: ["Sand"] },
            metaObjectsBiome: { type: "MatchZone", args: ["B"] }
          },
          {
            name: "B",
            size: 1,
            // An exotic multi-arg rule: not editable, must survive verbatim
            zoneBiome: { type: "FromList", args: ["Grass"] },
            contentBiome: { type: "FromList", args: ["Grass", "Lava"] }
          }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("zone guard tuning round trip", () => {
  it("imports the guard fields as first-class zone values", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const zoneA = imported.zones.find((zone) => zone.id === "A");
    const zoneB = imported.zones.find((zone) => zone.id === "B");

    expect(zoneA?.guardCutoffValue).toBe(2500);
    expect(zoneA?.guardRandomization).toBe(0.5);
    expect(zoneA?.guardMultiplier).toBe(1.8);
    expect(zoneA?.guardWeeklyIncrement).toBe(0.2);
    expect(zoneA?.guardReactionDistribution).toEqual([1, 1, 4, 4, 2, 1]);
    expect(zoneA?.diplomacyModifier).toBe(-0.5);
    expect(zoneA?.guardedValuePerArea).toBe(2400);
    expect(zoneA?.unguardedValuePerArea).toBe(300);
    expect(zoneA?.resourcesValuePerArea).toBe(420);
    // No leftovers in the raw passthrough
    expect(zoneA?.rawFields ?? {}).not.toHaveProperty("guardMultiplier");

    // Absent in the source — stays undefined in the editor model
    expect(zoneB?.guardMultiplier).toBeUndefined();
    expect(zoneB?.guardReactionDistribution).toBeUndefined();
    expect(zoneB?.guardedValuePerArea).toBeUndefined();

    // Content/meta biomes map onto the editor modes when they rebuild cleanly
    expect(zoneA?.encounterHolesSettings).toEqual({ affectedEncounters: 0.66, twoHoleEncounters: 0.5 });
    expect(zoneA?.contentBiomeMode).toBe("specific");
    expect(zoneA?.contentBiomeId).toBe("Sand");
    expect(zoneA?.metaBiomeMode).toBe("spawn");
    expect(zoneA?.metaBiomeSource).toBe("B");
    // The exotic multi-arg rule stays non-editable ('land' mode)
    expect(zoneB?.contentBiomeMode).toBeUndefined();
  });

  it("exports explicit values verbatim and fills defaults for new zones", () => {
    const exported = exportImportedTemplate(
      importTemplateForRoundTrip(buildTemplate())
    );
    const zones = exported.variants[0].zones;
    const zoneA = zones.find((zone) => zone.name === "A");
    const zoneB = zones.find((zone) => zone.name === "B");

    expect(zoneA?.guardCutoffValue).toBe(2500);
    expect(zoneA?.guardRandomization).toBe(0.5);
    expect(zoneA?.guardMultiplier).toBe(1.8);
    expect(zoneA?.guardWeeklyIncrement).toBe(0.2);
    expect(zoneA?.guardReactionDistribution).toEqual([1, 1, 4, 4, 2, 1]);
    expect(zoneA?.diplomacyModifier).toBe(-0.5);
    expect(zoneA?.guardedContentValuePerArea).toBe(2400);
    expect(zoneA?.unguardedContentValuePerArea).toBe(300);
    expect(zoneA?.resourcesValuePerArea).toBe(420);

    // Always-present fields get the editor defaults; the optional pair
    // (guardMultiplier, diplomacyModifier) must stay absent so the game
    // defaults apply to zones that omitted them.
    expect(zoneB?.guardCutoffValue).toBe(1500);
    expect(zoneB?.guardReactionDistribution).toEqual([60, 20, 10, 10, 2, 0]);
    expect(zoneB).not.toHaveProperty("guardMultiplier");
    expect(zoneB).not.toHaveProperty("diplomacyModifier");
    // PerArea fields absent in the source must stay absent (the exporter
    // used to silently zero them)
    expect(zoneB).not.toHaveProperty("guardedContentValuePerArea");
    expect(zoneB).not.toHaveProperty("unguardedContentValuePerArea");
    expect(zoneB).not.toHaveProperty("resourcesValuePerArea");

    // Aux biome rules and hole settings round-trip verbatim
    expect(zoneA?.encounterHolesSettings).toEqual({ affectedEncounters: 0.66, twoHoleEncounters: 0.5 });
    expect(zoneA?.contentBiome).toEqual({ type: "FromList", args: ["Sand"] });
    expect(zoneA?.metaObjectsBiome).toEqual({ type: "MatchZone", args: ["B"] });
    expect(zoneB?.contentBiome).toEqual({ type: "FromList", args: ["Grass", "Lava"] });
    expect(zoneB).not.toHaveProperty("encounterHolesSettings");
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});
