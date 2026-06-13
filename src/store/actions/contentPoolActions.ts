import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { ContentPoolPreset, Zone } from '../../types/editor';
import { captureHistory, pushHistory } from '../zones';
import { uniqueKey, safeName } from '../ids';

function uniquePoolName(pools: ContentPoolPreset[], base: string): string {
  const clean = safeName(base) || 'content_pool';
  let name = clean;
  let i = 2;
  while (pools.some((pool) => pool.name === name)) {
    name = `${clean}_${i++}`;
  }
  return name;
}

const POOL_REF_FIELDS = ['guardedContentPool', 'unguardedContentPool', 'resourcesContentPool'] as const;

function zoneReferencesPool(zone: Zone, name: string): boolean {
  return POOL_REF_FIELDS.some((field) => zone[field]?.includes(name));
}

export function createContentPoolActions(ctx: StoreContext): Pick<EditorActions, 'addContentPoolPreset' | 'duplicateContentPoolPreset' | 'deleteContentPoolPreset' | 'updateContentPoolPreset'> {
  const { set, saveToStorage } = ctx;
  return {
    addContentPoolPreset: () => {
      set((state) => {
        const snapshot = captureHistory(state);
        const pools = state.settings.contentPoolPresets;
        const name = uniquePoolName(pools, 'content_pool_custom');
        // The dominant official distribution shape: three price buckets.
        const created: ContentPoolPreset = {
          name,
          valueDistribution: { priceBounds: [3999, 6999, 12999], weights: [5, 12, 14, 2] },
          groups: [],
          bans: [],
          custom: true
        };
        const nextState = {
          settings: { ...state.settings, contentPoolPresets: [...pools, created] },
          selected: { type: 'contentPool' as const, id: name },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    duplicateContentPoolPreset: (name: string) => {
      set((state) => {
        const pools = state.settings.contentPoolPresets;
        const source = pools.find((pool) => pool.name === name);
        if (!source) return {};
        const snapshot = captureHistory(state);
        const copyName = uniquePoolName(pools, `${name}_copy`);
        const copy: ContentPoolPreset = structuredClone(source);
        copy.name = copyName;
        copy.custom = true;
        const nextState = {
          settings: { ...state.settings, contentPoolPresets: [...pools, copy] },
          selected: { type: 'contentPool' as const, id: copyName },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    deleteContentPoolPreset: (name: string) => {
      set((state) => {
        const pools = state.settings.contentPoolPresets;
        if (!pools.some((pool) => pool.name === name)) return {};

        // A pool referenced by zones cannot be deleted: the export would emit
        // dangling names. The UI disables the button; this is the guard.
        const usedBy = state.zones
          .filter((zone) => zoneReferencesPool(zone, name))
          .map((zone) => zone.id);
        if (usedBy.length > 0) {
          return {
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationContentPoolInUse',
              params: { name, zones: usedBy.join(', ') },
              type: 'error' as const
            }]
          };
        }

        const snapshot = captureHistory(state);
        const nextState = {
          settings: {
            ...state.settings,
            contentPoolPresets: pools.filter((pool) => pool.name !== name)
          },
          selected: state.selected?.type === 'contentPool' && state.selected.id === name
            ? null
            : state.selected,
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    updateContentPoolPreset: (name: string, updates: Partial<ContentPoolPreset>) => {
      set((state) => {
        const pools = state.settings.contentPoolPresets;
        const index = pools.findIndex((pool) => pool.name === name);
        if (index < 0) return {};
        const snapshot = captureHistory(state);

        // Renames rewrite zone references along.
        let nextName = name;
        if (updates.name !== undefined && updates.name !== name) {
          nextName = safeName(updates.name);
          if (!nextName || pools.some((pool) => pool.name === nextName)) {
            nextName = name;
          }
        }

        const nextPools = [...pools];
        nextPools[index] = { ...pools[index], ...updates, name: nextName };

        const nextZones = nextName !== name
          ? state.zones.map((zone) => {
              if (!zoneReferencesPool(zone, name)) return zone;
              const next = { ...zone };
              for (const field of POOL_REF_FIELDS) {
                if (next[field]?.includes(name)) {
                  next[field] = next[field].map((ref) => ref === name ? nextName : ref);
                }
              }
              return next;
            })
          : state.zones;

        const nextState = {
          settings: { ...state.settings, contentPoolPresets: nextPools },
          zones: nextZones,
          selected: state.selected?.type === 'contentPool' && state.selected.id === name
            ? { type: 'contentPool' as const, id: nextName }
            : state.selected,
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    }
  };
}
