import type {
  CatalogItem,
  CustomObjectList,
  MapSettings,
  Zone,
  Edge
} from '../types/editor';
import { biomeIds } from '../store/useEditorStore';
import { defaultContentLimitPresets, defaultTerrainProfiles } from '../store/constants';

const knownMapSizes = new Set([80, 96, 112, 128, 144, 160, 176, 192, 208, 240, 256]);
const defaultProfileNames = new Set(defaultTerrainProfiles().map((profile) => profile.name));
const defaultLimitNames = new Set(defaultContentLimitPresets().map((preset) => preset.name));

// Pool names the exporter can synthesize itself (the visual_pool_* fallback
// set and the resource-pool defaults), so references to them are never broken.
const autoPoolNames = new Set([
  'visual_pool_guarded_start', 'visual_pool_unguarded_start',
  'visual_pool_guarded_low', 'visual_pool_unguarded_low',
  'visual_pool_guarded_medium', 'visual_pool_unguarded_medium',
  'visual_pool_guarded_high', 'visual_pool_unguarded_high',
  'content_pool_general_resources_start_zone_poor',
  'content_pool_general_resources_side_zone_poor'
]);

function zoneHasMainObject(zone: Zone): boolean {
  return (zone.mainObjects || []).length > 0;
}

function validBiomeSource(source: string, zone: Zone, zones: Zone[]): boolean {
  return zones.some((candidate) => 
    (candidate.type === "spawn" || (candidate.mainObjects || []).some(mo => mo.type === "Spawn")) && 
    candidate.id === source && 
    candidate.id !== zone.id
  );
}

function connectedZoneComponents(zones: Zone[], edges: Edge[]): string[][] {
  const neighbors = new Map<string, Set<string>>(zones.map((zone) => [zone.id, new Set<string>()]));
  for (const edgeData of edges) {
    if (!neighbors.has(edgeData.from) || !neighbors.has(edgeData.to)) continue;
    neighbors.get(edgeData.from)!.add(edgeData.to);
    neighbors.get(edgeData.to)!.add(edgeData.from);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  
  for (const zone of zones) {
    if (visited.has(zone.id)) continue;
    const component: string[] = [];
    const pending = [zone.id];
    visited.add(zone.id);
    while (pending.length) {
      const current = pending.pop()!;
      component.push(current);
      for (const next of neighbors.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        pending.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function summarizeMissingItems(items: string[]): string {
  const visible = items.slice(0, 10);
  const remainder = items.length - visible.length;
  return `${visible.join(", ")}${remainder > 0 ? ` (+${remainder})` : ""}`;
}

export type ValidationMessage = ['ok' | 'warn' | 'error', string];

export function validate(
  settings: MapSettings,
  zones: Zone[],
  edges: Edge[],
  hasCatalog: boolean,
  missingPresetItems: string[],
  missingImportedObjects: string[],
  t: (key: string, params?: Record<string, string | number>) => string,
  customObjectLists?: Record<string, CustomObjectList>,
  catalogItems?: CatalogItem[],
  builtInPoolNames?: string[]
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const builtInPoolSet = new Set(builtInPoolNames ?? []);
  const sizeX = Number(settings.sizeX);
  const sizeZ = Number(settings.sizeZ);
  
  if (!Number.isInteger(sizeX) || !Number.isInteger(sizeZ) || sizeX < 36 || sizeZ < 36) {
    messages.push(["error", t("mapSizeInvalid")]);
  } else if (sizeX !== sizeZ) {
    messages.push(["warn", t("mapSizeNonSquare", { x: sizeX, z: sizeZ })]);
  } else if (!knownMapSizes.has(sizeX)) {
    messages.push(["warn", t("mapSizeCustom", { x: sizeX, z: sizeZ })]);
  }
  
  if (hasCatalog) {
    if (missingPresetItems.length) {
      messages.push(["warn", t("missingPresetObjects", {
        count: missingPresetItems.length,
        items: summarizeMissingItems(missingPresetItems)
      })]);
    }
    if (missingImportedObjects.length) {
      messages.push(["warn", t("missingImportedObjects", {
        count: missingImportedObjects.length,
        items: summarizeMissingItems(missingImportedObjects)
      })]);
    }
  }
  
  if (!zones.length) {
    messages.push(["ok", t("emptyCanvas")]);
    return messages;
  }
  
  const starts = zones.filter((z) => (z.mainObjects || []).some(mo => mo.type === "Spawn"));
  if (settings.heroLimitMode !== "fixed" && Number(settings.heroMax) < Number(settings.heroMin)) {
    messages.push(["error", t("heroLimitInvalid")]);
  }
  
  if (starts.length !== Number(settings.players)) {
    messages.push(["error", t("startsMismatch", { starts: starts.length, players: settings.players })]);
  }

  // Gladiator Arena validation
  if (settings.gladiatorArenaEnabled) {
    if (starts.length < 2) {
      messages.push(["warn", t("gladiatorArenaRequiresSpawns")]);
    }
    if (Number(settings.gladiatorArenaCountDay) <= 0) {
      messages.push(["warn", t("gladiatorArenaPrepDaysInvalid")]);
    }
    if (!zones.some((zone) => (zone.mainObjects || []).some((mo) => mo.type === "GladiatorArena"))) {
      messages.push(["warn", t("gladiatorArenaObjectMissing")]);
    }
  }

  const arenaCount = zones.reduce(
    (count, zone) => count + (zone.mainObjects || []).filter((mo) => mo.type === "GladiatorArena").length,
    0
  );
  if (arenaCount > 1) {
    messages.push(["warn", t("gladiatorArenaTooMany", { count: arenaCount })]);
  }

  // Tournament validation
  if (settings.tournamentEnabled) {
    if (starts.length < 2) {
      messages.push(["warn", t("tournamentRequiresSpawns")]);
    }
    if (settings.tournamentDays.length !== settings.tournamentAnnounceDays.length) {
      messages.push(["warn", t("tournamentArraysLengthMismatch")]);
    }
  }
  
  if (settings.victoryMode === 'cityHold') {
    if (!settings.victoryCityZoneId) {
      messages.push(["error", t("victoryCityNotSelected")]);
    } else {
      const targetZone = zones.find(z => z.id === settings.victoryCityZoneId);
      if (!targetZone) {
        messages.push(["error", t("victoryCityNotFound", { id: settings.victoryCityZoneId })]);
      } else if (targetZone.type === 'spawn') {
        messages.push(["error", t("victoryCityIsSpawn", { id: targetZone.id })]);
      } else {
        const hasVictoryCity = (targetZone.mainObjects || []).some(obj => obj.type === 'City' && obj.holdCityWinCon);
        if (!hasVictoryCity) {
          messages.push(["error", t("victoryCityNoCity", { id: targetZone.id })]);
        }
      }
    }
  }
  
  const ids = new Set<string>();
  for (const zone of zones) {
    if (ids.has(zone.id)) {
      messages.push(["error", t("duplicateZone", { id: zone.id })]);
    }
    ids.add(zone.id);
    
    if (!["spawn", "blank"].includes(zone.type) && !zone.objects.length) {
      messages.push(["warn", t("emptyZone", { id: zone.id })]);
    }
    
    for (const obj of zone.mainObjects || []) {
      if (obj.type === "City") {
        if (obj.factionMode === "spawn") {
          const source = zones.find((candidate) => candidate.id === obj.factionSource);
          if (!source || !source.mainObjects?.some(mo => mo.type === 'Spawn')) {
            messages.push(["warn", t("cityMissingSpawnSource", { id: zone.id })]);
          }
        }
        if (obj.factionMode === "specific" && !obj.factionId) {
          messages.push(["warn", t("cityMissingSpecificFaction", { id: zone.id })]);
        }
      }
      if (obj.placement === "Connection") {
        const ref = obj.placementArgs?.[0];
        if (!ref || !edges.some((e) => e.id === ref && (e.from === zone.id || e.to === zone.id))) {
          messages.push(["warn", t("placementConnectionMissing", { id: zone.id })]);
        }
      }
      if (obj.placement === "NearZone") {
        const ref = obj.placementArgs?.[0];
        if (!ref || !zones.some((candidate) => candidate.id === ref)) {
          messages.push(["warn", t("placementNearZoneMissing", { id: zone.id })]);
        }
      }
    }
    
    if (zone.biomeMode === "own" && !zoneHasMainObject(zone)) {
      messages.push(["warn", t("biomeOwnWithoutCity", { id: zone.id })]);
    }
    if (zone.biomeMode === "spawn" && !validBiomeSource(zone.biomeSource, zone, zones)) {
      messages.push(["warn", t("biomeMissingSpawnSource", { id: zone.id })]);
    }
    if (zone.biomeMode === "specific" && !biomeIds.includes(zone.biomeId)) {
      messages.push(["warn", t("biomeUnknown", { id: zone.id })]);
    }
    
    if (!zoneHasMainObject(zone) && zone.objects.some((entry) => entry.townDistance && entry.townDistance !== "any")) {
      messages.push(["warn", t("objectTownNeedsMainObject", { id: zone.id })]);
    }

    // The exporter auto-appends the editor's six default profiles when a zone
    // references one of their names, so only truly unknown names are broken.
    if (
      zone.layout &&
      !(settings.terrainProfiles || []).some((profile) => profile.name === zone.layout) &&
      !defaultProfileNames.has(zone.layout)
    ) {
      messages.push(["warn", t("zoneTerrainProfileMissing", { id: zone.id, name: zone.layout })]);
    }

    // Same contract for content-limit presets: the exporter appends the two
    // built-in stubs on demand, anything else must exist in the model.
    for (const ref of zone.contentCountLimits ?? []) {
      if (
        !(settings.contentLimitPresets || []).some((preset) => preset.name === ref) &&
        !defaultLimitNames.has(ref)
      ) {
        messages.push(["warn", t("zoneContentLimitMissing", { id: zone.id, name: ref })]);
      }
    }

    // Content pool references must resolve to a model pool, a name the
    // exporter generates itself, or one of the game's built-in pools (defined
    // in Core, not in the template — official templates reference them).
    for (const ref of [
      ...(zone.guardedContentPool ?? []),
      ...(zone.unguardedContentPool ?? []),
      ...(zone.resourcesContentPool ?? [])
    ]) {
      if (
        !(settings.contentPoolPresets || []).some((pool) => pool.name === ref) &&
        !autoPoolNames.has(ref) &&
        !builtInPoolSet.has(ref)
      ) {
        messages.push(["warn", t("zoneContentPoolMissing", { id: zone.id, name: ref })]);
      }
    }

    // The engine expects exactly six reaction weights (the enum length).
    if (zone.guardReactionDistribution && zone.guardReactionDistribution.length !== 6) {
      messages.push(["error", t("zoneReactionLengthInvalid", {
        id: zone.id,
        count: zone.guardReactionDistribution.length
      })]);
    }
  }
  
  for (const edgeData of edges) {
    if (!ids.has(edgeData.from) || !ids.has(edgeData.to)) {
      messages.push(["error", t("brokenEdge", { id: edgeData.id })]);
    }
    if (Number(edgeData.guardValue) < 0) {
      messages.push(["error", t("negativeGuard", { id: edgeData.id })]);
    }
  }
  
  // Springs (Proximity) only pull zones together without creating a passage,
  // so connectivity is judged on the remaining edges.
  const passableEdges = edges.filter((e) => e.connectionType !== "Proximity");
  for (const zone of zones) {
    const degree = passableEdges.filter((e) => e.from === zone.id || e.to === zone.id).length;
    if (degree === 0) {
      messages.push(["warn", t("disconnectedZone", { id: zone.id })]);
    }
  }

  // A split passage graph only matters when players are meant to reach one
  // another. Tournament and gladiator-arena win conditions are scored / decided
  // without a land route between sides — the official "Exodus" tournament map,
  // for instance, splits into one isolated race track per player on purpose — so
  // the split is by design there and we stay silent. For the remaining (combat)
  // win conditions it is a soft warning, not a hard error: the engine itself
  // doesn't require one connected graph, this is an editor heuristic.
  const parallelWin = settings.tournamentEnabled || settings.gladiatorArenaEnabled;
  const components = connectedZoneComponents(zones, passableEdges);
  if (components.length > 1 && !parallelWin) {
    const groups = components.map((component) => component.join(", ")).join(" | ");
    messages.push(["warn", t("disconnectedGraph", { count: components.length, groups })]);
  }

  // The game's parser requires weights.length === priceBounds.length + 1.
  for (const pool of settings.contentPoolPresets || []) {
    const distribution = pool.valueDistribution;
    if (distribution && distribution.weights.length !== distribution.priceBounds.length + 1) {
      messages.push(["error", t("poolDistributionInvalid", {
        name: pool.name,
        weights: distribution.weights.length,
        bounds: distribution.priceBounds.length
      })]);
    }
  }

  if (customObjectLists) {
    const catalogSids = new Set(catalogItems?.map(item => item.sid || item.id) || []);
    
    for (const [listId, list] of Object.entries(customObjectLists)) {
      const seenEntries = new Set<string>();
      
      for (const entry of list.entries || []) {
        const value = entry.value;
        if (!value) continue;
        
        if (seenEntries.has(value)) {
          messages.push([
            "warn",
            t("customListDuplicateEntry", { listId, value })
          ]);
        }
        seenEntries.add(value);
        
        if (entry.kind === 'sid') {
          if (hasCatalog && catalogSids.size > 0 && !catalogSids.has(value)) {
            messages.push([
              "warn",
              t("customListObjectNotFound", { listId, sid: value })
            ]);
          }
        } else if (entry.kind === 'list') {
          if (!customObjectLists[value]) {
            messages.push([
              "warn",
              t("customListNestedNotFound", { listId, nestedId: value })
            ]);
          }
        }
      }
    }
  }
  
  return messages;
}
