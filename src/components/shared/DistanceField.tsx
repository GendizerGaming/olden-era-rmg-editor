import React from 'react';
import { useTranslation } from '../../i18n/context';
import { distancePresets, resolveDistance, formatDistance } from '../../store/constants';
import { NumberField } from './NumberField';

const CUSTOM = 'custom';

/**
 * Placement-distance control: pick a named preset (a quick shortcut when
 * building from scratch) or "Exact value" to type the precise min/max. The
 * value is stored as a preset key or a "min:max" string; imports keep the
 * exact figures, so switching to "Exact value" reveals the real numbers.
 */
export const DistanceField: React.FC<{
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, disabled, onChange }) => {
  const { t } = useTranslation();
  const isPreset = Object.prototype.hasOwnProperty.call(distancePresets, value);
  const bounds = resolveDistance(value) ?? { min: 0, max: 0.1 };
  const selected = isPreset ? value : CUSTOM;

  return (
    <>
      <label className={disabled ? 'disabled-control' : ''}>
        {label}
        <select
          value={selected}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.value === CUSTOM ? formatDistance(bounds.min, bounds.max) : e.target.value)
          }
        >
          {Object.keys(distancePresets).map((presetKey) => (
            <option key={presetKey} value={presetKey}>
              {t(`distance${presetKey.charAt(0).toUpperCase() + presetKey.slice(1)}`)}
            </option>
          ))}
          <option value={CUSTOM}>{t('distanceCustom')}</option>
        </select>
      </label>
      {!disabled && selected === CUSTOM && (
        <div className="field-row">
          <label>
            {t('distanceMin')}
            <NumberField
              min={0}
              max={1}
              step={0.05}
              value={bounds.min}
              onCommit={(v) => onChange(formatDistance(v, bounds.max))}
            />
          </label>
          <label>
            {t('distanceMax')}
            <NumberField
              min={0}
              max={1}
              step={0.05}
              value={bounds.max}
              onCommit={(v) => onChange(formatDistance(bounds.min, v))}
            />
          </label>
        </div>
      )}
    </>
  );
};
