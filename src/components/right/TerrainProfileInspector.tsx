import React, { useState } from 'react';
import { useEditorStore, zoneTypes, isBuiltInProfileName } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { TerrainProfile, TerrainElevationMode, Zone } from '../../types/editor';
import { NumberField } from '../shared/NumberField';
import { Field, FieldRow, InfoTip } from '../shared/primitives';
import { Copy, RotateCcw, Trash2 } from 'lucide-react';

interface TerrainProfileInspectorProps {
  profile: TerrainProfile;
  zones: Zone[];
  actions: EditorActions;
  t: TranslationFunction;
}

/**
 * Named elevation patterns observed across the official templates. Matching
 * is structural, so an imported profile with one of these mode sets shows
 * the friendly name; anything else displays as "custom".
 */
const ELEVATION_PRESETS: Array<{ key: string; modes: TerrainElevationMode[] }> = [
  { key: 'flat', modes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0 }] },
  // The other constant outcome, used by every zone in Blitz: the whole zone
  // comes out raised, so a zone can be pinned to high ground every generation.
  { key: 'plateau', modes: [{ weight: 1, minElevatedFraction: 1, maxElevatedFraction: 1 }] },
  { key: 'hills', modes: [{ weight: 2, minElevatedFraction: 0.2, maxElevatedFraction: 0.4 }, { weight: 1, minElevatedFraction: 0.6, maxElevatedFraction: 0.8 }] },
  { key: 'flatOrPlateau', modes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0 }, { weight: 1, minElevatedFraction: 1, maxElevatedFraction: 1 }] },
  { key: 'contrast', modes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0.1 }, { weight: 1, minElevatedFraction: 0.9, maxElevatedFraction: 1 }] },
  { key: 'softContrast', modes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0.2 }, { weight: 1, minElevatedFraction: 0.7, maxElevatedFraction: 0.8 }] }
];

function matchElevationPreset(modes: TerrainElevationMode[] | undefined): string {
  if (!modes) return 'flat';
  const match = ELEVATION_PRESETS.find((preset) =>
    preset.modes.length === modes.length &&
    preset.modes.every((mode, index) =>
      mode.weight === modes[index].weight &&
      mode.minElevatedFraction === modes[index].minElevatedFraction &&
      mode.maxElevatedFraction === modes[index].maxElevatedFraction
    )
  );
  return match ? match.key : 'custom';
}

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

const rangeText = (mode: TerrainElevationMode): string =>
  mode.minElevatedFraction === mode.maxElevatedFraction
    ? percent(mode.minElevatedFraction)
    : `${percent(mode.minElevatedFraction)}–${percent(mode.maxElevatedFraction)}`;

export const TerrainProfileInspector: React.FC<TerrainProfileInspectorProps> = ({ profile, zones, actions, t }) => {
  const presets = useEditorStore((state) => state.presets);
  // The name commits on blur/Enter so half-typed names don't rewrite zone
  // references on every keystroke. The parent keys this component by the
  // profile name, so the draft resets on switch/rename via remount.
  const [nameDraft, setNameDraft] = useState(profile.name);

  const isBuiltIn = isBuiltInProfileName(profile.name);
  // Zones without an explicit profile resolve to a built-in via the
  // type-based "Auto" option — count those references too.
  const usedBy = zones.filter((zone) => {
    const baseType = presets[zone.type]?.baseType || zone.type;
    const resolved = zone.layout || zoneTypes[baseType as keyof typeof zoneTypes]?.layout || zoneTypes.neutral.layout;
    return resolved === profile.name;
  }).map((zone) => zone.id);
  const elevationPreset = matchElevationPreset(profile.elevationModes);
  const elevationModes = profile.elevationModes ?? [];
  const elevationWeightTotal = elevationModes.reduce((sum, mode) => sum + (mode.weight || 0), 0);
  // Picking "custom" is a mode of the control, not something derived from the
  // values: values typed there can land back on a preset, and the editor must
  // stay open when they do. Remounts on profile switch reset it.
  const [customElevation, setCustomElevation] = useState(false);
  const showCustomElevation = customElevation || elevationPreset === 'custom';

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== profile.name) {
      actions.updateTerrainProfile(profile.name, { name: next });
    } else {
      setNameDraft(profile.name);
    }
  };

  const update = (updates: Partial<TerrainProfile>) => {
    actions.updateTerrainProfile(profile.name, updates);
  };

  const updateElevationMode = (index: number, patch: Partial<TerrainElevationMode>) => {
    const next = elevationModes.map((mode, i) => (i === index ? { ...mode, ...patch } : mode));
    // Pushing one end of the range past the other carries the other end along,
    // so the pair can never end up inverted.
    const edited = next[index];
    if (patch.minElevatedFraction !== undefined && edited.minElevatedFraction > edited.maxElevatedFraction) {
      edited.maxElevatedFraction = edited.minElevatedFraction;
    }
    if (patch.maxElevatedFraction !== undefined && edited.maxElevatedFraction < edited.minElevatedFraction) {
      edited.minElevatedFraction = edited.maxElevatedFraction;
    }
    update({ elevationModes: next });
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--fz-emph)' }}>{t('terrainProfileTitle')}</strong>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className="compact-button"
            title={t('terrainProfileDuplicate')}
            onClick={() => actions.duplicateTerrainProfile(profile.name)}
          >
            <Copy size={12} />
          </button>
          {isBuiltIn && (
            <button
              type="button"
              className="compact-button"
              title={t('terrainProfileReset')}
              onClick={() => {
                if (window.confirm(t('confirmResetTerrainProfile', { name: profile.name }))) {
                  actions.resetTerrainProfile(profile.name);
                }
              }}
            >
              <RotateCcw size={12} />
            </button>
          )}
          <button
            type="button"
            className="compact-button danger"
            title={isBuiltIn
              ? t('terrainProfileBuiltInDeleteBlocked')
              : usedBy.length > 0 ? t('terrainProfileDeleteBlocked', { zones: usedBy.join(', ') }) : t('terrainProfileDelete')}
            disabled={isBuiltIn || usedBy.length > 0}
            style={isBuiltIn || usedBy.length > 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={() => actions.deleteTerrainProfile(profile.name)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <Field label={t('terrainProfileName')}>
        <input
          type="text"
          value={nameDraft}
          disabled={isBuiltIn}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </Field>
      {isBuiltIn && (
        <p className="ui-field-hint" style={{ marginTop: 0 }}>{t('terrainProfileBuiltInNote')}</p>
      )}
      <p className="ui-field-hint" style={{ marginTop: 0 }}>
        {usedBy.length > 0
          ? t('terrainProfileUsedBy', { count: usedBy.length, zones: usedBy.join(', ') })
          : t('terrainProfileUnused')}
      </p>

      <FieldRow hint={t('terrainObstaclesHelp')}>
        <Field label={t('terrainObstacles')}>
          <NumberField
            min={0}
            max={1}
            step={0.02}
            value={profile.obstaclesFill ?? 0.34}
            onCommit={(v) => update({ obstaclesFill: v })}
          />
        </Field>
        <Field label={t('terrainObstaclesVoid')}>
          <NumberField
            min={0}
            max={1}
            step={0.02}
            value={profile.obstaclesFillVoid ?? 0.4}
            onCommit={(v) => update({ obstaclesFillVoid: v })}
          />
        </Field>
      </FieldRow>

      <FieldRow hint={t('terrainLakesHelp')}>
        <Field label={t('terrainLakes')}>
          <NumberField
            min={0}
            max={1}
            step={0.02}
            value={profile.lakesFill ?? 0.16}
            onCommit={(v) => update({ lakesFill: v })}
          />
        </Field>
        <Field label={t('terrainMinLakeArea')}>
          <NumberField
            min={1}
            step={1}
            value={profile.minLakeArea ?? 8}
            onCommit={(v) => update({ minLakeArea: v })}
          />
        </Field>
      </FieldRow>

      <Field label={t('terrainElevation')} tip={t('terrainElevationHelp')}>
        <select
          value={showCustomElevation ? 'custom' : elevationPreset}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              // Start from whatever is on screen, so a preset can be nudged
              // instead of retyped.
              setCustomElevation(true);
              if (elevationModes.length === 0) {
                update({ elevationModes: [{ weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0.4 }] });
              }
              return;
            }
            setCustomElevation(false);
            const preset = ELEVATION_PRESETS.find((candidate) => candidate.key === e.target.value);
            if (preset) {
              update({ elevationModes: preset.modes.map((mode) => ({ ...mode })) });
            }
          }}
        >
          {ELEVATION_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>{t(`terrainElevation_${preset.key}`)}</option>
          ))}
          <option value="custom">{t('terrainElevation_custom')}</option>
        </select>
      </Field>

      {/* Spell the roll out in plain percentages: the option names alone don't
          say how much of the zone actually comes out raised. */}
      {elevationModes.length > 0 && (
        <ul className="ui-field-hint" style={{ margin: 0, paddingLeft: '18px' }}>
          {elevationModes.map((mode, index) => (
            <li key={index}>
              {elevationModes.length === 1 || elevationWeightTotal <= 0
                ? t('terrainElevationModeSingle', { range: rangeText(mode) })
                : t('terrainElevationModeChance', {
                  chance: Math.round(((mode.weight || 0) / elevationWeightTotal) * 100),
                  range: rangeText(mode)
                })}
            </li>
          ))}
        </ul>
      )}

      {showCustomElevation && (
        <div style={{ display: 'grid', gap: '6px', paddingLeft: '10px' }}>
          {elevationModes.map((mode, index) => (
            // Four controls don't fit the two-column field row, and a field's
            // own label would leave the button aligned against the label+input
            // pair rather than the inputs. So the variant lays itself out:
            // labels on one grid row, the numbers and the button on the next.
            <div key={index} className="elevation-variant-row">
              <span className="ui-field-label">
                {t('terrainElevationWeight')}
                <InfoTip text={t('terrainElevationWeightHelp')} />
              </span>
              <span className="ui-field-label">{t('terrainElevationMin')}</span>
              <span className="ui-field-label">{t('terrainElevationMax')}</span>
              <span />
              <NumberField
                min={0}
                step={1}
                value={mode.weight}
                onCommit={(v) => updateElevationMode(index, { weight: v })}
              />
              <NumberField
                min={0}
                max={100}
                step={5}
                value={Math.round(mode.minElevatedFraction * 100)}
                onCommit={(v) => updateElevationMode(index, { minElevatedFraction: v / 100 })}
              />
              <NumberField
                min={0}
                max={100}
                step={5}
                value={Math.round(mode.maxElevatedFraction * 100)}
                onCommit={(v) => updateElevationMode(index, { maxElevatedFraction: v / 100 })}
              />
              <button
                type="button"
                className="compact-button danger"
                title={t('terrainElevationRemoveVariant')}
                disabled={elevationModes.length < 2}
                style={elevationModes.length < 2 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={() => update({ elevationModes: elevationModes.filter((_, i) => i !== index) })}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="compact-button"
            style={{ justifySelf: 'start' }}
            onClick={() => update({
              elevationModes: [...elevationModes, { weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0 }]
            })}
          >
            {t('terrainElevationAddVariant')}
          </button>
          <p className="ui-field-hint" style={{ margin: 0 }}>{t('terrainElevationCustomHelp')}</p>
        </div>
      )}

      <FieldRow hint={t('terrainScaleHelp')}>
        <Field label={t('terrainElevationScale')}>
          <NumberField
            min={0.01}
            max={1}
            step={0.01}
            value={profile.elevationClusterScale ?? 0.1}
            onCommit={(v) => update({ elevationClusterScale: v })}
          />
        </Field>
        <Field label={t('terrainRoadCluster')}>
          <NumberField
            min={1}
            step={8}
            value={profile.roadClusterArea ?? 80}
            onCommit={(v) => update({ roadClusterArea: v })}
          />
        </Field>
      </FieldRow>
    </div>
  );
};
