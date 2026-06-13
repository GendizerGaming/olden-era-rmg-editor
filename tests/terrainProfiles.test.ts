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
 * Terrain profiles (zoneLayouts) are an editable shared entity: known fields
 * become the model, the reward/pickup distributions ride along in rawFields,
 * and unused profiles must survive (official templates ship a few).
 */
function buildTemplate(): RmgTemplate {
  return {
    name: "Terrain Profiles Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    zoneLayouts: [
      {
        name: "layout_shared",
        obstaclesFill: 0.36,
        obstaclesFillVoid: 0.6,
        lakesFill: 0.3,
        minLakeArea: 16,
        elevationClusterScale: 0.16,
        elevationModes: [
          { weight: 2, minElevatedFraction: 0.2, maxElevatedFraction: 0.4 },
          { weight: 1, minElevatedFraction: 0.6, maxElevatedFraction: 0.8 }
        ],
        roadClusterArea: 160,
        guardedEncounterResourceFractions: { countBounds: [], fractions: [0.5] },
        ambientPickupDistribution: {
          repulsion: 1,
          noise: 0.3,
          roadAttraction: -0.3,
          obstacleAttraction: 0,
          groupSizeWeights: [20, 2, 1]
        }
      },
      // Unused by any zone — must survive the round trip anyway
      { name: "layout_unused", obstaclesFill: 0.24, lakesFill: 0.1 }
    ],
    variants: [
      {
        zones: [
          { name: "A", size: 1, layout: "layout_shared" },
          { name: "B", size: 1, layout: "layout_shared" }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("terrain profiles round trip", () => {
  it("imports the profiles with passthrough for unknown fields", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const profiles = imported.settings.terrainProfiles!;

    expect(profiles.map((profile) => profile.name)).toEqual(["layout_shared", "layout_unused"]);

    const shared = profiles[0];
    expect(shared.obstaclesFill).toBe(0.36);
    expect(shared.obstaclesFillVoid).toBe(0.6);
    expect(shared.lakesFill).toBe(0.3);
    expect(shared.minLakeArea).toBe(16);
    expect(shared.elevationClusterScale).toBe(0.16);
    expect(shared.elevationModes).toEqual([
      { weight: 2, minElevatedFraction: 0.2, maxElevatedFraction: 0.4 },
      { weight: 1, minElevatedFraction: 0.6, maxElevatedFraction: 0.8 }
    ]);
    expect(shared.roadClusterArea).toBe(160);
    expect(shared.rawFields).toHaveProperty("guardedEncounterResourceFractions");
    expect(shared.rawFields).toHaveProperty("ambientPickupDistribution");

    // Zones keep their references by name
    expect(imported.zones.find((zone) => zone.id === "A")?.layout).toBe("layout_shared");
  });

  it("exports the profiles faithfully, including the unused one", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(buildTemplate()));
    const original = buildTemplate();

    expect(
      findJsonDifferences(
        asJsonValue(original.zoneLayouts),
        asJsonValue(exported.zoneLayouts)
      )
    ).toEqual([]);
  });

  it("reflects a profile edit in the export", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    imported.settings.terrainProfiles![0].lakesFill = 0.4;

    const exported = exportImportedTemplate(imported);
    const shared = exported.zoneLayouts?.find((layout) => layout.name === "layout_shared");
    expect(shared?.lakesFill).toBe(0.4);
    // The untouched passthrough fields stay intact
    expect(shared?.guardedEncounterResourceFractions).toEqual({ countBounds: [], fractions: [0.5] });
  });

  it("keeps the editor's built-in profiles private until a zone uses them", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    imported.settings.terrainProfiles!.push({
      name: "visual_editor_layout_high",
      obstaclesFill: 0.34,
      lakesFill: 0.14
    });

    // Present in the editor list but unused: must not leak into the template
    const exportedUnused = exportImportedTemplate(imported);
    expect(exportedUnused.zoneLayouts?.some((layout) => layout.name === "visual_editor_layout_high")).toBe(false);

    // Referenced by a zone: emitted like any other profile
    imported.zones[0].layout = "visual_editor_layout_high";
    const exportedUsed = exportImportedTemplate(imported);
    expect(exportedUsed.zoneLayouts?.some((layout) => layout.name === "visual_editor_layout_high")).toBe(true);
  });

  it("keeps custom library profiles private until a zone uses them", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    imported.settings.terrainProfiles!.push({
      name: "my_library_profile",
      obstaclesFill: 0.5,
      lakesFill: 0.05,
      custom: true
    });

    // Unused: the custom profile must not leak into the template
    const exportedUnused = exportImportedTemplate(imported);
    expect(exportedUnused.zoneLayouts?.some((layout) => layout.name === "my_library_profile")).toBe(false);
    // The template's own unused profile is still emitted
    expect(exportedUnused.zoneLayouts?.some((layout) => layout.name === "layout_unused")).toBe(true);

    // Referenced by a zone: the custom profile is exported, without the flag
    imported.zones[0].layout = "my_library_profile";
    const exportedUsed = exportImportedTemplate(imported);
    const emitted = exportedUsed.zoneLayouts?.find((layout) => layout.name === "my_library_profile");
    expect(emitted).toBeDefined();
    expect(emitted).not.toHaveProperty("custom");
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});
