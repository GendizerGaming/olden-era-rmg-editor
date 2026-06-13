import { describe, expect, it } from "vitest";
import {
  asJsonValue,
  exportImportedTemplate,
  findJsonDifferences,
  importTemplateForRoundTrip,
  roundTripTemplate
} from "./helpers/gameTemplateRoundTrip.ts";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import { validate } from "../src/services/validator.ts";
import { makeZone } from "../src/store/zones.ts";
import { defaultPresets } from "../src/store/presets.ts";
import type { MapSettings } from "../src/types/editor.ts";
import type { RmgTemplate } from "../src/types/rmg.ts";

/** All contentCountLimits shapes seen in the official templates. */
function buildTemplate(): RmgTemplate {
  return {
    name: "Content Limits Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    contentCountLimits: [
      {
        name: "limits_plain",
        limits: [
          { sid: "beer_fountain", maxCount: 1 },
          { sid: "stables", variant: -1, maxCount: 0 },
          { includeLists: ["basic_content_list_building_hero_stats_and_skills_tier_2"], maxCount: 3 },
          // The exotic shape with `content` refinements stays passthrough
          {
            includeLists: ["basic_content_list_building_guarded_resource_banks_tier_3"],
            content: [{ sid: "dragon_utopia" }, { sid: "unstable_ruins" }],
            maxCount: 2
          }
        ]
      },
      {
        name: "limits_gated_0_0",
        playerMin: 0,
        playerMax: 0,
        limits: [{ sid: "black_tower", maxCount: 0 }]
      },
      { name: "limits_unreferenced", limits: [{ sid: "fountain", maxCount: 2 }] }
    ],
    variants: [
      {
        zones: [
          {
            name: "A",
            size: 1,
            contentCountLimits: ["limits_plain", "limits_gated_0_0"],
            mainObjects: [{ type: "Spawn", spawn: "Player1" }]
          },
          // A single reference as a plain string (a few official zones do this)
          { name: "B", size: 1, contentCountLimits: "limits_plain" }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("content count limits", () => {
  it("imports presets with classified rows and normalized zone references", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const presets = imported.settings.contentLimitPresets!;
    expect(presets.map((preset) => preset.name)).toEqual([
      "limits_plain", "limits_gated_0_0", "limits_unreferenced"
    ]);

    const plain = presets[0];
    expect(plain.limits[0]).toEqual({ sid: "beer_fountain", maxCount: 1 });
    expect(plain.limits[1]).toEqual({ sid: "stables", variant: -1, maxCount: 0 });
    expect(plain.limits[2]).toEqual({
      includeLists: ["basic_content_list_building_hero_stats_and_skills_tier_2"],
      maxCount: 3
    });
    expect(plain.limits[3].raw).toBeDefined();
    expect(plain.limits[3].raw).toMatchObject({ maxCount: 2 });

    const gated = presets[1];
    expect(gated.playerMin).toBe(0);
    expect(gated.playerMax).toBe(0);

    const zoneA = imported.zones.find((zone) => zone.id === "A");
    const zoneB = imported.zones.find((zone) => zone.id === "B");
    expect(zoneA?.contentCountLimits).toEqual(["limits_plain", "limits_gated_0_0"]);
    // The plain-string form normalizes to a one-element array
    expect(zoneB?.contentCountLimits).toEqual(["limits_plain"]);
    expect(zoneA?.rawFields?.contentCountLimits).toBeUndefined();
  });

  it("re-exports every imported preset verbatim, including unreferenced ones", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(buildTemplate()));
    const limits = exported.contentCountLimits!;
    expect(limits.map((preset) => preset.name)).toEqual([
      "limits_plain", "limits_gated_0_0", "limits_unreferenced"
    ]);
    expect(limits[0].limits).toEqual([
      { sid: "beer_fountain", maxCount: 1 },
      { sid: "stables", variant: -1, maxCount: 0 },
      { includeLists: ["basic_content_list_building_hero_stats_and_skills_tier_2"], maxCount: 3 },
      {
        includeLists: ["basic_content_list_building_guarded_resource_banks_tier_3"],
        content: [{ sid: "dragon_utopia" }, { sid: "unstable_ruins" }],
        maxCount: 2
      }
    ]);
    expect(limits[1].playerMin).toBe(0);
    expect(limits[1].playerMax).toBe(0);

    const zones = exported.variants[0].zones;
    expect(zones.find((zone) => zone.name === "A")?.contentCountLimits).toEqual(["limits_plain", "limits_gated_0_0"]);
    expect(zones.find((zone) => zone.name === "B")?.contentCountLimits).toEqual(["limits_plain"]);
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });

  it("validator flags references to missing presets", () => {
    const t = (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : key;
    const settings = {
      sizeX: 128, sizeZ: 128, players: 1, victoryMode: "classic",
      heroLimitMode: "fixed", terrainProfiles: [], contentLimitPresets: []
    } as unknown as MapSettings;
    const zone = {
      ...makeZone([], [], [], { id: "A", label: "A", type: "spawn", x: 0.5, y: 0.5, player: 1 }, defaultPresets.spawn),
      // The stub is fine (the exporter appends it), the other name is broken
      contentCountLimits: ["content_limits_spawn", "no_such_limits"]
    };

    const texts = validate(settings, [zone], [], false, [], [], t).map(([, text]) => text);
    expect(texts.filter((text) => text.startsWith("zoneContentLimitMissing"))).toHaveLength(1);
    expect(texts.some((text) => text.includes("no_such_limits"))).toBe(true);
  });

  it("store: rename rewrites zone references, in-use and built-in deletes are blocked", () => {
    const store = useEditorStore.getState();
    store.actions.addContentLimitPreset();
    const created = useEditorStore.getState().settings.contentLimitPresets.find((preset) => preset.custom);
    expect(created).toBeDefined();

    // Reference it from a zone, then rename: the reference must follow
    useEditorStore.setState((state) => ({
      zones: [{
        ...makeZone([], [], state.factions, { id: "Z1", label: "Z", type: "neutral", x: 0.5, y: 0.5 }, defaultPresets.neutral),
        contentCountLimits: [created!.name]
      }]
    }));
    store.actions.updateContentLimitPreset(created!.name, { name: "renamed_limits" });
    const state = useEditorStore.getState();
    expect(state.settings.contentLimitPresets.some((preset) => preset.name === "renamed_limits")).toBe(true);
    expect(state.zones[0].contentCountLimits).toEqual(["renamed_limits"]);

    // In-use delete is refused with a toast
    const before = state.settings.contentLimitPresets.length;
    store.actions.deleteContentLimitPreset("renamed_limits");
    expect(useEditorStore.getState().settings.contentLimitPresets.length).toBe(before);

    // Built-in delete is refused
    store.actions.deleteContentLimitPreset("content_limits_spawn");
    expect(useEditorStore.getState().settings.contentLimitPresets.some((preset) => preset.name === "content_limits_spawn")).toBe(true);

    // After clearing the reference the delete goes through
    useEditorStore.setState((state) => ({
      zones: state.zones.map((zone) => ({ ...zone, contentCountLimits: undefined }))
    }));
    store.actions.deleteContentLimitPreset("renamed_limits");
    expect(useEditorStore.getState().settings.contentLimitPresets.some((preset) => preset.name === "renamed_limits")).toBe(false);
  });

  it("fresh editor zones emit the referenced built-in stubs", () => {
    const imported = importTemplateForRoundTrip({
      name: "Empty", gameMode: "Classic", description: "", sizeX: 128, sizeZ: 128,
      variants: [{ zones: [{ name: "S", size: 1, mainObjects: [{ type: "Spawn", spawn: "Player1" }] }], connections: [] }]
    } as unknown as RmgTemplate);
    const exported = exportImportedTemplate(imported);
    // Zone "S" has no explicit refs → auto stub, which the export appends
    expect(exported.variants[0].zones[0].contentCountLimits).toEqual(["content_limits_spawn"]);
    expect(exported.contentCountLimits).toEqual([{ name: "content_limits_spawn", limits: [] }]);
  });
});
