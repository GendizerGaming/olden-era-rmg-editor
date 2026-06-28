import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useTranslation } from '../../i18n/context';
import { Layers, Plus, Copy, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

export const VariantsSection: React.FC = () => {
  const { t } = useTranslation();
  const variants = useEditorStore((state) => state.variants);
  const activeVariantId = useEditorStore((state) => state.activeVariantId);
  const variantSnapshots = useEditorStore((state) => state.variantSnapshots);
  const zones = useEditorStore((state) => state.zones);
  const edges = useEditorStore((state) => state.edges);
  const actions = useEditorStore((state) => state.actions);
  const [expanded, setExpanded] = useState(false);

  const variantLabel = (index: number) => `${t('variant') || 'Variant'} ${index + 1}`;

  const countsFor = (id: string, isActive: boolean) => {
    if (isActive) return { zones: zones.length, links: edges.length };
    const snapshot = variantSnapshots[id];
    return { zones: snapshot?.zones.length ?? 0, links: snapshot?.edges.length ?? 0 };
  };

  return (
    <section className="collapsible-section">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <h2>
          <Layers size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          {t('variantsTitle') || 'Variants'}
        </h2>
        {expanded ? (
          <ChevronDown size={14} className="collapse-icon" />
        ) : (
          <ChevronRight size={14} className="collapse-icon" />
        )}
      </div>

      {expanded && (
        <div className="collapsible-body">
          <p className="ui-field-hint" style={{ marginBottom: '8px' }}>
            {t('variantsHelp') ||
              'Each variant is an alternative map layout. The game picks one at random when generating a map.'}
          </p>

          <div className="presets-list" style={{ display: 'grid', gap: '4px', marginBottom: '8px' }}>
            {variants.map((variant, index) => {
              const isSelected = variant.id === activeVariantId;
              const counts = countsFor(variant.id, isSelected);
              return (
                <div
                  key={variant.id}
                  className={`preset-list-row ${isSelected ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    background: isSelected ? 'var(--accent-dim)' : 'var(--panel-2)',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid var(--line)',
                    cursor: 'pointer',
                    transition: 'background 150ms ease, border-color 150ms ease'
                  }}
                  onClick={() => actions.setActiveVariant(variant.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500 }}>
                      {variantLabel(index)}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--muted-soft)' }}>
                      {t('variantZonesLinks', { zones: counts.zones, links: counts.links })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="compact-button"
                      title={t('duplicateVariant') || 'Duplicate variant'}
                      onClick={() => actions.duplicateVariant(variant.id)}
                    >
                      <Copy size={10} />
                    </button>
                    <button
                      type="button"
                      className="compact-button danger"
                      title={t('deleteVariant') || 'Delete variant'}
                      disabled={variants.length <= 1}
                      onClick={() => {
                        if (window.confirm(t('confirmDeleteVariant', { name: variantLabel(index) }))) {
                          actions.deleteVariant(variant.id);
                        }
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="small-button"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => actions.addVariant()}
          >
            <Plus size={12} style={{ marginRight: '4px' }} />
            {t('addVariant') || 'Add variant'}
          </button>
        </div>
      )}
    </section>
  );
};
