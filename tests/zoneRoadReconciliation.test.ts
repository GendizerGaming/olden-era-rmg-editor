import { describe, expect, it } from "vitest";
import { exportImportedTemplate, importTemplateForRoundTrip } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Zone roads reference connections by id. When an imported template's
 * connections are recreated in the editor, the passthrough roads must be
 * reconciled with the current graph: roads to a deleted connection are
 * dropped, and a newly created connection gets a road. (Reporter scenario:
 * Jebus Cross — delete the Spawn↔Center links, add a fresh one.)
 */

// Minimal stand-in: Center and Spawn-A each carry a road to "conn-old".
function template(): RmgTemplate {
  const roadToOld = [{ type: "Stone", from: { type: "MainObject", args: ["0"] }, to: { type: "Connection", args: ["conn-old"] } }];
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    variants: [{
      zones: [
        { name: "Center", size: 1, roads: roadToOld },
        { name: "Spawn-A", size: 1, roads: roadToOld }
      ],
      connections: [{ name: "conn-old", from: "Center", to: "Spawn-A", connectionType: "Default", road: true }]
    }]
  } as unknown as RmgTemplate;
}

type Design = ReturnType<typeof importTemplateForRoundTrip>;
type Exported = ReturnType<typeof exportImportedTemplate>;

// Recreate the connection: drop the imported one, add an editor-named edge.
function recreateConnection(design: Design): void {
  design.edges = design.edges.filter((e) => e.id !== "conn-old");
  design.edges.push({
    id: "Center__Spawn-A", from: "Center", to: "Spawn-A",
    guardValue: 0, road: true, connectionType: "Default"
  } as Design["edges"][number]);
}

const zone = (out: Exported, name: string) => out.variants[0].zones.find((z) => z.name === name);
const roadConnRefs = (z: ReturnType<typeof zone>): string[] =>
  (z?.roads ?? [])
    .flatMap((r) => [r.from, r.to])
    .filter((t): t is { type: string; args: string[] } => t?.type === "Connection")
    .map((t) => t.args?.[0]);

describe("zone road reconciliation", () => {
  it("keeps the original roads untouched on a clean round-trip (fidelity guard)", () => {
    const out = exportImportedTemplate(importTemplateForRoundTrip(template()));
    expect(roadConnRefs(zone(out, "Center"))).toEqual(["conn-old"]);
    expect(roadConnRefs(zone(out, "Spawn-A"))).toEqual(["conn-old"]);
  });

  it("drops zone roads that point to a deleted connection", () => {
    const design = importTemplateForRoundTrip(template());
    recreateConnection(design);
    const out = exportImportedTemplate(design);
    const connIds = (out.variants[0].connections ?? []).map((c) => c.name);
    // Every road must reference a connection that still exists.
    for (const name of ["Center", "Spawn-A"]) {
      for (const ref of roadConnRefs(zone(out, name))) {
        expect(connIds).toContain(ref);
      }
    }
  });

  it("adds a road for a newly created connection on both touched zones", () => {
    const design = importTemplateForRoundTrip(template());
    recreateConnection(design);
    const out = exportImportedTemplate(design);
    expect(roadConnRefs(zone(out, "Center"))).toContain("Center__Spawn-A");
    expect(roadConnRefs(zone(out, "Spawn-A"))).toContain("Center__Spawn-A");
  });
});
