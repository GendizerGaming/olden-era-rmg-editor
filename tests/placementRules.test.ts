import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Object placement rules: the distance-preset model only captures Road/MainObject
 * distances (snapping exact min/max, dropping weight, args and Crossroads/
 * Connection rules). The importer keeps the original rules verbatim (rawRules)
 * and the generator re-emits them while the distance presets are unchanged,
 * regenerating from the preset only when the user edits a distance.
 */

function templateWithRules(rules: unknown): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    mandatoryContent: [{ name: "mc", content: [{ sid: "mine_gold", isMine: true, rules }] }],
    variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
  } as unknown as RmgTemplate;
}

describe("object placement rules", () => {
  it("preserves the original rules verbatim when the zone is rebuilt", () => {
    const rules = [
      { type: "Road", args: [], targetMin: 0.1, targetMax: 0.15, weight: 1 },
      { type: "Crossroads", args: [], targetMin: 0.2, targetMax: 0.4, weight: 2 }
    ];
    const imported = importTemplateForRoundTrip(templateWithRules(rules));
    // Force the honest path (no rawMandatoryContent passthrough), as after an edit.
    imported.zones[0].rawMandatoryContent = undefined;
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.rules).toEqual(rules);
  });

  it("regenerates from the preset when a distance is edited", () => {
    const imported = importTemplateForRoundTrip(templateWithRules([
      { type: "Road", args: [], targetMin: 0.1, targetMax: 0.15, weight: 1 }
    ]));
    imported.zones[0].objects[0].roadDistance = "far"; // user changes the distance
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.rules?.[0]).toMatchObject({
      type: "Road", targetMin: 0.5, targetMax: 0.75
    });
  });

  it("imports a non-preset distance exactly, without snapping", () => {
    const imported = importTemplateForRoundTrip(templateWithRules([
      { type: "Road", args: [], targetMin: 0.13, targetMax: 0.17, weight: 1 }
    ]));
    expect(imported.zones[0].objects[0].roadDistance).toBe("0.13:0.17");
  });

  it("emits an exact custom distance when the user types one", () => {
    const imported = importTemplateForRoundTrip(templateWithRules([
      { type: "Road", args: [], targetMin: 0.1, targetMax: 0.15, weight: 1 }
    ]));
    imported.zones[0].objects[0].roadDistance = "0.3:0.4"; // user typed an exact value
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.rules?.[0]).toMatchObject({
      type: "Road", targetMin: 0.3, targetMax: 0.4
    });
  });
});

describe("player-owned mandatory objects", () => {
  it("round-trips the owner of a mandatory mine", () => {
    const tpl = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      mandatoryContent: [{ name: "mc", content: [{ sid: "mine_gold", isMine: true, owner: "Player2" }] }],
      variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
    } as unknown as RmgTemplate;
    const imported = importTemplateForRoundTrip(tpl);
    imported.zones[0].rawMandatoryContent = undefined; // force the honest rebuild
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.owner).toBe("Player2");
  });
});

describe("extra mandatory/main-object fields", () => {
  it("round-trips designatedEncounter on a mandatory object", () => {
    const tpl = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      mandatoryContent: [{ name: "mc", content: [{ sid: "prison", designatedEncounter: true }] }],
      variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
    } as unknown as RmgTemplate;
    const imported = importTemplateForRoundTrip(tpl);
    imported.zones[0].rawMandatoryContent = undefined; // force the honest rebuild
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.designatedEncounter).toBe(true);
  });

  it("round-trips guardRandomization and isKeyObject on a main object", () => {
    const tpl = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      variants: [{ zones: [{
        name: "A", size: 1,
        mainObjects: [{ type: "City", faction: { type: "FromList", args: [] }, guardRandomization: 0.2, isKeyObject: true }]
      }], connections: [] }]
    } as unknown as RmgTemplate;
    const out = exportImportedTemplate(importTemplateForRoundTrip(tpl));
    const city = out.variants[0].zones[0].mainObjects?.find((o) => o.type === "City");
    expect(city?.guardRandomization).toBe(0.2);
    expect(city?.isKeyObject).toBe(true);
  });

  it("round-trips unit-increment fields on a city", () => {
    const tpl = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      variants: [{ zones: [{
        name: "A", size: 1,
        mainObjects: [{ type: "City", faction: { type: "FromList", args: [] }, enableWeeklyUnitIncrement: true, initialUnitIncrement: 2 }]
      }], connections: [] }]
    } as unknown as RmgTemplate;
    const out = exportImportedTemplate(importTemplateForRoundTrip(tpl));
    const city = out.variants[0].zones[0].mainObjects?.find((o) => o.type === "City");
    expect(city?.enableWeeklyUnitIncrement).toBe(true);
    expect(city?.initialUnitIncrement).toBe(2);
  });
});

describe("multi-list mandatory objects", () => {
  it("preserves every content list, not just the first", () => {
    const lists = ["content_list_a", "content_list_b", "content_list_c"];
    const tpl = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      mandatoryContent: [{ name: "mc", content: [{ includeLists: lists }] }],
      variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
    } as unknown as RmgTemplate;
    const imported = importTemplateForRoundTrip(tpl);
    imported.zones[0].rawMandatoryContent = undefined; // force the honest rebuild
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.includeLists).toEqual(lists);
  });
});
