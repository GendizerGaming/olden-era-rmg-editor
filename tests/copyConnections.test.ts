import { beforeEach, describe, expect, it } from "vitest";
import { cloneEdgeOntoZones, edgePairKey } from "../src/store/zones.ts";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import type { Edge } from "../src/types/editor.ts";

const baseEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: "A__Center",
  from: "A",
  to: "Center",
  guardValue: 66666,
  road: true,
  roadType: "Stone",
  connectionType: "Direct",
  simTurnSquad: true,
  guardWeeklyIncrement: 0.2,
  guardEscape: false,
  guardZone: "Center",
  guardMatchGroup: "spawn_main_guard",
  imported: true,
  rawFields: { name: "Center-A-Main" } as unknown as Edge["rawFields"],
  ...overrides
});

describe("cloneEdgeOntoZones", () => {
  it("copies every balance field verbatim but regenerates identity", () => {
    const clone = cloneEdgeOntoZones(baseEdge(), "Side-C", "Center", "fresh-id");
    expect(clone.id).toBe("fresh-id");
    expect(clone.guardValue).toBe(66666);
    expect(clone.connectionType).toBe("Direct");
    expect(clone.road).toBe(true);
    expect(clone.roadType).toBe("Stone");
    expect(clone.simTurnSquad).toBe(true);
    expect(clone.guardWeeklyIncrement).toBe(0.2);
    expect(clone.guardEscape).toBe(false);
    expect(clone.guardMatchGroup).toBe("spawn_main_guard");
    expect(new Set([clone.from, clone.to])).toEqual(new Set(["Side-C", "Center"]));
    // identity / import round-trip must not leak from the source
    expect(clone.imported).toBe(false);
    expect(clone.rawFields).toBeUndefined();
  });

  it("keeps a generic guardZone (Center / auto) as is", () => {
    expect(cloneEdgeOntoZones(baseEdge({ guardZone: "Center" }), "Side-C", "Center", "x").guardZone).toBe("Center");
    expect(cloneEdgeOntoZones(baseEdge({ guardZone: undefined }), "Side-C", "Center", "x").guardZone).toBeUndefined();
  });

  it("keeps a zone-named guardZone only when that zone is still an endpoint", () => {
    // guard sits in the spoke zone A; copying to A<->Side-D keeps A (still an endpoint)
    const kept = cloneEdgeOntoZones(baseEdge({ guardZone: "A" }), "A", "Side-D", "x");
    expect(kept.guardZone).toBe("A");
    // copying to Side-C<->Center drops A (no longer touched) → auto
    const dropped = cloneEdgeOntoZones(baseEdge({ guardZone: "A" }), "Side-C", "Center", "x");
    expect(dropped.guardZone).toBeUndefined();
  });

  it("orients from/to by the shared endpoint regardless of pick order", () => {
    const a = cloneEdgeOntoZones(baseEdge(), "Side-C", "Center", "x");
    const b = cloneEdgeOntoZones(baseEdge(), "Center", "Side-C", "y");
    expect([a.from, a.to]).toEqual(["Side-C", "Center"]);
    expect([b.from, b.to]).toEqual(["Side-C", "Center"]);
  });
});

describe("addConnectionsBetweenZones (store action)", () => {
  const actions = () => useEditorStore.getState().actions;
  const state = () => useEditorStore.getState();

  const addZone = (type: string): string => {
    const before = new Set(state().zones.map((z) => z.id));
    actions().addZone(type);
    return state().zones.find((z) => !before.has(z.id))!.id;
  };
  const pairEdges = (x: string, y: string): Edge[] =>
    state().edges.filter((e) => edgePairKey(e.from, e.to) === edgePairKey(x, y));

  beforeEach(() => {
    actions().clearWorkspace();
  });

  it("clones a whole pair's passages onto another pair, additively and per-edge", () => {
    const center = addZone("neutral");
    const a = addZone("spawn");
    const c = addZone("spawn");

    // Spawn-A ↔ Center: two strong passages in the main guard family
    actions().connectZones(a, center);
    actions().connectZones(a, center);
    const [a1, a2] = pairEdges(a, center);
    actions().updateEdgeField(a1.id, { guardValue: 66666, guardMatchGroup: "spawn_main_guard" });
    actions().updateEdgeField(a2.id, { guardValue: 66666, guardMatchGroup: "spawn_main_guard_1" });

    // Side-C ↔ Center already has a weaker passage that must survive the copy
    actions().connectZones(c, center);
    const [cOld] = pairEdges(c, center);
    actions().updateEdgeField(cOld.id, { guardValue: 55555, guardMatchGroup: "spawn_side_guard" });

    // Selection must stay on the source, so the same bundle can be stamped
    // onto several pairs in a row without re-selecting it.
    actions().setSelected({ type: "edge", id: a1.id });
    actions().addConnectionsBetweenZones([a1.id, a2.id], c, center);
    expect(state().selected).toEqual({ type: "edge", id: a1.id });

    const after = pairEdges(c, center);
    // additive: the old weak one plus two clones
    expect(after).toHaveLength(3);
    expect(after.some((e) => e.guardValue === 55555 && e.guardMatchGroup === "spawn_side_guard")).toBe(true);

    const clones = after.filter((e) => e.guardValue === 66666);
    expect(clones).toHaveLength(2);
    // match groups carried over per-edge (index-aligned), not collapsed into one
    expect(clones.map((e) => e.guardMatchGroup).sort()).toEqual(["spawn_main_guard", "spawn_main_guard_1"]);
    // endpoints retargeted to the C pair, fresh unique ids
    clones.forEach((e) => expect(new Set([e.from, e.to])).toEqual(new Set([c, center])));
    expect(new Set(after.map((e) => e.id)).size).toBe(after.length);
  });

  it("zone picking collects two distinct zones and ignores extras", () => {
    expect(state().zonePick).toBeNull();
    // inactive picker ignores clicks
    actions().pickZone("Z1");
    expect(state().zonePick).toBeNull();

    actions().startZonePick();
    expect(state().zonePick).toEqual([]);
    actions().pickZone("Z1");
    actions().pickZone("Z1"); // same zone twice — ignored
    expect(state().zonePick).toEqual(["Z1"]);
    actions().pickZone("Z2");
    actions().pickZone("Z3"); // already have two — ignored
    expect(state().zonePick).toEqual(["Z1", "Z2"]);

    actions().cancelZonePick();
    expect(state().zonePick).toBeNull();
    // switching canvas mode also drops an active pick
    actions().startZonePick();
    actions().setMode("connect");
    expect(state().zonePick).toBeNull();
  });

  it("skips springs and leaves the target untouched when there is nothing to copy", () => {
    const center = addZone("neutral");
    const a = addZone("spawn");
    const c = addZone("spawn");
    actions().connectZones(a, center, "Proximity");
    const [spring] = pairEdges(a, center);

    const before = state().edges.length;
    actions().addConnectionsBetweenZones([spring.id], c, center);
    expect(state().edges.length).toBe(before);
  });
});
