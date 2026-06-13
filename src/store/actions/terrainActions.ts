import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { TerrainProfile } from '../../types/editor';
import { defaultTerrainProfiles, isBuiltInProfileName } from '../constants';
import { captureHistory, pushHistory } from '../zones';
import { uniqueKey, safeName } from '../ids';

function uniqueProfileName(profiles: TerrainProfile[], base: string): string {
  const clean = safeName(base) || 'terrain_profile';
  let name = clean;
  let i = 2;
  while (profiles.some((profile) => profile.name === name)) {
    name = `${clean}_${i++}`;
  }
  return name;
}

export function createTerrainActions(ctx: StoreContext): Pick<EditorActions, 'addTerrainProfile' | 'duplicateTerrainProfile' | 'deleteTerrainProfile' | 'updateTerrainProfile' | 'resetTerrainProfile' | 'resetBuiltInTerrainProfiles'> {
  const { set, saveToStorage } = ctx;
  return {
    resetBuiltInTerrainProfiles: () => {
      set((state) => {
        const snapshot = captureHistory(state);
        // Built-ins are replaced in place (or restored if missing); custom
        // and imported profiles are untouched. Zone references survive —
        // the built-in names are fixed.
        const factory = defaultTerrainProfiles();
        const nextProfiles = state.settings.terrainProfiles.map((profile) =>
          factory.find((candidate) => candidate.name === profile.name) ?? profile
        );
        for (const candidate of factory) {
          if (!nextProfiles.some((profile) => profile.name === candidate.name)) {
            nextProfiles.push(candidate);
          }
        }
        const nextState = {
          settings: { ...state.settings, terrainProfiles: nextProfiles },
          notifications: [...state.notifications, {
            id: uniqueKey(),
            key: 'notificationBuiltInTerrainReset',
            params: {},
            type: 'success' as const
          }],
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    addTerrainProfile: () => {
      set((state) => {
        const snapshot = captureHistory(state);
        const profiles = state.settings.terrainProfiles;
        const name = uniqueProfileName(profiles, 'terrain_profile');
        const created: TerrainProfile = {
          name,
          obstaclesFill: 0.34,
          obstaclesFillVoid: 0.4,
          lakesFill: 0.16,
          minLakeArea: 8,
          elevationClusterScale: 0.1,
          elevationModes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0 }],
          roadClusterArea: 80,
          custom: true
        };
        const nextState = {
          settings: { ...state.settings, terrainProfiles: [...profiles, created] },
          selected: { type: 'terrainProfile' as const, id: name },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    duplicateTerrainProfile: (name: string) => {
      set((state) => {
        const profiles = state.settings.terrainProfiles;
        const source = profiles.find((profile) => profile.name === name);
        if (!source) return {};
        const snapshot = captureHistory(state);
        const copyName = uniqueProfileName(profiles, `${name}_copy`);
        const copy: TerrainProfile = structuredClone(source);
        copy.name = copyName;
        copy.custom = true;
        const nextState = {
          settings: { ...state.settings, terrainProfiles: [...profiles, copy] },
          selected: { type: 'terrainProfile' as const, id: copyName },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    deleteTerrainProfile: (name: string) => {
      set((state) => {
        const profiles = state.settings.terrainProfiles;
        if (!profiles.some((profile) => profile.name === name)) return {};

        // Built-in profiles back the "Auto" option and never go away.
        if (isBuiltInProfileName(name)) {
          return {
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationTerrainProfileBuiltIn',
              params: { name },
              type: 'error' as const
            }]
          };
        }

        // A profile in use cannot be deleted: zones must always resolve their
        // terrain. The UI disables the button; this is the store-level guard.
        const usedBy = state.zones.filter((zone) => zone.layout === name).map((zone) => zone.id);
        if (usedBy.length > 0) {
          return {
            notifications: [...state.notifications, {
              id: uniqueKey(),
              key: 'notificationTerrainProfileInUse',
              params: { name, zones: usedBy.join(', ') },
              type: 'error' as const
            }]
          };
        }

        const snapshot = captureHistory(state);
        const nextState = {
          settings: {
            ...state.settings,
            terrainProfiles: profiles.filter((profile) => profile.name !== name)
          },
          selected: state.selected?.type === 'terrainProfile' && state.selected.id === name
            ? null
            : state.selected,
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    updateTerrainProfile: (name: string, updates: Partial<TerrainProfile>) => {
      set((state) => {
        const profiles = state.settings.terrainProfiles;
        const index = profiles.findIndex((profile) => profile.name === name);
        if (index < 0) return {};
        const snapshot = captureHistory(state);

        // Renames keep zone references intact by rewriting them along.
        // Built-in names are the contract behind the "Auto" option — fixed.
        let nextName = name;
        if (updates.name !== undefined && updates.name !== name && !isBuiltInProfileName(name)) {
          nextName = safeName(updates.name);
          if (!nextName || profiles.some((profile) => profile.name === nextName)) {
            nextName = name;
          }
        }

        const nextProfiles = [...profiles];
        nextProfiles[index] = { ...profiles[index], ...updates, name: nextName };

        const nextZones = nextName !== name
          ? state.zones.map((zone) => zone.layout === name ? { ...zone, layout: nextName } : zone)
          : state.zones;

        const nextState = {
          settings: { ...state.settings, terrainProfiles: nextProfiles },
          zones: nextZones,
          selected: state.selected?.type === 'terrainProfile' && state.selected.id === name
            ? { type: 'terrainProfile' as const, id: nextName }
            : state.selected,
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },
    resetTerrainProfile: (name: string) => {
      set((state) => {
        const factory = defaultTerrainProfiles().find((profile) => profile.name === name);
        const index = state.settings.terrainProfiles.findIndex((profile) => profile.name === name);
        if (!factory || index < 0) return {};
        const snapshot = captureHistory(state);
        const nextProfiles = [...state.settings.terrainProfiles];
        nextProfiles[index] = factory;
        const nextState = {
          settings: { ...state.settings, terrainProfiles: nextProfiles },
          history: pushHistory(state, snapshot)
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    }
  };
}
