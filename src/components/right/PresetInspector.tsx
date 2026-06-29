import React from 'react';
import { useEditorStore, catalogItemForReference, zoneTypes } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import { Trash2, Copy } from 'lucide-react';
import type { Preset, ZoneObject } from '../../types/editor';
import { fieldUpdate } from '../shared/forms';
import { GuardReactionEditor } from '../shared/GuardReactionEditor';
import { LazyDetails } from '../shared/LazyDetails';
import { isPresetBaseType } from '../shared/guards';
import { NumberField } from '../shared/NumberField';
import { DistanceField } from '../shared/DistanceField';
import { ValueBadge } from '../shared/ValueBadge';
import { Field, FieldRow, Toggle, Card, Badge, InfoTip } from '../shared/primitives';
import { CollapsibleSubsection } from '../shared/CollapsibleSubsection';
import { Shield } from 'lucide-react';

interface PresetInspectorProps {
  presetId: string;
  presets: Record<string, Preset>;
  actions: EditorActions;
  t: TranslationFunction;
  language: 'ru' | 'en';
}

export const PresetInspector: React.FC<PresetInspectorProps> = ({ presetId, presets, actions, t, language }) => {
  const settings = useEditorStore((state) => state.settings);
  const preset = presets[presetId];
  if (!preset) return <div className="inspector-empty">{t('presetNotFound')}</div>;

  const handleFieldChange = <K extends keyof Preset>(field: K, value: Preset[K]) => {
    actions.updatePreset(presetId, fieldUpdate<Preset, K>(field, value));
  };

  const handleObjectFieldChange = <K extends keyof ZoneObject>(
    objectKey: string,
    field: K,
    value: ZoneObject[K]
  ) => {
    actions.updatePresetObjectField(
      presetId,
      objectKey,
      fieldUpdate<ZoneObject, K>(field, value)
    );
  };

  const handleRemoveObject = (objectKey: string) => {
    actions.removeObjectFromPreset(presetId, objectKey);
  };

  const handleReset = () => {
    if (window.confirm(t('confirmResetPreset', { name: preset.label }))) {
      actions.resetPreset(presetId);
    }
  };

  const handleClone = () => {
    const newName = `${preset.label} (Copy)`;
    actions.createPreset(newName, preset.baseType, presetId);
  };

  const handleDelete = () => {
    if (window.confirm(t('confirmDeletePreset', { name: preset.label }))) {
      actions.deletePreset(presetId);
    }
  };

  const hasTown = preset.baseType === 'spawn';
  return (
    <div style={{ display: 'grid', gap: '12px', minWidth: 0 }}>
      <div className="inspector-preset-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preset.isCustom ? t('customPreset') : t('standardPreset')}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '6px', width: '100%', minWidth: 0 }}>
          <button className="small-button" type="button" onClick={handleClone} style={{ flex: 1, justifyContent: 'center' }} title={t('clonePreset')}>
            <Copy size={12} style={{ marginRight: '4px' }} />
            {t('clonePreset')}
          </button>
          {!preset.isCustom && (
            <button className="small-button" type="button" onClick={handleReset} style={{ flex: 1, justifyContent: 'center' }} title={t('resetPreset')}>
              {t('resetPreset')}
            </button>
          )}
          {preset.isCustom && (
            <button className="small-button danger-button" type="button" onClick={handleDelete} style={{ flex: 1, justifyContent: 'center' }} title={t('deletePreset')}>
              <Trash2 size={12} style={{ marginRight: '4px' }} />
              {t('deletePreset')}
            </button>
          )}
        </div>
      </div>

      <Field label={t('presetName') || 'Name'}>
        <input
          type="text"
          value={preset.label}
          onChange={(e) => handleFieldChange('label', e.target.value)}
          disabled={!preset.isCustom}
        />
      </Field>

      <Field label={t('presetBaseType') || 'Base Type'} tip={t('presetBaseTypeHelp')}>
        <select
          value={preset.baseType}
          onChange={(e) => {
            if (isPresetBaseType(e.target.value)) {
              handleFieldChange('baseType', e.target.value);
            }
          }}
          disabled={!preset.isCustom}
        >
          <option value="spawn">{t('zoneTypeOptionSpawn') || 'Spawn'}</option>
          <option value="blank">{t('zoneTypeOptionBlank') || 'Blank'}</option>
          <option value="low">{t('zoneTypeOptionLow') || 'Low'}</option>
          <option value="medium">{t('zoneTypeOptionMedium') || 'Medium'}</option>
          <option value="high">{t('zoneTypeOptionHigh') || 'High'}</option>
          <option value="neutral">{t('zoneTypeOptionNeutral') || 'Neutral'}</option>
          <option value="custom">{t('zoneTypeOptionCustom') || 'Custom (no preset)'}</option>
        </select>
      </Field>

      <div>
        <div className="ui-group-label">{t('presetValues') || 'Values'}</div>
        <div style={{ display: 'grid', gap: '8px', minWidth: 0 }}>
          <Field label={<>{t('guardedValue')}<ValueBadge kind="zoneGuarded" value={preset.guardedValue} /></>} tip={t('guardedValueHelp')}>
            <NumberField
              min={0}
              step={10000}
              value={preset.guardedValue}
              onCommit={(v) => handleFieldChange('guardedValue', v)}
            />
          </Field>
          <Field label={<>{t('unguardedValue')}<ValueBadge kind="zoneUnguarded" value={preset.unguardedValue} /></>} tip={t('unguardedValueHelp')}>
            <NumberField
              min={0}
              step={5000}
              value={preset.unguardedValue}
              onCommit={(v) => handleFieldChange('unguardedValue', v)}
            />
          </Field>
          <Field label={<>{t('resourcesValue')}<ValueBadge kind="zoneResources" value={preset.resourcesValue} /></>} tip={t('resourcesValueHelp')}>
            <NumberField
              min={0}
              step={5000}
              value={preset.resourcesValue}
              onCommit={(v) => handleFieldChange('resourcesValue', v)}
            />
          </Field>

          <div className="control-label" style={{ marginTop: '4px' }}>{t('zonePerAreaSection')} <InfoTip text={t('zonePerAreaHelp')} /></div>
          <FieldRow>
            <Field label={t('guarded')}>
              <NumberField
                min={0}
                step={100}
                value={preset.guardedValuePerArea ?? 0}
                onCommit={(v) => handleFieldChange('guardedValuePerArea', v || undefined)}
              />
            </Field>
            <Field label={t('unguarded')}>
              <NumberField
                min={0}
                step={50}
                value={preset.unguardedValuePerArea ?? 0}
                onCommit={(v) => handleFieldChange('unguardedValuePerArea', v || undefined)}
              />
            </Field>
          </FieldRow>
          <Field label={t('resources')}>
            <NumberField
              min={0}
              step={50}
              value={preset.resourcesValuePerArea ?? 0}
              onCommit={(v) => handleFieldChange('resourcesValuePerArea', v || undefined)}
            />
          </Field>

          <CollapsibleSubsection id={`preset.guard.${presetId}`} title={t('zoneGuardSection')} icon={<Shield size={12} style={{ color: 'var(--accent)' }} />} tip={t('zoneGuardMainHelp')} defaultOpen={false}>
            <GuardReactionEditor
              key={presetId}
              value={preset.guardReactionDistribution}
              t={t}
              onChange={(value) => handleFieldChange('guardReactionDistribution', value)}
            />
            <FieldRow>
              <Field label={t('zoneGuardMultiplier')}>
                <NumberField
                  min={0}
                  max={10}
                  step={0.05}
                  value={preset.guardMultiplier ?? 1.4}
                  onCommit={(v) => handleFieldChange('guardMultiplier', v)}
                />
              </Field>
              <Field label={t('zoneDiplomacy')}>
                <NumberField
                  min={-1}
                  max={1}
                  step={0.05}
                  value={preset.diplomacyModifier ?? -0.25}
                  onCommit={(v) => handleFieldChange('diplomacyModifier', v)}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label={t('zoneGuardCutoff')}>
                <NumberField
                  min={0}
                  step={250}
                  value={preset.guardCutoffValue ?? 1500}
                  onCommit={(v) => handleFieldChange('guardCutoffValue', v)}
                />
              </Field>
              <Field label={t('guardWeeklyIncrement')}>
                <NumberField
                  min={0}
                  max={1}
                  step={0.05}
                  value={preset.guardWeeklyIncrement ?? 0.15}
                  onCommit={(v) => handleFieldChange('guardWeeklyIncrement', v)}
                />
              </Field>
            </FieldRow>
            <Field label={t('guardRandomization')}>
              <NumberField
                min={0}
                max={1}
                step={0.05}
                value={preset.guardRandomization ?? 0.25}
                onCommit={(v) => handleFieldChange('guardRandomization', v)}
              />
            </Field>
            <p className="ui-field-hint" style={{ margin: 0 }}>{t('presetGuardApplyNote')}</p>
          </CollapsibleSubsection>

          <Field label={t('zoneTerrainProfile')} tip={t('zoneTerrainProfileHelp')}>
            <select
              value={preset.layout ?? ''}
              onChange={(e) => handleFieldChange('layout', e.target.value || undefined)}
            >
              <option value="">
                {t('terrainProfileAuto', { name: zoneTypes[preset.baseType]?.layout || zoneTypes.neutral.layout })}
              </option>
              {preset.layout && !settings.terrainProfiles.some((profile) => profile.name === preset.layout) && (
                <option value={preset.layout}>{preset.layout} ({t('terrainProfileMissingMark')})</option>
              )}
              {settings.terrainProfiles.map((profile) => (
                <option key={profile.name} value={profile.name}>{profile.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div style={{ marginTop: '4px' }}>
        <div className="ui-group-label">{t('presetObjects')}</div>
        <p className="ui-field-hint" style={{ marginBottom: '8px' }}>
          {t('presetObjectsHelp') || 'Click on items in the catalog (left panel) to add them to this preset.'}
        </p>
        <div className="object-list">
          {preset.objects.length === 0 ? (
            <div className="inspector-empty" style={{ padding: '12px' }}>{t('noObjects')}</div>
          ) : (
            preset.objects.map((obj) => {
              const label = obj.labelByLang?.[language] || obj.label || obj.sid || obj.includeList || obj.id || '';
              const guardStr = obj.guarded ? t('guardedShort') : t('unguardedShort');
              const technicalId = obj.kind === 'list' ? obj.includeList : obj.sid || obj.id;
              const coreCatalog = useEditorStore.getState().coreCatalog;
              const catalogItem = coreCatalog 
                ? catalogItemForReference(useEditorStore.getState().objectLibrary, { kind: obj.kind, value: technicalId || '' }) 
                : null;
              const desc = obj.descriptionByLang?.[language] || obj.description || (catalogItem ? t('listDescription', { count: catalogItem.count || 0 }) : '');

              return (
                <Card
                  key={obj.key}
                  id={`presetobj.${presetId}.${obj.key}`}
                  title={label}
                  meta={
                    <>
                      <Badge tone="neutral">×{obj.count}</Badge>
                      <Badge tone="neutral">{guardStr}</Badge>
                    </>
                  }
                >
                      <div className="object-description">
                        <strong>{t('objectDescription')}</strong>
                        <p>{desc}</p>
                        <span>{t('objectTechnicalId', { id: technicalId || '?' })}</span>
                      </div>
                      
                      {catalogItem?.kind === 'list' && catalogItem.contentEntries && catalogItem.contentEntries.length > 0 && (
                        <LazyDetails
                          className="list-contents"
                          style={{ marginBottom: '10px' }}
                          summary={t('listContents', { count: catalogItem.contentEntries?.length || 0 })}
                          renderContent={() => (
                            <div className="list-contents-body">
                              {catalogItem.contentEntries?.map((entry, index) => {
                                const entryLabel = entry.labelByLang?.[language] || entry.sid || entry.technicalId || t('unknownObject');
                                const entryDesc = entry.descriptionByLang?.[language] || t('unknownObject');
                                return (
                                  <details key={index} className="list-content-entry">
                                    <summary>
                                      <span className="list-entry-name">{entryLabel}</span>
                                    </summary>
                                    <div className="list-entry-description">
                                      <p>{entryDesc}</p>
                                      <code>{entry.technicalId || entry.sid || entry.includeLists?.join(', ') || '?'}</code>
                                    </div>
                                  </details>
                                );
                              })}
                            </div>
                          )}
                        />
                      )}

                      <FieldRow hint={t('objectVariantHelp')}>
                        <Field label={t('objectCount')}>
                          <NumberField
                            min={1}
                            max={99}
                            value={obj.count}
                            onCommit={(v) => handleObjectFieldChange(obj.key, 'count', v)}
                          />
                        </Field>
                        <Field label={t('objectVariant')}>
                          <input
                            type="number"
                            placeholder={t('objectVariantAuto')}
                            value={obj.variant ?? ''}
                            onChange={(e) => handleObjectFieldChange(obj.key, 'variant', e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </Field>
                      </FieldRow>

                      <Toggle
                        checked={Boolean(obj.guarded)}
                        onChange={(v) => handleObjectFieldChange(obj.key, 'guarded', v)}
                        label={t('objectGuarded')}
                      />
                      <Toggle
                        checked={obj.soloEncounter}
                        onChange={(v) => handleObjectFieldChange(obj.key, 'soloEncounter', v)}
                        label={t('objectSoloEncounter')}
                        tip={t('objectSoloEncounterHelp')}
                      />
                      
                      <DistanceField
                        label={t('objectRoadDistance')}
                        value={obj.roadDistance}
                        onChange={(v) => handleObjectFieldChange(obj.key, 'roadDistance', v)}
                      />

                      <DistanceField
                        label={t('objectTownDistance')}
                        value={hasTown ? obj.townDistance : 'any'}
                        disabled={!hasTown}
                        onChange={(v) => handleObjectFieldChange(obj.key, 'townDistance', v)}
                      />
                      <p className="ui-field-hint">
                        {hasTown ? t('objectPlacementHelp') : t('objectTownDistanceUnavailablePreset')}
                      </p>

                      <button
                        className="small-button object-remove-button"
                        type="button"
                        onClick={() => handleRemoveObject(obj.key)}
                      >
                        <Trash2 size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                        {t('removeObject')}
                      </button>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-component for Edge settings inspector
