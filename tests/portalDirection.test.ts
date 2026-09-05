import { describe, expect, it } from "vitest";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";
import { validate } from "../src/services/validator.ts";
import type { Edge, MapSettings } from "../src/types/editor.ts";
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

  it("maps the three one-way shapes onto the flag pair", () => {
    // entrance in From -> the To mouth is off, and vice versa; "none" is both.
    const out = roundTripTemplate(template([
      { name: "entryFrom", from: "A", to: "B", connectionType: "Portal", portalToEnabled: false },
      { name: "entryTo", from: "A", to: "B", connectionType: "Portal", portalFromEnabled: false },
      { name: "none", from: "A", to: "B", connectionType: "Portal", portalFromEnabled: false, portalToEnabled: false }
    ]));
    const c = (out.variants?.[0]?.connections ?? []) as Array<Record<string, unknown>>;
    expect([c[0].portalToEnabled, "portalFromEnabled" in c[0]]).toEqual([false, false]);
    expect([c[1].portalFromEnabled, "portalToEnabled" in c[1]]).toEqual([false, false]);
    expect([c[2].portalFromEnabled, c[2].portalToEnabled]).toEqual([false, false]);
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

describe("one-way portals match the engine authors' recipe", () => {
  it("writes both sides explicitly, so a changed engine default cannot flip it", () => {
    // Their documented shape sets the open side to true rather than leaving it
    // out; the round trip must carry that through untouched.
    const out = roundTripTemplate(template([
      { name: "Portal-A-B", from: "A", to: "B", connectionType: "Portal",
        portalFromEnabled: true, portalToEnabled: false }
    ]));
    const c = (out.variants?.[0]?.connections ?? [])[0] as Record<string, unknown>;
    expect(c.portalFromEnabled).toBe(true);
    expect(c.portalToEnabled).toBe(false);
  });

  it("warns when a one-way portal has no placement rules for its exit", () => {
    const tr = (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : key;
    const settings = { sizeX: 128, sizeZ: 128, players: 2, victoryMode: "classic",
      heroLimitMode: "fixed", terrainProfiles: [] } as unknown as MapSettings;
    const zone = (id: string) => ({
      id, label: id, type: "custom", x: 0.5, y: 0.5, size: 1, biomeMode: "random",
      biomeSource: "", biomeId: "Grass", mainObjects: [], guardedValue: 0,
      unguardedValue: 0, resourcesValue: 0, objects: []
    });
    const portal = (extra: Partial<Edge>): Edge => ({
      id: "A__B", from: "A", to: "B", guardValue: 0, road: true,
      connectionType: "Portal", ...extra
    });
    const warn = (edge: Edge) =>
      validate(settings, [zone("A"), zone("B")] as never, [edge], false, [], [], tr)
        .some(([, text]) => text.startsWith("oneWayPortalNeedsPlacement"));

    expect(warn(portal({ portalFromEnabled: true, portalToEnabled: false }))).toBe(true);
    // both mouths placed -> nothing to say
    const rules = [{ type: "Crossroads", args: [], targetMin: 0, targetMax: 0.08, weight: 20 }];
    expect(warn(portal({
      portalFromEnabled: true, portalToEnabled: false,
      portalPlacementRulesFrom: rules, portalPlacementRulesTo: rules
    }))).toBe(false);
    // a plain two-way portal is never nagged about placement
    expect(warn(portal({}))).toBe(false);
  });
});
