import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Portal connections carry portalPlacementRulesTo/From — placement-rule arrays
 * for where the portal mouths sit in each zone. They're kept verbatim on the
 * edge; the inspector edits the leading rule's distance, the rest round-trips.
 */

function portalTemplate(to: unknown, from: unknown): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    variants: [{
      zones: [{ name: "A", size: 1 }, { name: "B", size: 1 }],
      connections: [{
        name: "A__B", from: "A", to: "B", connectionType: "Portal", road: false,
        portalPlacementRulesTo: to, portalPlacementRulesFrom: from
      }]
    }]
  } as unknown as RmgTemplate;
}

const portalEdge = (out: ReturnType<typeof exportImportedTemplate>) =>
  out.variants[0].zones[0] && out.variants[0].connections?.find((c) => c.connectionType === "Portal");

describe("portal placement rules", () => {
  it("round-trips the rule arrays verbatim, weights and types included", () => {
    const to = [{ type: "Crossroads", args: [], targetMin: 0.25, targetMax: 0.25, weight: 2 }];
    const from = [{ type: "Crossroads", args: [], target: 0.1, weight: 1 }];
    const out = exportImportedTemplate(importTemplateForRoundTrip(portalTemplate(to, from)));
    const edge = portalEdge(out);
    expect(edge?.portalPlacementRulesTo).toEqual(to);
    expect(edge?.portalPlacementRulesFrom).toEqual(from);
  });

  it("rewrites the leading rule's distance when the user edits it", () => {
    const imported = importTemplateForRoundTrip(portalTemplate(
      [{ type: "Crossroads", args: [], targetMin: 0.25, targetMax: 0.25, weight: 2 }], undefined
    ));
    // Simulate the inspector setting an exact distance on the "To" side.
    imported.edges[0].portalPlacementRulesTo = [
      { type: "Crossroads", args: [], targetMin: 0.4, targetMax: 0.5, weight: 2 }
    ];
    const out = exportImportedTemplate(imported);
    expect(portalEdge(out)?.portalPlacementRulesTo?.[0]).toMatchObject({
      type: "Crossroads", targetMin: 0.4, targetMax: 0.5, weight: 2
    });
  });
});
