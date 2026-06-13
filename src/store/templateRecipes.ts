import type { MapSettings } from '../types/editor';
import type { TopologyOptions } from '../services/topologyGenerator';

export interface TemplateRecipeTopology extends TopologyOptions {
  spawnPresetId: string;
  nearPresetId: string;
  midPresetId: string;
  farPresetId: string;
  centerPresetId: string;
}

export interface TemplateRecipe {
  /** i18n keys: recipe_<id> (name), recipeDesc_<id> (description). */
  id: string;
  topology: TemplateRecipeTopology;
  /** Map settings applied together with the skeleton (size, modes…). */
  settings: Partial<MapSettings>;
  /** Place the gladiator arena object into the central zone. */
  arenaInCenter?: boolean;
  /**
   * Extra neutral cities per player, spread along that player's side of the
   * map (the Crossroads/Chosen One pattern): the first matches the player's
   * faction, the rest are random; guards grow with the distance from the
   * start.
   */
  extraCitiesPerPlayer?: number;
  /** Extra random-faction cities in the central zone (the Jebus pattern). */
  extraCitiesInCenter?: number;
}

const tierPresets = {
  spawnPresetId: 'spawn',
  nearPresetId: 'low',
  midPresetId: 'medium',
  farPresetId: 'high',
  centerPresetId: 'high'
};

/**
 * Recipes pin the victory/game mode explicitly: applying a template must not
 * inherit whatever mode the previous map had.
 */
const classicSettings: Partial<MapSettings> = {
  victoryMode: 'classic',
  singleHeroMode: false,
  gladiatorArenaEnabled: false,
  tournamentEnabled: false
};

const duelTopology: TemplateRecipeTopology = {
  kind: 'chain',
  players: 2,
  neutralsPerSegment: 3,
  extraNeutrals: 0,
  centerZone: false,
  isolatePlayers: true,
  ...tierPresets
};

/**
 * Curated whole-template starting points: the classic 1v1 ladder from the
 * smallest to the largest official map sizes, then multiplayer archetypes
 * and special victory modes. The variation axes (players, depth, richness)
 * live in the topology wizard, so the list holds archetypes rather than
 * combinations. Map sizes and zone counts are calibrated against the
 * official 2-player templates (Arcade 80/5, Universe 96/5, Serpentine
 * Duel 128/9, Jebus Cross 160/5, Anarchy 160/15, Overthrow 192/21,
 * Full Hire 240/48).
 */
export const TEMPLATE_RECIPES: TemplateRecipe[] = [
  // ——— Classic 1v1, small → large ———
  {
    // Arcade-style sprint: spawn — L — M — L — spawn, five zones
    id: 'duelTiny',
    extraCitiesPerPlayer: 1,
    topology: duelTopology,
    settings: { ...classicSettings, sizeX: 80, sizeZ: 80 }
  },
  {
    // Universe-style: two short routes around a rich center
    id: 'duelCrossroads',
    extraCitiesPerPlayer: 1,
    topology: {
      kind: 'ring', players: 2, neutralsPerSegment: 1, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 96, sizeZ: 96 }
  },
  {
    id: 'duel',
    extraCitiesPerPlayer: 1,
    topology: duelTopology,
    settings: { ...classicSettings, sizeX: 112, sizeZ: 112 }
  },
  {
    id: 'cross',
    extraCitiesPerPlayer: 2,
    topology: {
      kind: 'ring', players: 2, neutralsPerSegment: 3, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 128, sizeZ: 128 }
  },
  {
    // Serpentine-style chain: value grows step by step toward the middle
    id: 'duelMarch',
    extraCitiesPerPlayer: 2,
    topology: {
      kind: 'chain', players: 2, neutralsPerSegment: 5, extraNeutrals: 0,
      centerZone: false, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 128, sizeZ: 128 }
  },
  {
    // Jebus Cross: poor buffers, everything valuable in the huge center
    id: 'duelJebus',
    extraCitiesInCenter: 2,
    topology: {
      kind: 'ring', players: 2, neutralsPerSegment: 1, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true,
      ...tierPresets, nearPresetId: 'neutral'
    },
    settings: { ...classicSettings, sizeX: 160, sizeZ: 160 }
  },
  {
    // Anarchy-style: fifteen zones in a random pattern
    id: 'duelAnarchy',
    extraCitiesPerPlayer: 2,
    topology: {
      kind: 'random', players: 2, neutralsPerSegment: 0, extraNeutrals: 13,
      centerZone: false, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 160, sizeZ: 160 }
  },
  {
    // Two deep routes (depth 3 each side) to a grand center
    id: 'duelEpic',
    extraCitiesPerPlayer: 3,
    topology: {
      kind: 'ring', players: 2, neutralsPerSegment: 6, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 192, sizeZ: 192 }
  },
  {
    // Full Hire scale: the largest official map, late-game armies
    id: 'duelGrand',
    extraCitiesPerPlayer: 3,
    topology: {
      kind: 'random', players: 2, neutralsPerSegment: 0, extraNeutrals: 22,
      centerZone: false, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 240, sizeZ: 240 }
  },
  // ——— Special modes, 1v1 ———
  {
    id: 'singleHeroDuel',
    extraCitiesPerPlayer: 1,
    topology: duelTopology,
    settings: { ...classicSettings, sizeX: 112, sizeZ: 112, singleHeroMode: true }
  },
  {
    id: 'tournamentDuel',
    extraCitiesPerPlayer: 1,
    topology: duelTopology,
    settings: {
      ...classicSettings, sizeX: 112, sizeZ: 112,
      victoryMode: 'tournament', tournamentEnabled: true
    }
  },
  // ——— Multiplayer ———
  {
    id: 'ring4',
    extraCitiesPerPlayer: 1,
    topology: {
      kind: 'ring', players: 4, neutralsPerSegment: 2, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 144, sizeZ: 144 }
  },
  {
    id: 'star4',
    extraCitiesPerPlayer: 1,
    topology: {
      kind: 'star', players: 4, neutralsPerSegment: 2, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 144, sizeZ: 144 }
  },
  {
    id: 'ffa6',
    extraCitiesPerPlayer: 1,
    topology: {
      kind: 'ring', players: 6, neutralsPerSegment: 2, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 160, sizeZ: 160 }
  },
  {
    id: 'big8',
    extraCitiesPerPlayer: 1,
    topology: {
      kind: 'ring', players: 8, neutralsPerSegment: 3, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 192, sizeZ: 192 }
  },
  {
    id: 'chaos4',
    extraCitiesPerPlayer: 1,
    topology: {
      kind: 'random', players: 4, neutralsPerSegment: 0, extraNeutrals: 12,
      centerZone: false, isolatePlayers: true, ...tierPresets
    },
    settings: { ...classicSettings, sizeX: 144, sizeZ: 144 }
  },
  {
    id: 'arena4',
    topology: {
      kind: 'star', players: 4, neutralsPerSegment: 2, extraNeutrals: 0,
      centerZone: true, isolatePlayers: true, ...tierPresets
    },
    settings: {
      ...classicSettings, sizeX: 144, sizeZ: 144,
      victoryMode: 'gladiatorArena', gladiatorArenaEnabled: true
    },
    arenaInCenter: true
  }
];
