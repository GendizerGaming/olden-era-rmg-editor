import { describe, expect, it } from "vitest";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Castle faction import: a city's `faction` rule must map to the right editor
 * mode. The OctoJebus bug — spawn-zone cities use a one-arg `Match ["0"]` (match
 * this zone's spawn = the player), but the importer only handled the two-arg
 * form and fell back to "random".
 */

function templateWithCityFaction(faction: unknown): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    variants: [{
      zones: [{
        name: "Spawn-A", size: 1,
        mainObjects: [
          { type: "Spawn", spawn: "Player1" },
          { type: "City", faction }
        ]
      }],
      connections: []
    }]
  } as unknown as RmgTemplate;
}

const cityOf = (imported: ReturnType<typeof importTemplateFromJson>) =>
  imported.zones[0].mainObjects.find((o) => o.type === "City")!;

describe("castle faction import", () => {
  it("one-arg Match (same-zone) → spawn matching this zone", () => {
    const city = cityOf(importTemplateFromJson(templateWithCityFaction({ type: "Match", args: ["0"] }) as never, [], []));
    expect(city.factionMode).toBe("spawn");
    expect(city.factionSource).toBe("Spawn-A");
  });

  it("two-arg Match → spawn matching the named zone", () => {
    const city = cityOf(importTemplateFromJson(templateWithCityFaction({ type: "Match", args: ["0", "Spawn-B"] }) as never, [], []));
    expect(city.factionMode).toBe("spawn");
    expect(city.factionSource).toBe("Spawn-B");
  });

  it("FromList maps to random (empty) or specific (named)", () => {
    expect(cityOf(importTemplateFromJson(templateWithCityFaction({ type: "FromList", args: [] }) as never, [], [])).factionMode).toBe("random");
    const specific = cityOf(importTemplateFromJson(templateWithCityFaction({ type: "FromList", args: ["castle"] }) as never, [], []));
    expect(specific.factionMode).toBe("specific");
    expect(specific.factionId).toBe("castle");
  });

  it("a same-zone Match faction round-trips as the one-arg form (not expanded)", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(templateWithCityFaction({ type: "Match", args: ["0"] })));
    const city = exported.variants[0].zones[0].mainObjects?.find((o) => o.type === "City");
    expect(city?.faction).toEqual({ type: "Match", args: ["0"] });
  });
});
