import React, { useMemo, useState } from 'react';
import { useEditorStore, isBuiltInLimitName } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { CatalogItem, ContentLimitEntry, ContentLimitPreset, Zone } from '../../types/editor';
import { NumberField } from '../shared/NumberField';
import { Field, FieldRow, Toggle } from '../shared/primitives';
import { Copy, Plus, Search, Trash2 } from 'lucide-react';

interface ContentLimitInspectorProps {
  preset: ContentLimitPreset;
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

/**
 * A named cap list (contentCountLimits): per-object or per-list maxCount,
 * optionally gated by player count. Zones reference presets by name.
 */
export const ContentLimitInspector: React.FC<ContentLimitInspectorProps> = ({ preset, zones, actions, t, language }) => {
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const customObjectLists = useEditorStore((state) => state.customObjectLists);
  // The name commits on blur/Enter so half-typed names don't rewrite zone
  // references on every keystroke; the parent keys this component by name.
  const [nameDraft, setNameDraft] = useState(preset.name);
  const [query, setQuery] = useState('');

  const isBuiltIn = isBuiltInLimitName(preset.name);
  const usedBy = zones
    .filter((zone) => zone.contentCountLimits?.includes(preset.name))
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
      actions.updateContentLimitPreset(preset.name, { name: next });
    } else {
      setNameDraft(preset.name);
    }
  };

  const update = (updates: Partial<ContentLimitPreset>) => {
    actions.updateContentLimitPreset(preset.name, updates);
  };

  const setLimits = (limits: ContentLimitEntry[]) => update({ limits });

  const limitKey = (entry: ContentLimitEntry): string =>
    entry.raw !== undefined
      ? `raw:${JSON.stringify(entry.raw)}`
      : entry.includeLists !== undefined
        ? `list:${entry.includeLists.join('+')}`
        : `sid:${entry.sid}:${entry.variant ?? ''}`;

  const limitedSids = new Set(preset.limits.filter((entry) => entry.sid).map((entry) => entry.sid));
  const limitedLists = new Set(
    preset.limits
      .filter((entry) => entry.includeLists?.length === 1)
      .map((entry) => entry.includeLists![0])
  );

  const groupTitles: Record<string, string> = {
    Interact: t('overridesGroupInteract'),
    Resource: t('overridesGroupResource'),
    Artifact: t('overridesGroupArtifact')
  };

  // The pickable catalog: sid objects grouped by tag, plus one group with
  // core content lists and the design's custom lists (includeLists caps).
  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (label: string, id: string) =>
      !needle || label.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);

    const groups = new Map<string, Array<{ id: string; label: string; isList: boolean }>>();
    for (const item of objectLibrary) {
      const id = item.kind === 'list' ? (item.includeList || item.id) : (item.sid || item.id);
      if (!id || !matches(itemLabel(item), id)) continue;
      const group = item.kind === 'list'
        ? t('contentLimitGroupLists')
        : groupTitles[item.tag || ''] || t('overridesGroupOther');
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push({ id, label: itemLabel(item), isList: item.kind === 'list' });
    }
    for (const list of Object.values(customObjectLists)) {
      if (!matches(list.label, list.id)) continue;
      const group = t('contentLimitGroupLists');
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push({ id: list.id, label: list.label, isList: true });
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, objectLibrary, customObjectLists, language]);

  const addSidLimit = (sid: string) => {
    setLimits([...preset.limits, { sid, maxCount: 1 }]);
  };
  const addListLimit = (name: string) => {
    setLimits([...preset.limits, { includeLists: [name], maxCount: 1 }]);
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--fz-emph)' }}>{t('contentLimitTitle')}</strong>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className="compact-button"
            title={t('contentLimitDuplicate')}
            onClick={() => actions.duplicateContentLimitPreset(preset.name)}
          >
            <Copy size={10} />
          </button>
          <button
            type="button"
            className="compact-button danger"
            title={isBuiltIn
              ? t('contentLimitBuiltInDeleteBlocked')
              : usedBy.length > 0 ? t('contentLimitDeleteBlockedShort') : t('contentLimitDelete')}
            disabled={isBuiltIn || usedBy.length > 0}
            style={isBuiltIn || usedBy.length > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            onClick={() => actions.deleteContentLimitPreset(preset.name)}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      <Field label={t('contentLimitName')}>
        <input
          type="text"
          value={nameDraft}
          disabled={isBuiltIn}
          title={isBuiltIn ? t('contentLimitBuiltInNameLocked') : undefined}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </Field>

      <Toggle
        checked={preset.playerMin !== undefined || preset.playerMax !== undefined}
        onChange={(checked) => {
          if (checked) {
            update({ playerMin: 0, playerMax: 0 });
          } else {
            update({ playerMin: undefined, playerMax: undefined });
          }
        }}
        label={t('contentLimitPlayerGate')}
      />
      {(preset.playerMin !== undefined || preset.playerMax !== undefined) && (
        <FieldRow>
          <Field label={t('contentLimitPlayerMin')}>
            <NumberField
              min={0}
              max={8}
              step={1}
              value={preset.playerMin ?? 0}
              onCommit={(v) => update({ playerMin: v })}
            />
          </Field>
          <Field label={t('contentLimitPlayerMax')}>
            <NumberField
              min={0}
              max={8}
              step={1}
              value={preset.playerMax ?? 0}
              onCommit={(v) => update({ playerMax: v })}
            />
          </Field>
        </FieldRow>
      )}

      <p className="ui-field-hint" style={{ margin: 0 }}>
        {usedBy.length > 0
          ? t('contentLimitUsedBy', { zones: usedBy.join(', ') })
          : t('contentLimitUnused')}
      </p>

      {/* Current limit rows */}
      <div className="control-label">{t('contentLimitRowsTitle')} ({preset.limits.length})</div>
      {preset.limits.length === 0 ? (
        <p className="ui-field-hint" style={{ margin: '0 0 4px' }}>{t('contentLimitRowsEmpty')}</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridAutoRows: 'max-content',
            alignContent: 'start',
            gap: '4px',
            maxHeight: '240px',
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: '4px'
          }}
        >
          {preset.limits.map((entry, index) => {
            const title = entry.raw !== undefined
              ? t('contentLimitRowRaw')
              : entry.includeLists !== undefined
                ? entry.includeLists.join(', ')
                : labelForSid(entry.sid || '');
            const subtitle = entry.raw !== undefined
              ? JSON.stringify(entry.raw)
              : entry.includeLists !== undefined
                ? t('contentLimitRowList')
                : `${entry.sid}${entry.variant !== undefined ? ` · v${entry.variant}` : ''}`;
            return (
              <div key={`${limitKey(entry)}:${index}`} style={rowStyle}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                  <span title={title} style={{ fontSize: 'var(--fz-base)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </span>
                  <span title={subtitle} style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {subtitle}
                  </span>
                </span>
                {entry.raw === undefined && (
                  <NumberField
                    className="weight-field"
                    min={0}
                    step={1}
                    value={entry.maxCount}
                    title={t('contentLimitMaxCount')}
                    onCommit={(v) => setLimits(preset.limits.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...candidate, maxCount: v } : candidate
                    ))}
                    style={{ width: '52px', flexShrink: 0 }}
                  />
                )}
                <button
                  type="button"
                  className="compact-button danger"
                  title={t('contentLimitRowRemove')}
                  onClick={() => setLimits(preset.limits.filter((_, candidateIndex) => candidateIndex !== index))}
                  style={{ flexShrink: 0 }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="ui-field-hint" style={{ margin: 0 }}>{t('contentLimitMaxCountHelp')}</p>

      {/* Full catalog picker */}
      <div className="library-filter">
        <Search size={14} className="search-icon" />
        <input
          type="search"
          placeholder={t('contentLimitSearchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridAutoRows: 'max-content',
          alignContent: 'start',
          gap: '6px',
          maxHeight: '280px',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: '4px'
        }}
      >
        {grouped.map(([group, entries]) => (
          <details key={group} open={grouped.length === 1 || Boolean(query.trim())}>
            <summary
              style={{
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: 'var(--fz-caption)',
                fontWeight: 600,
                color: 'var(--muted)',
                padding: '2px 0'
              }}
            >
              {group} ({entries.length})
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '4px', padding: '4px 0 6px' }}>
              {entries.map((item) => {
                const alreadyLimited = item.isList ? limitedLists.has(item.id) : limitedSids.has(item.id);
                return (
                  <div key={`${item.isList ? 'list' : 'sid'}:${item.id}`} style={rowStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      {!alreadyLimited && (
                        <button
                          type="button"
                          className="compact-button primary"
                          title={t('contentLimitAdd')}
                          style={{ flexShrink: 0 }}
                          onClick={() => item.isList ? addListLimit(item.id) : addSidLimit(item.id)}
                        >
                          <Plus size={10} />
                        </button>
                      )}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                        <span title={item.label} style={{ fontSize: 'var(--fz-base)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                        <span title={item.id} style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.id}
                        </span>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};
