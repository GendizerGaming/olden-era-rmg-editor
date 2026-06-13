import React from 'react';
import { useEditorStore, biomeIds, distancePresets, catalogItemForReference, zoneTypes } from '../../store/useEditorStore';
import { makeDefaultSpawnObject, nextPlayerNumber, zoneContentScale } from '../../store/zones';
import { uniqueKey } from '../../store/ids';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import { Trash2, Save, Castle, Leaf, Boxes } from 'lucide-react';
import type { Edge, Faction, MainObjectPlacement, MainObjectType, Zone, ZoneMainObject, ZoneObject } from '../../types/editor';
import { fieldUpdate } from '../shared/forms';
import { GuardReactionEditor } from '../shared/GuardReactionEditor';
import { LazyDetails } from '../shared/LazyDetails';
import { isBiomeMode, isCityFactionMode } from '../shared/guards';
import { NumberField } from '../shared/NumberField';
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
const SectionHeader: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
    {icon}
    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--muted-soft)' }}>
      {label}
    </span>
  </div>
);

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
      <p className="field-note" style={{ margin: 0 }}>{t('zonePoolAuto', { name: autoName })}</p>
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
              borderRadius: '6px',
              background: 'var(--panel-2)',
              border: '1px solid var(--line)'
            }}
          >
            <span title={ref} style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <label style={{ marginBottom: 0 }}>
        <span>{t('placementMode')}</span>
        <select value={obj.placement ?? ''} onChange={(e) => handleMode(e.target.value)}>
          <option value="">{t('placementAuto')}</option>
          <option value="Uniform">{t('placementUniform')}</option>
          <option value="Center">{t('placementCenter')}</option>
          <option value="Connection">{t('placementConnection')}</option>
          <option value="NearZone">{t('placementNearZone')}</option>
        </select>
      </label>

      {isUniformLike && (
        <>
          <label style={{ marginBottom: 0 }}>
            <span>{t('placementArgsLabel')}</span>
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
          </label>
          {argsSelectValue === 'custom' && args && args.length === 3 && (
            <>
              <label className="toggle-line" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={args[0] === 'true'}
                  onChange={(e) => setArg(0, String(e.target.checked))}
                />
                <span style={{ fontSize: '11px' }}>{t('placementArgCenter')}</span>
              </label>
              <div className="field-row" style={{ marginBottom: 0 }}>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('placementArgBias')}</span>
                  <NumberField
                    min={-1}
                    max={1}
                    step={0.1}
                    value={Number(args[1]) || 0}
                    onCommit={(v) => setArg(1, String(v))}
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('placementArgExtra')}</span>
                  <NumberField
                    min={0}
                    step={1}
                    value={Number(args[2]) || 0}
                    onCommit={(v) => setArg(2, String(v))}
                  />
                </label>
              </div>
            </>
          )}
        </>
      )}

      {obj.placement === 'Connection' && (
        <label style={{ marginBottom: 0 }}>
          <span>{t('placementConnectionLabel')}</span>
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
        </label>
      )}

      {obj.placement === 'NearZone' && (
        <label style={{ marginBottom: 0 }}>
          <span>{t('placementNearZoneLabel')}</span>
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
        </label>
      )}

      <p className="field-note" style={{ margin: 0 }}>{t('placementHelp')}</p>
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
    <div style={{ display: 'grid', gap: '8px' }}>
      <label>
        {t('zoneId')}
        <input
          type="text"
          value={zone.id}
          onChange={(e) => handleFieldChange('id', e.target.value)}
        />
      </label>
      
      <label>
        {t('zoneLabel')}
        <input
          type="text"
          value={zone.label}
          onChange={(e) => handleFieldChange('label', e.target.value)}
        />
      </label>
      
      <label>
        {t('zoneType')}
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
      </label>
      
      <div className="field-row">
        <label>
          <span>{t('guarded')}<ValueBadge kind="zoneGuarded" value={zone.guardedValue} /></span>
          <NumberField
            min={0}
            step={1000}
            value={zone.guardedValue}
            onCommit={(v) => handleFieldChange('guardedValue', v)}
          />
        </label>
        <label>
          <span>{t('unguarded')}<ValueBadge kind="zoneUnguarded" value={zone.unguardedValue} /></span>
          <NumberField
            min={0}
            step={1000}
            value={zone.unguardedValue}
            onCommit={(v) => handleFieldChange('unguardedValue', v)}
          />
        </label>
      </div>

      <div className="field-row">
        <label>
          <span>{t('resources')}<ValueBadge kind="zoneResources" value={zone.resourcesValue} /></span>
          <NumberField
            min={0}
            step={1000}
            value={zone.resourcesValue}
            onCommit={(v) => handleFieldChange('resourcesValue', v)}
          />
        </label>
        <label>
          {t('zoneSize')}
          <NumberField
            min={0.25}
            max={4}
            step={0.25}
            value={zone.size}
            onCommit={(v) => handleFieldChange('size', v)}
          />
        </label>
      </div>

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
      <LazyDetails
        className="inspector-subsection"
        style={{
          border: '1px solid var(--line)',
          borderRadius: '6px',
          background: 'var(--panel-2)',
          overflow: 'hidden'
        }}
        summary={
          <strong style={{ fontSize: '12px' }}>
            {t('zonePerAreaSection')}
          </strong>
        }
        renderContent={() => (
          <div style={{ display: 'grid', gap: '8px', padding: '6px 8px 10px' }}>
            <div className="field-row" style={{ marginBottom: 0 }}>
              <label style={{ marginBottom: 0 }}>
                <span>{t('guarded')}</span>
                <NumberField
                  min={0}
                  step={100}
                  value={zone.guardedValuePerArea ?? 0}
                  onCommit={(v) => handleFieldChange('guardedValuePerArea', v || undefined)}
                />
              </label>
              <label style={{ marginBottom: 0 }}>
                <span>{t('unguarded')}</span>
                <NumberField
                  min={0}
                  step={50}
                  value={zone.unguardedValuePerArea ?? 0}
                  onCommit={(v) => handleFieldChange('unguardedValuePerArea', v || undefined)}
                />
              </label>
            </div>
            <label style={{ marginBottom: 0 }}>
              <span>{t('resources')}</span>
              <NumberField
                min={0}
                step={50}
                value={zone.resourcesValuePerArea ?? 0}
                onCommit={(v) => handleFieldChange('resourcesValuePerArea', v || undefined)}
              />
            </label>
            <p className="field-note" style={{ margin: 0 }}>{t('zonePerAreaHelp')}</p>
          </div>
        )}
      />
      )}

      {isExpert && (
      <>
      <label>
        {t('zoneTerrainProfile')}
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
      </label>
      <p className="field-note" style={{ marginTop: 0 }}>{t('zoneTerrainProfileHelp')}</p>

      {/* Content-limit preset references */}
      <div style={{ display: 'grid', gap: '4px' }}>
        <span className="control-label">{t('zoneContentLimits')}</span>
        {zone.contentCountLimits === undefined ? (
          <p className="field-note" style={{ margin: 0 }}>
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
                    borderRadius: '6px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--line)'
                  }}
                >
                  <span title={ref} style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <p className="field-note" style={{ margin: 0 }}>{t('zoneContentLimitsHelp')}</p>
      </div>

      {/* Content pool references */}
      <LazyDetails
        className="inspector-subsection"
        style={{
          border: '1px solid var(--line)',
          borderRadius: '6px',
          background: 'var(--panel-2)',
          marginTop: '4px',
          overflow: 'hidden'
        }}
        summary={
          <strong style={{ fontSize: '12px' }}>
            {t('zonePoolsSection')}
          </strong>
        }
        renderContent={() => (
          <div style={{ display: 'grid', gap: '10px', padding: '6px 8px 10px' }}>
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
            <p className="field-note" style={{ margin: 0 }}>{t('zonePoolsHelp')}</p>
          </div>
        )}
      />

      {/* Guard & neutrals tuning. Deliberately NOT list-content-entry: its
          display:grid summary rule would push the chevron onto a second row. */}
      <LazyDetails
        className="inspector-subsection"
        style={{
          border: '1px solid var(--line)',
          borderRadius: '6px',
          background: 'var(--panel-2)',
          marginTop: '4px',
          overflow: 'hidden'
        }}
        summary={
          <strong style={{ fontSize: '12px' }}>
            {t('zoneGuardSection')}
          </strong>
        }
        renderContent={() => {
          return (
            <div style={{ display: 'grid', gap: '8px', padding: '6px 8px 10px' }}>
              <GuardReactionEditor
                key={zone.id}
                value={zone.guardReactionDistribution}
                t={t}
                onChange={(value) => handleFieldChange('guardReactionDistribution', value)}
              />

              <div className="field-row" style={{ marginBottom: 0 }}>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('zoneGuardMultiplier')}<ValueBadge kind="guardMultiplier" value={zone.guardMultiplier ?? 1.4} /></span>
                  <NumberField
                    min={0}
                    max={10}
                    step={0.05}
                    value={zone.guardMultiplier ?? 1.4}
                    onCommit={(v) => handleFieldChange('guardMultiplier', v)}
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('zoneDiplomacy')}</span>
                  <NumberField
                    min={-1}
                    max={1}
                    step={0.05}
                    value={zone.diplomacyModifier ?? -0.25}
                    onCommit={(v) => handleFieldChange('diplomacyModifier', v)}
                  />
                </label>
              </div>
              <p className="field-note" style={{ margin: 0 }}>{t('zoneGuardMainHelp')}</p>

              <div className="field-row" style={{ marginBottom: 0 }}>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('zoneGuardCutoff')}</span>
                  <NumberField
                    min={0}
                    step={250}
                    value={zone.guardCutoffValue ?? 1500}
                    onCommit={(v) => handleFieldChange('guardCutoffValue', v)}
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('guardWeeklyIncrement')}</span>
                  <NumberField
                    min={0}
                    max={1}
                    step={0.05}
                    value={zone.guardWeeklyIncrement ?? 0.15}
                    onCommit={(v) => handleFieldChange('guardWeeklyIncrement', v)}
                  />
                </label>
              </div>
              <label style={{ marginBottom: 0 }}>
                <span>{t('guardRandomization')}</span>
                <NumberField
                  min={0}
                  max={1}
                  step={0.05}
                  value={zone.guardRandomization ?? 0.25}
                  onCommit={(v) => handleFieldChange('guardRandomization', v)}
                />
              </label>
              <p className="field-note" style={{ margin: 0 }}>{t('zoneGuardExtraHelp')}</p>

              <label className="toggle-line" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(zone.encounterHolesSettings)}
                  onChange={(e) => handleFieldChange(
                    'encounterHolesSettings',
                    e.target.checked ? { affectedEncounters: 0.66, twoHoleEncounters: 0.66 } : undefined
                  )}
                />
                <span>{t('zoneHolesToggle')}</span>
              </label>
              {zone.encounterHolesSettings && (
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <label style={{ marginBottom: 0 }}>
                    <span>{t('zoneHolesAffected')}</span>
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
                  </label>
                  <label style={{ marginBottom: 0 }}>
                    <span>{t('zoneHolesTwo')}</span>
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
                  </label>
                </div>
              )}
              <p className="field-note" style={{ margin: 0 }}>{t('zoneHolesHelp')}</p>
            </div>
          );
        }}
      />
      </>
      )}

      {/* Castle Section */}
      <div style={{ marginTop: '12px' }}>
        <SectionHeader icon={<Castle size={12} style={{ color: 'var(--accent)' }} />} label={t('zoneCity')} />
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => handleAddMainObject('City')}
            style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
          >
            + {t('addCity')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => handleAddMainObject('AbandonedOutpost')}
            title={t('addOutpostTooltip')}
            style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
          >
            + {t('addOutpost')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={arenaExists}
            onClick={() => handleAddMainObject('GladiatorArena')}
            title={arenaExists ? t('addArenaLimitTooltip') : t('addArenaTooltip')}
            style={{ flex: 1, padding: '6px 8px', fontSize: '12px', opacity: arenaExists ? 0.5 : 1, cursor: arenaExists ? 'not-allowed' : 'pointer' }}
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

            return (
              <div
                key={obj.key || idx}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '8px',
                  backgroundColor: 'var(--panel-bg-dark)',
                  display: 'grid',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '12px' }}>
                    {cardTitle} #{idx + 1} {isSpawnObj ? `(${t('startingZoneCheckbox') || 'Стартовый'})` : ''}
                  </strong>
                  <button
                    type="button"
                    onClick={() => handleRemoveMainObject(obj.key)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--red-color)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '11px'
                    }}
                  >
                    {t('remove')}
                  </button>
                </div>

                {(isSpawnObj || isCity) && (
                 <label
                  className="toggle-line"
                  style={{
                    marginTop: '2px',
                    cursor: isSpawnCheckboxDisabled ? 'not-allowed' : 'pointer',
                    opacity: isSpawnCheckboxDisabled ? 0.5 : 1
                  }}
                  title={isSpawnCheckboxDisabled ? t('startingZoneLimitReachedTooltip') : undefined}
                >
                  <input
                    type="checkbox"
                    checked={isSpawnObj}
                    disabled={isSpawnCheckboxDisabled}
                    onChange={(e) => handleToggleSpawn(obj.key, e.target.checked)}
                    style={{ cursor: isSpawnCheckboxDisabled ? 'not-allowed' : 'pointer' }}
                  />
                  <span style={{ fontSize: '11px' }}>
                    {t('startingZoneCheckbox') || 'Стартовая позиция (замок игрока)'}
                  </span>
                </label>
                )}

                {isArena && (
                  <p className="field-note" style={{ margin: 0 }}>{t('arenaCardHelp')}</p>
                )}

                {isSpawnObj && (
                  <label>
                    {t('player') || 'Игрок'}
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
                  </label>
                )}

                {(isCity || isOutpost) && (
                  <>
                    {isCity && (
                      <label>
                        {t('cityOwner')}
                        <select
                          value={obj.owner || ''}
                          onChange={(e) => handleUpdateMainObject(obj.key, { owner: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">{t('cityOwnerNeutral')}</option>
                          {Array.from({ length: settings.players }, (_, i) => i + 1).map(pNum => (
                            <option key={pNum} value={pNum}>{t('playerNumber', { num: pNum })}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label>
                      {isOutpost ? t('outpostFaction') : t('cityFactionMode')}
                      <select
                        value={obj.factionMode}
                        onChange={(e) => {
                          if (isCityFactionMode(e.target.value)) {
                            handleUpdateMainObject(obj.key, { factionMode: e.target.value });
                          }
                        }}
                      >
                        <option value="random">{t('cityFactionRandom')}</option>
                        <option value="spawn">{t('cityFactionSpawn')}</option>
                        <option value="specific">{t('cityFactionSpecific')}</option>
                      </select>
                    </label>

                    {obj.factionMode === 'spawn' && (
                      <label>
                        {t('citySpawnSource')}
                        <select
                          value={obj.factionSource || ''}
                          onChange={(e) => handleUpdateMainObject(obj.key, { factionSource: e.target.value })}
                        >
                          <option value="">{t('selectSpawnSource')}</option>
                          {cityStartOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.id}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    {obj.factionMode === 'specific' && (
                      <label>
                        {t('citySpecificFaction')}
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
                      </label>
                    )}

                    {isCity && isCityHoldWinCon && (
                      <label className="toggle-line" style={{ marginTop: '2px' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(obj.holdCityWinCon)}
                          onChange={(e) => handleUpdateMainObject(obj.key, { holdCityWinCon: e.target.checked })}
                        />
                        <span style={{ fontSize: '11px' }}>{t('victoryCityWinConLabel')}</span>
                      </label>
                    )}
                  </>
                )}

                {!isArena && (
                  <label>
                    {t('constructionLabel')}
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
                  </label>
                )}

                {isExpert && !isArena && (
                  <LazyDetails
                    className="inspector-subsection"
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: '6px',
                      background: 'var(--panel-2)',
                      marginTop: '2px',
                      overflow: 'hidden'
                    }}
                    summary={
                      <strong style={{ fontSize: '12px' }}>
                        {t('objectGuardSection')}
                      </strong>
                    }
                    renderContent={() => (
                      <div style={{ display: 'grid', gap: '8px', padding: '6px 8px 10px' }}>
                        <div className="field-row" style={{ marginBottom: 0 }}>
                          <label style={{ marginBottom: 0 }}>
                            <span>{t('objectGuardValue')}<ValueBadge kind="guardStrength" value={obj.guardValue ?? 0} /></span>
                            <NumberField
                              min={0}
                              step={1000}
                              value={obj.guardValue ?? 0}
                              onCommit={(v) => handleUpdateMainObject(obj.key, { guardValue: v })}
                            />
                          </label>
                          <label style={{ marginBottom: 0 }}>
                            <span>{t('objectGuardChance')}</span>
                            <NumberField
                              min={0}
                              max={1}
                              step={0.1}
                              value={obj.guardChance ?? 1}
                              onCommit={(v) => handleUpdateMainObject(obj.key, { guardChance: v })}
                            />
                          </label>
                        </div>
                        <label style={{ marginBottom: 0 }}>
                          <span>{t('guardWeeklyIncrement')}</span>
                          <NumberField
                            min={0}
                            max={1}
                            step={0.05}
                            value={obj.guardWeeklyIncrement ?? 0}
                            onCommit={(v) => handleUpdateMainObject(obj.key, { guardWeeklyIncrement: v })}
                          />
                        </label>
                        <label className="toggle-line" style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(obj.removeGuardIfHasOwner)}
                            onChange={(e) => handleUpdateMainObject(obj.key, { removeGuardIfHasOwner: e.target.checked ? true : undefined })}
                          />
                          <span style={{ fontSize: '11px' }}>{t('removeGuardIfHasOwner')}</span>
                        </label>
                        <p className="field-note" style={{ margin: 0 }}>{t('objectGuardHelp')}</p>
                      </div>
                    )}
                  />
                )}

                {isExpert && (
                <LazyDetails
                  className="inspector-subsection"
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '6px',
                    background: 'var(--panel-2)',
                    marginTop: '2px',
                    overflow: 'hidden'
                  }}
                  summary={
                    <strong style={{ fontSize: '12px' }}>
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
              </div>
            );
          })}
          {(zone.mainObjects || []).length === 0 && (
            <p className="field-note" style={{ textAlign: 'center', margin: '4px 0' }}>
              {t('noMainObjects')}
            </p>
          )}
        </div>
      </div>

      {/* Biome Section */}
      <div style={{ marginTop: '4px' }}>
        <SectionHeader icon={<Leaf size={12} style={{ color: 'var(--accent)' }} />} label={t('zoneBiome')} />
        <label>
          {t('zoneBiomeMode')}
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
        </label>
        
        {zone.biomeMode === 'spawn' && (
          <label>
            {t('zoneBiomeSpawnSource')}
            <select
              value={zone.biomeSource}
              onChange={(e) => handleFieldChange('biomeSource', e.target.value)}
            >
              <option value="">{t('selectSpawnSource')}</option>
              {biomeStartZones.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.id}</option>
              ))}
            </select>
          </label>
        )}
        
        {zone.biomeMode === 'specific' && (
          <label>
            {t('zoneBiomeSpecificValue')}
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
          </label>
        )}
        <p className="field-note">{t('zoneBiomeHelp')}</p>

        {/* Content & meta-object biomes: 'land' (default) follows the ground */}
        {isExpert && ([
          ['zoneContentBiome', 'contentBiomeMode', 'contentBiomeSource', 'contentBiomeId'],
          ['zoneMetaBiome', 'metaBiomeMode', 'metaBiomeSource', 'metaBiomeId']
        ] as const).map(([labelKey, modeField, sourceField, idField]) => {
          const mode = zone[modeField] ?? 'land';
          return (
            <React.Fragment key={modeField}>
              <label>
                {t(labelKey)}
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
              </label>
              {mode === 'spawn' && (
                <label>
                  {t('zoneBiomeSpawnSource')}
                  <select
                    value={zone[sourceField] || ''}
                    onChange={(e) => handleFieldChange(sourceField, e.target.value)}
                  >
                    <option value="">{t('selectSpawnSource')}</option>
                    {biomeStartZones.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.id}</option>
                    ))}
                  </select>
                </label>
              )}
              {mode === 'specific' && (
                <label>
                  {t('zoneBiomeSpecificValue')}
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
                </label>
              )}
            </React.Fragment>
          );
        })}
        {isExpert && <p className="field-note">{t('auxBiomeHelp')}</p>}
      </div>

      {/* Objects list */}
      <div style={{ marginTop: '4px' }}>
        <SectionHeader icon={<Boxes size={12} style={{ color: 'var(--accent)' }} />} label={t('zoneObjects')} />
        <div className="object-list">
          {zone.objects.map((obj) => {
            const label = obj.labelByLang?.[language] || obj.label || obj.sid || obj.includeList || obj.id || '';
            const guardStr = obj.guarded ? t('guardedShort') : t('unguardedShort');
            const technicalId = obj.kind === 'list' ? obj.includeList : obj.sid || obj.id;
            const coreCatalog = useEditorStore.getState().coreCatalog;
            const catalogItem = coreCatalog 
              ? catalogItemForReference(useEditorStore.getState().objectLibrary, { kind: obj.kind, value: technicalId || '' }) 
              : null;
            const desc = obj.descriptionByLang?.[language] || obj.description || (catalogItem ? t('listDescription', { count: catalogItem.count || 0 }) : '');

            return (
              <LazyDetails
                key={obj.key}
                className="object-chip"
                summary={
                  <>
                    <span className="object-chip-name">{label}</span>
                    <span className="object-chip-meta">x{obj.count} · {guardStr}</span>
                  </>
                }
                renderContent={() => (
                  <div className="object-settings">
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

                    <div className="field-row">
                      <label>
                        {t('objectCount')}
                        <NumberField
                          min={1}
                          max={99}
                          value={obj.count}
                          onCommit={(v) => handleObjectFieldChange(obj.key, 'count', v)}
                        />
                      </label>
                      <label>
                        {t('objectVariant')}
                        <input
                          type="number"
                          placeholder={t('objectVariantAuto')}
                          value={obj.variant ?? ''}
                          onChange={(e) => handleObjectFieldChange(obj.key, 'variant', e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <p className="field-note object-field-help">{t('objectVariantHelp')}</p>
                    
                    <label className="toggle-line">
                      <input
                        type="checkbox"
                        checked={obj.guarded}
                        onChange={(e) => handleObjectFieldChange(obj.key, 'guarded', e.target.checked)}
                      />
                      <span>{t('objectGuarded')}</span>
                    </label>
                    
                    <label className="toggle-line">
                      <input
                        type="checkbox"
                        checked={obj.soloEncounter}
                        onChange={(e) => handleObjectFieldChange(obj.key, 'soloEncounter', e.target.checked)}
                      />
                      <span>{t('objectSoloEncounter')}</span>
                    </label>
                    <p className="field-note object-field-help">{t('objectSoloEncounterHelp')}</p>
                    
                    <label>
                      {t('objectRoadDistance')}
                      <select
                        value={obj.roadDistance}
                        onChange={(e) => handleObjectFieldChange(obj.key, 'roadDistance', e.target.value)}
                      >
                        {Object.keys(distancePresets).map((presetKey) => (
                          <option key={presetKey} value={presetKey}>
                            {t(`distance${presetKey.charAt(0).toUpperCase() + presetKey.slice(1)}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    
                    <label className={hasTown ? '' : 'disabled-control'}>
                      {t('objectTownDistance')}
                      <select
                        value={hasTown ? obj.townDistance : 'any'}
                        onChange={(e) => handleObjectFieldChange(obj.key, 'townDistance', e.target.value)}
                        disabled={!hasTown}
                      >
                        {Object.keys(distancePresets).map((presetKey) => (
                          <option key={presetKey} value={presetKey}>
                            {t(`distance${presetKey.charAt(0).toUpperCase() + presetKey.slice(1)}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="field-note">
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
                  </div>
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Sub-component for Preset settings inspector
