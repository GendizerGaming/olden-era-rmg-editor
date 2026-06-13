/**
 * Qualitative tiers for the format's raw numbers, calibrated against the
 * official templates' quantiles (84 templates):
 *   zone guarded:    q25=200k  q50=300k   q75=500k   q90=800k
 *   zone unguarded:  q25=15k   q50=30k    q75=50k    q90=100k
 *   zone resources:  q25=3k    q50=20k    q75=32.5k  q90=60k
 *   passage guards:  q25=7k    q50=26.5k  q75=55.5k  q90=70k
 *   guard multiplier: q10=1    q50=1.4    q90=2
 */
export type ValueTierKind =
  | 'zoneGuarded'
  | 'zoneUnguarded'
  | 'zoneResources'
  | 'guardStrength'
  | 'guardMultiplier';

export type ValueTierTone = 'low' | 'mid' | 'high' | 'top';

export interface ValueTier {
  labelKey: string;
  tone: ValueTierTone;
}

const TONES: ValueTierTone[] = ['low', 'mid', 'high', 'top'];
const WEALTH_LABELS = ['tierPoor', 'tierAverage', 'tierRich', 'tierVeryRich'];

/** Tiers split at roughly the official q25 / q75 / q90 marks. */
const wealthScale = (bounds: [number, number, number]) => (value: number): ValueTier => {
  const index = value < bounds[0] ? 0 : value < bounds[1] ? 1 : value < bounds[2] ? 2 : 3;
  return { labelKey: WEALTH_LABELS[index], tone: TONES[index] };
};

const scales: Record<ValueTierKind, (value: number) => ValueTier> = {
  zoneGuarded: wealthScale([200000, 500000, 800000]),
  zoneUnguarded: wealthScale([15000, 50000, 100000]),
  zoneResources: wealthScale([10000, 35000, 60000]),
  guardStrength: (value) => {
    if (value <= 0) return { labelKey: 'tierGuardNone', tone: 'low' };
    const index = value < 7000 ? 0 : value < 40000 ? 1 : value < 70000 ? 2 : 3;
    return {
      labelKey: ['tierGuardWeak', 'tierGuardMedium', 'tierGuardStrong', 'tierGuardDeadly'][index],
      tone: TONES[index]
    };
  },
  guardMultiplier: (value) => {
    if (value < 1) return { labelKey: 'tierMultSoft', tone: 'low' };
    if (value <= 1.4) return { labelKey: 'tierMultNormal', tone: 'mid' };
    if (value <= 2) return { labelKey: 'tierMultHard', tone: 'high' };
    return { labelKey: 'tierMultBrutal', tone: 'top' };
  }
};

export function valueTier(kind: ValueTierKind, value: number): ValueTier | null {
  if (!Number.isFinite(value)) return null;
  return scales[kind](value);
}
