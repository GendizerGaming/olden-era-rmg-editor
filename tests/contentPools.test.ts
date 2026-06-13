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

/** All contentPools shapes seen in the official templates. */
function buildTemplate(): RmgTemplate {
  return {
    name: "Content Pools Test",
    gameMode: "Classic",
    description: "synthetic",
    sizeX: 128,
    sizeZ: 128,
    contentPools: [
      {
        name: "pool_main",
        valueDistribution: { priceBounds: [3999, 6999, 12999, 20000], weights: [5, 6, 20, 12, 6] },
        groups: [
          { weight: 250000, includeLists: ["template_pool_pandora"] },
          { weight: 0, includeLists: ["basic_content_list_pickup_pandora_box"] },
          // The exotic shape with per-object `content` refinements stays passthrough
          {
            weight: 30000,
            includeLists: ["basic_content_list_building_hero_buff_tier_1"],
            content: [{ sid: "mana_well", weight: 0 }, { sid: "fountain", weight: 0 }]
          }
        ],
        bans: [{ sid: "mirage" }, { sid: "pandora_box", variant: 14 }]
      },
      // One official pool omits valueDistribution entirely
      { name: "pool_no_distribution", groups: [{ weight: 100, includeLists: ["some_list"] }], bans: [] },
      { name: "pool_unreferenced", groups: [], bans: [] }
    ],
    variants: [
      {
        zones: [
          {
            name: "A",
            size: 1,
            guardedContentPool: ["pool_main"],
            unguardedContentPool: ["pool_main", "pool_no_distribution"],
            resourcesContentPool: ["pool_no_distribution"],
            mainObjects: [{ type: "Spawn", spawn: "Player1" }]
          },
          { name: "B", size: 1, guardedContentPool: [], unguardedContentPool: [], resourcesContentPool: [] }
        ],
        connections: [
          { name: "A-B", from: "A", to: "B", connectionType: "Direct", guardValue: 1000, road: true }
        ]
      }
    ]
  } as unknown as RmgTemplate;
}

describe("content pools", () => {
  it("imports pools with classified groups/bans and zone references", () => {
    const imported = importTemplateForRoundTrip(buildTemplate());
    const pools = imported.settings.contentPoolPresets!;
    expect(pools.map((pool) => pool.name)).toEqual(["pool_main", "pool_no_distribution", "pool_unreferenced"]);

    const main = pools[0];
    expect(main.valueDistribution).toEqual({ priceBounds: [3999, 6999, 12999, 20000], weights: [5, 6, 20, 12, 6] });
    expect(main.groups[0]).toEqual({ weight: 250000, includeLists: ["template_pool_pandora"] });
    expect(main.groups[1]).toEqual({ weight: 0, includeLists: ["basic_content_list_pickup_pandora_box"] });
    expect(main.groups[2].raw).toBeDefined();
    expect(main.bans).toEqual([{ sid: "mirage" }, { sid: "pandora_box", variant: 14 }]);
    expect(pools[1].valueDistribution).toBeUndefined();

    const zoneA = imported.zones.find((zone) => zone.id === "A");
    expect(zoneA?.guardedContentPool).toEqual(["pool_main"]);
    expect(zoneA?.unguardedContentPool).toEqual(["pool_main", "pool_no_distribution"]);
    expect(zoneA?.resourcesContentPool).toEqual(["pool_no_distribution"]);
    expect(zoneA?.rawFields?.guardedContentPool).toBeUndefined();
    // Empty arrays survive as explicit empty references
    const zoneB = imported.zones.find((zone) => zone.id === "B");
    expect(zoneB?.guardedContentPool).toEqual([]);
  });

  it("re-exports every imported pool verbatim, including unreferenced ones", () => {
    const exported = exportImportedTemplate(importTemplateForRoundTrip(buildTemplate()));
    const pools = exported.contentPools!;
    expect(pools.map((pool) => pool.name)).toEqual(["pool_main", "pool_no_distribution", "pool_unreferenced"]);
    expect(pools[0].valueDistribution).toEqual({ priceBounds: [3999, 6999, 12999, 20000], weights: [5, 6, 20, 12, 6] });
    expect(pools[0].groups).toEqual([
      { weight: 250000, includeLists: ["template_pool_pandora"] },
      { weight: 0, includeLists: ["basic_content_list_pickup_pandora_box"] },
      {
        weight: 30000,
        includeLists: ["basic_content_list_building_hero_buff_tier_1"],
        content: [{ sid: "mana_well", weight: 0 }, { sid: "fountain", weight: 0 }]
      }
    ]);
    expect(pools[0].bans).toEqual([{ sid: "mirage" }, { sid: "pandora_box", variant: 14 }]);
    expect(pools[1]).not.toHaveProperty("valueDistribution");
    // No auto visual_pool_* pollution: every zone has explicit references
    expect(pools.some((pool) => pool.name.startsWith("visual_pool_"))).toBe(false);

    const zones = exported.variants[0].zones;
    const zoneA = zones.find((zone) => zone.name === "A");
    expect(zoneA?.guardedContentPool).toEqual(["pool_main"]);
    expect(zoneA?.unguardedContentPool).toEqual(["pool_main", "pool_no_distribution"]);
    expect(zones.find((zone) => zone.name === "B")?.guardedContentPool).toEqual([]);
  });

  it("reaches a stable canonical export", () => {
    const firstExport = roundTripTemplate(buildTemplate());
    const secondExport = roundTripTemplate(firstExport);
    expect(
      findJsonDifferences(asJsonValue(firstExport), asJsonValue(secondExport))
    ).toEqual([]);
  });

  it("zones without explicit references still get the generated visual pools", () => {
    const imported = importTemplateForRoundTrip({
      name: "Empty", gameMode: "Classic", description: "", sizeX: 128, sizeZ: 128,
      variants: [{ zones: [{ name: "S", size: 1, mainObjects: [{ type: "Spawn", spawn: "Player1" }] }], connections: [] }]
    } as unknown as RmgTemplate);
    const exported = exportImportedTemplate(imported);
    expect(exported.variants[0].zones[0].guardedContentPool).toEqual(["visual_pool_guarded_start"]);
    expect(exported.contentPools!.some((pool) => pool.name === "visual_pool_guarded_start")).toBe(true);
  });

  it("validator flags references to missing pools but accepts auto names", () => {
    const t = (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : key;
    const settings = {
      sizeX: 128, sizeZ: 128, players: 1, victoryMode: "classic",
      heroLimitMode: "fixed", terrainProfiles: [], contentLimitPresets: [], contentPoolPresets: []
    } as unknown as MapSettings;
    const zone = {
      ...makeZone([], [], [], { id: "A", label: "A", type: "spawn", x: 0.5, y: 0.5, player: 1 }, defaultPresets.spawn),
      guardedContentPool: ["visual_pool_guarded_start", "no_such_pool"]
    };

    const texts = validate(settings, [zone], [], false, [], [], t).map(([, text]) => text);
    expect(texts.filter((text) => text.startsWith("zoneContentPoolMissing"))).toHaveLength(1);
    expect(texts.some((text) => text.includes("no_such_pool"))).toBe(true);
  });

  it("validator accepts references to the game's built-in pools", () => {
    const t = (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : key;
    const settings = {
      sizeX: 128, sizeZ: 128, players: 1, victoryMode: "classic",
      heroLimitMode: "fixed", terrainProfiles: [], contentLimitPresets: [], contentPoolPresets: []
    } as unknown as MapSettings;
    // A built-in game pool (defined in Core, not the template) and an unknown one
    const zone = {
      ...makeZone([], [], [], { id: "A", label: "A", type: "spawn", x: 0.5, y: 0.5, player: 1 }, defaultPresets.spawn),
      guardedContentPool: ["template_pool_jebus_cross_guarded_start_zone"],
      unguardedContentPool: ["definitely_not_a_pool"]
    };
    const builtInPoolNames = ["template_pool_jebus_cross_guarded_start_zone"];

    const texts = validate(settings, [zone], [], false, [], [], t, undefined, undefined, builtInPoolNames)
      .map(([, text]) => text);
    const poolWarnings = texts.filter((text) => text.startsWith("zoneContentPoolMissing"));
    // Only the unknown one is flagged; the built-in pool passes
    expect(poolWarnings).toHaveLength(1);
    expect(poolWarnings[0]).toContain("definitely_not_a_pool");
    expect(texts.some((text) => text.includes("jebus_cross"))).toBe(false);
  });

  it("store: rename rewrites zone references in all three slots, in-use delete is blocked", () => {
    const store = useEditorStore.getState();
    store.actions.addContentPoolPreset();
    const created = useEditorStore.getState().settings.contentPoolPresets.find((pool) => pool.custom);
    expect(created).toBeDefined();

    useEditorStore.setState((state) => ({
      zones: [{
        ...makeZone([], [], state.factions, { id: "Z1", label: "Z", type: "neutral", x: 0.5, y: 0.5 }, defaultPresets.neutral),
        guardedContentPool: [created!.name],
        resourcesContentPool: [created!.name]
      }]
    }));
    store.actions.updateContentPoolPreset(created!.name, { name: "renamed_pool" });
    const state = useEditorStore.getState();
    expect(state.settings.contentPoolPresets.some((pool) => pool.name === "renamed_pool")).toBe(true);
    expect(state.zones[0].guardedContentPool).toEqual(["renamed_pool"]);
    expect(state.zones[0].resourcesContentPool).toEqual(["renamed_pool"]);

    const before = state.settings.contentPoolPresets.length;
    store.actions.deleteContentPoolPreset("renamed_pool");
    expect(useEditorStore.getState().settings.contentPoolPresets.length).toBe(before);

    useEditorStore.setState((state) => ({
      zones: state.zones.map((zone) => ({
        ...zone,
        guardedContentPool: undefined,
        resourcesContentPool: undefined
      }))
    }));
    store.actions.deleteContentPoolPreset("renamed_pool");
    expect(useEditorStore.getState().settings.contentPoolPresets.some((pool) => pool.name === "renamed_pool")).toBe(false);
  });
});
