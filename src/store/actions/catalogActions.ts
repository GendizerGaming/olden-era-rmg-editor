import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { Preset } from '../../types/editor';
import { CORE_CATALOG_STORAGE_KEY, defaultContentLimitPresets, defaultPresetRefs, defaultTerrainProfiles, initialSettings, isBuiltInLimitName, isBuiltInProfileName } from '../constants';
import { rebuildObjectLibraryLookupMap, catalogItemForReference, cloneEntry } from '../catalog';
import { captureHistory, pushHistory } from '../zones';
import { buildDefaultPresets } from '../presets';
import { parseSavedDesign } from '../parsing';
import { normalizeSettings, normalizeSavedPreset, normalizeSavedCustomList, normalizeSavedZones, normalizeSavedEdge } from '../normalizers';
import { applyVariantSettings, buildVariantModel, createVariantId } from '../variants';
import { saveCatalogToDB } from '../../services/db';

export function createCatalogActions(ctx: StoreContext): Pick<EditorActions, 'loadCoreCatalog' | 'importDesign' | 'clearWorkspace' | 'detachOriginalLayout'> {
  const { set, saveToStorage } = ctx;
  return {
      loadCoreCatalog: (catalog) => {
        set((state) => {
          const objectLibrary = catalog.objects.filter((item) => {
            if (!item?.id) return false;
            if (item.kind === "list") return true;
            const sid = item.sid || item.id;
            if (/campaign/i.test(sid)) return false;
            if (/^block(_|$)/i.test(sid)) return false;
            return ["Interact", "Resource", "Artifact"].includes(item.tag || "");
          });
          
          rebuildObjectLibraryLookupMap(objectLibrary);
          
          const factions = catalog.factions.map(f => ({
            id: f.id,
            label: f.label || f.id,
            labelByLang: f.labelByLang || { ru: f.label || f.id, en: f.label || f.id }
          })).sort((a, b) => a.labelByLang[state.settings.language].localeCompare(b.labelByLang[state.settings.language], state.settings.language));
          
          // Reconcile zones objects with core catalog
          const missing: string[] = [];
          const isCustomListRef = (reference: { kind: 'sid' | 'list'; value: string }) =>
            reference.kind === "list" && Boolean(state.customObjectLists[reference.value]);
          const updatedZones = state.zones.map(zone => {
            const objects = zone.objects.flatMap((saved) => {
              const reference = saved.kind === "list" || saved.includeList
                ? { kind: "list" as const, value: saved.includeList || "" }
                : { kind: "sid" as const, value: saved.sid || saved.id || "" };
              if (isCustomListRef(reference)) return [saved];
              const item = catalogItemForReference(objectLibrary, reference);
              if (!item) {
                if (reference.value) missing.push(reference.value);
                return [saved]; // keep as-is if missing
              }
              return [{
                ...saved,
                ...cloneEntry(item),
                count: saved.count,
                guarded: saved.guarded,
                soloEncounter: saved.soloEncounter,
                variant: saved.variant,
                roadDistance: saved.roadDistance,
                townDistance: saved.townDistance
              }];
            });
            return { ...zone, objects };
          });
          
          const updatedPresets = Object.entries(state.presets).reduce((acc: Record<string, Preset>, [id, preset]) => {
            const objects = preset.objects.flatMap((saved) => {
              const reference = saved.kind === "list" || saved.includeList
                ? { kind: "list" as const, value: saved.includeList || "" }
                : { kind: "sid" as const, value: saved.sid || saved.id || "" };
              if (isCustomListRef(reference)) return [saved];
              const item = catalogItemForReference(objectLibrary, reference);
              if (!item) {
                if (reference.value) missing.push(reference.value);
                return [saved];
              }
              return [{
                ...saved,
                ...cloneEntry(item),
                count: saved.count,
                guarded: saved.guarded,
                soloEncounter: saved.soloEncounter,
                variant: saved.variant,
                roadDistance: saved.roadDistance,
                townDistance: saved.townDistance
              }];
            });
            acc[id] = { ...preset, objects };
            return acc;
          }, {});
          
          const allPresetRefs = [
            ...defaultPresetRefs.low.objectRefs,
            ...defaultPresetRefs.medium.objectRefs,
            ...defaultPresetRefs.high.objectRefs,
            ...defaultPresetRefs.neutral.objectRefs
          ];
          const missingPresets = allPresetRefs
            .filter((ref) => !catalogItemForReference(objectLibrary, ref))
            .map((ref) => ref.value);
          const missingPresetItems = [...new Set(missingPresets)].sort();

          const nextState = {
            coreCatalog: catalog,
            objectLibrary,
            artifactLists: catalog.artifactLists,
            factions,
            zones: updatedZones,
            presets: updatedPresets,
            missingImportedObjects: [...new Set(missing)].sort(),
            missingPresetItems
          };
          
          try {
            localStorage.removeItem("olden-era-rmg-core-catalog");
            localStorage.removeItem(CORE_CATALOG_STORAGE_KEY);
          } catch {
            // Storage cleanup is best effort.
          }
          void saveCatalogToDB(catalog).catch(() => undefined);
          
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      importDesign: (designData) => {
        set((state) => {
          const parsedDesign = parseSavedDesign(designData);
          if (!parsedDesign) {
            throw new Error("Неверный или неподдерживаемый формат файла схемы.");
          }
          
          const snapshot = captureHistory(state);
          const newSettings = normalizeSettings({
            ...state.settings,
            ...parsedDesign.settings
          });

          // User-created and built-in terrain profiles survive the import:
          // the incoming template's profiles win on a name clash, everything
          // else is kept, and any built-in missing entirely is restored from
          // the factory copy (built-ins back the "Auto" terrain option).
          const importedProfileNames = new Set(newSettings.terrainProfiles.map((profile) => profile.name));
          const keptProfiles = state.settings.terrainProfiles.filter(
            (profile) => (profile.custom || isBuiltInProfileName(profile.name)) && !importedProfileNames.has(profile.name)
          );
          newSettings.terrainProfiles = [...newSettings.terrainProfiles, ...keptProfiles];
          for (const factory of defaultTerrainProfiles()) {
            if (!newSettings.terrainProfiles.some((profile) => profile.name === factory.name)) {
              newSettings.terrainProfiles.push(factory);
            }
          }

          // Content-limit presets follow the same rules as terrain profiles.
          const importedLimitNames = new Set(newSettings.contentLimitPresets.map((preset) => preset.name));
          const keptLimits = state.settings.contentLimitPresets.filter(
            (preset) => (preset.custom || isBuiltInLimitName(preset.name)) && !importedLimitNames.has(preset.name)
          );
          newSettings.contentLimitPresets = [...newSettings.contentLimitPresets, ...keptLimits];
          for (const factory of defaultContentLimitPresets()) {
            if (!newSettings.contentLimitPresets.some((preset) => preset.name === factory.name)) {
              newSettings.contentLimitPresets.push(factory);
            }
          }

          // User-created content pools survive the import the same way.
          const importedPoolNames = new Set(newSettings.contentPoolPresets.map((pool) => pool.name));
          const keptPools = state.settings.contentPoolPresets.filter(
            (pool) => pool.custom && !importedPoolNames.has(pool.name)
          );
          newSettings.contentPoolPresets = [...newSettings.contentPoolPresets, ...keptPools];

          const missing: string[] = [];

          // Custom lists come first: zone/preset objects may reference them
          // and must not be treated as missing from Core.zip.
          let newCustomObjectLists = state.customObjectLists;
          if (parsedDesign.customObjectLists) {
            newCustomObjectLists = Object.fromEntries(
              Object.entries(parsedDesign.customObjectLists).map(
                ([key, list]) => [key, normalizeSavedCustomList(key, list)]
              )
            );
          }

          let newPresets = state.presets;
          if (parsedDesign.presets) {
            newPresets = {
              ...buildDefaultPresets(state.objectLibrary),
              ...Object.fromEntries(
                Object.entries(parsedDesign.presets).map(([key, preset]) => [
                  key,
                  normalizeSavedPreset(
                    key,
                    preset,
                    state.objectLibrary,
                    missing,
                    Boolean(state.coreCatalog),
                    newCustomObjectLists
                  )
                ])
              )
            };
          }

          const model = buildVariantModel(
            parsedDesign,
            (zones) =>
              normalizeSavedZones(
                zones,
                state.objectLibrary,
                state.factions,
                newPresets,
                missing,
                Boolean(state.coreCatalog),
                newCustomObjectLists
              ),
            (edges) => edges.map(normalizeSavedEdge)
          );

          const newZones = model.active.zones;
          const newEdges = model.active.edges;

          const nextState = {
            settings: applyVariantSettings(newSettings, model.active),
            zones: newZones,
            edges: newEdges,
            presets: newPresets,
            customObjectLists: newCustomObjectLists,
            nextZoneNumber: newZones.length + 1,
            variants: model.variants,
            activeVariantId: model.activeVariantId,
            variantSnapshots: model.variantSnapshots,
            selected: null,
            mode: "select" as const,
            connectStart: null,
            missingImportedObjects: [...new Set(missing)].sort(),
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      clearWorkspace: () => {
        set((state) => {
          const snapshot = captureHistory(state);
          const variantId = createVariantId();
          // User-created profiles and built-ins (with their edited values)
          // survive a workspace clear, like presets do.
          const keptProfiles = state.settings.terrainProfiles.filter(
            (profile) => profile.custom || isBuiltInProfileName(profile.name)
          );
          const restoredProfiles = defaultTerrainProfiles().filter(
            (factory) => !keptProfiles.some((profile) => profile.name === factory.name)
          );
          const keptLimits = state.settings.contentLimitPresets.filter(
            (preset) => preset.custom || isBuiltInLimitName(preset.name)
          );
          const restoredLimits = defaultContentLimitPresets().filter(
            (factory) => !keptLimits.some((preset) => preset.name === factory.name)
          );
          const keptPools = state.settings.contentPoolPresets.filter((pool) => pool.custom);
          const nextState = {
            settings: {
              ...initialSettings,
              language: state.settings.language,
              terrainProfiles: [...restoredProfiles, ...keptProfiles],
              contentLimitPresets: [...restoredLimits, ...keptLimits],
              contentPoolPresets: keptPools
            },
            zones: [],
            edges: [],
            customObjectLists: {},
            variants: [{ id: variantId }],
            activeVariantId: variantId,
            variantSnapshots: {},
            selected: null,
            mode: "select" as const,
            connectStart: null,
            nextZoneNumber: 1,
            missingImportedObjects: [],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      detachOriginalLayout: () => {
        set((state) => {
          const snapshot = captureHistory(state);
          const nextState = {
            settings: {
              ...state.settings,
              originalZoneLayouts: undefined,
              originalContentLists: undefined,
              originalOrientation: undefined,
              originalBorder: undefined,
              originalRawRootFields: undefined
            },
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
