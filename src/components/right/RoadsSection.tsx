import React from 'react';
import { Plus, ArrowRight, ArrowLeftRight, Trash2, Hexagon, DoorOpen, Pickaxe } from 'lucide-react';
import type { Zone, Edge } from '../../types/editor';
import type { RmgRoad, RoadTerm } from '../../types/rmg';
import { useEditorStore } from '../../store/useEditorStore';
import { safeName } from '../../store/ids';
import { useTranslation } from '../../i18n/context';

type RoadTargetType = RoadTerm['type'];

// Option key prefix for a zone object that has no name yet (named on selection).
const UNNAMED_PREFIX = 'unnamed-object:';

interface EndpointOption {
  key: string;
  type: RoadTargetType;
  args: string[];
  label: string;
  detail: string;
}

const serialize = (type: RoadTargetType, args: string[]) => JSON.stringify({ type, args });

const parseKey = (key: string): { type: RoadTargetType; args: string[] } => {
  try {
    const parsed = JSON.parse(key) as { type?: string; args?: unknown };
    const type = (['Crossroads', 'MainObject', 'Connection', 'MandatoryContent'] as const).find((t) => t === parsed.type) ?? 'Crossroads';
    const args = Array.isArray(parsed.args) ? parsed.args.filter((a): a is string => typeof a === 'string') : [];
    return { type, args };
  } catch {
    return { type: 'Crossroads', args: [] };
  }
};

const termKey = (term: RoadTerm) => serialize(term.type, term.args ?? []);

export const RoadsSection: React.FC<{ zone: Zone; edges: Edge[] }> = ({ zone, edges }) => {
  const { t } = useTranslation();
  const setZoneRoads = useEditorStore((state) => state.actions.setZoneRoads);

  const roads: RmgRoad[] = zone.roads ?? [];
  const mainObjects = zone.mainObjects ?? [];
  const touchingConnections = edges.filter(
    (edge) => edge.connectionType !== 'Proximity' && (edge.from === zone.id || edge.to === zone.id)
  );

  const moLabel = (type: string, player?: number | null) => `${type}${player ? ` · P${player}` : ''}`;
  const objects = zone.objects ?? [];

  // A unique default name (by sid) for an object that has none yet.
  const usedNames = () => new Set(objects.map((o) => o.name).filter((n): n is string => Boolean(n)));
  const defaultNameFor = (sid: string | undefined, id: string, used: Set<string>) => {
    const base = safeName(sid || id || 'object').toLowerCase();
    let name = base;
    let suffix = 2;
    while (used.has(name)) { name = `${base}_${suffix}`; suffix += 1; }
    return name;
  };

  const endpointOptions: EndpointOption[] = [
    { key: serialize('Crossroads', []), type: 'Crossroads', args: [], label: t('roadHub'), detail: t('roadHubDetail') },
    ...mainObjects.map((mo, index) => ({
      key: serialize('MainObject', [String(index)]),
      type: 'MainObject' as const,
      args: [String(index)],
      label: moLabel(mo.type, mo.player),
      detail: t('roadObjectIndex', { index })
    })),
    ...touchingConnections.map((edge) => {
      const other = edge.from === zone.id ? edge.to : edge.from;
      return {
        key: serialize('Connection', [edge.id]),
        type: 'Connection' as const,
        args: [edge.id],
        label: other,
        detail: t('roadGate')
      };
    }),
    // Every zone object is selectable. A named one targets by name; an unnamed
    // one gets a default name assigned when picked.
    ...objects.map((obj) => obj.name
      ? {
          key: serialize('MandatoryContent', [obj.name]),
          type: 'MandatoryContent' as const,
          args: [obj.name],
          label: obj.label || obj.sid || obj.name,
          detail: obj.name
        }
      : {
          key: `${UNNAMED_PREFIX}${obj.key}`,
          type: 'MandatoryContent' as const,
          args: [],
          label: obj.label || obj.sid || obj.id,
          detail: t('roadMandatoryUnnamed')
        })
  ];

  // Keep an imported target (e.g. MandatoryContent, or a now-stale reference)
  // selectable even when it isn't in the live option set.
  const optionsForTerm = (term: RoadTerm): EndpointOption[] => {
    const key = termKey(term);
    if (endpointOptions.some((option) => option.key === key)) return endpointOptions;
    const arg = term.args?.[0] ?? '';
    return [...endpointOptions, { key, type: term.type, args: term.args ?? [], label: arg || term.type, detail: term.type }];
  };

  const commit = (next: RmgRoad[]) => setZoneRoads(zone.id, next);

  const updateRoad = (index: number, patch: Partial<RmgRoad>) =>
    commit(roads.map((road, i) => (i === index ? { ...road, ...patch } : road)));

  const setEndpoint = (index: number, side: 'from' | 'to', key: string) => {
    // Picking an as-yet-unnamed object: give it a default name, then target it.
    if (key.startsWith(UNNAMED_PREFIX)) {
      const objKey = key.slice(UNNAMED_PREFIX.length);
      const obj = objects.find((o) => o.key === objKey);
      if (!obj) return;
      const name = defaultNameFor(obj.sid, obj.id, usedNames());
      const term: RoadTerm = { type: 'MandatoryContent', args: [name] };
      const nextRoads = roads.map((road, i) => (i === index ? { ...road, [side]: term } : road));
      setZoneRoads(zone.id, nextRoads, { [objKey]: name });
      return;
    }
    const { type, args } = parseKey(key);
    updateRoad(index, { [side]: args.length ? { type, args } : { type } } as Partial<RmgRoad>);
  };

  const swapEnds = (index: number) => {
    const road = roads[index];
    updateRoad(index, { from: road.to, to: road.from });
  };

  const removeRoad = (index: number) => commit(roads.filter((_, i) => i !== index));

  const addRoad = () => {
    const from: RoadTerm = mainObjects.length ? { type: 'MainObject', args: ['0'] } : { type: 'Crossroads' };
    const to: RoadTerm = touchingConnections.length
      ? { type: 'Connection', args: [touchingConnections[0].id] }
      : { type: 'Crossroads' };
    commit([...roads, { type: 'Stone', from, to }]);
  };

  // Quick presets matching the dominant official-template patterns.
  const presetExit = () => {
    if (!mainObjects.length || !touchingConnections.length) return;
    commit([...roads, { type: 'Stone', from: { type: 'MainObject', args: ['0'] }, to: { type: 'Connection', args: [touchingConnections[0].id] } }]);
  };
  const presetHub = () => {
    const hub: RmgRoad[] = mainObjects.map((_, index) => ({
      type: 'Stone', from: { type: 'MainObject', args: [String(index)] }, to: { type: 'Crossroads' }
    }));
    for (const edge of touchingConnections) {
      hub.push({ type: 'Stone', from: { type: 'Crossroads' }, to: { type: 'Connection', args: [edge.id] } });
    }
    if (hub.length) commit([...roads, ...hub]);
  };
  // Dirt roads from the hub to each mine object; unnamed mines get a name.
  const mineObjects = objects.filter((obj) => obj.isMine);
  const presetMines = () => {
    if (!mineObjects.length) return;
    const used = usedNames();
    const newNames: Record<string, string> = {};
    const branches: RmgRoad[] = mineObjects.map((obj) => {
      let name = obj.name;
      if (!name) {
        name = defaultNameFor(obj.sid, obj.id, used);
        used.add(name);
        newNames[obj.key] = name;
      }
      return { type: 'Dirt' as const, from: { type: 'Crossroads' as const }, to: { type: 'MandatoryContent' as const, args: [name] } };
    });
    setZoneRoads(zone.id, [...roads, ...branches], newNames);
  };

  // Validation: surface references the generator would reject.
  const warnings: string[] = [];
  roads.forEach((road, index) => {
    for (const term of [road.from, road.to]) {
      if (term.type === 'MainObject') {
        const i = Number(term.args?.[0]);
        if (!Number.isInteger(i) || i < 0 || i >= mainObjects.length) warnings.push(t('roadWarnObject', { index, ref: term.args?.[0] ?? '?' }));
      }
      if (term.type === 'Connection') {
        const ref = term.args?.[0];
        if (!touchingConnections.some((edge) => edge.id === ref)) warnings.push(t('roadWarnConnection', { index, ref: ref ?? '?' }));
      }
    }
  });

  const indentedBlock = { display: 'grid', gap: '6px' } as const;
  const selectStyle = { minWidth: 0, fontSize: '11px' } as const;
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px', minWidth: 0 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span className="field-note" style={{ margin: 0 }}>{t('roadsCount', { count: roads.length })}</span>
        <button type="button" className="compact-button" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={addRoad}>
          <Plus size={12} /> {t('roadAdd')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        <button type="button" className="compact-button" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={presetExit} disabled={!mainObjects.length || !touchingConnections.length} title={t('roadPresetExitHelp')}>
          <DoorOpen size={12} /> {t('roadPresetExit')}
        </button>
        <button type="button" className="compact-button" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={presetHub} disabled={!touchingConnections.length} title={t('roadPresetHubHelp')}>
          <Hexagon size={12} /> {t('roadPresetHub')}
        </button>
        <button type="button" className="compact-button" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={presetMines} disabled={!mineObjects.length} title={mineObjects.length ? t('roadPresetMinesHelp') : t('roadPresetMinesEmpty')}>
          <Pickaxe size={12} /> {t('roadPresetMines')}
        </button>
      </div>

      {warnings.length > 0 && (
        <div style={{ display: 'grid', gap: '2px' }}>
          {[...new Set(warnings)].map((warning) => (
            <span key={warning} className="field-note" style={{ margin: 0, color: 'var(--danger)' }}>{warning}</span>
          ))}
        </div>
      )}

      {roads.length === 0 ? (
        <p className="field-note" style={{ margin: 0 }}>{t('roadsEmpty')}</p>
      ) : (
        <div style={indentedBlock}>
          {roads.map((road, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '4rem 1fr auto 1fr auto', gap: '4px', alignItems: 'center' }}>
              <select style={selectStyle} value={road.type ?? ''} onChange={(e) => updateRoad(index, { type: e.target.value || undefined })} aria-label={t('roadTypeLabel')}>
                <option value="Stone">{t('roadTypeStone')}</option>
                <option value="Dirt">{t('roadTypeDirt')}</option>
                <option value="">{t('roadTypeAuto')}</option>
              </select>
              <select style={selectStyle} value={termKey(road.from)} onChange={(e) => setEndpoint(index, 'from', e.target.value)} aria-label={t('roadFrom')}>
                {optionsForTerm(road.from).map((option) => (
                  <option key={option.key} value={option.key}>{option.label} · {option.detail}</option>
                ))}
              </select>
              <button type="button" style={iconBtn} onClick={() => swapEnds(index)} title={t('roadSwap')} aria-label={t('roadSwap')}>
                <ArrowLeftRight size={12} />
              </button>
              <select style={selectStyle} value={termKey(road.to)} onChange={(e) => setEndpoint(index, 'to', e.target.value)} aria-label={t('roadTo')}>
                {optionsForTerm(road.to).map((option) => (
                  <option key={option.key} value={option.key}>{option.label} · {option.detail}</option>
                ))}
              </select>
              <button type="button" style={iconBtn} onClick={() => removeRoad(index)} title={t('roadRemove')} aria-label={t('roadRemove')}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="field-note" style={{ margin: 0, display: 'flex', gap: '4px', alignItems: 'center' }}>
        <ArrowRight size={11} style={{ flexShrink: 0 }} /> {t('roadsHelp')}
      </p>
    </div>
  );
};
