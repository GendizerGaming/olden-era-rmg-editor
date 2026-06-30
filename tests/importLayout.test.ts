import { describe, it, expect } from "vitest";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import type { Edge, Zone } from "../src/types/editor.ts";

function template(
  zoneNames: string[],
  connections: Array<{ from: string; to: string; connectionType: string; length?: number }>
) {
  return {
    name: "T",
    gameMode: "Classic",
    sizeX: 128,
    sizeZ: 128,
    variants: [{ zones: zoneNames.map((name) => ({ name, size: 1 })), connections }]
  };
}

/** Group zones by passage connectivity (Proximity springs don't join groups). */
function passageGroups(zones: Zone[], edges: Edge[]): Zone[][] {
  const parent = new Map(zones.map((z) => [z.id, z.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const e of edges) {
    if (e.connectionType === "Proximity") continue;
    if (parent.has(e.from) && parent.has(e.to)) parent.set(find(e.from), find(e.to));
  }
  const groups = new Map<string, Zone[]>();
  for (const z of zones) {
    const root = find(z.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(z);
  }
  return [...groups.values()];
}

const box = (g: Zone[]) => ({
  minX: Math.min(...g.map((z) => z.x)),
  maxX: Math.max(...g.map((z) => z.x)),
  minY: Math.min(...g.map((z) => z.y)),
  maxY: Math.max(...g.map((z) => z.y))
});

describe("import layout separates passage-isolated groups", () => {
  it("packs two race-track halves into disjoint regions of the canvas", () => {
    // Exodus shape: two passage-connected halves joined only by a spring.
    const { zones, edges } = importTemplateFromJson(
      template(
        ["A1", "A2", "B1", "B2"],
        [
          { from: "A1", to: "A2", connectionType: "Direct" },
          { from: "B1", to: "B2", connectionType: "Direct" },
          { from: "A1", to: "B1", connectionType: "Proximity", length: 0.1 }
        ]
      ),
      [],
      []
    );

    const groups = passageGroups(zones, edges);
    expect(groups).toHaveLength(2);

    const a = box(groups[0]);
    const b = box(groups[1]);
    // The two groups occupy non-overlapping bounding boxes (a visible gap), so
    // they read as two distinct clusters rather than one tangle.
    const disjoint = a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY;
    expect(disjoint).toBe(true);
  });

  it("keeps a normally connected map as a single cluster", () => {
    const { zones, edges } = importTemplateFromJson(
      template(
        ["P1", "M", "P2"],
        [
          { from: "P1", to: "M", connectionType: "Direct" },
          { from: "M", to: "P2", connectionType: "Direct" }
        ]
      ),
      [],
      []
    );

    expect(passageGroups(zones, edges)).toHaveLength(1);
    expect(zones.every((z) => z.x >= 0.04 && z.x <= 0.96 && z.y >= 0.04 && z.y <= 0.96)).toBe(true);
  });
});
