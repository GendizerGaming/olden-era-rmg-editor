import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import { captureHistory, pushHistory } from '../zones';
import { cloneEntry } from '../catalog';
import { uniqueKey } from '../ids';

export function createObjectActions(ctx: StoreContext): Pick<EditorActions, 'addObjectToZone' | 'updateObjectField' | 'removeObjectFromZone'> {
  const { set, saveToStorage } = ctx;
  return {
      addObjectToZone: (zoneId, item) => {
        set((state) => {
          const zoneIndex = state.zones.findIndex(z => z.id === zoneId);
          if (zoneIndex < 0) return {};
          
          const snapshot = captureHistory(state);
          const updatedZones = [...state.zones];
          const zone = { ...updatedZones[zoneIndex] };
          
          const newObj = cloneEntry(item);
          // No name by default; a stable one is assigned lazily when the object
          // is first used as a road target.
          zone.objects = [...zone.objects, newObj];
          zone.type = 'custom';
          updatedZones[zoneIndex] = zone;
          
          const lang = state.settings.language;
          const label = item?.labelByLang?.[lang] || item?.label || item?.sid || item?.includeList || item?.id || "";
          
          const newNotification = {
            id: uniqueKey(),
            key: 'notificationObjectAdded',
            params: { name: label, zoneId },
            type: 'success' as const
          };
          
          const nextState = {
            zones: updatedZones,
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      updateObjectField: (zoneId, objectKey, updates) => {
        set((state) => {
          const zoneIndex = state.zones.findIndex(z => z.id === zoneId);
          if (zoneIndex < 0) return {};
          
          const snapshot = captureHistory(state);
          const updatedZones = [...state.zones];
          const zone = { ...updatedZones[zoneIndex] };
          
          zone.objects = zone.objects.map(obj => {
            if (obj.key === objectKey) {
              const merged = { ...obj, ...updates };
              if (updates.count !== undefined) {
                merged.count = Math.max(1, Math.min(99, Math.trunc(Number(updates.count) || 1)));
              }
              if (updates.variant !== undefined) {
                merged.variant =
                  updates.variant === null
                    ? null
                    : Math.trunc(Number(updates.variant));
              }
              return merged;
            }
            return obj;
          });
          
          zone.type = 'custom';
          updatedZones[zoneIndex] = zone;
          const nextState = {
            zones: updatedZones,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      removeObjectFromZone: (zoneId, objectKey) => {
        set((state) => {
          const zoneIndex = state.zones.findIndex(z => z.id === zoneId);
          if (zoneIndex < 0) return {};
          
          const snapshot = captureHistory(state);
          const updatedZones = [...state.zones];
          const zone = { ...updatedZones[zoneIndex] };
          
          const targetObj = zone.objects.find(obj => obj.key === objectKey);
          if (!targetObj) return {};
 
          zone.objects = zone.objects.filter(obj => obj.key !== objectKey);
          zone.type = 'custom';
          updatedZones[zoneIndex] = zone;
          
          const lang = state.settings.language;
          const label = targetObj?.labelByLang?.[lang] || targetObj?.label || targetObj?.sid || targetObj?.includeList || targetObj?.id || "";
 
          const newNotification = {
            id: uniqueKey(),
            key: 'notificationObjectRemoved',
            params: { name: label, zoneId },
            type: 'info' as const
          };
 
          const nextState = {
            zones: updatedZones,
            notifications: [...state.notifications, newNotification],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
