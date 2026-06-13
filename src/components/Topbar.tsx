import React, { useRef, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';
import { importTemplateFromJson } from '../services/jsonImporter';
import {
  createTemplateDocument,
  createVisualDesignDocument
} from '../services/editorDocuments';
import { downloadJsonDocument } from '../services/jsonDocument';
import { collectVariants } from '../store/variants';
import type { DesignVariant } from '../services/editorDocuments';
import { TopologyWizard } from './TopologyWizard';
import { TemplateRecipesDialog } from './TemplateRecipesDialog';
import {
  ensurePermission,
  fileExistsInFolder,
  forgetGameFolder,
  getSavedGameFolder,
  isFileSystemAccessSupported,
  looksLikeTemplatesFolder,
  pickGameFolder,
  writeFileToFolder
} from '../services/gameFolder';
import { Upload, Download, FileJson, Languages, Sun, Moon, Wand2, LayoutTemplate, Coffee } from 'lucide-react';
import { DONATION_URL } from '../constants/donations';

export const Topbar: React.FC = () => {
  const { t, language } = useTranslation();
  const settings = useEditorStore((state) => state.settings);
  const zones = useEditorStore((state) => state.zones);
  const edges = useEditorStore((state) => state.edges);
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const factions = useEditorStore((state) => state.factions);
  const artifactLists = useEditorStore((state) => state.artifactLists);
  const presets = useEditorStore((state) => state.presets);
  const customObjectLists = useEditorStore((state) => state.customObjectLists);
  const theme = useEditorStore((state) => state.theme);
  const uiMode = useEditorStore((state) => state.uiMode);
  const actions = useEditorStore((state) => state.actions);
  const variants = useEditorStore((state) => state.variants);
  const activeVariantId = useEditorStore((state) => state.activeVariantId);
  const variantSnapshots = useEditorStore((state) => state.variantSnapshots);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
  const [showTopologyWizard, setShowTopologyWizard] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);

  const handleLanguageToggle = () => {
    actions.updateSettings((prev) => ({
      language: prev.language === 'ru' ? 'en' : 'ru'
    }));
  };

  const triggerImportFile = () => {
    if (!useEditorStore.getState().coreCatalog) {
      alert(t("coreRequiredBeforeImport"));
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const design: unknown = JSON.parse(reader.result as string);
        actions.importDesign(design);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        alert(t("importFailed", { error: message }));
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const triggerImportTemplate = () => {
    if (!useEditorStore.getState().coreCatalog) {
      alert(t("coreRequiredBeforeImport"));
      return;
    }
    templateFileInputRef.current?.click();
  };

  const handleImportTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json: unknown = JSON.parse(reader.result as string);
        const design = importTemplateFromJson(json, objectLibrary, factions);
        // Guard against absent-mindedly overwriting the imported original:
        // the copy announces itself in the template name.
        if (typeof design.settings.name === 'string' && !design.settings.name.endsWith('(copy)')) {
          design.settings.name = `${design.settings.name} (copy)`;
        }
        actions.importDesign(design);
        
        if (design.warnings && design.warnings.length > 0) {
          const alertTitle = language === 'ru' ? 'Предупреждения при импорте:' : 'Import Warnings:';
          alert(`${alertTitle}\n\n${design.warnings.join('\n')}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        alert(t("importFailed", { error: message }));
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const collectDesignVariants = (): DesignVariant[] =>
    collectVariants({
      zones,
      edges,
      settings,
      variants,
      activeVariantId,
      variantSnapshots
    }).map(({ meta, snapshot }) => ({ id: meta.id, ...snapshot }));

  const handleExportDesign = () => {
    downloadJsonDocument(createVisualDesignDocument({
      settings,
      zones,
      edges,
      presets,
      customObjectLists,
      variants: collectDesignVariants(),
      activeVariantId
    }));
  };

  // Files already confirmed for overwriting in this session: the first save
  // over an existing file asks, the following iterations write silently.
  const confirmedOverwritesRef = useRef<Set<string>>(new Set());

  /**
   * The export button does double duty: with a game folder picked it writes
   * the file straight into map_templates, otherwise it downloads as before.
   * Shift+click picks/changes the folder, Ctrl+click forces a download.
   */
  const handleExportTemplate = async (event: React.MouseEvent) => {
    const templateDocument = createTemplateDocument({
      settings,
      zones,
      edges,
      objectLibrary,
      artifactLists,
      presets,
      customObjectLists,
      extraVariants: collectDesignVariants().filter((variant) => variant.id !== activeVariantId)
    });

    const forceDownload = event.ctrlKey;
    const forcePick = event.shiftKey;

    if (!forceDownload && isFileSystemAccessSupported()) {
      let folder = forcePick ? null : await getSavedGameFolder();
      if (folder && !(await ensurePermission(folder))) {
        folder = null;
      }
      if (!folder && forcePick) {
        folder = await pickGameFolder();
        if (!folder) {
          actions.addNotification('notificationFsCancelled', {}, 'info');
          return;
        }
        if (!(await ensurePermission(folder))) {
          await forgetGameFolder();
          actions.addNotification('notificationFsDenied', {}, 'error');
          return;
        }
        if (!(await looksLikeTemplatesFolder(folder))) {
          actions.addNotification('notificationFsOddFolder', { name: folder.name }, 'warn');
        }
      }

      if (folder) {
        try {
          const fileName = templateDocument.filename;
          if (
            !confirmedOverwritesRef.current.has(fileName) &&
            (await fileExistsInFolder(folder, fileName)) &&
            !window.confirm(t('confirmOverwriteGameFile', { name: fileName }))
          ) {
            return;
          }
          confirmedOverwritesRef.current.add(fileName);
          await writeFileToFolder(folder, fileName, templateDocument.json);
          actions.addNotification('notificationSavedToGame', { name: fileName }, 'success');
          return;
        } catch {
          // A stale handle (folder moved/deleted) is the usual cause —
          // forget it and fall back to the plain download below.
          await forgetGameFolder();
          actions.addNotification('notificationFsWriteFailed', {}, 'error');
        }
      }
    } else if (forcePick && !isFileSystemAccessSupported()) {
      actions.addNotification('notificationFsUnsupported', {}, 'error');
    }

    downloadJsonDocument(templateDocument);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">OE</span>
        <div>
          <h1>RMG Visual Template Editor</h1>
          <p>{t('brandSubtitle')}</p>
        </div>
      </div>
      
      <div className="toolbar" aria-label={t('toolbarLabel')}>
        <button
          id="templateRecipesBtn"
          type="button"
          onClick={() => setShowRecipes(true)}
          title={t('recipesTooltip')}
        >
          <LayoutTemplate size={14} />
          {t('recipesButton')}
        </button>
        <button
          id="topologyWizardBtn"
          type="button"
          onClick={() => setShowTopologyWizard(true)}
          title={t('topologyWizardTooltip')}
        >
          <Wand2 size={14} />
          {t('topologyWizardButton')}
        </button>
        {/* Rare file operations are icon-only to keep the bar on one row */}
        <button
          id="importDesignBtn"
          type="button"
          className="icon-button"
          onClick={triggerImportFile}
          title={`${t('importDesign')} — ${t('importDesignTitle')}`}
        >
          <Upload size={14} />
        </button>
        <button
          id="exportDesignBtn"
          type="button"
          className="icon-button"
          onClick={handleExportDesign}
          title={`${t('exportDesign')} — ${t('exportDesignTitle')}`}
        >
          <Download size={14} />
        </button>
        <button
          id="importTemplateBtn"
          type="button"
          onClick={triggerImportTemplate}
          title={t('importTemplateText')}
        >
          <Upload size={14} />
          {t('importTemplate')}
        </button>
        <button
          id="exportTemplateBtn"
          type="button"
          className="primary"
          onClick={(e) => { void handleExportTemplate(e); }}
          title={t('exportTemplateTitle')}
        >
          <FileJson size={14} />
          {t('exportTemplate')}
        </button>

        <div className="ui-mode-toggle" role="group" aria-label={t('uiModeLabel')}>
          <button
            type="button"
            className={uiMode === 'simple' ? 'active' : ''}
            title={t('uiModeSimpleTitle')}
            onClick={() => actions.setUiMode('simple')}
          >
            {t('uiModeSimple')}
          </button>
          <button
            type="button"
            className={uiMode === 'expert' ? 'active' : ''}
            title={t('uiModeExpertTitle')}
            onClick={() => actions.setUiMode('expert')}
          >
            {t('uiModeExpert')}
          </button>
        </div>

        <button id="themeToggleBtn" type="button" className="icon-button" onClick={actions.toggleTheme} title={theme === 'dark' ? t('themeLight') : t('themeDark')}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button id="languageToggleBtn" type="button" onClick={handleLanguageToggle} title={t('languageTitle')}>
          <Languages size={14} />
          {language.toUpperCase()}
        </button>
        <a
          id="donateBtn"
          className="icon-button"
          href={DONATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t('donateTitle')}
        >
          <Coffee size={14} />
        </a>
        
        <input
          ref={fileInputRef}
          id="importDesignInput"
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          style={{ display: 'none' }}
        />
        
        <input
          ref={templateFileInputRef}
          id="importTemplateInput"
          type="file"
          accept="application/json,.json"
          onChange={handleImportTemplate}
          style={{ display: 'none' }}
        />
      </div>

      {showTopologyWizard && <TopologyWizard onClose={() => setShowTopologyWizard(false)} />}
      {showRecipes && <TemplateRecipesDialog onClose={() => setShowRecipes(false)} />}
    </header>
  );
};
