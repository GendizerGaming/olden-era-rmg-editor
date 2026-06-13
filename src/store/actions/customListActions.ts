import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { Preset, CustomObjectList, CustomObjectListEntry } from '../../types/editor';
import { captureHistory, pushHistory } from '../zones';
import { uniqueKey } from '../ids';
import { isCustomListIdConflict } from '../presets';
import { catalogItemForReference } from '../catalog';

export function createCustomListActions(ctx: StoreContext): Pick<EditorActions, 'createCustomList' | 'updateCustomList' | 'deleteCustomList' | 'addEntryToCustomList' | 'removeEntryFromCustomList' | 'updateEntryWeightInCustomList'> {
  const { set, get, saveToStorage } = ctx;
  return {
      createCustomList: (id: string, label: string, cloneFromId?: string) => {
        let cleanId = id.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!cleanId) cleanId = "custom_list";

        const state = get();
        if (isCustomListIdConflict(state.customObjectLists, state.objectLibrary, state.presets, cleanId)) {
          state.actions.addNotification('notificationCustomListIdConflict', { id: cleanId }, 'error');
          return false;
        }

        set((state) => {
          const snapshot = captureHistory(state);

          let entries: CustomObjectListEntry[] = [];
          if (cloneFromId) {
            const source = state.customObjectLists[cloneFromId];
            if (source) {
              entries = source.entries.map(e => ({ ...e, key: uniqueKey() }));
            }
          }

          const newList: CustomObjectList = {
            id: cleanId,
            label: label.trim() || cleanId,
            entries
          };

          const notificationKey = cloneFromId ? 'notificationCustomListCloned' : 'notificationCustomListCreated';
          const newNotification = {
            id: uniqueKey(),
            key: notificationKey,
            params: { name: newList.label },
            type: 'success' as const
          };

          const nextState = {
            customObjectLists: { ...state.customObjectLists, [cleanId]: newList },
            selected: { type: 'customList' as const, id: cleanId },
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };

          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
        return true;
      },
      updateCustomList: (id: string, updates: Partial<CustomObjectList>) => {
        const state = get();
        const list = state.customObjectLists[id];
        if (!list) return false;

        let targetId = id;
        if (updates.id !== undefined && updates.id !== id) {
          const cleanId = updates.id.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
          if (!cleanId) {
            get().actions.addNotification('notificationCustomListIdConflict', { id: "" }, 'error');
            return false;
          }

          if (isCustomListIdConflict(state.customObjectLists, state.objectLibrary, state.presets, cleanId, id)) {
            get().actions.addNotification('notificationCustomListIdConflict', { id: cleanId }, 'error');
            return false;
          }
          targetId = cleanId;
        }

        set((state) => {
          const snapshot = captureHistory(state);

          let nextLists = { ...state.customObjectLists };
          let nextSelected = state.selected;
          let nextZones = state.zones;
          let nextPresets = state.presets;

          if (targetId !== id) {
            delete nextLists[id];
            nextLists[targetId] = {
              ...list,
              ...updates,
              id: targetId
            };

            nextZones = state.zones.map(zone => {
              const zoneObjects = zone.objects.map(obj => {
                if (obj.kind === 'list' && obj.includeList === id) {
                  return { ...obj, includeList: targetId };
                }
                return obj;
              });
              
              const mandatoryContent = zone.mandatoryContent?.map(item => item === id ? targetId : item);
              return {
                ...zone,
                objects: zoneObjects,
                mandatoryContent
              };
            });

            nextPresets = Object.entries(state.presets).reduce(
              (acc: Record<string, Preset>, [key, preset]) => {
              const presetObjects = preset.objects.map((obj) => {
                if (obj.kind === 'list' && obj.includeList === id) {
                  return { ...obj, includeList: targetId };
                }
                return obj;
              });
              acc[key] = {
                ...preset,
                objects: presetObjects
              };
              return acc;
              },
              {}
            );

            nextLists = Object.entries(nextLists).reduce(
              (acc: Record<string, CustomObjectList>, [key, currentList]) => {
              const entries = currentList.entries.map((entry) => {
                if (entry.kind === 'list' && entry.value === id) {
                  return { ...entry, value: targetId };
                }
                return entry;
              });
              acc[key] = {
                ...currentList,
                entries
              };
              return acc;
              },
              {}
            );

            if (nextSelected && nextSelected.type === 'customList' && nextSelected.id === id) {
              nextSelected = { type: 'customList', id: targetId };
            }
          } else {
            nextLists[id] = { ...list, ...updates };
          }

          const nextState = {
            customObjectLists: nextLists,
            selected: nextSelected,
            zones: nextZones,
            presets: nextPresets,
            history: pushHistory(state, snapshot)
          };

          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
        return true;
      },
      deleteCustomList: (id: string) => {
        set((state) => {
          const snapshot = captureHistory(state);
          const nextLists = { ...state.customObjectLists };
          const listName = state.customObjectLists[id]?.label || id;
          delete nextLists[id];

          const nextZones = state.zones.map(zone => {
            const zoneObjects = zone.objects.filter(obj => !(obj.kind === 'list' && obj.includeList === id));
            const mandatoryContent = zone.mandatoryContent?.filter(item => item !== id);
            return {
              ...zone,
              objects: zoneObjects,
              mandatoryContent
            };
          });

          const nextPresets = Object.entries(state.presets).reduce(
            (acc: Record<string, Preset>, [key, preset]) => {
            acc[key] = {
              ...preset,
              objects: preset.objects.filter(
                (obj) => !(obj.kind === 'list' && obj.includeList === id)
              )
            };
            return acc;
            },
            {}
          );

          const finalLists = Object.entries(nextLists).reduce(
            (acc: Record<string, CustomObjectList>, [key, currentList]) => {
            acc[key] = {
              ...currentList,
              entries: currentList.entries.filter(
                (entry) => !(entry.kind === 'list' && entry.value === id)
              )
            };
            return acc;
            },
            {}
          );

          const newNotification = {
            id: uniqueKey(),
            key: 'notificationCustomListDeleted',
            params: { name: listName },
            type: 'success' as const
          };

          const nextState = {
            customObjectLists: finalLists,
            zones: nextZones,
            presets: nextPresets,
            selected: state.selected?.type === 'customList' && state.selected.id === id ? null : state.selected,
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };

          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      addEntryToCustomList: (listId: string, entry: Omit<CustomObjectListEntry, 'key'>) => {
        set((state) => {
          const list = state.customObjectLists[listId];
          if (!list) return {};
          const snapshot = captureHistory(state);

          const newEntry: CustomObjectListEntry = {
            ...entry,
            key: uniqueKey()
          };

          const nextList = {
            ...list,
            entries: [...list.entries, newEntry]
          };

          const nextState = {
            customObjectLists: { ...state.customObjectLists, [listId]: nextList },
            history: pushHistory(state, snapshot)
          };

          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      removeEntryFromCustomList: (listId: string, entryKey: string) => {
        set((state) => {
          const list = state.customObjectLists[listId];
          if (!list) return {};
          const snapshot = captureHistory(state);

          const removedEntry = list.entries.find(e => e.key === entryKey);
          let entryName = removedEntry ? removedEntry.value : '';
          if (removedEntry) {
            if (removedEntry.kind === 'list') {
              const nested = state.customObjectLists[removedEntry.value];
              if (nested) entryName = nested.label;
            } else {
              const item = catalogItemForReference(state.objectLibrary, { kind: 'sid', value: removedEntry.value });
              if (item) entryName = item.labelByLang?.[state.settings.language] || item.label || item.sid || item.id;
            }
          }

          const nextList = {
            ...list,
            entries: list.entries.filter(e => e.key !== entryKey)
          };

          const newNotification = {
            id: uniqueKey(),
            key: 'notificationObjectRemovedFromCustomList',
            params: { name: entryName, listName: list.label },
            type: 'success' as const
          };

          const nextState = {
            customObjectLists: { ...state.customObjectLists, [listId]: nextList },
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };

          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      updateEntryWeightInCustomList: (listId: string, entryKey: string, weight: number) => {
        set((state) => {
          const list = state.customObjectLists[listId];
          if (!list) return {};
          const snapshot = captureHistory(state);

          const nextList = {
            ...list,
            entries: list.entries.map(e => e.key === entryKey ? { ...e, weight: Math.max(0, weight) } : e)
          };

          const nextState = {
            customObjectLists: { ...state.customObjectLists, [listId]: nextList },
            history: pushHistory(state, snapshot)
          };

          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      }
  };
}
