import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { CatalogItem } from '../../types/editor';
import { NumberField } from './NumberField';
import { ListRow } from './primitives';
import { Plus, Search, Trash2 } from 'lucide-react';

type WeightedEntry = { sid: string; weight: number; variant?: number };

/**
 * Inline weighted candidate list for a pool-slot object: rows of
 * {sid, variant, weight} with add (by search) and remove. Clearing the last row
 * drops the array so the object exports without an inline `content`.
 *
 * The same sid may appear several times with different variants (one sid can
 * cover several concrete items), so rows are addressed by index and the picker
 * only hides a sid that is present without a variant.
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

  // Only a plain (variant-less) row blocks re-picking; variants are additive.
  const present = new Set(entries.filter((entry) => entry.variant === undefined).map((entry) => entry.sid));

  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      {entries.map((entry, index) => (
        <ListRow
          key={`${entry.sid}:${index}`}
          title={entry.variant === undefined
            ? labelForSid(entry.sid)
            : `${labelForSid(entry.sid)} · v${entry.variant}`}
          titleTooltip={entry.sid}
          trailing={
            <>
              <input
                type="number"
                className="weight-field"
                min={0}
                step={1}
                value={entry.variant ?? ''}
                placeholder={t('nestedContentVariantAny')}
                title={t('nestedContentVariant')}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const variant = raw === '' ? undefined : Math.max(0, Math.trunc(Number(raw)));
                  setEntries(entries.map((candidate, i) => {
                    if (i !== index) return candidate;
                    const next: WeightedEntry = { ...candidate };
                    if (variant === undefined) delete next.variant;
                    else next.variant = variant;
                    return next;
                  }));
                }}
                style={{ width: '46px', flexShrink: 0 }}
              />
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
                onClick={() => setEntries(entries.filter((_, i) => i !== index))}
              >
                <Trash2 size={10} />
              </button>
            </>
          }
        />
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
        <ListRow
          key={entry.id}
          leading={
            <button
              type="button"
              className="compact-button primary"
              title={t('nestedContentAdd')}
              onClick={() => setEntries([...entries, { sid: entry.id, weight: 1 }])}
            >
              <Plus size={10} />
            </button>
          }
          title={entry.label}
          subtitle={entry.id}
        />
      ))}
    </div>
  );
};
