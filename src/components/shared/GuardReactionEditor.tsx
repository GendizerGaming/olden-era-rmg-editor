import React from 'react';
import type { TranslationFunction } from '../../i18n/context';
import { NumberField } from './NumberField';

// Weights follow the runtime enum order (decompiled ESquadReactionType):
// index 0 = Aggressive (always fights) … index 5 = Docile (joins/lets pass).
// The official default [60,20,10,10,2,0] is therefore mostly aggressive.
const AGGRESSION_PRESETS: Array<{ key: string; value: number[] }> = [
  { key: 'passive', value: [0, 0, 0, 0, 2, 3] },
  { key: 'normal', value: [60, 20, 10, 10, 2, 0] },
  { key: 'bold', value: [4, 3, 2, 1, 0, 0] },
  { key: 'aggressive', value: [10, 2, 0, 0, 0, 0] }
];

const DEFAULT_AGGRESSION = [60, 20, 10, 10, 2, 0];

interface GuardReactionEditorProps {
  /** The six reaction weights; undefined shows the editor default. */
  value: number[] | undefined;
  t: TranslationFunction;
  onChange: (value: number[]) => void;
}

/**
 * Preset select for the six guard-reaction weights with a manual mode: when
 * "custom" is chosen the weights become individually editable. Used by both
 * the zone inspector and the preset inspector — key the instance by the
 * owning entity's id so the custom-mode state resets on switch.
 */
export const GuardReactionEditor: React.FC<GuardReactionEditorProps> = ({ value, t, onChange }) => {
  const weights = value ?? DEFAULT_AGGRESSION;
  const matched = AGGRESSION_PRESETS.find(
    (preset) => JSON.stringify(preset.value) === JSON.stringify(weights)
  );
  // Explicit user choice of the custom mode survives even when the weights
  // happen to match a preset.
  const [customSelected, setCustomSelected] = React.useState(!matched);
  const isCustom = customSelected || !matched;

  return (
    <>
      <label style={{ marginBottom: 0 }}>
        <span>{t('zoneAggression')}</span>
        <select
          value={isCustom ? 'custom' : matched!.key}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setCustomSelected(true);
              return;
            }
            const preset = AGGRESSION_PRESETS.find((entry) => entry.key === e.target.value);
            if (preset) {
              setCustomSelected(false);
              onChange(preset.value);
            }
          }}
        >
          {AGGRESSION_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {t(`zoneAggression_${preset.key}`)}
            </option>
          ))}
          <option value="custom">{t('zoneAggressionCustom')}</option>
        </select>
      </label>
      <p className="field-note" style={{ margin: 0 }}>{t('zoneAggressionHelp')}</p>

      {isCustom && (
        <div style={{ display: 'grid', gap: '6px', borderLeft: '2px solid var(--accent)', paddingLeft: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
            {weights.map((weight, index) => (
              <NumberField
                key={index}
                className="weight-field"
                autoComplete="off"
                min={0}
                step={1}
                value={weight}
                title={t(`reactionSlot${index}`)}
                onCommit={(v) => {
                  const next = [...weights];
                  next[index] = Math.max(0, Math.round(v));
                  onChange(next);
                }}
              />
            ))}
          </div>
          <p className="field-note" style={{ margin: 0 }}>{t('zoneAggressionCustomHelp')}</p>
        </div>
      )}
    </>
  );
};
