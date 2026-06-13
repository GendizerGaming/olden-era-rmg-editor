import { unzipSync } from 'fflate';
import type {
  CatalogContentEntry,
  CoreCatalog,
  CoreHero,
  CoreSpell,
  CoreUnit,
  CatalogItem,
  Faction
} from '../types/editor';
import { CORE_CATALOG_VERSION } from '../types/editor';
import type { RmgContentListEntry } from '../types/rmg';

const textDecoder = new TextDecoder("utf-8");

type CoreRecord = Record<string, unknown>;

interface TokenRecord extends CoreRecord {
  sid?: string;
  text?: string;
}

interface ContentEntryRecord extends CoreRecord {
  sid?: string;
  includeLists?: string | string[];
  weight?: number | string | null;
  biome?: string;
  variant?: number | string | null;
}

interface ContentListRecord extends CoreRecord {
  name?: string;
  content?: unknown;
}

interface MapObjectRecord extends CoreRecord {
  id?: string;
  tag?: string;
  sizeX?: number;
  sizeZ?: number;
}

interface ItemRecord extends CoreRecord {
  id?: string;
  rarity?: string;
}

interface CityRecord extends CoreRecord {
  id?: string;
  fraction?: string;
  faction?: string;
}

interface MetaObjectRecord extends CoreRecord {
  sid?: string;
  type?: string;
  args?: unknown[];
  value?: number;
  guardValue?: number;
}

interface HeroRecord extends CoreRecord {
  id?: string;
  fraction?: string;
  classType?: string;
}

interface MagicRecord extends CoreRecord {
  id?: string;
  name?: string;
}

interface UnitRecord extends CoreRecord {
  id?: string;
  fraction?: string;
  tier?: number;
}

function isRecord(value: unknown): value is CoreRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOf<T extends CoreRecord = CoreRecord>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(isRecord) as T[];
  if (!isRecord(value)) return [];
  if (Array.isArray(value.array)) return value.array.filter(isRecord) as T[];
  if (Array.isArray(value.content)) return value.content.filter(isRecord) as T[];
  return [];
}

function tokenMap(file: unknown): Map<string, string> {
  const tokens = arrayOf<TokenRecord>(
    isRecord(file) && file.tokens ? file.tokens : file
  );
  return new Map(
    tokens.flatMap((token) =>
      token.sid ? [[token.sid, token.text || ""] as const] : []
    )
  );
}

function localizedName(mapTokens: Map<string, string>, artifactTokens: Map<string, string>, id: string, field: string): string {
  const ids = [id];
  if (id.startsWith("custom_")) ids.push(id.replace(/^custom_/, ""));
  for (const candidate of ids) {
    const key = `${candidate}_${field}`;
    const text = mapTokens.get(key) || artifactTokens.get(key);
    if (text) return text;
  }
  return "";
}

function humanize(value: string): string {
  return String(value || "")
    .replace(/_artifact$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizeContentList(value: string): string {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function localizeContentListFallback(value: string): string {
  const phrases: Array<[string, string]> = [
    ["template_pool", "пул шаблона"],
    ["guarded_resource_banks", "охраняемые ресурсные банки"],
    ["guarded_units_banks", "охраняемые банки существ"],
    ["resource_banks", "ресурсные банки"],
    ["random_hires", "случайные жилища существ"],
    ["enchanted_scroll_box", "зачарованный ларец со свитком"],
    ["mythic_scroll_box", "мифический ларец со свитком"],
    ["scroll_box", "ларец со свитком"],
    ["pandora_box", "Ящик Пандоры"],
    ["hero_stats_and_skills", "характеристики и навыки героя"],
    ["hero_stats", "характеристики героя"],
    ["hero_buffs", "усиления героя"],
    ["hero_buff", "усиление героя"],
    ["magic_school", "школа магии"],
    ["magic_tier", "магия по уровням"],
    ["control_spells", "заклинания контроля"],
    ["world_spells", "заклинания мира"],
    ["random_items", "случайные предметы"],
    ["rare_mines", "редкие шахты"],
    ["rare_resources", "редкие ресурсы"],
    ["special_mines", "особые шахты"],
    ["special_resources", "особые ресурсы"],
    ["basic_mines", "базовые шахты"],
    ["basic_resources", "базовые ресурсы"],
    ["basic_buildings", "базовые здания"],
    ["vision_buildings", "здания видения"],
    ["no_biome_restriction", "без ограничения биома"],
    ["only_biome_restriction", "только с ограничением биома"],
    ["by_biome", "по биому"],
    ["high_tier", "высокого уровня"],
    ["low_tier", "низкого уровня"],
    ["movepoints", "очки перемещения"]
  ];
  
  const words: Record<string, string> = {
    building: "здания",
    buildings: "здания",
    pickup: "подбираемые объекты",
    guarded: "охраняемые",
    resource: "ресурсный",
    resources: "ресурсы",
    banks: "банки",
    bank: "банк",
    units: "существа",
    tier: "уровень",
    random: "случайные",
    hires: "жилища существ",
    hero: "герой",
    stats: "характеристики",
    skills: "навыки",
    buff: "усиление",
    buffs: "усиления",
    magic: "магия",
    interact: "интерактивные объекты",
    common: "обычные",
    commons: "обычные",
    uncommon: "необычные",
    uncommons: "необычные",
    rare: "редкие",
    epic: "эпические",
    legendary: "легендарные",
    special: "особые",
    basic: "базовые",
    mine: "шахта",
    mines: "шахты",
    item: "предмет",
    items: "предметы",
    spell: "заклинание",
    spells: "заклинания",
    artifact: "артефакт",
    artifacts: "артефакты",
    scroll: "свиток",
    scrolls: "свитки",
    army: "армия",
    exp: "опыт",
    gold: "золото",
    prison: "тюрьма",
    storage: "хранилища",
    biome: "биом",
    restriction: "ограничение",
    zone: "зона",
    side: "сторона",
    start: "старт",
    center: "центр",
    treasure: "сокровища",
    supertreasure: "великие сокровища",
    all: "все",
    default: "стандартные",
    school: "школа",
    chosen: "избранный",
    one: "один",
    second: "второй",
    town: "город",
    gates: "врата",
    content: "содержимое",
    non: "без",
    no: "без",
    only: "только",
    by: "по",
    and: "и",
    equal: "равные",
    fix: "фиксированный",
    base: "базовый",
    pro: "профессиональный",
    high: "высокий",
    low: "низкий",
    list: "список",
    template: "шаблон",
    pool: "пул",
    spawn: "стартовая зона"
  };

  let localized = String(value || "");
  for (const [source, replacement] of phrases) {
    localized = localized.replaceAll(source, replacement);
  }
  
  localized = localized
    .split("_")
    .map((part) => words[part] || (/^\d+$/.test(part) ? part : humanizeContentList(part)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
    
  return localized ? localized[0].toUpperCase() + localized.slice(1) : "";
}

function contentListLabel(value: string, language: 'ru' | 'en'): string {
  const normalized = String(value || "")
    .replace(/^basic_content_list_/, "")
    .replace(/^content_list_/, "")
    .replace(/^visual_editor_/, "");
    
  if (language === "ru") {
    const patterns: Array<[RegExp, string]> = [
      [/^building_guarded_resource_banks_tier_(\d+)_no_biome_restriction$/, "Охраняемые ресурсные банки, уровень $1, без ограничения биома"],
      [/^building_guarded_resource_banks_tier_(\d+)$/, "Охраняемые ресурсные банки, уровень $1"],
      [/^building_resource_banks_tier_(\d+)$/, "Ресурсные банки, уровень $1"],
      [/^building_random_hires_tier_(\d+)$/, "Случайные жилища существ, уровень $1"],
      [/^building_hero_exp_tier_(\d+)$/, "Здания опыта героя, уровень $1"],
      [/^building_hero_stats_and_skills_tier_(\d+)$/, "Характеристики и навыки героя, уровень $1"],
      [/^building_magic_tier_(\d+)$/, "Магические здания, уровень $1"],
      [/^building_guarded_units_banks_only_biome_restriction$/, "Охраняемые банки существ по биому"],
      [/^building_guarded_units_banks_no_biome_restriction$/, "Охраняемые банки существ без ограничения биома"],
      [/^rare_mines_by_biome$/, "Редкие шахты по биому"],
      [/^basic_storage$/, "Базовые хранилища"],
      [/^(common|rare|epic|legendary)_artifacts_no_scrolls$/, "$1 артефакты без свитков"]
    ];
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(normalized)) {
        const label = normalized.replace(pattern, replacement);
        return label.replace(/^common /, "Обычные ")
          .replace(/^rare /, "Редкие ")
          .replace(/^epic /, "Эпические ")
          .replace(/^legendary /, "Легендарные ");
      }
    }
    return localizeContentListFallback(normalized);
  }
  return humanizeContentList(normalized);
}

function localizeContentEntry(
  entry: ContentEntryRecord,
  ruMap: Map<string, string>,
  enMap: Map<string, string>,
  ruArtifacts: Map<string, string>,
  enArtifacts: Map<string, string>
): CatalogContentEntry {
  const sid = entry.sid || "";
  const includeLists = Array.isArray(entry.includeLists)
    ? entry.includeLists.filter(
        (value): value is string => typeof value === "string"
      )
    : entry.includeLists
      ? [entry.includeLists]
      : [];
  const fallback = sid || includeLists.join(", ") || "Content entry";
  
  const labelByLang = sid
    ? {
      ru: localizedName(ruMap, ruArtifacts, sid, "name") || humanize(sid),
      en: localizedName(enMap, enArtifacts, sid, "name") || humanize(sid)
    }
    : {
      ru: `Вложенный список: ${includeLists.map((name: string) => contentListLabel(name, "ru")).join(", ")}`,
      en: `Nested list: ${includeLists.map((name: string) => contentListLabel(name, "en")).join(", ")}`
    };
    
  const descriptionByLang = sid
    ? {
      ru: localizedName(ruMap, ruArtifacts, sid, "description") || "",
      en: localizedName(enMap, enArtifacts, sid, "description") || ""
    }
    : {
      ru: "Выбирает элемент из другого списка генератора.",
      en: "Selects an entry from another generator list."
    };
    
  return {
    sid,
    includeLists,
    technicalId: fallback,
    labelByLang,
    descriptionByLang,
    weight: entry.weight !== null && entry.weight !== undefined && Number.isFinite(Number(entry.weight))
      ? Number(entry.weight)
      : null,
    biome: entry.biome || "",
    variant: entry.variant !== null && entry.variant !== undefined && Number.isFinite(Number(entry.variant))
      ? Number(entry.variant)
      : null
  };
}

function defaultGuarded(
  object: MapObjectRecord & { id: string },
  item?: ItemRecord
): boolean {
  if (object.tag === "Resource") return false;
  if (object.id.startsWith("mine_") || object.id.startsWith("storage_")) return false;
  if (object.tag === "Artifact" || item?.rarity === "epic" || item?.rarity === "legendary") return true;
  return false;
}

function buildFactions(
  cityFiles: unknown[],
  ruCities: Map<string, string>,
  enCities: Map<string, string>,
  language: 'ru' | 'en'
): Faction[] {
  const byId = new Map<string, Faction>();
  for (const file of cityFiles) {
    for (const city of arrayOf<CityRecord>(file)) {
      const id =
        city.fraction ||
        city.faction ||
        String(city.id || "").replace(/_city$/i, "");
      if (!id || byId.has(id)) continue;
      const labelByLang = {
        ru: ruCities.get(`${id}_name`) || humanize(id),
        en: enCities.get(`${id}_name`) || humanize(id)
      };
      byId.set(id, {
        id,
        label: labelByLang[language] || labelByLang.ru,
        labelByLang
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const aLabel = a.labelByLang?.[language] || a.label || a.id;
    const bLabel = b.labelByLang?.[language] || b.label || b.id;
    return aLabel.localeCompare(bLabel);
  });
}

function isTemplateObject(
  object: MapObjectRecord
): object is MapObjectRecord & { id: string } {
  if (!object.id) return false;
  if (/campaign/i.test(object.id)) return false;
  if (/^block(_|$)/i.test(object.id)) return false;
  return ["Interact", "Resource", "Artifact"].includes(object.tag || "");
}

function buildArtifactLists(
  items: ItemRecord[]
): Record<string, RmgContentListEntry[]> {
  const groups: Record<string, Array<RmgContentListEntry & { sid: string }>> = {
    common: [],
    rare: [],
    epic: [],
    legendary: []
  };
  for (const item of items) {
    if (!item?.id || !item.rarity) continue;
    if (!item.id.endsWith("_artifact")) continue;
    if (item.id.toLowerCase().includes("scroll")) continue;
    if (!groups[item.rarity]) continue;
    groups[item.rarity].push({ sid: item.id, weight: 100 });
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.sid.localeCompare(b.sid));
  }
  return {
    visual_editor_common_artifacts_no_scrolls: groups.common,
    visual_editor_rare_artifacts_no_scrolls: groups.rare,
    visual_editor_epic_artifacts_no_scrolls: groups.epic,
    visual_editor_legendary_artifacts_no_scrolls: groups.legendary
  };
}

export async function loadCoreCatalogFromZipFile(file: File, language: 'ru' | 'en' = 'ru'): Promise<CoreCatalog> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // Unzip using fflate
  const unzipped = unzipSync(bytes);
  
  const wanted: {
    mapObjects: unknown[];
    contentLists: unknown[];
    contentPools: unknown[];
    itemFiles: unknown[];
    cityFiles: unknown[];
    ruMapObjects: unknown;
    enMapObjects: unknown;
    ruArtifacts: unknown;
    enArtifacts: unknown;
    ruCities: unknown;
    enCities: unknown;
    generatorConfig: unknown;
    heroFiles: unknown[];
    magicFiles: Array<{ path: string; data: unknown }>;
    unitFiles: unknown[];
    ruHeroes: unknown;
    enHeroes: unknown;
    ruMagic: unknown;
    enMagic: unknown;
    ruUnits: unknown;
    enUnits: unknown;
    statsLimits: unknown;
  } = {
    mapObjects: [],
    contentLists: [],
    contentPools: [],
    itemFiles: [],
    cityFiles: [],
    ruMapObjects: null,
    enMapObjects: null,
    ruArtifacts: null,
    enArtifacts: null,
    ruCities: null,
    enCities: null,
    generatorConfig: null,
    heroFiles: [],
    magicFiles: [],
    unitFiles: [],
    ruHeroes: null,
    enHeroes: null,
    ruMagic: null,
    enMagic: null,
    ruUnits: null,
    enUnits: null,
    statsLimits: null
  };

  const decodeJson = (data: Uint8Array): unknown => {
    const text = textDecoder.decode(data).replace(/^\uFEFF/, "");
    return JSON.parse(text);
  };

  const normalizePath = (path: string): string => {
    return path.replace(/\\/g, "/").replace(/^Core\//i, "");
  };

  for (const [rawPath, data] of Object.entries(unzipped)) {
    const path = normalizePath(rawPath);
    if (path.match(/^DB\/map\/objects\/.*\.json$/i)) {
      wanted.mapObjects.push(decodeJson(data));
    } else if (path.match(/^generator\/content_lists\/.*\.json$/i)) {
      wanted.contentLists.push(decodeJson(data));
    } else if (path.match(/^generator\/content_pools\/.*\.json$/i)) {
      wanted.contentPools.push(decodeJson(data));
    } else if (path.match(/^DB\/items\/items\/.*\.json$/i)) {
      wanted.itemFiles.push(decodeJson(data));
    } else if (path.match(/^DB\/objects_logic\/cities\/.*_city\.json$/i)) {
      wanted.cityFiles.push(decodeJson(data));
    } else if (path.toLowerCase() === "lang/russian/texts/mapobjects.json") {
      wanted.ruMapObjects = decodeJson(data);
    } else if (path.toLowerCase() === "lang/english/texts/mapobjects.json") {
      wanted.enMapObjects = decodeJson(data);
    } else if (path.toLowerCase() === "lang/russian/texts/artifacts.json") {
      wanted.ruArtifacts = decodeJson(data);
    } else if (path.toLowerCase() === "lang/english/texts/artifacts.json") {
      wanted.enArtifacts = decodeJson(data);
    } else if (path.toLowerCase() === "lang/russian/texts/cities.json") {
      wanted.ruCities = decodeJson(data);
    } else if (path.toLowerCase() === "lang/english/texts/cities.json") {
      wanted.enCities = decodeJson(data);
    } else if (path.toLowerCase() === "generator/generator_config.json") {
      wanted.generatorConfig = decodeJson(data);
    } else if (
      path.match(/^DB\/heroes\/.*\.json$/i) &&
      !path.match(/^DB\/heroes\/(campaign|campaign_tutorial|custom_maps|demo)\//i)
    ) {
      wanted.heroFiles.push(decodeJson(data));
    } else if (path.match(/^DB\/magics\/(battle|world)_.*\.json$/i)) {
      wanted.magicFiles.push({ path, data: decodeJson(data) });
    } else if (path.toLowerCase() === "lang/russian/texts/heroinfo.json") {
      wanted.ruHeroes = decodeJson(data);
    } else if (path.toLowerCase() === "lang/english/texts/heroinfo.json") {
      wanted.enHeroes = decodeJson(data);
    } else if (path.toLowerCase() === "lang/russian/texts/magic.json") {
      wanted.ruMagic = decodeJson(data);
    } else if (path.toLowerCase() === "lang/english/texts/magic.json") {
      wanted.enMagic = decodeJson(data);
    } else if (path.match(/^DB\/units\/units_logics\/.*\.json$/i)) {
      wanted.unitFiles.push(decodeJson(data));
    } else if (path.toLowerCase() === "lang/russian/texts/unitsability.json") {
      wanted.ruUnits = decodeJson(data);
    } else if (path.toLowerCase() === "lang/english/texts/unitsability.json") {
      wanted.enUnits = decodeJson(data);
    } else if (path.toLowerCase() === "db/hero_stats_limits.json") {
      wanted.statsLimits = decodeJson(data);
    }
  }

  const mapObjects = wanted.mapObjects.flatMap((file) =>
    arrayOf<MapObjectRecord>(file)
  );
  const contentLists = wanted.contentLists.flatMap((file) =>
    arrayOf<ContentListRecord>(file)
  );
  // Names of the game's built-in content pools — referenced by templates but
  // defined in Core, not in the template JSON, so the validator needs them.
  const builtInPoolNames = [...new Set(
    wanted.contentPools.flatMap((file) =>
      arrayOf<ContentListRecord>(file).flatMap((pool) =>
        typeof pool.name === "string" && pool.name ? [pool.name] : []
      )
    )
  )].sort();
  const items = wanted.itemFiles.flatMap((file) =>
    arrayOf<ItemRecord>(file)
  );
  
  const ruMap = tokenMap(wanted.ruMapObjects);
  const enMap = tokenMap(wanted.enMapObjects);
  const ruArtifacts = tokenMap(wanted.ruArtifacts);
  const enArtifacts = tokenMap(wanted.enArtifacts);
  const ruCities = tokenMap(wanted.ruCities);
  const enCities = tokenMap(wanted.enCities);
  
  const itemById = new Map(
    items.flatMap((item) => (item.id ? [[item.id, item] as const] : []))
  );
  const byId = new Map<string, CatalogItem>();

  for (const object of mapObjects) {
    if (!isTemplateObject(object)) continue;
    const item = itemById.get(object.id);
    const labelByLang = {
      ru: localizedName(ruMap, ruArtifacts, object.id, "name") || humanize(object.id),
      en: localizedName(enMap, enArtifacts, object.id, "name") || humanize(object.id)
    };
    const descriptionByLang = {
      ru: localizedName(ruMap, ruArtifacts, object.id, "description") || "",
      en: localizedName(enMap, enArtifacts, object.id, "description") || ""
    };
    
    byId.set(object.id, {
      id: object.id,
      sid: object.id,
      kind: "sid",
      label: labelByLang[language] || labelByLang.ru,
      description: descriptionByLang[language] || descriptionByLang.ru,
      labelByLang,
      descriptionByLang,
      guarded: defaultGuarded(object, item),
      isMine: object.id.startsWith("mine_"),
      tag: object.tag || "",
      sizeX: object.sizeX,
      sizeZ: object.sizeZ,
      rarity: item?.rarity || "",
      category: object.tag || "Object"
    });
  }

  // Parse virtual metaObjects (random items and random dwellings) from generator_config.json
  const generatorConfig = isRecord(wanted.generatorConfig)
    ? wanted.generatorConfig
    : null;
  if (generatorConfig) {
    arrayOf<MetaObjectRecord>(generatorConfig.metaObjects).forEach((meta) => {
      if (!meta.sid) return;

      let labelRu: string;
      let labelEn: string;
      let descRu: string;
      let descEn: string;
      let category = "Interact";
      let tag = "Interact";
      let rarity = "";

      if (meta.type === "RandomItem") {
        category = "Artifact";
        tag = "Artifact";
        const tier = String(meta.args?.[0] || "");
        rarity = tier.toLowerCase();

        if (rarity === "common") {
          labelRu = "Случайный обычный артефакт";
          labelEn = "Random Common Artifact";
        } else if (rarity === "rare") {
          labelRu = "Случайный редкий артефакт";
          labelEn = "Random Rare Artifact";
        } else if (rarity === "epic") {
          labelRu = "Случайный эпический артефакт";
          labelEn = "Random Epic Artifact";
        } else if (rarity === "legendary") {
          labelRu = "Случайный легендарный артефакт";
          labelEn = "Random Legendary Artifact";
        } else {
          labelRu = `Случайный артефакт (${tier})`;
          labelEn = `Random Artifact (${tier})`;
        }
        descRu = `Случайный артефакт типа ${tier}. Ценность: ${meta.value}.`;
        descEn = `Random artifact of type ${tier}. Value: ${meta.value}.`;
      } else if (meta.type === "RandomHire") {
        category = "Interact";
        tag = "Interact";
        const tier = String(meta.args?.[0] || "1");
        labelRu = `Случайное жилище существ (уровень ${tier})`;
        labelEn = `Random Creature Dwelling (tier ${tier})`;
        descRu = `Случайное жилище существ уровня ${tier}. Ценность: ${meta.value}, Охрана: ${meta.guardValue || 0}.`;
        descEn = `Random creature dwelling of tier ${tier}. Value: ${meta.value}, Guard: ${meta.guardValue || 0}.`;
      } else {
        labelRu = humanize(meta.sid);
        labelEn = humanize(meta.sid);
        descRu = `Ценность: ${meta.value}`;
        descEn = `Value: ${meta.value}`;
      }

      const labelByLang = { ru: labelRu, en: labelEn };
      const descriptionByLang = { ru: descRu, en: descEn };

      byId.set(meta.sid, {
        id: meta.sid,
        sid: meta.sid,
        kind: "sid",
        label: language === "ru" ? labelRu : labelEn,
        description: language === "ru" ? descRu : descEn,
        labelByLang,
        descriptionByLang,
        guarded: meta.type === "RandomItem",
        isMine: false,
        tag,
        sizeX: 1,
        sizeZ: 1,
        rarity,
        category
      });
    });
  }

  const listEntries: CatalogItem[] = [];
  for (const list of contentLists) {
    if (!list?.name) continue;
    const contentEntries = arrayOf<ContentEntryRecord>(list.content).map((entry) => localizeContentEntry(
      entry,
      ruMap,
      enMap,
      ruArtifacts,
      enArtifacts
    ));
    const count = contentEntries.length;
    const labelByLang = {
      ru: contentListLabel(list.name, "ru"),
      en: contentListLabel(list.name, "en")
    };
    const descriptionByLang = {
      ru: `Количество вариантов: ${count}. Генератор выбирает один с учетом весов и ограничений.`,
      en: `Contains ${count} options. The generator selects one according to weights and restrictions.`
    };
    
    listEntries.push({
      id: `list:${list.name}`,
      kind: "list",
      includeList: list.name,
      label: labelByLang[language] || labelByLang.ru,
      description: descriptionByLang[language] || descriptionByLang.ru,
      labelByLang,
      descriptionByLang,
      guarded: list.name.includes("guarded") || list.name.includes("resource_banks"),
      isMine: list.name.includes("mine"),
      tag: "ContentList",
      category: "Content list",
      count,
      contentEntries
    });
  }

  const artifactLists = buildArtifactLists(items);
  const artifactListEntries: CatalogItem[] = Object.entries(artifactLists).map(([name, content]) => {
    const labelByLang = {
      ru: contentListLabel(name, "ru"),
      en: contentListLabel(name, "en")
    };
    const contentEntries = content.map((entry) => localizeContentEntry(
      entry,
      ruMap,
      enMap,
      ruArtifacts,
      enArtifacts
    ));
    
    return {
      id: `list:${name}`,
      kind: "list",
      includeList: name,
      label: labelByLang[language] || labelByLang.ru,
      description: language === "ru"
        ? `Сгенерированный список артефактов без свитков, элементов: ${content.length}.`
        : `Generated no-scroll artifact list, entries: ${content.length}.`,
      labelByLang,
      descriptionByLang: {
        ru: `Сгенерированный список артефактов без свитков, элементов: ${content.length}.`,
        en: `Generated no-scroll artifact list, entries: ${content.length}.`
      },
      guarded: true,
      isMine: false,
      tag: "GeneratedList",
      category: "Generated artifact list",
      count: content.length,
      contentEntries
    };
  });

  const factions = buildFactions(wanted.cityFiles, ruCities, enCities, language);

  // Playable heroes (campaign/tutorial/demo files are filtered out at scan
  // time). Names live in Lang/<lang>/texts/heroInfo.json under the hero id.
  const ruHeroes = tokenMap(wanted.ruHeroes);
  const enHeroes = tokenMap(wanted.enHeroes);
  const heroes: CoreHero[] = [];
  const seenHeroes = new Set<string>();
  for (const file of wanted.heroFiles) {
    for (const hero of arrayOf<HeroRecord>(file)) {
      if (!hero.id || seenHeroes.has(hero.id)) continue;
      seenHeroes.add(hero.id);
      heroes.push({
        id: hero.id,
        faction: hero.fraction || "",
        classType: hero.classType || "",
        labelByLang: {
          ru: ruHeroes.get(hero.id) || humanize(hero.id),
          en: enHeroes.get(hero.id) || humanize(hero.id)
        }
      });
    }
  }
  heroes.sort((a, b) => (a.labelByLang[language] || a.id).localeCompare(b.labelByLang[language] || b.id));

  // Spells: DB/magics/<battle|world>_<school>_magics[_special].json. The
  // record's `name` field is the localization token in texts/magic.json.
  const ruMagic = tokenMap(wanted.ruMagic);
  const enMagic = tokenMap(wanted.enMagic);
  const spells: CoreSpell[] = [];
  const seenSpells = new Set<string>();
  for (const { path, data } of wanted.magicFiles) {
    const fileName = path.split("/").pop() || "";
    const match = fileName.match(/^(battle|world)_([a-z]+)_magics/i);
    const kind = (match?.[1] === "world" ? "world" : "battle") as CoreSpell["kind"];
    const school = match?.[2] || "other";
    for (const magic of arrayOf<MagicRecord>(data)) {
      if (!magic.id || seenSpells.has(magic.id)) continue;
      seenSpells.add(magic.id);
      const nameToken = magic.name || `${magic.id}_name`;
      const ru = ruMagic.get(nameToken);
      const en = enMagic.get(nameToken);
      // Entries without any localized name are internal mechanics (astral
      // summon bonuses etc.), not pickable player-facing spells.
      if (!ru && !en) continue;
      spells.push({
        id: magic.id,
        school,
        kind,
        labelByLang: {
          ru: ru || en || humanize(magic.id),
          en: en || ru || humanize(magic.id)
        }
      });
    }
  }
  spells.sort((a, b) => (a.labelByLang[language] || a.id).localeCompare(b.labelByLang[language] || b.id));

  // Creatures (DB/units/units_logics); names live in texts/unitsAbility.json
  // under "<id>_name".
  const ruUnits = tokenMap(wanted.ruUnits);
  const enUnits = tokenMap(wanted.enUnits);
  const units: CoreUnit[] = [];
  const seenUnits = new Set<string>();
  for (const file of wanted.unitFiles) {
    for (const unit of arrayOf<UnitRecord>(file)) {
      if (!unit.id || seenUnits.has(unit.id)) continue;
      if (/campaign/i.test(unit.id)) continue;
      const ru = ruUnits.get(`${unit.id}_name`);
      const en = enUnits.get(`${unit.id}_name`);
      // Units without a localized name are internal/test entries
      if (!ru && !en) continue;
      seenUnits.add(unit.id);
      units.push({
        id: unit.id,
        faction: unit.fraction || "",
        tier: Number(unit.tier) || 0,
        labelByLang: {
          ru: ru || en || humanize(unit.id),
          en: en || ru || humanize(unit.id)
        }
      });
    }
  }
  units.sort((a, b) => (a.labelByLang[language] || a.id).localeCompare(b.labelByLang[language] || b.id));

  // Engine hero stat names for the add_bonus_hero_stat manual mode
  const statsLimitsList = isRecord(wanted.statsLimits) && Array.isArray(wanted.statsLimits.statsLimits)
    ? wanted.statsLimits.statsLimits
    : [];
  const heroStatNames = [...new Set(
    statsLimitsList.flatMap((entry: unknown) =>
      isRecord(entry) && typeof entry.statName === "string" ? [entry.statName] : []
    )
  )];

  return {
    version: CORE_CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    objects: [...byId.values(), ...listEntries, ...artifactListEntries].sort((a, b) => {
      const aLabel = a.labelByLang?.[language] || a.label || a.id;
      const bLabel = b.labelByLang?.[language] || b.label || b.id;
      return aLabel.localeCompare(bLabel);
    }),
    artifactLists,
    factions,
    heroes,
    spells,
    units,
    heroStatNames,
    builtInPoolNames,
    stats: {
      mapObjects: mapObjects.length,
      usableObjects: byId.size,
      contentLists: listEntries.length,
      items: items.length,
      artifactLists: Object.keys(artifactLists).length,
      factions: factions.length,
      heroes: heroes.length,
      spells: spells.length,
      units: units.length
    }
  };
}
