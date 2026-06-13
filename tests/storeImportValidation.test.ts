import { describe, expect, it } from "vitest";
import { useEditorStore } from "../src/store/useEditorStore.ts";

describe("saved editor data validation", () => {
  it("rejects an unsupported preset base type", () => {
    expect(() => {
      useEditorStore.getState().actions.importPresets({
        unsupported: {
          id: "unsupported",
          label: "Unsupported",
          baseType: "future-zone-type",
          objects: []
        }
      });
    }).toThrow(/unsupported or malformed/i);
  });

  it("rejects a preset whose objects field is not an array", () => {
    expect(() => {
      useEditorStore.getState().actions.importPresets({
        malformed: {
          id: "malformed",
          label: "Malformed",
          baseType: "custom",
          objects: "not-an-array"
        }
      });
    }).toThrow(/unsupported or malformed/i);
  });

  it("rejects malformed custom lists in a visual design", () => {
    expect(() => {
      useEditorStore.getState().actions.importDesign({
        zones: [],
        edges: [],
        customObjectLists: {
          malformed: {
            id: "malformed",
            label: "Malformed",
            entries: "not-an-array"
          }
        }
      });
    }).toThrow(/формат/i);
  });
});
