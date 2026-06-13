import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { Zone } from '../../types/editor';
import { defaultPresets } from '../presets';
import { zoneTypes, biomeIds } from '../constants';
import { uniqueKey, safeName } from '../ids';
import { captureHistory, pushHistory, edgePairKey, makeDefaultSpawnObject, makeZone, nextPlayerNumber, scalePresetValues, uniqueZoneId, zoneContentScale, zoneIdPrefix } from '../zones';
import { resolvePresetToZoneObjects } from '../catalog';

export function createZoneActions(ctx: StoreContext): Pick<EditorActions, 'addZone' | 'deleteSelected' | 'updateZoneField' | 'setZonePosition' | 'rescaleZoneValues' | 'duplicateSelected'> {
  const { set, saveToStorage } = ctx;
  return {
      addZone: (type) => {
        set((state) => {
          const preset = state.presets[type] || defaultPresets[type] || defaultPresets.neutral;
          if (preset.baseType === 'spawn') {
            const spawnCount = state.zones.reduce((count, z) => count + (z.mainObjects?.filter(mo => mo.type === 'Spawn').length || 0), 0);
            if (spawnCount >= state.settings.players) {
              const newNotification = {
                id: uniqueKey(),
                key: 'notificationAllPlayersHaveSpawns',
                params: { max: state.settings.players },
                type: 'error' as const
              };
              return {
                notifications: [...state.notifications, newNotification]
              };
            }
          }

          const snapshot = captureHistory(state);
          const n = state.nextZoneNumber;
          const meta = zoneTypes[preset.baseType] || zoneTypes.neutral;
          const shortLabel = preset.isCustom ? preset.label.substring(0, 3) : meta.short;
          const id = uniqueZoneId(state.zones, `${zoneIdPrefix(preset.baseType)}-${n}`);
          // New zones get the preset values adjusted to the current map: the
          // count includes the zone being added. Early zones are capped by
          // the clamp; the rescale button re-derives them once the map fills.
          const valueScale = zoneContentScale(
            state.settings.sizeX,
            state.settings.sizeZ,
            state.zones.length + 1,
            1
          );
          const zone = makeZone(state.zones, state.objectLibrary, state.factions, {
            id,
            label: shortLabel,
            type,
            x: 0.5,
            y: 0.5,
            player: preset.baseType === "spawn" ? nextPlayerNumber(state.zones) : null
          }, preset, valueScale);
          
          const newZones = [...state.zones, zone];
          const newNotification = { id: uniqueKey(), key: 'notificationZoneAdded', params: { id: zone.id }, type: 'success' as const };
          const nextState = {
            zones: newZones,
            nextZoneNumber: n + 1,
            selected: { type: 'zone' as const, id: zone.id },
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      deleteSelected: () => {
        set((state) => {
          if (!state.selected) return {};
          const snapshot = captureHistory(state);
          
          let nextZones = state.zones;
          let nextEdges = state.edges;
          let nextSettings = state.settings;
          let newNotification = null;
          
          if (state.selected.type === "zone") {
            const id = state.selected.id;
            nextZones = state.zones.filter((z) => z.id !== id).map(zone => {
              const updated = { ...zone };
              if (updated.biomeSource === id) updated.biomeSource = "";
              if (updated.mainObjects) {
                updated.mainObjects = updated.mainObjects.map(mo => 
                  mo.factionSource === id ? { ...mo, factionSource: "" } : mo
                );
              }
              return updated;
            });
            nextEdges = state.edges.filter((e) => e.from !== id && e.to !== id);
            newNotification = { id: uniqueKey(), key: 'notificationZoneDeleted', params: { id }, type: 'info' as const };
            
            if (state.settings.victoryCityZoneId === id) {
              nextSettings = { ...state.settings, victoryCityZoneId: "" };
            }
          } else if (state.selected.type === "edge") {
            nextEdges = state.edges.filter((e) => e.id !== state.selected!.id);
            newNotification = { id: uniqueKey(), key: 'notificationEdgeDeleted', type: 'info' as const };
          } else if (state.selected.type === "edgePair") {
            const pairId = state.selected.id;
            nextEdges = state.edges.filter((e) => edgePairKey(e.from, e.to) !== pairId);
            newNotification = { id: uniqueKey(), key: 'notificationEdgeDeleted', type: 'info' as const };
          }
          
          const nextState = {
            zones: nextZones,
            edges: nextEdges,
            settings: nextSettings,
            selected: null,
            notifications: newNotification ? [...state.notifications, newNotification] : state.notifications,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      updateZoneField: (zoneId, updates) => {
        set((state) => {
          const zoneIndex = state.zones.findIndex(z => z.id === zoneId);
          if (zoneIndex < 0) return {};
          
          const snapshot = captureHistory(state);
          const updatedZones = [...state.zones];
          const oldZone = updatedZones[zoneIndex];
          
          // ID Change holds special logic (rename references)
          let nextSelected = state.selected;
          let nextEdges = state.edges;
          let nextSettings = state.settings;
          
          const oldId = oldZone.id;
          let newId = updates.id !== undefined ? safeName(updates.id) : oldId;
          
          if (newId && newId !== oldId) {
            // Check uniqueness
            if (state.zones.some(z => z.id === newId)) {
              newId = oldId; // Reset
            } else {
              // Update edges
              nextEdges = state.edges.map(edge => {
                let from = edge.from;
                let to = edge.to;
                if (from === oldId) from = newId;
                if (to === oldId) to = newId;
                return {
                  ...edge,
                  from,
                  to,
                  id: `${from}__${to}`
                };
              });
              
              // Update references
              updatedZones.forEach(z => {
                if (z.biomeSource === oldId) z.biomeSource = newId;
                if (z.mainObjects) {
                  z.mainObjects = z.mainObjects.map(mo => 
                    mo.factionSource === oldId ? { ...mo, factionSource: newId } : mo
                  );
                }
              });
              
              if (state.settings.victoryCityZoneId === oldId) {
                nextSettings = { ...state.settings, victoryCityZoneId: newId };
              }
              
              if (nextSelected && nextSelected.type === 'zone' && nextSelected.id === oldId) {
                nextSelected = { type: 'zone', id: newId };
              }
            }
          } else {
            newId = oldId;
          }
          
          // If we change any content-defining fields and we didn't change the type, reset type to 'custom'
          const contentFields: Array<keyof Zone> = [
            'guardedValue', 'unguardedValue', 'resourcesValue', 'objects', 'mainObjects', 'size'
          ];
          const changedContent = contentFields.some(f => updates[f] !== undefined && JSON.stringify(updates[f]) !== JSON.stringify(oldZone[f]));
          
          if (changedContent && updates.type === undefined) {
            updates.type = 'custom';
          }
          
          const finalZone: Zone = {
            ...oldZone,
            ...updates,
            id: newId
          };
          
          // Auto-triggers for mainObjects and type changes
          if (updates.type !== undefined && updates.type !== oldZone.type && updates.type !== 'custom') {
            const preset = state.presets[updates.type] || defaultPresets[updates.type] || defaultPresets.neutral;
            if (preset.baseType === "spawn") {
              const spawnCountInOtherZones = state.zones.reduce(
                (count, z) => count + (z.id === zoneId ? 0 : (z.mainObjects?.filter(mo => mo.type === 'Spawn').length || 0)),
                0
              );
              if (spawnCountInOtherZones >= state.settings.players) {
                const newNotification = {
                  id: uniqueKey(),
                  key: 'notificationAllPlayersHaveSpawns',
                  params: { max: state.settings.players },
                  type: 'error' as const
                };
                return {
                  notifications: [...state.notifications, newNotification]
                };
              }
            }
            const oldPreset = state.presets[oldZone.type] || defaultPresets[oldZone.type] || defaultPresets.neutral;
            
            // Re-sync label if it was default
            const oldDefaultLabel = oldPreset.isCustom ? oldPreset.label.substring(0, 3) : (zoneTypes[oldPreset.baseType]?.short || "Z");
            if (finalZone.label === oldDefaultLabel || finalZone.label === "M+O") {
              finalZone.label = preset.isCustom ? preset.label.substring(0, 3) : (zoneTypes[preset.baseType]?.short || "Z");
            }
            
            // Apply preset values and objects. The value trio and perArea
            // components define the preset's profile and are always applied —
            // adjusted by the area scale; the guard knobs apply only when the
            // preset carries them, so a preset without them leaves the
            // zone's own tuning alone.
            const presetScale = zoneContentScale(
              state.settings.sizeX,
              state.settings.sizeZ,
              state.zones.length,
              finalZone.size
            );
            Object.assign(finalZone, scalePresetValues(preset, presetScale));
            if (preset.guardMultiplier !== undefined) finalZone.guardMultiplier = preset.guardMultiplier;
            if (preset.diplomacyModifier !== undefined) finalZone.diplomacyModifier = preset.diplomacyModifier;
            if (preset.guardCutoffValue !== undefined) finalZone.guardCutoffValue = preset.guardCutoffValue;
            if (preset.guardRandomization !== undefined) finalZone.guardRandomization = preset.guardRandomization;
            if (preset.guardWeeklyIncrement !== undefined) finalZone.guardWeeklyIncrement = preset.guardWeeklyIncrement;
            if (preset.guardReactionDistribution !== undefined) finalZone.guardReactionDistribution = [...preset.guardReactionDistribution];
            if (preset.layout !== undefined) finalZone.layout = preset.layout;
            finalZone.objects = resolvePresetToZoneObjects(preset.objects);
            
            if (preset.biomeMode !== undefined) {
              finalZone.biomeMode = preset.biomeMode;
              if (preset.biomeSource !== undefined) finalZone.biomeSource = preset.biomeSource;
              if (preset.biomeId !== undefined) finalZone.biomeId = preset.biomeId;
            }

            if (preset.baseType === "spawn") {
              // Ensure it has at least one spawn object
              const hasSpawn = (finalZone.mainObjects || []).some(obj => obj.type === 'Spawn');
              if (!hasSpawn) {
                finalZone.mainObjects = [
                  ...(finalZone.mainObjects || []).filter(obj => obj.type !== 'Spawn'),
                  makeDefaultSpawnObject(nextPlayerNumber(state.zones), state.factions[0]?.id || '')
                ];
              }
              if (preset.biomeMode === undefined) {
                finalZone.biomeMode = "own";
              }
            } else {
              // Convert any Spawn objects to City objects
              finalZone.mainObjects = (finalZone.mainObjects || []).map(obj => 
                obj.type === 'Spawn' ? { ...obj, type: 'City' as const, player: null } : obj
              );
              if (preset.biomeMode === undefined && finalZone.biomeMode === "own" && finalZone.mainObjects.length === 0) {
                finalZone.biomeMode = "random";
              }
            }
          }
          
          if (updates.biomeMode !== undefined) {
            const hasOwnBiome = (finalZone.mainObjects || []).length > 0;
            if (finalZone.biomeMode === "own" && !hasOwnBiome) {
              finalZone.biomeMode = "random";
            }
            if (finalZone.biomeMode === "spawn" && !state.zones.some(z => z.type === 'spawn' && z.id === finalZone.biomeSource)) {
              finalZone.biomeSource = state.zones.find(z => z.type === 'spawn' && z.id !== finalZone.id)?.id || "";
            }
            if (finalZone.biomeMode === "specific" && !biomeIds.includes(finalZone.biomeId)) {
              finalZone.biomeId = finalZone.type === "neutral" ? "Sand" : "Grass";
            }
          }
          
          // Clear town distances if no towns/spawns in zone
          const hasTown = (finalZone.mainObjects || []).length > 0;
          if (!hasTown) {
            finalZone.objects = finalZone.objects.map(obj => ({ ...obj, townDistance: "any" }));
          }
          
          updatedZones[zoneIndex] = finalZone;
          
          const nextState = {
            zones: updatedZones,
            edges: nextEdges,
            settings: nextSettings,
            selected: nextSelected,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      duplicateSelected: () => {
        set((state) => {
          const sel = state.selected;

          if (sel?.type === 'zone') {
            const source = state.zones.find((zone) => zone.id === sel.id);
            if (!source) return {};
            const snapshot = captureHistory(state);
            const id = uniqueZoneId(state.zones, source.id);

            // Player numbers cannot be copied verbatim: each free slot gets
            // the next number, and once the players are exhausted the extra
            // spawns turn into plain cities.
            const usedPlayers = new Set(state.zones.flatMap((zone) =>
              (zone.mainObjects || [])
                .filter((mo) => mo.type === 'Spawn' && typeof mo.player === 'number')
                .map((mo) => mo.player as number)
            ));
            let spawnsConverted = false;
            const mainObjects = (source.mainObjects || []).map((mo) => {
              const copy = structuredClone(mo);
              copy.key = uniqueKey();
              if (copy.type === 'Spawn') {
                if (usedPlayers.size < state.settings.players) {
                  let next = 1;
                  while (usedPlayers.has(next)) next++;
                  usedPlayers.add(next);
                  copy.player = next;
                } else {
                  copy.type = 'City';
                  copy.player = null;
                  spawnsConverted = true;
                }
              }
              return copy;
            });

            const copyZone = {
              ...structuredClone(source),
              id,
              x: Math.min(0.95, source.x + 0.05),
              y: Math.min(0.95, source.y + 0.05),
              mainObjects,
              objects: (source.objects || []).map((obj) => ({ ...structuredClone(obj), key: uniqueKey() }))
            };

            const notifications = [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationZoneDuplicated',
              params: { source: source.id, id },
              type: 'success' as const
            }];
            if (spawnsConverted) {
              notifications.push({
                id: uniqueKey(),
                key: 'notificationDuplicateSpawnConverted',
                params: { max: state.settings.players },
                type: 'info' as const
              });
            }

            const nextState = {
              zones: [...state.zones, copyZone],
              selected: { type: 'zone' as const, id },
              notifications,
              history: pushHistory(state, snapshot)
            };
            saveToStorage({ ...state, ...nextState });
            return nextState;
          }

          if (sel?.type === 'edge') {
            const source = state.edges.find((edge) => edge.id === sel.id);
            if (!source) return {};
            // Only one spring per pair: a duplicate would contradict it.
            if (source.connectionType === 'Proximity') {
              return {
                notifications: [...state.notifications, {
                  id: uniqueKey(),
                  key: 'notificationSpringExists',
                  type: 'error' as const
                }]
              };
            }
            const snapshot = captureHistory(state);
            let edgeId = `${source.from}__${source.to}`;
            let suffix = 1;
            while (state.edges.some((edge) => edge.id === edgeId)) {
              edgeId = `${source.from}__${source.to}_${suffix}`;
              suffix++;
            }
            const copyEdge = { ...structuredClone(source), id: edgeId };
            const nextState = {
              edges: [...state.edges, copyEdge],
              selected: { type: 'edge' as const, id: edgeId },
              notifications: [...state.notifications, {
                id: uniqueKey(),
                key: 'notificationEdgeDuplicated',
                params: { from: source.from, to: source.to },
                type: 'success' as const
              }],
              history: pushHistory(state, snapshot)
            };
            saveToStorage({ ...state, ...nextState });
            return nextState;
          }

          return {
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationNothingToDuplicate',
              type: 'info' as const
            }]
          };
        });
      },
      rescaleZoneValues: (zoneId) => {
        set((state) => {
          // Re-derives values from the zone's preset × the current map's
          // area scale. Zones without a preset baseline (imported "custom"
          // ones) keep their authored values untouched.
          const targets = zoneId ? state.zones.filter((zone) => zone.id === zoneId) : state.zones;
          const rescalable = targets.filter((zone) => state.presets[zone.type]);
          if (rescalable.length === 0) {
            return {
              notifications: [...state.notifications, {
                id: uniqueKey(),
                key: 'notificationNothingToRescale',
                type: 'info' as const
              }]
            };
          }

          const snapshot = captureHistory(state);
          const totalZones = state.zones.length;
          const nextZones = state.zones.map((zone) => {
            const preset = state.presets[zone.type];
            if (!preset || (zoneId && zone.id !== zoneId)) return zone;
            const scale = zoneContentScale(state.settings.sizeX, state.settings.sizeZ, totalZones, zone.size);
            return { ...zone, ...scalePresetValues(preset, scale) };
          });

          const nextState = {
            zones: nextZones,
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationZonesRescaled',
              params: { count: rescalable.length },
              type: 'success' as const
            }],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      setZonePosition: (zoneId, x, y) => {
        set((state) => {
          const oldZone = state.zones.find(z => z.id === zoneId);
          if (oldZone && oldZone.x === x && oldZone.y === y) return {};
          
          const snapshot = captureHistory(state);
          const nextZones = state.zones.map(z => z.id === zoneId ? { ...z, x, y } : z);
          const nextState = {
            zones: nextZones,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
