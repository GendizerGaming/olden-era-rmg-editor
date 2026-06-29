import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { CatalogItem, ContentPoolPreset, Zone } from '../../types/editor';
import { NumberField } from '../shared/NumberField';
import { Field } from '../shared/primitives';
import { Copy, Plus, Search, Trash2 } from 'lucide-react';

interface ContentPoolInspectorProps {
  preset: ContentPoolPreset;
  zones: Zone[];
  actions: EditorActions;
  t: TranslationFunction;
  language: 'ru' | 'en';
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '5px 8px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-2)',
  border: '1px solid var(--line)'
};

const POOL_REF_FIELDS = ['guardedContentPool', 'unguardedContentPool', 'resourcesContentPool'] as const;

/**
 * A named content pool: weighted list groups plus a price distribution and
 * bans. Zones reference pools by name from their three pool slots.
 */
export const ContentPoolInspector: React.FC<ContentPoolInspectorProps> = ({ preset, zones, actions, t, language }) => {
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const customObjectLists = useEditorStore((state) => state.customObjectLists);
  // The name commits on blur/Enter so half-typed names don't rewrite zone
  // references on every keystroke; the parent keys this component by name.
  const [nameDraft, setNameDraft] = useState(preset.name);
  const [groupQuery, setGroupQuery] = useState('');
  const [banQuery, setBanQuery] = useState('');

  const usedBy = zones
    .filter((zone) => POOL_REF_FIELDS.some((field) => zone[field]?.includes(preset.name)))
    .map((zone) => zone.id);

  const itemLabel = (item: CatalogItem): string =>
    item.labelByLang?.[language] || item.label || item.sid || item.id;

  const labelForSid = (sid: string): string => {
    const item = objectLibrary.find((entry) => entry.kind === 'sid' && (entry.sid || entry.id) === sid);
    return item ? itemLabel(item) : sid;
  };

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== preset.name) {
      actions.updateContentPoolPreset(preset.name, { name: next });
    } else {
      setNameDraft(preset.name);
    }
  };

  const update = (updates: Partial<ContentPoolPreset>) => {
    actions.updateContentPoolPreset(preset.name, updates);
  };

  // All pickable list names: core catalog lists plus the design's custom sets.
  const pickableLists = useMemo(() => {
    const needle = groupQuery.trim().toLowerCase();
    const result: Array<{ id: string; label: string }> = [];
    for (const item of objectLibrary) {
      if (item.kind !== 'list') continue;
      const id = item.includeList || item.id;
      if (!id) continue;
      result.push({ id, label: itemLabel(item) });
    }
    for (const list of Object.values(customObjectLists)) {
      result.push({ id: list.id, label: list.label });
    }
    return result.filter((entry) =>
      !needle || entry.label.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupQuery, objectLibrary, customObjectLists, language]);

  const pickableBans = useMemo(() => {
    const needle = banQuery.trim().toLowerCase();
    if (!needle) return [];
    return objectLibrary
      .filter((item) => item.kind === 'sid' && (item.sid || item.id))
      .map((item) => ({ id: item.sid || item.id, label: itemLabel(item) }))
      .filter((entry) => entry.label.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle))
      .slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banQuery, objectLibrary, language]);

  const groupedListNames = new Set(
    preset.groups.filter((group) => group.includeLists.length === 1).map((group) => group.includeLists[0])
  );
  const bannedSids = new Set(preset.bans.filter((ban) => ban.sid).map((ban) => ban.sid));

  const distribution = preset.valueDistribution;
  const setDistribution = (priceBounds: number[], weights: number[]) =>
    update({ valueDistribution: { priceBounds, weights } });

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--fz-emph)' }}>{t('contentPoolTitle')}</strong>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className="compact-button"
            title={t('contentPoolDuplicate')}
            onClick={() => actions.duplicateContentPoolPreset(preset.name)}
          >
            <Copy size={10} />
          </button>
          <button
            type="button"
            className="compact-button danger"
            title={usedBy.length > 0 ? t('contentPoolDeleteBlockedShort') : t('contentPoolDelete')}
            disabled={usedBy.length > 0}
            style={usedBy.length > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            onClick={() => actions.deleteContentPoolPreset(preset.name)}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      <Field label={t('contentPoolName')}>
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </Field>

      <p className="ui-field-hint" style={{ margin: 0 }}>
        {usedBy.length > 0
          ? t('contentPoolUsedBy', { zones: usedBy.join(', ') })
          : t('contentPoolUnused')}
      </p>

      {/* Price distribution */}
      <div className="control-label">{t('contentPoolDistributionTitle')}</div>
      {!distribution ? (
        <button
          type="button"
          className="small-button"
          style={{ justifyContent: 'center' }}
          onClick={() => setDistribution([3999, 6999, 12999], [5, 12, 14, 2])}
        >
          {t('contentPoolDistributionAdd')}
        </button>
      ) : (
        <div style={{ display: 'grid', gap: '4px' }}>
          {distribution.weights.map((weight, index) => {
            const from = index === 0 ? 0 : distribution.priceBounds[index - 1];
            const to = index < distribution.priceBounds.length ? distribution.priceBounds[index] : undefined;
            return (
              <div key={index} style={rowStyle}>
                <span style={{ fontSize: 'var(--fz-caption)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {to !== undefined
                    ? t('contentPoolBucket', { from, to })
                    : t('contentPoolBucketLast', { from })}
                </span>
                {to !== undefined && (
                  <NumberField
                    className="weight-field"
                    min={0}
                    step={1000}
                    value={to}
                    title={t('contentPoolBoundTitle')}
                    onCommit={(v) => {
                      const bounds = [...distribution.priceBounds];
                      bounds[index] = v;
                      setDistribution(bounds, distribution.weights);
                    }}
                    style={{ width: '64px', flexShrink: 0 }}
                  />
                )}
                <NumberField
                  className="weight-field"
                  min={0}
                  step={1}
                  value={weight}
                  title={t('contentPoolWeightTitle')}
                  onCommit={(v) => {
                    const weights = [...distribution.weights];
                    weights[index] = v;
                    setDistribution(distribution.priceBounds, weights);
                  }}
                  style={{ width: '52px', flexShrink: 0 }}
                />
                <button
                  type="button"
                  className="compact-button danger"
                  title={t('contentPoolBucketRemove')}
                  disabled={distribution.weights.length <= 1}
                  style={{ flexShrink: 0, ...(distribution.weights.length <= 1 ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                  onClick={() => {
                    const bounds = distribution.priceBounds.filter((_, boundIndex) => boundIndex !== Math.min(index, distribution.priceBounds.length - 1));
                    const weights = distribution.weights.filter((_, weightIndex) => weightIndex !== index);
                    setDistribution(bounds, weights);
                  }}
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
            onClick={() => {
              const lastBound = distribution.priceBounds[distribution.priceBounds.length - 1] ?? 3999;
              setDistribution([...distribution.priceBounds, lastBound * 2], [...distribution.weights, 1]);
            }}
          >
            <Plus size={12} style={{ marginRight: '4px' }} />
            {t('contentPoolBucketAdd')}
          </button>
        </div>
      )}
      <p className="ui-field-hint" style={{ margin: 0 }}>{t('contentPoolDistributionHelp')}</p>

      {/* Groups */}
      <div className="control-label">{t('contentPoolGroupsTitle')} ({preset.groups.length})</div>
      {preset.groups.length === 0 && (
        <p className="ui-field-hint" style={{ margin: 0 }}>{t('contentPoolGroupsEmpty')}</p>
      )}
      {preset.groups.map((group, index) => {
        const title = group.raw !== undefined
          ? t('contentPoolGroupRaw')
          : group.includeLists.join(', ');
        return (
          <div key={`${title}:${index}`} style={rowStyle}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
              <span title={title} style={{ fontSize: 'var(--fz-base)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </span>
              {group.raw !== undefined && (
                <span style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {JSON.stringify(group.raw).slice(0, 60)}
                </span>
              )}
            </span>
            {group.raw === undefined && (
              <NumberField
                className="weight-field"
                min={0}
                step={1000}
                value={group.weight}
                title={t('contentPoolGroupWeight')}
                onCommit={(v) => update({
                  groups: preset.groups.map((candidate, candidateIndex) =>
                    candidateIndex === index ? { ...candidate, weight: v } : candidate
                  )
                })}
                style={{ width: '64px', flexShrink: 0 }}
              />
            )}
            <button
              type="button"
              className="compact-button danger"
              title={t('contentPoolGroupRemove')}
              style={{ flexShrink: 0 }}
              onClick={() => update({ groups: preset.groups.filter((_, candidateIndex) => candidateIndex !== index) })}
            >
              <Trash2 size={10} />
            </button>
          </div>
        );
      })}

      <div className="library-filter">
        <Search size={14} className="search-icon" />
        <input
          type="search"
          placeholder={t('contentPoolGroupSearchPlaceholder')}
          value={groupQuery}
          onChange={(e) => setGroupQuery(e.target.value)}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridAutoRows: 'max-content',
          alignContent: 'start',
          gap: '4px',
          maxHeight: '220px',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: '4px'
        }}
      >
        {pickableLists.map((entry) => {
          const added = groupedListNames.has(entry.id);
          return (
            <div key={entry.id} style={rowStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                {!added && (
                  <button
                    type="button"
                    className="compact-button primary"
                    title={t('contentPoolGroupAdd')}
                    style={{ flexShrink: 0 }}
                    onClick={() => update({ groups: [...preset.groups, { weight: 10000, includeLists: [entry.id] }] })}
                  >
                    <Plus size={10} />
                  </button>
                )}
                <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                  <span title={entry.label} style={{ fontSize: 'var(--fz-base)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.label}
                  </span>
                  <span title={entry.id} style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.id}
                  </span>
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Bans */}
      <div className="control-label">{t('contentPoolBansTitle')} ({preset.bans.length})</div>
      {preset.bans.map((ban, index) => {
        const title = ban.raw !== undefined
          ? JSON.stringify(ban.raw).slice(0, 60)
          : `${labelForSid(ban.sid || '')}${ban.variant !== undefined ? ` · v${ban.variant}` : ''}`;
        return (
          <div key={`${ban.sid ?? 'raw'}:${index}`} style={rowStyle}>
            <span title={title} style={{ fontSize: 'var(--fz-base)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </span>
            <button
              type="button"
              className="compact-button danger"
              title={t('contentPoolBanRemove')}
              style={{ flexShrink: 0 }}
              onClick={() => update({ bans: preset.bans.filter((_, candidateIndex) => candidateIndex !== index) })}
            >
              <Trash2 size={10} />
            </button>
          </div>
        );
      })}
      <div className="library-filter">
        <Search size={14} className="search-icon" />
        <input
          type="search"
          placeholder={t('contentPoolBanSearchPlaceholder')}
          value={banQuery}
          onChange={(e) => setBanQuery(e.target.value)}
        />
      </div>
      {pickableBans.filter((entry) => !bannedSids.has(entry.id)).map((entry) => (
        <div key={entry.id} style={rowStyle}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            <button
              type="button"
              className="compact-button primary"
              title={t('contentPoolBanAdd')}
              style={{ flexShrink: 0 }}
              onClick={() => update({ bans: [...preset.bans, { sid: entry.id }] })}
            >
              <Plus size={10} />
            </button>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
              <span title={entry.label} style={{ fontSize: 'var(--fz-base)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.label}
              </span>
              <span title={entry.id} style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.id}
              </span>
            </span>
          </span>
        </div>
      ))}
      <p className="ui-field-hint" style={{ margin: 0 }}>{t('contentPoolBansHelp')}</p>
    </div>
  );
};
