import type { Preset } from '../../types/editor';
import type { TranslationFunction } from '../../i18n/context';

/** Localized display-name keys for the built-in zone presets. */
const BUILT_IN_PRESET_NAME_KEYS: Record<string, string> = {
  spawn: 'zoneTypeOptionSpawn',
  blank: 'zoneTypeOptionBlank',
  low: 'zoneTypeOptionLow',
  medium: 'zoneTypeOptionMedium',
  high: 'zoneTypeOptionHigh',
  neutral: 'zoneTypeOptionNeutral'
};

/**
 * Human-readable preset name: built-ins get a localized role name
 * («S — Старт игрока»), custom presets show their own label.
 */
export function presetDisplayName(preset: Preset, t: TranslationFunction): string {
  if (!preset.isCustom && BUILT_IN_PRESET_NAME_KEYS[preset.id]) {
    return t(BUILT_IN_PRESET_NAME_KEYS[preset.id]);
  }
  return preset.label;
}
