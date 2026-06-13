# Architecture

This document describes how the editor code is organised. The store and UI
panels are split into focused modules; runtime behaviour and the public store
API are stable across these splits.

## Store (`src/store/`)

The store is a thin assembler plus focused modules. `useEditorStore.ts` builds
the Zustand store and re-exports the public surface, so every existing import
path (`../store/useEditorStore`) keeps working.

Pure, dependency-free building blocks come first and higher-level modules build
on them:

- `ids.ts` — `uniqueKey`, `safeName` (no dependencies).
- `types.ts` — all store-facing types and interfaces (`EditorActions`,
  `EditorStoreState`, `ToastNotification`, the `Saved*` persistence types, etc.).
- `catalog.ts` — the object-library lookup map plus `cloneEntry`,
  `catalogItemForReference`, `resolvePresetObjects`, `resolvePresetToZoneObjects`.
- `constants.ts` — storage keys, `distancePresets`, `zoneTypes`,
  `fallbackFactions`, `initialSettings`, `defaultObjectLibrary`,
  `defaultPresetRefs`, the default terrain profiles / content-limit presets.
- `parsing.ts` — type guards and the `parseSaved*` validators for untrusted
  persisted/imported JSON.
- `zones.ts` — zone/edge factories and helpers (`makeZone`,
  `makeDefaultSpawnObject`, `defaultGuardForPair`, `zoneContentScale`,
  `scalePresetValues`, `captureHistory`, `pushHistory`, …).
- `presets.ts` — `buildDefaultPresets`, `defaultPresets`,
  `isCustomListIdConflict`.
- `presetRecipes.ts` — the role+tier matrix (`PresetRole`, `PresetTier`,
  `PRESET_RECIPES`) behind the "create zone preset" mini-wizard.
- `templateRecipes.ts` — `TEMPLATE_RECIPES`, the curated whole-template
  starting points (1v1 ladder, multiplayer, special modes) applied by the
  recipes dialog.
- `normalizers.ts` — the `normalize*` functions that turn parsed data into the
  in-memory model.
- `variants.ts` — multi-variant helpers (`createVariantId`, `activeSnapshot`,
  `applyVariantSettings`, `collectVariants`, `buildVariantModel`).
- `persistence.ts` — `createSaveToStorage` (localStorage writer) and
  `loadInitialState` (boot-time hydration).
- `context.ts` — `StoreContext` (`set` / `get` / `saveToStorage`) passed to the
  action factories.

### Actions (`src/store/actions/`)

Each file exports a `create*Actions(ctx)` factory returning a slice of
`EditorActions`. `useEditorStore.ts` spreads them all into a single `actions`
object, so call sites keep using `store.actions.x`.

- `settingsActions.ts` — `updateSettings`
- `zoneActions.ts` — `addZone`, `deleteSelected`, `updateZoneField`,
  `setZonePosition`, `rescaleZoneValues`, `duplicateSelected`
- `connectionActions.ts` — `connectZones`, `updateEdgeField`, `deleteEdge`
- `objectActions.ts` — `addObjectToZone`, `updateObjectField`,
  `removeObjectFromZone` (zone main/loose objects)
- `presetActions.ts` — preset CRUD (`createPreset`, `updatePreset`,
  `deletePreset`, `resetPreset`, `resetBuiltInPresets`, `importPresets`),
  preset objects (`addObjectToPreset`, `removeObjectFromPreset`,
  `updatePresetObjectField`) and `saveZoneAsPreset`
- `customListActions.ts` — custom object list CRUD (`createCustomList`,
  `updateCustomList`, `deleteCustomList`) and entries (`addEntryToCustomList`,
  `removeEntryFromCustomList`, `updateEntryWeightInCustomList`)
- `terrainActions.ts` — terrain-profile CRUD plus `resetTerrainProfile` /
  `resetBuiltInTerrainProfiles`
- `contentLimitActions.ts` — content-count-limit preset CRUD plus
  `resetBuiltInContentLimits`
- `contentPoolActions.ts` — content-pool preset CRUD
- `topologyActions.ts` — `generateTopology` (wizard) and `applyTemplateRecipe`
  (whole-template recipes); both build the skeleton and place neutral cities
- `variantActions.ts` — `setActiveVariant`, `addVariant`, `duplicateVariant`,
  `deleteVariant`
- `catalogActions.ts` — `loadCoreCatalog`, `importDesign`, `clearWorkspace`,
  `detachOriginalLayout`
- `uiActions.ts` — selection (`setSelected`, `setConnectStart`), `setMode`,
  `setUiMode`, `toggleTheme`, `toggleSnapToGrid`, notifications
- `historyActions.ts` — `undo`, `redo`

## Services (`src/services/`)

Stateless modules that do the heavy format and IO work, independent of the
store:

- `jsonGenerator.ts` — `generateTemplate`: the model → `.rmg.json` export
  (emit-only-when-set, with `extraVariants` support).
- `jsonImporter.ts` — `importTemplateFromJson`: `.rmg.json` → model import.
- `jsonDocument.ts` — JSON serialisation and the download helper.
- `editorDocuments.ts` — builds the saveable documents (game template and the
  editor `.visual-design.json` working file).
- `coreParser.ts` — parses the game's `Core.zip` into the object catalog,
  factions and artifact lists.
- `db.ts` — IndexedDB persistence for the parsed Core catalog.
- `gameFolder.ts` — File System Access integration for writing straight into
  the game's `map_templates` folder.
- `topologyGenerator.ts` — `buildTopologyPlan`: the ring / chain / star /
  random skeleton generator.
- `validator.ts` — the live validation messages shown in the inspector.
- `balanceAnalyzer.ts` — the 0–100 balance score and "what's inside" summary.
- `valueTiers.ts` — the value → quality-tier scales behind the value badges.

## Components (`src/components/`)

Top-level panels: `Topbar.tsx`, `LeftPanel.tsx`, `Canvas.tsx`, `RightPanel.tsx`,
plus dialogs/overlays (`TopologyWizard.tsx`, `TemplateRecipesDialog.tsx`,
`WelcomeOverlay.tsx`).

Shared, panel-agnostic helpers and widgets live in `shared/`:

- `shared/forms.ts` — `fieldUpdate`
- `shared/guards.ts` — `is*` discriminator helpers shared by the panels
- `shared/presetNames.ts` — `presetDisplayName` (localized preset labels)
- `shared/LazyDetails.tsx` — the lazy `<details>` component
- `shared/NumberField.tsx` — the commit-on-blur numeric input
- `shared/ValueBadge.tsx` — the quality-tier chip rendered next to values
- `shared/GuardReactionEditor.tsx` — the six-slot guard-reaction distribution editor

### Left panel (`src/components/left/`)

`LeftPanel.tsx` is the section shell; the larger sections are extracted:

- `left/BansSection.tsx` — global bans (with the one-click standard ban set)
- `left/BonusesSection.tsx` — starting bonuses
- `left/ValueOverridesSection.tsx` — per-object guard-value overrides (the
  template's `valueOverrides`)
- `left/VariantsSection.tsx` — generation variants list
- `left/helpers.ts` — catalog-display helpers and `knownMapSizes`

### Right panel (`src/components/right/`)

`RightPanel.tsx` keeps the panel shell and delegates to the inspector that
matches the current selection:

- `ZoneInspector.tsx`, `EdgeInspector.tsx`, `EdgePairInspector.tsx`
- `PresetInspector.tsx`, `TerrainProfileInspector.tsx`
- `ContentLimitInspector.tsx`, `ContentPoolInspector.tsx`
- `CustomListInspector.tsx`, `ElementsListInspector.tsx`

### Canvas (`src/components/canvas/`)

`Canvas.tsx` imports its geometry and color helpers from `canvas/helpers.ts`
(`playerColors`, `clamp`, `formatGuardValue`, `pairBend`, `connectionPath`).

## Variants

A template's `variants` array holds alternative map skeletons — each its own
zones and connections; the game picks one at random when generating a map.
Everything else (map size, game rules, content pools, object lists) **and the
orientation/layout settings** are shared across all variants, so they live in
`settings` and the shared Map block of the UI, not in the per-variant data.

In the editor the **active** variant is the one being edited — it lives in the
flat `zones`/`edges` of the store. Other variants are kept as `VariantSnapshot`
values (`{ zones, edges }`) in `variantSnapshots`, with order in `variants`
(`VariantMeta[]`, identity only — variants are numbered positionally as
"Variant 1, 2, 3…" in the UI, there are no custom names). `store/variants.ts`
holds the helpers (`activeSnapshot`, `collectVariants`, `buildVariantModel`);
`store/actions/variantActions.ts` holds the operations (`setActiveVariant`,
`addVariant`, `duplicateVariant`, `deleteVariant`) — adding and duplicating
append a new variant at the end, switching stashes the active one and loads the
target. The Variants section sits below the Map block in the left panel.

Import and export reuse the existing single-variant logic per variant:
`importTemplateFromJson` parses each `variants[i]` (recursively importing a
single-variant copy for the non-active ones), and `generateTemplate` accepts
`extraVariants` and appends each by recursively generating a single-variant
template, merging shared per-zone arrays (mandatory content, zone layouts,
generated content lists) by name. Single-variant templates therefore follow
exactly the same code path and output as before.
