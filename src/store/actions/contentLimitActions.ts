import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { ContentLimitPreset } from '../../types/editor';
import { defaultContentLimitPresets, isBuiltInLimitName } from '../constants';
import { captureHistory, pushHistory } from '../zones';
import { uniqueKey, safeName } from '../ids';

function uniqueLimitName(presets: ContentLimitPreset[], base: string): string {
  const clean = safeName(base) || 'content_limits';
  let name = clean;
  let i = 2;
  while (presets.some((preset) => preset.name === name)) {
    name = `${clean}_${i++}`;
  }
  return name;
}

export function createContentLimitActions(ctx: StoreContext): Pick<EditorActions, 'addContentLimitPreset' | 'duplicateContentLimitPreset' | 'deleteContentLimitPreset' | 'updateContentLimitPreset' | 'resetBuiltInContentLimits'> {
  const { set, saveToStorage } = ctx;
  return {
    resetBuiltInContentLimits: () => {
      set((state) => {
        const snapshot = captureHistory(state);
        // The two stubs go back to their factory (empty) shape; every other
        // list is untouched and zone references survive.
        const factory = defaultContentLimitPresets();
        const next = state.settings.contentLimitPresets.map((preset) =>
          factory.find((candidate) => candidate.name === preset.name) ?? preset
        );
        for (const candidate of factory) {
          if (!next.some((preset) => preset.name === candidate.name)) {
            next.push(candidate);
          }
        }
        const nextState = {
          settings: { ...state.settings, contentLimitPresets: next },
          notifications: [...state.notifications, {
            id: uniqueKey(),
            key: 'notificationBuiltInLimitsReset',
            params: {},
            type: 'success' as const
          }],
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    addContentLimitPreset: () => {
      set((state) => {
        const snapshot = captureHistory(state);
        const limits = state.settings.contentLimitPresets;
        const name = uniqueLimitName(limits, 'content_limits_custom');
        const created: ContentLimitPreset = { name, limits: [], custom: true };
        const nextState = {
          settings: { ...state.settings, contentLimitPresets: [...limits, created] },
          selected: { type: 'contentLimits' as const, id: name },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    duplicateContentLimitPreset: (name: string) => {
      set((state) => {
        const limits = state.settings.contentLimitPresets;
        const source = limits.find((preset) => preset.name === name);
        if (!source) return {};
        const snapshot = captureHistory(state);
        const copyName = uniqueLimitName(limits, `${name}_copy`);
        const copy: ContentLimitPreset = structuredClone(source);
        copy.name = copyName;
        copy.custom = true;
        const nextState = {
          settings: { ...state.settings, contentLimitPresets: [...limits, copy] },
          selected: { type: 'contentLimits' as const, id: copyName },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    deleteContentLimitPreset: (name: string) => {
      set((state) => {
        const limits = state.settings.contentLimitPresets;
        if (!limits.some((preset) => preset.name === name)) return {};

        // Built-in cap lists back the zones' "Auto" option and never go away.
        if (isBuiltInLimitName(name)) {
          return {
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationContentLimitBuiltIn',
              params: { name },
              type: 'error' as const
            }]
          };
        }

        // A preset referenced by zones cannot be deleted: the export would
        // emit dangling names. The UI disables the button; this is the guard.
        const usedBy = state.zones
          .filter((zone) => zone.contentCountLimits?.includes(name))
          .map((zone) => zone.id);
        if (usedBy.length > 0) {
          return {
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationContentLimitInUse',
              params: { name, zones: usedBy.join(', ') },
              type: 'error' as const
            }]
          };
        }

        const snapshot = captureHistory(state);
        const nextState = {
          settings: {
            ...state.settings,
            contentLimitPresets: limits.filter((preset) => preset.name !== name)
          },
          selected: state.selected?.type === 'contentLimits' && state.selected.id === name
            ? null
            : state.selected,
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    updateContentLimitPreset: (name: string, updates: Partial<ContentLimitPreset>) => {
      set((state) => {
        const limits = state.settings.contentLimitPresets;
        const index = limits.findIndex((preset) => preset.name === name);
        if (index < 0) return {};
        const snapshot = captureHistory(state);

        // Renames rewrite zone references along; built-in names are fixed.
        let nextName = name;
        if (updates.name !== undefined && updates.name !== name && !isBuiltInLimitName(name)) {
          nextName = safeName(updates.name);
          if (!nextName || limits.some((preset) => preset.name === nextName)) {
            nextName = name;
          }
        }

        const nextLimits = [...limits];
        nextLimits[index] = { ...limits[index], ...updates, name: nextName };

        const nextZones = nextName !== name
          ? state.zones.map((zone) => zone.contentCountLimits?.includes(name)
              ? { ...zone, contentCountLimits: zone.contentCountLimits.map((ref) => ref === name ? nextName : ref) }
              : zone)
          : state.zones;

        const nextState = {
          settings: { ...state.settings, contentLimitPresets: nextLimits },
          zones: nextZones,
          selected: state.selected?.type === 'contentLimits' && state.selected.id === name
            ? { type: 'contentLimits' as const, id: nextName }
            : state.selected,
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    }
  };
}
