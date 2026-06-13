import type { StoreContext } from '../context';
import type { EditorActions, EditorStoreState } from '../types';
import type { Edge, Zone, ZoneMainObject } from '../../types/editor';
import type { TemplateRecipeTopology } from '../templateRecipes';
import { buildTopologyPlan } from '../../services/topologyGenerator';
import { captureHistory, pushHistory, defaultGuardForPair, makeZone, uniqueZoneId, zoneContentScale, zoneIdPrefix } from '../zones';
import { defaultPresets } from '../presets';
import { zoneTypes } from '../constants';
import { uniqueKey } from '../ids';

/**
 * Builds the zones and edges for a topology plan. Shared by the wizard and
 * the whole-template recipes; the full zone count is known upfront, so every
 * zone gets the correct area scale immediately.
 */
function buildSkeleton(
  state: EditorStoreState,
  options: TemplateRecipeTopology
): { zones: Zone[]; edges: Edge[]; centerZoneId: string | null } {
  const plan = buildTopologyPlan(options);

  const resolvePreset = (id: string, fallback: keyof typeof defaultPresets) =>
    state.presets[id] || defaultPresets[fallback];
  const spawnPreset = resolvePreset(options.spawnPresetId, 'spawn');
  const centerPreset = resolvePreset(options.centerPresetId, 'high');
  // Neutral richness gradient by distance from the players: near / mid / far.
  const neutralPresets = [
    resolvePreset(options.nearPresetId, 'low'),
    resolvePreset(options.midPresetId, 'medium'),
    resolvePreset(options.farPresetId, 'high')
  ];

  const valueScale = zoneContentScale(
    state.settings.sizeX,
    state.settings.sizeZ,
    plan.zones.length,
    1
  );

  const zones: Zone[] = [];
  let centerZoneId: string | null = null;
  for (const planZone of plan.zones) {
    const preset = planZone.role === 'spawn'
      ? spawnPreset
      : planZone.role === 'center'
        ? centerPreset
        : neutralPresets[planZone.distanceTier ?? 0];
    const meta = zoneTypes[preset.baseType] || zoneTypes.neutral;
    const label = preset.isCustom ? preset.label.substring(0, 3) : meta.short;
    const id = uniqueZoneId(zones, `${zoneIdPrefix(preset.baseType)}-${zones.length + 1}`);
    if (planZone.role === 'center') centerZoneId = id;
    zones.push(makeZone(zones, state.objectLibrary, state.factions, {
      id,
      label,
      type: preset.id,
      x: planZone.x,
      y: planZone.y,
      player: planZone.role === 'spawn' ? planZone.player ?? null : null
    }, preset, valueScale));
  }

  const edges: Edge[] = plan.edges.map(([a, b]) => ({
    id: `${zones[a].id}__${zones[b].id}`,
    from: zones[a].id,
    to: zones[b].id,
    guardValue: defaultGuardForPair(zones, zones[a].id, zones[b].id),
    road: true,
    connectionType: 'Direct' as const,
    length: 0.1,
    simTurnSquad: true
  }));

  return { zones, edges, centerZoneId };
}

/** Guard ladder for extra cities by route depth, after the official duels
 * (Crossroads side city 3000 near, ATestSerp3 40k deep in a Medium zone). */
const CITY_GUARD_BY_DEPTH = [3000, 12000, 24000, 40000];

function makeRecipeCity(factionMode: 'spawn' | 'random', spawnZoneId: string, factionId: string, depth: number): ZoneMainObject {
  return {
    key: uniqueKey(),
    type: 'City',
    factionMode,
    factionSource: factionMode === 'spawn' ? spawnZoneId : '',
    factionId,
    holdCityWinCon: false,
    buildingsConstructionSid: 'default_buildings_construction',
    guardValue: CITY_GUARD_BY_DEPTH[Math.min(Math.max(depth - 1, 0), CITY_GUARD_BY_DEPTH.length - 1)],
    guardChance: 1,
    guardWeeklyIncrement: 0.1,
    placement: 'Uniform',
    placementArgs: ['true', '0.8', '2']
  };
}

/**
 * Extra neutral cities the way official duels author them: spread along each
 * player's side of the map (Crossroads' Side-A/B, Chosen One's Side-Spawn-*),
 * the first one matching the player's faction, the rest random. Zones
 * equidistant from several players (contested buffers) are split between
 * them round-robin so the picture stays symmetric. Center cities follow the
 * Jebus Cross pattern: random factions in the fat middle.
 */
function placeExtraCities(
  zones: Zone[],
  edges: Edge[],
  centerZoneId: string | null,
  perPlayer: number,
  centerCities: number,
  factionId: string
): Zone[] {
  const additions = new Map<string, ZoneMainObject[]>();
  const push = (zoneId: string, obj: ZoneMainObject) =>
    additions.set(zoneId, [...(additions.get(zoneId) || []), obj]);

  if (perPlayer > 0) {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      adjacency.set(edge.from, [...(adjacency.get(edge.from) || []), edge.to]);
      adjacency.set(edge.to, [...(adjacency.get(edge.to) || []), edge.from]);
    }
    const spawnZones = zones.filter((zone) => (zone.mainObjects || []).some((mo) => mo.type === 'Spawn'));
    const distances = new Map<string, Map<string, number>>();
    for (const spawn of spawnZones) {
      const dist = new Map([[spawn.id, 0]]);
      const queue = [spawn.id];
      while (queue.length) {
        const current = queue.shift()!;
        for (const next of adjacency.get(current) || []) {
          if (!dist.has(next)) {
            dist.set(next, dist.get(current)! + 1);
            queue.push(next);
          }
        }
      }
      distances.set(spawn.id, dist);
    }

    // Strict routes: zones closer to this player than to anyone else.
    // Contested buffers (equidistant) are shared territory — they take a
    // player city only when the player's own side is too short for the
    // requested count, and then symmetrically round-robin.
    const routes = new Map<string, Array<{ id: string; depth: number }>>(
      spawnZones.map((spawn) => [spawn.id, []])
    );
    const contested: Array<{ id: string; depth: number }> = [];
    for (const zone of zones) {
      if (zone.id === centerZoneId) continue;
      if ((zone.mainObjects || []).some((mo) => mo.type === 'Spawn')) continue;
      let bestSpawn: string | null = null;
      let bestDepth = Infinity;
      let tie = false;
      for (const spawn of spawnZones) {
        const depth = distances.get(spawn.id)!.get(zone.id);
        if (depth === undefined) continue;
        if (depth < bestDepth) {
          bestDepth = depth;
          bestSpawn = spawn.id;
          tie = false;
        } else if (depth === bestDepth) {
          tie = true;
        }
      }
      if (bestSpawn === null) continue;
      if (tie) contested.push({ id: zone.id, depth: bestDepth });
      else routes.get(bestSpawn)!.push({ id: zone.id, depth: bestDepth });
    }

    const picks = new Map<string, Array<{ id: string; depth: number }>>();
    for (const [spawnId, route] of routes) {
      route.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
      const count = Math.min(perPlayer, route.length);
      const chosen: Array<{ id: string; depth: number }> = [];
      for (let i = 0; i < count; i++) {
        // Spread across the route: quantile positions over the player's zones.
        chosen.push(route[Math.floor(((i + 0.5) * route.length) / count)]);
      }
      picks.set(spawnId, chosen);
    }
    // Top up short sides from the contested buffers, fewest-cities first.
    contested.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
    for (const zone of contested) {
      const candidates = [...picks.entries()]
        .filter(([, chosen]) => chosen.length < perPlayer)
        .sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]));
      if (!candidates.length) break;
      candidates[0][1].push(zone);
    }

    for (const [spawnId, chosen] of picks) {
      chosen.forEach((pick, index) => {
        push(pick.id, makeRecipeCity(index === 0 ? 'spawn' : 'random', spawnId, factionId, pick.depth));
      });
    }
  }

  if (centerCities > 0 && centerZoneId) {
    for (let i = 0; i < centerCities; i++) {
      push(centerZoneId, makeRecipeCity('random', '', factionId, 3));
    }
  }

  if (additions.size === 0) return zones;
  return zones.map((zone) => additions.has(zone.id)
    ? { ...zone, mainObjects: [...(zone.mainObjects || []), ...additions.get(zone.id)!] }
    : zone);
}

export function createTopologyActions(ctx: StoreContext): Pick<EditorActions, 'generateTopology' | 'applyTemplateRecipe'> {
  const { set, saveToStorage } = ctx;
  return {
    generateTopology: (options) => {
      set((state) => {
        const snapshot = captureHistory(state);
        const skeleton = buildSkeleton(state, options);
        const { edges } = skeleton;
        const zones = placeExtraCities(
          skeleton.zones,
          skeleton.edges,
          skeleton.centerZoneId,
          options.extraCitiesPerPlayer ?? 0,
          options.extraCitiesInCenter ?? 0,
          state.factions[0]?.id || ''
        );

        const nextState = {
          zones,
          edges,
          settings: { ...state.settings, players: options.players },
          nextZoneNumber: zones.length + 1,
          selected: null,
          mode: 'select' as const,
          connectStart: null,
          notifications: [...state.notifications, {
            id: uniqueKey(),
            key: 'notificationTopologyGenerated',
            params: { zones: zones.length, edges: edges.length },
            type: 'success' as const
          }],
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    applyTemplateRecipe: (recipe) => {
      set((state) => {
        const snapshot = captureHistory(state);
        const skeleton = buildSkeleton(state, recipe.topology);
        let zones = placeExtraCities(
          skeleton.zones,
          skeleton.edges,
          skeleton.centerZoneId,
          recipe.extraCitiesPerPlayer ?? 0,
          recipe.extraCitiesInCenter ?? 0,
          state.factions[0]?.id || ''
        );

        if (recipe.arenaInCenter && skeleton.centerZoneId) {
          zones = zones.map((zone) => zone.id === skeleton.centerZoneId
            ? {
                ...zone,
                mainObjects: [...(zone.mainObjects || []), {
                  key: uniqueKey(),
                  type: 'GladiatorArena' as const,
                  factionMode: 'random' as const,
                  factionSource: '',
                  factionId: state.factions[0]?.id || '',
                  holdCityWinCon: false,
                  placement: 'Uniform' as const,
                  placementArgs: ['true', '0', '0']
                }]
              }
            : zone);
        }

        const nextState = {
          zones,
          edges: skeleton.edges,
          settings: {
            ...state.settings,
            ...recipe.settings,
            players: recipe.topology.players,
            ...(recipe.name ? { name: recipe.name } : {})
          },
          nextZoneNumber: zones.length + 1,
          selected: null,
          mode: 'select' as const,
          connectStart: null,
          notifications: [...state.notifications, {
            id: uniqueKey(),
            key: 'notificationRecipeApplied',
            params: { name: recipe.name ?? recipe.id },
            type: 'success' as const
          }],
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    }
  };
}
