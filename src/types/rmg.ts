export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface RmgWinConditionsSource extends JsonObject {
  classic?: boolean;
  desertion?: boolean;
  desertionDay?: number;
  desertionValue?: number;
  heroLighting?: boolean;
  heroLightingDay?: number;
  lostStartCity?: boolean;
  lostStartCityDay?: number;
  lostStartHero?: boolean;
  cityHold?: boolean;
  cityHoldDays?: number;
  gladiatorArena?: boolean;
  gladiatorArenaRegistrationStartWork?: boolean;
  gladiatorArenaRegistrationStartFight?: boolean;
  gladiatorArenaDaysDelayStart?: number;
  gladiatorArenaCountDay?: number;
  championSelectRule?: string;
  tournament?: boolean;
  tournamentPointsToWin?: number;
  tournamentSaveArmy?: boolean;
  tournamentDays?: number[];
  tournamentAnnounceDays?: number[];
}

export type RmgWinConditions = RmgWinConditionsSource;

export interface RmgGlobalBans extends JsonObject {
  items?: string[];
  magics?: string[];
  heroes?: string[];
}

/** A starting bonus entry (gameRules.bonuses). */
export interface RmgBonus extends JsonObject {
  sid?: string;
  receiverSide?: number;
  receiverFilter?: string;
  parameters?: Array<string | number>;
}

export interface RmgGameRulesSource extends JsonObject {
  heroCountMin?: number;
  heroCountMax?: number;
  heroCountIncrement?: number;
  heroHireBan?: boolean;
  encounterHoles?: boolean;
  factionLawsExpModifier?: number;
  astrologyExpModifier?: number;
  winConditions?: RmgWinConditionsSource;
  globalBans?: RmgGlobalBans;
  /** Official templates use an array; one template ships a single object. */
  bonuses?: RmgBonus[] | RmgBonus;
}

export interface RmgGameRules extends RmgGameRulesSource {
  heroCountMin: number;
  heroCountMax: number;
  heroCountIncrement: number;
  heroHireBan: boolean;
  encounterHoles: boolean;
  factionLawsExpModifier: number;
  astrologyExpModifier: number;
  winConditions: RmgWinConditions;
}

export interface RmgBorderNoise extends JsonObject {
  amp: number;
  freq: number;
}

export interface RmgBorder extends JsonObject {
  cornerRadius: number;
  obstaclesWidth: number;
  obstaclesNoise: RmgBorderNoise[];
  waterWidth: number;
  waterNoise: RmgBorderNoise[];
  waterType: string;
}

export interface RmgRule extends JsonObject {
  type: string;
  args?: string[];
}


export interface RoadTerm extends JsonObject {
  type: "Crossroads" | "MainObject" | "Connection" | "MandatoryContent";
  args?: string[];
}

export interface RmgRoad extends JsonObject {
  /** Road surface (Stone/Dirt); a few official segments omit it. */
  type?: string;
  from: RoadTerm;
  to: RoadTerm;
}

export interface RmgMainObject extends JsonObject {
  type: "Spawn" | "City" | "AbandonedOutpost" | "GladiatorArena";
  spawn?: string;
  owner?: string;
  guardChance?: number;
  guardValue?: number;
  guardWeeklyIncrement?: number;
  removeGuardIfHasOwner?: boolean;
  buildingsConstructionSid?: string;
  faction?: RmgRule;
  factions?: string[];
  placement?: string;
  placementArgs?: string[];
  holdCityWinCon?: boolean;
  guardRandomization?: number;
  isKeyObject?: boolean;
  enableWeeklyUnitIncrement?: boolean;
  initialUnitIncrement?: number;
}

export interface RmgZone extends JsonObject {
  name: string;
  size: number;
  layout?: string;
  guardCutoffValue?: number;
  guardRandomization?: number;
  guardMultiplier?: number;
  guardWeeklyIncrement?: number;
  guardReactionDistribution?: number[];
  /** Per-tier random-hire tuning: starting unit growth and weekly-growth flags. */
  randomHireInitialUnitIncrement?: number[];
  randomHireEnableWeeklyUnitIncrement?: boolean[];
  diplomacyModifier?: number;
  /** Preset names; a few official zones carry a single name as a string. */
  contentCountLimits?: string[] | string;
  guardedContentPool?: string[] | string;
  unguardedContentPool?: string[] | string;
  resourcesContentPool?: string[] | string;
  guardedContentValue?: number;
  guardedContentValuePerArea?: number;
  unguardedContentValue?: number;
  unguardedContentValuePerArea?: number;
  resourcesValue?: number;
  resourcesValuePerArea?: number;
  mandatoryContent?: string[];
  zoneBiome?: RmgRule;
  contentBiome?: RmgRule;
  metaObjectsBiome?: RmgRule;
  crossroadsPosition?: number;
  encounterHolesSettings?: { affectedEncounters: number; twoHoleEncounters: number };
  roads?: RmgRoad[];
  mainObjects?: RmgMainObject[];
}

interface RmgConnectionBase extends JsonObject {
  name: string;
  from: string;
  to: string;
  guardValue?: number;
  road?: boolean;
  simTurnSquad?: boolean;
  guardWeeklyIncrement?: number;
  guardEscape?: boolean;
  guardRandomization?: number;
  /** Zone that hosts the passage guard ("Center" = middle of the passage). */
  guardZone?: string;
  /** Placement of the passage gate; official templates only use "Center". */
  gatePlacement?: string;
  /** Connections sharing a group name get an identical (synced) guard. */
  guardMatchGroup?: string;
  /** For portal connections: where the portal mouths are placed inside the
   *  source (From) and destination (To) zones, as distance/placement rules. */
  portalPlacementRulesTo?: RmgPlacementRule[];
  portalPlacementRulesFrom?: RmgPlacementRule[];
  length?: number;
}

/** Any passage-creating connection (everything except the Proximity spring). */
export interface RmgPassageConnection extends RmgConnectionBase {
  connectionType: "Default" | "Direct" | "Portal" | "GladiatorArena";
}

export interface RmgProximityConnection extends RmgConnectionBase {
  connectionType: "Proximity";
  length: number;
}

export type RmgConnection = RmgPassageConnection | RmgProximityConnection;

export interface RmgConnectionSource extends JsonObject {
  name?: string;
  from?: string;
  to?: string;
  guardValue?: number;
  road?: boolean;
  simTurnSquad?: boolean;
  connectionType?: string;
  length?: number;
}

export interface RmgOrientation extends JsonObject {
  zeroAngleZone?: string;
  baseAngleMin: number;
  baseAngleMax: number;
  randomAngleAmplitude: number;
  randomAngleStep: number;
}

export interface RmgVariant extends JsonObject {
  border?: RmgBorder;
  zones: RmgZone[];
  connections: RmgConnection[];
  orientation?: RmgOrientation;
}

export interface RmgVariantSource extends JsonObject {
  border?: RmgBorder;
  zones?: RmgZone[];
  connections?: RmgConnectionSource[];
  orientation?: RmgOrientation;
}

export interface RmgZoneLayout extends JsonObject {
  name: string;
  obstaclesFill?: number;
  obstaclesFillVoid?: number;
  lakesFill?: number;
  minLakeArea?: number;
  elevationClusterScale?: number;
  elevationModes?: Array<{
    weight: number;
    minElevatedFraction: number;
    maxElevatedFraction: number;
  }>;
  roadClusterArea?: number;
  guardedEncounterResourceFractions?: {
    countBounds: JsonValue[];
    fractions: number[];
  };
  ambientPickupDistribution?: {
    repulsion: number;
    noise: number;
    roadAttraction: number;
    obstacleAttraction: number;
    groupSizeWeights: number[];
  };
}

export interface RmgPlacementRule extends JsonObject {
  type: string;
  args?: string[];
  /** Some rules use a single `target` instead of a min/max range. */
  target?: number;
  targetMin?: number;
  targetMax?: number;
  weight?: number;
}

export interface RmgMandatoryObject extends JsonObject {
  name?: string;
  sid?: string;
  includeLists?: string[];
  variant?: number;
  isMine?: boolean;
  owner?: string;
  isGuarded?: boolean;
  soloEncounter?: boolean;
  designatedEncounter?: boolean;
  /** Inline weighted candidate list for a pool-slot object (when sid is absent). */
  content?: Array<{ sid: string; weight: number }>;
  rules?: RmgPlacementRule[];
}

export interface RmgMandatoryContent extends JsonObject {
  name: string;
  content: RmgMandatoryObject[];
}

export interface RmgContentPoolGroup extends JsonObject {
  weight: number;
  includeLists: string[];
}

export interface RmgContentPool extends JsonObject {
  name: string;
  /** One official pool omits the distribution entirely. */
  valueDistribution?: {
    priceBounds: number[];
    weights: number[];
  };
  groups: RmgContentPoolGroup[];
  bans: Array<{ sid: string; variant?: number }>;
}

export interface RmgContentListEntry extends JsonObject {
  sid?: string;
  includeLists?: string[];
  weight?: number;
  biome?: string;
  variant?: number;
}

export interface RmgContentList extends JsonObject {
  name: string;
  content: RmgContentListEntry[];
}

export interface RmgContentCountLimit extends JsonObject {
  name: string;
  limits: JsonValue[];
}

export interface RmgTemplate extends JsonObject {
  name: string;
  gameMode: "Classic" | "SingleHero";
  description: string;
  displayWinCondition: string;
  sizeX: number;
  sizeZ: number;
  gameRules: RmgGameRules;
  globalBans?: RmgGlobalBans;
  variants?: RmgVariant[];
  zoneLayouts?: RmgZoneLayout[];
  mandatoryContent?: RmgMandatoryContent[];
  contentCountLimits?: RmgContentCountLimit[];
  contentPools?: RmgContentPool[];
  contentLists?: RmgContentList[];
  valueOverrides?: RmgValueOverride[];
}

export interface RmgValueOverride extends JsonObject {
  sid: string;
  variant?: number;
  guardValue: number;
}

export interface RmgTemplateSource extends JsonObject {
  name?: string;
  gameMode?: string;
  description?: string;
  displayWinCondition?: string;
  sizeX?: number;
  sizeZ?: number;
  gameRules?: RmgGameRulesSource;
  globalBans?: RmgGlobalBans;
  variants?: RmgVariantSource[];
  zoneLayouts?: RmgZoneLayout[];
  mandatoryContent?: RmgMandatoryContent[];
  contentCountLimits?: RmgContentCountLimit[];
  contentPools?: RmgContentPool[];
  contentLists?: RmgContentList[];
  valueOverrides?: RmgValueOverride[];
}
