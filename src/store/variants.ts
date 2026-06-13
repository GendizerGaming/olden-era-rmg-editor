import type { EditorStoreState, SavedDesign, SavedVariant, SavedZone, SavedEdge, VariantMeta, VariantSnapshot } from './types';
import type { Zone, Edge, MapSettings } from '../types/editor';
import { uniqueKey } from './ids';

export function createVariantId(): string {
  return `variant_${uniqueKey()}`;
}

type ActiveSource = Pick<EditorStoreState, 'zones' | 'edges' | 'settings'>;

/** Captures the currently edited (active) variant as a snapshot. */
export function activeSnapshot(state: ActiveSource): VariantSnapshot {
  return {
    zones: state.zones,
    edges: state.edges,
    fixedOrientation: state.settings.fixedOrientation,
    orientationAnchor: state.settings.orientationAnchor,
    preserveLayout: state.settings.preserveLayout,
    originalOrientation: state.settings.originalOrientation,
    borderWaterWidth: state.settings.borderWaterWidth,
    borderCornerRadius: state.settings.borderCornerRadius,
    originalBorder: state.settings.originalBorder
  };
}

/**
 * Surfaces a snapshot's per-variant settings (orientation and border) through
 * `settings` when the snapshot becomes active.
 */
export function applyVariantSettings(
  settings: MapSettings,
  snapshot: VariantSnapshot
): MapSettings {
  return {
    ...settings,
    fixedOrientation: snapshot.fixedOrientation,
    orientationAnchor: snapshot.orientationAnchor,
    preserveLayout: snapshot.preserveLayout,
    originalOrientation: snapshot.originalOrientation,
    borderWaterWidth: snapshot.borderWaterWidth,
    borderCornerRadius: snapshot.borderCornerRadius,
    originalBorder: snapshot.originalBorder
  };
}

export interface FullVariant {
  meta: VariantMeta;
  snapshot: VariantSnapshot;
}

type CollectSource = ActiveSource &
  Pick<EditorStoreState, 'variants' | 'activeVariantId' | 'variantSnapshots'>;

/**
 * Returns every variant in order as a full snapshot, drawing the active variant
 * from the live editing state and the rest from the stored snapshots.
 */
export function collectVariants(state: CollectSource): FullVariant[] {
  return state.variants
    .map((meta) => ({
      meta,
      snapshot:
        meta.id === state.activeVariantId
          ? activeSnapshot(state)
          : state.variantSnapshots[meta.id]
    }))
    .filter((entry): entry is FullVariant => Boolean(entry.snapshot));
}

export interface VariantModel {
  active: VariantSnapshot;
  activeVariantId: string;
  variants: VariantMeta[];
  variantSnapshots: Record<string, VariantSnapshot>;
}

/**
 * Reconstructs the in-memory variant model from a parsed/saved design.
 * Single-variant designs (no `variants` array) are wrapped into one variant
 * built from the top-level zones/edges. Orientation and border are
 * per-variant: each snapshot carries its own copy.
 */
export function buildVariantModel(
  data: Pick<SavedDesign, 'zones' | 'edges' | 'variants' | 'activeVariantId'>,
  normalizeZones: (zones: SavedZone[]) => Zone[],
  normalizeEdges: (edges: SavedEdge[]) => Edge[]
): VariantModel {
  const source: SavedVariant[] =
    data.variants && data.variants.length > 0
      ? data.variants
      : [{ zones: data.zones, edges: data.edges }];

  const built = source.map((variant) => ({
    meta: { id: variant.id || createVariantId() },
    snapshot: {
      zones: normalizeZones(variant.zones ?? []),
      edges: normalizeEdges(variant.edges ?? []),
      fixedOrientation: variant.fixedOrientation ?? false,
      orientationAnchor: variant.orientationAnchor ?? '',
      preserveLayout: variant.preserveLayout ?? false,
      originalOrientation: variant.originalOrientation,
      borderWaterWidth: variant.borderWaterWidth ?? 0,
      borderCornerRadius: variant.borderCornerRadius ?? 0,
      originalBorder: variant.originalBorder
    } satisfies VariantSnapshot
  }));

  let activeIndex = data.activeVariantId
    ? built.findIndex((entry) => entry.meta.id === data.activeVariantId)
    : 0;
  if (activeIndex < 0) activeIndex = 0;

  const variantSnapshots: Record<string, VariantSnapshot> = {};
  built.forEach((entry, index) => {
    if (index !== activeIndex) variantSnapshots[entry.meta.id] = entry.snapshot;
  });

  return {
    active: built[activeIndex].snapshot,
    activeVariantId: built[activeIndex].meta.id,
    variants: built.map((entry) => entry.meta),
    variantSnapshots
  };
}
