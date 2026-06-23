import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import { TEMPLATE_RECIPES } from "../src/store/templateRecipes.ts";
import { generateTemplate } from "../src/services/jsonGenerator.ts";

/**
 * Store-action coverage: the editor buttons call these actions, so each one
 * must mutate the model the way the UI promises. JSON emission of the model
 * itself is covered by exportCoverage.test.ts.
 */

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();

beforeEach(() => {
  // A clean canvas for every test (clearWorkspace keeps presets/profiles).
  actions().clearWorkspace();
});

describe("zone actions", () => {
  it("addZone creates a zone from the preset with area-scaled values", () => {
    actions().addZone("high");
    const zone = state().zones[0];
    expect(zone).toBeDefined();
    expect(zone.type).toBe("high");
    // One zone on a 128×128 map hits the ×2 area-scale clamp: 800k → 1.6M
    expect(zone.guardedValue).toBe(1600000);
    expect(zone.guardMultiplier).toBe(1.8);
  });

  it("addZone for a spawn assigns the next free player with a Spawn object", () => {
    actions().addZone("spawn");
    actions().addZone("spawn");
    const players = state().zones.map((zone) => zone.mainObjects[0]?.player);
    expect(players).toEqual([1, 2]);
    expect(state().zones[0].mainObjects[0].type).toBe("Spawn");
  });

  it("updateZoneField applies a preset on type change", () => {
    actions().addZone("low");
    const id = state().zones[0].id;
    actions().updateZoneField(id, { type: "medium" });
    const zone = state().zones[0];
    expect(zone.type).toBe("medium");
    // Preset values rescaled for the single-zone map (400k × 2)
    expect(zone.guardedValue).toBe(800000);
  });

  it("deleteSelected removes the zone and its edges", () => {
    actions().addZone("spawn");
    actions().addZone("neutral");
    const [a, b] = state().zones.map((zone) => zone.id);
    actions().connectZones(a, b);
    expect(state().edges).toHaveLength(1);

    actions().setSelected({ type: "zone", id: a });
    actions().deleteSelected();
    expect(state().zones.map((zone) => zone.id)).toEqual([b]);
    expect(state().edges).toHaveLength(0);
  });

  it("duplicateSelected copies a zone and reassigns the player", () => {
    actions().addZone("spawn");
    const source = state().zones[0];
    actions().setSelected({ type: "zone", id: source.id });
    actions().duplicateSelected();
    expect(state().zones).toHaveLength(2);
    const copy = state().zones[1];
    expect(copy.id).not.toBe(source.id);
    expect(copy.guardedValue).toBe(source.guardedValue);
    // The copy must not collide on the player number
    expect(copy.mainObjects[0].player).not.toBe(source.mainObjects[0].player);
  });

  it("editing a content value detaches the zone from its preset (type → custom)", () => {
    actions().addZone("low");
    const id = state().zones[0].id;
    actions().updateZoneField(id, { guardedValue: 123000 });
    expect(state().zones[0].type).toBe("custom");
    expect(state().zones[0].guardedValue).toBe(123000);
  });

  it("rescaleZoneValues re-derives values from the preset and current map", () => {
    actions().addZone("low");
    const id = state().zones[0].id;
    expect(state().zones[0].guardedValue).toBe(360000); // 180k × 2 clamp on 128×128
    actions().updateSettings({ sizeX: 64, sizeZ: 64 });
    actions().rescaleZoneValues(id);
    // 64×64 single zone: scale √(4096/1600) = 1.6 → 180k × 1.6
    expect(state().zones[0].guardedValue).toBe(288000);
  });
});

describe("connection actions", () => {
  it("connectZones creates an edge with a default guard; updateEdgeField edits it", () => {
    actions().addZone("spawn");
    actions().addZone("neutral");
    const [a, b] = state().zones.map((zone) => zone.id);
    actions().connectZones(a, b);
    const edge = state().edges[0];
    expect(edge.from).toBe(a);
    expect(edge.to).toBe(b);
    expect(edge.connectionType).toBe("Direct");
    expect(edge.guardValue).toBeGreaterThan(0);

    actions().updateEdgeField(edge.id, { connectionType: "Portal", guardValue: 33000, roadType: "Dirt" });
    const updated = state().edges[0];
    expect(updated.connectionType).toBe("Portal");
    expect(updated.guardValue).toBe(33000);
    expect(updated.roadType).toBe("Dirt");
  });

  it("deleteEdge removes only the edge", () => {
    actions().addZone("spawn");
    actions().addZone("neutral");
    const [a, b] = state().zones.map((zone) => zone.id);
    actions().connectZones(a, b);
    actions().deleteEdge(state().edges[0].id);
    expect(state().edges).toHaveLength(0);
    expect(state().zones).toHaveLength(2);
  });
});

describe("settings, undo and presets", () => {
  it("updateSettings changes map settings", () => {
    // victoryMode is derived from the win-condition flags by the normalizer.
    actions().updateSettings({ name: "Renamed", sizeX: 160, cityHoldEnabled: true });
    expect(state().settings.name).toBe("Renamed");
    expect(state().settings.sizeX).toBe(160);
    expect(state().settings.victoryMode).toBe("cityHold");
  });

  it("undo and redo travel through zone additions", () => {
    actions().addZone("neutral");
    expect(state().zones).toHaveLength(1);
    actions().undo();
    expect(state().zones).toHaveLength(0);
    actions().redo();
    expect(state().zones).toHaveLength(1);
  });

  it("saveZoneAsPreset captures the zone profile as a custom preset", () => {
    actions().addZone("medium");
    const zone = state().zones[0];
    actions().updateZoneField(zone.id, { guardedValue: 555000 });
    actions().saveZoneAsPreset(zone.id, "My Custom");
    const preset = Object.values(state().presets).find((candidate) => candidate.label === "My Custom");
    expect(preset).toBeDefined();
    expect(preset!.isCustom).toBe(true);
    expect(preset!.guardedValue).toBe(555000);
  });

  it("resetBuiltInPresets restores factory values", () => {
    actions().updatePreset("high", { guardedValue: 1 });
    expect(state().presets.high.guardedValue).toBe(1);
    actions().resetBuiltInPresets();
    expect(state().presets.high.guardedValue).toBe(800000);
  });
});

describe("terrain profile actions", () => {
  it("rename rewrites zone references", () => {
    actions().addTerrainProfile();
    const created = state().settings.terrainProfiles.find((profile) => profile.custom)!;
    actions().addZone("neutral");
    const zoneId = state().zones[0].id;
    actions().updateZoneField(zoneId, { layout: created.name });

    actions().updateTerrainProfile(created.name, { name: "my_renamed_profile" });
    expect(state().settings.terrainProfiles.some((profile) => profile.name === "my_renamed_profile")).toBe(true);
    expect(state().zones[0].layout).toBe("my_renamed_profile");
  });

  it("built-in profiles cannot be deleted, custom unused ones can", () => {
    const before = state().settings.terrainProfiles.length;
    actions().deleteTerrainProfile("visual_editor_layout_spawn");
    expect(state().settings.terrainProfiles.length).toBe(before);

    actions().addTerrainProfile();
    const created = state().settings.terrainProfiles.find((profile) => profile.custom)!;
    actions().deleteTerrainProfile(created.name);
    expect(state().settings.terrainProfiles.some((profile) => profile.name === created.name)).toBe(false);
  });
});

describe("custom list actions", () => {
  it("create, rename cascade and delete cascade", () => {
    actions().createCustomList("my_list", "My List");
    expect(state().customObjectLists.my_list).toBeDefined();

    // Reference it from a zone object, then rename: the reference follows
    actions().addZone("neutral");
    const zoneId = state().zones[0].id;
    actions().addObjectToZone(zoneId, {
      id: "my_list", kind: "list", includeList: "my_list", label: "My List", description: "", guarded: true
    });
    expect(state().zones[0].objects.some((obj) => obj.includeList === "my_list")).toBe(true);

    actions().updateCustomList("my_list", { id: "renamed_list" });
    expect(state().customObjectLists.renamed_list).toBeDefined();
    expect(state().zones[0].objects.some((obj) => obj.includeList === "renamed_list")).toBe(true);

    actions().deleteCustomList("renamed_list");
    expect(state().customObjectLists.renamed_list).toBeUndefined();
    expect(state().zones[0].objects.some((obj) => obj.includeList === "renamed_list")).toBe(false);
  });
});

describe("zone object card buttons", () => {
  const addTestObject = () => {
    actions().addZone("neutral");
    const zoneId = state().zones[0].id;
    actions().addObjectToZone(zoneId, {
      id: "chest", kind: "sid", sid: "chest", label: "Chest", description: "", guarded: false
    });
    const obj = state().zones[0].objects.at(-1)!;
    return { zoneId, key: obj.key };
  };

  it("updateObjectField edits flags and clamps count to 1..99", () => {
    const { zoneId, key } = addTestObject();
    actions().updateObjectField(zoneId, key, { count: 250, guarded: true, soloEncounter: true });
    const obj = state().zones[0].objects.find((candidate) => candidate.key === key)!;
    expect(obj.count).toBe(99);
    expect(obj.guarded).toBe(true);
    expect(obj.soloEncounter).toBe(true);

    actions().updateObjectField(zoneId, key, { count: 0 });
    expect(state().zones[0].objects.find((candidate) => candidate.key === key)!.count).toBe(1);
  });

  it("updateObjectField truncates variant and accepts null to clear it", () => {
    const { zoneId, key } = addTestObject();
    actions().updateObjectField(zoneId, key, { variant: 2.9 });
    expect(state().zones[0].objects.find((candidate) => candidate.key === key)!.variant).toBe(2);
    actions().updateObjectField(zoneId, key, { variant: null });
    expect(state().zones[0].objects.find((candidate) => candidate.key === key)!.variant).toBeNull();
  });

  it("removeObjectFromZone deletes the card", () => {
    const { zoneId, key } = addTestObject();
    const before = state().zones[0].objects.length;
    actions().removeObjectFromZone(zoneId, key);
    expect(state().zones[0].objects).toHaveLength(before - 1);
    expect(state().zones[0].objects.some((candidate) => candidate.key === key)).toBe(false);
  });

  it("setZonePosition moves the zone on the canvas", () => {
    actions().addZone("neutral");
    const id = state().zones[0].id;
    actions().setZonePosition(id, 0.25, 0.75);
    expect(state().zones[0].x).toBe(0.25);
    expect(state().zones[0].y).toBe(0.75);
  });
});

describe("preset CRUD buttons", () => {
  it("createPreset clones the source profile and applies the seed", () => {
    actions().createPreset("Cloned High", "high", "high", { guardedValue: 999000 });
    const created = Object.values(state().presets).find((preset) => preset.label === "Cloned High")!;
    expect(created.isCustom).toBe(true);
    expect(created.baseType).toBe("high");
    expect(created.guardedValue).toBe(999000); // seed wins over the clone
    expect(created.objects.length).toBe(state().presets.high.objects.length);
    // Cloned objects must get fresh keys
    const highKeys = new Set(state().presets.high.objects.map((obj) => obj.key));
    expect(created.objects.some((obj) => highKeys.has(obj.key))).toBe(false);
  });

  it("deletePreset retypes zones using it back to the base type; built-ins survive", () => {
    actions().createPreset("Doomed", "medium");
    const created = Object.values(state().presets).find((preset) => preset.label === "Doomed")!;
    actions().addZone(created.id);
    expect(state().zones[0].type).toBe(created.id);

    actions().deletePreset(created.id);
    expect(state().presets[created.id]).toBeUndefined();
    expect(state().zones[0].type).toBe("medium");

    actions().deletePreset("high");
    expect(state().presets.high).toBeDefined();
  });

  it("resetPreset restores a single built-in to factory values", () => {
    actions().updatePreset("medium", { guardedValue: 7 });
    actions().resetPreset("medium");
    expect(state().presets.medium.guardedValue).toBe(400000);
  });

  it("addObjectToPreset / updatePresetObjectField / removeObjectFromPreset edit the preset content", () => {
    actions().createPreset("With Objects", "custom");
    const presetId = Object.values(state().presets).find((preset) => preset.label === "With Objects")!.id;
    actions().addObjectToPreset(presetId, {
      id: "chest", kind: "sid", sid: "chest", label: "Chest", description: "", guarded: false
    });
    const added = state().presets[presetId].objects.at(-1)!;
    expect(added.sid).toBe("chest");

    actions().updatePresetObjectField(presetId, added.key, { count: 3, guarded: true });
    const updated = state().presets[presetId].objects.find((obj) => obj.key === added.key)!;
    expect(updated.count).toBe(3);
    expect(updated.guarded).toBe(true);

    actions().removeObjectFromPreset(presetId, added.key);
    expect(state().presets[presetId].objects.some((obj) => obj.key === added.key)).toBe(false);
  });
});

describe("import passthrough", () => {
  it("detachOriginalLayout drops every imported passthrough field", () => {
    actions().updateSettings({
      originalZoneLayouts: { some_layout: { biomes: [] } },
      originalRawRootFields: { unknownGameField: 42 }
    });
    expect(state().settings.originalRawRootFields).toBeDefined();

    actions().detachOriginalLayout();
    expect(state().settings.originalZoneLayouts).toBeUndefined();
    expect(state().settings.originalContentLists).toBeUndefined();
    expect(state().settings.originalOrientation).toBeUndefined();
    expect(state().settings.originalBorder).toBeUndefined();
    expect(state().settings.originalRawRootFields).toBeUndefined();
  });
});

describe("custom list entry buttons", () => {
  it("add, reweight and remove entries", () => {
    actions().createCustomList("entries_list", "Entries");
    actions().addEntryToCustomList("entries_list", { kind: "sid", value: "chest", weight: 1 });
    actions().addEntryToCustomList("entries_list", { kind: "list", value: "treasury_arts", weight: 2 });
    const list = () => state().customObjectLists.entries_list;
    expect(list().entries).toHaveLength(2);
    expect(list().entries[1].kind).toBe("list");

    actions().updateEntryWeightInCustomList("entries_list", list().entries[0].key, 5);
    expect(list().entries[0].weight).toBe(5);

    actions().removeEntryFromCustomList("entries_list", list().entries[0].key);
    expect(list().entries).toHaveLength(1);
    expect(list().entries[0].value).toBe("treasury_arts");
  });
});

describe("topology wizard and template recipes", () => {
  it("generateTopology builds a connected skeleton for the requested players", () => {
    actions().generateTopology({
      kind: "ring", players: 3, neutralsPerSegment: 2, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true,
      spawnPresetId: "spawn", nearPresetId: "low", midPresetId: "medium",
      farPresetId: "high", centerPresetId: "high"
    });
    const zones = state().zones;
    const spawns = zones.filter((zone) => zone.mainObjects?.some((mo) => mo.type === "Spawn"));
    expect(spawns).toHaveLength(3);
    expect(state().settings.players).toBe(3);
    // 3 players × 2 neutrals per segment + center
    expect(zones).toHaveLength(10);
    expect(state().edges.length).toBeGreaterThanOrEqual(zones.length - 1);
    // No direct player-player edges when isolatePlayers is on
    const spawnIds = new Set(spawns.map((zone) => zone.id));
    expect(state().edges.some((edge) => spawnIds.has(edge.from) && spawnIds.has(edge.to))).toBe(false);
  });

  it("every built-in recipe applies and exports a well-formed template", () => {
    for (const recipe of TEMPLATE_RECIPES) {
      actions().clearWorkspace();
      actions().applyTemplateRecipe(recipe);
      const current = state();
      expect(current.zones.length, recipe.id).toBeGreaterThan(0);
      expect(current.settings.players, recipe.id).toBe(recipe.topology.players);

      const json = generateTemplate(
        current.settings, current.zones, current.edges,
        current.objectLibrary, {}, current.presets, current.customObjectLists
      );
      expect(json.variants[0].zones.length, recipe.id).toBe(current.zones.length);
      expect(json.variants[0].connections?.length ?? 0, recipe.id).toBe(current.edges.length);
      expect(json.sizeX, recipe.id).toBe(current.settings.sizeX);
      // The skeleton must reference only zones that exist
      const names = new Set(json.variants[0].zones.map((zone) => zone.name));
      for (const connection of json.variants[0].connections ?? []) {
        expect(names.has(connection.from), recipe.id).toBe(true);
        expect(names.has(connection.to), recipe.id).toBe(true);
      }
    }
  });

  it("generateTopology places the requested neutral cities per player and in the center", () => {
    actions().generateTopology({
      kind: "ring", players: 2, neutralsPerSegment: 3, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true,
      spawnPresetId: "spawn", nearPresetId: "low", midPresetId: "medium",
      farPresetId: "high", centerPresetId: "high",
      extraCitiesPerPlayer: 1, extraCitiesInCenter: 1
    });
    const zones = state().zones;
    const cities = zones.flatMap((zone) => (zone.mainObjects || []).filter((mo) => mo.type === "City"));
    expect(cities).toHaveLength(3);
    expect(cities.filter((city) => city.factionMode === "spawn")).toHaveLength(2);
    const center = zones.find((zone) => zone.type === "high")!;
    expect(center.mainObjects!.filter((mo) => mo.type === "City")).toHaveLength(1);
    expect(center.mainObjects!.find((mo) => mo.type === "City")!.factionMode).toBe("random");
  });

  it("generateTopology without city options stays city-free", () => {
    actions().generateTopology({
      kind: "chain", players: 2, neutralsPerSegment: 3, extraNeutrals: 0,
      centerZone: false, isolatePlayers: true,
      spawnPresetId: "spawn", nearPresetId: "low", midPresetId: "medium",
      farPresetId: "high", centerPresetId: "high"
    });
    const cities = state().zones.flatMap((zone) => (zone.mainObjects || []).filter((mo) => mo.type === "City"));
    expect(cities).toHaveLength(0);
  });

  it("duel recipes add extra neutral cities on each player's side", () => {
    const duel = TEMPLATE_RECIPES.find((recipe) => recipe.id === "duel")!;
    expect(duel.extraCitiesPerPlayer).toBe(1);
    actions().applyTemplateRecipe(duel);

    const zones = state().zones;
    const spawnZoneOf = new Map(
      zones.filter((zone) => zone.mainObjects?.some((mo) => mo.type === "Spawn"))
        .map((zone) => [zone.id, zone])
    );
    const cityZones = zones.filter((zone) => zone.mainObjects?.some((mo) => mo.type === "City"));
    // One city per player, never in a spawn zone, each in a different zone
    expect(cityZones).toHaveLength(2);
    for (const zone of cityZones) {
      expect(spawnZoneOf.has(zone.id)).toBe(false);
      const city = zone.mainObjects!.find((mo) => mo.type === "City")!;
      // The first city matches the owner player's faction via their spawn
      expect(city.factionMode).toBe("spawn");
      expect(spawnZoneOf.has(city.factionSource!)).toBe(true);
      expect(city.guardValue).toBeGreaterThan(0);
    }
    // The two cities belong to different players
    const sources = cityZones.map((zone) => zone.mainObjects!.find((mo) => mo.type === "City")!.factionSource);
    expect(new Set(sources).size).toBe(2);
  });

  it("deeper duels spread several cities across different zones", () => {
    const march = TEMPLATE_RECIPES.find((recipe) => recipe.id === "duelMarch")!;
    expect(march.extraCitiesPerPlayer).toBe(2);
    actions().applyTemplateRecipe(march);
    const withCities = state().zones.filter((zone) => zone.mainObjects?.some((mo) => mo.type === "City"));
    // 2 per player in 4 distinct zones
    expect(withCities).toHaveLength(4);
    const cities = withCities.flatMap((zone) => zone.mainObjects!.filter((mo) => mo.type === "City"));
    expect(cities.filter((city) => city.factionMode === "spawn")).toHaveLength(2);
    expect(cities.filter((city) => city.factionMode === "random")).toHaveLength(2);
  });

  it("the Jebus recipe puts random-faction cities into the center", () => {
    const jebus = TEMPLATE_RECIPES.find((recipe) => recipe.id === "duelJebus")!;
    expect(jebus.extraCitiesInCenter).toBe(2);
    actions().applyTemplateRecipe(jebus);
    const center = state().zones.find((zone) => zone.type === "high")!;
    const cities = center.mainObjects!.filter((mo) => mo.type === "City");
    expect(cities).toHaveLength(2);
    for (const city of cities) expect(city.factionMode).toBe("random");
    // Buffers stay city-free — that is the Jebus identity
    const others = state().zones.filter((zone) => zone.id !== center.id);
    expect(others.every((zone) => !zone.mainObjects?.some((mo) => mo.type === "City"))).toBe(true);
  });

  it("the arena recipe places a GladiatorArena in the central zone", () => {
    const arenaRecipe = TEMPLATE_RECIPES.find((recipe) => recipe.arenaInCenter);
    expect(arenaRecipe).toBeDefined();
    actions().applyTemplateRecipe(arenaRecipe!);
    const withArena = state().zones.filter(
      (zone) => zone.mainObjects?.some((mo) => mo.type === "GladiatorArena")
    );
    expect(withArena).toHaveLength(1);
  });
});

describe("variant actions", () => {
  it("adding and switching variants keeps per-variant zones", () => {
    actions().addZone("spawn");
    expect(state().zones).toHaveLength(1);
    actions().addVariant();
    expect(state().variants).toHaveLength(2);
    // The new variant starts empty
    expect(state().zones).toHaveLength(0);
    actions().setActiveVariant(state().variants[0].id);
    expect(state().zones).toHaveLength(1);
  });
});
