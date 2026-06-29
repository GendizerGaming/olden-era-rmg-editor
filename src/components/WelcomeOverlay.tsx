import React, { useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';
import { FileArchive, LayoutTemplate, Wand2, Upload, Check, X, BookOpen, Sliders } from 'lucide-react';

const DISMISS_KEY = 'olden-era-rmg-welcome-dismissed';

/**
 * The getting-started card: auto-shown over an empty canvas (until dismissed)
 * and reopenable any time via the floating «Памятка» button. The action
 * buttons drive the existing topbar/left-panel controls, so there is exactly
 * one code path per action.
 */
export const WelcomeOverlay: React.FC<{ memoRight?: string }> = ({ memoRight = '16px' }) => {
  const { t } = useTranslation();
  const zonesCount = useEditorStore((state) => state.zones.length);
  const coreCatalog = useEditorStore((state) => state.coreCatalog);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [manualOpen, setManualOpen] = useState(false);

  // Auto-opened cards step aside as soon as the map gets zones (e.g. right
  // after a recipe); a manually opened card stays until closed.
  const visible = manualOpen || (zonesCount === 0 && !dismissed);

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore
    }
    setDismissed(true);
    setManualOpen(false);
  };

  const click = (id: string) => document.getElementById(id)?.click();

  const openZonePresets = () => {
    const header = document.getElementById('zonePresetsHeader');
    if (header && !header.closest('section')?.querySelector('.collapsible-body')) {
      header.click();
    }
    header?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const stepRow: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '158px minmax(0, 1fr)',
    alignItems: 'center',
    gap: '10px'
  };
  const stepButton: React.CSSProperties = {
    width: '100%',
    justifyContent: 'center',
    fontSize: 'var(--fz-base)',
    padding: '6px 9px'
  };
  const stepText: React.CSSProperties = { margin: 0, minWidth: 0 };

  return (
    <>
      {/* Same look and column as the other right-side canvas buttons */}
      <div
        className="canvas-widget-group memo-widget"
        style={{ right: memoRight }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={t('welcomeReopenTitle')}
          onClick={() => setManualOpen(true)}
        >
          <BookOpen size={16} />
        </button>
      </div>

      {visible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              pointerEvents: 'auto',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow)',
              padding: '16px 18px',
              width: 'min(500px, calc(100% - 40px))',
              maxHeight: 'calc(100% - 32px)',
              overflowY: 'auto',
              display: 'grid',
              gap: '11px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 'var(--fz-emph)' }}>{t('welcomeTitle')}</strong>
              <button type="button" className="compact-button" title={t('welcomeDismiss')} onClick={close}>
                <X size={13} />
              </button>
            </div>

            <div style={stepRow}>
              <button
                type="button"
                className={`small-button${coreCatalog ? '' : ' primary'}`}
                style={stepButton}
                disabled={Boolean(coreCatalog)}
                onClick={() => click('coreZipInput')}
              >
                {coreCatalog ? <Check size={12} style={{ marginRight: '4px', flexShrink: 0 }} /> : <FileArchive size={12} style={{ marginRight: '4px', flexShrink: 0 }} />}
                {coreCatalog ? t('welcomeCoreLoaded') : t('welcomeCoreBtn')}
              </button>
              <span className="ui-field-hint" style={stepText}>{t('welcomeCoreText')}</span>
            </div>

            <div style={stepRow}>
              <button type="button" className="small-button" style={stepButton} onClick={() => click('templateRecipesBtn')}>
                <LayoutTemplate size={12} style={{ marginRight: '4px', flexShrink: 0 }} />
                {t('recipesButton')}
              </button>
              <span className="ui-field-hint" style={stepText}>{t('welcomeRecipesText')}</span>
            </div>

            <div style={stepRow}>
              <button type="button" className="small-button" style={stepButton} onClick={() => click('topologyWizardBtn')}>
                <Wand2 size={12} style={{ marginRight: '4px', flexShrink: 0 }} />
                {t('topologyWizardButton')}
              </button>
              <span className="ui-field-hint" style={stepText}>{t('welcomeWizardText')}</span>
            </div>

            <div style={stepRow}>
              <button type="button" className="small-button" style={stepButton} onClick={openZonePresets}>
                <Sliders size={12} style={{ marginRight: '4px', flexShrink: 0 }} />
                {t('welcomeManualBtn')}
              </button>
              <span className="ui-field-hint" style={stepText}>{t('welcomeManualText')}</span>
            </div>

            <div style={stepRow}>
              <button type="button" className="small-button" style={stepButton} onClick={() => click('importTemplateBtn')}>
                <Upload size={12} style={{ marginRight: '4px', flexShrink: 0 }} />
                {t('importTemplate')}
              </button>
              <span className="ui-field-hint" style={stepText}>{t('welcomeImportText')}</span>
            </div>

            <p className="ui-field-hint" style={{ margin: 0 }}>{t('welcomeFootnote')}</p>
          </div>
        </div>
      )}
    </>
  );
};
