import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import { generateTemplate } from "../src/services/jsonGenerator.ts";
import { importTemplateFromJson } from "../src/services/jsonImporter.ts";
import { resolveSavedObjects } from "../src/store/normalizers.ts";
import type { RmgRoad } from "../src/types/rmg.ts";
import type { CatalogItem } from "../src/types/editor.ts";
import type { SavedZoneObject } from "../src/store/types.ts";

/**
 * Intra-zone roads: the editor authors `zone.roads[]` segments. A connection
 * road draws one surface in the game, so editing a connection-road's surface
 * mirrors onto the connection's roadType (the generator then rewrites the
 * matching segments). Authored roads must survive export.
 */

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();

beforeEach(() => {
  actions().clearWorkspace();
});

function twoConnectedZones() {
  actions().addZone("spawn");
  actions().addZone("spawn");
  const [a, b] = state().zones.map((zone) => zone.id);
  actions().connectZones(a, b, "Direct");
  return { a, b, edgeId: state().edges[0].id };
}

describe("zone roads", () => {
  it("setZoneRoads replaces the zone's roads", () => {
    const { a } = twoConnectedZones();
    const roads: RmgRoad[] = [{ type: "Stone", from: { type: "MainObject", args: ["0"] }, to: { type: "Crossroads" } }];
    actions().setZoneRoads(a, roads);

    const zone = state().zones.find((z) => z.id === a)!;
    expect(zone.roads).toHaveLength(1);
    expect(zone.roads![0].from).toEqual({ type: "MainObject", args: ["0"] });
    expect(zone.roads![0].to).toEqual({ type: "Crossroads" });
  });

  it("mirrors a connection road's surface onto the connection's roadType", () => {
    const { a, edgeId } = twoConnectedZones();
    actions().setZoneRoads(a, [{ type: "Dirt", from: { type: "Crossroads" }, to: { type: "Connection", args: [edgeId] } }]);
    expect(state().edges.find((e) => e.id === edgeId)!.roadType).toBe("Dirt");

    // Switching the same road to auto/untyped clears the derived roadType.
    actions().setZoneRoads(a, [{ from: { type: "Crossroads" }, to: { type: "Connection", args: [edgeId] } }]);
    expect(state().edges.find((e) => e.id === edgeId)!.roadType).toBeUndefined();
  });

  it("authored roads survive export", () => {
    const { a, edgeId } = twoConnectedZones();
    actions().setZoneRoads(a, [{ type: "Stone", from: { type: "MainObject", args: ["0"] }, to: { type: "Connection", args: [edgeId] } }]);

    const s = state();
    const json = generateTemplate(s.settings, s.zones, s.edges, s.objectLibrary, {}, s.presets, s.customObjectLists);
    const zoneA = json.variants[0].zones.find((zone) => zone.name === a);
    const road = (zoneA?.roads ?? []).find((r) => r.to?.type === "Connection");
    expect(road).toBeDefined();
    expect(road?.from).toEqual({ type: "MainObject", args: ["0"] });
    expect(road?.type).toBe("Stone");
  });
});

describe("mandatory object names", () => {
  it("import captures an entry name only when a road targets it", () => {
    const template = {
      name: "T", gameMode: "Classic", sizeX: 128, sizeZ: 128,
      mandatoryContent: [
        { name: "mc_A", content: [
          { name: "my_mine", sid: "mine_gold", isMine: true },
          { name: "name_a_2_noise", sid: "chest" }
        ] }
      ],
      variants: [{
        zones: [{
          name: "A", size: 1, mandatoryContent: ["mc_A"],
          roads: [{ type: "Dirt", from: { type: "Crossroads" }, to: { type: "MandatoryContent", args: ["my_mine"] } }]
        }],
        connections: []
      }]
    };
    const imported = importTemplateFromJson(template as never, [], []);
    const objects = imported.zones[0].objects;
    // Road-referenced name is kept verbatim so the road still resolves.
    expect(objects.find((o) => o.sid === "mine_gold")?.name).toBe("my_mine");
    // A non-road-referenced object stays unnamed (no positional noise surfaced).
    expect(objects.find((o) => o.sid === "chest")?.name).toBeUndefined();
  });

  it("normalization (import → store) preserves the object name", () => {
    const catalog: CatalogItem[] = [{ id: "mine_gold", sid: "mine_gold", kind: "sid", label: "Gold Mine", description: "", guarded: false } as CatalogItem];
    const saved: SavedZoneObject = { kind: "sid", sid: "mine_gold", name: "my_mine", count: 1 } as SavedZoneObject;
    const result = resolveSavedObjects([saved], catalog, []);
    expect(result[0]?.name).toBe("my_mine");
  });

  it("an added object is unnamed until used as a road target, then setZoneRoads names it", () => {
    actions().clearWorkspace();
    actions().addZone("neutral");
    const zoneId = state().zones[0].id;
    const mine: CatalogItem = { id: "mine_gold", sid: "mine_gold", kind: "sid", label: "Gold Mine", description: "", guarded: false, isMine: true } as CatalogItem;
    actions().addObjectToZone(zoneId, mine);
    const added = state().zones.find((z) => z.id === zoneId)!.objects.at(-1)!;
    expect(added.name).toBeUndefined();

    // Picking it as a road endpoint assigns a name + sets the road atomically.
    actions().setZoneRoads(
      zoneId,
      [{ type: "Dirt", from: { type: "Crossroads" }, to: { type: "MandatoryContent", args: ["mine_gold"] } }],
      { [added.key]: "mine_gold" }
    );
    const zone = state().zones.find((z) => z.id === zoneId)!;
    expect(zone.objects.find((o) => o.key === added.key)?.name).toBe("mine_gold");
    expect(zone.roads?.[0]?.to).toEqual({ type: "MandatoryContent", args: ["mine_gold"] });
  });
});
