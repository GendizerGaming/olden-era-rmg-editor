import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useTranslation } from '../../i18n/context';
import type { CatalogItem, ValueOverride } from '../../types/editor';
import { NumberField } from '../shared/NumberField';
import { ListRow } from '../shared/primitives';
import { ShieldHalf, Search, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Per-object guard overrides (the template's valueOverrides): "object X is
 * guarded by Y", regardless of which zone it lands in. Mirrors the bans
 * section: the current overrides on top, the full grouped catalog below.
 */
export const ValueOverridesSection: React.FC = () => {
  const { t, language } = useTranslation();
  const settings = useEditorStore((state) => state.settings);
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const actions = useEditorStore((state) => state.actions);

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const overrides = settings.valueOverrides;
  const overriddenSids = new Set(overrides.map((entry) => entry.sid));

  const itemLabel = (item: CatalogItem): string =>
    item.labelByLang?.[language] || item.label || item.sid || item.id;

  const labelFor = (sid: string): string => {
    const item = objectLibrary.find((entry) => entry.kind === 'sid' && (entry.sid || entry.id) === sid);
    return item ? itemLabel(item) : sid;
  };

  const groupTitles: Record<string, string> = {
    Interact: t('overridesGroupInteract'),
    Resource: t('overridesGroupResource'),
    Artifact: t('overridesGroupArtifact')
  };

  // The full pickable catalog, grouped by tag and filtered by the query.
  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pickable = objectLibrary.filter((item) => item.kind === 'sid' && (item.sid || item.id));
    const filtered = needle
      ? pickable.filter((item) =>
          itemLabel(item).toLowerCase().includes(needle) ||
          (item.sid || item.id).toLowerCase().includes(needle)
        )
      : pickable;
    const groups = new Map<string, CatalogItem[]>();
    for (const item of filtered) {
      const group = groupTitles[item.tag || ''] || t('overridesGroupOther');
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(item);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, objectLibrary, language]);

  const setOverrides = (next: ValueOverride[]) => {
    actions.updateSettings({ valueOverrides: next });
  };

  const addOverride = (sid: string, name: string) => {
    // 6000 is the typical official override value.
    setOverrides([...overrides, { sid, variant: -1, guardValue: 6000 }]);
    actions.addNotification('notificationOverrideAdded', { name }, 'success');
  };

  const removeOverride = (sid: string) => {
    setOverrides(overrides.filter((entry) => entry.sid !== sid));
    actions.addNotification('notificationOverrideRemoved', { name: labelFor(sid) }, 'info');
  };

  return (
    <section className="collapsible-section">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <h2>
          <ShieldHalf size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          {t('overridesTitle')}{overrides.length > 0 ? ` (${overrides.length})` : ''}
        </h2>
        {expanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
      </div>

      {expanded && (
        <div className="collapsible-body">
          <p className="ui-field-hint" style={{ marginBottom: '8px' }}>{t('overridesDescription')}</p>

          {/* Current overrides */}
          <div className="control-label">{t('overridesListTitle')} ({overrides.length})</div>
          {overrides.length === 0 ? (
            <p className="ui-field-hint" style={{ margin: '4px 0 10px' }}>{t('overridesEmpty')}</p>
          ) : (
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
                paddingRight: '4px',
                margin: '4px 0 10px'
              }}
            >
              {overrides.map((entry) => (
                <ListRow
                  key={entry.sid}
                  title={labelFor(entry.sid)}
                  subtitle={entry.sid}
                  trailing={
                    <>
                      <NumberField
                        className="weight-field"
                        min={0}
                        step={500}
                        value={entry.guardValue}
                        onCommit={(v) => setOverrides(overrides.map((candidate) =>
                          candidate.sid === entry.sid ? { ...candidate, guardValue: v } : candidate
                        ))}
                        style={{ width: '64px', flexShrink: 0 }}
                      />
                      <button
                        type="button"
                        className="compact-button danger"
                        title={t('overridesRemove')}
                        onClick={() => removeOverride(entry.sid)}
                      >
                        <Trash2 size={10} />
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}

          {/* Full catalog picker */}
          <div className="library-filter">
            <Search size={14} className="search-icon" />
            <input
              type="search"
              placeholder={t('overridesSearchPlaceholder')}
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
              maxHeight: '300px',
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
                    const sid = item.sid || item.id;
                    const isOverridden = overriddenSids.has(sid);
                    return (
                      <ListRow
                        key={sid}
                        active={isOverridden}
                        leading={!isOverridden && (
                          <button
                            type="button"
                            className="compact-button primary"
                            title={t('overridesAdd')}
                            onClick={() => addOverride(sid, itemLabel(item))}
                          >
                            <Plus size={10} />
                          </button>
                        )}
                        title={itemLabel(item)}
                        subtitle={sid}
                        trailing={isOverridden && (
                          <button
                            type="button"
                            className="compact-button danger"
                            title={t('overridesRemove')}
                            onClick={() => removeOverride(sid)}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      />
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
