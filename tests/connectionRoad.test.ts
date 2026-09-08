import { describe, expect, it, beforeEach } from "vitest";
import { generateTemplate } from "../src/services/jsonGenerator.ts";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * "Without road" has to reach the zones, not just the connection. The zones
 * carry their own road segments, and one leading up to a passage marked
 * roadless contradicts it — which is what the export used to emit, because the
 * road reconciliation only ever asked whether a connection still existed.
 *
 * The toggle is what changes the zones. An imported template nobody touched
 * keeps whatever its author wrote: 15 connections across Expanse, Flashback and
 * Full Hire do pair road:false with a segment, and rewriting those on a plain
 * round-trip would edit files the user never opened.
 */

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();

const addZone = (type: string): string => {
  const before = new Set(state().zones.map((z) => z.id));
  actions().addZone(type);
  return state().zones.find((z) => !before.has(z.id))!.id;
};

type Emitted = {
  variants: Array<{
    zones: Array<{ name: string; roads?: Array<Record<string, unknown>> }>;
    connections: Array<Record<string, unknown>>;
  }>;
};

const emit = (): Emitted => {
  const s = state();
  return generateTemplate(
    s.settings, s.zones, s.edges, [], {}, s.presets, s.customObjectLists
  ) as unknown as Emitted;
};

/** Every "<zone> -> <connection>" road segment in the exported file. */
const roadsToConnections = (out: Emitted): string[] =>
  out.variants[0].zones.flatMap((zone) =>
    (zone.roads ?? []).flatMap((segment) => {
      const term = [segment.from, segment.to].find(
        (side) => (side as { type?: string })?.type === "Connection"
      );
      const ref = (term as { args?: string[] } | undefined)?.args?.[0];
      return ref ? [`${zone.name} -> ${ref}`] : [];
    })
  );

const importedTemplate = (road: boolean): RmgTemplate => ({
  name: "roads", gameMode: "Classic", description: "", sizeX: 128, sizeZ: 128,
  zoneLayouts: [], mandatoryContent: [], contentLists: [],
  variants: [{
    zones: [
      { name: "A", type: "Spawn", size: 10, roads: [{ type: "Stone", from: { type: "Crossroads" }, to: { type: "Connection", args: ["A__B"] } }] },
      { name: "B", type: "Neutral", size: 10, roads: [{ type: "Stone", from: { type: "Crossroads" }, to: { type: "Connection", args: ["A__B"] } }] }
    ],
    connections: [{ name: "A__B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road }]
  }]
} as unknown as RmgTemplate);

beforeEach(() => actions().clearWorkspace());

describe("roadless passages and zone roads", () => {
  it("lays no road to a connection created without one", () => {
    const a = addZone("spawn");
    const b = addZone("neutral");
    actions().connectZones(a, b);
    const edgeId = state().edges[0].id;

    actions().updateEdgeField(edgeId, { road: false });

    const out = emit();
    expect(out.variants[0].connections[0].road).toBe(false);
    expect(roadsToConnections(out)).toEqual([]);
  });

  it("brings the roads back when the connection gets one again", () => {
    const a = addZone("spawn");
    const b = addZone("neutral");
    actions().connectZones(a, b);
    const edgeId = state().edges[0].id;

    actions().updateEdgeField(edgeId, { road: false });
    actions().updateEdgeField(edgeId, { road: true });

    const out = emit();
    expect(out.variants[0].connections[0].road).toBe(true);
    expect(roadsToConnections(out)).toEqual([
      `${a} -> ${edgeId}`,
      `${b} -> ${edgeId}`
    ]);
  });

  it("drops the imported segments when the user switches the road off", () => {
    actions().importDesign(importTemplateFromJson(importedTemplate(true), [], []));
    const edgeId = state().edges[0].id;
    expect(roadsToConnections(emit())).toHaveLength(2);

    actions().updateEdgeField(edgeId, { road: false });

    expect(roadsToConnections(emit())).toEqual([]);
    // And back on, even though the export never re-adds roads for an imported
    // connection by itself.
    actions().updateEdgeField(edgeId, { road: true });
    expect(roadsToConnections(emit())).toEqual(["A -> A__B", "B -> A__B"]);
  });

  it("leaves an untouched import's road segments alone", () => {
    actions().importDesign(importTemplateFromJson(importedTemplate(false), [], []));

    // Import reads road presence off the segments, so this connection arrives
    // paved despite its road:false flag — a separate, deliberate rule covered
    // by roadTypes.test.ts. What matters here is that nothing rewrites the
    // author's segments when the user never touched the toggle.
    const out = emit();
    expect(roadsToConnections(out)).toEqual(["A -> A__B", "B -> A__B"]);
  });

  it("never touches zone roads for a spring", () => {
    const a = addZone("spawn");
    const b = addZone("neutral");
    actions().connectZones(a, b, "Proximity");
    const edgeId = state().edges[0].id;

    actions().updateEdgeField(edgeId, { road: false });

    const out = emit();
    expect(out.variants[0].connections[0].connectionType).toBe("Proximity");
    expect("road" in out.variants[0].connections[0]).toBe(false);
    expect(roadsToConnections(out)).toEqual([]);
  });
});
