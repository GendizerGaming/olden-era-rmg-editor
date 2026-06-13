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
 * Synthetic template exercising the game-rule flags and per-variant border
 * that the exporter used to hardcode (gameMode, heroHireBan, encounterHoles)
 * or drop entirely (variant border).
 */
function buildTemplate(): RmgTemplate {
  return {
    name: "Settings Test",
    gameMode: "SingleHero",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    gameRules: {
      heroCountMin: 1,
      heroCountMax: 1,
      heroCountIncrement: 0,
      heroHireBan: true,
      encounterHoles: true,
      factionLawsExpModifier: 0.5,
      astrologyExpModifier: 0.25,
      winConditions: { classic: true }
    },
    valueOverrides: [
      { sid: "boreal_call", variant: -1, guardValue: 6000 },
      // A few official entries omit the variant key
      { sid: "jousting_range", guardValue: 7500 }
    ],
    variants: [
      {
        border: {
          cornerRadius: 0.25,
          obstaclesWidth: 4,
          obstaclesNoise: [{ amp: 1, freq: 6 }],
          waterWidth: 4,
          waterNoise: [{ amp: 1, freq: 12 }],
          waterType: "water grass"
        },
        zones: [
          { name: "A", size: 1 },
          { name: "B", size: 1 }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      },
      {
        // Second variant: no water, no rounding — border must stay per-variant
        border: {
          cornerRadius: 0,
          obstaclesWidth: 3,
          obstaclesNoise: [{ amp: 1, freq: 12 }],
          waterWidth: 0,
          waterNoise: [{ amp: 1, freq: 12 }],
          waterType: "water grass"
        },
        zones: [
          { name: "A", size: 1 },
          { name: "B", size: 1 }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 2000, road: false }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("template settings round trip", () => {
  it("imports game-rule flags and per-variant borders", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());

    expect(imported.settings.singleHeroMode).toBe(true);
    expect(imported.settings.heroHireBan).toBe(true);
    expect(imported.settings.encounterHoles).toBe(true);
    expect(imported.settings.factionLawsExpModifier).toBe(0.5);
    expect(imported.settings.astrologyExpModifier).toBe(0.25);
    expect(imported.settings.valueOverrides).toEqual([
      { sid: "boreal_call", variant: -1, guardValue: 6000 },
      { sid: "jousting_range", variant: undefined, guardValue: 7500 }
    ]);

    expect(imported.settings.borderWaterWidth).toBe(4);
    expect(imported.settings.borderCornerRadius).toBe(0.25);
    expect(imported.settings.originalBorder?.obstaclesWidth).toBe(4);

    expect(imported.variants[0].borderWaterWidth).toBe(4);
    expect(imported.variants[0].borderCornerRadius).toBe(0.25);
    expect(imported.variants[1].borderWaterWidth).toBe(0);
    expect(imported.variants[1].borderCornerRadius).toBe(0);
  });

  it("exports the flags and borders faithfully", () => {
    const exported = exportImportedTemplate(
      importTemplateForRoundTrip(buildTemplate())
    );

    expect(exported.gameMode).toBe("SingleHero");
    expect(exported.gameRules.heroHireBan).toBe(true);
    expect(exported.gameRules.encounterHoles).toBe(true);
    expect(exported.gameRules.factionLawsExpModifier).toBe(0.5);
    expect(exported.gameRules.astrologyExpModifier).toBe(0.25);
    expect(exported.valueOverrides).toEqual([
      { sid: "boreal_call", variant: -1, guardValue: 6000 },
      { sid: "jousting_range", guardValue: 7500 }
    ]);
    expect(exported.valueOverrides?.[1]).not.toHaveProperty("variant");

    expect(exported.variants[0].border).toEqual({
      cornerRadius: 0.25,
      obstaclesWidth: 4,
      obstaclesNoise: [{ amp: 1, freq: 6 }],
      waterWidth: 4,
      waterNoise: [{ amp: 1, freq: 12 }],
      waterType: "water grass"
    });
    expect(exported.variants[1].border?.waterWidth).toBe(0);
    expect(exported.variants[1].border?.cornerRadius).toBe(0);
    expect(exported.variants[1].border?.obstaclesWidth).toBe(3);
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});
