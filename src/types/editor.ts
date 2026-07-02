import type {
  JsonObject,
  RmgBorder,
  RmgConnectionSource,
  RmgContentList,
  RmgContentListEntry,
  RmgGameRulesSource,
  RmgMainObject,
  RmgMandatoryObject,
  RmgOrientation,
  RmgPlacementRule,
  RmgRule,
  RmgRoad,
  RmgWinConditionsSource,
  RmgZoneLayout
} from "./rmg";

export type ZoneType = string;

export const BIOME_MODES = ['own', 'random', 'spawn', 'specific'] as const;
export type BiomeMode = typeof BIOME_MODES[number];

export const CITY_FACTION_MODES = ['random', 'spawn', 'specific'] as const;
export type CityFactionMode = typeof CITY_FACTION_MODES[number];

export const PRESET_BASE_TYPES = [
  'spawn',
  'blank',
  'low',
  'medium',
  'high',
  'neutral',
  'custom'
] as const;
export type PresetBaseType = typeof PRESET_BASE_TYPES[number];

export const VICTORY_MODES = [
  'classic',
  'capitalCapture',
  'capitalHold',
  'cityHold',
  'gladiatorArena',
  'tournament'
] as const;
export type VictoryMode = typeof VICTORY_MODES[number];

export const HERO_LIMIT_MODES = ['fixed', 'perCastle'] as const;
export type HeroLimitMode = typeof HERO_LIMIT_MODES[number];

export interface CatalogItem {
  id: string;
  sid?: string;
  kind: 'sid' | 'list';
  label: string;
  description: string;
  labelByLang?: { ru: string; en: string };
  descriptionByLang?: { ru: string; en: string };
  guarded: boolean;
  isMine?: boolean;
  tag?: string;
  category?: string;
  rarity?: string;
  sizeX?: number;
  sizeZ?: number;
  count?: number;
  includeList?: string;
  contentEntries?: CatalogContentEntry[];
}

export interface CatalogContentEntry {
  sid: string;
  includeLists: string[];
  technicalId: string;
  labelByLang: { ru: string; en: string };
  descriptionByLang: { ru: string; en: string };
  weight: number | null;
  biome: string;
  variant: number | null;
}

export interface ZoneObject {
  key: string; // unique runtime key
  id: string;
  /** Optional stable mandatory-content entry name; lets a zone road target this
   *  specific object (RoadTerm MandatoryContent). Absent = auto-named on export. */
  name?: string;
  sid?: string;
  includeList?: string;
  label: string;
  description: string;
  labelByLang?: { ru: string; en: string };
  descriptionByLang?: { ru: string; en: string };
  kind: 'sid' | 'list';
  /** Mandatory-object guard state, tri-state to mirror the .rmg.json:
   *  true = guarded, false = unguarded, undefined = field omitted (the engine
   *  applies its own default — most likely guarded, but not confirmed). */
  guarded?: boolean;
  count: number;
  soloEncounter: boolean;
  variant: number | null;
  roadDistance: string; // 'any', 'nextTo', etc.
  townDistance: string;
  isMine: boolean;
  tag?: string;
  category?: string;
  rarity?: string;
  sizeX?: number;
  sizeZ?: number;
  /** Original mandatory-content placement rules, kept verbatim so they
   *  round-trip exactly until the distance presets are edited. */
  rawRules?: RmgPlacementRule[];
  /** Full set of content lists when an object references more than one — the
   *  model identifies a list object by `includeList` (the first), so this keeps
   *  the rest so multi-list objects round-trip without truncation. */
  rawIncludeLists?: string[];
  /** Player who owns this mandatory object from the start (exported as
   *  owner: "PlayerN"); used e.g. for mines handed to a player on turn 1. */
  owner?: number | null;
  /** Forces the generator to treat this as a designated encounter. */
  designatedEncounter?: boolean;
  /** Inline weighted candidate list for a pool-slot (list-kind) object: each
   *  entry is a candidate sid with its pick weight (≤0 = excluded from the roll). */
  nestedContent?: Array<{ sid: string; weight: number }>;
}

export interface Preset {
  id: string;
  label: string;
  baseType: PresetBaseType;
  guardedValue: number;
  unguardedValue: number;
  resourcesValue: number;
  objects: ZoneObject[];
  isCustom: boolean;
  biomeMode?: BiomeMode;
  biomeSource?: string;
  biomeId?: string;
  /** Per-tile value growth, applied together with the absolute values. */
  guardedValuePerArea?: number;
  unguardedValuePerArea?: number;
  resourcesValuePerArea?: number;
  /** Zone guard & neutral tuning; applied only when the preset defines it. */
  guardMultiplier?: number;
  diplomacyModifier?: number;
  guardCutoffValue?: number;
  guardRandomization?: number;
  guardWeeklyIncrement?: number;
  guardReactionDistribution?: number[];
  /** Terrain profile name the preset assigns to the zone. */
  layout?: string;
}

/** Main object types of the game format. AbandonedOutpost is the "remote
 *  foothold"; GladiatorArena is required by the gladiator-arena win mode. */
export type MainObjectType = 'Spawn' | 'City' | 'AbandonedOutpost' | 'GladiatorArena';

/** Game enum MainObjectPlacement: where the object lands inside its zone. */
export type MainObjectPlacement = 'Uniform' | 'Center' | 'Connection' | 'NearZone';

export interface ZoneMainObject {
  key: string; // unique runtime key
  type: MainObjectType;
  player?: number | null;
  factionMode: 'random' | 'spawn' | 'specific';
  factionSource?: string;
  factionId?: string;
  /** Raw `FromList` faction args for a constrained random faction — a faction
   *  subset or "differentFrom: <i> <zone>" exclusions of neighbouring players.
   *  Used with factionMode 'random'; kept verbatim so it round-trips. */
  factionFromList?: string[];
  holdCityWinCon?: boolean;
  /** Player who owns the object from the start (exported as owner: "PlayerN"). */
  owner?: number | null;
  /** Starting buildings set (poor/default/rich…); empty = type default. */
  buildingsConstructionSid?: string;
  /** Strength of the neutral garrison guarding the object (0 = unguarded). */
  guardValue?: number;
  /** Probability 0..1 that the garrison spawns at all. */
  guardChance?: number;
  /** Weekly garrison growth, e.g. 0.1 = +10% per in-game week. */
  guardWeeklyIncrement?: number;
  /** Drop the garrison when the object starts owned by a player. */
  removeGuardIfHasOwner?: boolean;
  /** Spread 0..1 applied to this object's guard strength (like the zone-level one). */
  guardRandomization?: number;
  /** Marks the object as a key/quest object for the generator. */
  isKeyObject?: boolean;
  /** Whether this city/dwelling's unit production grows weekly. */
  enableWeeklyUnitIncrement?: boolean;
  /** Starting unit-growth bump for this city/dwelling. */
  initialUnitIncrement?: number;
  /** Placement rule inside the zone; absent = let the generator decide. */
  placement?: MainObjectPlacement;
  /**
   * Placement arguments, kept verbatim (the format stores them as strings):
   * Uniform/Center take [isCenter, float, int], Connection a connection name,
   * NearZone a zone name.
   */
  placementArgs?: string[];
  rawFields?: Partial<RmgMainObject> & JsonObject;
}

export interface ZoneRawFields extends JsonObject {
  guardCutoffValue?: number;
  guardRandomization?: number;
  guardMultiplier?: number;
  guardWeeklyIncrement?: number;
  guardReactionDistribution?: number[];
  diplomacyModifier?: number;
  crossroadsPosition?: number;
}

/**
 * One row of a content-limit preset. Editable forms: a single object (sid,
 * optional variant) or content lists (includeLists), each with maxCount.
 * Anything exotic keeps the verbatim entry in `raw` and re-emits as-is.
 */
export interface ContentLimitEntry {
  sid?: string;
  variant?: number;
  includeLists?: string[];
  maxCount: number;
  raw?: JsonObject;
}

/** A named cap list (the format's contentCountLimits); zones reference by name. */
export interface ContentLimitPreset {
  name: string;
  /** Optional player-count gate: the preset applies only in this range. */
  playerMin?: number;
  playerMax?: number;
  limits: ContentLimitEntry[];
  /** Created by the user in the editor; survives imports and clears. */
  custom?: boolean;
  rawFields?: JsonObject;
}

/**
 * One weighted source of a content pool. The editable form is
 * {weight, includeLists}; exotic groups (e.g. with per-object `content`
 * refinements) keep the verbatim entry in `raw` and re-emit as-is.
 */
export interface ContentPoolGroup {
  weight: number;
  includeLists: string[];
  raw?: JsonObject;
}

/** A pool ban; exotic entries ride in `raw` verbatim. */
export interface ContentPoolBan {
  sid?: string;
  variant?: number;
  raw?: JsonObject;
}

/** A named content pool (the format's contentPools); zones reference by name. */
export interface ContentPoolPreset {
  name: string;
  /** Price buckets: weights.length = priceBounds.length + 1. */
  valueDistribution?: { priceBounds: number[]; weights: number[] };
  groups: ContentPoolGroup[];
  bans: ContentPoolBan[];
  /** Created by the user in the editor; survives imports and clears. */
  custom?: boolean;
  rawFields?: JsonObject;
}

export interface Zone {
  id: string;
  label: string;
  type: ZoneType;
  x: number;
  y: number;
  size: number;
  biomeMode: BiomeMode;
  biomeSource: string;
  biomeId: string;
  mainObjects: ZoneMainObject[];
  guardedValue: number;
  unguardedValue: number;
  resourcesValue: number;
  /** Extra guarded value added per tile of the zone's actual area. */
  guardedValuePerArea?: number;
  /** Extra unguarded value added per tile of the zone's actual area. */
  unguardedValuePerArea?: number;
  /** Extra resource value added per tile of the zone's actual area. */
  resourcesValuePerArea?: number;
  objects: ZoneObject[];
  /** Guards weaker than this value are not placed at all. */
  guardCutoffValue?: number;
  /** Random spread of the guard strength, e.g. 0.25 = ±25%. */
  guardRandomization?: number;
  /** Multiplier applied to every guard in the zone (1 = unchanged). */
  guardMultiplier?: number;
  /** Weekly guard strength growth, e.g. 0.15 = +15% per in-game week. */
  guardWeeklyIncrement?: number;
  /**
   * Six reaction weights in the runtime enum order: Aggressive, Negative,
   * Common, Friendly, Peaceful, Docile — index 0 = always fights, index 5 =
   * joins or lets pass.
   */
  guardReactionDistribution?: number[];
  /** Per-tier random-hire dwelling tuning, kept verbatim (one entry per creature
   *  tier): starting unit growth amounts and weekly-growth on/off flags. */
  randomHireInitialUnitIncrement?: number[];
  randomHireEnableWeeklyUnitIncrement?: boolean[];
  /** Neutral "friendliness": higher — neutrals join or leave more eagerly. */
  diplomacyModifier?: number;
  layout?: string;
  /**
   * Biome of the zone's content/meta-objects when it differs from the land:
   * 'land' (or undefined) follows the ground biome, the rest mirror the
   * main biome modes.
   */
  contentBiomeMode?: 'land' | BiomeMode;
  contentBiomeSource?: string;
  contentBiomeId?: string;
  metaBiomeMode?: 'land' | BiomeMode;
  metaBiomeSource?: string;
  metaBiomeId?: string;
  /** Per-zone guard-hole tuning; undefined = the game defaults. */
  encounterHolesSettings?: { affectedEncounters: number; twoHoleEncounters: number };
  /** Names of content-limit presets applied to the zone; undefined = auto by zone type. */
  contentCountLimits?: string[];
  /** Content pool references; undefined = auto by zone type. */
  guardedContentPool?: string[];
  unguardedContentPool?: string[];
  resourcesContentPool?: string[];
  mandatoryContent?: string[];
  roads?: RmgRoad[];
  rawFields?: ZoneRawFields;
  rawMandatoryContent?: RmgMandatoryObject[];
  importedObjects?: ZoneObject[];
  originalZoneBiome?: RmgRule;
  originalContentBiome?: RmgRule;
  originalMetaObjectsBiome?: RmgRule;
}

/** Connection types supported by the game's RMG format. */
export const CONNECTION_TYPES = [
  'Default',
  'Direct',
  'Portal',
  'Proximity',
  'GladiatorArena'
] as const;
export type ConnectionType = typeof CONNECTION_TYPES[number];

export interface Edge {
  id: string;
  from: string;
  to: string;
  guardValue: number;
  road: boolean;
  /** Road surface (Stone/Dirt); undefined keeps the imported segments as is. */
  roadType?: 'Stone' | 'Dirt';
  connectionType: ConnectionType;
  length?: number;
  /** Whether the guard squad fights in simultaneous-turn mode (game default when omitted). */
  simTurnSquad?: boolean;
  /** Weekly guard strength growth, e.g. 0.15 = +15% per in-game week. */
  guardWeeklyIncrement?: number;
  /** Whether the guard squad may retreat from battle (game default: allowed). */
  guardEscape?: boolean;
  /** Random spread of the guard strength, e.g. 0.2 = ±20%. */
  guardRandomization?: number;
  /** Zone that hosts the passage guard ("Center" = middle of the passage). */
  guardZone?: string;
  /** Placement of the passage gate; official templates only use "Center". */
  gatePlacement?: string;
  /** Connections sharing a group name get an identical (synced) guard. */
  guardMatchGroup?: string;
  /** Portal mouth placement inside the From/To zones, kept verbatim; the
   *  inspector edits the leading rule's distance, the rest round-trips. */
  portalPlacementRulesTo?: RmgPlacementRule[];
  portalPlacementRulesFrom?: RmgPlacementRule[];
  /** True for connections that came from a template import (vs created in the
   *  editor). Lets the export reconcile zone roads — original connections keep
   *  their roads, new ones get one. Not emitted to the .rmg.json. */
  imported?: boolean;
  rawFields?: RmgConnectionSource;
}

export interface MapSettings {
  name: string;
  description: string;
  sizeX: number;
  sizeZ: number;
  players: number;
  /** Derived single-select for the simple-mode UI (the normalizer always
   *  recomputes it from the win-condition flags below; nothing writes it
   *  directly). The flags are the source of truth. */
  victoryMode: VictoryMode;
  /** Cosmetic label shown in the game's template picker (win_condition_1..6).
   *  Independent of the actual win-condition flags. */
  displayWinCondition: string;
  /** Classic win: defeat all enemy heroes and capture every enemy city. */
  classicEnabled: boolean;
  /** Lose if your starting city is held by an enemy for lostStartCityDay days
   *  (0 = immediately, i.e. "capital capture"). */
  lostStartCityEnabled: boolean;
  lostStartCityDay: number;
  /** Win by holding a chosen city for cityHoldDays days. */
  cityHoldEnabled: boolean;
  cityHoldDays: number;
  /** The city zone to hold (for cityHold). */
  victoryCityZoneId: string;
  /** Lose if your starting hero is lost (game's lostStartHero flag). */
  singleHero: boolean;
  desertionEnabled: boolean;
  desertionDay: number;
  desertionValue: number;
  heroLightingEnabled: boolean;
  heroLightingDay: number;
  heroLimitMode: HeroLimitMode;
  heroMin: number;
  heroMax: number;
  heroIncrement: number;
  /** Game mode: each player has a single hero for the whole match. */
  singleHeroMode: boolean;
  /** Heroes cannot be hired in taverns — only starting heroes play. */
  heroHireBan: boolean;
  /** Some guards are generated passable without a fight ("holes"). */
  encounterHoles: boolean;
  /** Experience multiplier for faction-law rewards (1 = standard). */
  factionLawsExpModifier: number;
  /** Experience multiplier for astrology events (1 = standard). */
  astrologyExpModifier: number;
  fixedOrientation: boolean;
  preserveLayout: boolean;
  orientationAnchor: string;
  /** Width of the water band along the map border (0 = no water). */
  borderWaterWidth: number;
  /** Rounding of the map corners (0..1). */
  borderCornerRadius: number;
  /** Banned artifact sids (exported as globalBans.items). */
  bannedItems: string[];
  /** Banned spell ids (exported as globalBans.magics). */
  bannedSpells: string[];
  /** Banned hero ids (exported as globalBans.heroes). */
  bannedHeroes: string[];
  /** Bonuses every player receives when the map starts (gameRules.bonuses). */
  startingBonuses: StartingBonus[];
  /** Per-object guard overrides (template root valueOverrides). */
  valueOverrides: ValueOverride[];
  language: 'ru' | 'en';
  gladiatorArenaEnabled: boolean;
  gladiatorArenaDaysDelayStart: number;
  gladiatorArenaCountDay: number;
  gladiatorArenaRegistrationStartFight: boolean;
  gladiatorArenaChampionRule: string;
  tournamentEnabled: boolean;
  tournamentPointsToWin: number;
  tournamentSaveArmy: boolean;
  tournamentDays: number[];
  tournamentAnnounceDays: number[];
  /** Editable terrain profiles (the template's zoneLayouts), shared by zones. */
  terrainProfiles: TerrainProfile[];
  /** Editable content-limit presets (the template's contentCountLimits). */
  contentLimitPresets: ContentLimitPreset[];
  /** Editable content pools (the template's contentPools). */
  contentPoolPresets: ContentPoolPreset[];
  originalZoneLayouts?: RmgZoneLayout[];
  originalContentLists?: RmgContentList[];
  originalGameRules?: RmgGameRulesSource;
  originalWinConditions?: RmgWinConditionsSource;
  originalOrientation?: RmgOrientation;
  originalBorder?: RmgBorder;
  originalRawRootFields?: JsonObject;
  /** Connection ids present at import. Lets the export tell a user-deleted
   *  connection (drop its dangling roads) from a template's own dangling roads. */
  originalConnectionIds?: string[];
}

/**
 * A guard override for a specific object: every official entry is the
 * {sid, variant: -1, guardValue} triple — "object X is guarded by Y".
 */
export interface ValueOverride {
  sid: string;
  /** Object variant; -1 = all variants. A few official entries omit it. */
  variant?: number;
  guardValue: number;
}

export interface TerrainElevationMode {
  weight: number;
  minElevatedFraction: number;
  maxElevatedFraction: number;
}

/**
 * A terrain profile — the game's zoneLayout. Zones reference a profile by
 * name and most official profiles are shared by several zones, so edits
 * apply to every zone using the profile. Optional fields follow the
 * emit-only-when-set rule; unrecognized fields ride along in rawFields.
 */
export interface TerrainProfile {
  name: string;
  /** Obstacle density (forests, rocks) in the filled part of the zone, ~0.2–0.5. */
  obstaclesFill?: number;
  /** Obstacle density in the empty ("void") part of the zone. */
  obstaclesFillVoid?: number;
  /** Fraction of the zone covered by lakes, ~0–0.4. */
  lakesFill?: number;
  /** Minimum lake size in tiles; smaller puddles are dropped. */
  minLakeArea?: number;
  /** Scale of elevation clusters (smaller = finer terrain patches). */
  elevationClusterScale?: number;
  /** Weighted elevation variants the generator picks from. */
  elevationModes?: TerrainElevationMode[];
  /** Area of one road cluster — affects how branchy the road net is. */
  roadClusterArea?: number;
  /**
   * User-created (not part of an imported template). Custom profiles survive
   * template imports and workspace clears, and are exported only when some
   * zone actually references them. Editor-only — never written to the game
   * JSON.
   */
  custom?: boolean;
  /** Unrecognized layout fields, preserved verbatim on export. */
  rawFields?: JsonObject;
}

/**
 * A starting bonus granted when the map begins. Bonus types come from the
 * game's DB/map_bonuses catalog (add_bonus_res, add_bonus_hero_spell, …);
 * the meaning of `parameters` depends on the type.
 */
export interface StartingBonus {
  sid: string;
  /** Receiving side; -1 = every player (the only value official templates use). */
  receiverSide: number;
  /** start_hero, all_heroes, or empty for side-wide bonuses. */
  receiverFilter: string;
  parameters: string[];
}

export interface Faction {
  id: string;
  label: string;
  labelByLang: { ru: string; en: string };
}

/** A playable hero extracted from Core.zip (for the bans picker). */
export interface CoreHero {
  id: string;
  faction: string;
  classType: string;
  labelByLang: { ru: string; en: string };
}

/** A spell extracted from Core.zip (for the bans picker). */
export interface CoreSpell {
  id: string;
  /** Magic school derived from the source file name (day, night, primal, space, neutral, punishment). */
  school: string;
  kind: 'battle' | 'world';
  labelByLang: { ru: string; en: string };
}

/** A creature extracted from Core.zip (for the unit bonus picker). */
export interface CoreUnit {
  id: string;
  faction: string;
  tier: number;
  labelByLang: { ru: string; en: string };
}

/** Bumped whenever the parsed catalog shape or filtering changes, so stale
 *  IndexedDB caches are rebuilt from Core.zip. */
export const CORE_CATALOG_VERSION = 3;

export interface CoreCatalog {
  version: number;
  generatedAt: string;
  objects: CatalogItem[];
  artifactLists: Record<string, RmgContentListEntry[]>;
  factions: Faction[];
  heroes: CoreHero[];
  spells: CoreSpell[];
  units: CoreUnit[];
  /** Engine hero stat names (from DB/hero_stats_limits.json), for add_bonus_hero_stat. */
  heroStatNames: string[];
  /** Names of the game's built-in content pools (generator/content_pools/*),
   *  so the validator recognises template references to them as valid even
   *  though the editor does not model them as editable presets. */
  builtInPoolNames: string[];
  stats: {
    mapObjects: number;
    usableObjects: number;
    contentLists: number;
    items: number;
    artifactLists: number;
    factions: number;
    heroes: number;
    spells: number;
    units: number;
  };
}

export interface CustomObjectListEntry {
  key: string;
  kind: 'sid' | 'list';
  value: string;
  weight: number;
}

export interface CustomObjectList {
  id: string;
  label: string;
  entries: CustomObjectListEntry[];
}

export interface EditorState {
  settings: MapSettings;
  zones: Zone[];
  edges: Edge[];
  selected: { type: 'zone' | 'edge' | 'edgePair' | 'preset' | 'customList' | 'elementsList' | 'terrainProfile' | 'contentLimits' | 'contentPool'; id: string } | null;
  mode: 'select' | 'connect';
  connectStart: string | null;
  /** Zones picked so far by the interactive copy-connections target picker;
   *  null when picking is off. While non-null, canvas zone clicks collect ids
   *  here (up to 2) instead of changing the selection. */
  zonePick: string[] | null;
  nextZoneNumber: number;
  presets: Record<string, Preset>;
  customObjectLists: Record<string, CustomObjectList>;
  variants: VariantMeta[];
  activeVariantId: string;
}

/**
 * A single generation variant: an alternative map skeleton (zones, connections,
 * border and orientation) inside one template. The game picks one variant at
 * random when generating a map. The currently edited variant lives in the flat
 * `zones`/`edges` plus the orientation fields of `settings`; inactive variants
 * are kept as {@link VariantSnapshot} values in the store.
 */
export interface VariantMeta {
  id: string;
}

/**
 * Stored state of an inactive variant. Orientation is per-variant in the game
 * format, so each snapshot carries its own copy; while a variant is active its
 * orientation surfaces through `settings.fixedOrientation` /
 * `settings.orientationAnchor` / `settings.originalOrientation` and is folded
 * back into the snapshot when another variant is activated.
 */
export interface VariantSnapshot {
  zones: Zone[];
  edges: Edge[];
  fixedOrientation: boolean;
  orientationAnchor: string;
  preserveLayout: boolean;
  originalOrientation?: RmgOrientation;
  borderWaterWidth: number;
  borderCornerRadius: number;
  originalBorder?: RmgBorder;
}
