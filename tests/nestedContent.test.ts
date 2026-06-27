import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Inline weighted content on a pool-slot object: a mandatory object with no sid
 * but an includeLists reference can carry an inline `content` array of
 * {sid, weight} candidates. It's modeled as nestedContent and round-trips.
 */

function templateWithNested(content: unknown): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    mandatoryContent: [{ name: "mc", content: [{ includeLists: ["pool_x"], content }] }],
    variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
  } as unknown as RmgTemplate;
}

describe("inline weighted content", () => {
  it("round-trips the {sid, weight} candidate list", () => {
    const content = [
      { sid: "random_hire_1", weight: 0 },
      { sid: "random_hire_2", weight: 3 }
    ];
    const imported = importTemplateForRoundTrip(templateWithNested(content));
    imported.zones[0].rawMandatoryContent = undefined; // force the honest rebuild
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.content).toEqual(content);
  });

  it("emits no content array when the object has no inline weights", () => {
    const imported = importTemplateForRoundTrip(templateWithNested(undefined));
    imported.zones[0].rawMandatoryContent = undefined;
    const out = exportImportedTemplate(imported);
    expect(out.mandatoryContent?.[0].content?.[0]?.content).toBeUndefined();
  });
});
