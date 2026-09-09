import { describe, expect, it, beforeEach } from "vitest";
import { useEditorStore } from "../src/store/useEditorStore.ts";

/**
 * One undo step should be one intent. Typing a name is dozens of store writes,
 * and a step per keystroke both buried real steps under the 50-step cap and
 * made undo walk back letter by letter.
 *
 * The session is identified by entity plus fields, not by a timer: typing
 * slowly must still be one step. It ends when another action happens, when the
 * edit moves to another field or entity, or when the input loses focus.
 */

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();
const steps = () => state().history.past.length;

const addZone = (type = "neutral"): string => {
  const before = new Set(state().zones.map((z) => z.id));
  actions().addZone(type);
  return state().zones.find((z) => !before.has(z.id))!.id;
};

const zoneOf = (id: string) => state().zones.find((z) => z.id === id)!;

/** Types a string the way an input does: one store write per character. */
const type = (zoneId: string, field: "label", text: string) => {
  for (let i = 1; i <= text.length; i++) {
    actions().updateZoneField(zoneId, { [field]: text.slice(0, i) });
  }
};

beforeEach(() => {
  actions().clearWorkspace();
});

describe("undo granularity", () => {
  it("folds a typed value into one step", () => {
    const id = addZone();
    const before = steps();

    type(id, "label", "Northern gate");

    expect(zoneOf(id).label).toBe("Northern gate");
    expect(steps() - before).toBe(1);
  });

  it("restores the value from before the first keystroke", () => {
    const id = addZone();
    const original = zoneOf(id).label;

    type(id, "label", "Northern gate");
    actions().undo();

    expect(zoneOf(id).label).toBe(original);
  });

  it("does not care how slowly it is typed", () => {
    const id = addZone();
    const before = steps();

    // No timer is involved, so the same writes spread over any span of time
    // still make a single step.
    for (const text of ["N", "No", "Nor"]) actions().updateZoneField(id, { label: text });
    const afterPause = steps();
    for (const text of ["Nort", "North"]) actions().updateZoneField(id, { label: text });

    expect(afterPause - before).toBe(1);
    expect(steps() - before).toBe(1);
  });

  it("starts a new step for a different field of the same zone", () => {
    const id = addZone();
    const before = steps();

    type(id, "label", "Hills");
    actions().updateZoneField(id, { size: 2 });

    expect(steps() - before).toBe(2);
  });

  it("starts a new step for the same field of another zone", () => {
    const a = addZone();
    const b = addZone();
    const before = steps();

    actions().updateZoneField(a, { label: "One" });
    actions().updateZoneField(b, { label: "Two" });

    expect(steps() - before).toBe(2);
  });

  it("is sealed by any other action", () => {
    const id = addZone();
    const before = steps();

    actions().updateZoneField(id, { label: "A" });
    addZone();
    actions().updateZoneField(id, { label: "AB" });

    // Edit, zone added, edit again — three separate steps.
    expect(steps() - before).toBe(3);
  });

  it("is sealed by leaving the input", () => {
    const id = addZone();
    const before = steps();

    actions().updateZoneField(id, { label: "A" });
    actions().sealHistory();
    actions().updateZoneField(id, { label: "AB" });

    expect(steps() - before).toBe(2);
  });

  it("starts a fresh step after an undo", () => {
    const id = addZone();
    type(id, "label", "Hills");
    actions().undo();
    const after = steps();

    actions().updateZoneField(id, { label: "X" });

    expect(steps()).toBe(after + 1);
  });

  it("folds connection and object edits too", () => {
    const a = addZone();
    const b = addZone();
    actions().connectZones(a, b);
    const edgeId = state().edges[0].id;
    const before = steps();

    for (const value of [1, 12, 123, 1234]) actions().updateEdgeField(edgeId, { guardValue: value });

    expect(state().edges[0].guardValue).toBe(1234);
    expect(steps() - before).toBe(1);
  });
});

describe("selection after undo", () => {
  it("keeps the selection when its element survives the rollback", () => {
    const id = addZone();
    actions().setSelected({ type: "zone", id });
    actions().updateZoneField(id, { label: "Hills" });

    actions().undo();

    // The inspector used to go blank on every undo, taking every open section
    // with it.
    expect(state().selected).toEqual({ type: "zone", id });
  });

  it("drops it when the rollback removes the element", () => {
    const first = addZone();
    const second = addZone();
    actions().setSelected({ type: "zone", id: second });

    actions().undo();

    expect(state().zones.map((z) => z.id)).toEqual([first]);
    expect(state().selected).toBeNull();
  });

  it("keeps a connection selected across undo, and drops a removed one", () => {
    const a = addZone();
    const b = addZone();
    actions().connectZones(a, b);
    const edgeId = state().edges[0].id;

    actions().updateEdgeField(edgeId, { guardValue: 999 });
    actions().setSelected({ type: "edge", id: edgeId });
    actions().undo();
    expect(state().selected).toEqual({ type: "edge", id: edgeId });

    // Undoing the connection itself has to let the selection go.
    actions().undo();
    expect(state().edges).toHaveLength(0);
    expect(state().selected).toBeNull();
  });

  it("leaves selections the snapshot knows nothing about alone", () => {
    const id = addZone();
    actions().updateZoneField(id, { label: "Hills" });
    // Terrain profiles live in settings, not in the zones/edges a rollback
    // rewrites, so this selection can never be invalidated by one.
    actions().setSelected({ type: "terrainProfile", id: "visual_editor_layout_neutral" });

    actions().undo();

    expect(state().selected).toEqual({ type: "terrainProfile", id: "visual_editor_layout_neutral" });
  });

  it("keeps the selection on redo as well", () => {
    const id = addZone();
    actions().setSelected({ type: "zone", id });
    actions().updateZoneField(id, { label: "Hills" });
    actions().undo();

    actions().redo();

    expect(zoneOf(id).label).toBe("Hills");
    expect(state().selected).toEqual({ type: "zone", id });
  });
});
