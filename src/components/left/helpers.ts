import type { CatalogItem } from '../../types/editor';
import type { TranslationFunction } from '../../i18n/context';

export const knownMapSizes = [80, 96, 112, 128, 144, 160, 176, 192, 208, 240, 256];

export function itemLabel(item: CatalogItem, lang: 'ru' | 'en'): string {
  return item?.labelByLang?.[lang] || item?.label || item?.sid || item?.includeList || item?.id || "";
}

export function itemDescription(item: CatalogItem, lang: 'ru' | 'en'): string {
  return item?.descriptionByLang?.[lang] || item?.description || "";
}

export function describeCatalogItem(item: CatalogItem, t: TranslationFunction): string {
  if (!item) return "";
  if (item.kind === "list" && item.tag === "GeneratedList") {
    return t("artifactListDescription", { count: item.count || 0 });
  }
  if (item.kind === "list") return t("listDescription", { count: item.count || 0 });
  if (item.rarity) return t("itemArtifactDescription", { rarity: item.rarity });
  if (item.tag) return t("mapObjectDescription", { tag: item.tag, size: `${item.sizeX || "?"}x${item.sizeZ || "?"}` });
  return t("unknownObject");
}

export function sortedObjectLibrary(library: CatalogItem[], lang: 'ru' | 'en'): CatalogItem[] {
  return [...library].sort((a, b) => itemLabel(a, lang).localeCompare(itemLabel(b, lang), lang));
}
