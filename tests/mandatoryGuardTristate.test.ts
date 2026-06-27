import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * A mandatory object's isGuarded is tri-state in the .rmg.json: true, false, or
 * omitted (engine default). The editor models it as boolean | undefined so the
 * omitted state survives a round-trip instead of being pinned to false.
 */

function template(content: unknown[]): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    mandatoryContent: [{ name: "mc", content }],
    variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
  } as unknown as RmgTemplate;
}

describe("mandatory object isGuarded tri-state", () => {
  it("keeps omitted / false / true distinct through a round-trip", () => {
    const imported = importTemplateForRoundTrip(template([
      { sid: "mana_well" },                  // isGuarded omitted
      { sid: "market", isGuarded: false },
      { sid: "forge", isGuarded: true }
    ]));
    imported.zones[0].rawMandatoryContent = undefined; // force the honest rebuild
    const out = exportImportedTemplate(imported);
    const content = out.mandatoryContent?.[0].content ?? [];
    const bySid = (sid: string) => content.find((c) => c.sid === sid)!;

    // Omitted stays omitted (no key), not coerced to false.
    expect("isGuarded" in bySid("mana_well")).toBe(false);
    expect(bySid("market").isGuarded).toBe(false);
    expect(bySid("forge").isGuarded).toBe(true);
  });

  it("imports the omitted state as undefined, not false", () => {
    const imported = importTemplateForRoundTrip(template([{ sid: "mana_well" }]));
    expect(imported.zones[0].objects[0].guarded).toBeUndefined();
  });
});

describe("mandatory object designatedEncounter tri-state", () => {
  it("keeps an explicit false (default is true, so it must not be dropped)", () => {
    const imported = importTemplateForRoundTrip(template([
      { sid: "a", designatedEncounter: false },
      { sid: "b", designatedEncounter: true },
      { sid: "c" }                              // omitted -> engine default (true)
    ]));
    imported.zones[0].rawMandatoryContent = undefined; // force the honest rebuild
    const out = exportImportedTemplate(imported);
    const content = out.mandatoryContent?.[0].content ?? [];
    const bySid = (sid: string) => content.find((e) => e.sid === sid)!;

    expect(bySid("a").designatedEncounter).toBe(false);   // explicit off preserved
    expect(bySid("b").designatedEncounter).toBe(true);
    expect("designatedEncounter" in bySid("c")).toBe(false); // omitted stays omitted
  });
});
