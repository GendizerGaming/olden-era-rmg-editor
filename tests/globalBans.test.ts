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
 * Global bans appear at the template root in most official templates and
 * inside gameRules in a few; the importer merges both, the exporter writes
 * them back to the root.
 */
function buildTemplate(): RmgTemplate {
  return {
    name: "Bans Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    globalBans: {
      items: ["voodoosh_doll_artifact", "flag_of_truce_artifact"],
      magics: ["neutral_magic_pocket_dimension"]
    },
    gameRules: {
      heroCountMin: 1,
      heroCountMax: 8,
      heroCountIncrement: 1,
      heroHireBan: false,
      encounterHoles: false,
      globalBans: {
        magics: ["neutral_magic_light_gate", "neutral_magic_pocket_dimension"],
        heroes: ["human_hero_1"]
      },
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

describe("global bans round trip", () => {
  it("merges bans from the root and gameRules on import", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());

    expect(imported.settings.bannedItems).toEqual([
      "voodoosh_doll_artifact",
      "flag_of_truce_artifact"
    ]);
    // Duplicates across the two sources collapse
    expect(imported.settings.bannedSpells).toEqual([
      "neutral_magic_pocket_dimension",
      "neutral_magic_light_gate"
    ]);
    expect(imported.settings.bannedHeroes).toEqual(["human_hero_1"]);
  });

  it("exports bans to the template root and omits empty lists", () => {
    const exported = exportImportedTemplate(
      importTemplateForRoundTrip(buildTemplate())
    );

    expect(exported.globalBans).toEqual({
      items: ["voodoosh_doll_artifact", "flag_of_truce_artifact"],
      magics: ["neutral_magic_pocket_dimension", "neutral_magic_light_gate"],
      heroes: ["human_hero_1"]
    });
    // Bans must not leak back into gameRules nor stay duplicated there
    expect(exported.gameRules).not.toHaveProperty("globalBans");

    // A template without bans gets no globalBans key at all
    const noBans = buildTemplate();
    delete noBans.globalBans;
    delete (noBans.gameRules as Record<string, unknown>).globalBans;
    const exportedNoBans = exportImportedTemplate(importTemplateForRoundTrip(noBans));
    expect(exportedNoBans).not.toHaveProperty("globalBans");
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });
});
