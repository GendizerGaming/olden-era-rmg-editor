import type { Zone, ZoneObject, Preset, CustomObjectList, Edge, Faction, CatalogItem, ContentLimitEntry, ContentLimitPreset, ContentPoolBan, ContentPoolGroup, ContentPoolPreset, MapSettings, ZoneMainObject, BiomeMode, CityFactionMode, StartingBonus, TerrainProfile } from '../types/editor';
import { CONNECTION_TYPES } from '../types/editor';
import type { SavedZoneObject, SavedPreset, SavedCustomObjectList, SavedEdge, SavedZone } from './types';
import { catalogItemForReference, cloneEntry, resolvePresetToZoneObjects } from './catalog';
import { uniqueKey } from './ids';
import { uniqueZoneId, zoneIdPrefix } from './zones';
import { defaultPresets } from './presets';
import { distancePresets, zoneTypes, biomeIds, defaultTemplateDescription, defaultTerrainProfiles, defaultContentLimitPresets } from './constants';
import { primaryVictoryMode } from './winConditions';

const normalizeTerrainProfiles = (value: unknown): TerrainProfile[] => {
  if (!Array.isArray(value)) return defaultTerrainProfiles();
  const seen = new Set<string>();
  const result: TerrainProfile[] = [];
  for (const entry of value as Array<Partial<TerrainProfile> | null>) {
    if (!entry || typeof entry.name !== 'string' || !entry.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    const profile: TerrainProfile = { name: entry.name };
    if (entry.obstaclesFill !== undefined) profile.obstaclesFill = Number(entry.obstaclesFill);
    if (entry.obstaclesFillVoid !== undefined) profile.obstaclesFillVoid = Number(entry.obstaclesFillVoid);
    if (entry.lakesFill !== undefined) profile.lakesFill = Number(entry.lakesFill);
    if (entry.minLakeArea !== undefined) profile.minLakeArea = Number(entry.minLakeArea);
    if (entry.elevationClusterScale !== undefined) profile.elevationClusterScale = Number(entry.elevationClusterScale);
    if (Array.isArray(entry.elevationModes)) {
      profile.elevationModes = entry.elevationModes.map((mode) => ({
        weight: Number(mode?.weight) || 0,
        minElevatedFraction: Number(mode?.minElevatedFraction) || 0,
        maxElevatedFraction: Number(mode?.maxElevatedFraction) || 0
      }));
    }
    if (entry.roadClusterArea !== undefined) profile.roadClusterArea = Number(entry.roadClusterArea);
    if (entry.custom) profile.custom = true;
    if (entry.rawFields && typeof entry.rawFields === 'object') profile.rawFields = entry.rawFields;
    result.push(profile);
  }
  return result;
};

const normalizeContentLimitPresets = (value: unknown): ContentLimitPreset[] => {
  if (!Array.isArray(value)) return defaultContentLimitPresets();
  const seen = new Set<string>();
  const result: ContentLimitPreset[] = [];
  for (const entry of value as Array<Partial<ContentLimitPreset> | null>) {
    if (!entry || typeof entry.name !== 'string' || !entry.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    const preset: ContentLimitPreset = { name: entry.name, limits: [] };
    if (typeof entry.playerMin === 'number') preset.playerMin = entry.playerMin;
    if (typeof entry.playerMax === 'number') preset.playerMax = entry.playerMax;
    preset.limits = (Array.isArray(entry.limits) ? entry.limits : []).flatMap((row): ContentLimitEntry[] => {
      if (!row || typeof row !== 'object') return [];
      if (row.raw !== undefined) return [{ maxCount: 0, raw: row.raw }];
      const limit: ContentLimitEntry = { maxCount: Number(row.maxCount) || 0 };
      if (typeof row.sid === 'string' && row.sid) limit.sid = row.sid;
      if (typeof row.variant === 'number') limit.variant = row.variant;
      if (Array.isArray(row.includeLists)) {
        limit.includeLists = row.includeLists.filter((name): name is string => typeof name === 'string');
      }
      if (limit.sid === undefined && limit.includeLists === undefined) return [];
      return [limit];
    });
    if (entry.custom) preset.custom = true;
    if (entry.rawFields && typeof entry.rawFields === 'object') preset.rawFields = entry.rawFields;
    result.push(preset);
  }
  return result;
};

const normalizeContentPoolPresets = (value: unknown): ContentPoolPreset[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ContentPoolPreset[] = [];
  for (const entry of value as Array<Partial<ContentPoolPreset> | null>) {
    if (!entry || typeof entry.name !== 'string' || !entry.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    const preset: ContentPoolPreset = { name: entry.name, groups: [], bans: [] };
    if (
      entry.valueDistribution &&
      Array.isArray(entry.valueDistribution.priceBounds) &&
      Array.isArray(entry.valueDistribution.weights)
    ) {
      preset.valueDistribution = {
        priceBounds: entry.valueDistribution.priceBounds.map(Number),
        weights: entry.valueDistribution.weights.map(Number)
      };
    }
    preset.groups = (Array.isArray(entry.groups) ? entry.groups : []).flatMap((row): ContentPoolGroup[] => {
      if (!row || typeof row !== 'object') return [];
      if (row.raw !== undefined) return [{ weight: 0, includeLists: [], raw: row.raw }];
      if (!Array.isArray(row.includeLists)) return [];
      return [{
        weight: Number(row.weight) || 0,
        includeLists: row.includeLists.filter((name): name is string => typeof name === 'string')
      }];
    });
    preset.bans = (Array.isArray(entry.bans) ? entry.bans : []).flatMap((row): ContentPoolBan[] => {
      if (!row || typeof row !== 'object') return [];
      if (row.raw !== undefined) return [{ raw: row.raw }];
      if (typeof row.sid !== 'string' || !row.sid) return [];
      const ban: ContentPoolBan = { sid: row.sid };
      if (typeof row.variant === 'number') ban.variant = row.variant;
      return [ban];
    });
    if (entry.custom) preset.custom = true;
    if (entry.rawFields && typeof entry.rawFields === 'object') preset.rawFields = entry.rawFields;
    result.push(preset);
  }
  return result;
};

export const resolveSavedObjects = (
    objects: SavedZoneObject[],
    objectLibrary: CatalogItem[],
    missing: string[],
    customLists?: Record<string, CustomObjectList>
  ): ZoneObject[] => {
    return objects.flatMap((saved) => {
      const reference = saved.kind === "list" || saved.includeList
        ? { kind: "list" as const, value: saved.includeList || "" }
        : { kind: "sid" as const, value: saved.sid || saved.id || "" };
      // The design's own custom lists are not in Core.zip — keep those
      // references as saved, they resolve against customObjectLists.
      if (reference.kind === "list" && customLists?.[reference.value]) {
        return [{ ...normalizeSavedZoneObject(saved), label: customLists[reference.value].label }];
      }
      const item = catalogItemForReference(objectLibrary, reference);
      if (!item) {
        if (reference.value) missing.push(reference.value);
        return [];
      }
      return [{
        ...cloneEntry(item),
        count: Math.max(1, Math.min(99, Math.trunc(Number(saved.count) || 1))),
        guarded: Boolean(saved.guarded),
        soloEncounter: Boolean(saved.soloEncounter),
        variant: saved.variant === null || saved.variant === undefined || saved.variant === "" ? null : Math.trunc(Number(saved.variant)),
        roadDistance:
          typeof saved.roadDistance === "string" &&
          distancePresets[saved.roadDistance] !== undefined
            ? saved.roadDistance
            : "any",
        townDistance:
          typeof saved.townDistance === "string" &&
          distancePresets[saved.townDistance] !== undefined
            ? saved.townDistance
            : "any"
      }];
    });
  };

export const normalizeSavedZoneObject = (
    saved: SavedZoneObject
  ): ZoneObject => {
    const kind = saved.kind === "list" ? "list" : "sid";
    const id =
      saved.id ||
      (kind === "list" ? saved.includeList : saved.sid) ||
      "unknown";
    return {
      key: saved.key || uniqueKey(),
      id,
      sid: kind === "sid" ? saved.sid || id : undefined,
      includeList: kind === "list" ? saved.includeList || id : undefined,
      label: saved.label || id,
      description: saved.description || "",
      labelByLang: saved.labelByLang,
      descriptionByLang: saved.descriptionByLang,
      kind,
      guarded: Boolean(saved.guarded),
      count: Math.max(1, Math.min(99, Math.trunc(Number(saved.count) || 1))),
      soloEncounter: Boolean(saved.soloEncounter),
      variant:
        saved.variant === null ||
        saved.variant === undefined ||
        saved.variant === ""
          ? null
          : Math.trunc(Number(saved.variant)),
      roadDistance:
        typeof saved.roadDistance === "string" &&
        distancePresets[saved.roadDistance] !== undefined
          ? saved.roadDistance
          : "any",
      townDistance:
        typeof saved.townDistance === "string" &&
        distancePresets[saved.townDistance] !== undefined
          ? saved.townDistance
          : "any",
      isMine: Boolean(saved.isMine),
      tag: saved.tag,
      category: saved.category,
      rarity: saved.rarity,
      sizeX: saved.sizeX,
      sizeZ: saved.sizeZ
    };
  };

export const normalizeSavedPreset = (
    key: string,
    savedPreset: SavedPreset,
    objectLibrary: CatalogItem[],
    missing: string[],
    hasCatalog: boolean,
    customLists?: Record<string, CustomObjectList>
  ): Preset => {
    const savedObjects = savedPreset.objects ?? [];
    const objects = hasCatalog
      ? resolveSavedObjects(savedObjects, objectLibrary, missing, customLists)
      : savedObjects.map(normalizeSavedZoneObject);
    return {
      id: savedPreset.id || key,
      label: savedPreset.label || key,
      baseType: savedPreset.baseType || "custom",
      guardedValue: Number(savedPreset.guardedValue) || 0,
      unguardedValue: Number(savedPreset.unguardedValue) || 0,
      resourcesValue: Number(savedPreset.resourcesValue) || 0,
      guardedValuePerArea: savedPreset.guardedValuePerArea !== undefined ? Number(savedPreset.guardedValuePerArea) : undefined,
      unguardedValuePerArea: savedPreset.unguardedValuePerArea !== undefined ? Number(savedPreset.unguardedValuePerArea) : undefined,
      resourcesValuePerArea: savedPreset.resourcesValuePerArea !== undefined ? Number(savedPreset.resourcesValuePerArea) : undefined,
      guardMultiplier: savedPreset.guardMultiplier !== undefined ? Number(savedPreset.guardMultiplier) : undefined,
      diplomacyModifier: savedPreset.diplomacyModifier !== undefined ? Number(savedPreset.diplomacyModifier) : undefined,
      guardCutoffValue: savedPreset.guardCutoffValue !== undefined ? Number(savedPreset.guardCutoffValue) : undefined,
      guardRandomization: savedPreset.guardRandomization !== undefined ? Number(savedPreset.guardRandomization) : undefined,
      guardWeeklyIncrement: savedPreset.guardWeeklyIncrement !== undefined ? Number(savedPreset.guardWeeklyIncrement) : undefined,
      guardReactionDistribution: Array.isArray(savedPreset.guardReactionDistribution)
        ? savedPreset.guardReactionDistribution.map(Number)
        : undefined,
      layout: typeof savedPreset.layout === 'string' && savedPreset.layout ? savedPreset.layout : undefined,
      objects,
      isCustom: savedPreset.isCustom !== false,
      biomeMode: savedPreset.biomeMode,
      biomeSource: savedPreset.biomeSource,
      biomeId: savedPreset.biomeId
    };
  };

export const normalizeSavedCustomList = (
    key: string,
    savedList: SavedCustomObjectList
  ): CustomObjectList => ({
    id: savedList.id || key,
    label: savedList.label || key,
    entries: (savedList.entries ?? []).flatMap((entry) => {
      if (
        (entry.kind !== "sid" && entry.kind !== "list") ||
        typeof entry.value !== "string"
      ) {
        return [];
      }
      return [{
        key: entry.key || uniqueKey(),
        kind: entry.kind,
        value: entry.value,
        weight: Number(entry.weight) || 0
      }];
    })
  });

export const normalizeSavedEdge = (edge: SavedEdge): Edge => ({
    id: edge.id || `${edge.from || ""}__${edge.to || ""}`,
    from: edge.from || "",
    to: edge.to || "",
    guardValue: Number(edge.guardValue) || 0,
    road: edge.road !== false,
    roadType: edge.roadType === 'Stone' || edge.roadType === 'Dirt' ? edge.roadType : undefined,
    connectionType:
      edge.connectionType !== undefined &&
      (CONNECTION_TYPES as readonly string[]).includes(edge.connectionType)
        ? edge.connectionType
        : "Direct",
    length: edge.length === undefined ? 0.1 : Number(edge.length),
    simTurnSquad: typeof edge.simTurnSquad === "boolean" ? edge.simTurnSquad : undefined,
    guardWeeklyIncrement: edge.guardWeeklyIncrement !== undefined ? Number(edge.guardWeeklyIncrement) : undefined,
    guardEscape: typeof edge.guardEscape === "boolean" ? edge.guardEscape : undefined,
    guardRandomization: edge.guardRandomization !== undefined ? Number(edge.guardRandomization) : undefined,
    guardZone: typeof edge.guardZone === "string" && edge.guardZone ? edge.guardZone : undefined,
    gatePlacement: typeof edge.gatePlacement === "string" && edge.gatePlacement ? edge.gatePlacement : undefined,
    guardMatchGroup: typeof edge.guardMatchGroup === "string" && edge.guardMatchGroup ? edge.guardMatchGroup : undefined,
    rawFields: edge.rawFields
  });

export const normalizeZone = (
    zone: SavedZone,
    objectLibrary: CatalogItem[],
    factions: Faction[],
    zonesList: Zone[],
    missing: string[],
    customPresets: Record<string, Preset>,
    hasCatalog: boolean,
    customLists?: Record<string, CustomObjectList>
  ): Zone => {
    const presets = customPresets;
    const requestedType =
      typeof zone.type === "string" ? zone.type : "neutral";
    const type =
      presets[requestedType] || zoneTypes[requestedType]
        ? requestedType
        : "neutral";
    const preset = presets[type] || defaultPresets[type] || defaultPresets.neutral;
    const legacyCityEnabled = Boolean(zone?.mainCity);
    const cityEnabled = Boolean(zone?.cityEnabled ?? legacyCityEnabled);
    const legacyBiomeSource = zone?.factionSource || zone?.cityFactionSource || "";
    const hasOwnBiome = preset.baseType === "spawn" || cityEnabled || (Array.isArray(zone?.mainObjects) && zone.mainObjects.length > 0);
    
    let biomeMode = ["own", "random", "spawn", "specific"].includes(zone.biomeMode || "")
      ? (zone.biomeMode as BiomeMode)
      : legacyBiomeSource
        ? "spawn"
        : hasOwnBiome
          ? "own"
          : preset.baseType === "neutral"
            ? "specific"
            : "random";
            
    if (biomeMode === "own" && !hasOwnBiome) {
      biomeMode = preset.baseType === "neutral" ? "specific" : "random";
    }

    const shortLabel = preset.isCustom ? preset.label.substring(0, 3) : (zoneTypes[preset.baseType]?.short || "Z");

    const mainObjects: ZoneMainObject[] = [];
    if (Array.isArray(zone?.mainObjects)) {
      zone.mainObjects.forEach((mo) => {
        mainObjects.push({
          key: mo.key || uniqueKey(),
          type: mo.type === 'Spawn' || mo.type === 'City' || mo.type === 'AbandonedOutpost' || mo.type === 'GladiatorArena'
            ? mo.type
            : 'City',
          player: mo.player !== undefined && mo.player !== null ? Number(mo.player) : null,
          factionMode: mo.factionMode || 'random',
          factionSource: mo.factionSource || '',
          factionId: mo.factionId || '',
          holdCityWinCon: mo.holdCityWinCon !== undefined ? Boolean(mo.holdCityWinCon) : false,
          owner: mo.owner !== undefined && mo.owner !== null ? Number(mo.owner) : null,
          buildingsConstructionSid: typeof mo.buildingsConstructionSid === 'string' && mo.buildingsConstructionSid
            ? mo.buildingsConstructionSid
            : undefined,
          guardValue: mo.guardValue !== undefined ? Number(mo.guardValue) : undefined,
          guardChance: mo.guardChance !== undefined ? Number(mo.guardChance) : undefined,
          guardWeeklyIncrement: mo.guardWeeklyIncrement !== undefined ? Number(mo.guardWeeklyIncrement) : undefined,
          removeGuardIfHasOwner: typeof mo.removeGuardIfHasOwner === 'boolean' ? mo.removeGuardIfHasOwner : undefined,
          placement: mo.placement === 'Uniform' || mo.placement === 'Center' || mo.placement === 'Connection' || mo.placement === 'NearZone'
            ? mo.placement
            : undefined,
          placementArgs: Array.isArray(mo.placementArgs) ? mo.placementArgs.map(String) : undefined,
          rawFields: mo.rawFields
        });
      });
    } else {
      // Migrate legacy single fields to mainObjects
      if (preset.baseType === "spawn") {
        mainObjects.push({
          key: uniqueKey(),
          type: 'Spawn',
          player: Number(zone?.player) || 1,
          factionMode: 'random',
          factionId: factions[0]?.id || ''
        });
      }
      if (cityEnabled) {
        const cityFactionMode = ["random", "spawn", "specific"].includes(zone.cityFactionMode || "")
          ? (zone.cityFactionMode as CityFactionMode)
          : legacyCityEnabled && zone?.factionSource ? "spawn" : "random";
        mainObjects.push({
          key: uniqueKey(),
          type: 'City',
          factionMode: cityFactionMode,
          factionSource: zone?.cityFactionSource || (legacyCityEnabled ? zone?.factionSource || "" : ""),
          factionId: zone?.cityFactionId || factions[0]?.id || ""
        });
      }
    }

    const normalized: Zone = {
      id:
        zone.id ||
        uniqueZoneId(
          zonesList,
          `${zoneIdPrefix(preset.baseType)}-${zonesList.length + 1}`
        ),
      label: preset.baseType === "medium" && zone?.label === "M+O" ? "M" : zone?.label || shortLabel,
      type,
      x: Number.isFinite(Number(zone?.x)) ? Number(zone.x) : 0.5,
      y: Number.isFinite(Number(zone?.y)) ? Number(zone.y) : 0.5,
      size: Number(zone?.size) || 1,
      biomeMode,
      biomeSource: zone?.biomeSource || legacyBiomeSource,
      biomeId:
        typeof zone.biomeId === "string" && biomeIds.includes(zone.biomeId)
          ? zone.biomeId
          : preset.baseType === "neutral"
            ? "Sand"
            : "Grass",
      mainObjects,
      guardedValue: Number(zone?.guardedValue ?? preset.guardedValue) || 0,
      unguardedValue: Number(zone?.unguardedValue ?? preset.unguardedValue) || 0,
      resourcesValue: Number(zone?.resourcesValue ?? preset.resourcesValue) || 0,
      guardedValuePerArea: zone?.guardedValuePerArea !== undefined ? Number(zone.guardedValuePerArea) : undefined,
      unguardedValuePerArea: zone?.unguardedValuePerArea !== undefined ? Number(zone.unguardedValuePerArea) : undefined,
      resourcesValuePerArea: zone?.resourcesValuePerArea !== undefined ? Number(zone.resourcesValuePerArea) : undefined,
      guardCutoffValue: zone?.guardCutoffValue !== undefined ? Number(zone.guardCutoffValue) : undefined,
      guardRandomization: zone?.guardRandomization !== undefined ? Number(zone.guardRandomization) : undefined,
      guardMultiplier: zone?.guardMultiplier !== undefined ? Number(zone.guardMultiplier) : undefined,
      guardWeeklyIncrement: zone?.guardWeeklyIncrement !== undefined ? Number(zone.guardWeeklyIncrement) : undefined,
      guardReactionDistribution: Array.isArray(zone?.guardReactionDistribution)
        ? zone.guardReactionDistribution.map(Number)
        : undefined,
      diplomacyModifier: zone?.diplomacyModifier !== undefined ? Number(zone.diplomacyModifier) : undefined,
      contentBiomeMode: zone?.contentBiomeMode && ['land', 'own', 'random', 'spawn', 'specific'].includes(zone.contentBiomeMode)
        ? zone.contentBiomeMode
        : undefined,
      contentBiomeSource: typeof zone?.contentBiomeSource === 'string' ? zone.contentBiomeSource : undefined,
      contentBiomeId: typeof zone?.contentBiomeId === 'string' ? zone.contentBiomeId : undefined,
      metaBiomeMode: zone?.metaBiomeMode && ['land', 'own', 'random', 'spawn', 'specific'].includes(zone.metaBiomeMode)
        ? zone.metaBiomeMode
        : undefined,
      metaBiomeSource: typeof zone?.metaBiomeSource === 'string' ? zone.metaBiomeSource : undefined,
      metaBiomeId: typeof zone?.metaBiomeId === 'string' ? zone.metaBiomeId : undefined,
      encounterHolesSettings:
        zone?.encounterHolesSettings &&
        typeof zone.encounterHolesSettings.affectedEncounters === 'number' &&
        typeof zone.encounterHolesSettings.twoHoleEncounters === 'number'
          ? {
              affectedEncounters: zone.encounterHolesSettings.affectedEncounters,
              twoHoleEncounters: zone.encounterHolesSettings.twoHoleEncounters
            }
          : undefined,
      contentCountLimits: Array.isArray(zone?.contentCountLimits)
        ? zone.contentCountLimits.filter((name): name is string => typeof name === 'string')
        : undefined,
      guardedContentPool: Array.isArray(zone?.guardedContentPool)
        ? zone.guardedContentPool.filter((name): name is string => typeof name === 'string')
        : undefined,
      unguardedContentPool: Array.isArray(zone?.unguardedContentPool)
        ? zone.unguardedContentPool.filter((name): name is string => typeof name === 'string')
        : undefined,
      resourcesContentPool: Array.isArray(zone?.resourcesContentPool)
        ? zone.resourcesContentPool.filter((name): name is string => typeof name === 'string')
        : undefined,
      objects: Array.isArray(zone?.objects)
        ? (hasCatalog
          ? resolveSavedObjects(zone.objects, objectLibrary, missing, customLists)
          : zone.objects.map(normalizeSavedZoneObject))
        : (hasCatalog
          ? resolvePresetToZoneObjects(resolveSavedObjects(preset.objects, objectLibrary, missing, customLists))
          : resolvePresetToZoneObjects(preset.objects)),
      layout: zone?.layout,
      mandatoryContent: zone?.mandatoryContent,
      roads: zone?.roads,
      rawFields: zone?.rawFields,
      rawMandatoryContent: zone?.rawMandatoryContent,
      importedObjects: zone?.importedObjects,
      originalZoneBiome: zone?.originalZoneBiome,
      originalContentBiome: zone?.originalContentBiome,
      originalMetaObjectsBiome: zone?.originalMetaObjectsBiome
    };
    
    // Clear unavailable town distances if there are no main towns/spawns
    if (mainObjects.length === 0) {
      for (const item of normalized.objects) item.townDistance = "any";
    }
    
    return normalized;
  };

const normalizeBanList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
    : [];

const normalizeStartingBonuses = (value: unknown): StartingBonus[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Partial<StartingBonus> & { parameters?: unknown };
        if (typeof record.sid !== "string" || !record.sid) return [];
        return [{
          sid: record.sid,
          receiverSide: Number.isFinite(Number(record.receiverSide)) ? Number(record.receiverSide) : -1,
          receiverFilter: typeof record.receiverFilter === "string" ? record.receiverFilter : "",
          parameters: Array.isArray(record.parameters) ? record.parameters.map(String) : []
        }];
      })
    : [];

export const normalizeSettings = (settings: Partial<MapSettings>): MapSettings => {
    // Win conditions are independent flags (the source of truth). Migrate legacy
    // designs that only stored a single victoryMode (no lostStartCity/cityHold
    // flag fields) into the flag set; gladiator/tournament already had their own
    // fields. victoryMode itself is then derived from the flags.
    const legacyVictory = settings.lostStartCityEnabled === undefined
      && settings.cityHoldEnabled === undefined
      && settings.classicEnabled === undefined;
    const legacyMode = legacyVictory ? settings.victoryMode : undefined;
    const legacyDays = Math.max(1, Number((settings as { victoryDays?: number }).victoryDays) || 3);

    const classicEnabled = legacyVictory ? true : settings.classicEnabled !== false;
    const lostStartCityEnabled = legacyVictory
      ? (legacyMode === 'capitalCapture' || legacyMode === 'capitalHold')
      : Boolean(settings.lostStartCityEnabled);
    const lostStartCityDay = legacyVictory
      ? (legacyMode === 'capitalCapture' ? 0 : legacyMode === 'capitalHold' ? legacyDays : 0)
      : Math.max(0, Number(settings.lostStartCityDay) || 0);
    const cityHoldEnabled = legacyVictory ? legacyMode === 'cityHold' : Boolean(settings.cityHoldEnabled);
    const cityHoldDays = legacyVictory && legacyMode === 'cityHold'
      ? legacyDays
      : Math.max(1, Number(settings.cityHoldDays) || 6);
    const gladiatorArenaEnabled = Boolean(settings.gladiatorArenaEnabled);
    const tournamentEnabled = Boolean(settings.tournamentEnabled);

    return {
      name: settings.name || "Custom RMG Template",
      description: typeof settings.description === "string" ? settings.description : defaultTemplateDescription,
      sizeX: settings.sizeX || 128,
      sizeZ: settings.sizeZ || 128,
      // The game supports 2..8 players
      players: Math.min(8, Math.max(2, Number(settings.players) || 2)),
      victoryMode: primaryVictoryMode({
        tournamentEnabled, gladiatorArenaEnabled, cityHoldEnabled, lostStartCityEnabled, lostStartCityDay
      }),
      displayWinCondition: typeof settings.displayWinCondition === 'string' && settings.displayWinCondition
        ? settings.displayWinCondition
        : "win_condition_1",
      classicEnabled,
      lostStartCityEnabled,
      lostStartCityDay,
      cityHoldEnabled,
      cityHoldDays,
      victoryCityZoneId: settings.victoryCityZoneId || "",
      singleHero: Boolean(settings.singleHero),
      desertionEnabled: settings.desertionEnabled !== false,
      desertionDay: Math.max(1, Number(settings.desertionDay) || 3),
      desertionValue: Math.max(0, Number(settings.desertionValue) || 3000),
      heroLightingEnabled: settings.heroLightingEnabled !== false,
      heroLightingDay: Math.max(1, Number(settings.heroLightingDay) || 1),
      heroLimitMode: ["fixed", "perCastle"].includes(settings.heroLimitMode || '') ? settings.heroLimitMode! : "perCastle",
      heroMin: Math.max(1, Number(settings.heroMin) || 1),
      heroMax: Math.max(1, Number(settings.heroMax) || 12),
      heroIncrement: Math.max(0, Number(settings.heroIncrement) || 0),
      singleHeroMode: Boolean(settings.singleHeroMode),
      heroHireBan: Boolean(settings.heroHireBan),
      encounterHoles: Boolean(settings.encounterHoles),
      factionLawsExpModifier: Number.isFinite(Number(settings.factionLawsExpModifier))
        ? Math.max(0, Number(settings.factionLawsExpModifier))
        : 1,
      astrologyExpModifier: Number.isFinite(Number(settings.astrologyExpModifier))
        ? Math.max(0, Number(settings.astrologyExpModifier))
        : 1,
      fixedOrientation: Boolean(settings.fixedOrientation),
      preserveLayout: Boolean(settings.preserveLayout),
      orientationAnchor: settings.orientationAnchor || "",
      borderWaterWidth: Math.max(0, Number(settings.borderWaterWidth) || 0),
      borderCornerRadius: Math.max(0, Number(settings.borderCornerRadius) || 0),
      bannedItems: normalizeBanList(settings.bannedItems),
      bannedSpells: normalizeBanList(settings.bannedSpells),
      bannedHeroes: normalizeBanList(settings.bannedHeroes),
      startingBonuses: normalizeStartingBonuses(settings.startingBonuses),
      valueOverrides: Array.isArray(settings.valueOverrides)
        ? settings.valueOverrides.flatMap((entry) => {
            if (!entry || typeof entry.sid !== 'string' || !entry.sid) return [];
            return [{
              sid: entry.sid,
              variant: entry.variant !== undefined ? Number(entry.variant) : undefined,
              guardValue: Number(entry.guardValue) || 0
            }];
          })
        : [],
      language: settings.language || "ru",
      gladiatorArenaEnabled: Boolean(settings.gladiatorArenaEnabled),
      // 0 is a valid "start immediately" value (e.g. the Battle-for-Capital
      // preset), so don't treat it as missing or clamp it up to 1.
      gladiatorArenaDaysDelayStart: Math.max(0, Number.isFinite(Number(settings.gladiatorArenaDaysDelayStart)) ? Number(settings.gladiatorArenaDaysDelayStart) : 30),
      gladiatorArenaCountDay: Math.max(1, Number(settings.gladiatorArenaCountDay) || 3),
      gladiatorArenaRegistrationStartFight: settings.gladiatorArenaRegistrationStartFight !== false,
      gladiatorArenaChampionRule: typeof settings.gladiatorArenaChampionRule === 'string' ? settings.gladiatorArenaChampionRule : 'StartHero',
      tournamentEnabled: Boolean(settings.tournamentEnabled),
      tournamentPointsToWin: Math.max(1, Number(settings.tournamentPointsToWin) || 2),
      tournamentSaveArmy: settings.tournamentSaveArmy !== false,
      tournamentDays: Array.isArray(settings.tournamentDays) ? settings.tournamentDays : [3, 3, 3],
      tournamentAnnounceDays: Array.isArray(settings.tournamentAnnounceDays) ? settings.tournamentAnnounceDays : [7, 14, 21],
      terrainProfiles: normalizeTerrainProfiles(settings.terrainProfiles),
      contentLimitPresets: normalizeContentLimitPresets(settings.contentLimitPresets),
      contentPoolPresets: normalizeContentPoolPresets(settings.contentPoolPresets),
      originalZoneLayouts: settings.originalZoneLayouts,
      originalContentLists: settings.originalContentLists,
      originalGameRules: settings.originalGameRules,
      originalWinConditions: settings.originalWinConditions,
      originalOrientation: settings.originalOrientation,
      originalBorder: settings.originalBorder,
      originalRawRootFields: settings.originalRawRootFields
    };
  };

export function normalizeSavedZones(
  savedZones: SavedZone[],
  objectLibrary: CatalogItem[],
  factions: Faction[],
  customPresets: Record<string, Preset>,
  missing: string[],
  hasCatalog: boolean,
  customLists?: Record<string, CustomObjectList>
): Zone[] {
  const result: Zone[] = [];
  for (const savedZone of savedZones) {
    result.push(
      normalizeZone(
        savedZone,
        objectLibrary,
        factions,
        result,
        missing,
        customPresets,
        hasCatalog,
        customLists
      )
    );
  }
  return result;
}
