import type { EditorState, MapSettings, Zone, Edge, CatalogItem, ContentLimitPreset, ContentPoolPreset, Faction, CoreCatalog, ZoneObject, ZoneType, CityFactionMode, ConnectionType, Preset, ZoneMainObject, CustomObjectList, CustomObjectListEntry, VariantMeta, VariantSnapshot, TerrainProfile } from '../types/editor';
import type { TemplateRecipe, TemplateRecipeTopology } from './templateRecipes';
import type { RmgBorder, RmgContentListEntry, RmgOrientation } from '../types/rmg';

export type StoredRecord = Record<string, unknown>;

export interface PresetObjectReference {
  kind: "sid" | "list";
  value: string;
  guarded: boolean;
  count?: number;
}

export interface DefaultPresetDefinition {
  id: string;
  label: string;
  baseType: Preset["baseType"];
  guardedValue: number;
  unguardedValue: number;
  resourcesValue: number;
  objectRefs: PresetObjectReference[];
  isCustom: false;
  guardedValuePerArea?: number;
  unguardedValuePerArea?: number;
  resourcesValuePerArea?: number;
  guardMultiplier?: number;
  diplomacyModifier?: number;
}

export type SavedZoneObject = Omit<Partial<ZoneObject>, "variant"> & {
  variant?: number | string | null;
};

export type SavedMainObject = Partial<ZoneMainObject>;

export type SavedZone = Omit<
  Partial<Zone>,
  "mainObjects" | "objects" | "rawFields"
> & {
  mainObjects?: SavedMainObject[];
  objects?: SavedZoneObject[];
  rawFields?: Zone["rawFields"];
  mainCity?: boolean;
  cityEnabled?: boolean;
  player?: number;
  factionSource?: string;
  cityFactionSource?: string;
  cityFactionMode?: CityFactionMode;
  cityFactionId?: string;
};

export type SavedEdge = Partial<Edge>;

export type SavedPreset = Omit<Partial<Preset>, "objects"> & {
  objects?: SavedZoneObject[];
};

export type SavedCustomObjectList = Omit<Partial<CustomObjectList>, "entries"> & {
  entries?: Array<Partial<CustomObjectListEntry>>;
};

export interface SavedVariant {
  id?: string;
  zones: SavedZone[];
  edges: SavedEdge[];
  fixedOrientation?: boolean;
  orientationAnchor?: string;
  preserveLayout?: boolean;
  originalOrientation?: RmgOrientation;
  borderWaterWidth?: number;
  borderCornerRadius?: number;
  originalBorder?: RmgBorder;
}

export interface SavedDesign {
  settings?: Partial<MapSettings>;
  zones: SavedZone[];
  edges: SavedEdge[];
  nextZoneNumber?: number;
  presets?: Record<string, SavedPreset>;
  customObjectLists?: Record<string, SavedCustomObjectList>;
  variants?: SavedVariant[];
  activeVariantId?: string;
}

export interface HistorySnapshot {
  settings: MapSettings;
  zones: Zone[];
  edges: Edge[];
}

export interface HistoryState {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

export interface EditorActions {
  updateSettings: (updater: Partial<MapSettings> | ((prev: MapSettings) => Partial<MapSettings>)) => void;
  addZone: (type: ZoneType) => void;
  deleteSelected: () => void;
  updateZoneField: (zoneId: string, updates: Partial<Zone>) => void;
  updateEdgeField: (edgeId: string, updates: Partial<Edge>) => void;
  setSelected: (selected: { type: 'zone' | 'edge' | 'edgePair' | 'preset' | 'customList' | 'elementsList' | 'terrainProfile'; id: string } | null) => void;
  setMode: (mode: 'select' | 'connect') => void;
  setConnectStart: (zoneId: string | null) => void;
  connectZones: (fromId: string, toId: string, connectionType?: ConnectionType) => void;
  deleteEdge: (edgeId: string) => void;
  addObjectToZone: (zoneId: string, item: CatalogItem) => void;
  updateObjectField: (zoneId: string, objectKey: string, updates: Partial<ZoneObject>) => void;
  removeObjectFromZone: (zoneId: string, objectKey: string) => void;
  loadCoreCatalog: (catalog: CoreCatalog) => void;
  importDesign: (designData: unknown) => void;
  clearWorkspace: () => void;
  setZonePosition: (zoneId: string, x: number, y: number) => void;
  /** Re-derive zone values from the preset × the current map's area scale; no id = all zones. */
  rescaleZoneValues: (zoneId?: string) => void;
  /** Duplicate the selected zone (full clone) or connection, next to the original. */
  duplicateSelected: () => void;
  /** Replace the canvas with a generated topology skeleton (undoable). */
  generateTopology: (options: TemplateRecipeTopology & {
    extraCitiesPerPlayer?: number;
    extraCitiesInCenter?: number;
  }) => void;
  /** Apply a whole-template recipe: map settings + generated skeleton (undoable). */
  applyTemplateRecipe: (recipe: TemplateRecipe & { name?: string }) => void;
  toggleTheme: () => void;
  setUiMode: (uiMode: 'simple' | 'expert') => void;
  addNotification: (key: string, params?: Record<string, string | number>, type?: 'success' | 'info' | 'warn' | 'error') => void;
  removeNotification: (id: string) => void;
  updatePresetObjectField: (presetId: string, objectKey: string, updates: Partial<ZoneObject>) => void;
  saveZoneAsPreset: (zoneId: string, name: string) => void;
  detachOriginalLayout: () => void;

  // Terrain profile (zoneLayout) actions
  addTerrainProfile: () => void;
  duplicateTerrainProfile: (name: string) => void;
  deleteTerrainProfile: (name: string) => void;
  updateTerrainProfile: (name: string, updates: Partial<TerrainProfile>) => void;
  resetTerrainProfile: (name: string) => void;
  resetBuiltInTerrainProfiles: () => void;

  // Content-limit preset (contentCountLimits) actions
  addContentLimitPreset: () => void;
  duplicateContentLimitPreset: (name: string) => void;
  deleteContentLimitPreset: (name: string) => void;
  updateContentLimitPreset: (name: string, updates: Partial<ContentLimitPreset>) => void;
  resetBuiltInContentLimits: () => void;

  // Content pool (contentPools) actions
  addContentPoolPreset: () => void;
  duplicateContentPoolPreset: (name: string) => void;
  deleteContentPoolPreset: (name: string) => void;
  updateContentPoolPreset: (name: string, updates: Partial<ContentPoolPreset>) => void;

  // Undo/Redo & Utility Actions
  undo: () => void;
  redo: () => void;
  toggleSnapToGrid: () => void;

  // Preset Actions
  createPreset: (name: string, baseType: Preset['baseType'], cloneFromId?: string, seed?: Partial<Preset>) => void;
  updatePreset: (id: string, updates: Partial<Preset>) => void;
  deletePreset: (id: string) => void;
  resetPreset: (id: string) => void;
  resetBuiltInPresets: () => void;
  importPresets: (presetsData: unknown) => void;
  addObjectToPreset: (presetId: string, item: CatalogItem) => void;
  removeObjectFromPreset: (presetId: string, objectKey: string) => void;

  // Custom Object Lists Actions
  createCustomList: (id: string, label: string, cloneFromId?: string) => boolean;
  updateCustomList: (id: string, updates: Partial<CustomObjectList>) => boolean;
  deleteCustomList: (id: string) => void;
  addEntryToCustomList: (listId: string, entry: Omit<CustomObjectListEntry, 'key'>) => void;
  removeEntryFromCustomList: (listId: string, entryKey: string) => void;
  updateEntryWeightInCustomList: (listId: string, entryKey: string, weight: number) => void;

  // Variant Actions
  setActiveVariant: (id: string) => void;
  addVariant: () => void;
  duplicateVariant: (id: string) => void;
  deleteVariant: (id: string) => void;
}

export interface ToastNotification {
  id: string;
  key: string;
  params?: Record<string, string | number>;
  type?: 'success' | 'info' | 'warn' | 'error';
}

export type EditorStoreState = EditorState & {
  coreCatalog: CoreCatalog | null;
  factions: Faction[];
  objectLibrary: CatalogItem[];
  artifactLists: Record<string, RmgContentListEntry[]>;
  missingImportedObjects: string[];
  missingPresetItems: string[];
  theme: 'dark' | 'light';
  /** UI complexity mode: 'simple' hides the format-level knobs. */
  uiMode: 'simple' | 'expert';
  notifications: ToastNotification[];
  snapToGrid: boolean;
  history: HistoryState;
  /** Snapshots of every variant that is not currently active (keyed by id). */
  variantSnapshots: Record<string, VariantSnapshot>;
  actions: EditorActions;
};

export type { VariantMeta, VariantSnapshot };
