import { describe, expect, it } from "vitest";
import { resolveSavedObjects } from "../src/store/normalizers.ts";
import { rebuildObjectLibraryLookupMap } from "../src/store/catalog.ts";
import { useEditorStore } from "../src/store/useEditorStore.ts";
import type { CatalogItem, CoreCatalog, CustomObjectList } from "../src/types/editor.ts";

const library: CatalogItem[] = [
  {
    id: "windmill",
    sid: "windmill",
    kind: "sid",
    label: "Windmill",
    description: "",
    guarded: false,
    tag: "Interact"
  },
  {
    id: "core_list",
    kind: "list",
    includeList: "core_list",
    label: "Core list",
    description: "",
    guarded: true
  }
];

const customLists: Record<string, CustomObjectList> = {
  my_artifacts: {
    id: "my_artifacts",
    label: "My artifacts",
    entries: [{ key: "e1", kind: "sid", value: "windmill", weight: 1 }]
  }
};

describe("custom list references survive catalog resolution", () => {
  it("keeps custom-list objects and only reports truly unknown references", () => {
    rebuildObjectLibraryLookupMap(library);
    const missing: string[] = [];
    const resolved = resolveSavedObjects(
      [
        { kind: "list", includeList: "my_artifacts", guarded: true, count: 2 },
        { kind: "list", includeList: "core_list", guarded: true },
        { kind: "sid", sid: "windmill", guarded: false },
        { kind: "sid", sid: "ghost_object", guarded: false }
      ],
      library,
      missing,
      customLists
    );

    expect(resolved.map((obj) => obj.includeList ?? obj.sid)).toEqual([
      "my_artifacts",
      "core_list",
      "windmill"
    ]);
    const customListObject = resolved[0];
    expect(customListObject.kind).toBe("list");
    expect(customListObject.label).toBe("My artifacts");
    expect(customListObject.count).toBe(2);
    expect(customListObject.guarded).toBe(true);
    expect(missing).toEqual(["ghost_object"]);
  });

  it("importDesign with a loaded catalog keeps zone objects referencing the design's custom lists", () => {
    rebuildObjectLibraryLookupMap(library);
    useEditorStore.setState({
      coreCatalog: { objects: library } as unknown as CoreCatalog,
      objectLibrary: library,
      missingImportedObjects: []
    });

    useEditorStore.getState().actions.importDesign({
      settings: { name: "Custom lists test" },
      zones: [
        {
          id: "spawn-1",
          type: "spawn",
          x: 0.3,
          y: 0.5,
          objects: [
            { kind: "list", includeList: "duel_artifacts", guarded: true },
            { kind: "sid", sid: "windmill", guarded: false }
          ]
        }
      ],
      edges: [],
      customObjectLists: {
        duel_artifacts: {
          id: "duel_artifacts",
          label: "Duel artifacts",
          entries: [{ key: "e1", kind: "sid", value: "windmill", weight: 1 }]
        }
      }
    });

    const state = useEditorStore.getState();
    expect(Object.keys(state.customObjectLists)).toContain("duel_artifacts");
    const zone = state.zones.find((candidate) => candidate.id === "spawn-1");
    expect(zone).toBeDefined();
    expect(zone!.objects.map((obj) => obj.includeList ?? obj.sid)).toEqual([
      "duel_artifacts",
      "windmill"
    ]);
    expect(state.missingImportedObjects).toEqual([]);
  });
});
