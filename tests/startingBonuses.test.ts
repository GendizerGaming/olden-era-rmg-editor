import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

function baseTemplate(bonuses: unknown): RmgTemplate {
  return {
    name: "Bonuses Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    gameRules: {
      heroCountMin: 1,
      heroCountMax: 8,
      heroCountIncrement: 1,
      heroHireBan: false,
      encounterHoles: false,
      bonuses,
      winConditions: { classic: true }
    },
    variants: [
      {
        zones: [
          { name: "A", size: 1 },
          { name: "B", size: 1 }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

const ALL_BONUSES = [
  { sid: "add_bonus_res", receiverSide: -1, parameters: ["gold", "10000"] },
  { sid: "add_bonus_hero_exp", receiverSide: -1, receiverFilter: "start_hero", parameters: ["750"] },
  { sid: "add_bonus_side_exp", receiverSide: -1, parameters: ["1200"] },
  { sid: "add_bonus_hero_spell", receiverSide: -1, receiverFilter: "start_hero", parameters: ["neutral_magic_town_portal"] },
  { sid: "add_bonus_hero_item", receiverSide: -1, receiverFilter: "start_hero", parameters: ["swamp_boots_artifact"] },
  { sid: "add_bonus_hero_unit", receiverSide: -1, receiverFilter: "all_heroes", parameters: ["skeleton", "200"] },
  { sid: "add_bonus_hero_unit_multipler", receiverSide: -1, receiverFilter: "all_heroes", parameters: ["2"] },
  { sid: "add_bonus_hero_stat", receiverSide: -1, receiverFilter: "start_hero", parameters: ["magicCostSidSet", "neutral_magic_town_portal", "-999", "0"] }
];

describe("starting bonuses round trip", () => {
  it("imports every bonus type as first-class settings", () => {
    const imported = importTemplateForRoundTrip(baseTemplate(ALL_BONUSES));
    const bonuses = imported.settings.startingBonuses ?? [];

    expect(bonuses).toHaveLength(8);
    expect(bonuses[0]).toEqual({ sid: "add_bonus_res", receiverSide: -1, receiverFilter: "", parameters: ["gold", "10000"] });
    expect(bonuses[7].parameters).toEqual(["magicCostSidSet", "neutral_magic_town_portal", "-999", "0"]);
    // bonuses must not linger in the raw gameRules passthrough
    expect(imported.settings.originalGameRules ?? {}).not.toHaveProperty("bonuses");
  });

  it("accepts the single-object form the game tolerates (Wastelands quirk)", () => {
    const imported = importTemplateForRoundTrip(
      baseTemplate({ sid: "add_bonus_hero_item", receiverSide: -1, receiverFilter: "start_hero", parameters: ["swamp_boots_artifact"] })
    );
    expect(imported.settings.startingBonuses).toEqual([
      { sid: "add_bonus_hero_item", receiverSide: -1, receiverFilter: "start_hero", parameters: ["swamp_boots_artifact"] }
    ]);
  });

  it("exports bonuses verbatim as an array and omits empty lists", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(baseTemplate(ALL_BONUSES)));
    expect(exported.gameRules.bonuses).toEqual(ALL_BONUSES);

    const exportedEmpty = exportImportedTemplate(importTemplateForRoundTrip(baseTemplate([])));
    expect(exportedEmpty.gameRules).not.toHaveProperty("bonuses");
  });

  it("reaches a stable canonical export", () => {
    for (const bonuses of [ALL_BONUSES, ALL_BONUSES[4]]) {
      const firstExport = roundTripTemplate(baseTemplate(bonuses));
      const secondExport = roundTripTemplate(firstExport);
      expect(
        findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
      ).toEqual([]);
    }
  });
});
