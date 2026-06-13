import type { Preset } from '../types/editor';

export type PresetRole = 'start' | 'passage' | 'treasure';
export type PresetTier = 'poor' | 'medium' | 'rich';

export const PRESET_ROLES: PresetRole[] = ['start', 'passage', 'treasure'];
export const PRESET_TIERS: PresetTier[] = ['poor', 'medium', 'rich'];

export interface PresetRecipe {
  /** Base zone type the role maps to (color, auto terrain profile, objects). */
  baseType: Preset['baseType'];
  values: Pick<
    Preset,
    | 'guardedValue'
    | 'unguardedValue'
    | 'resourcesValue'
    | 'guardedValuePerArea'
    | 'unguardedValuePerArea'
    | 'resourcesValuePerArea'
    | 'guardMultiplier'
    | 'diplomacyModifier'
  >;
}

const recipe = (
  baseType: Preset['baseType'],
  guardedValue: number,
  unguardedValue: number,
  resourcesValue: number,
  guardedValuePerArea: number,
  unguardedValuePerArea: number,
  resourcesValuePerArea: number,
  guardMultiplier: number
): PresetRecipe => ({
  baseType,
  values: {
    guardedValue,
    unguardedValue,
    resourcesValue,
    guardedValuePerArea,
    unguardedValuePerArea,
    resourcesValuePerArea,
    guardMultiplier,
    diplomacyModifier: -0.25
  }
});

/**
 * Role × tier starting values for new presets, calibrated against the 82
 * official templates (docs/research-zone-presets.md). Guarded values sit on
 * the official quantiles: start zones use the spawn p25/p50/p75 row, passages
 * the open-zone p10/p25/p50, treasuries the open-zone p50/p75/p90.
 */
export const PRESET_RECIPES: Record<PresetRole, Record<PresetTier, PresetRecipe>> = {
  start: {
    poor: recipe('spawn', 125000, 20000, 12000, 700, 60, 30, 1.2),
    medium: recipe('spawn', 240000, 33000, 20000, 1400, 80, 40, 1.4),
    rich: recipe('spawn', 350000, 45000, 30000, 2100, 120, 60, 1.6)
  },
  passage: {
    poor: recipe('neutral', 156000, 20000, 15000, 500, 100, 100, 1.1),
    medium: recipe('low', 240000, 25000, 30000, 1000, 200, 240, 1.1),
    rich: recipe('low', 400000, 38000, 55000, 2000, 300, 420, 1.4)
  },
  treasure: {
    poor: recipe('medium', 400000, 38000, 55000, 2000, 300, 420, 1.4),
    medium: recipe('high', 600000, 60000, 80000, 3000, 620, 580, 1.8),
    rich: recipe('high', 800000, 80000, 100000, 4000, 800, 700, 2.2)
  }
};
