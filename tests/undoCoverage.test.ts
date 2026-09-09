import { describe, it, expect } from "vitest";
import { useEditorStore } from "../src/store/useEditorStore.ts";

/**
 * Every action that pushes a history step must be fully undoable: whatever it
 * changes has to live in the snapshot, or the step is a lie. Zone presets,
 * custom object lists and the zone counter were outside it, so creating a
 * preset pushed a step that undid nothing.
 *
 * A new action that writes state the snapshot does not carry fails here, which
 * is the only cheap way to catch it — the symptom is otherwise invisible until
 * someone presses undo and nothing happens.
 */

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();

/** Everything that is design data rather than transient UI. */
const design = () => {
  const s = state();
  return JSON.stringify({
    settings: s.settings,
    zones: s.zones,
    edges: s.edges,
    presets: s.presets,
    customObjectLists: s.customObjectLists,
    nextZoneNumber: s.nextZoneNumber,
    variants: s.variants,
    activeVariantId: s.activeVariantId,
    variantSnapshots: s.variantSnapshots
  });
};

const item = (id: string) => ({ id, sid: id, kind: "sid" as const, label: id, description: "", guarded: false });

/** Builds a small design each case starts from. */
const scaffold = () => {
  actions().clearWorkspace();
  actions().addZone("spawn");
  actions().addZone("neutral");
  const [a, b] = state().zones.map((z) => z.id);
  actions().connectZones(a, b);
  actions().addObjectToZone(a, item("dragon_utopia"));
  actions().createPreset("Scaffold", "custom");
  actions().createCustomList("scaffold_list", "Scaffold list");
  actions().addTerrainProfile();
  actions().addContentLimitPreset();
  actions().addContentPoolPreset();
  return {
    zoneA: a,
    zoneB: b,
    edgeId: state().edges[0].id,
    objectKey: state().zones.find((z) => z.id === a)!.objects.at(-1)!.key,
    presetId: Object.keys(state().presets).find((k) => state().presets[k].label === "Scaffold")!,
    listId: "scaffold_list",
    profile: state().settings.terrainProfiles.at(-1)!.name,
    limit: state().settings.contentLimitPresets.at(-1)!.name,
    pool: state().settings.contentPoolPresets.at(-1)!.name
  };
};

type Case = {
  name: string;
  /** Runs before the baseline is taken, for cases that need something to act on. */
  setup?: (s: ReturnType<typeof scaffold>) => void;
  run: (s: ReturnType<typeof scaffold>) => void;
};

const cases: Case[] = [
  { name: "addZone", run: () => actions().addZone("high") },
  { name: "deleteSelected", run: (s) => { actions().setSelected({ type: "zone", id: s.zoneB }); actions().deleteSelected(); } },
  { name: "duplicateSelected", run: (s) => { actions().setSelected({ type: "zone", id: s.zoneA }); actions().duplicateSelected(); } },
  { name: "updateZoneField", run: (s) => actions().updateZoneField(s.zoneA, { label: "Changed" }) },
  { name: "setZonePosition", run: (s) => actions().setZonePosition(s.zoneA, 42, 43) },
  { name: "setZoneRoads", run: (s) => actions().setZoneRoads(s.zoneA, [{ type: "Dirt", from: { type: "Crossroads" }, to: { type: "Crossroads" } }]) },
  { name: "rescaleZoneValues", run: (s) => { actions().updateZoneField(s.zoneA, { size: 4 }); actions().sealHistory(); actions().rescaleZoneValues(); } },
  { name: "connectZones", run: (s) => actions().connectZones(s.zoneB, s.zoneA, "Portal") },
  { name: "updateEdgeField", run: (s) => actions().updateEdgeField(s.edgeId, { guardValue: 4242 }) },
  { name: "deleteEdge", run: (s) => actions().deleteEdge(s.edgeId) },
  { name: "addConnectionsBetweenZones", run: (s) => { actions().addZone("low"); const c = state().zones.at(-1)!.id; actions().addConnectionsBetweenZones([s.edgeId], s.zoneA, c); } },
  { name: "addObjectToZone", run: (s) => actions().addObjectToZone(s.zoneA, item("pandora_box")) },
  { name: "updateObjectField", run: (s) => actions().updateObjectField(s.zoneA, s.objectKey, { count: 7 }) },
  { name: "removeObjectFromZone", run: (s) => actions().removeObjectFromZone(s.zoneA, s.objectKey) },
  { name: "createPreset", run: () => actions().createPreset("Fresh", "custom") },
  { name: "updatePreset", run: (s) => actions().updatePreset(s.presetId, { guardedValue: 777 }) },
  { name: "deletePreset", run: (s) => actions().deletePreset(s.presetId) },
  { name: "resetPreset", setup: () => actions().updatePreset("neutral", { guardedValue: 777 }), run: () => actions().resetPreset("neutral") },
  { name: "resetBuiltInPresets", setup: () => actions().updatePreset("neutral", { guardedValue: 999 }), run: () => actions().resetBuiltInPresets() },
  { name: "saveZoneAsPreset", run: (s) => actions().saveZoneAsPreset(s.zoneA, "From zone") },
  { name: "addObjectToPreset", run: (s) => actions().addObjectToPreset(s.presetId, item("pandora_box")) },
  { name: "updatePresetObjectField", setup: (s) => actions().addObjectToPreset(s.presetId, item("pandora_box")), run: (s) => actions().updatePresetObjectField(s.presetId, state().presets[s.presetId].objects.at(-1)!.key, { count: 5 }) },
  { name: "removeObjectFromPreset", setup: (s) => actions().addObjectToPreset(s.presetId, item("pandora_box")), run: (s) => actions().removeObjectFromPreset(s.presetId, state().presets[s.presetId].objects.at(-1)!.key) },
  { name: "createCustomList", run: () => actions().createCustomList("fresh_list", "Fresh list") },
  { name: "updateCustomList", run: (s) => actions().updateCustomList(s.listId, { label: "Renamed" }) },
  { name: "addEntryToCustomList", run: (s) => actions().addEntryToCustomList(s.listId, { kind: "sid", value: "pandora_box", weight: 1 }) },
  { name: "updateEntryWeightInCustomList", setup: (s) => actions().addEntryToCustomList(s.listId, { kind: "sid", value: "pandora_box", weight: 1 }), run: (s) => actions().updateEntryWeightInCustomList(s.listId, state().customObjectLists[s.listId].entries.at(-1)!.key, 42) },
  { name: "removeEntryFromCustomList", setup: (s) => actions().addEntryToCustomList(s.listId, { kind: "sid", value: "pandora_box", weight: 1 }), run: (s) => actions().removeEntryFromCustomList(s.listId, state().customObjectLists[s.listId].entries.at(-1)!.key) },
  { name: "deleteCustomList", run: (s) => actions().deleteCustomList(s.listId) },
  { name: "addTerrainProfile", run: () => actions().addTerrainProfile() },
  { name: "duplicateTerrainProfile", run: (s) => actions().duplicateTerrainProfile(s.profile) },
  { name: "updateTerrainProfile", run: (s) => actions().updateTerrainProfile(s.profile, { obstaclesFill: 0.51 }) },
  { name: "deleteTerrainProfile", run: (s) => actions().deleteTerrainProfile(s.profile) },
  { name: "resetTerrainProfile", setup: () => actions().updateTerrainProfile("visual_editor_layout_neutral", { obstaclesFill: 0.9 }), run: () => actions().resetTerrainProfile("visual_editor_layout_neutral") },
  { name: "resetBuiltInTerrainProfiles", setup: () => actions().updateTerrainProfile("visual_editor_layout_neutral", { obstaclesFill: 0.9 }), run: () => actions().resetBuiltInTerrainProfiles() },
  { name: "addContentLimitPreset", run: () => actions().addContentLimitPreset() },
  { name: "duplicateContentLimitPreset", run: (s) => actions().duplicateContentLimitPreset(s.limit) },
  { name: "updateContentLimitPreset", run: (s) => actions().updateContentLimitPreset(s.limit, { playerMin: 3 }) },
  { name: "deleteContentLimitPreset", run: (s) => actions().deleteContentLimitPreset(s.limit) },
  { name: "resetBuiltInContentLimits", setup: () => { const first = state().settings.contentLimitPresets[0]; if (first) actions().updateContentLimitPreset(first.name, { playerMin: 4 }); }, run: () => actions().resetBuiltInContentLimits() },
  { name: "addContentPoolPreset", run: () => actions().addContentPoolPreset() },
  { name: "duplicateContentPoolPreset", run: (s) => actions().duplicateContentPoolPreset(s.pool) },
  { name: "updateContentPoolPreset", run: (s) => actions().updateContentPoolPreset(s.pool, { name: s.pool + "_x" }) },
  { name: "deleteContentPoolPreset", run: (s) => actions().deleteContentPoolPreset(s.pool) },
  { name: "updateSettings", run: () => actions().updateSettings({ name: "Renamed map" }) },
  {
    name: "detachOriginalLayout",
    setup: () => useEditorStore.setState((prev) => ({
      settings: { ...prev.settings, originalZoneLayouts: [{ name: "kept" }] as never }
    })),
    run: () => actions().detachOriginalLayout()
  }
];

describe("undo audit", () => {
  it("every undoable action is actually undone", () => {
    const broken: string[] = [];
    const noop: string[] = [];

    for (const testCase of cases) {
      const scaffolded = scaffold();
      testCase.setup?.(scaffolded);
      // The 50-step cap would otherwise saturate across cases and make the
      // step count meaningless.
      useEditorStore.setState({ history: { past: [], future: [] } });
      const before = design();
      const stepsBefore = state().history.past.length;

      testCase.run(scaffolded);

      const changed = design() !== before;
      const steps = state().history.past.length - stepsBefore;
      if (!changed) { noop.push(testCase.name); continue; }

      for (let i = 0; i < steps; i++) actions().undo();
      if (design() !== before) {
        const a = JSON.parse(before) as Record<string, unknown>;
        const b = JSON.parse(design()) as Record<string, unknown>;
        const fields = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        const detail = fields.map((k) => `${k}: ${JSON.stringify(a[k]).slice(0, 60)} -> ${JSON.stringify(b[k]).slice(0, 60)}`);
        broken.push(`${testCase.name} (${steps} step(s)) | ${detail.join(' ; ')}`);
      }
    }

    // A case that changes nothing proves nothing, so it counts as a failure
    // of the audit itself rather than a pass.
    expect(noop).toEqual([]);
    expect(broken).toEqual([]);
  });
});
