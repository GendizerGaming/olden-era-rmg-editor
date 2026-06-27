import type { MapSettings, CatalogItem, ContentLimitPreset, Faction, TerrainProfile, ZoneType } from '../types/editor';
import type { DefaultPresetDefinition } from './types';
import { rebuildObjectLibraryLookupMap } from './catalog';

/**
 * The six terrain profiles the editor has always exported for its zone
 * types. Returned as fresh copies so store updates can mutate freely.
 * The reward/pickup distribution fields ride in rawFields: they are not
 * editable yet, but must keep their historical exported values.
 */
export function defaultTerrainProfiles(): TerrainProfile[] {
  const profile = (name: string, obstaclesFill: number, lakesFill: number, roadClusterArea: number): TerrainProfile => ({
    name,
    obstaclesFill,
    obstaclesFillVoid: Math.min(0.5, obstaclesFill + 0.06),
    lakesFill,
    minLakeArea: 8,
    elevationClusterScale: 0.1,
    elevationModes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0 }],
    roadClusterArea,
    rawFields: {
      guardedEncounterResourceFractions: { countBounds: [], fractions: [0.55] },
      ambientPickupDistribution: {
        repulsion: 1,
        noise: 0.3,
        roadAttraction: -0.25,
        obstacleAttraction: 0,
        groupSizeWeights: [20, 2, 1]
      }
    }
  });
  return [
    profile("visual_editor_layout_spawn", 0.42, 0.2, 80),
    profile("visual_editor_layout_blank", 0.34, 0.16, 80),
    profile("visual_editor_layout_low", 0.36, 0.18, 80),
    profile("visual_editor_layout_medium", 0.34, 0.18, 88),
    profile("visual_editor_layout_high", 0.34, 0.14, 88),
    profile("visual_editor_layout_neutral", 0.34, 0.16, 80)
  ];
}

const builtInProfileNames = new Set(defaultTerrainProfiles().map((profile) => profile.name));

/**
 * Built-in profiles back the zone types' "Auto" terrain option: they are
 * always present in the list, cannot be deleted or renamed, and their values
 * (user-editable) survive imports and workspace clears.
 */
export function isBuiltInProfileName(name: string): boolean {
  return builtInProfileNames.has(name);
}

/**
 * The two empty cap lists the editor has always referenced from its zones
 * ("Auto" content limits by zone type). Officials reuse the same names, in
 * which case the imported preset wins on the name clash.
 */
export function defaultContentLimitPresets(): ContentLimitPreset[] {
  return [
    { name: 'content_limits_spawn', limits: [] },
    { name: 'content_limits_side', limits: [] }
  ];
}

const builtInLimitNames = new Set(defaultContentLimitPresets().map((preset) => preset.name));

/** Built-in cap lists back the zones' "Auto" option: never deleted or renamed. */
export function isBuiltInLimitName(name: string): boolean {
  return builtInLimitNames.has(name);
}

/**
 * The standard ban set, mirroring what the official templates ban most:
 * items banned in ≥8 of the 35 banning templates (voodoo doll and truce flag
 * in all of them) plus the whole teleport spell family.
 */
export const standardBanPreset = {
  items: [
    'voodoosh_doll_artifact',
    'flag_of_truce_artifact',
    'shackles_of_war_artifact',
    'magic_key_ring_artifact',
    'wanderers_way_boots_of_travel_artifact',
    'seven_league_boots_artifact',
    'wanderers_way_backpack_artifact',
    'pole_star_artifact',
    'swamp_boots_artifact'
  ],
  spells: [
    'neutral_magic_pocket_dimension',
    'neutral_magic_shadow_form',
    'neutral_magic_dimension_door',
    'neutral_magic_light_gate',
    'neutral_magic_town_portal'
  ]
};

export const DESIGN_STORAGE_KEY = 'olden-era-rmg-visual-editor-v3';
export const CORE_CATALOG_STORAGE_KEY = 'olden-era-rmg-core-catalog-v2';

export const distancePresets: Record<string, { min: number; max: number } | null> = {
  any: null,
  nextTo: { min: 0.05, max: 0.1 },
  near: { min: 0.1, max: 0.25 },
  medium: { min: 0.25, max: 0.5 },
  far: { min: 0.5, max: 0.75 },
  veryFar: { min: 0.75, max: 0.9 }
};

/** A distance is either a named preset key or an exact "min:max" pair. */
const CUSTOM_DISTANCE = /^(\d*\.?\d+):(\d*\.?\d+)$/;

/** Extract a rule's distance bounds, accepting both the `target` single-value
 *  form and the `targetMin`/`targetMax` range; null = no expressible bounds. */
export function ruleBounds(
  rule: { target?: unknown; targetMin?: unknown; targetMax?: unknown }
): { min: number; max: number } | null {
  if (rule.targetMin !== undefined || rule.targetMax !== undefined) {
    return { min: Number(rule.targetMin) || 0, max: Number(rule.targetMax) || 0 };
  }
  if (rule.target !== undefined) {
    const t = Number(rule.target) || 0;
    return { min: t, max: t };
  }
  return null;
}

/** Resolve a distance value (preset key or "min:max") to numeric bounds; null = "any". */
export function resolveDistance(value: string): { min: number; max: number } | null {
  if (Object.prototype.hasOwnProperty.call(distancePresets, value)) return distancePresets[value];
  const match = CUSTOM_DISTANCE.exec(value);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}

/** Encode exact bounds, collapsing to a preset key only on an exact match so the
 *  common official values stay readable while anything else stays exact (no snapping). */
export function encodeDistance(min: number, max: number): string {
  for (const [name, val] of Object.entries(distancePresets)) {
    if (val && val.min === min && val.max === max) return name;
  }
  return `${min}:${max}`;
}

/** Exact "min:max" encoding with no preset collapse — used by the custom UI inputs. */
export function formatDistance(min: number, max: number): string {
  return `${min}:${max}`;
}

/** True when the value is a usable distance: a known preset key or an exact pair. */
export function isDistanceValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return Object.prototype.hasOwnProperty.call(distancePresets, value) || CUSTOM_DISTANCE.test(value);
}

export const biomeIds = ["Grass", "Deathland", "Dirt", "Autumn", "Snow", "Lava", "Sand"];

export const zoneTypes: Record<ZoneType, { label: string; short: string; color: string; layout: string; hidden?: boolean }> = {
  spawn: { label: "S", short: "S", color: "#fef08a", layout: "visual_editor_layout_spawn" },
  blank: { label: "B", short: "B", color: "#f1f5f9", layout: "visual_editor_layout_blank" },
  low: { label: "L", short: "L", color: "#bbf7d0", layout: "visual_editor_layout_low" },
  medium: { label: "M", short: "M", color: "#fed7aa", layout: "visual_editor_layout_medium" },
  high: { label: "H", short: "H", color: "#fca5a5", layout: "visual_editor_layout_high" },
  neutral: { label: "N", short: "N", color: "#cbd5e1", layout: "visual_editor_layout_neutral" },
  custom: { label: "C", short: "C", color: "#e2dbf0", layout: "visual_editor_layout_neutral" }
};

export const fallbackFactions: Faction[] = [
  { id: "human", label: "Temple", labelByLang: { ru: "Храм", en: "Temple" } },
  { id: "undead", label: "Necropolis", labelByLang: { ru: "Некрополь", en: "Necropolis" } },
  { id: "nature", label: "Grove", labelByLang: { ru: "Роща", en: "Grove" } },
  { id: "demon", label: "Hive", labelByLang: { ru: "Рой", en: "Hive" } },
  { id: "unfrozen", label: "Schism", labelByLang: { ru: "Раскол", en: "Schism" } },
  { id: "dungeon", label: "Dungeon", labelByLang: { ru: "Подземелье", en: "Dungeon" } }
];

export const defaultTemplateDescription = "Generated by Olden Era RMG Visual Template Editor.";

export const initialSettings: MapSettings = {
  name: "Custom RMG Template",
  description: defaultTemplateDescription,
  sizeX: 128,
  sizeZ: 128,
  players: 2,
  victoryMode: "classic",
  displayWinCondition: "win_condition_1",
  classicEnabled: true,
  lostStartCityEnabled: false,
  lostStartCityDay: 0,
  cityHoldEnabled: false,
  cityHoldDays: 6,
  victoryCityZoneId: "",
  singleHero: false,
  desertionEnabled: true,
  desertionDay: 3,
  desertionValue: 3000,
  heroLightingEnabled: true,
  heroLightingDay: 1,
  heroLimitMode: "perCastle",
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
  gladiatorArenaChampionRule: 'StartHero',
  tournamentEnabled: false,
  tournamentPointsToWin: 2,
  tournamentSaveArmy: true,
  tournamentDays: [3, 3, 3],
  tournamentAnnounceDays: [7, 14, 21],
  terrainProfiles: defaultTerrainProfiles(),
  contentLimitPresets: defaultContentLimitPresets(),
  contentPoolPresets: []
};

export const defaultObjectLibrary: CatalogItem[] = [
  // Fallback items if Core.zip is not loaded
  { id: "remote_foothold", sid: "remote_foothold", kind: "sid", label: "Опорный пункт", description: "Склад армии и артефактов.", guarded: false, tag: "Interact" },
  { id: "watchtower", sid: "watchtower", kind: "sid", label: "Наблюдательная вышка", description: "Открывает радиус тумана.", guarded: true, tag: "Interact" },
  { id: "mana_well", sid: "mana_well", kind: "sid", label: "Колодец маны", description: "Восстанавливает ману.", guarded: true, tag: "Interact" },
  { id: "learning_stone", sid: "learning_stone", kind: "sid", label: "Камень знаний", description: "Дает опыт герою.", guarded: true, tag: "Interact" },
  { id: "chest", sid: "chest", kind: "sid", label: "Сундук", description: "Золото или опыт.", guarded: false, tag: "Interact" },
  { id: "camp_fire", sid: "camp_fire", kind: "sid", label: "Костер", description: "Случайные ресурсы.", guarded: false, tag: "Interact" },
  { id: "mine_wood", sid: "mine_wood", kind: "sid", label: "Лесопилка", description: "Ежедневно дает дерево.", guarded: false, tag: "Resource", isMine: true },
  { id: "mine_ore", sid: "mine_ore", kind: "sid", label: "Рудная шахта", description: "Ежедневно дает руду.", guarded: false, tag: "Resource", isMine: true },
  { id: "mine_gold", sid: "mine_gold", kind: "sid", label: "Золотая шахта", description: "Ежедневно дает золото.", guarded: false, tag: "Resource", isMine: true },
  { id: "pandora_box", sid: "pandora_box", kind: "sid", label: "Ящик Пандоры", description: "Случайная крупная награда под охраной.", guarded: true, tag: "Interact" },
  { id: "dragon_utopia", sid: "dragon_utopia", kind: "sid", label: "Утопия драконов", description: "Главная сокровищница под сильной охраной.", guarded: true, tag: "Interact" },
  { id: "alchemy_lab", sid: "alchemy_lab", kind: "sid", label: "Алхимическая лаборатория", description: "Ежедневно дает ртуть.", guarded: false, tag: "Resource", isMine: true }
];

rebuildObjectLibraryLookupMap(defaultObjectLibrary);

// Default preset values are calibrated against the official templates
// (docs/research-zone-presets.md): zone guarded quantiles q25/q50/q75/q90 ≈
// 200k/300k/500k/800k, spawn p50 ≈ 240k. The built-in ladder is deliberately
// even and contrast-rich: L 180k (poor) → M 400k (average) → H 800k (very
// rich, the official treasury mark), with perArea and guard multipliers
// stepping alongside.
export const defaultPresetRefs: Record<string, DefaultPresetDefinition> = {
  // Guaranteed objects mirror the official mandatoryContent skeleton (the
  // per-role frequencies in docs/research-zone-presets.md §2): only what the
  // officials guarantee in ≳half of the zones of that role. Everything else
  // comes from the content pools by value budget, like in the game.
  spawn: {
    id: "spawn",
    label: "S",
    baseType: "spawn" as const,
    guardedValue: 240000,
    unguardedValue: 33000,
    resourcesValue: 20000,
    guardedValuePerArea: 1400,
    unguardedValuePerArea: 80,
    resourcesValuePerArea: 40,
    guardMultiplier: 1.4,
    diplomacyModifier: -0.25,
    objectRefs: [
      { kind: "sid" as const, value: "mine_wood", guarded: false },
      { kind: "sid" as const, value: "mine_ore", guarded: false },
      { kind: "sid" as const, value: "mine_gold", guarded: false },
      { kind: "sid" as const, value: "watchtower", guarded: true },
      { kind: "sid" as const, value: "pandora_box", guarded: true },
      { kind: "list" as const, value: "basic_content_list_building_random_hires_tier_3", guarded: false }
    ],
    isCustom: false
  },
  blank: {
    id: "blank",
    label: "B",
    baseType: "blank" as const,
    guardedValue: 0,
    unguardedValue: 0,
    resourcesValue: 0,
    objectRefs: [],
    isCustom: false
  },
  low: {
    id: "low",
    label: "L",
    baseType: "low" as const,
    guardedValue: 180000,
    unguardedValue: 20000,
    resourcesValue: 25000,
    guardedValuePerArea: 900,
    unguardedValuePerArea: 150,
    resourcesValuePerArea: 200,
    guardMultiplier: 1.1,
    diplomacyModifier: -0.25,
    objectRefs: [
      { kind: "sid" as const, value: "pandora_box", guarded: true },
      { kind: "sid" as const, value: "mine_gold", guarded: false },
      { kind: "sid" as const, value: "watchtower", guarded: true },
      { kind: "sid" as const, value: "mana_well", guarded: true },
      { kind: "sid" as const, value: "chest", guarded: false, count: 2 },
      { kind: "sid" as const, value: "camp_fire", guarded: false, count: 2 }
    ],
    isCustom: false
  },
  medium: {
    id: "medium",
    label: "M",
    baseType: "medium" as const,
    guardedValue: 400000,
    unguardedValue: 40000,
    resourcesValue: 45000,
    guardedValuePerArea: 1800,
    unguardedValuePerArea: 300,
    resourcesValuePerArea: 400,
    guardMultiplier: 1.4,
    diplomacyModifier: -0.25,
    objectRefs: [
      { kind: "sid" as const, value: "pandora_box", guarded: true },
      { kind: "sid" as const, value: "mine_gold", guarded: false },
      { kind: "sid" as const, value: "alchemy_lab", guarded: false },
      { kind: "list" as const, value: "basic_content_list_rare_mines_by_biome", guarded: false },
      { kind: "list" as const, value: "basic_content_list_building_guarded_resource_banks_tier_2", guarded: true },
      { kind: "sid" as const, value: "mana_well", guarded: true },
      { kind: "sid" as const, value: "chest", guarded: false, count: 2 },
      { kind: "sid" as const, value: "camp_fire", guarded: false }
    ],
    isCustom: false
  },
  high: {
    id: "high",
    label: "H",
    baseType: "high" as const,
    guardedValue: 800000,
    unguardedValue: 70000,
    resourcesValue: 80000,
    guardedValuePerArea: 3600,
    unguardedValuePerArea: 600,
    resourcesValuePerArea: 600,
    guardMultiplier: 1.8,
    diplomacyModifier: -0.25,
    objectRefs: [
      { kind: "sid" as const, value: "dragon_utopia", guarded: true },
      { kind: "sid" as const, value: "pandora_box", guarded: true },
      { kind: "sid" as const, value: "mine_gold", guarded: false },
      { kind: "sid" as const, value: "remote_foothold", guarded: false },
      { kind: "sid" as const, value: "unstable_ruins", guarded: true },
      { kind: "list" as const, value: "basic_content_list_building_guarded_resource_banks_tier_3", guarded: true },
      { kind: "sid" as const, value: "alchemy_lab", guarded: false }
    ],
    isCustom: false
  },
  neutral: {
    id: "neutral",
    label: "N",
    baseType: "neutral" as const,
    guardedValue: 120000,
    unguardedValue: 25000,
    resourcesValue: 15000,
    guardedValuePerArea: 500,
    unguardedValuePerArea: 100,
    resourcesValuePerArea: 100,
    guardMultiplier: 1.1,
    diplomacyModifier: -0.25,
    objectRefs: [
      { kind: "sid" as const, value: "watchtower", guarded: true },
      { kind: "sid" as const, value: "chest", guarded: false },
      { kind: "sid" as const, value: "camp_fire", guarded: false }
    ],
    isCustom: false
  }
};
