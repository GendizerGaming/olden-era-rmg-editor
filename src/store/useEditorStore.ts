import { createWithEqualityFn } from 'zustand/traditional';
import type { EditorStoreState } from './types';
import type { StoreContext } from './context';
import { createSaveToStorage, loadInitialState } from './persistence';
import { createSettingsActions } from './actions/settingsActions';
import { createZoneActions } from './actions/zoneActions';
import { createConnectionActions } from './actions/connectionActions';
import { createObjectActions } from './actions/objectActions';
import { createPresetActions } from './actions/presetActions';
import { createCustomListActions } from './actions/customListActions';
import { createCatalogActions } from './actions/catalogActions';
import { createUiActions } from './actions/uiActions';
import { createHistoryActions } from './actions/historyActions';
import { createVariantActions } from './actions/variantActions';
import { createTerrainActions } from './actions/terrainActions';
import { createContentLimitActions } from './actions/contentLimitActions';
import { createContentPoolActions } from './actions/contentPoolActions';
import { createTopologyActions } from './actions/topologyActions';

export const useEditorStore = createWithEqualityFn<EditorStoreState>((set, get) => {
  const saveToStorage = createSaveToStorage(get);
  const ctx: StoreContext = { set, get, saveToStorage };

  return {
    ...loadInitialState(),
    selected: null,
    mode: 'select',
    connectStart: null,
    missingImportedObjects: [],
    notifications: [],
    history: { past: [], future: [] },

    actions: {
      ...createSettingsActions(ctx),
      ...createZoneActions(ctx),
      ...createConnectionActions(ctx),
      ...createObjectActions(ctx),
      ...createPresetActions(ctx),
      ...createCustomListActions(ctx),
      ...createCatalogActions(ctx),
      ...createUiActions(ctx),
      ...createHistoryActions(ctx),
      ...createVariantActions(ctx),
      ...createTerrainActions(ctx),
      ...createContentLimitActions(ctx),
      ...createContentPoolActions(ctx),
      ...createTopologyActions(ctx)
    }
  };
});

// Public API re-exports (preserved for existing consumers).
export { distancePresets, biomeIds, zoneTypes, fallbackFactions, defaultPresetRefs, isBuiltInProfileName, isBuiltInLimitName } from './constants';
export { uniqueKey, safeName } from './ids';
export {
  cloneEntry,
  catalogItemForReference,
  rebuildObjectLibraryLookupMap,
  resolvePresetObjects,
  resolvePresetToZoneObjects
} from './catalog';
export { defaultGuardForPair, makeZone, zonesEqualIgnoreCoords } from './zones';
export { buildDefaultPresets, defaultPresets, isCustomListIdConflict } from './presets';
export type {
  EditorActions,
  EditorStoreState,
  ToastNotification,
  HistorySnapshot,
  HistoryState,
  VariantMeta,
  VariantSnapshot
} from './types';
