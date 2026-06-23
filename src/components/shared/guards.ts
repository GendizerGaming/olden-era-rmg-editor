import { BIOME_MODES, CITY_FACTION_MODES, HERO_LIMIT_MODES, PRESET_BASE_TYPES } from '../../types/editor';
import type { BiomeMode, CityFactionMode, MapSettings, Preset } from '../../types/editor';

export function isPresetBaseType(value: string): value is Preset['baseType'] {
  return (PRESET_BASE_TYPES as readonly string[]).includes(value);
}

export function isBiomeMode(value: string): value is BiomeMode {
  return (BIOME_MODES as readonly string[]).includes(value);
}

export function isCityFactionMode(value: string): value is CityFactionMode {
  return (CITY_FACTION_MODES as readonly string[]).includes(value);
}

export function isHeroLimitMode(value: string): value is MapSettings['heroLimitMode'] {
  return (HERO_LIMIT_MODES as readonly string[]).includes(value);
}
