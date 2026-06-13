import type { Zone, ZoneType, Faction, ZoneMainObject, MapSettings, Edge, Preset, CatalogItem } from '../types/editor';
import type { HistorySnapshot } from './types';
import { uniqueKey, safeName } from './ids';
import { resolvePresetToZoneObjects } from './catalog';

/**
 * Canonical key of an unordered zone pair; used to group all connections
 * between the same two zones (canvas bundles, the pair inspector, the
 * one-spring-per-pair rule).
 */
export function edgePairKey(a: string, b: string): string {
  return [a, b].sort().join('__');
}

export function captureHistory(state: { settings: MapSettings; zones: Zone[]; edges: Edge[] }) {
  return {
    settings: JSON.parse(JSON.stringify(state.settings)),
    zones: JSON.parse(JSON.stringify(state.zones)),
    edges: JSON.parse(JSON.stringify(state.edges))
  };
}

/** How many undo steps are kept. */
const HISTORY_LIMIT = 50;

/** The standard history push used by every undoable action: append the snapshot, clear redo. */
export function pushHistory(
  state: { history: { past: HistorySnapshot[] } },
  snapshot: HistorySnapshot
): { past: HistorySnapshot[]; future: HistorySnapshot[] } {
  return {
    past: [...state.history.past, snapshot].slice(-HISTORY_LIMIT),
    future: []
  };
}

export function zoneIdPrefix(type: ZoneType): string {
  const prefixes: Record<ZoneType, string> = {
    spawn: "Spawn",
    blank: "Blank",
    low: "Low",
    medium: "Medium",
    high: "High",
    neutral: "Neutral"
  };
  return prefixes[type] || "Zone";
}

export function nextPlayerNumber(zones: Zone[]): number {
  const used = new Set<number>();
  for (const z of zones) {
    for (const obj of z.mainObjects || []) {
      if (obj.type === 'Spawn' && typeof obj.player === 'number') {
        used.add(obj.player);
      }
    }
  }
  for (let i = 1; i <= 8; i += 1) {
    if (!used.has(i)) return i;
  }
  return used.size + 1;
}

export function uniqueZoneId(zones: Zone[], base: string): string {
  const clean = safeName(base);
  let id = clean;
  let i = 2;
  while (zones.some((z) => z.id === id)) {
    id = `${clean}-${i++}`;
  }
  return id;
}

export function zoneRank(type: ZoneType): number {
  const ranks: Record<ZoneType, number> = { spawn: 0, blank: 0, low: 1, medium: 2, high: 3, neutral: 1 };
  return ranks[type] ?? 1;
}

export function defaultGuardForPair(zones: Zone[], a: string, b: string): number {
  const za = zones.find((z) => z.id === a);
  const zb = zones.find((z) => z.id === b);
  const rank = Math.max(zoneRank(za?.type || 'neutral'), zoneRank(zb?.type || 'neutral'));
  return [20000, 40000, 80000, 160000, 160000][rank] || 40000;
}

/**
 * Equality for zone-list subscriptions that must stay quiet during canvas
 * drags: x/y are ignored, every other own field — including any added later —
 * is compared shallowly. Arrays/objects compare by reference, which holds
 * because store updates replace them while drags only touch x/y. A field
 * whitelist here once silently froze the inspector for newly added fields.
 */
export function zonesEqualIgnoreCoords(a: Zone[], b: Zone[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const za = a[i] as unknown as Record<string, unknown>;
    const zb = b[i] as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(za), ...Object.keys(zb)]);
    keys.delete('x');
    keys.delete('y');
    for (const key of keys) {
      if (!Object.is(za[key], zb[key])) return false;
    }
  }
  return true;
}

/**
 * Soft area-based scale for preset values: bigger zones get richer, tighter
 * maps get poorer. The reference of 1600 tiles matches the typical official
 * zone (median mapSize² / zone count); the clamp keeps the correction gentle
 * (docs/research-zone-presets.md §4.2).
 */
export function zoneContentScale(sizeX: number, sizeZ: number, totalZones: number, zoneSize: number): number {
  const referenceArea = 1600;
  const zoneArea = ((Number(sizeX) || 128) * (Number(sizeZ) || 128)) / Math.max(1, totalZones) * (zoneSize || 1);
  return Math.min(2, Math.max(0.6, Math.sqrt(zoneArea / referenceArea)));
}

export interface ScaledZoneValues {
  guardedValue: number;
  unguardedValue: number;
  resourcesValue: number;
  guardedValuePerArea?: number;
  unguardedValuePerArea?: number;
  resourcesValuePerArea?: number;
}

/**
 * Preset values adjusted by the area scale: absolute values go with the full
 * scale, the perArea components with its square root (they already grow with
 * the area on the game side). Results are rounded the way official templates
 * are authored — thousands for absolutes, tens for perArea.
 */
export function scalePresetValues(
  preset: Pick<Preset, 'guardedValue' | 'unguardedValue' | 'resourcesValue' | 'guardedValuePerArea' | 'unguardedValuePerArea' | 'resourcesValuePerArea'>,
  scale: number
): ScaledZoneValues {
  const absolute = (value: number) => Math.round((value * scale) / 1000) * 1000;
  const perArea = (value: number | undefined) =>
    value === undefined ? undefined : Math.round((value * Math.sqrt(scale)) / 10) * 10;
  return {
    guardedValue: absolute(preset.guardedValue),
    unguardedValue: absolute(preset.unguardedValue),
    resourcesValue: absolute(preset.resourcesValue),
    guardedValuePerArea: perArea(preset.guardedValuePerArea),
    unguardedValuePerArea: perArea(preset.unguardedValuePerArea),
    resourcesValuePerArea: perArea(preset.resourcesValuePerArea)
  };
}

/**
 * The default starting-castle object the way official templates author it
 * (standard buildings, 10k garrison at 50% with weekly growth, the usual
 * Uniform placement).
 */
export function makeDefaultSpawnObject(player: number, factionId: string): ZoneMainObject {
  return {
    key: uniqueKey(),
    type: 'Spawn',
    player,
    factionMode: 'random',
    factionId,
    buildingsConstructionSid: 'default_buildings_construction',
    guardValue: 10000,
    guardChance: 0.5,
    guardWeeklyIncrement: 0.1,
    removeGuardIfHasOwner: true,
    placement: 'Uniform',
    placementArgs: ['true', '0.7', '0']
  };
}

export function makeZone(_zones: Zone[], _objectLibrary: CatalogItem[], factions: Faction[], params: { id: string; label: string; type: ZoneType; x: number; y: number; player?: number | null }, preset: Preset, valueScale = 1): Zone {
  const mainObjects: ZoneMainObject[] = [];
  if (params.type === 'spawn' || (typeof params.player === 'number' && params.player !== null)) {
    mainObjects.push(makeDefaultSpawnObject(params.player ?? 1, factions[0]?.id || ''));
  }

  return {
    id: params.id,
    label: params.label,
    type: params.type,
    x: params.x,
    y: params.y,
    size: 1,
    biomeMode: preset.biomeMode ?? (preset.baseType === "spawn" ? "own" : preset.baseType === "neutral" ? "specific" : "random"),
    biomeSource: preset.biomeSource ?? "",
    biomeId: preset.biomeId ?? (preset.baseType === "neutral" ? "Sand" : "Grass"),
    mainObjects,
    ...scalePresetValues(preset, valueScale),
    // Explicit editor defaults: guardMultiplier and diplomacyModifier are
    // optional in the game format, so imported zones may omit them, but new
    // zones keep explicit values (the preset's, or the historical defaults).
    guardMultiplier: preset.guardMultiplier ?? 1.4,
    diplomacyModifier: preset.diplomacyModifier ?? -0.25,
    guardCutoffValue: preset.guardCutoffValue,
    guardRandomization: preset.guardRandomization,
    guardWeeklyIncrement: preset.guardWeeklyIncrement,
    guardReactionDistribution: preset.guardReactionDistribution ? [...preset.guardReactionDistribution] : undefined,
    layout: preset.layout,
    objects: resolvePresetToZoneObjects(preset.objects)
  };
}
