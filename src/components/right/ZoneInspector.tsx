import React from 'react';
import { useEditorStore, biomeIds, catalogItemForReference, zoneTypes } from '../../store/useEditorStore';
import { makeDefaultSpawnObject, nextPlayerNumber, zoneContentScale } from '../../store/zones';
import { uniqueKey } from '../../store/ids';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import { Trash2, Save, Castle, Leaf, Boxes, Coins, Mountain, Package, Shield, Spline, Users } from 'lucide-react';
import type { Edge, Faction, MainObjectPlacement, MainObjectType, Zone, ZoneMainObject, ZoneObject } from '../../types/editor';
import { fieldUpdate } from '../shared/forms';
import { GuardReactionEditor } from '../shared/GuardReactionEditor';
import { LazyDetails } from '../shared/LazyDetails';
import { Card, Badge, Field, FieldRow, Toggle, InfoTip } from '../shared/primitives';
import { CollapsibleSubsection } from '../shared/CollapsibleSubsection';
import { RoadsSection } from './RoadsSection';
import { isBiomeMode, isCityFactionMode } from '../shared/guards';
import { NumberField } from '../shared/NumberField';
import { DistanceField } from '../shared/DistanceField';
import { NestedContentEditor } from '../shared/NestedContentEditor';
import { ValueBadge } from '../shared/ValueBadge';

interface ZoneInspectorProps {
  zone: Zone;
  zones: Zone[];
  factions: Faction[];
  actions: EditorActions;
  t: TranslationFunction;
  language: 'ru' | 'en';
}

/** Common starting-building sets from the official templates. */
const CONSTRUCTION_OPTIONS: Array<{ sid: string; labelKey: string }> = [
  { sid: 'poor_buildings_construction', labelKey: 'constructionPoor' },
  { sid: 'default_buildings_construction', labelKey: 'constructionDefault' },
  { sid: 'medium_buildings_construction', labelKey: 'constructionMedium' },
  { sid: 'rich_buildings_construction', labelKey: 'constructionRich' },
  { sid: 'extra_rich_buildings_construction', labelKey: 'constructionExtraRich' },
  { sid: 'arcade_buildings_construction', labelKey: 'constructionArcade' }
];

/** Small uppercase section header matching the map-settings subsections. */
/**
 * One zone pool slot (guarded/unguarded/resources): a list of pool names with
 * an add select and a reset back to the type-based "Auto" reference.
 */
const PoolRefsEditor: React.FC<{
  label: string;
  autoName: string;
  refs: string[] | undefined;
  poolNames: string[];
  t: TranslationFunction;
  onChange: (refs: string[] | undefined) => void;
}> = ({ label, autoName, refs, poolNames, t, onChange }) => (
  <div style={{ display: 'grid', gap: '4px' }}>
    <span className="control-label">{label}</span>
    {refs === undefined ? (
      <p className="ui-field-hint" style={{ margin: 0 }}>{t('zonePoolAuto', { name: autoName })}</p>
    ) : (
      <>
        {refs.map((ref) => (
          <div
            key={ref}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--panel-2)',
              border: '1px solid var(--line)'
            }}
          >
            <span title={ref} style={{ flex: 1, minWidth: 0, fontSize: 'var(--fz-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ref}
            </span>
            <button
              type="button"
              className="compact-button danger"
              title={t('zonePoolRemove')}
              style={{ flexShrink: 0 }}
              onClick={() => onChange(refs.filter((name) => name !== ref))}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="small-button"
          style={{ justifyContent: 'center' }}
          onClick={() => onChange(undefined)}
        >
          {t('zonePoolReset')}
        </button>
      </>
    )}
    <select
      value=""
      onChange={(e) => {
        const name = e.target.value;
        if (!name) return;
        const current = refs ?? [];
        if (!current.includes(name)) onChange([...current, name]);
      }}
    >
      <option value="">{t('zonePoolAddPlaceholder')}</option>
      {poolNames
        .filter((name) => !(refs ?? []).includes(name))
        .map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
    </select>
  </div>
);

/** The frequent official placementArgs sets for Uniform/Center. */
const PLACEMENT_ARG_PRESETS: Array<{ value: string; labelKey: string }> = [
  { value: 'true,0.7,0', labelKey: 'placementArgsPresetSpawn' },
  { value: 'true,0.8,2', labelKey: 'placementArgsPresetCity' },
  { value: 'false,-0.8,4', labelKey: 'placementArgsPresetEdge' },
  { value: 'true,0,0', labelKey: 'placementArgsPresetCenter' }
];

/**
 * placement/placementArgs of a main object. Uniform/Center take three
 * stringified args (the first anchors to the zone center per the game code);
 * Connection/NearZone reference a connection or zone by name.
 */
const PlacementEditor: React.FC<{
  obj: ZoneMainObject;
  zone: Zone;
  zones: Zone[];
  edges: Edge[];
  t: TranslationFunction;
  onChange: (updates: Partial<ZoneMainObject>) => void;
}> = ({ obj, zone, zones, edges, t, onChange }) => {
  const args = obj.placementArgs;
  const zoneEdges = edges.filter((e) => e.from === zone.id || e.to === zone.id);
  const otherZones = zones.filter((z) => z.id !== zone.id);
  // Keeps the select on «Вручную» even when hand-edited values happen to
  // match a preset, so the manual fields don't disappear mid-edit.
  const [manualArgs, setManualArgs] = React.useState(false);
  // Official templates sometimes carry uniform-style args with no placement
  // field, so the args editor follows the args rather than the mode alone.
  const isUniformLike = obj.placement === 'Uniform' || obj.placement === 'Center' ||
    (obj.placement === undefined && args !== undefined);

  const handleMode = (value: string) => {
    if (value === '') {
      onChange({ placement: undefined, placementArgs: undefined });
    } else if (value === 'Connection') {
      onChange({ placement: 'Connection', placementArgs: [zoneEdges[0]?.id ?? ''] });
    } else if (value === 'NearZone') {
      onChange({ placement: 'NearZone', placementArgs: [otherZones[0]?.id ?? ''] });
    } else if (value === 'Uniform' || value === 'Center') {
      // Uniform-style args survive switching between the two modes.
      onChange({
        placement: value as MainObjectPlacement,
        placementArgs: args && args.length === 3 ? args : undefined
      });
    }
  };

  const argsKey = args ? args.join(',') : '';
  const presetMatch = PLACEMENT_ARG_PRESETS.find((preset) => preset.value === argsKey);
  const argsSelectValue = manualArgs
    ? 'custom'
    : args === undefined ? 'auto' : presetMatch ? presetMatch.value : 'custom';

  const setArg = (index: number, value: string) => {
    const next = [...(args ?? [])];
    next[index] = value;
    onChange({ placementArgs: next });
  };

  return (
    <div style={{ display: 'grid', gap: '8px', padding: '6px 8px 10px' }}>
      <Field label={t('placementMode')}>
        <select value={obj.placement ?? ''} onChange={(e) => handleMode(e.target.value)}>
          <option value="">{t('placementAuto')}</option>
          <option value="Uniform">{t('placementUniform')}</option>
          <option value="Center">{t('placementCenter')}</option>
          <option value="Connection">{t('placementConnection')}</option>
          <option value="NearZone">{t('placementNearZone')}</option>
        </select>
      </Field>

      {isUniformLike && (
        <>
          <Field label={t('placementArgsLabel')}>
            <select
              value={argsSelectValue}
              onChange={(e) => {
                if (e.target.value === 'auto') {
                  setManualArgs(false);
                  onChange({ placementArgs: undefined });
                } else if (e.target.value === 'custom') {
                  setManualArgs(true);
                  if (!args || args.length !== 3) {
                    onChange({ placementArgs: ['true', '0.7', '0'] });
                  }
                } else {
                  setManualArgs(false);
                  onChange({ placementArgs: e.target.value.split(',') });
                }
              }}
            >
              <option value="auto">{t('placementArgsAuto')}</option>
              {PLACEMENT_ARG_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{t(preset.labelKey)}</option>
              ))}
              <option value="custom">{t('placementArgsCustom')}</option>
            </select>
          </Field>
          {argsSelectValue === 'custom' && args && args.length === 3 && (
            <>
              <Toggle
                checked={args[0] === 'true'}
                onChange={(checked) => setArg(0, String(checked))}
                label={t('placementArgCenter')}
              />
              <FieldRow>
                <Field label={t('placementArgBias')}>
                  <NumberField
                    min={-1}
                    max={1}
                    step={0.1}
                    value={Number(args[1]) || 0}
                    onCommit={(v) => setArg(1, String(v))}
                  />
                </Field>
                <Field label={t('placementArgExtra')}>
                  <NumberField
                    min={0}
                    step={1}
                    value={Number(args[2]) || 0}
                    onCommit={(v) => setArg(2, String(v))}
                  />
                </Field>
              </FieldRow>
            </>
          )}
        </>
      )}

      {obj.placement === 'Connection' && (
        <Field label={t('placementConnectionLabel')}>
          <select
            value={args?.[0] ?? ''}
            onChange={(e) => onChange({ placementArgs: [e.target.value] })}
          >
            <option value="">{t('placementPickConnection')}</option>
            {args?.[0] && !zoneEdges.some((e) => e.id === args[0]) && (
              <option value={args[0]}>{args[0]} (?)</option>
            )}
            {zoneEdges.map((e) => (
              <option key={e.id} value={e.id}>{e.from} ↔ {e.to}</option>
            ))}
          </select>
        </Field>
      )}

      {obj.placement === 'NearZone' && (
        <Field label={t('placementNearZoneLabel')}>
          <select
            value={args?.[0] ?? ''}
            onChange={(e) => onChange({ placementArgs: [e.target.value] })}
          >
            <option value="">{t('placementPickZone')}</option>
            {args?.[0] && !otherZones.some((z) => z.id === args[0]) && (
              <option value={args[0]}>{args[0]} (?)</option>
            )}
            {otherZones.map((z) => (
              <option key={z.id} value={z.id}>{z.id}</option>
            ))}
          </select>
        </Field>
      )}

      <p className="ui-field-hint" style={{ margin: 0 }}>{t('placementHelp')}</p>
    </div>
  );
};

export const ZoneInspector: React.FC<ZoneInspectorProps> = ({ zone, zones, factions, actions, t, language }) => {
  const presets = useEditorStore((state) => state.presets);
  const settings = useEditorStore((state) => state.settings);
  const edges = useEditorStore((state) => state.edges);
  const isExpert = useEditorStore((state) => state.uiMode) === 'expert';
  const hasTown = (zone.mainObjects || []).length > 0;
  
  const biomeStartZones = zones.filter((z) => (z.type === 'spawn' || z.type === 'custom') && z.id !== zone.id);
  const cityStartOptions = zones.filter((z) => z.type === 'spawn' || z.type === 'custom');

  // Only one arena object per map: the gladiator-arena mode expects a single
  // arena (official templates never place more than one).
  const arenaExists = zones.some((z) => (z.mainObjects || []).some((mo) => mo.type === 'GladiatorArena'));

  // The terrain profile the exporter falls back to when none is selected.
  const zoneBaseType = presets[zone.type]?.baseType || zone.type;
  const autoLayoutName = zoneTypes[zoneBaseType as keyof typeof zoneTypes]?.layout || zoneTypes.neutral.layout;
  // Same fallback contract for content limits and pools.
  const zoneHasSpawn = zoneBaseType === 'spawn' || (zone.mainObjects || []).some((mo) => mo.type === 'Spawn');
  const autoLimitName = zoneHasSpawn ? 'content_limits_spawn' : 'content_limits_side';
  const poolTier = zoneHasSpawn
    ? 'start'
    : ['low', 'medium', 'high'].includes(zoneBaseType) ? zoneBaseType : 'low';
  const poolNames = settings.contentPoolPresets.map((pool) => pool.name);

  // Compute used players across all zones
  const usedPlayers = new Set<number>();
  zones.forEach(z => {
    (z.mainObjects || []).forEach(mo => {
      if (mo.type === 'Spawn' && typeof mo.player === 'number') {
        usedPlayers.add(mo.player);
      }
    });
  });

  const handleFieldChange = <K extends keyof Zone>(field: K, value: Zone[K]) => {
    if (field === 'type') {
      if (value !== 'custom') {
        const confirmMsg = t('confirmPresetChange') || "Changing the preset will overwrite all current objects and value distributions in this zone. Do you want to proceed?";
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }
    }
    actions.updateZoneField(zone.id, fieldUpdate<Zone, K>(field, value));
  };

  const handleSaveAsPreset = () => {
    const defaultName = `Preset-${zone.id}`;
    const name = window.prompt(t('saveAsPresetPrompt') || "Введите название для нового пресета:", defaultName);
    if (name === null) return;
    const finalName = name.trim() || defaultName;
    actions.saveZoneAsPreset(zone.id, finalName);
  };

  const handleObjectFieldChange = <K extends keyof ZoneObject>(
    objectKey: string,
    field: K,
    value: ZoneObject[K]
  ) => {
    actions.updateObjectField(
      zone.id,
      objectKey,
      fieldUpdate<ZoneObject, K>(field, value)
    );
  };

  const handleRemoveObject = (objectKey: string) => {
    actions.removeObjectFromZone(zone.id, objectKey);
  };

  const handleUpdateMainObject = (key: string, updates: Partial<ZoneMainObject>) => {
    const nextList = (zone.mainObjects || []).map(obj => 
      obj.key === key ? { ...obj, ...updates } : obj
    );
    actions.updateZoneField(zone.id, { mainObjects: nextList });
  };

  const handleToggleSpawn = (objKey: string, isSpawnVal: boolean) => {
    if (isSpawnVal) {
      // Find first unused player number
      let firstUnused = 1;
      for (let i = 1; i <= settings.players; i++) {
        if (!usedPlayers.has(i)) {
          firstUnused = i;
          break;
        }
      }
      handleUpdateMainObject(objKey, {
        type: 'Spawn',
        player: firstUnused,
        factionMode: 'random',
        factionSource: '',
        factionId: factions[0]?.id || ''
      });
    } else {
      handleUpdateMainObject(objKey, {
        type: 'City',
        player: null,
        factionMode: 'random',
        factionSource: '',
        factionId: factions[0]?.id || '',
        holdCityWinCon: false
      });
    }
  };

  const handleAddMainObject = (type: MainObjectType) => {
    const nextList = [...(zone.mainObjects || [])];
    const uuid = uniqueKey();
    if (type === 'Spawn') {
      nextList.push(makeDefaultSpawnObject(nextPlayerNumber(zones), factions[0]?.id || ''));
    } else if (type === 'GladiatorArena') {
      // The arena ships without a building set or guards, matching the
      // minimal official sample.
      nextList.push({
        key: uuid,
        type,
        factionMode: 'random',
        factionSource: '',
        factionId: factions[0]?.id || '',
        holdCityWinCon: false,
        placement: 'Uniform',
        placementArgs: ['true', '0', '0']
      });
    } else {
      nextList.push({
        key: uuid,
        type,
        factionMode: 'random',
        factionSource: '',
        factionId: factions[0]?.id || '',
        holdCityWinCon: false,
        buildingsConstructionSid: 'poor_buildings_construction',
        guardValue: 40000,
        guardChance: 1,
        guardWeeklyIncrement: 0.1,
        placement: 'Uniform',
        placementArgs: ['true', '0.8', '2']
      });
    }
    actions.updateZoneField(zone.id, { mainObjects: nextList });
  };

  const handleRemoveMainObject = (key: string) => {
    const nextList = (zone.mainObjects || []).filter(obj => obj.key !== key);
    actions.updateZoneField(zone.id, { mainObjects: nextList });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Field label={t('zoneId')}>
        <input
          type="text"
          value={zone.id}
          onChange={(e) => handleFieldChange('id', e.target.value)}
        />
      </Field>
      
      <Field label={t('zoneLabel')}>
        <input
          type="text"
          value={zone.label}
          onChange={(e) => handleFieldChange('label', e.target.value)}
        />
      </Field>
      
      <Field label={t('zoneType')}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
          <select
            value={zone.type}
            onChange={(e) => handleFieldChange('type', e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="custom">
              {t('customZoneType') || 'Custom (no preset)'}
            </option>
            {Object.values(presets).map((p) => {
              const displayLabel = p.isCustom 
                ? p.label 
                : t(`zoneTypeOption${p.id.charAt(0).toUpperCase() + p.id.slice(1)}`) || p.label;
              return (
                <option key={p.id} value={p.id}>
                  {displayLabel}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="small-button"
            onClick={handleSaveAsPreset}
            title={t('saveAsPresetTitle') || 'Сохранить как пресет'}
            style={{ padding: '6px 8px', height: '34px', flexShrink: 0, justifyContent: 'center' }}
          >
            <Save size={14} />
          </button>
        </div>
      </Field>
      
      <CollapsibleSubsection id={`zone.values.${zone.id}`} title={t('zoneValuesSection')} icon={<Coins size={12} style={{ color: 'var(--accent)' }} />} defaultOpen>
      <FieldRow>
        <Field label={<>{t('guarded')}<ValueBadge kind="zoneGuarded" value={zone.guardedValue} /></>}>
          <NumberField
            min={0}
            step={1000}
            value={zone.guardedValue}
            onCommit={(v) => handleFieldChange('guardedValue', v)}
          />
        </Field>
        <Field label={<>{t('unguarded')}<ValueBadge kind="zoneUnguarded" value={zone.unguardedValue} /></>}>
          <NumberField
            min={0}
            step={1000}
            value={zone.unguardedValue}
            onCommit={(v) => handleFieldChange('unguardedValue', v)}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={<>{t('resources')}<ValueBadge kind="zoneResources" value={zone.resourcesValue} /></>}>
          <NumberField
            min={0}
            step={1000}
            value={zone.resourcesValue}
            onCommit={(v) => handleFieldChange('resourcesValue', v)}
          />
        </Field>
        <Field label={t('zoneSize')}>
          <NumberField
            min={0.25}
            max={4}
            step={0.25}
            value={zone.size}
            onCommit={(v) => handleFieldChange('size', v)}
          />
        </Field>
      </FieldRow>

      {presets[zone.type] && (
        <>
          <button
            type="button"
            className="small-button"
            style={{ justifySelf: 'start' }}
            title={t('rescaleZoneTooltip')}
            onClick={() => actions.rescaleZoneValues(zone.id)}
          >
            {t('rescaleZone', {
              scale: zoneContentScale(settings.sizeX, settings.sizeZ, zones.length, zone.size).toFixed(2)
            })}
          </button>
        </>
      )}

      {isExpert && (
      <>
        <div className="control-label" style={{ marginTop: '4px' }}>{t('zonePerAreaSection')} <InfoTip text={t('zonePerAreaHelp')} /></div>
        <FieldRow>
          <Field label={t('guarded')}>
            <NumberField
              min={0}
              step={100}
              value={zone.guardedValuePerArea ?? 0}
              onCommit={(v) => handleFieldChange('guardedValuePerArea', v || undefined)}
            />
          </Field>
          <Field label={t('unguarded')}>
            <NumberField
              min={0}
              step={50}
              value={zone.unguardedValuePerArea ?? 0}
              onCommit={(v) => handleFieldChange('unguardedValuePerArea', v || undefined)}
            />
          </Field>
        </FieldRow>
        <Field label={t('resources')}>
          <NumberField
            min={0}
            step={50}
            value={zone.resourcesValuePerArea ?? 0}
            onCommit={(v) => handleFieldChange('resourcesValuePerArea', v || undefined)}
          />
        </Field>
      </>
      )}
      </CollapsibleSubsection>

      {isExpert && (
      <>
      <CollapsibleSubsection id={`zone.terrain.${zone.id}`} title={t('zoneTerrainLimitsSection')} icon={<Mountain size={12} style={{ color: 'var(--accent)' }} />} defaultOpen>
      <Field label={t('zoneTerrainProfile')} tip={t('zoneTerrainProfileHelp')}>
        <select
          value={zone.layout ?? ''}
          onChange={(e) => handleFieldChange('layout', e.target.value || undefined)}
        >
          <option value="">{t('terrainProfileAuto', { name: autoLayoutName })}</option>
          {zone.layout && !settings.terrainProfiles.some((profile) => profile.name === zone.layout) && (
            <option value={zone.layout}>{zone.layout} ({t('terrainProfileMissingMark')})</option>
          )}
          {settings.terrainProfiles.map((profile) => (
            <option key={profile.name} value={profile.name}>{profile.name}</option>
          ))}
        </select>
      </Field>

      {/* Content-limit preset references */}
      <div style={{ display: 'grid', gap: '4px' }}>
        <span className="control-label">{t('zoneContentLimits')}</span>
        {zone.contentCountLimits === undefined ? (
          <p className="ui-field-hint" style={{ margin: 0 }}>
            {t('zoneContentLimitsAuto', { name: autoLimitName })}
          </p>
        ) : (
          <>
            {zone.contentCountLimits.map((ref) => {
              const missing = !settings.contentLimitPresets.some((preset) => preset.name === ref) &&
                ref !== 'content_limits_spawn' && ref !== 'content_limits_side';
              return (
                <div
                  key={ref}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--line)'
                  }}
                >
                  <span title={ref} style={{ flex: 1, minWidth: 0, fontSize: 'var(--fz-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ref}{missing ? ` (${t('terrainProfileMissingMark')})` : ''}
                  </span>
                  <button
                    type="button"
                    className="compact-button danger"
                    title={t('zoneContentLimitsRemove')}
                    style={{ flexShrink: 0 }}
                    onClick={() => handleFieldChange('contentCountLimits', zone.contentCountLimits!.filter((name) => name !== ref))}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="small-button"
              style={{ justifyContent: 'center' }}
              onClick={() => handleFieldChange('contentCountLimits', undefined)}
            >
              {t('zoneContentLimitsReset')}
            </button>
          </>
        )}
        <select
          value=""
          onChange={(e) => {
            const name = e.target.value;
            if (!name) return;
            const current = zone.contentCountLimits ?? [autoLimitName];
            if (!current.includes(name)) {
              handleFieldChange('contentCountLimits', [...current, name]);
            }
          }}
        >
          <option value="">{t('zoneContentLimitsAddPlaceholder')}</option>
          {settings.contentLimitPresets
            .filter((preset) => !(zone.contentCountLimits ?? [autoLimitName]).includes(preset.name))
            .map((preset) => (
              <option key={preset.name} value={preset.name}>{preset.name}</option>
            ))}
        </select>
        <p className="ui-field-hint" style={{ margin: 0 }}>{t('zoneContentLimitsHelp')}</p>
      </div>
      </CollapsibleSubsection>

      {/* Content pool references */}
      <CollapsibleSubsection id={`zone.pools.${zone.id}`} title={t('zonePoolsSection')} icon={<Package size={12} style={{ color: 'var(--accent)' }} />} tip={t('zonePoolsHelp')} defaultOpen={false}>
        <PoolRefsEditor
          label={t('zonePoolGuarded')}
          autoName={`visual_pool_guarded_${poolTier}`}
          refs={zone.guardedContentPool}
          poolNames={poolNames}
          t={t}
          onChange={(refs) => handleFieldChange('guardedContentPool', refs)}
        />
        <PoolRefsEditor
          label={t('zonePoolUnguarded')}
          autoName={`visual_pool_unguarded_${poolTier}`}
          refs={zone.unguardedContentPool}
          poolNames={poolNames}
          t={t}
          onChange={(refs) => handleFieldChange('unguardedContentPool', refs)}
        />
        <PoolRefsEditor
          label={t('zonePoolResources')}
          autoName={zoneHasSpawn ? 'content_pool_general_resources_start_zone_poor' : 'content_pool_general_resources_side_zone_poor'}
          refs={zone.resourcesContentPool}
          poolNames={poolNames}
          t={t}
          onChange={(refs) => handleFieldChange('resourcesContentPool', refs)}
        />
      </CollapsibleSubsection>

      {/* Guard & neutrals tuning. Deliberately NOT list-content-entry: its
          display:grid summary rule would push the chevron onto a second row. */}
      <CollapsibleSubsection id={`zone.guard.${zone.id}`} title={t('zoneGuardSection')} icon={<Shield size={12} style={{ color: 'var(--accent)' }} />} tip={t('zoneGuardMainHelp')} defaultOpen={false}>
              <GuardReactionEditor
                key={zone.id}
                value={zone.guardReactionDistribution}
                t={t}
                onChange={(value) => handleFieldChange('guardReactionDistribution', value)}
              />

              <FieldRow>
                <Field label={<>{t('zoneGuardMultiplier')}<ValueBadge kind="guardMultiplier" value={zone.guardMultiplier ?? 1.4} /></>}>
                  <NumberField
                    min={0}
                    max={10}
                    step={0.05}
                    value={zone.guardMultiplier ?? 1.4}
                    onCommit={(v) => handleFieldChange('guardMultiplier', v)}
                  />
                </Field>
                <Field label={t('zoneDiplomacy')}>
                  <NumberField
                    min={-1}
                    max={1}
                    step={0.05}
                    value={zone.diplomacyModifier ?? -0.25}
                    onCommit={(v) => handleFieldChange('diplomacyModifier', v)}
                  />
                </Field>
              </FieldRow>

              <FieldRow>
                <Field label={t('zoneGuardCutoff')}>
                  <NumberField
                    min={0}
                    step={250}
                    value={zone.guardCutoffValue ?? 1500}
                    onCommit={(v) => handleFieldChange('guardCutoffValue', v)}
                  />
                </Field>
                <Field label={t('guardWeeklyIncrement')}>
                  <NumberField
                    min={0}
                    max={1}
                    step={0.05}
                    value={zone.guardWeeklyIncrement ?? 0.15}
                    onCommit={(v) => handleFieldChange('guardWeeklyIncrement', v)}
                  />
                </Field>
              </FieldRow>
              <Field label={t('guardRandomization')}>
                <NumberField
                  min={0}
                  max={1}
                  step={0.05}
                  value={zone.guardRandomization ?? 0.25}
                  onCommit={(v) => handleFieldChange('guardRandomization', v)}
                />
              </Field>
              <p className="ui-field-hint" style={{ margin: 0 }}>{t('zoneGuardExtraHelp')}</p>

              <Toggle
                checked={Boolean(zone.encounterHolesSettings)}
                onChange={(checked) => handleFieldChange(
                  'encounterHolesSettings',
                  checked ? { affectedEncounters: 0.66, twoHoleEncounters: 0.66 } : undefined
                )}
                label={t('zoneHolesToggle')}
              />
              {zone.encounterHolesSettings && (
                <FieldRow>
                  <Field label={t('zoneHolesAffected')}>
                    <NumberField
                      min={0}
                      max={1}
                      step={0.05}
                      value={zone.encounterHolesSettings.affectedEncounters}
                      onCommit={(v) => handleFieldChange('encounterHolesSettings', {
                        ...zone.encounterHolesSettings!,
                        affectedEncounters: v
                      })}
                    />
                  </Field>
                  <Field label={t('zoneHolesTwo')}>
                    <NumberField
                      min={0}
                      max={1}
                      step={0.05}
                      value={zone.encounterHolesSettings.twoHoleEncounters}
                      onCommit={(v) => handleFieldChange('encounterHolesSettings', {
                        ...zone.encounterHolesSettings!,
                        twoHoleEncounters: v
                      })}
                    />
                  </Field>
                </FieldRow>
              )}
              <p className="ui-field-hint" style={{ margin: 0 }}>{t('zoneHolesHelp')}</p>
      </CollapsibleSubsection>
      </>
      )}

      {isExpert && (
        zone.randomHireInitialUnitIncrement !== undefined ||
        zone.randomHireEnableWeeklyUnitIncrement !== undefined ||
        zone.objects.some((o) =>
          Boolean(o.includeList?.includes('random_hire')) ||
          Boolean(o.rawIncludeLists?.some((list) => list.includes('random_hire'))) ||
          Boolean(o.sid?.includes('random_hire')))
      ) && (
        <CollapsibleSubsection id={`zone.randomHire.${zone.id}`} title={t('zoneRandomHireSection')} icon={<Users size={12} style={{ color: 'var(--accent)' }} />} tip={t('zoneRandomHireHelp')} defaultOpen={false}>
          {(() => {
            const TIERS = 7;
            const init = zone.randomHireInitialUnitIncrement ?? Array(TIERS).fill(0);
            const weekly = zone.randomHireEnableWeeklyUnitIncrement ?? Array(TIERS).fill(false);
            const rows = Math.max(TIERS, init.length, weekly.length);
            const setInit = (i: number, v: number) => {
              const next = [...(zone.randomHireInitialUnitIncrement ?? Array(rows).fill(0))];
              next[i] = v;
              handleFieldChange('randomHireInitialUnitIncrement', next);
            };
            const setWeekly = (i: number, v: boolean) => {
              const next = [...(zone.randomHireEnableWeeklyUnitIncrement ?? Array(rows).fill(false))];
              next[i] = v;
              handleFieldChange('randomHireEnableWeeklyUnitIncrement', next);
            };
            const headerCell: React.CSSProperties = { fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', textTransform: 'uppercase', letterSpacing: '0.03em' };
            return (
              <div style={{ display: 'grid', gap: '8px', padding: '6px 8px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: '4px 10px', alignItems: 'center' }}>
                  <span style={headerCell}>{t('zoneRandomHireTierHeader')}</span>
                  <span style={headerCell}>{t('zoneRandomHireInitial')}</span>
                  <span style={headerCell} title={t('zoneRandomHireWeeklyHelp')}>{t('zoneRandomHireWeekly')}</span>
                  {Array.from({ length: rows }, (_, i) => (
                    <React.Fragment key={i}>
                      <span style={{ fontSize: 'var(--fz-base)' }}>{i + 1}</span>
                      <NumberField min={0} value={Number(init[i]) || 0} onCommit={(v) => setInit(i, v)} />
                      <input
                        type="checkbox"
                        title={t('zoneRandomHireWeeklyHelp')}
                        checked={Boolean(weekly[i])}
                        onChange={(e) => setWeekly(i, e.target.checked)}
                        style={{ justifySelf: 'center' }}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </CollapsibleSubsection>
      )}

      {/* Castle Section */}
      <CollapsibleSubsection id={`zone.castles.${zone.id}`} title={t('zoneCity')} icon={<Castle size={12} style={{ color: 'var(--accent)' }} />} defaultOpen>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => handleAddMainObject('City')}
            style={{ flex: 1, padding: '6px 8px', fontSize: 'var(--fz-base)' }}
          >
            + {t('addCity')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => handleAddMainObject('AbandonedOutpost')}
            title={t('addOutpostTooltip')}
            style={{ flex: 1, padding: '6px 8px', fontSize: 'var(--fz-base)' }}
          >
            + {t('addOutpost')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={arenaExists}
            onClick={() => handleAddMainObject('GladiatorArena')}
            title={arenaExists ? t('addArenaLimitTooltip') : t('addArenaTooltip')}
            style={{ flex: 1, padding: '6px 8px', fontSize: 'var(--fz-base)', opacity: arenaExists ? 0.5 : 1, cursor: arenaExists ? 'not-allowed' : 'pointer' }}
          >
            + {t('addArena')}
          </button>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {(zone.mainObjects || []).map((obj, idx) => {
            const isSpawnObj = obj.type === 'Spawn';
            const isCity = obj.type === 'City';
            const isOutpost = obj.type === 'AbandonedOutpost';
            const isArena = obj.type === 'GladiatorArena';
            const isCityHoldWinCon = settings.victoryMode === 'cityHold';
            const cardTitle = isOutpost ? t('zoneOutpost') : isArena ? t('zoneArena') : t('zoneCity');

            // Find available players for this starting position select dropdown
            const availablePlayersForObject: number[] = [];
            for (let pNum = 1; pNum <= settings.players; pNum++) {
              if (pNum === obj.player || !usedPlayers.has(pNum)) {
                availablePlayersForObject.push(pNum);
              }
            }

            // Disable starting zone checkbox if not checked and no player numbers are left
            const isSpawnCheckboxDisabled = !isSpawnObj && usedPlayers.size >= settings.players;

            // Collapsed-card summary pills (owner / faction) so a list of
            // castles stays scannable without expanding each one.
            const factionModeLabel = obj.factionMode === 'spawn'
              ? t('cityFactionSpawn')
              : obj.factionMode === 'specific'
                ? t('cityFactionSpecific')
                : t('cityFactionRandom');
            const cardMeta = (
              <>
                {isSpawnObj && obj.player ? <Badge tone="neutral">{t('playerNumber', { num: obj.player })}</Badge> : null}
                {isCity ? <Badge tone="neutral">{obj.owner ? t('playerNumber', { num: obj.owner }) : t('cityOwnerNeutral')}</Badge> : null}
                {(isCity || isOutpost) ? <Badge tone="neutral">{factionModeLabel}</Badge> : null}
              </>
            );

            return (
              <Card
                key={obj.key || idx}
                id={`zoneobj.${zone.id}.${obj.key || idx}`}
                defaultOpen
                title={`${cardTitle} #${idx + 1}${isSpawnObj ? ` (${t('startingZoneCheckbox') || 'Стартовый'})` : ''}`}
                meta={cardMeta}
                actions={
                  <button
                    type="button"
                    onClick={() => handleRemoveMainObject(obj.key)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: 'var(--fz-caption)'
                    }}
                  >
                    {t('remove')}
                  </button>
                }
              >

                {(isSpawnObj || isCity) && (
                <Toggle
                  checked={isSpawnObj}
                  disabled={isSpawnCheckboxDisabled}
                  onChange={(checked) => handleToggleSpawn(obj.key, checked)}
                  title={isSpawnCheckboxDisabled ? t('startingZoneLimitReachedTooltip') : undefined}
                  label={t('startingZoneCheckbox') || 'Стартовая позиция (замок игрока)'}
                />
                )}

                {isArena && (
                  <p className="ui-field-hint" style={{ margin: 0 }}>{t('arenaCardHelp')}</p>
                )}

                {isSpawnObj && (
                  <Field label={t('player') || 'Игрок'}>
                    <select
                      value={obj.player || ''}
                      onChange={(e) => handleUpdateMainObject(obj.key, { player: Number(e.target.value) })}
                    >
                      {availablePlayersForObject.map(pNum => (
                        <option key={pNum} value={pNum}>
                          {t('playerNumber', { num: pNum })}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                {(isCity || isOutpost) && (
                  <>
                    {isCity && (
                      <Field label={t('cityOwner')}>
                        <select
                          value={obj.owner || ''}
                          onChange={(e) => handleUpdateMainObject(obj.key, { owner: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">{t('cityOwnerNeutral')}</option>
                          {Array.from({ length: settings.players }, (_, i) => i + 1).map(pNum => (
                            <option key={pNum} value={pNum}>{t('playerNumber', { num: pNum })}</option>
                          ))}
                        </select>
                      </Field>
                    )}

                    <Field label={isOutpost ? t('outpostFaction') : t('cityFactionMode')}>
                      <select
                        value={obj.factionMode}
                        onChange={(e) => {
                          if (isCityFactionMode(e.target.value)) {
                            // Switching mode drops any imported FromList constraint.
                            handleUpdateMainObject(obj.key, { factionMode: e.target.value, factionFromList: undefined });
                          }
                        }}
                      >
                        <option value="random">{t('cityFactionRandom')}</option>
                        <option value="spawn">{t('cityFactionSpawn')}</option>
                        <option value="specific">{t('cityFactionSpecific')}</option>
                      </select>
                    </Field>

                    {obj.factionMode === 'random' && obj.factionFromList && obj.factionFromList.length > 0 && (
                      <p className="ui-field-hint" style={{ marginTop: '-6px' }}>
                        {t('cityFactionConstrained')}: {obj.factionFromList.join(', ')}
                      </p>
                    )}

                    {obj.factionMode === 'spawn' && (
                      <Field label={t('citySpawnSource')}>
                        <select
                          value={obj.factionSource || ''}
                          onChange={(e) => handleUpdateMainObject(obj.key, { factionSource: e.target.value })}
                        >
                          <option value="">{t('selectSpawnSource')}</option>
                          {cityStartOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.id}</option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {obj.factionMode === 'specific' && (
                      <Field label={t('citySpecificFaction')}>
                        <select
                          value={obj.factionId || ''}
                          onChange={(e) => handleUpdateMainObject(obj.key, { factionId: e.target.value })}
                        >
                          <option value="">{t('selectSpecificFaction')}</option>
                          {factions.map((fac) => (
                            <option key={fac.id} value={fac.id}>
                              {fac.labelByLang?.[language] || fac.label} ({fac.id})
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}

                    {isCity && isCityHoldWinCon && (
                      <Toggle
                        checked={Boolean(obj.holdCityWinCon)}
                        onChange={(checked) => handleUpdateMainObject(obj.key, { holdCityWinCon: checked })}
                        label={t('victoryCityWinConLabel')}
                      />
                    )}
                  </>
                )}

                {!isArena && (
                  <Field label={t('constructionLabel')}>
                    <select
                      value={obj.buildingsConstructionSid ?? ''}
                      onChange={(e) => handleUpdateMainObject(obj.key, { buildingsConstructionSid: e.target.value || undefined })}
                    >
                      <option value="">{t('constructionAuto')}</option>
                      {obj.buildingsConstructionSid &&
                        !CONSTRUCTION_OPTIONS.some((option) => option.sid === obj.buildingsConstructionSid) && (
                          <option value={obj.buildingsConstructionSid}>
                            {t('constructionCustom')} ({obj.buildingsConstructionSid})
                          </option>
                        )}
                      {CONSTRUCTION_OPTIONS.map((option) => (
                        <option key={option.sid} value={option.sid}>{t(option.labelKey)}</option>
                      ))}
                    </select>
                  </Field>
                )}

                {isExpert && !isArena && (
                  <>
                    <Toggle
                      checked={Boolean(obj.enableWeeklyUnitIncrement)}
                      onChange={(checked) => handleUpdateMainObject(obj.key, { enableWeeklyUnitIncrement: checked ? true : undefined })}
                      label={t('objectWeeklyUnitIncrement')}
                    />
                    <Field label={t('objectInitialUnitIncrement')}>
                      <NumberField
                        min={0}
                        value={obj.initialUnitIncrement ?? 0}
                        onCommit={(v) => handleUpdateMainObject(obj.key, { initialUnitIncrement: v || undefined })}
                      />
                    </Field>
                    <p className="ui-field-hint object-field-help">{t('objectUnitIncrementHelp')}</p>
                  </>
                )}

                {isExpert && !isArena && (
                  <LazyDetails
                    className="inspector-subsection"
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--panel-2)',
                      marginTop: '2px',
                      overflow: 'hidden'
                    }}
                    summary={
                      <strong style={{ fontSize: 'var(--fz-base)' }}>
                        {t('objectGuardSection')}
                      </strong>
                    }
                    renderContent={() => (
                      <div style={{ display: 'grid', gap: '8px', padding: '6px 8px 10px' }}>
                        <FieldRow>
                          <Field label={<>{t('objectGuardValue')}<ValueBadge kind="guardStrength" value={obj.guardValue ?? 0} /></>}>
                            <NumberField
                              min={0}
                              step={1000}
                              value={obj.guardValue ?? 0}
                              onCommit={(v) => handleUpdateMainObject(obj.key, { guardValue: v })}
                            />
                          </Field>
                          <Field label={t('objectGuardChance')}>
                            <NumberField
                              min={0}
                              max={1}
                              step={0.1}
                              value={obj.guardChance ?? 1}
                              onCommit={(v) => handleUpdateMainObject(obj.key, { guardChance: v })}
                            />
                          </Field>
                        </FieldRow>
                        <FieldRow>
                          <Field label={t('guardWeeklyIncrement')}>
                            <NumberField
                              min={0}
                              max={1}
                              step={0.05}
                              value={obj.guardWeeklyIncrement ?? 0}
                              onCommit={(v) => handleUpdateMainObject(obj.key, { guardWeeklyIncrement: v })}
                            />
                          </Field>
                          <Field label={t('objectGuardRandomization')}>
                            <NumberField
                              min={0}
                              max={1}
                              step={0.05}
                              value={obj.guardRandomization ?? 0}
                              onCommit={(v) => handleUpdateMainObject(obj.key, { guardRandomization: v || undefined })}
                            />
                          </Field>
                        </FieldRow>
                        <Toggle
                          checked={Boolean(obj.removeGuardIfHasOwner)}
                          onChange={(checked) => handleUpdateMainObject(obj.key, { removeGuardIfHasOwner: checked ? true : undefined })}
                          label={t('removeGuardIfHasOwner')}
                        />
                        <Toggle
                          checked={Boolean(obj.isKeyObject)}
                          onChange={(checked) => handleUpdateMainObject(obj.key, { isKeyObject: checked ? true : undefined })}
                          label={t('objectIsKeyObject')}
                        />
                        <p className="ui-field-hint" style={{ margin: 0 }}>{t('objectGuardHelp')}</p>
                      </div>
                    )}
                  />
                )}

                {isExpert && (
                <LazyDetails
                  className="inspector-subsection"
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--panel-2)',
                    marginTop: '2px',
                    overflow: 'hidden'
                  }}
                  summary={
                    <strong style={{ fontSize: 'var(--fz-base)' }}>
                      {t('placementSection')}
                    </strong>
                  }
                  renderContent={() => (
                    <PlacementEditor
                      key={obj.key}
                      obj={obj}
                      zone={zone}
                      zones={zones}
                      edges={edges}
                      t={t}
                      onChange={(updates) => handleUpdateMainObject(obj.key, updates)}
                    />
                  )}
                />
                )}
              </Card>
            );
          })}
          {(zone.mainObjects || []).length === 0 && (
            <p className="ui-field-hint" style={{ textAlign: 'center', margin: '4px 0' }}>
              {t('noMainObjects')}
            </p>
          )}
        </div>
      </CollapsibleSubsection>

      {/* Roads Section */}
      <CollapsibleSubsection id={`zone.roads.${zone.id}`} title={t('zoneRoadsSection')} icon={<Spline size={12} style={{ color: 'var(--accent)' }} />} defaultOpen={false}>
        <RoadsSection zone={zone} edges={edges} />
      </CollapsibleSubsection>

      {/* Biome Section */}
      <CollapsibleSubsection id={`zone.biome.${zone.id}`} title={t('zoneBiome')} icon={<Leaf size={12} style={{ color: 'var(--accent)' }} />} tip={t('zoneBiomeHelp')} defaultOpen>
        <Field label={t('zoneBiomeMode')}>
          <select
            value={zone.biomeMode}
            onChange={(e) => {
              if (isBiomeMode(e.target.value)) {
                handleFieldChange('biomeMode', e.target.value);
              }
            }}
          >
            {hasTown && <option value="own">{t('zoneBiomeOwnCity')}</option>}
            <option value="random">{t('zoneBiomeRandom')}</option>
            {biomeStartZones.length > 0 && <option value="spawn">{t('zoneBiomeSpawn')}</option>}
            <option value="specific">{t('zoneBiomeSpecific')}</option>
          </select>
        </Field>

        {zone.biomeMode === 'spawn' && (
          <Field label={t('zoneBiomeSpawnSource')}>
            <select
              value={zone.biomeSource}
              onChange={(e) => handleFieldChange('biomeSource', e.target.value)}
            >
              <option value="">{t('selectSpawnSource')}</option>
              {biomeStartZones.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.id}</option>
              ))}
            </select>
          </Field>
        )}

        {zone.biomeMode === 'specific' && (
          <Field label={t('zoneBiomeSpecificValue')}>
            <select
              value={zone.biomeId}
              onChange={(e) => handleFieldChange('biomeId', e.target.value)}
            >
              {biomeIds.map((id) => (
                <option key={id} value={id}>
                  {t(`biome${id}`)} ({id})
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Content & meta-object biomes: 'land' (default) follows the ground */}
        {isExpert && ([
          ['zoneContentBiome', 'contentBiomeMode', 'contentBiomeSource', 'contentBiomeId'],
          ['zoneMetaBiome', 'metaBiomeMode', 'metaBiomeSource', 'metaBiomeId']
        ] as const).map(([labelKey, modeField, sourceField, idField]) => {
          const mode = zone[modeField] ?? 'land';
          return (
            <React.Fragment key={modeField}>
              <Field label={t(labelKey)}>
                <select
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value;
                    handleFieldChange(modeField, next === 'land' ? undefined : (next as Zone[typeof modeField]));
                  }}
                >
                  <option value="land">{t('biomeLand')}</option>
                  {hasTown && <option value="own">{t('zoneBiomeOwnCity')}</option>}
                  <option value="random">{t('zoneBiomeRandom')}</option>
                  {biomeStartZones.length > 0 && <option value="spawn">{t('zoneBiomeSpawn')}</option>}
                  <option value="specific">{t('zoneBiomeSpecific')}</option>
                </select>
              </Field>
              {mode === 'spawn' && (
                <Field label={t('zoneBiomeSpawnSource')}>
                  <select
                    value={zone[sourceField] || ''}
                    onChange={(e) => handleFieldChange(sourceField, e.target.value)}
                  >
                    <option value="">{t('selectSpawnSource')}</option>
                    {biomeStartZones.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.id}</option>
                    ))}
                  </select>
                </Field>
              )}
              {mode === 'specific' && (
                <Field label={t('zoneBiomeSpecificValue')}>
                  <select
                    value={zone[idField] || 'Grass'}
                    onChange={(e) => handleFieldChange(idField, e.target.value)}
                  >
                    {biomeIds.map((id) => (
                      <option key={id} value={id}>
                        {t(`biome${id}`)} ({id})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </React.Fragment>
          );
        })}
        {isExpert && <p className="ui-field-hint">{t('auxBiomeHelp')}</p>}
      </CollapsibleSubsection>

      {/* Objects list */}
      <CollapsibleSubsection id={`zone.objects.${zone.id}`} title={t('zoneObjects')} icon={<Boxes size={12} style={{ color: 'var(--accent)' }} />} tip={t('zoneObjectsMandatoryHelp')} defaultOpen>
        <div className="object-list">
          {zone.objects.map((obj) => {
            const label = obj.labelByLang?.[language] || obj.label || obj.sid || obj.includeList || obj.id || '';
            const guardStr = obj.guarded === undefined ? t('objectGuardDefaultShort') : obj.guarded ? t('guardedShort') : t('unguardedShort');
            const technicalId = obj.kind === 'list' ? obj.includeList : obj.sid || obj.id;
            const coreCatalog = useEditorStore.getState().coreCatalog;
            const catalogItem = coreCatalog 
              ? catalogItemForReference(useEditorStore.getState().objectLibrary, { kind: obj.kind, value: technicalId || '' }) 
              : null;
            const desc = obj.descriptionByLang?.[language] || obj.description || (catalogItem ? t('listDescription', { count: catalogItem.count || 0 }) : '');

            return (
              <Card
                key={obj.key}
                id={`zoneobj.${zone.id}.${obj.key}`}
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

                    {isExpert && obj.kind === 'list' && (
                      <LazyDetails
                        className="inspector-subsection"
                        style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-2)', marginBottom: '10px', overflow: 'hidden' }}
                        summary={<strong style={{ fontSize: 'var(--fz-base)' }}>{t('nestedContentSection')}{obj.nestedContent?.length ? ` (${obj.nestedContent.length})` : ''}</strong>}
                        renderContent={() => (
                          <div style={{ display: 'grid', gap: '6px', padding: '6px 8px 10px' }}>
                            <p className="ui-field-hint" style={{ margin: 0 }}>{t('nestedContentHelp')}</p>
                            <NestedContentEditor
                              value={obj.nestedContent}
                              onChange={(next) => handleObjectFieldChange(obj.key, 'nestedContent', next)}
                              t={t}
                              language={language}
                            />
                          </div>
                        )}
                      />
                    )}

                    <FieldRow>
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
                    <p className="ui-field-hint object-field-help">{t('objectVariantHelp')}</p>

                    {isExpert && (
                      <>
                        <Field label={t('objectName')}>
                          <input
                            type="text"
                            placeholder={t('objectNameAuto')}
                            value={obj.name ?? ''}
                            onChange={(e) => handleObjectFieldChange(obj.key, 'name', e.target.value.trim() || undefined)}
                          />
                        </Field>
                        <p className="ui-field-hint object-field-help">{t('objectNameHelp')}</p>

                        <Field label={t('objectOwner')}>
                          <select
                            value={obj.owner ?? ''}
                            onChange={(e) => handleObjectFieldChange(obj.key, 'owner', e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">{t('objectOwnerNeutral')}</option>
                            {Array.from({ length: settings.players }, (_, i) => i + 1).map(pNum => (
                              <option key={pNum} value={pNum}>{t('playerNumber', { num: pNum })}</option>
                            ))}
                          </select>
                        </Field>
                        <p className="ui-field-hint object-field-help">{t('objectOwnerHelp')}</p>
                      </>
                    )}

                    <Field label={t('objectGuardLabel')}>
                      <select
                        value={obj.guarded === undefined ? 'default' : obj.guarded ? 'guarded' : 'unguarded'}
                        onChange={(e) => handleObjectFieldChange(
                          obj.key,
                          'guarded',
                          e.target.value === 'default' ? undefined : e.target.value === 'guarded'
                        )}
                      >
                        <option value="default">{t('objectGuardDefault')}</option>
                        <option value="guarded">{t('objectGuardYes')}</option>
                        <option value="unguarded">{t('objectGuardNo')}</option>
                      </select>
                    </Field>
                    {obj.guarded === undefined && (
                      <p className="ui-field-hint object-field-help">{t('objectGuardDefaultHelp')}</p>
                    )}

                    <Toggle
                      checked={obj.soloEncounter}
                      onChange={(checked) => handleObjectFieldChange(obj.key, 'soloEncounter', checked)}
                      label={t('objectSoloEncounter')}
                    />
                    <p className="ui-field-hint object-field-help">{t('objectSoloEncounterHelp')}</p>

                    {isExpert && (
                      <>
                        <Field label={t('objectDesignatedEncounter')}>
                          <select
                            value={obj.designatedEncounter === undefined ? 'default' : obj.designatedEncounter ? 'on' : 'off'}
                            onChange={(e) => handleObjectFieldChange(
                              obj.key,
                              'designatedEncounter',
                              e.target.value === 'default' ? undefined : e.target.value === 'on'
                            )}
                          >
                            <option value="default">{t('objectDesignatedDefault')}</option>
                            <option value="on">{t('objectDesignatedOn')}</option>
                            <option value="off">{t('objectDesignatedOff')}</option>
                          </select>
                        </Field>
                        <p className="ui-field-hint object-field-help">{t('objectDesignatedEncounterHelp')}</p>
                      </>
                    )}

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
                      {hasTown ? t('objectPlacementHelp') : t('objectTownDistanceUnavailable')}
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
          })}
        </div>
      </CollapsibleSubsection>
    </div>
  );
};

// Sub-component for Preset settings inspector
