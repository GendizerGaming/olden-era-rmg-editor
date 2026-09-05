import { describe, expect, it, beforeEach } from "vitest";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import { generateTemplate } from "../src/services/jsonGenerator.ts";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import { roundTripTemplate } from "./helpers/gameTemplateRoundTrip.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/**
 * Spring length is tri-state: a template may omit it entirely (the engine then
 * picks its own), or carry any number — the presets the editor offers cover
 * only 84% of the springs shipped with the game. These drive the whole data
 * path the app uses (store -> normalizers -> generator), because the direct
 * import/export helper skips the normalizers where a default once crept back in.
 */

function template(connections: unknown[]): RmgTemplate {
  return {
    name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
    variants: [{ zones: [{ name: "A", size: 1 }, { name: "B", size: 1 }], connections }]
  } as unknown as RmgTemplate;
}

const springWith = (length?: number) =>
  template([{ name: "s1", from: "A", to: "B", connectionType: "Proximity", ...(length === undefined ? {} : { length }) }]);

/** The connection as the running app would export it, via the store. */
function emitViaStore(tpl: RmgTemplate, edit?: (edgeId: string) => void): Record<string, unknown> {
  const actions = useEditorStore.getState().actions;
  actions.clearWorkspace();
  actions.importDesign(importTemplateFromJson(tpl, [], []));
  const spring = useEditorStore.getState().edges.find((e) => e.connectionType === "Proximity")!;
  edit?.(spring.id);
  const s = useEditorStore.getState();
  const out = generateTemplate(
    s.settings, s.zones, s.edges, [], {}, s.presets, s.customObjectLists
  ) as unknown as { variants: Array<{ connections: Array<Record<string, unknown>> }> };
  return out.variants[0].connections.find((c) => c.connectionType === "Proximity")!;
}

beforeEach(() => useEditorStore.getState().actions.clearWorkspace());

describe("spring length: what the file carries", () => {
  it("keeps a bare spring bare", () => {
    expect(importTemplateFromJson(springWith(), [], []).edges[0].length).toBeUndefined();
    expect("length" in emitViaStore(springWith())).toBe(false);
  });

  it.each([0.94, 2.82842712475, 0.25, 0.75, 8, 2.5])(
    "round-trips the non-preset length %s untouched",
    (value) => {
      const spring = (roundTripTemplate(springWith(value)).variants?.[0]?.connections ?? [])[0] as Record<string, unknown>;
      expect(spring.length).toBe(value);
      expect(emitViaStore(springWith(value)).length).toBe(value);
    }
  );

  it("treats an explicit zero as a real value, not as unset", () => {
    // 0 is falsy: any `if (length)` check would silently drop it
    const emitted = emitViaStore(springWith(0));
    expect("length" in emitted).toBe(true);
    expect(emitted.length).toBe(0);
  });
});

describe("spring length: what the control writes", () => {
  const setLength = (length: number | undefined) => (edgeId: string) =>
    useEditorStore.getState().actions.updateEdgeField(edgeId, { length });

  it.each([0.1, 0.5, 1.5, 4, 6])("emits the preset %s exactly as chosen", (value) => {
    expect(emitViaStore(springWith(), setLength(value)).length).toBe(value);
  });

  it.each([0.94, 2.82842712475, 3, 0])("emits a typed exact value %s unchanged", (value) => {
    const emitted = emitViaStore(springWith(), setLength(value));
    expect("length" in emitted).toBe(true);
    expect(emitted.length).toBe(value);
  });

  it("drops the field again when the length is cleared", () => {
    expect("length" in emitViaStore(springWith(4), setLength(undefined))).toBe(false);
  });

  it("switching an authored length to another value replaces it, not merges", () => {
    expect(emitViaStore(springWith(0.94), setLength(6)).length).toBe(6);
  });
});
