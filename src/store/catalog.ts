import type { CatalogItem, ZoneObject } from '../types/editor';
import { uniqueKey } from './ids';

export function cloneEntry(entry: CatalogItem): ZoneObject {
  return {
    key: uniqueKey(),
    id: entry.id,
    sid: entry.sid,
    includeList: entry.includeList,
    label: entry.label,
    description: entry.description,
    labelByLang: entry.labelByLang,
    descriptionByLang: entry.descriptionByLang,
    kind: entry.kind,
    guarded: Boolean(entry.guarded),
    count: 1,
    soloEncounter: false,
    variant: null,
    roadDistance: "any",
    townDistance: "any",
    isMine: Boolean(entry.isMine),
    tag: entry.tag,
    category: entry.category,
    rarity: entry.rarity,
    sizeX: entry.sizeX,
    sizeZ: entry.sizeZ
  };
}

let objectLibraryLookupMap = new Map<string, CatalogItem>();

export function rebuildObjectLibraryLookupMap(library: CatalogItem[]) {
  const map = new Map<string, CatalogItem>();
  library.forEach((item) => {
    if (item.kind === "list") {
      if (item.includeList) map.set(`list:${item.includeList}`, item);
    } else {
      if (item.sid) map.set(`sid:${item.sid}`, item);
      if (item.id) map.set(`sid:${item.id}`, item);
    }
  });
  objectLibraryLookupMap = map;
}

export function catalogItemForReference(objectLibrary: CatalogItem[], reference: { kind: 'sid' | 'list'; value: string }): CatalogItem | null {
  if (!reference || !reference.value) return null;
  const key = `${reference.kind}:${reference.value}`;
  const cached = objectLibraryLookupMap.get(key);
  if (cached) return cached;
  
  if (objectLibraryLookupMap.size === 0 && objectLibrary.length > 0) {
    rebuildObjectLibraryLookupMap(objectLibrary);
    return objectLibraryLookupMap.get(key) || null;
  }
  return null;
}

export function resolvePresetObjects(objectLibrary: CatalogItem[], references: Array<{ kind: 'sid' | 'list'; value: string; guarded: boolean; count?: number }>): ZoneObject[] {
  return references.flatMap((reference) => {
    const item = catalogItemForReference(objectLibrary, reference);
    if (!item) return [];
    return Array.from({ length: reference.count || 1 }, () => ({
      ...cloneEntry(item),
      guarded: reference.guarded
    }));
  });
}

export function resolvePresetToZoneObjects(presetObjects: ZoneObject[]): ZoneObject[] {
  return presetObjects.map(obj => ({
    ...obj,
    key: uniqueKey()
  }));
}
