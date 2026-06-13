import type { Preset, CatalogItem, CustomObjectList } from '../types/editor';
import { resolvePresetObjects } from './catalog';
import { defaultPresetRefs, defaultObjectLibrary, zoneTypes } from './constants';

export function buildDefaultPresets(objectLibrary: CatalogItem[]): Record<string, Preset> {
  const result: Record<string, Preset> = {};
  for (const [key, ref] of Object.entries(defaultPresetRefs)) {
    const references = ref.objectRefs.map(r => ({ kind: r.kind, value: r.value, guarded: r.guarded, count: r.count }));
    result[key] = {
      id: ref.id,
      label: ref.label,
      baseType: ref.baseType,
      guardedValue: ref.guardedValue,
      unguardedValue: ref.unguardedValue,
      resourcesValue: ref.resourcesValue,
      guardedValuePerArea: ref.guardedValuePerArea,
      unguardedValuePerArea: ref.unguardedValuePerArea,
      resourcesValuePerArea: ref.resourcesValuePerArea,
      guardMultiplier: ref.guardMultiplier,
      diplomacyModifier: ref.diplomacyModifier,
      objects: resolvePresetObjects(objectLibrary, references),
      isCustom: false
    };
  }
  return result;
}

export const defaultPresets = buildDefaultPresets(defaultObjectLibrary);

export function isCustomListIdConflict(
  customObjectLists: Record<string, CustomObjectList>,
  objectLibrary: CatalogItem[],
  presets: Record<string, Preset>,
  id: string,
  ignoreId?: string
): boolean {
  const cleanId = id.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) return true;
  
  const idLower = cleanId.toLowerCase();
  if (ignoreId && idLower === ignoreId.toLowerCase()) return false;
  
  // Check other custom lists
  if (Object.keys(customObjectLists).some(k => k.toLowerCase() === idLower)) return true;
  
  // Check standard game presets & zones
  if (Object.keys(defaultPresetRefs).some(k => k.toLowerCase() === idLower)) return true;
  if (Object.keys(zoneTypes).some(k => k.toLowerCase() === idLower)) return true;
  
  // Check custom presets
  if (Object.keys(presets).some(k => k.toLowerCase() === idLower)) return true;
  
  // Check standard game catalog objects & lists
  const inCatalog = objectLibrary.some(item => 
    (item.sid && item.sid.toLowerCase() === idLower) || 
    (item.id && item.id.toLowerCase() === idLower) || 
    (item.includeList && item.includeList.toLowerCase() === idLower)
  );
  if (inCatalog) return true;
  
  return false;
}
