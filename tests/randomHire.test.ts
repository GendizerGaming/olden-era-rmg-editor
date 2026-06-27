import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Per-tier random-hire tuning (randomHireInitialUnitIncrement /
 * randomHireEnableWeeklyUnitIncrement) is kept verbatim on the zone so it
 * round-trips; the inspector only surfaces it when the zone uses random-hire
 * content.
 */

function zoneWith(extra: Record<string, unknown>): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    variants: [{ zones: [{ name: "A", size: 1, ...extra }], connections: [] }]
  } as unknown as RmgTemplate;
}

const zoneA = (out: ReturnType<typeof exportImportedTemplate>) =>
  out.variants[0].zones.find((z) => z.name === "A");

describe("random-hire tuning", () => {
  it("round-trips the per-tier arrays verbatim", () => {
    const initial = [4, 4, 4, 4, 4, 4, 4];
    const weekly = [false, false, true, false, false, false, false];
    const out = exportImportedTemplate(importTemplateForRoundTrip(zoneWith({
      randomHireInitialUnitIncrement: initial,
      randomHireEnableWeeklyUnitIncrement: weekly
    })));
    expect(zoneA(out)?.randomHireInitialUnitIncrement).toEqual(initial);
    expect(zoneA(out)?.randomHireEnableWeeklyUnitIncrement).toEqual(weekly);
  });

  it("emits nothing when a zone has no random-hire tuning", () => {
    const out = exportImportedTemplate(importTemplateForRoundTrip(zoneWith({})));
    expect(zoneA(out)?.randomHireInitialUnitIncrement).toBeUndefined();
    expect(zoneA(out)?.randomHireEnableWeeklyUnitIncrement).toBeUndefined();
  });
});
