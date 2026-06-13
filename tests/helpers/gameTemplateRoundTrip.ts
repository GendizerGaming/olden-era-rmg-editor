import fs from "node:fs";
import path from "node:path";
import { importTemplateFromJson } from "../../src/services/jsonImporter.ts";
import { generateTemplate } from "../../src/services/jsonGenerator.ts";
import { defaultPresets } from "../../src/store/useEditorStore.ts";
import type {
  CatalogItem,
  Faction,
  MapSettings
} from "../../src/types/editor.ts";
import type { RmgTemplate } from "../../src/types/rmg.ts";

export const DEFAULT_GAME_TEMPLATES_DIRECTORY =
  "D:\\SteamLibrary\\steamapps\\common\\Heroes of Might and Magic Olden Era" +
  "\\HeroesOldenEra_Data\\StreamingAssets\\map_templates";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface TemplateConnection {
  connectionType?: string;
}

interface TemplateVariant {
  connections?: TemplateConnection[];
}

interface TemplateShape {
  variants?: TemplateVariant[];
}

export interface TemplateSupportAnalysis {
  supported: boolean;
  reasons: string[];
}

export interface JsonDifference {
  actual?: JsonValue;
  expected?: JsonValue;
  path: string;
  type: "missing" | "extra" | "value" | "type";
}

type ImportedTemplate = ReturnType<typeof importTemplateFromJson>;

const importedSettingsDefaults: MapSettings = {
  name: "Imported RMG Template",
  description: "",
  sizeX: 128,
  sizeZ: 128,
  players: 2,
  victoryMode: "classic",
  victoryCityZoneId: "",
  victoryDays: 3,
  singleHero: false,
  desertionEnabled: false,
  desertionDay: 3,
  desertionValue: 3000,
  heroLightingEnabled: false,
  heroLightingDay: 1,
  heroLimitMode: "fixed",
  heroMin: 1,
  heroMax: 12,
  heroIncrement: 1,
  singleHeroMode: false,
  heroHireBan: false,
  encounterHoles: false,
  factionLawsExpModifier: 1,
  astrologyExpModifier: 1,
  fixedOrientation: false,
  preserveLayout: false,
  orientationAnchor: "",
  borderWaterWidth: 0,
  borderCornerRadius: 0,
  bannedItems: [],
  bannedSpells: [],
  bannedHeroes: [],
  startingBonuses: [],
  valueOverrides: [],
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
  tournamentAnnounceDays: [7, 14, 21],
  terrainProfiles: []
};

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueType(value: JsonValue): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

export function resolveGameTemplatesDirectory(): string | null {
  const configuredPath = process.env.OLDEN_ERA_TEMPLATES_DIR?.trim();
  const candidates = configuredPath
    ? [configuredPath]
    : [DEFAULT_GAME_TEMPLATES_DIRECTORY];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function readTemplate(
  templatesDirectory: string,
  templateName: string
): RmgTemplate {
  const templatePath = path.join(templatesDirectory, templateName);
  return JSON.parse(fs.readFileSync(templatePath, "utf8")) as RmgTemplate;
}

export function importTemplateForRoundTrip(
  template: RmgTemplate,
  objectLibrary: CatalogItem[] = [],
  factions: Faction[] = []
): ImportedTemplate {
  return importTemplateFromJson(template, objectLibrary, factions);
}

export function exportImportedTemplate(
  imported: ImportedTemplate
): RmgTemplate {
  const settings: MapSettings = {
    ...importedSettingsDefaults,
    ...imported.settings
  };

  const extraVariants = imported.variants.slice(1).map((variant) => ({
    zones: variant.zones,
    edges: variant.edges,
    fixedOrientation: variant.fixedOrientation,
    orientationAnchor: variant.orientationAnchor,
    preserveLayout: variant.preserveLayout,
    originalOrientation: variant.originalOrientation,
    borderWaterWidth: variant.borderWaterWidth,
    borderCornerRadius: variant.borderCornerRadius,
    originalBorder: variant.originalBorder
  }));

  return generateTemplate(
    settings,
    imported.zones,
    imported.edges,
    [],
    {},
    defaultPresets,
    imported.customObjectLists,
    extraVariants
  );
}

export function roundTripTemplate(template: RmgTemplate): RmgTemplate {
  return exportImportedTemplate(importTemplateForRoundTrip(template));
}

const ignoredEditorStateKeys = new Set([
  "importedObjects",
  "key",
  "rawFields",
  "rawMandatoryContent",
  "x",
  "y"
]);

function normalizeEditorValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(normalizeEditorValue)
      .filter((item): item is JsonValue => item !== undefined);
  }

  if (typeof value !== "object" || value === undefined) {
    return undefined;
  }

  const normalized: Record<string, JsonValue> = {};
  for (const [key, propertyValue] of Object.entries(value)) {
    if (ignoredEditorStateKeys.has(key) || key.startsWith("original")) {
      continue;
    }

    const normalizedValue = normalizeEditorValue(propertyValue);
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue;
    }
  }
  return normalized;
}

export function normalizeImportedEditorState(
  imported: ImportedTemplate
): JsonValue {
  return (
    normalizeEditorValue({
      settings: imported.settings,
      zones: imported.zones,
      edges: imported.edges,
      variants: imported.variants,
      customObjectLists: imported.customObjectLists ?? {}
    }) ?? null
  );
}

export function analyzeTemplateSupport(
  template: TemplateShape
): TemplateSupportAnalysis {
  const reasons: string[] = [];
  const variants = Array.isArray(template.variants) ? template.variants : [];

  if (variants.length === 0) {
    reasons.push(`variants:${variants.length}`);
  }

  const supportedConnectionTypes = new Set([
    "Default",
    "Direct",
    "Portal",
    "Proximity",
    "GladiatorArena"
  ]);
  const unsupportedConnectionTypes = new Set<string>();
  for (const variant of variants) {
    for (const connection of variant.connections ?? []) {
      const connectionType = connection.connectionType ?? "(missing)";
      if (!supportedConnectionTypes.has(connectionType)) {
        unsupportedConnectionTypes.add(connectionType);
      }
    }
  }

  if (unsupportedConnectionTypes.size > 0) {
    reasons.push(
      `connections:${[...unsupportedConnectionTypes].sort().join(",")}`
    );
  }

  return {
    supported: reasons.length === 0,
    reasons
  };
}

export function findJsonDifferences(
  expected: JsonValue,
  actual: JsonValue,
  currentPath = "$",
  differences: JsonDifference[] = [],
  limit = 30
): JsonDifference[] {
  if (differences.length >= limit) return differences;

  const expectedType = valueType(expected);
  const actualType = valueType(actual);
  if (expectedType !== actualType) {
    differences.push({
      path: currentPath,
      type: "type",
      expected,
      actual
    });
    return differences;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index += 1) {
      const itemPath = `${currentPath}[${index}]`;
      if (index >= expected.length) {
        differences.push({
          path: itemPath,
          type: "extra",
          actual: actual[index]
        });
      } else if (index >= actual.length) {
        differences.push({
          path: itemPath,
          type: "missing",
          expected: expected[index]
        });
      } else {
        findJsonDifferences(
          expected[index],
          actual[index],
          itemPath,
          differences,
          limit
        );
      }
      if (differences.length >= limit) break;
    }
    return differences;
  }

  if (isRecord(expected) && isRecord(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) {
      const propertyPath = `${currentPath}.${key}`;
      if (!(key in actual)) {
        differences.push({
          path: propertyPath,
          type: "missing",
          expected: expected[key]
        });
      } else if (!(key in expected)) {
        differences.push({
          path: propertyPath,
          type: "extra",
          actual: actual[key]
        });
      } else {
        findJsonDifferences(
          expected[key],
          actual[key],
          propertyPath,
          differences,
          limit
        );
      }
      if (differences.length >= limit) break;
    }
    return differences;
  }

  if (!Object.is(expected, actual)) {
    differences.push({
      path: currentPath,
      type: "value",
      expected,
      actual
    });
  }

  return differences;
}

export function formatJsonDifferences(differences: JsonDifference[]): string {
  return differences
    .map((difference) => {
      const expected = JSON.stringify(difference.expected);
      const actual = JSON.stringify(difference.actual);
      return `${difference.type} ${difference.path}: expected=${expected}, actual=${actual}`;
    })
    .join("\n");
}

export function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
