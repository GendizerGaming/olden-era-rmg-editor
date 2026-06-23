import type { MapSettings } from '../types/editor';

/**
 * Win conditions in the .rmg.json format are an independent SET of flags in
 * `gameRules.winConditions` (classic, desertion, heroLighting, lostStartCity,
 * lostStartHero, cityHold, gladiatorArena, tournament) — several can be active
 * at once — plus a separate `displayWinCondition` label (`win_condition_0..7`)
 * shown in the game's template picker. The engine reads the FLAGS, not the
 * label (ContentPlacer.SetGameRules).
 *
 * The game ships 8 named presets (win_condition_0..7). Each preset is just a
 * standard flag set + its label. Picking a preset applies both; the expert
 * view can then tweak individual flags, which decouples the mechanics from the
 * label (e.g. OctoJebus = the Classic label over Capital-Hold mechanics) and is
 * surfaced as a "modified" badge. Source of truth for the presets and the
 * engine defaults: DerpcatMusic/HoMM_OE_RMG_Editor
 * (src/core/rmg/winConditions.ts, docs/rmg-kb/schema/win-conditions.md).
 */

export type VictoryMode = MapSettings['victoryMode'];

/** The win-condition fields that make up a preset's identity — everything in
 *  `gameRules.winConditions`, minus the cosmetic label and the map-specific
 *  target city (victoryCityZoneId). */
type WinFlags = Pick<
  MapSettings,
  | 'classicEnabled' | 'desertionEnabled' | 'desertionDay' | 'desertionValue'
  | 'heroLightingEnabled' | 'heroLightingDay'
  | 'lostStartCityEnabled' | 'lostStartCityDay'
  | 'cityHoldEnabled' | 'cityHoldDays'
  | 'singleHero'
  | 'gladiatorArenaEnabled' | 'gladiatorArenaDaysDelayStart' | 'gladiatorArenaCountDay'
  | 'gladiatorArenaRegistrationStartFight' | 'gladiatorArenaChampionRule'
  | 'tournamentEnabled' | 'tournamentPointsToWin' | 'tournamentSaveArmy'
  | 'tournamentDays' | 'tournamentAnnounceDays'
>;

/** Engine defaults (WinConditions.cs / BASE_SECONDARY_CONDITIONS) shared by
 *  every preset. classic/desertion/heroLighting default ON. */
const BASE: WinFlags = {
  classicEnabled: true,
  desertionEnabled: true, desertionDay: 3, desertionValue: 3000,
  heroLightingEnabled: true, heroLightingDay: 1,
  lostStartCityEnabled: false, lostStartCityDay: 0,
  cityHoldEnabled: false, cityHoldDays: 3,
  singleHero: false,
  gladiatorArenaEnabled: false, gladiatorArenaDaysDelayStart: 30, gladiatorArenaCountDay: 3,
  gladiatorArenaRegistrationStartFight: true, gladiatorArenaChampionRule: 'StartHero',
  tournamentEnabled: false, tournamentPointsToWin: 2, tournamentSaveArmy: true,
  tournamentDays: [3, 3, 3], tournamentAnnounceDays: [7, 14, 21]
};

export interface WinConditionPreset {
  /** Value stored in `displayWinCondition`. */
  sid: string;
  /** Stable id (informational / for tests). */
  id: string;
  /** i18n keys for the name and the one-line description. */
  nameKey: string;
  descKey: string;
  /** The standard flag set this preset applies. */
  flags: WinFlags;
}

export const WIN_CONDITION_PRESETS: readonly WinConditionPreset[] = [
  { sid: 'win_condition_0', id: 'storyBased', nameKey: 'winPreset0', descKey: 'winPreset0Desc', flags: { ...BASE } },
  { sid: 'win_condition_1', id: 'classic', nameKey: 'winPreset1', descKey: 'winPreset1Desc', flags: { ...BASE } },
  { sid: 'win_condition_2', id: 'capitalCapture', nameKey: 'winPreset2', descKey: 'winPreset2Desc', flags: { ...BASE, lostStartCityEnabled: true, lostStartCityDay: 1 } },
  { sid: 'win_condition_3', id: 'capitalHold', nameKey: 'winPreset3', descKey: 'winPreset3Desc', flags: { ...BASE, lostStartCityEnabled: true, lostStartCityDay: 3 } },
  { sid: 'win_condition_4', id: 'finalBattle', nameKey: 'winPreset4', descKey: 'winPreset4Desc', flags: { ...BASE, singleHero: true, gladiatorArenaEnabled: true } },
  { sid: 'win_condition_5', id: 'cityHold', nameKey: 'winPreset5', descKey: 'winPreset5Desc', flags: { ...BASE, cityHoldEnabled: true, cityHoldDays: 3 } },
  { sid: 'win_condition_6', id: 'tournament', nameKey: 'winPreset6', descKey: 'winPreset6Desc', flags: { ...BASE, singleHero: true, tournamentEnabled: true } },
  { sid: 'win_condition_7', id: 'battleForCapital', nameKey: 'winPreset7', descKey: 'winPreset7Desc', flags: { ...BASE, lostStartCityEnabled: true, lostStartCityDay: 1, singleHero: true, gladiatorArenaEnabled: true, gladiatorArenaDaysDelayStart: 0, gladiatorArenaCountDay: 1 } }
];

export function presetBySid(sid: string): WinConditionPreset | undefined {
  return WIN_CONDITION_PRESETS.find((preset) => preset.sid === sid);
}

/** Settings update that applies a preset's standard flags and selects its
 *  label. Used by the preset picker and the "reset to preset" button. */
export function applyPreset(sid: string): Partial<MapSettings> {
  const preset = presetBySid(sid) ?? presetBySid('win_condition_1')!;
  return { ...preset.flags, displayWinCondition: preset.sid };
}

/** Whether the current flags still equal the preset's standard values. Day/
 *  count parameters are compared only while their parent flag is on (a dead
 *  parameter under a disabled flag does not count as a change). */
export function matchesPreset(settings: MapSettings, sid: string): boolean {
  const preset = presetBySid(sid);
  if (!preset) return true; // unknown label — nothing to compare against
  const f = preset.flags;
  const sameBool = (a: unknown, b: unknown) => Boolean(a) === Boolean(b);

  if (!sameBool(settings.classicEnabled, f.classicEnabled)) return false;
  if (!sameBool(settings.desertionEnabled, f.desertionEnabled)) return false;
  if (!sameBool(settings.heroLightingEnabled, f.heroLightingEnabled)) return false;
  if (!sameBool(settings.lostStartCityEnabled, f.lostStartCityEnabled)) return false;
  if (!sameBool(settings.cityHoldEnabled, f.cityHoldEnabled)) return false;
  if (!sameBool(settings.singleHero, f.singleHero)) return false;
  if (!sameBool(settings.gladiatorArenaEnabled, f.gladiatorArenaEnabled)) return false;
  if (!sameBool(settings.tournamentEnabled, f.tournamentEnabled)) return false;

  if (f.desertionEnabled && (settings.desertionDay !== f.desertionDay || settings.desertionValue !== f.desertionValue)) return false;
  if (f.heroLightingEnabled && settings.heroLightingDay !== f.heroLightingDay) return false;
  if (f.lostStartCityEnabled && settings.lostStartCityDay !== f.lostStartCityDay) return false;
  if (f.cityHoldEnabled && settings.cityHoldDays !== f.cityHoldDays) return false;
  if (f.gladiatorArenaEnabled && (
    settings.gladiatorArenaDaysDelayStart !== f.gladiatorArenaDaysDelayStart ||
    settings.gladiatorArenaCountDay !== f.gladiatorArenaCountDay ||
    sameBool(settings.gladiatorArenaRegistrationStartFight, f.gladiatorArenaRegistrationStartFight) === false ||
    settings.gladiatorArenaChampionRule !== f.gladiatorArenaChampionRule
  )) return false;
  if (f.tournamentEnabled && (
    settings.tournamentPointsToWin !== f.tournamentPointsToWin ||
    sameBool(settings.tournamentSaveArmy, f.tournamentSaveArmy) === false ||
    settings.tournamentDays.join(',') !== f.tournamentDays.join(',') ||
    settings.tournamentAnnounceDays.join(',') !== f.tournamentAnnounceDays.join(',')
  )) return false;

  return true;
}

type VictoryFlags = Pick<
  MapSettings,
  'tournamentEnabled' | 'gladiatorArenaEnabled' | 'cityHoldEnabled' | 'lostStartCityEnabled' | 'lostStartCityDay'
>;

/** The single "primary" mode derived from the flags. Still consumed by the
 *  validator, the zone inspector and the recipes; the normalizer recomputes it
 *  from the flags so it is never the source of truth. */
export function primaryVictoryMode(flags: VictoryFlags): VictoryMode {
  if (flags.tournamentEnabled) return 'tournament';
  if (flags.gladiatorArenaEnabled) return 'gladiatorArena';
  if (flags.cityHoldEnabled) return 'cityHold';
  if (flags.lostStartCityEnabled) return flags.lostStartCityDay <= 0 ? 'capitalCapture' : 'capitalHold';
  return 'classic';
}
