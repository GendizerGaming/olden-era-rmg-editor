import { useEffect, useState } from 'react';
import { PanelLeftOpen, PanelRightOpen, X } from 'lucide-react';
import { useEditorStore } from './store/useEditorStore';
import { TranslationProvider } from './i18n';
import { useTranslation } from './i18n/context';
import { Topbar } from './components/Topbar';
import { LeftPanel } from './components/LeftPanel';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { ToastContainer } from './components/ToastContainer';
import { loadCatalogFromDB } from './services/db';
import { isCoreCatalog } from './store/parsing';
import { useCollapseScrollAnchor } from './components/shared/useCollapseScrollAnchor';

type OverlayPanel = 'left' | 'right' | null;

/**
 * Narrow-screen (<1280px) panel toggles: the workspace shows only the canvas
 * and the side panels open as overlays on top of it.
 */
const PanelToggles: React.FC<{
  overlay: OverlayPanel;
  onToggle: (panel: 'left' | 'right') => void;
}> = ({ overlay, onToggle }) => {
  const { t } = useTranslation();
  return (
    <>
      <button
        type="button"
        className="panel-toggle panel-toggle-left"
        title={overlay === 'left' ? t('panelToggleClose') : t('panelToggleLeft')}
        onClick={() => onToggle('left')}
      >
        {overlay === 'left' ? <X size={16} /> : <PanelLeftOpen size={16} />}
      </button>
      <button
        type="button"
        className="panel-toggle panel-toggle-right"
        title={overlay === 'right' ? t('panelToggleClose') : t('panelToggleRight')}
        onClick={() => onToggle('right')}
      >
        {overlay === 'right' ? <X size={16} /> : <PanelRightOpen size={16} />}
      </button>
    </>
  );
};

function App() {
  const theme = useEditorStore((state) => state.theme);
  const actions = useEditorStore((state) => state.actions);
  // Which side panel is open as an overlay in the narrow (<1280px) mode.
  const [overlayPanel, setOverlayPanel] = useState<OverlayPanel>(null);

  // Keep a collapsed section/subsection anchored under the cursor instead of
  // letting the removed body jump the scroll position.
  useCollapseScrollAnchor();

  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  // Load catalog cache from IndexedDB on startup
  useEffect(() => {
    const loadCache = async () => {
      try {
        const cached = await loadCatalogFromDB();
        // Stale cache shapes (e.g. without heroes/spells) are ignored so the
        // user re-loads Core.zip and gets the full catalog.
        if (cached && isCoreCatalog(cached)) {
          actions.loadCoreCatalog(cached);
        }
      } catch {
        // Ignore cache load error
      }
    };
    loadCache();
  }, [actions]);

  // Bind editor keyboard shortcuts (undo/redo, delete, connect mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Skip hotkeys if user is editing inside input/textarea fields
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // e.code identifies the physical key regardless of keyboard layout,
      // so the shortcuts also work on non-Latin layouts (e.g. Russian).
      if (e.code === 'Escape') {
        setOverlayPanel(null);
      } else if (e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) {
          actions.redo();
        } else {
          actions.undo();
        }
      } else if (e.ctrlKey && e.code === 'KeyY') {
        e.preventDefault();
        actions.redo();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        actions.deleteSelected();
      } else if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const mode = useEditorStore.getState().mode;
        actions.setMode(mode === 'connect' ? 'select' : 'connect');
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        // Stop the browser's "bookmark page" dialog
        e.preventDefault();
        actions.duplicateSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);

  return (
    <TranslationProvider>
      <div className="app-shell">
        <Topbar />
        <main className={`workspace${overlayPanel ? ` show-${overlayPanel}` : ''}`}>
          <LeftPanel />
          <Canvas />
          <RightPanel />
          {overlayPanel && (
            <div className="panel-overlay-backdrop" onClick={() => setOverlayPanel(null)} />
          )}
          <PanelToggles
            overlay={overlayPanel}
            onToggle={(panel) => setOverlayPanel((current) => current === panel ? null : panel)}
          />
        </main>
      </div>
      <ToastContainer />
    </TranslationProvider>
  );
}

export default App;
