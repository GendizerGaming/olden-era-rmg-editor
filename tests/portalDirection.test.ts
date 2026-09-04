import { describe, expect, it } from "vitest";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";
import { roundTripTemplate } from "./helpers/gameTemplateRoundTrip.ts";

/**
 * One-way portals (`portalFromEnabled` / `portalToEnabled`) and bare springs.
 * Both are tri-state: the field is omitted unless the author set it, so the
 * engine keeps applying its own default instead of a value we pinned.
 */

function template(connections: unknown[]): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    variants: [{
      zones: [{ name: "A", size: 1 }, { name: "B", size: 1 }],
      connections
    }]
  } as unknown as RmgTemplate;
}

const importEdges = (connections: unknown[]) =>
  importTemplateFromJson(template(connections), [], []).edges;

describe("one-way portals", () => {
  it("imports the portal mouth flags as a tri-state", () => {
    const [twoWay, oneWay, explicit] = importEdges([
      { name: "c1", from: "A", to: "B", connectionType: "Portal" },
      { name: "c2", from: "A", to: "B", connectionType: "Portal", portalFromEnabled: false },
      { name: "c3", from: "A", to: "B", connectionType: "Portal", portalFromEnabled: true, portalToEnabled: true }
    ]);
    // omitted stays omitted, so the engine default (both mouths) applies
    expect(twoWay.portalFromEnabled).toBeUndefined();
    expect(twoWay.portalToEnabled).toBeUndefined();
    expect(oneWay.portalFromEnabled).toBe(false);
    expect(oneWay.portalToEnabled).toBeUndefined();
    expect(explicit.portalFromEnabled).toBe(true);
  });

  it("round-trips a one-way portal and never invents the flags", () => {
    const out = roundTripTemplate(template([
      { name: "c1", from: "A", to: "B", connectionType: "Portal" },
      { name: "c2", from: "A", to: "B", connectionType: "Portal", portalToEnabled: false }
    ]));
    const conns = (out.variants?.[0]?.connections ?? []) as Array<Record<string, unknown>>;
    expect("portalFromEnabled" in conns[0]).toBe(false);
    expect("portalToEnabled" in conns[0]).toBe(false);
    expect(conns[1].portalToEnabled).toBe(false);
  });
});

describe("spring length", () => {
  it("keeps a bare spring bare instead of pinning the default length", () => {
    const bare = { name: "s1", from: "A", to: "B", connectionType: "Proximity" };
    const [edge] = importEdges([bare]);
    expect(edge.length).toBeUndefined();

    const out = roundTripTemplate(template([bare]));
    const spring = (out.variants?.[0]?.connections ?? [])[0] as Record<string, unknown>;
    expect("length" in spring).toBe(false);
  });

  it("still round-trips an authored spring length", () => {
    const out = roundTripTemplate(template([
      { name: "s1", from: "A", to: "B", connectionType: "Proximity", length: 4 }
    ]));
    const spring = (out.variants?.[0]?.connections ?? [])[0] as Record<string, unknown>;
    expect(spring.length).toBe(4);
  });
});

describe("nested content variants", () => {
  it("keeps a candidate's variant through the model, not just the raw passthrough", () => {
    const tpl = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      mandatoryContent: [{
        name: "mc",
        content: [{
          name: "slot",
          content: [
            { sid: "mythic_scroll_box", variant: 0, weight: 0 },
            { sid: "mythic_scroll_box", variant: 2, weight: 1 },
            { sid: "pandora_box", weight: 3 }
          ]
        }]
      }],
      variants: [{ zones: [{ name: "A", size: 1, mandatoryContent: ["mc"] }], connections: [] }]
    } as unknown as RmgTemplate;

    const doc = importTemplateFromJson(tpl, [], []);
    const nested = doc.zones[0].objects[0].nestedContent;
    expect(nested).toEqual([
      { sid: "mythic_scroll_box", variant: 0, weight: 0 },
      { sid: "mythic_scroll_box", variant: 2, weight: 1 },
      { sid: "pandora_box", weight: 3 }
    ]);

    const out = roundTripTemplate(tpl);
    const cands = (out.mandatoryContent?.[0]?.content?.[0] as Record<string, unknown>).content as Array<Record<string, unknown>>;
    expect(cands[0].variant).toBe(0);
    expect(cands[1].variant).toBe(2);
    // an unset variant must stay absent rather than becoming 0
    expect("variant" in cands[2]).toBe(false);
  });
});
