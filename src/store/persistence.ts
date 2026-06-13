import type { StoreApi } from 'zustand';
import type { CoreCatalog, Zone, Edge, CustomObjectList, VariantMeta, VariantSnapshot } from '../types/editor';
import type { RmgContentListEntry } from '../types/rmg';
import type { EditorStoreState } from './types';
import {
  DESIGN_STORAGE_KEY,
  defaultObjectLibrary,
  fallbackFactions,
  initialSettings
} from './constants';
import { parseSavedDesign } from './parsing';
import { buildDefaultPresets } from './presets';
import {
  normalizeSavedPreset,
  normalizeSavedCustomList,
  normalizeSavedZones,
  normalizeSavedEdge
} from './normalizers';
import {
  applyVariantSettings,
  buildVariantModel,
  collectVariants,
  createVariantId
} from './variants';

export type InitialState = Pick<
  EditorStoreState,
  | 'settings'
  | 'zones'
  | 'edges'
  | 'nextZoneNumber'
  | 'coreCatalog'
  | 'factions'
  | 'objectLibrary'
  | 'artifactLists'
  | 'missingPresetItems'
  | 'theme'
  | 'uiMode'
  | 'snapToGrid'
  | 'presets'
  | 'customObjectLists'
  | 'variants'
  | 'activeVariantId'
  | 'variantSnapshots'
>;

export function createSaveToStorage(
  get: StoreApi<EditorStoreState>['getState']
): (state: Partial<EditorStoreState>) => void {
  return (state: Partial<EditorStoreState>) => {
    try {
      const current = get();
      const settings = state.settings || current.settings;
      const zones = state.zones || current.zones;
      const edges = state.edges || current.edges;
      const nextZoneNumber = state.nextZoneNumber || current.nextZoneNumber;
      const presets = state.presets || current.presets;
      const customObjectLists = state.customObjectLists || current.customObjectLists;
      const variantsMeta = state.variants || current.variants;
      const activeVariantId = state.activeVariantId || current.activeVariantId;
      const variantSnapshots = state.variantSnapshots || current.variantSnapshots;

      const variants = collectVariants({
        zones,
        edges,
        settings,
        variants: variantsMeta,
        activeVariantId,
        variantSnapshots
      }).map(({ meta, snapshot }) => ({ id: meta.id, ...snapshot }));

      localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify({
        settings,
        zones,
        edges,
        nextZoneNumber,
        presets,
        customObjectLists,
        variants,
        activeVariantId
      }));
    } catch {
      // Ignore
    }
  };
}

export function loadInitialState(): InitialState {
  // The Core catalog lives in IndexedDB and is hydrated asynchronously by
  // App.tsx after mount; the initial state always starts on the fallback
  // catalog.
  const loadedCatalog: CoreCatalog | null = null;
  const loadedObjectLibrary = defaultObjectLibrary;
  const loadedArtifactLists: Record<string, RmgContentListEntry[]> = {};
  const loadedFactions = fallbackFactions;
  const loadedMissingPresetItems: string[] = [];

  let initialZones: Zone[] = [];
  let initialEdges: Edge[] = [];
  let initialNextZoneNumber = 1;
  let savedSettings = initialSettings;
  let initialCustomObjectLists: Record<string, CustomObjectList> = {};
  let initialVariants: VariantMeta[] = [];
  let initialActiveVariantId = '';
  let initialVariantSnapshots: Record<string, VariantSnapshot> = {};

  let initialPresets = buildDefaultPresets(loadedObjectLibrary);
  try {
    const rawDesign = localStorage.getItem(DESIGN_STORAGE_KEY);
    if (rawDesign) {
      const data = parseSavedDesign(JSON.parse(rawDesign) as unknown);
      if (data) {
        savedSettings = { ...initialSettings, ...data.settings };
        initialNextZoneNumber = data.nextZoneNumber || data.zones.length + 1;
        const missing: string[] = [];

        // Custom lists first: zone/preset objects may reference them and
        // must not be treated as missing from Core.zip.
        if (data.customObjectLists) {
          initialCustomObjectLists = Object.fromEntries(
            Object.entries(data.customObjectLists).map(([key, list]) => [
              key,
              normalizeSavedCustomList(key, list)
            ])
          );
        }
        if (data.presets) {
          const loadedPresets = Object.fromEntries(
            Object.entries(data.presets).map(([key, preset]) => [
              key,
              normalizeSavedPreset(
                key,
                preset,
                loadedObjectLibrary,
                missing,
                Boolean(loadedCatalog),
                initialCustomObjectLists
              )
            ])
          );
          initialPresets = { ...initialPresets, ...loadedPresets };
        }

        const model = buildVariantModel(
          data,
          (zones) =>
            normalizeSavedZones(
              zones,
              loadedObjectLibrary,
              loadedFactions,
              initialPresets,
              missing,
              Boolean(loadedCatalog),
              initialCustomObjectLists
            ),
          (edges) => edges.map(normalizeSavedEdge)
        );

        initialZones = model.active.zones;
        initialEdges = model.active.edges;
        savedSettings = applyVariantSettings(savedSettings, model.active);
        initialVariants = model.variants;
        initialActiveVariantId = model.activeVariantId;
        initialVariantSnapshots = model.variantSnapshots;
      }
    }
  } catch {
    // Ignore
  }

  if (initialVariants.length === 0) {
    const id = createVariantId();
    initialVariants = [{ id }];
    initialActiveVariantId = id;
    initialVariantSnapshots = {};
  }

  let initialTheme: 'dark' | 'light' = 'dark';
  try {
    const savedTheme = localStorage.getItem('olden-era-rmg-visual-editor-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      initialTheme = savedTheme;
    }
  } catch {
    // Ignore
  }

  // Fresh installs start in the simple mode; anyone with a saved design keeps
  // the full expert surface so nothing disappears after an update.
  let initialUiMode: 'simple' | 'expert' = initialZones.length > 0 ? 'expert' : 'simple';
  try {
    const savedMode = localStorage.getItem('olden-era-rmg-ui-mode');
    if (savedMode === 'simple' || savedMode === 'expert') {
      initialUiMode = savedMode;
    }
  } catch {
    // Ignore
  }

  let initialSnapToGrid = true;
  try {
    const savedSnap = localStorage.getItem('olden-era-rmg-visual-editor-snap');
    if (savedSnap !== null) {
      initialSnapToGrid = savedSnap === 'true';
    }
  } catch {
    // Ignore
  }

  return {
    settings: savedSettings,
    zones: initialZones,
    edges: initialEdges,
    nextZoneNumber: initialNextZoneNumber,
    coreCatalog: loadedCatalog,
    factions: loadedFactions,
    objectLibrary: loadedObjectLibrary,
    artifactLists: loadedArtifactLists,
    missingPresetItems: loadedMissingPresetItems,
    theme: initialTheme,
    uiMode: initialUiMode,
    snapToGrid: initialSnapToGrid,
    presets: initialPresets,
    customObjectLists: initialCustomObjectLists,
    variants: initialVariants,
    activeVariantId: initialActiveVariantId,
    variantSnapshots: initialVariantSnapshots
  };
}
