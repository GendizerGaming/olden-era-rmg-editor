import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { Preset, ZoneObject, CatalogItem } from '../../types/editor';
import { captureHistory, pushHistory } from '../zones';
import { buildDefaultPresets, defaultPresets } from '../presets';
import { uniqueKey } from '../ids';
import { cloneEntry } from '../catalog';
import { parseSavedPresetRecord } from '../parsing';
import { normalizeSavedPreset } from '../normalizers';

export function createPresetActions(ctx: StoreContext): Pick<EditorActions, 'createPreset' | 'updatePreset' | 'deletePreset' | 'resetPreset' | 'resetBuiltInPresets' | 'importPresets' | 'addObjectToPreset' | 'removeObjectFromPreset' | 'updatePresetObjectField' | 'saveZoneAsPreset'> {
  const { set, saveToStorage } = ctx;
  return {
      resetBuiltInPresets: () => {
        set((state) => {
          const snapshot = captureHistory(state);
          // Rebuilt against the loaded catalog so the objects resolve fully;
          // custom presets are untouched, zones keep their snapshot values.
          const factory = buildDefaultPresets(state.objectLibrary);
          const nextState = {
            presets: { ...state.presets, ...factory },
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationBuiltInPresetsReset',
              params: {},
              type: 'success' as const
            }],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      createPreset: (name: string, baseType: Preset['baseType'], cloneFromId?: string, seed?: Partial<Preset>) => {
        set((state) => {
          const snapshot = captureHistory(state);
          const id = `custom_${Date.now()}`;
          const sourcePreset = cloneFromId
            ? state.presets[cloneFromId] ||
              defaultPresets[cloneFromId] ||
              defaultPresets.neutral
            : baseType === "custom"
              ? null
              : defaultPresets[baseType] || defaultPresets.neutral;
          const baseObjects = sourcePreset
            ? sourcePreset.objects.map((object) => ({
                ...object,
                key: uniqueKey()
              }))
            : [];

          // The clone carries the source's full zone profile; the optional
          // seed (e.g. the role+tier recipe) overrides values on top.
          const newPreset: Preset = {
            id,
            label: name,
            baseType,
            guardedValue: sourcePreset?.guardedValue ?? 0,
            unguardedValue: sourcePreset?.unguardedValue ?? 0,
            resourcesValue: sourcePreset?.resourcesValue ?? 0,
            guardedValuePerArea: sourcePreset?.guardedValuePerArea,
            unguardedValuePerArea: sourcePreset?.unguardedValuePerArea,
            resourcesValuePerArea: sourcePreset?.resourcesValuePerArea,
            guardMultiplier: sourcePreset?.guardMultiplier,
            diplomacyModifier: sourcePreset?.diplomacyModifier,
            guardCutoffValue: sourcePreset?.guardCutoffValue,
            guardRandomization: sourcePreset?.guardRandomization,
            guardWeeklyIncrement: sourcePreset?.guardWeeklyIncrement,
            guardReactionDistribution: sourcePreset?.guardReactionDistribution
              ? [...sourcePreset.guardReactionDistribution]
              : undefined,
            layout: sourcePreset?.layout,
            biomeMode: sourcePreset?.biomeMode,
            biomeSource: sourcePreset?.biomeSource,
            biomeId: sourcePreset?.biomeId,
            objects: baseObjects,
            isCustom: true,
            ...seed
          };

          const nextPresets = { ...state.presets, [id]: newPreset };
          const nextState = {
            presets: nextPresets,
            selected: { type: 'preset' as const, id },
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      updatePreset: (id: string, updates: Partial<Preset>) => {
        set((state) => {
          const preset = state.presets[id];
          if (!preset) return {};
          const snapshot = captureHistory(state);
          const updatedPreset = { ...preset, ...updates };
          const nextPresets = { ...state.presets, [id]: updatedPreset };
          const nextState = {
            presets: nextPresets,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      deletePreset: (id: string) => {
        set((state) => {
          const preset = state.presets[id];
          if (!preset || !preset.isCustom) return {};
          const snapshot = captureHistory(state);
          const nextPresets = { ...state.presets };
          delete nextPresets[id];

          const nextZones = state.zones.map((zone) => {
            if (zone.type === id) {
              return { ...zone, type: preset.baseType };
            }
            return zone;
          });

          const nextState = {
            presets: nextPresets,
            zones: nextZones,
            selected: state.selected?.type === 'preset' && state.selected.id === id ? null : state.selected,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      resetPreset: (id: string) => {
        set((state) => {
          const preset = state.presets[id];
          if (!preset || preset.isCustom) return {};
          const defaultPreset = defaultPresets[id];
          if (!defaultPreset) return {};
          const snapshot = captureHistory(state);

          const nextPresets = {
            ...state.presets,
            [id]: {
              ...preset,
              label: defaultPreset.label,
              baseType: defaultPreset.baseType,
              guardedValue: defaultPreset.guardedValue,
              unguardedValue: defaultPreset.unguardedValue,
              resourcesValue: defaultPreset.resourcesValue,
              objects: defaultPreset.objects.map(obj => ({ ...obj, key: uniqueKey() }))
            }
          };

          const nextState = {
            presets: nextPresets,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      importPresets: (presetsData: unknown) => {
        const parsedPresets = parseSavedPresetRecord(presetsData);
        if (!parsedPresets) {
          throw new Error("Preset file contains unsupported or malformed data.");
        }

        set((state) => {
          const snapshot = captureHistory(state);
          const missing: string[] = [];
          const importedPresets = Object.fromEntries(
            Object.entries(parsedPresets).map(([key, preset]) => [
              key,
              normalizeSavedPreset(
                key,
                preset,
                state.objectLibrary,
                missing,
                Boolean(state.coreCatalog),
                state.customObjectLists
              )
            ])
          );

          const mergedPresets = { ...state.presets, ...importedPresets };
          const nextState = {
            presets: mergedPresets,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      addObjectToPreset: (presetId: string, item: CatalogItem) => {
        set((state) => {
          const preset = state.presets[presetId];
          if (!preset) return {};
          const snapshot = captureHistory(state);

          const newObj: ZoneObject = {
            ...cloneEntry(item),
            count: 1,
            guarded: item.guarded,
            soloEncounter: false,
            variant: null,
            roadDistance: "any",
            townDistance: "any"
          };

          const nextPreset = {
            ...preset,
            objects: [...preset.objects, newObj]
          };

          const lang = state.settings.language;
          const label = item?.labelByLang?.[lang] || item?.label || item?.sid || item?.includeList || item?.id || "";

          const newNotification = {
            id: uniqueKey(),
            key: 'notificationObjectAddedToPreset',
            params: { name: label, presetName: preset.label },
            type: 'success' as const
          };

          const nextState = {
            presets: { ...state.presets, [presetId]: nextPreset },
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      removeObjectFromPreset: (presetId: string, objectKey: string) => {
        set((state) => {
          const preset = state.presets[presetId];
          if (!preset) return {};
          const snapshot = captureHistory(state);

          const targetObj = preset.objects.find(obj => obj.key === objectKey);
          if (!targetObj) return {};

          const nextPreset = {
            ...preset,
            objects: preset.objects.filter(obj => obj.key !== objectKey)
          };

          const lang = state.settings.language;
          const label = targetObj?.labelByLang?.[lang] || targetObj?.label || targetObj?.sid || targetObj?.includeList || targetObj?.id || "";

          const newNotification = {
            id: uniqueKey(),
            key: 'notificationObjectRemovedFromPreset',
            params: { name: label, presetName: preset.label },
            type: 'info' as const
          };

          const nextState = {
            presets: { ...state.presets, [presetId]: nextPreset },
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      updatePresetObjectField: (presetId, objectKey, updates) => {
        set((state) => {
          const preset = state.presets[presetId];
          if (!preset) return {};
          const snapshot = captureHistory(state);

          const nextPreset = {
            ...preset,
            objects: preset.objects.map(obj => obj.key === objectKey ? { ...obj, ...updates } : obj)
          };

          const nextState = {
            presets: { ...state.presets, [presetId]: nextPreset },
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      saveZoneAsPreset: (zoneId, name) => {
        set((state) => {
          const zone = state.zones.find(z => z.id === zoneId);
          if (!zone) return {};
          
          const snapshot = captureHistory(state);
          const id = `custom_${Date.now()}`;
          
          const presetObjects: ZoneObject[] = zone.objects.map(obj => ({
            ...obj,
            key: uniqueKey()
          }));
          
          const newPreset: Preset = {
            id,
            label: name,
            baseType: 'custom',
            guardedValue: zone.guardedValue,
            unguardedValue: zone.unguardedValue,
            resourcesValue: zone.resourcesValue,
            guardedValuePerArea: zone.guardedValuePerArea,
            unguardedValuePerArea: zone.unguardedValuePerArea,
            resourcesValuePerArea: zone.resourcesValuePerArea,
            guardMultiplier: zone.guardMultiplier,
            diplomacyModifier: zone.diplomacyModifier,
            guardCutoffValue: zone.guardCutoffValue,
            guardRandomization: zone.guardRandomization,
            guardWeeklyIncrement: zone.guardWeeklyIncrement,
            guardReactionDistribution: zone.guardReactionDistribution ? [...zone.guardReactionDistribution] : undefined,
            layout: zone.layout,
            objects: presetObjects,
            isCustom: true,
            biomeMode: zone.biomeMode,
            biomeSource: zone.biomeSource,
            biomeId: zone.biomeId
          };
          
          const newNotification = {
            id: uniqueKey(),
            key: 'notificationPresetSaved',
            params: { name },
            type: 'success' as const
          };
          
          const nextState = {
            presets: { ...state.presets, [id]: newPreset },
            zones: state.zones.map(z => z.id === zoneId ? { ...z, type: id } : z),
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };
          
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
