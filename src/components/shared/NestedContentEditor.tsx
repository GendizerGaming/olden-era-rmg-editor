import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { CatalogItem } from '../../types/editor';
import { NumberField } from './NumberField';
import { Plus, Search, Trash2 } from 'lucide-react';

type WeightedEntry = { sid: string; weight: number };

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '5px 8px',
  borderRadius: '6px',
  background: 'var(--panel-2)',
  border: '1px solid var(--line)'
};

/**
 * Inline weighted candidate list for a pool-slot object: rows of {sid, weight}
 * with add (by search) and remove. Clearing the last row drops the array so the
 * object exports without an inline `content`.
 */
export const NestedContentEditor: React.FC<{
  value?: WeightedEntry[];
  onChange: (next: WeightedEntry[] | undefined) => void;
  t: TranslationFunction;
  language: 'ru' | 'en';
}> = ({ value, onChange, t, language }) => {
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const [query, setQuery] = useState('');
  const entries = value ?? [];

  const itemLabel = (item: CatalogItem): string =>
    item.labelByLang?.[language] || item.label || item.sid || item.id;
  const labelForSid = (sid: string): string => {
    const item = objectLibrary.find((entry) => entry.kind === 'sid' && (entry.sid || entry.id) === sid);
    return item ? itemLabel(item) : sid;
  };
  const setEntries = (next: WeightedEntry[]) => onChange(next.length ? next : undefined);

  const pickable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return objectLibrary
      .filter((item) => item.kind === 'sid' && (item.sid || item.id))
      .map((item) => ({ id: item.sid || item.id, label: itemLabel(item) }))
      .filter((entry) => entry.label.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle))
      .slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, objectLibrary, language]);

  const present = new Set(entries.map((entry) => entry.sid));

  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      {entries.map((entry, index) => (
        <div key={`${entry.sid}:${index}`} style={rowStyle}>
          <span title={entry.sid} style={{ fontSize: '12px', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {labelForSid(entry.sid)}
          </span>
          <NumberField
            className="weight-field"
            step={1}
            value={entry.weight}
            title={t('nestedContentWeight')}
            onCommit={(v) => setEntries(entries.map((candidate, i) => (i === index ? { ...candidate, weight: v } : candidate)))}
            style={{ width: '52px', flexShrink: 0 }}
          />
          <button
            type="button"
            className="compact-button danger"
            title={t('nestedContentRemove')}
            style={{ flexShrink: 0 }}
            onClick={() => setEntries(entries.filter((_, i) => i !== index))}
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}

      <div className="library-filter">
        <Search size={14} className="search-icon" />
        <input
          type="search"
          placeholder={t('nestedContentSearchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {pickable.filter((entry) => !present.has(entry.id)).map((entry) => (
        <div key={entry.id} style={rowStyle}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            <button
              type="button"
              className="compact-button primary"
              title={t('nestedContentAdd')}
              style={{ flexShrink: 0 }}
              onClick={() => setEntries([...entries, { sid: entry.id, weight: 1 }])}
            >
              <Plus size={10} />
            </button>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
              <span title={entry.label} style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.label}
              </span>
              <span title={entry.id} style={{ fontSize: '9px', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.id}
              </span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
};
