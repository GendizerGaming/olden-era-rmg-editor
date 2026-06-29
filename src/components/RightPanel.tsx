import React, { useState } from 'react';
import { useEditorStore, zonesEqualIgnoreCoords } from '../store/useEditorStore';
import type { EditorStoreState } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';
import { validate } from '../services/validator';
import { analyzeBalance } from '../services/balanceAnalyzer';
import type { BalanceReport } from '../services/balanceAnalyzer';
import { createTemplateDocument } from '../services/editorDocuments';
import { Edit3, AlertTriangle, FileCode, ChevronDown, ChevronRight, Gauge, CheckCircle2, XCircle } from 'lucide-react';
import { ZoneInspector } from './right/ZoneInspector';
import { PresetInspector } from './right/PresetInspector';
import { EdgeInspector } from './right/EdgeInspector';
import { EdgePairInspector } from './right/EdgePairInspector';
import { CustomListInspector } from './right/CustomListInspector';
import { ElementsListInspector } from './right/ElementsListInspector';
import { TerrainProfileInspector } from './right/TerrainProfileInspector';
import { ContentLimitInspector } from './right/ContentLimitInspector';
import { ContentPoolInspector } from './right/ContentPoolInspector';

export const RightPanel: React.FC = () => {
  const { t, language } = useTranslation();
  const [inspectorCollapse, setInspectorCollapse] = useState<{
    selectionKey: string | null;
    collapsed: boolean;
  }>({ selectionKey: null, collapsed: false });
  const [isValidationExpanded, setIsValidationExpanded] = useState(true);
  const [isBalanceExpanded, setIsBalanceExpanded] = useState(true);
  const [isJsonExpanded, setIsJsonExpanded] = useState(true);
  const settings = useEditorStore((state) => state.settings);
  const zones = useEditorStore((state: EditorStoreState) => state.zones, zonesEqualIgnoreCoords);
  const edges = useEditorStore((state) => state.edges);
  const selected = useEditorStore((state) => state.selected);
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const coreCatalog = useEditorStore((state) => state.coreCatalog);
  const artifactLists = useEditorStore((state) => state.artifactLists);
  const factions = useEditorStore((state) => state.factions);
  const presets = useEditorStore((state) => state.presets);
  const customObjectLists = useEditorStore((state) => state.customObjectLists);
  const missingPresetItems = useEditorStore((state) => state.missingPresetItems);
  const missingImportedObjects = useEditorStore((state) => state.missingImportedObjects);
  const isExpert = useEditorStore((state) => state.uiMode) === 'expert';
  const actions = useEditorStore((state) => state.actions);

  const selectedZone = selected?.type === 'zone' ? zones.find((z) => z.id === selected.id) : null;
  const selectedEdge = selected?.type === 'edge' ? edges.find((e) => e.id === selected.id) : null;
  const selectedTerrainProfile = selected?.type === 'terrainProfile'
    ? settings.terrainProfiles.find((profile) => profile.name === selected.id)
    : null;
  const selectedContentLimit = selected?.type === 'contentLimits'
    ? settings.contentLimitPresets.find((preset) => preset.name === selected.id)
    : null;
  const selectedContentPool = selected?.type === 'contentPool'
    ? settings.contentPoolPresets.find((preset) => preset.name === selected.id)
    : null;
  const selectionKey = selected ? `${selected.type}:${selected.id}` : null;
  const isInspectorExpanded =
    inspectorCollapse.selectionKey !== selectionKey || !inspectorCollapse.collapsed;
  const toggleInspector = () => {
    setInspectorCollapse({
      selectionKey,
      collapsed: isInspectorExpanded
    });
  };

  // Real-time RMG template generation and validation debounced to keep UI smooth during dragging
  const [jsonPreview, setJsonPreview] = React.useState('');
  const [validationMessages, setValidationMessages] = React.useState<Array<['ok' | 'warn' | 'error', string]>>([]);
  const [balanceReport, setBalanceReport] = React.useState<BalanceReport | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const templateDocument = createTemplateDocument({
        settings,
        zones,
        edges,
        objectLibrary,
        artifactLists,
        presets,
        customObjectLists
      });
      setJsonPreview(templateDocument.json);

      const msgs = validate(
        settings,
        zones,
        edges,
        !!coreCatalog,
        missingPresetItems,
        missingImportedObjects,
        t,
        customObjectLists,
        objectLibrary,
        coreCatalog?.builtInPoolNames
      );
      setValidationMessages(msgs);
      setBalanceReport(analyzeBalance(settings, zones, edges, t));
    }, 150);

    return () => clearTimeout(timer);
  }, [settings, zones, edges, objectLibrary, artifactLists, presets, coreCatalog, missingPresetItems, missingImportedObjects, t, customObjectLists]);

  return (
    <aside className="panel right-panel" aria-label={t('inspector')}>
      {/* Inspector Section */}
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={toggleInspector}>
          <h2>
            <Edit3 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('inspector')}
          </h2>
          {isInspectorExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>
        {isInspectorExpanded && (
          <div className="collapsible-body">
            <div id="inspector">
              {selectedZone && (
                <ZoneInspector
                  zone={selectedZone}
                  zones={zones}
                  factions={factions}
                  actions={actions}
                  t={t}
                  language={language}
                />
              )}
              {selectedEdge && (
                <EdgeInspector
                  edge={selectedEdge}
                  edges={edges}
                  actions={actions}
                  t={t}
                />
              )}
              {selected?.type === 'edgePair' && (
                <EdgePairInspector
                  pairId={selected.id}
                  edges={edges}
                  actions={actions}
                  t={t}
                />
              )}
              {selected?.type === 'preset' && (
                <PresetInspector
                  presetId={selected.id}
                  presets={presets}
                  actions={actions}
                  t={t}
                  language={language}
                />
              )}
              {selected?.type === 'customList' && (
                <CustomListInspector
                  listId={selected.id}
                  customObjectLists={customObjectLists}
                  actions={actions}
                  t={t}
                  language={language}
                  objectLibrary={objectLibrary}
                />
              )}
              {selected?.type === 'elementsList' && (
                <ElementsListInspector
                  zones={zones}
                  edges={edges}
                  actions={actions}
                  t={t}
                  language={language}
                />
              )}
              {selectedTerrainProfile && (
                <TerrainProfileInspector
                  key={selectedTerrainProfile.name}
                  profile={selectedTerrainProfile}
                  zones={zones}
                  actions={actions}
                  t={t}
                />
              )}
              {selectedContentLimit && (
                <ContentLimitInspector
                  key={selectedContentLimit.name}
                  preset={selectedContentLimit}
                  zones={zones}
                  actions={actions}
                  t={t}
                  language={language}
                />
              )}
              {selectedContentPool && (
                <ContentPoolInspector
                  key={selectedContentPool.name}
                  preset={selectedContentPool}
                  zones={zones}
                  actions={actions}
                  t={t}
                  language={language}
                />
              )}
              {!selectedZone && !selectedEdge && !selectedTerrainProfile && !selectedContentLimit && !selectedContentPool && selected?.type !== 'edgePair' && selected?.type !== 'preset' && selected?.type !== 'customList' && selected?.type !== 'elementsList' && (
                <div className="inspector-empty">{t('emptyInspector')}</div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Validation Section */}
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsValidationExpanded(!isValidationExpanded)}>
          <h2>
            <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('validation')}
            {/* Worst-severity glyph, visible even when the section is collapsed */}
            {validationMessages.some(([level]) => level === 'error') ? (
              <XCircle size={14} style={{ marginLeft: '8px', verticalAlign: 'middle', color: 'var(--danger)' }} aria-label={t('validationStatusError')} />
            ) : validationMessages.some(([level]) => level === 'warn') ? (
              <AlertTriangle size={14} style={{ marginLeft: '8px', verticalAlign: 'middle', color: 'var(--accent-2)' }} aria-label={t('validationStatusWarn')} />
            ) : (
              <CheckCircle2 size={14} style={{ marginLeft: '8px', verticalAlign: 'middle', color: 'var(--ok)' }} aria-label={t('validationStatusOk')} />
            )}
          </h2>
          {isValidationExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>
        {isValidationExpanded && (
          <div className="collapsible-body">
            <div className="validation-list">
              {!coreCatalog && (
                <div className="validation-core-loader">
                  <strong>{t('coreRequiredValidationTitle')}</strong>
                  <span>{t('coreRequiredValidationText')}</span>
                  <button 
                    type="button" 
                    onClick={() => document.getElementById('coreZipInput')?.click()}
                  >
                    {t('loadCore')}
                  </button>
                </div>
              )}

              {validationMessages.map(([level, text], idx) => (
                <div key={idx} className={`validation-item ${level}`}>
                  {text}
                </div>
              ))}

              {validationMessages.length === 0 && (
                <div className="validation-item ok">
                  {t('validationValid')}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Balance Analysis Section */}
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsBalanceExpanded(!isBalanceExpanded)}>
          <h2>
            <Gauge size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('balanceTitle')}
            {balanceReport?.score !== null && balanceReport?.score !== undefined && (
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: 'var(--fz-caption)',
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: '9px',
                  color: 'var(--on-accent)',
                  background: balanceReport.score >= 85
                    ? 'var(--ok)'
                    : balanceReport.score >= 60 ? 'var(--accent-2)' : 'var(--danger)'
                }}
              >
                {balanceReport.score}
              </span>
            )}
          </h2>
          {isBalanceExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>
        {isBalanceExpanded && balanceReport && (
          <div className="collapsible-body">
            <p className="ui-field-hint" style={{ margin: '0 0 8px' }}>
              {t('balanceSummaryZones', {
                zones: balanceReport.summary.zones,
                connections: balanceReport.summary.connections,
                players: balanceReport.summary.players
              })}
              <br />
              {t('balanceSummaryWealth', {
                total: Math.round(balanceReport.summary.totalWealth / 1000),
                per: Math.round(balanceReport.summary.wealthPerPlayer / 1000),
                guard: balanceReport.summary.averageGuard
              })}
            </p>
            <div className="validation-list">
              {balanceReport.findings.map(([severity, text], idx) => (
                <div key={idx} className={`validation-item ${severity === 'bad' ? 'error' : severity}`}>
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* JSON Section */}
      {isExpert && (
      <section
        className="collapsible-section json-section"
        style={isJsonExpanded 
          ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: '200px' } 
          : { flex: 'none', minHeight: 0 }
        }
      >
        <div className="collapsible-header" onClick={() => setIsJsonExpanded(!isJsonExpanded)}>
          <h2>
            <FileCode size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('json')}
          </h2>
          {isJsonExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>
        {isJsonExpanded && (
          <div className="collapsible-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <textarea
              id="jsonPreview"
              spellCheck={false}
              readOnly
              value={jsonPreview}
            />
          </div>
        )}
      </section>
      )}
    </aside>
  );
};

// Sub-component for Zone settings inspector
