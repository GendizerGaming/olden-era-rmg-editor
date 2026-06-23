import { describe, expect, it } from "vitest";
import { roundTripTemplate } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * The editor models only a subset of the .rmg.json format. Anything it does not
 * model must round-trip verbatim — the importer stashes unknown keys per level
 * (root, gameRules, zones, connections, …) and the generator re-emits them — so
 * importing then exporting a template never silently drops fields the editor
 * has no UI for. This guards that contract against regressions.
 */

type ExportedShape = {
  futureRootSetting?: unknown;
  gameRules?: { futureRuleSetting?: unknown };
  variants: Array<{
    zones: Array<{ name?: string; futureZoneField?: unknown }>;
    connections?: Array<{ name?: string; futureEdgeField?: unknown }>;
  }>;
};

function buildTemplateWithUnknownFields(): RmgTemplate {
  return {
    name: "Passthrough Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    // Unknown root-level field (a hypothetical future setting):
    futureRootSetting: { nested: [1, 2, 3], flag: true },
    gameRules: {
      winConditions: { classic: true },
      // Unknown gameRules key:
      futureRuleSetting: "keep-me"
    },
    variants: [
      {
        zones: [
          // Unknown zone-level field:
          { name: "A", size: 1, futureZoneField: 42 },
          { name: "B", size: 1 }
        ],
        connections: [
          // Unknown connection-level field:
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, futureEdgeField: "edge-keep" }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("unknown-field passthrough", () => {
  it("preserves unknown fields at the root, in gameRules, on a zone and on a connection", () => {
    const out = roundTripTemplate(buildTemplateWithUnknownFields()) as unknown as ExportedShape;

    expect(out.futureRootSetting).toEqual({ nested: [1, 2, 3], flag: true });
    expect(out.gameRules?.futureRuleSetting).toBe("keep-me");

    const zoneA = out.variants[0].zones.find((zone) => zone.name === "A");
    expect(zoneA?.futureZoneField).toBe(42);

    const edge = out.variants[0].connections?.find((connection) => connection.name === "A-B");
    expect(edge?.futureEdgeField).toBe("edge-keep");
  });

  it("keeps the unknown fields stable across a second round-trip", () => {
    const once = roundTripTemplate(buildTemplateWithUnknownFields());
    const twice = roundTripTemplate(once) as unknown as ExportedShape;

    expect(twice.futureRootSetting).toEqual({ nested: [1, 2, 3], flag: true });
    expect(twice.variants[0].zones.find((zone) => zone.name === "A")?.futureZoneField).toBe(42);
    expect(twice.variants[0].connections?.find((connection) => connection.name === "A-B")?.futureEdgeField).toBe("edge-keep");
  });
});
