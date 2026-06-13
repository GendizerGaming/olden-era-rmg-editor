import React, { useState } from 'react';
import { useEditorStore, zoneTypes, isBuiltInProfileName } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { TerrainProfile, TerrainElevationMode, Zone } from '../../types/editor';
import { NumberField } from '../shared/NumberField';
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

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '13px' }}>{t('terrainProfileTitle')}</strong>
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

      <label>
        {t('terrainProfileName')}
        <input
          type="text"
          value={nameDraft}
          disabled={isBuiltIn}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </label>
      {isBuiltIn && (
        <p className="field-note" style={{ marginTop: 0 }}>{t('terrainProfileBuiltInNote')}</p>
      )}
      <p className="field-note" style={{ marginTop: 0 }}>
        {usedBy.length > 0
          ? t('terrainProfileUsedBy', { count: usedBy.length, zones: usedBy.join(', ') })
          : t('terrainProfileUnused')}
      </p>

      <div className="field-row">
        <label>
          <span>{t('terrainObstacles')}</span>
          <NumberField
            min={0}
            max={1}
            step={0.02}
            value={profile.obstaclesFill ?? 0.34}
            onCommit={(v) => update({ obstaclesFill: v })}
          />
        </label>
        <label>
          <span>{t('terrainObstaclesVoid')}</span>
          <NumberField
            min={0}
            max={1}
            step={0.02}
            value={profile.obstaclesFillVoid ?? 0.4}
            onCommit={(v) => update({ obstaclesFillVoid: v })}
          />
        </label>
      </div>
      <p className="field-note" style={{ marginTop: 0 }}>{t('terrainObstaclesHelp')}</p>

      <div className="field-row">
        <label>
          <span>{t('terrainLakes')}</span>
          <NumberField
            min={0}
            max={1}
            step={0.02}
            value={profile.lakesFill ?? 0.16}
            onCommit={(v) => update({ lakesFill: v })}
          />
        </label>
        <label>
          <span>{t('terrainMinLakeArea')}</span>
          <NumberField
            min={1}
            step={1}
            value={profile.minLakeArea ?? 8}
            onCommit={(v) => update({ minLakeArea: v })}
          />
        </label>
      </div>
      <p className="field-note" style={{ marginTop: 0 }}>{t('terrainLakesHelp')}</p>

      <label>
        {t('terrainElevation')}
        <select
          value={elevationPreset}
          onChange={(e) => {
            const preset = ELEVATION_PRESETS.find((candidate) => candidate.key === e.target.value);
            if (preset) {
              update({ elevationModes: preset.modes.map((mode) => ({ ...mode })) });
            }
          }}
        >
          {ELEVATION_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>{t(`terrainElevation_${preset.key}`)}</option>
          ))}
          {elevationPreset === 'custom' && (
            <option value="custom">{t('terrainElevation_custom')}</option>
          )}
        </select>
      </label>
      <p className="field-note" style={{ marginTop: 0 }}>{t('terrainElevationHelp')}</p>

      <div className="field-row">
        <label>
          <span>{t('terrainElevationScale')}</span>
          <NumberField
            min={0.01}
            max={1}
            step={0.01}
            value={profile.elevationClusterScale ?? 0.1}
            onCommit={(v) => update({ elevationClusterScale: v })}
          />
        </label>
        <label>
          <span>{t('terrainRoadCluster')}</span>
          <NumberField
            min={1}
            step={8}
            value={profile.roadClusterArea ?? 80}
            onCommit={(v) => update({ roadClusterArea: v })}
          />
        </label>
      </div>
      <p className="field-note" style={{ marginTop: 0 }}>{t('terrainScaleHelp')}</p>
    </div>
  );
};
