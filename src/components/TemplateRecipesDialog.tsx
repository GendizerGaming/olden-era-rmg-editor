import React from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';
import { TEMPLATE_RECIPES } from '../store/templateRecipes';
import type { TemplateRecipe } from '../store/templateRecipes';
import { LayoutTemplate, X } from 'lucide-react';

interface TemplateRecipesDialogProps {
  onClose: () => void;
}

/**
 * Whole-template starting points: one click applies the map settings (size,
 * modes) and generates the topology skeleton. Unlike the topology wizard,
 * a recipe replaces everything — the dialog says so up front.
 */
export const TemplateRecipesDialog: React.FC<TemplateRecipesDialogProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const zonesCount = useEditorStore((state) => state.zones.length);
  const actions = useEditorStore((state) => state.actions);

  const handleApply = (recipe: TemplateRecipe) => {
    const name = t(`recipe_${recipe.id}`);
    if (zonesCount > 0 && !window.confirm(t('recipeConfirm', { name }))) return;
    actions.applyTemplateRecipe({ ...recipe, name });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 16, 10, 0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={t('recipesTitle')}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          width: 'min(460px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          display: 'grid',
          gap: '10px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 'var(--fz-emph)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <LayoutTemplate size={15} style={{ color: 'var(--accent)' }} />
            {t('recipesTitle')}
          </strong>
          <button type="button" className="compact-button" onClick={onClose} title={t('topologyClose')}>
            <X size={13} />
          </button>
        </div>

        <p className="ui-field-hint" style={{ margin: 0 }}>{t('recipesDescription')}</p>

        <div style={{ display: 'grid', gap: '6px' }}>
          {TEMPLATE_RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => handleApply(recipe)}
              style={{
                display: 'grid',
                // The global button rule centers content (justify-content);
                // reset it so every row is left-aligned and full-width.
                justifyContent: 'normal',
                justifyItems: 'stretch',
                width: '100%',
                gap: '2px',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--panel-2)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit'
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                <strong style={{ fontSize: 'var(--fz-base)' }}>{t(`recipe_${recipe.id}`)}</strong>
                <span style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)', flexShrink: 0 }}>
                  {t('recipeMeta', {
                    players: recipe.topology.players,
                    size: recipe.settings.sizeX ?? 128
                  })}
                </span>
              </span>
              <span style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)' }}>
                {t(`recipeDesc_${recipe.id}`)}
              </span>
            </button>
          ))}
        </div>

        {zonesCount > 0 && (
          <p className="ui-field-hint" style={{ margin: 0, color: 'var(--accent-2)' }}>
            {t('topologyReplaceWarning', { count: zonesCount })}
          </p>
        )}
      </div>
    </div>
  );
};
