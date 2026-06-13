import { describe, expect, it } from "vitest";
import {
  createTemplateDocument,
  createVisualDesignDocument,
  type TemplateDocumentSource
} from "../src/services/editorDocuments.ts";
import type {
  CustomObjectList,
  MapSettings,
  Preset,
  Zone
} from "../src/types/editor.ts";

const settings: MapSettings = {
  name: "Custom: Export/Test",
  description: "Export regression fixture",
  sizeX: 80,
  sizeZ: 80,
  players: 0,
  victoryMode: "classic",
  victoryCityZoneId: "",
  victoryDays: 3,
  singleHero: false,
  desertionEnabled: true,
  desertionDay: 3,
  desertionValue: 3000,
  heroLightingEnabled: true,
  heroLightingDay: 1,
  heroLimitMode: "fixed",
  heroMin: 1,
  heroMax: 8,
  heroIncrement: 0,
  fixedOrientation: false,
  preserveLayout: false,
  orientationAnchor: "",
  language: "en",
  gladiatorArenaEnabled: false,
  gladiatorArenaDaysDelayStart: 30,
  gladiatorArenaCountDay: 3,
  gladiatorArenaRegistrationStartFight: true,
  gladiatorArenaChampionRule: "StartHero",
  tournamentEnabled: false,
  tournamentPointsToWin: 2,
  tournamentSaveArmy: true,
  tournamentDays: [3, 3, 3],
  tournamentAnnounceDays: [7, 14, 21]
};

const neutralPreset: Preset = {
  id: "neutral",
  label: "N",
  baseType: "neutral",
  guardedValue: 0,
  unguardedValue: 0,
  resourcesValue: 0,
  objects: [],
  isCustom: false
};

const zone: Zone = {
  id: "Neutral-1",
  label: "N1",
  type: "neutral",
  x: 0.5,
  y: 0.5,
  size: 1,
  biomeMode: "specific",
  biomeSource: "",
  biomeId: "Sand",
  mainObjects: [],
  guardedValue: 0,
  unguardedValue: 0,
  resourcesValue: 0,
  objects: []
};

const customObjectLists: Record<string, CustomObjectList> = {
  nested_rewards: {
    id: "nested_rewards",
    label: "Nested rewards",
    entries: [
      {
        key: "nested-entry",
        kind: "sid",
        value: "watchtower",
        weight: 25
      }
    ]
  },
  custom_rewards: {
    id: "custom_rewards",
    label: "Custom rewards",
    entries: [
      {
        key: "sid-entry",
        kind: "sid",
        value: "mana_well",
        weight: 75
      },
      {
        key: "list-entry",
        kind: "list",
        value: "nested_rewards",
        weight: 25
      }
    ]
  }
};

const source: TemplateDocumentSource = {
  settings,
  zones: [zone],
  edges: [],
  objectLibrary: [],
  artifactLists: {},
  presets: { neutral: neutralPreset },
  customObjectLists
};

describe("editor documents", () => {
  it("includes custom object lists in exported template JSON", () => {
    const document = createTemplateDocument(source);
    const parsed = JSON.parse(document.json);
    const customRewards = parsed.contentLists.find(
      (list: { name: string }) => list.name === "custom_rewards"
    );

    expect(customRewards).toEqual({
      name: "custom_rewards",
      content: [
        { sid: "mana_well", weight: 75 },
        { includeLists: ["nested_rewards"], weight: 25 }
      ]
    });
  });

  it("uses deterministic output for template preview and download", () => {
    const previewDocument = createTemplateDocument(source);
    const downloadDocument = createTemplateDocument(source);

    expect(previewDocument.json).toBe(downloadDocument.json);
    expect(previewDocument.value).toEqual(downloadDocument.value);
    expect(previewDocument.filename).toBe("Custom- Export-Test.rmg.json");
    expect(previewDocument.json.endsWith("\n")).toBe(true);
  });

  it("uses the same document conventions for visual design export", () => {
    const document = createVisualDesignDocument({
      settings,
      zones: source.zones,
      edges: source.edges,
      presets: source.presets,
      customObjectLists
    });
    const parsed = JSON.parse(document.json);

    expect(document.filename).toBe("Custom- Export-Test.visual-design.json");
    expect(parsed.version).toBe(3);
    expect(parsed.customObjectLists).toEqual(customObjectLists);
    expect(document.json.endsWith("\n")).toBe(true);
  });
});
