import { BIOME_MODES, PRESET_BASE_TYPES, CORE_CATALOG_VERSION } from '../types/editor';
import type { MapSettings, BiomeMode, Preset, CoreCatalog, CustomObjectListEntry } from '../types/editor';
import type { StoredRecord, SavedZoneObject, SavedPreset, SavedCustomObjectList, SavedDesign, SavedVariant, SavedZone, SavedEdge } from './types';

export function isStoredRecord(value: unknown): value is StoredRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function storedRecordArray<T extends StoredRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(isStoredRecord) as T[] : [];
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function isPresetBaseType(value: unknown): value is Preset["baseType"] {
  return (
    typeof value === "string" &&
    (PRESET_BASE_TYPES as readonly string[]).includes(value)
  );
}

export function isBiomeMode(value: unknown): value is BiomeMode {
  return (
    typeof value === "string" &&
    (BIOME_MODES as readonly string[]).includes(value)
  );
}

export function parseLocalizedText(
  value: unknown
): { ru: string; en: string } | undefined {
  if (!isStoredRecord(value)) return undefined;
  return typeof value.ru === "string" && typeof value.en === "string"
    ? { ru: value.ru, en: value.en }
    : undefined;
}

export function parseSavedZoneObject(value: unknown): SavedZoneObject | null {
  if (!isStoredRecord(value)) return null;
  const kind = value.kind === "sid" || value.kind === "list"
    ? value.kind
    : undefined;
  const variant =
    typeof value.variant === "number" ||
    typeof value.variant === "string" ||
    value.variant === null
      ? value.variant
      : undefined;

  return {
    key: optionalString(value.key),
    id: optionalString(value.id),
    sid: optionalString(value.sid),
    includeList: optionalString(value.includeList),
    label: optionalString(value.label),
    description: optionalString(value.description),
    labelByLang: parseLocalizedText(value.labelByLang),
    descriptionByLang: parseLocalizedText(value.descriptionByLang),
    kind,
    guarded: optionalBoolean(value.guarded),
    count: optionalNumber(value.count),
    soloEncounter: optionalBoolean(value.soloEncounter),
    variant,
    roadDistance: optionalString(value.roadDistance),
    townDistance: optionalString(value.townDistance),
    isMine: optionalBoolean(value.isMine),
    tag: optionalString(value.tag),
    category: optionalString(value.category),
    rarity: optionalString(value.rarity),
    sizeX: optionalNumber(value.sizeX),
    sizeZ: optionalNumber(value.sizeZ)
  };
}

export function parseSavedPreset(value: unknown): SavedPreset | null {
  if (!isStoredRecord(value)) return null;
  if (value.baseType !== undefined && !isPresetBaseType(value.baseType)) {
    return null;
  }
  if (value.biomeMode !== undefined && !isBiomeMode(value.biomeMode)) {
    return null;
  }
  if (value.objects !== undefined && !Array.isArray(value.objects)) {
    return null;
  }
  const objects = value.objects?.map(parseSavedZoneObject);
  if (objects?.some((object) => object === null)) {
    return null;
  }

  return {
    id: optionalString(value.id),
    label: optionalString(value.label),
    baseType: value.baseType,
    guardedValue: optionalNumber(value.guardedValue),
    unguardedValue: optionalNumber(value.unguardedValue),
    resourcesValue: optionalNumber(value.resourcesValue),
    objects: objects as SavedZoneObject[] | undefined,
    isCustom: optionalBoolean(value.isCustom),
    biomeMode: value.biomeMode,
    biomeSource: optionalString(value.biomeSource),
    biomeId: optionalString(value.biomeId)
  };
}

export function parseSavedPresetRecord(
  value: unknown
): Record<string, SavedPreset> | null {
  if (!isStoredRecord(value)) return null;
  const result: Record<string, SavedPreset> = {};
  for (const [key, presetValue] of Object.entries(value)) {
    const preset = parseSavedPreset(presetValue);
    if (!preset) return null;
    result[key] = preset;
  }
  return result;
}

export function parseSavedCustomList(value: unknown): SavedCustomObjectList | null {
  if (!isStoredRecord(value)) return null;
  if (value.entries !== undefined && !Array.isArray(value.entries)) {
    return null;
  }
  const entries = value.entries?.map((entry) => {
    if (!isStoredRecord(entry)) return null;
    return {
      key: optionalString(entry.key),
      kind: entry.kind === "sid" || entry.kind === "list" ? entry.kind : undefined,
      value: optionalString(entry.value),
      weight: optionalNumber(entry.weight)
    };
  });
  if (entries?.some((entry) => entry === null)) {
    return null;
  }
  return {
    id: optionalString(value.id),
    label: optionalString(value.label),
    entries: entries as Array<Partial<CustomObjectListEntry>> | undefined
  };
}

export function parseSavedCustomListRecord(
  value: unknown
): Record<string, SavedCustomObjectList> | null {
  if (!isStoredRecord(value)) return null;
  const result: Record<string, SavedCustomObjectList> = {};
  for (const [key, listValue] of Object.entries(value)) {
    const list = parseSavedCustomList(listValue);
    if (!list) return null;
    result[key] = list;
  }
  return result;
}

export function parseSavedVariant(value: unknown): SavedVariant | null {
  if (!isStoredRecord(value)) return null;
  if (!Array.isArray(value.zones) || !Array.isArray(value.edges)) return null;
  return {
    id: optionalString(value.id),
    zones: storedRecordArray<SavedZone>(value.zones),
    edges: storedRecordArray<SavedEdge>(value.edges),
    fixedOrientation: optionalBoolean(value.fixedOrientation),
    orientationAnchor: optionalString(value.orientationAnchor),
    preserveLayout: optionalBoolean(value.preserveLayout),
    originalOrientation: isStoredRecord(value.originalOrientation)
      ? (value.originalOrientation as SavedVariant['originalOrientation'])
      : undefined,
    borderWaterWidth: optionalNumber(value.borderWaterWidth),
    borderCornerRadius: optionalNumber(value.borderCornerRadius),
    originalBorder: isStoredRecord(value.originalBorder)
      ? (value.originalBorder as SavedVariant['originalBorder'])
      : undefined
  };
}

export function parseSavedDesign(value: unknown): SavedDesign | null {
  if (!isStoredRecord(value)) return null;
  const zones = storedRecordArray<SavedZone>(value.zones);
  const edges = storedRecordArray<SavedEdge>(value.edges);
  if (!Array.isArray(value.zones) || !Array.isArray(value.edges)) return null;

  const presets =
    value.presets === undefined ? undefined : parseSavedPresetRecord(value.presets);
  if (presets === null) return null;
  const customObjectLists =
    value.customObjectLists === undefined
      ? undefined
      : parseSavedCustomListRecord(value.customObjectLists);
  if (customObjectLists === null) return null;

  let variants: SavedVariant[] | undefined;
  if (value.variants !== undefined) {
    if (!Array.isArray(value.variants)) return null;
    const parsed = value.variants.map(parseSavedVariant);
    if (parsed.some((variant) => variant === null)) return null;
    variants = parsed as SavedVariant[];
  }

  return {
    settings: isStoredRecord(value.settings)
      ? value.settings as Partial<MapSettings>
      : undefined,
    zones,
    edges,
    nextZoneNumber:
      typeof value.nextZoneNumber === "number" ? value.nextZoneNumber : undefined,
    presets,
    customObjectLists,
    variants,
    activeVariantId: optionalString(value.activeVariantId)
  };
}

export function isCoreCatalog(value: unknown): value is CoreCatalog {
  if (!isStoredRecord(value)) return false;
  return (
    value.version === CORE_CATALOG_VERSION &&
    typeof value.generatedAt === "string" &&
    Array.isArray(value.objects) &&
    Array.isArray(value.factions) &&
    // Catalogs cached before heroes/spells/units were extracted are stale and
    // must be rebuilt from Core.zip.
    Array.isArray(value.heroes) &&
    Array.isArray(value.spells) &&
    Array.isArray(value.units) &&
    Array.isArray(value.heroStatNames) &&
    Array.isArray(value.builtInPoolNames) &&
    isStoredRecord(value.artifactLists) &&
    isStoredRecord(value.stats)
  );
}
