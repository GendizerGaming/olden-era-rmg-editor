import type { MapSettings, Zone, Edge, CatalogItem, ZoneObject, Faction, ZoneMainObject, CustomObjectList, CustomObjectListEntry, ConnectionType, ContentLimitEntry, ContentLimitPreset, ContentPoolBan, ContentPoolGroup, ContentPoolPreset, TerrainProfile } from '../types/editor';
import { auxBiomeRule } from './jsonGenerator';
import { CONNECTION_TYPES } from '../types/editor';
import type {
  JsonObject,
  RmgBorder,
  RmgConnectionSource,
  RmgPlacementRule,
  RmgMainObject,
  RmgOrientation,
  RmgTemplateSource,
  RmgVariantSource,
  RmgZone
} from '../types/rmg';
import { uniqueKey } from '../store/useEditorStore';
import { encodeDistance, ruleBounds } from '../store/constants';
import { primaryVictoryMode } from '../store/winConditions';

function pickUnknownFields(
  source: JsonObject,
  knownKeys: readonly string[]
): JsonObject {
  const result: JsonObject = {};
  for (const key of Object.keys(source)) {
    if (!knownKeys.includes(key)) {
      result[key] = source[key];
    }
  }
  return result;
}

// Helper to find closest distance preset based on min/max limits
// Group duplicate objects to keep the UI clean
function groupZoneObjects(objects: ZoneObject[]): ZoneObject[] {
  const grouped: ZoneObject[] = [];
  for (const obj of objects) {
    const existing = grouped.find(g =>
      g.id === obj.id &&
      g.name === obj.name &&
      g.guarded === obj.guarded &&
      g.soloEncounter === obj.soloEncounter &&
      g.variant === obj.variant &&
      g.roadDistance === obj.roadDistance &&
      g.townDistance === obj.townDistance &&
      g.isMine === obj.isMine &&
      // Don't merge entries whose exact placement rules differ — the distance
      // preset can be the same while the original min/max/args differ.
      JSON.stringify(g.rawRules) === JSON.stringify(obj.rawRules) &&
      // Multi-list objects share a first list (= identity) but differ overall.
      JSON.stringify(g.rawIncludeLists) === JSON.stringify(obj.rawIncludeLists) &&
      JSON.stringify(g.nestedContent) === JSON.stringify(obj.nestedContent) &&
      // Player-owned mandatory objects must stay separate per owner.
      (g.owner ?? null) === (obj.owner ?? null) &&
      Boolean(g.designatedEncounter) === Boolean(obj.designatedEncounter)
    );
    if (existing) {
      existing.count += 1;
    } else {
      grouped.push({ ...obj });
    }
  }
  return grouped;
}

// Force-Directed Layout Algorithm (Spring Physics)
// Force-Directed Layout Algorithm (Spring Physics)
function arrangeCoordinates(zones: Zone[], edges: Edge[]): void {
  const N = zones.length;
  if (N === 0) return;

  if (N === 1) {
    zones[0].x = 0.5;
    zones[0].y = 0.5;
    return;
  }

  // 1. Calculate connection degrees of zones
  const degrees: Record<string, number> = {};
  zones.forEach((z) => (degrees[z.id] = 0));
  edges.forEach((e) => {
    if (degrees[e.from] !== undefined) degrees[e.from]++;
    if (degrees[e.to] !== undefined) degrees[e.to]++;
  });

  // Sort zones by degree descending to determine layout initialization hierarchy
  const sortedZones = [...zones].sort((a, b) => degrees[b.id] - degrees[a.id]);

  // 2. Initialize positions: hub node in center, other nodes clustered in a small circle around it
  sortedZones.forEach((z, i) => {
    const orig = zones.find((o) => o.id === z.id);
    if (orig) {
      if (i === 0) {
        orig.x = 0.5;
        orig.y = 0.5;
      } else {
        const angle = ((i - 1) / (N - 1)) * 2 * Math.PI;
        const r = 0.1;
        orig.x = 0.5 + r * Math.cos(angle);
        orig.y = 0.5 + r * Math.sin(angle);
      }
    }
  });

  // 3. Force-directed layout constants
  const kRep = 0.002;  // Coulomb repulsion constant (pushed higher to expand graph)
  const kAtt = 0.03;   // Hooke attraction spring constant
  const kGrav = 0.002; // Small gravity pulling to center
  const Tstart = 0.1;  // Max displacement step size (cooling down over iterations)
  const iterations = 150;

  // Adaptive rest length based on number of nodes to optimize screen coverage
  let defaultRestLength = 0.35;
  if (N <= 4) {
    defaultRestLength = 0.38;
  } else if (N > 8) {
    defaultRestLength = 0.28;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const temp = Tstart * (1 - iter / iterations);

    const fx = new Array(N).fill(0);
    const fy = new Array(N).fill(0);

    // 3.1. Repulsion between all pairs of zones (Coulomb's Law)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const zA = zones[i];
        const zB = zones[j];
        let dx = zA.x - zB.x;
        let dy = zA.y - zB.y;

        if (dx === 0 && dy === 0) {
          dx = Math.random() * 0.01 - 0.005;
          dy = Math.random() * 0.01 - 0.005;
        }

        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const force = kRep / (d * d);

        fx[i] += force * (dx / d);
        fy[i] += force * (dy / d);
      }
    }

    // 3.2. Attraction along connections (Hooke's Law)
    edges.forEach((edge) => {
      const idxFrom = zones.findIndex((z) => z.id === edge.from);
      const idxTo = zones.findIndex((z) => z.id === edge.to);
      if (idxFrom === -1 || idxTo === -1) return;

      const zA = zones[idxFrom];
      const zB = zones[idxTo];

      const dx = zB.x - zA.x;
      const dy = zB.y - zA.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;

      // Desired distance for standard vs proximity connections
      let restLength = defaultRestLength;
      if (edge.connectionType === "Proximity") {
        // Skip attraction for repellent proximity links (length >= 2.0)
        if (edge.length && edge.length >= 2.0) {
          return;
        }
        restLength = edge.length ?? 0.1;
      }

      const force = kAtt * (d - restLength);

      fx[idxFrom] += force * (dx / d);
      fy[idxFrom] += force * (dy / d);

      fx[idxTo] -= force * (dx / d);
      fy[idxTo] -= force * (dy / d);
    });

    // 3.3. Gravity pulling towards center and apply net forces
    for (let i = 0; i < N; i++) {
      const z = zones[i];
      const dx = 0.5 - z.x;
      const dy = 0.5 - z.y;
      
      fx[i] += dx * kGrav;
      fy[i] += dy * kGrav;

      z.x += fx[i] * temp;
      z.y += fy[i] * temp;

      // Clamp coordinates within [0.05, 0.95] boundary
      z.x = Math.max(0.05, Math.min(0.95, z.x));
      z.y = Math.max(0.05, Math.min(0.95, z.y));
    }
  }

  // 4. Translate layout to place center of mass exactly at (0.5, 0.5)
  const sumX = zones.reduce((sum, z) => sum + z.x, 0);
  const sumY = zones.reduce((sum, z) => sum + z.y, 0);
  const dx = 0.5 - sumX / N;
  const dy = 0.5 - sumY / N;
  zones.forEach((z) => {
    z.x += dx;
    z.y += dy;
    // Keep within bounds
    z.x = Math.max(0.05, Math.min(0.95, z.x));
    z.y = Math.max(0.05, Math.min(0.95, z.y));
  });
}

export function importTemplateFromJson(
  input: unknown,
  objectLibrary: CatalogItem[],
  factions: Faction[]
): {
  settings: Partial<MapSettings>;
  zones: Zone[];
  edges: Edge[];
  warnings: string[];
  customObjectLists?: Record<string, CustomObjectList>;
  variants: Array<{
    id: string;
    zones: Zone[];
    edges: Edge[];
    fixedOrientation: boolean;
    orientationAnchor: string;
    preserveLayout: boolean;
    originalOrientation?: RmgOrientation;
    borderWaterWidth: number;
    borderCornerRadius: number;
    originalBorder?: RmgBorder;
  }>;
  activeVariantId: string;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error("Неверный формат шаблона: передан пустой или некорректный объект");
  }

  const template = input as RmgTemplateSource;
  if (!Array.isArray(template.variants)) {
    throw new Error("Template must contain a variants array.");
  }

  const variant: RmgVariantSource | undefined = template.variants?.[0];
  if (!variant) {
    throw new Error("В шаблоне не найдены варианты генерации (variants отсутствует или пуст)");
  }

  const warnings: string[] = [];

  // Parse custom object lists (contentLists)
  const customObjectLists: Record<string, CustomObjectList> = {};
  if (Array.isArray(template.contentLists)) {
    template.contentLists.forEach((list) => {
      if (!list || !list.name) return;
      const entries: CustomObjectListEntry[] = [];
      if (Array.isArray(list.content)) {
        list.content.forEach((entry) => {
          const includeLists = entry.includeLists ?? [];
          const kind = includeLists.length > 0 ? "list" as const : "sid" as const;
          const value = kind === "list" ? includeLists[0] : entry.sid;
          if (value) {
            entries.push({
              key: uniqueKey(),
              kind,
              value,
              weight: entry.weight !== undefined ? Number(entry.weight) : 100
            });
          }
        });
      }
      customObjectLists[list.name] = {
        id: list.name,
        label: list.name,
        entries
      };
    });
  }

  // 1. Map Settings
  const settings: Partial<MapSettings> = {
    name: template.name || "Imported RMG Template",
    description: template.description || "",
    sizeX: Number(template.sizeX) || 128,
    sizeZ: Number(template.sizeZ) || 128,
    victoryMode: "classic",
    displayWinCondition: typeof template.displayWinCondition === 'string' ? template.displayWinCondition : "win_condition_1",
    classicEnabled: true,
    lostStartCityEnabled: false,
    lostStartCityDay: 0,
    cityHoldEnabled: false,
    cityHoldDays: 6,
    singleHero: false,
    desertionEnabled: false,
    desertionDay: 3,
    desertionValue: 3000,
    heroLightingEnabled: false,
    heroLightingDay: 1,
    heroLimitMode: "fixed",
    heroMin: 1,
    heroMax: 12,
    heroIncrement: 1,
    fixedOrientation: false,
    preserveLayout: false,
    orientationAnchor: "",
    singleHeroMode: template.gameMode === "SingleHero",
    heroHireBan: false,
    encounterHoles: false,
    factionLawsExpModifier: 1,
    astrologyExpModifier: 1,
    borderWaterWidth: 0,
    borderCornerRadius: 0,
  };

  if (template.gameRules) {
    const rules = template.gameRules;
    settings.heroMin = Number(rules.heroCountMin) || 1;
    settings.heroMax = Number(rules.heroCountMax) || 12;
    settings.heroIncrement = Number(rules.heroCountIncrement) || 0;
    settings.heroLimitMode = settings.heroIncrement === 0 ? "fixed" : "perCastle";
    settings.heroHireBan = Boolean(rules.heroHireBan);
    settings.encounterHoles = Boolean(rules.encounterHoles);
    // Absent modifiers mean the game default of 1; the export always emits
    // the value, so importing 1 for absence keeps the template equivalent.
    const lawsExp = Number(rules.factionLawsExpModifier);
    const astroExp = Number(rules.astrologyExpModifier);
    settings.factionLawsExpModifier = Number.isFinite(lawsExp) ? lawsExp : 1;
    settings.astrologyExpModifier = Number.isFinite(astroExp) ? astroExp : 1;

    // Starting bonuses: official templates use an array, but the game also
    // accepts a single object (Wastelands ships one) — normalize to an array.
    const rawBonuses = rules.bonuses;
    const bonusEntries = Array.isArray(rawBonuses) ? rawBonuses : rawBonuses ? [rawBonuses] : [];
    settings.startingBonuses = bonusEntries.flatMap((bonus) => {
      if (!bonus || typeof bonus !== 'object' || typeof bonus.sid !== 'string' || !bonus.sid) return [];
      return [{
        sid: bonus.sid,
        receiverSide: bonus.receiverSide !== undefined ? Number(bonus.receiverSide) : -1,
        receiverFilter: typeof bonus.receiverFilter === 'string' ? bonus.receiverFilter : '',
        parameters: Array.isArray(bonus.parameters) ? bonus.parameters.map(String) : []
      }];
    });

    // Preserve unrecognized gameRules fields
    const knownRulesKeys = ['heroCountMin', 'heroCountMax', 'heroCountIncrement', 'heroHireBan', 'encounterHoles', 'winConditions', 'factionLawsExpModifier', 'astrologyExpModifier', 'globalBans', 'bonuses'];
    const originalGameRules = pickUnknownFields(rules, knownRulesKeys);
    settings.originalGameRules = originalGameRules;
    settings.originalWinConditions = rules.winConditions;

    if (rules.winConditions) {
      const wc = rules.winConditions;
      // Read each win-condition flag independently — they are the source of
      // truth (the engine reads the flags; displayWinCondition is just the
      // label). victoryMode is derived from these by the normalizer.
      settings.classicEnabled = wc.classic !== false;
      settings.lostStartCityEnabled = Boolean(wc.lostStartCity);
      settings.lostStartCityDay = Number(wc.lostStartCityDay) || 0;
      settings.cityHoldEnabled = Boolean(wc.cityHold);
      settings.cityHoldDays = Number(wc.cityHoldDays) || 6;
      settings.singleHero = Boolean(wc.lostStartHero);
      // classic/desertion/heroLighting default to TRUE in the engine
      // (WinConditions.cs) — absent means on, so only an explicit false disables.
      settings.desertionEnabled = wc.desertion !== false;
      settings.desertionDay = Number(wc.desertionDay) || 3;
      settings.desertionValue = Number(wc.desertionValue) || 3000;
      settings.heroLightingEnabled = wc.heroLighting !== false;
      settings.heroLightingDay = Number(wc.heroLightingDay) || 1;

      // Gladiator Arena
      settings.gladiatorArenaEnabled = Boolean(wc.gladiatorArena);
      settings.gladiatorArenaDaysDelayStart = Number(wc.gladiatorArenaDaysDelayStart) || 30;
      settings.gladiatorArenaCountDay = Number(wc.gladiatorArenaCountDay) || 3;
      settings.gladiatorArenaRegistrationStartFight = wc.gladiatorArenaRegistrationStartFight !== false;
      settings.gladiatorArenaChampionRule = wc.championSelectRule || 'StartHero';

      // Tournament
      settings.tournamentEnabled = Boolean(wc.tournament);
      settings.tournamentPointsToWin = Number(wc.tournamentPointsToWin) || 2;
      settings.tournamentSaveArmy = wc.tournamentSaveArmy !== false;
      settings.tournamentDays = Array.isArray(wc.tournamentDays) ? wc.tournamentDays.map(Number) : [3, 3, 3];
      settings.tournamentAnnounceDays = Array.isArray(wc.tournamentAnnounceDays) ? wc.tournamentAnnounceDays.map(Number) : [7, 14, 21];

      // The simple-mode selector is derived from the flags above.
      settings.victoryMode = primaryVictoryMode({
        tournamentEnabled: Boolean(settings.tournamentEnabled),
        gladiatorArenaEnabled: Boolean(settings.gladiatorArenaEnabled),
        cityHoldEnabled: Boolean(settings.cityHoldEnabled),
        lostStartCityEnabled: Boolean(settings.lostStartCityEnabled),
        lostStartCityDay: Number(settings.lostStartCityDay) || 0
      });
    }
  }

  // Terrain profiles (zoneLayouts): editable model with passthrough for the
  // fields the editor does not understand yet. Unused profiles are kept too —
  // official templates ship a few.
  const knownLayoutKeys = [
    'name', 'obstaclesFill', 'obstaclesFillVoid', 'lakesFill', 'minLakeArea',
    'elevationClusterScale', 'elevationModes', 'roadClusterArea'
  ];
  settings.terrainProfiles = (template.zoneLayouts ?? []).flatMap((layout) => {
    if (!layout || typeof layout.name !== 'string' || !layout.name) return [];
    const layoutRaw = pickUnknownFields(layout, knownLayoutKeys);
    const profile: TerrainProfile = { name: layout.name };
    if (layout.obstaclesFill !== undefined) profile.obstaclesFill = Number(layout.obstaclesFill);
    if (layout.obstaclesFillVoid !== undefined) profile.obstaclesFillVoid = Number(layout.obstaclesFillVoid);
    if (layout.lakesFill !== undefined) profile.lakesFill = Number(layout.lakesFill);
    if (layout.minLakeArea !== undefined) profile.minLakeArea = Number(layout.minLakeArea);
    if (layout.elevationClusterScale !== undefined) profile.elevationClusterScale = Number(layout.elevationClusterScale);
    if (Array.isArray(layout.elevationModes)) {
      profile.elevationModes = layout.elevationModes.map((mode) => ({
        weight: Number(mode.weight) || 0,
        minElevatedFraction: Number(mode.minElevatedFraction) || 0,
        maxElevatedFraction: Number(mode.maxElevatedFraction) || 0
      }));
    }
    if (layout.roadClusterArea !== undefined) profile.roadClusterArea = Number(layout.roadClusterArea);
    if (Object.keys(layoutRaw).length) profile.rawFields = layoutRaw;
    return [profile];
  });

  // Content-limit presets: fully editable. Entries become editable rows only
  // when they rebuild verbatim ({sid[,variant],maxCount} or
  // {includeLists,maxCount}); anything else rides in `raw` and re-emits as-is.
  const knownLimitPresetKeys = ['name', 'playerMin', 'playerMax', 'limits'];
  settings.contentLimitPresets = (Array.isArray(template.contentCountLimits) ? template.contentCountLimits : []).flatMap((preset) => {
    if (!preset || typeof preset.name !== 'string' || !preset.name) return [];
    const presetRaw = pickUnknownFields(preset, knownLimitPresetKeys);
    const parsed: ContentLimitPreset = { name: preset.name, limits: [] };
    if (typeof preset.playerMin === 'number') parsed.playerMin = preset.playerMin;
    if (typeof preset.playerMax === 'number') parsed.playerMax = preset.playerMax;
    parsed.limits = (Array.isArray(preset.limits) ? preset.limits : []).map((entry): ContentLimitEntry => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        const keys = Object.keys(record).sort().join(',');
        if ((keys === 'maxCount,sid' || keys === 'maxCount,sid,variant') &&
            typeof record.sid === 'string' && typeof record.maxCount === 'number' &&
            (record.variant === undefined || typeof record.variant === 'number')) {
          const row: ContentLimitEntry = { sid: record.sid, maxCount: record.maxCount };
          if (record.variant !== undefined) row.variant = record.variant as number;
          return row;
        }
        if (keys === 'includeLists,maxCount' &&
            Array.isArray(record.includeLists) && record.includeLists.every((item) => typeof item === 'string') &&
            typeof record.maxCount === 'number') {
          return { includeLists: [...(record.includeLists as string[])], maxCount: record.maxCount };
        }
      }
      return { maxCount: 0, raw: entry as JsonObject };
    });
    if (Object.keys(presetRaw).length) parsed.rawFields = presetRaw;
    return [parsed];
  });

  // Content pools: fully editable. Groups become editable rows only when they
  // rebuild verbatim ({weight, includeLists}); the same for bans
  // ({sid[,variant]}); anything exotic rides in `raw` and re-emits as-is.
  const knownPoolKeys = ['name', 'valueDistribution', 'groups', 'bans'];
  settings.contentPoolPresets = (Array.isArray(template.contentPools) ? template.contentPools : []).flatMap((pool) => {
    if (!pool || typeof pool.name !== 'string' || !pool.name) return [];
    const poolRaw = pickUnknownFields(pool, knownPoolKeys);
    const parsed: ContentPoolPreset = { name: pool.name, groups: [], bans: [] };
    if (
      pool.valueDistribution &&
      Array.isArray(pool.valueDistribution.priceBounds) &&
      Array.isArray(pool.valueDistribution.weights)
    ) {
      parsed.valueDistribution = {
        priceBounds: pool.valueDistribution.priceBounds.map(Number),
        weights: pool.valueDistribution.weights.map(Number)
      };
    }
    parsed.groups = (Array.isArray(pool.groups) ? pool.groups : []).map((entry): ContentPoolGroup => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        const keys = Object.keys(record).sort().join(',');
        if (keys === 'includeLists,weight' &&
            typeof record.weight === 'number' &&
            Array.isArray(record.includeLists) && record.includeLists.every((item) => typeof item === 'string')) {
          return { weight: record.weight, includeLists: [...(record.includeLists as string[])] };
        }
      }
      return { weight: 0, includeLists: [], raw: entry as JsonObject };
    });
    parsed.bans = (Array.isArray(pool.bans) ? pool.bans : []).map((entry): ContentPoolBan => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        const keys = Object.keys(record).sort().join(',');
        if ((keys === 'sid' || keys === 'sid,variant') &&
            typeof record.sid === 'string' &&
            (record.variant === undefined || typeof record.variant === 'number')) {
          const ban: ContentPoolBan = { sid: record.sid };
          if (record.variant !== undefined) ban.variant = record.variant as number;
          return ban;
        }
      }
      return { raw: entry as unknown as JsonObject };
    });
    if (Object.keys(poolRaw).length) parsed.rawFields = poolRaw;
    return [parsed];
  });

  // Preserve original top-level arrays
  settings.originalZoneLayouts = template.zoneLayouts;
  settings.originalContentLists = template.contentLists;

  // Global bans live at the template root in most official templates, but a
  // few keep them inside gameRules — merge both sources.
  const banList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const mergeBans = (key: 'items' | 'magics' | 'heroes'): string[] => [
    ...new Set([
      ...banList(template.globalBans?.[key]),
      ...banList(template.gameRules?.globalBans?.[key])
    ])
  ];
  settings.bannedItems = mergeBans('items');
  settings.bannedSpells = mergeBans('magics');
  settings.bannedHeroes = mergeBans('heroes');

  // Per-object guard overrides: a flat editable list.
  settings.valueOverrides = (Array.isArray(template.valueOverrides) ? template.valueOverrides : []).flatMap((entry) => {
    if (!entry || typeof entry.sid !== 'string' || !entry.sid) return [];
    return [{
      sid: entry.sid,
      variant: entry.variant !== undefined ? Number(entry.variant) : undefined,
      guardValue: Number(entry.guardValue) || 0
    }];
  });

  const knownRootKeys = [
    'name', 'gameMode', 'description', 'displayWinCondition', 'sizeX', 'sizeZ',
    'gameRules', 'variants', 'zoneLayouts', 'mandatoryContent',
    'contentCountLimits', 'contentPools', 'contentLists', 'globalBans',
    'valueOverrides'
  ];
  const rawFields = pickUnknownFields(template, knownRootKeys);
  if (Object.keys(rawFields).length > 0) {
    settings.originalRawRootFields = rawFields;
  }

  // 2. Map Edges & preserveLayout check
  const edges: Edge[] = [];
  let hasProximity = false;
  (variant.connections ?? []).forEach((conn: RmgConnectionSource) => {
    // Skip importing auto-generated layout guidelines (case-insensitive check)
    if (conn.name) {
      const lowerName = conn.name.toLowerCase();
      if (lowerName.startsWith("auto-grid-") || lowerName.startsWith("auto-repel-")) {
        return;
      }
    }

    // The game treats a missing connectionType as "Default"; unknown values
    // are normalized to "Default" with a warning so the template stays usable.
    let connectionType: ConnectionType = "Default";
    if (conn.connectionType !== undefined) {
      if ((CONNECTION_TYPES as readonly string[]).includes(conn.connectionType)) {
        connectionType = conn.connectionType as ConnectionType;
      } else {
        warnings.push(
          `Connection "${conn.name || "(unnamed)"}" has unknown type "${conn.connectionType}", imported as "Default"`
        );
      }
    }
    if (connectionType === "Proximity") {
      hasProximity = true;
    }

    const knownKeys = [
      'name', 'from', 'to', 'guardValue', 'road', 'connectionType', 'length',
      'simTurnSquad', 'guardWeeklyIncrement', 'guardEscape', 'guardRandomization',
      'guardZone', 'gatePlacement', 'guardMatchGroup',
      'portalPlacementRulesTo', 'portalPlacementRulesFrom'
    ];
    const rawFields = pickUnknownFields(conn, knownKeys);
    if (!conn.from || !conn.to) {
      warnings.push(
        `Connection "${conn.name || "(unnamed)"}" has no valid endpoints`
      );
      return;
    }

    edges.push({
      id: conn.name || `${conn.from}__${conn.to}__${uniqueKey()}`,
      from: conn.from,
      to: conn.to,
      guardValue: Number(conn.guardValue) || 0,
      road: conn.road !== false,
      connectionType,
      length: conn.length !== undefined ? Number(conn.length) : undefined,
      simTurnSquad: typeof conn.simTurnSquad === 'boolean' ? conn.simTurnSquad : undefined,
      guardWeeklyIncrement: conn.guardWeeklyIncrement !== undefined ? Number(conn.guardWeeklyIncrement) : undefined,
      guardEscape: typeof conn.guardEscape === 'boolean' ? conn.guardEscape : undefined,
      guardRandomization: conn.guardRandomization !== undefined ? Number(conn.guardRandomization) : undefined,
      guardZone: typeof conn.guardZone === 'string' && conn.guardZone ? conn.guardZone : undefined,
      gatePlacement: typeof conn.gatePlacement === 'string' && conn.gatePlacement ? conn.gatePlacement : undefined,
      guardMatchGroup: typeof conn.guardMatchGroup === 'string' && conn.guardMatchGroup ? conn.guardMatchGroup : undefined,
      portalPlacementRulesTo: Array.isArray(conn.portalPlacementRulesTo) ? (conn.portalPlacementRulesTo as RmgPlacementRule[]).map((r) => ({ ...r })) : undefined,
      portalPlacementRulesFrom: Array.isArray(conn.portalPlacementRulesFrom) ? (conn.portalPlacementRulesFrom as RmgPlacementRule[]).map((r) => ({ ...r })) : undefined,
      imported: true,
      rawFields: Object.keys(rawFields).length ? rawFields : undefined
    });
  });
  settings.preserveLayout = hasProximity;
  settings.originalConnectionIds = edges.map((e) => e.id);

  // 3. Map Orientation
  if (variant.orientation) {
    settings.fixedOrientation = true;
    settings.orientationAnchor = variant.orientation.zeroAngleZone || "";
    settings.originalOrientation = variant.orientation;
  }

  // 3b. Map Border (water band, corner rounding; per-variant like orientation)
  if (variant.border) {
    settings.originalBorder = variant.border;
    settings.borderWaterWidth = Math.max(0, Number(variant.border.waterWidth) || 0);
    settings.borderCornerRadius = Math.max(0, Number(variant.border.cornerRadius) || 0);
  }

  // 4. Map Zones
  const zones: Zone[] = [];
  if (Array.isArray(variant.zones)) {
    variant.zones.forEach((z: RmgZone) => {
      const type = "custom";

      const mainObjects: ZoneMainObject[] = [];

      if (Array.isArray(z.mainObjects)) {
        z.mainObjects.forEach((obj: RmgMainObject) => {
          const knownMainKeys = [
            'type', 'spawn', 'holdCityWinCon', 'owner', 'buildingsConstructionSid',
            'guardValue', 'guardChance', 'guardWeeklyIncrement', 'removeGuardIfHasOwner',
            'guardRandomization', 'isKeyObject', 'enableWeeklyUnitIncrement', 'initialUnitIncrement'
          ];
          // Placement becomes editable only when it rebuilds verbatim: a known
          // enum value plus plain string args; anything exotic stays passthrough.
          const placementEditable =
            (obj.placement === undefined ||
              obj.placement === 'Uniform' || obj.placement === 'Center' ||
              obj.placement === 'Connection' || obj.placement === 'NearZone') &&
            (obj.placementArgs === undefined ||
              (Array.isArray(obj.placementArgs) && obj.placementArgs.every((arg) => typeof arg === 'string')));
          if (placementEditable) knownMainKeys.push('placement', 'placementArgs');
          const placementFields = placementEditable
            ? {
                placement: obj.placement as ZoneMainObject['placement'],
                placementArgs: obj.placementArgs ? [...obj.placementArgs] : undefined
              }
            : {};
          const rawFields = pickUnknownFields(obj, knownMainKeys);
          const ownerNum = typeof obj.owner === "string"
            ? Number(obj.owner.match(/Player(\d+)/i)?.[1]) || null
            : null;
          const constructionSid = typeof obj.buildingsConstructionSid === "string"
            ? obj.buildingsConstructionSid
            : undefined;
          // Guard fields are optional in the format: absent means the game
          // default, so they are kept undefined and re-emitted only when set.
          const guardFields = {
            guardValue: obj.guardValue !== undefined ? Number(obj.guardValue) : undefined,
            guardChance: obj.guardChance !== undefined ? Number(obj.guardChance) : undefined,
            guardWeeklyIncrement: obj.guardWeeklyIncrement !== undefined ? Number(obj.guardWeeklyIncrement) : undefined,
            removeGuardIfHasOwner: typeof obj.removeGuardIfHasOwner === 'boolean' ? obj.removeGuardIfHasOwner : undefined,
            guardRandomization: obj.guardRandomization !== undefined ? Number(obj.guardRandomization) : undefined,
            isKeyObject: typeof obj.isKeyObject === 'boolean' ? obj.isKeyObject : undefined,
            enableWeeklyUnitIncrement: typeof obj.enableWeeklyUnitIncrement === 'boolean' ? obj.enableWeeklyUnitIncrement : undefined,
            initialUnitIncrement: obj.initialUnitIncrement !== undefined ? Number(obj.initialUnitIncrement) : undefined
          };

          if (obj.type === "Spawn") {
            let playerNum: number | null = null;
            if (typeof obj.spawn === "string") {
              const match = obj.spawn.match(/Player(\d+)/i);
              if (match) {
                playerNum = parseInt(match[1], 10);
              }
            }
            mainObjects.push({
              key: uniqueKey(),
              type: 'Spawn',
              player: playerNum,
              factionMode: 'random',
              factionId: factions[0]?.id || '',
              buildingsConstructionSid: constructionSid,
              ...guardFields,
              ...placementFields,
              rawFields: Object.keys(rawFields).length ? rawFields : undefined
            });
          } else if (obj.type === "City" || obj.type === "AbandonedOutpost" || obj.type === "GladiatorArena") {
            let playerNum: number | null = null;
            if (typeof obj.spawn === "string") {
              const match = obj.spawn.match(/Player(\d+)/i);
              if (match) {
                playerNum = parseInt(match[1], 10);
              }
            }
            let factionMode: 'random' | 'spawn' | 'specific' = "random";
            let factionSource = "";
            let factionId = factions[0]?.id || "";
            let factionFromList: string[] | undefined;
            const holdCityWinCon = Boolean(obj.holdCityWinCon);

            if (holdCityWinCon) {
              settings.victoryCityZoneId = z.name;
            }

            if (obj.faction) {
              const fac = obj.faction;
              if (fac.type === "Match" && fac.args && fac.args.length >= 2) {
                // Match [index, zoneName]: match the faction of a main object in
                // the named zone (typically that zone's spawn → the player).
                factionMode = "spawn";
                factionSource = String(fac.args[1]);
              } else if (fac.type === "Match" && fac.args && fac.args.length >= 1) {
                // Match [index]: no zone given → match within this same zone
                // (e.g. a spawn-zone city matching its own spawn = the player).
                factionMode = "spawn";
                factionSource = z.name;
              } else if (fac.type === "FromList" && fac.args && fac.args.length > 0) {
                const args = fac.args.map(String);
                // A single real faction id → "specific" (the editable picker).
                // Anything else (a faction subset, or "differentFrom: ..."
                // exclusions of neighbouring players) → constrained random.
                if (args.length === 1 && !args[0].startsWith("differentFrom")) {
                  factionMode = "specific";
                  factionId = args[0];
                } else {
                  factionMode = "random";
                  factionFromList = args;
                }
              } else if (Array.isArray(obj.factions) && obj.factions.length > 0) {
                factionMode = "specific";
                factionId = obj.factions[0];
              }
            } else if (Array.isArray(obj.factions) && obj.factions.length > 0) {
              factionMode = "specific";
              factionId = obj.factions[0];
            }

            mainObjects.push({
              key: uniqueKey(),
              type: obj.type,
              player: playerNum,
              factionMode,
              factionSource,
              factionId,
              factionFromList,
              holdCityWinCon,
              owner: ownerNum,
              buildingsConstructionSid: constructionSid,
              ...guardFields,
              ...placementFields,
              rawFields: Object.keys(rawFields).length ? rawFields : undefined
            });
          }
        });
      }

      // Map biome
      let biomeMode: 'own' | 'random' | 'spawn' | 'specific' = "random";
      let biomeSource = "";
      let biomeId = "Grass";

      if (z.zoneBiome) {
        const zb = z.zoneBiome;
        if (zb.type === "MatchMainObject") {
          biomeMode = "own";
        } else if (zb.type === "MatchZone" && zb.args && zb.args.length > 0) {
          biomeMode = "spawn";
          biomeSource = zb.args[0];
        } else if (zb.type === "FromList" && zb.args && zb.args.length > 0) {
          biomeMode = "specific";
          biomeId = zb.args[0];
        }
      }

      // Content/meta biomes become editable only when the rule maps cleanly
      // onto the editor modes AND rebuilds verbatim; anything exotic stays
      // 'land' and survives through the original* passthrough.
      const classifyAuxBiome = (rule: typeof z.zoneBiome): { mode?: 'own' | 'random' | 'spawn' | 'specific'; source?: string; id?: string } => {
        if (rule === undefined) return {};
        if (JSON.stringify(rule) === JSON.stringify(z.zoneBiome)) return {};
        let parsed: { mode: 'own' | 'random' | 'spawn' | 'specific'; source?: string; id?: string } | null = null;
        if (rule.type === 'MatchMainObject') parsed = { mode: 'own' };
        else if (rule.type === 'MatchZone' && Array.isArray(rule.args) && typeof rule.args[0] === 'string' && rule.args[0]) {
          parsed = { mode: 'spawn', source: rule.args[0] };
        } else if (rule.type === 'FromList' && Array.isArray(rule.args) && rule.args.length === 1 && typeof rule.args[0] === 'string') {
          parsed = { mode: 'specific', id: rule.args[0] };
        } else if (rule.type === 'FromList' && Array.isArray(rule.args) && rule.args.length === 0) {
          parsed = { mode: 'random' };
        }
        if (!parsed) return {};
        const rebuilt = auxBiomeRule(parsed.mode, parsed.source, parsed.id);
        return JSON.stringify(rebuilt) === JSON.stringify(rule) ? parsed : {};
      };
      const contentAux = classifyAuxBiome(z.contentBiome);
      const metaAux = classifyAuxBiome(z.metaObjectsBiome);

      const holes = z.encounterHolesSettings;
      const encounterHolesSettings =
        holes && typeof holes.affectedEncounters === 'number' && typeof holes.twoHoleEncounters === 'number'
          ? { affectedEncounters: holes.affectedEncounters, twoHoleEncounters: holes.twoHoleEncounters }
          : undefined;

      // Gather mandatory objects
      const zoneObjects: ZoneObject[] = [];
      const mandatoryNames: string[] = z.mandatoryContent || [];

      // Only capture an entry's name if a road targets it — most official names
      // are auto-generated positional noise (name_<zone>_<i>_<sid>) we don't want
      // to surface; road-referenced names must be kept stable so roads resolve.
      const roadMandatoryNames = new Set<string>();
      for (const road of Array.isArray(z.roads) ? z.roads : []) {
        for (const term of [road?.from, road?.to]) {
          if (term && term.type === 'MandatoryContent' && typeof term.args?.[0] === 'string') {
            roadMandatoryNames.add(term.args[0]);
          }
        }
      }

      mandatoryNames.forEach((listName) => {
        const pool = template.mandatoryContent?.find((candidate) => candidate.name === listName);
        if (pool && Array.isArray(pool.content)) {
          pool.content.forEach((obj) => {
            // Find reference kind and value
            const includeLists = obj.includeLists ?? [];
            const kind = includeLists.length > 0 ? "list" : "sid";
            const val = kind === "list" ? includeLists[0] : obj.sid;

            // Capture Road/MainObject distances exactly (no snapping to a preset)
            // so imports stay 100% faithful; the preset is only a UI shortcut.
            let roadDistance = "any";
            let townDistance = "any";
            if (Array.isArray(obj.rules)) {
              obj.rules.forEach((rule) => {
                const bounds = ruleBounds(rule);
                if (!bounds) return; // unmodelable shape — preserved via rawRules
                if (rule.type === "Road") {
                  roadDistance = encodeDistance(bounds.min, bounds.max);
                } else if (rule.type === "MainObject") {
                  townDistance = encodeDistance(bounds.min, bounds.max);
                }
              });
            }

            // Find matching catalog item in objectLibrary
            let catalogItem = objectLibrary.find((item) => {
              if (kind === "list") {
                return item.kind === "list" && item.includeList === val;
              } else {
                return item.kind === "sid" && (item.sid === val || item.id === val);
              }
            });

            if (!catalogItem) {
              // Create dummy catalog item for unmapped objects to prevent loss
              catalogItem = {
                id: val || "unknown",
                sid: kind === "sid" ? val : undefined,
                includeList: kind === "list" ? val : undefined,
                kind,
                label: val || "Unknown",
                description: "Imported unmapped object",
                guarded: Boolean(obj.isGuarded),
                isMine: Boolean(obj.isMine)
              };
            }

            zoneObjects.push({
              key: uniqueKey(),
              id: catalogItem.id,
              name: typeof obj.name === 'string' && roadMandatoryNames.has(obj.name) ? obj.name : undefined,
              sid: catalogItem.sid,
              includeList: catalogItem.includeList,
              label: catalogItem.label,
              description: catalogItem.description,
              labelByLang: catalogItem.labelByLang,
              descriptionByLang: catalogItem.descriptionByLang,
              kind: catalogItem.kind,
              guarded: Boolean(obj.isGuarded),
              count: 1, // Will group them later
              soloEncounter: Boolean(obj.soloEncounter),
              variant: obj.variant === undefined || obj.variant === null ? null : Number(obj.variant),
              roadDistance,
              townDistance,
              // Keep the original placement rules verbatim so they round-trip
              // exactly while the distance presets are unchanged (the preset
              // model only captures Road/MainObject distances, losing exact
              // values, weights, args and Crossroads/Connection rules).
              rawRules: Array.isArray(obj.rules) ? obj.rules.map((r) => ({ ...r })) : undefined,
              // An object can reference several content lists at once; the model
              // identifies a list object by its first list, so keep the full set
              // verbatim to round-trip multi-list objects without truncation.
              rawIncludeLists: kind === "list" && includeLists.length > 1 ? [...includeLists] : undefined,
              // A mandatory object can start owned by a player (e.g. a mine
              // handed over on turn 1); stored as a number, emitted "PlayerN".
              owner: typeof obj.owner === "string"
                ? Number(obj.owner.match(/Player(\d+)/i)?.[1]) || null
                : null,
              designatedEncounter: obj.designatedEncounter === true ? true : undefined,
              // Inline weighted candidate list (pool-slot objects); kept so it
              // round-trips and stays editable in the object's inspector.
              nestedContent: Array.isArray(obj.content)
                ? obj.content.map((c) => ({ sid: String(c.sid), weight: Number(c.weight) || 0 }))
                : undefined,
              isMine: Boolean(obj.isMine),
              tag: catalogItem.tag,
              category: catalogItem.category,
              rarity: catalogItem.rarity,
              sizeX: catalogItem.sizeX,
              sizeZ: catalogItem.sizeZ
            });
          });
        }
      });

      // Group duplicate objects to keep UI clean. Only road-referenced names
      // were captured above; other objects stay unnamed (a default name is
      // assigned lazily when the object is first used as a road target).
      const groupedObjects = groupZoneObjects(zoneObjects);

      const knownZoneKeys = [
        'name', 'size', 'layout', 'mandatoryContent', 'mainObjects',
        'zoneBiome', 'contentBiome', 'metaObjectsBiome',
        'guardedContentValue', 'unguardedContentValue', 'resourcesValue',
        'roads', 'guardedContentValuePerArea', 'unguardedContentValuePerArea', 'resourcesValuePerArea',
        'guardCutoffValue', 'guardRandomization', 'guardMultiplier',
        'guardWeeklyIncrement', 'guardReactionDistribution', 'diplomacyModifier',
        'randomHireInitialUnitIncrement', 'randomHireEnableWeeklyUnitIncrement',
        'encounterHolesSettings', 'contentCountLimits',
        'guardedContentPool', 'unguardedContentPool', 'resourcesContentPool'
      ];
      const rawFields = pickUnknownFields(z, knownZoneKeys);

      // Preset references: normally an array of names; a few official zones
      // carry a single name as a plain string.
      const nameRefs = (value: unknown): string[] | undefined =>
        Array.isArray(value)
          ? value.filter((name): name is string => typeof name === 'string')
          : typeof value === 'string'
            ? [value]
            : undefined;
      const zoneLimitRefs = nameRefs(z.contentCountLimits);

      const originalPoolName = z.mandatoryContent?.[0];
      const originalPool = originalPoolName
        ? template.mandatoryContent?.find(
            (candidate) => candidate.name === originalPoolName
          )
        : undefined;

      zones.push({
        id: z.name,
        label: z.name,
        type,
        size: Number(z.size) || 1,
        biomeMode,
        biomeSource,
        biomeId,
        mainObjects,
        guardedValue: Number(z.guardedContentValue) || 0,
        unguardedValue: Number(z.unguardedContentValue) || 0,
        resourcesValue: Number(z.resourcesValue) || 0,
        guardedValuePerArea: z.guardedContentValuePerArea !== undefined ? Number(z.guardedContentValuePerArea) : undefined,
        unguardedValuePerArea: z.unguardedContentValuePerArea !== undefined ? Number(z.unguardedContentValuePerArea) : undefined,
        resourcesValuePerArea: z.resourcesValuePerArea !== undefined ? Number(z.resourcesValuePerArea) : undefined,
        guardCutoffValue: z.guardCutoffValue !== undefined ? Number(z.guardCutoffValue) : undefined,
        guardRandomization: z.guardRandomization !== undefined ? Number(z.guardRandomization) : undefined,
        guardMultiplier: z.guardMultiplier !== undefined ? Number(z.guardMultiplier) : undefined,
        guardWeeklyIncrement: z.guardWeeklyIncrement !== undefined ? Number(z.guardWeeklyIncrement) : undefined,
        guardReactionDistribution: Array.isArray(z.guardReactionDistribution)
          ? z.guardReactionDistribution.map(Number)
          : undefined,
        randomHireInitialUnitIncrement: Array.isArray(z.randomHireInitialUnitIncrement)
          ? z.randomHireInitialUnitIncrement.map(Number)
          : undefined,
        randomHireEnableWeeklyUnitIncrement: Array.isArray(z.randomHireEnableWeeklyUnitIncrement)
          ? z.randomHireEnableWeeklyUnitIncrement.map(Boolean)
          : undefined,
        diplomacyModifier: z.diplomacyModifier !== undefined ? Number(z.diplomacyModifier) : undefined,
        contentBiomeMode: contentAux.mode,
        contentBiomeSource: contentAux.source,
        contentBiomeId: contentAux.id,
        metaBiomeMode: metaAux.mode,
        metaBiomeSource: metaAux.source,
        metaBiomeId: metaAux.id,
        encounterHolesSettings,
        contentCountLimits: zoneLimitRefs,
        guardedContentPool: nameRefs(z.guardedContentPool),
        unguardedContentPool: nameRefs(z.unguardedContentPool),
        resourcesContentPool: nameRefs(z.resourcesContentPool),
        objects: groupedObjects,
        x: 0.5, // Will be solved by layout engine
        y: 0.5,
        layout: z.layout,
        mandatoryContent: z.mandatoryContent,
        roads: z.roads,
        rawFields: Object.keys(rawFields).length ? rawFields : undefined,
        rawMandatoryContent: originalPool ? originalPool.content : undefined,
        importedObjects: structuredClone(groupedObjects),
        originalZoneBiome: z.zoneBiome,
        originalContentBiome: z.contentBiome,
        originalMetaObjectsBiome: z.metaObjectsBiome
      });
    });
  }

  // Derive each connection's road surface from the zones' road segments
  // (the type lives on the per-zone segments, not on the connection itself).
  // A connection gets a roadType only when all its segments agree; untyped
  // or mixed segments stay untouched on export.
  const roadTypesByConnection = new Map<string, Set<string>>();
  zones.forEach((zone) => {
    (zone.roads || []).forEach((segment) => {
      for (const term of [segment.from, segment.to]) {
        if (term?.type === 'Connection' && Array.isArray(term.args) && term.args[0]) {
          const set = roadTypesByConnection.get(term.args[0]) ?? new Set<string>();
          set.add(typeof segment.type === 'string' ? segment.type : '');
          roadTypesByConnection.set(term.args[0], set);
        }
      }
    });
  });
  // When a template ties roads to connections (any connection is referenced by
  // a zone.roads segment), those segments are the source of truth for whether a
  // connection actually has a road — the connection's own `road` flag is a
  // legacy/ignored field that official templates often leave unset on every
  // connection (e.g. OctoJebus: 5 parallel passages per spoke, only one paved).
  // Only templates that don't tie roads to connections fall back to the flag.
  const connectionRoadsUsed = roadTypesByConnection.size > 0;
  edges.forEach((edge) => {
    const types = roadTypesByConnection.get(edge.id);
    if (types?.size === 1) {
      const only = [...types][0];
      if (only === 'Stone' || only === 'Dirt') edge.roadType = only;
    }
    if (connectionRoadsUsed && edge.connectionType !== 'Proximity') {
      edge.road = roadTypesByConnection.has(edge.id);
    }
  });

  // Adjust player count to match spawn zones (the game supports 2..8 players)
  const spawnCount = zones.reduce((count, z) => count + (z.mainObjects?.filter(mo => mo.type === 'Spawn').length || 0), 0);
  settings.players = Math.min(8, Math.max(2, spawnCount));

  // 5. Run layout solver
  arrangeCoordinates(zones, edges);

  // Build one editor variant per template variant. The first variant is the
  // active one (its zones/edges/orientation live in the flat result fields).
  // Additional variants are parsed by recursively importing a single-variant
  // copy of the template, which reuses this exact parsing logic. Orientation
  // is per-variant in the game format, so each entry keeps its own copy.
  const importedVariants = Array.isArray(template.variants) ? template.variants : [];
  const variants = importedVariants.map((entry, index) => {
    if (index === 0) {
      return {
        id: `variant_${index + 1}`,
        zones,
        edges,
        fixedOrientation: settings.fixedOrientation ?? false,
        orientationAnchor: settings.orientationAnchor ?? '',
        preserveLayout: settings.preserveLayout ?? false,
        originalOrientation: settings.originalOrientation,
        borderWaterWidth: settings.borderWaterWidth ?? 0,
        borderCornerRadius: settings.borderCornerRadius ?? 0,
        originalBorder: settings.originalBorder
      };
    }
    const sub = importTemplateFromJson(
      { ...template, variants: [entry] },
      objectLibrary,
      factions
    );
    return {
      id: `variant_${index + 1}`,
      zones: sub.zones,
      edges: sub.edges,
      fixedOrientation: sub.settings.fixedOrientation ?? false,
      orientationAnchor: sub.settings.orientationAnchor ?? '',
      preserveLayout: sub.settings.preserveLayout ?? false,
      originalOrientation: sub.settings.originalOrientation,
      borderWaterWidth: sub.settings.borderWaterWidth ?? 0,
      borderCornerRadius: sub.settings.borderCornerRadius ?? 0,
      originalBorder: sub.settings.originalBorder
    };
  });

  return {
    settings,
    zones,
    edges,
    warnings,
    customObjectLists,
    variants,
    activeVariantId: variants[0]?.id ?? "variant_1"
  };
}
