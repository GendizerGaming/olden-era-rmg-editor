import React, { useRef, useState, useMemo } from 'react';
import { useEditorStore, zonesEqualIgnoreCoords, catalogItemForReference, zoneTypes, isBuiltInProfileName, isBuiltInLimitName } from '../store/useEditorStore';
import { PRESET_RECIPES, PRESET_ROLES, PRESET_TIERS } from '../store/presetRecipes';
import type { PresetRole, PresetTier } from '../store/presetRecipes';
import type { EditorStoreState } from '../store/useEditorStore';
import { biomeColors } from '../constants/biomes';
import { useTranslation } from '../i18n/context';
import { loadCoreCatalogFromZipFile } from '../services/coreParser';
import { Settings, Plus, Library, Search, FileArchive, Check, Download, Upload, Trash2, Copy, Sliders, Trophy, Compass, ChevronDown, ChevronRight, Mountain, AlertTriangle, ListChecks, Coins, RotateCcw } from 'lucide-react';
import type {
  CatalogItem,
  CustomObjectList,
  CustomObjectListEntry,
  MapSettings
} from '../types/editor';
import { fieldUpdate } from './shared/forms';
import { LazyDetails } from './shared/LazyDetails';
import { isPresetBaseType, isHeroLimitMode } from './shared/guards';
import { knownMapSizes, itemLabel, itemDescription, describeCatalogItem, sortedObjectLibrary } from './left/helpers';
import { VariantsSection } from './left/VariantsSection';
import { BansSection } from './left/BansSection';
import { BonusesSection } from './left/BonusesSection';
import { ValueOverridesSection } from './left/ValueOverridesSection';
import { NumberField } from './shared/NumberField';
import { ValueBadge } from './shared/ValueBadge';
import { presetDisplayName } from './shared/presetNames';
import { applyPreset, matchesPreset, presetBySid, WIN_CONDITION_PRESETS } from '../store/winConditions';


export const LeftPanel: React.FC = () => {
  const { t, language } = useTranslation();
  const settings = useEditorStore((state) => state.settings);
  const isExpert = useEditorStore((state) => state.uiMode) === 'expert';
  const variants = useEditorStore((state) => state.variants);
  const activeVariantId = useEditorStore((state) => state.activeVariantId);
  const zones = useEditorStore((state: EditorStoreState) => state.zones, zonesEqualIgnoreCoords);
  const selected = useEditorStore((state) => state.selected);
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const coreCatalog = useEditorStore((state) => state.coreCatalog);
  const presets = useEditorStore((state) => state.presets);
  const customObjectLists = useEditorStore((state) => state.customObjectLists);

  const getEntryName = (entry: CustomObjectListEntry): string => {
    if (entry.kind === 'list') {
      const nested = customObjectLists[entry.value];
      return nested ? nested.label : entry.value;
    } else {
      const item = catalogItemForReference(objectLibrary, { kind: 'sid', value: entry.value });
      if (item) {
        return item.labelByLang?.[language] || item.label || item.sid || item.id;
      }
      return entry.value;
    }
  };

  const getCustomListTooltip = (list: CustomObjectList): string => {
    const nameStr = `${t('customListLabelLabel') || 'Название'}: ${list.label}`;
    const idStr = `ID: ${list.id}`;
    const descStr = `${t('objectDescription') || 'Описание'}: ${t('customListDescription') || 'Custom object set'}`;
    const header = `${nameStr}\n${idStr}\n${descStr}`;
    
    if (!list.entries || list.entries.length === 0) {
      return `${header}\n\n${t('emptyCustomListTip') || 'Select objects in left panel and click + to add them here.'}`;
    }
    const entriesHeader = `${t('customListEntriesTitle') || 'Содержимое'}:`;
    const entriesStr = list.entries
      .slice(0, 15)
      .map((entry) => `  • ${getEntryName(entry)} (x${entry.weight})`)
      .join('\n');
    const suffix = list.entries.length > 15 ? `\n  ... (+${list.entries.length - 15} more)` : '';
    return `${header}\n\n${entriesHeader}\n${entriesStr}${suffix}`;
  };

  // Everything starts collapsed: the canvas (with the welcome card on an
  // empty map) is the entry point, the sections open on demand.
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);
  const [isTerrainExpanded, setIsTerrainExpanded] = useState(false);
  const [isLimitsExpanded, setIsLimitsExpanded] = useState(false);
  const [isPoolsExpanded, setIsPoolsExpanded] = useState(false);
  const [isCustomListsExpanded, setIsCustomListsExpanded] = useState(false);
  const [isObjectsExpanded, setIsObjectsExpanded] = useState(false);

  const [useCustomMapSize, setUseCustomMapSize] = useState(() => {
    const { sizeX, sizeZ } = settings;
    return sizeX !== sizeZ || !knownMapSizes.includes(sizeX);
  });
  const matchingSizePreset =
    settings.sizeX === settings.sizeZ && knownMapSizes.includes(settings.sizeX)
      ? String(settings.sizeX)
      : 'custom';
  const sizePreset = useCustomMapSize ? 'custom' : matchingSizePreset;
  
  const [customListSearchQuery, setCustomListSearchQuery] = useState('');
  const [showCreateCustomListForm, setShowCreateCustomListForm] = useState(false);
  const [newCustomListName, setNewCustomListName] = useState('');
  const [newCustomListId, setNewCustomListId] = useState('');
  const [newCustomListCloneSource, setNewCustomListCloneSource] = useState('');

  const actions = useEditorStore((state) => state.actions);
  const selectedZone = selected?.type === 'zone' ? zones.find((z) => z.id === selected.id) : null;

  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetBaseType, setNewPresetBaseType] = useState<'spawn' | 'blank' | 'low' | 'medium' | 'high' | 'neutral' | 'custom'>('low');
  const [newPresetCloneSource, setNewPresetCloneSource] = useState<string>('');
  const [newPresetRole, setNewPresetRole] = useState<PresetRole | ''>('');
  const [newPresetTier, setNewPresetTier] = useState<PresetTier>('medium');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const presetsFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    // The role+tier recipe and cloning are mutually exclusive: the recipe
    // seeds the calibrated values on top of the base type's default objects.
    const recipe = newPresetRole ? PRESET_RECIPES[newPresetRole][newPresetTier] : null;
    actions.createPreset(
      newPresetName.trim(),
      newPresetBaseType,
      recipe ? undefined : newPresetCloneSource || undefined,
      recipe ? { ...recipe.values } : undefined
    );
    setNewPresetName('');
    setNewPresetCloneSource('');
    setNewPresetRole('');
    setNewPresetTier('medium');
    setShowCreateForm(false);
  };

  const handleExportPresets = () => {
    const customOnly = Object.fromEntries(
      Object.entries(presets).filter(([, preset]) => preset.isCustom)
    );
    if (Object.keys(customOnly).length === 0) {
      alert(t('noCustomPresets'));
      return;
    }
    const blob = new Blob([JSON.stringify(customOnly, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-presets.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportPresets = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported: unknown = JSON.parse(reader.result as string);
        actions.importPresets(imported);
        alert(t('presetImportSuccess'));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        alert(t('presetImportError', { error: message }));
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const isPresetSelected = selected?.type === 'preset';
  const selectedPresetId = isPresetSelected ? selected?.id : null;
  const activeCustomListId = selected?.type === 'customList' ? selected.id : null;
  const isAddDisabled = !selectedZone && !selectedPresetId && !activeCustomListId;

  const handleAddObject = (item: CatalogItem) => {
    if (activeCustomListId) {
      actions.addEntryToCustomList(activeCustomListId, {
        kind: item.kind,
        value: item.kind === 'list' ? (item.includeList || '') : (item.sid || item.id),
        weight: 100
      });
      const lang = settings.language;
      const label = item?.labelByLang?.[lang] || item?.label || item?.sid || item?.includeList || item?.id || "";
      actions.addNotification('notificationObjectAddedToCustomList', { name: label, listName: customObjectLists[activeCustomListId]?.label || activeCustomListId }, 'success');
    } else if (selectedZone) {
      actions.addObjectToZone(selectedZone.id, item);
    } else if (selectedPresetId) {
      actions.addObjectToPreset(selectedPresetId, item);
    }
  };

  const getAddButtonTooltip = () => {
    if (activeCustomListId) {
      const listName = customObjectLists[activeCustomListId]?.label || activeCustomListId;
      return t('addObjectToCustomListTitle', { listName }) || `Add to list [${listName}]`;
    }
    return selectedZone 
      ? t('addObjectTitle') 
      : selectedPresetId 
        ? t('addObjectToPresetTitle') || 'Add to selected preset' 
        : t('chooseZoneFirst');
  };

  const coreZipInputRef = useRef<HTMLInputElement>(null);
  const [coreLoadingState, setCoreLoadingState] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
  const [coreLoadingError, setCoreLoadingError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(50);

  const handleSettingChange = <K extends keyof MapSettings>(field: K, value: MapSettings[K]) => {
    actions.updateSettings(fieldUpdate<MapSettings, K>(field, value));
  };

  const handleSizePresetChange = (preset: string) => {
    setUseCustomMapSize(preset === 'custom');
    if (preset !== 'custom') {
      const size = Number(preset);
      actions.updateSettings({ sizeX: size, sizeZ: size });
    }
  };

  const handleLoadCoreZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCoreLoadingState('loading');
    try {
      const catalog = await loadCoreCatalogFromZipFile(file, language);
      actions.loadCoreCatalog(catalog);
      setCoreLoadingState('success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setCoreLoadingState('failed');
      setCoreLoadingError(message);
      alert(t("coreLoadFailed", { error: message }));
    } finally {
      event.target.value = '';
    }
  };



  // Shared win-condition parameter blocks (used by both the simple summary and
  // the expert flag groups).
  const indentedBlock = { display: 'grid', gap: '8px', borderLeft: '2px solid var(--accent)', paddingLeft: '8px', marginBottom: '8px', marginTop: '4px' } as const;
  const victoryGroupLabelStyle = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--muted-soft)', marginTop: '8px', marginBottom: '4px', borderTop: '1px solid var(--line)', paddingTop: '10px' } as const;

  const renderLostStartCityDay = () => (
    <div style={indentedBlock}>
      <label style={{ marginBottom: 0 }}>
        <span>{t('victoryHoldDays')}</span>
        <NumberField min={0} max={30} step={1} value={settings.lostStartCityDay} onCommit={(v) => handleSettingChange('lostStartCityDay', v)} />
      </label>
    </div>
  );

  const renderCityHoldTarget = () => (
    <div style={indentedBlock}>
      <label style={{ marginBottom: 0 }}>
        <span>{t('victoryCityZone')}</span>
        <select value={settings.victoryCityZoneId} onChange={(e) => handleSettingChange('victoryCityZoneId', e.target.value)}>
          <option value="">{t('selectVictoryCityZone')}</option>
          {zones.filter(z => (z.mainObjects || []).some(obj => obj.type === 'City') && z.type !== 'spawn').map(z => (
            <option key={z.id} value={z.id}>{z.id} ({z.label})</option>
          ))}
        </select>
      </label>
      <label style={{ marginBottom: 0 }}>
        <span>{t('victoryHoldDays')}</span>
        <NumberField min={1} max={30} step={1} value={settings.cityHoldDays} onCommit={(v) => handleSettingChange('cityHoldDays', v)} />
      </label>
    </div>
  );

  const renderGladiatorParams = () => (
    <div style={indentedBlock}>
      <div className="field-row">
        <label>
          <span>{t('gladiatorStartDay')}</span>
          <NumberField min={0} max={99} value={settings.gladiatorArenaDaysDelayStart} onCommit={(v) => handleSettingChange('gladiatorArenaDaysDelayStart', v)} />
        </label>
        <label>
          <span>{t('gladiatorPrepDays')}</span>
          <NumberField min={1} max={28} value={settings.gladiatorArenaCountDay} onCommit={(v) => handleSettingChange('gladiatorArenaCountDay', v)} />
        </label>
      </div>
      <label className="toggle-line" style={{ margin: '4px 0 0 0' }}>
        <input type="checkbox" checked={settings.gladiatorArenaRegistrationStartFight} onChange={(e) => handleSettingChange('gladiatorArenaRegistrationStartFight', e.target.checked)} />
        <span style={{ fontSize: '11px' }}>{t('gladiatorRegStartFight')}</span>
      </label>
      <p className="field-note" style={{ margin: '0 0 4px 0', fontSize: '10px' }}>{t('gladiatorRegStartFightHelp')}</p>
    </div>
  );

  const renderTournamentParams = () => (
    <div style={indentedBlock}>
      <div className="field-row">
        <label>
          <span>{t('pointsToWin')}</span>
          <NumberField min={1} max={10} value={settings.tournamentPointsToWin} onCommit={(v) => handleSettingChange('tournamentPointsToWin', v)} />
        </label>
        <label className="toggle-line" style={{ alignSelf: 'center', marginTop: '14px' }}>
          <input type="checkbox" checked={settings.tournamentSaveArmy} onChange={(e) => handleSettingChange('tournamentSaveArmy', e.target.checked)} />
          <span style={{ fontSize: '11px' }}>{t('saveArmy')}</span>
        </label>
      </div>
      <label>
        <span>{t('tournamentStageDays')}</span>
        <input type="text" value={settings.tournamentDays.join(', ')} onChange={(e) => handleSettingChange('tournamentDays', e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)))} />
      </label>
      <p className="field-note" style={{ margin: '-4px 0 4px 0', fontSize: '10px' }}>{t('tournamentStageDaysHelp')}</p>
      <label>
        <span>{t('tournamentAnnounceDays')}</span>
        <input type="text" value={settings.tournamentAnnounceDays.join(', ')} onChange={(e) => handleSettingChange('tournamentAnnounceDays', e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)))} />
      </label>
      <p className="field-note" style={{ margin: '-4px 0 4px 0', fontSize: '10px' }}>{t('tournamentAnnounceDaysHelp')}</p>
    </div>
  );

  const selectedPreset = presetBySid(settings.displayWinCondition) ?? presetBySid('win_condition_1')!;
  const presetIsModified = !matchesPreset(settings, settings.displayWinCondition);

  const getHeroRuleSummary = () => {
    const { heroLimitMode, heroMin, heroIncrement, heroMax } = settings;
    if (heroLimitMode === 'fixed') {
      return t('heroRuleFixedSummary', { max: heroMax });
    }
    return t('heroRuleSummary', { min: heroMin, increment: heroIncrement, max: heroMax });
  };

  // Object library logic
  const sortedLibrary = useMemo(() => {
    return sortedObjectLibrary(objectLibrary, language);
  }, [objectLibrary, language]);

  const filteredCatalogItems = useMemo(() => {
    if (!searchQuery) return sortedLibrary;
    const q = searchQuery.toLowerCase();
    return sortedLibrary.filter((item) => {
      const label = itemLabel(item, language).toLowerCase();
      const description = (itemDescription(item, language) || describeCatalogItem(item, t)).toLowerCase();
      const sid = (item.sid || item.includeList || '').toLowerCase();
      const tag = (item.tag || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      return label.includes(q) || description.includes(q) || sid.includes(q) || tag.includes(q) || category.includes(q);
    });
  }, [sortedLibrary, searchQuery, language, t]);

  return (
    <aside className="panel left-panel" aria-label={t('mapSettings')}>
      {/* Map Settings */}
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsMapExpanded(!isMapExpanded)}>
          <h2>
            <Settings size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('mapSettings')}
          </h2>
          {isMapExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>
        {isMapExpanded && (
          <div className="collapsible-body">
        
        {/* Subsection 1: General Settings */}
        <div className="settings-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid var(--line)', paddingBottom: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Sliders size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--muted-soft)' }}>
              {t('settingsSectionGeneral')}
            </span>
          </div>
          <label>
            <span>{t('templateName')}</span>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => handleSettingChange('name', e.target.value)}
              autoComplete="off"
            />
          </label>
          
          <label>
            <span>{t('templateDescription')}</span>
            <textarea
              className="description-input"
              rows={3}
              value={settings.description}
              onChange={(e) => handleSettingChange('description', e.target.value)}
            />
          </label>
          
          <label>
            <span>{t('mapSizePreset')}</span>
            <select value={sizePreset} onChange={(e) => handleSizePresetChange(e.target.value)}>
              {knownMapSizes.map((size) => (
                <option key={size} value={size}>{size} × {size}</option>
              ))}
              <option value="custom">{t('mapSizeCustomOption')}</option>
            </select>
          </label>
          
          {sizePreset === 'custom' && (
            <div style={{ display: 'grid', gap: '8px', borderLeft: '2px solid var(--accent)', paddingLeft: '8px', marginBottom: '8px', marginTop: '4px' }}>
              <div className="field-row" style={{ marginBottom: 0 }}>
                <label style={{ marginBottom: 0 }}>
                  X
                  <NumberField
                    min={36}
                    step={1}
                    value={settings.sizeX}
                    onCommit={(v) => handleSettingChange('sizeX', v)}
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  Z
                  <NumberField
                    min={36}
                    step={1}
                    value={settings.sizeZ}
                    onCommit={(v) => handleSettingChange('sizeZ', v)}
                  />
                </label>
              </div>
            </div>
          )}
          
          <div className="field-row">
            <label>
              <span>{t('players')}</span>
              <NumberField
                min={2}
                max={8}
                step={1}
                value={settings.players}
                onCommit={(v) => handleSettingChange('players', v)}
              />
            </label>
            <label>
              <span>{t('heroMax')}</span>
              <NumberField
                min={1}
                max={24}
                step={1}
                value={settings.heroMax}
                onCommit={(v) => handleSettingChange('heroMax', v)}
              />
            </label>
          </div>
          <p className="field-note">{t('playersHelp')}</p>

          <label>
            <span>{t('heroLimitMode')}</span>
            <select
              value={settings.heroLimitMode}
              onChange={(e) => {
                if (isHeroLimitMode(e.target.value)) {
                  handleSettingChange('heroLimitMode', e.target.value);
                }
              }}
            >
              <option value="fixed">{t('heroLimitFixed')}</option>
              <option value="perCastle">{t('heroLimitPerCastle')}</option>
            </select>
          </label>
          
          {settings.heroLimitMode === 'perCastle' && (
            <div style={{ display: 'grid', gap: '8px', borderLeft: '2px solid var(--accent)', paddingLeft: '8px', marginBottom: '8px', marginTop: '4px' }}>
              <div className="field-row" style={{ marginBottom: 0 }}>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('heroMin')}</span>
                  <NumberField
                    min={1}
                    max={24}
                    step={1}
                    value={settings.heroMin}
                    onCommit={(v) => handleSettingChange('heroMin', v)}
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  <span>{t('heroIncrement')}</span>
                  <NumberField
                    min={0}
                    max={24}
                    step={1}
                    value={settings.heroIncrement}
                    onCommit={(v) => handleSettingChange('heroIncrement', v)}
                  />
                </label>
              </div>
            </div>
          )}
          <p className="field-note">{getHeroRuleSummary()}</p>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={settings.singleHeroMode}
              onChange={(e) => handleSettingChange('singleHeroMode', e.target.checked)}
            />
            <span>{t('singleHeroMode')}</span>
          </label>
          <p className="field-note">{t('singleHeroModeHelp')}</p>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={settings.heroHireBan}
              onChange={(e) => handleSettingChange('heroHireBan', e.target.checked)}
            />
            <span>{t('heroHireBan')}</span>
          </label>
          <p className="field-note">{t('heroHireBanHelp')}</p>

          {isExpert && (
            <>
              <div className="control-label">{t('expModifiersLabel')}</div>
              <div className="field-row">
                <label>
                  <span>{t('factionLawsExp')}</span>
                  <NumberField
                    min={0}
                    max={10}
                    step={0.25}
                    value={settings.factionLawsExpModifier}
                    onCommit={(v) => handleSettingChange('factionLawsExpModifier', v)}
                  />
                </label>
                <label>
                  <span>{t('astrologyExp')}</span>
                  <NumberField
                    min={0}
                    max={10}
                    step={0.25}
                    value={settings.astrologyExpModifier}
                    onCommit={(v) => handleSettingChange('astrologyExpModifier', v)}
                  />
                </label>
              </div>
              <p className="field-note">{t('expModifiersHelp')}</p>
            </>
          )}
        </div>

        {/* Subsection 2: Victory Conditions */}
        <div className="settings-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid var(--line)', paddingBottom: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Trophy size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--muted-soft)' }}>
              {t('settingsSectionVictory')}
            </span>
          </div>
          {/* Win-condition preset = the game's named presets; sets both the
              standard flags and the displayed label. */}
          <label>
            <span>{t('winConditionPreset')}</span>
            <select
              value={selectedPreset.sid}
              onChange={(e) => actions.updateSettings(applyPreset(e.target.value))}
            >
              {WIN_CONDITION_PRESETS.map((preset) => (
                <option key={preset.sid} value={preset.sid}>{t(preset.nameKey)}</option>
              ))}
            </select>
          </label>
          <p className="field-note" style={{ marginBottom: presetIsModified ? '6px' : '12px' }}>{t(selectedPreset.descKey)}</p>

          {presetIsModified && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span className="preset-modified-badge">{t('presetModified')}</span>
              <span className="field-note" style={{ margin: 0, flex: '1 1 120px' }}>{t('presetModifiedNote')}</span>
              <button
                type="button"
                className="compact-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => actions.updateSettings(applyPreset(selectedPreset.sid))}
              >
                <RotateCcw size={12} />{t('resetToPreset')}
              </button>
            </div>
          )}

          {/* Simple mode: only the parameters the active preset needs. */}
          {!isExpert && (
            <>
              {settings.cityHoldEnabled && renderCityHoldTarget()}
              {settings.lostStartCityEnabled && settings.lostStartCityDay > 0 && renderLostStartCityDay()}
            </>
          )}

          {/* Expert mode: every win-condition flag, grouped by meaning. */}
          {isExpert && (
            <>
              <div style={victoryGroupLabelStyle}>{t('victoryGroupWin')}</div>

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.classicEnabled} onChange={(e) => handleSettingChange('classicEnabled', e.target.checked)} />
                <span>{t('classicWinRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: '10px' }}>{t('classicWinRuleHelp')}</p>

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.lostStartCityEnabled} onChange={(e) => handleSettingChange('lostStartCityEnabled', e.target.checked)} />
                <span>{t('lostStartCityRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: settings.lostStartCityEnabled ? '4px' : '10px' }}>{t('lostStartCityRuleHelp')}</p>
              {settings.lostStartCityEnabled && renderLostStartCityDay()}

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.cityHoldEnabled} onChange={(e) => handleSettingChange('cityHoldEnabled', e.target.checked)} />
                <span>{t('cityHoldRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: settings.cityHoldEnabled ? '4px' : '10px' }}>{t('cityHoldRuleHelp')}</p>
              {settings.cityHoldEnabled && renderCityHoldTarget()}

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.gladiatorArenaEnabled} onChange={(e) => handleSettingChange('gladiatorArenaEnabled', e.target.checked)} />
                <span>{t('gladiatorArenaRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: settings.gladiatorArenaEnabled ? '4px' : '10px' }}>{t('gladiatorArenaRuleHelp')}</p>
              {settings.gladiatorArenaEnabled && renderGladiatorParams()}

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.tournamentEnabled} onChange={(e) => handleSettingChange('tournamentEnabled', e.target.checked)} />
                <span>{t('tournamentRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: settings.tournamentEnabled ? '4px' : '10px' }}>{t('tournamentRuleHelp')}</p>
              {settings.tournamentEnabled && renderTournamentParams()}

              <div style={victoryGroupLabelStyle}>{t('victoryGroupLoss')}</div>

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.singleHero} onChange={(e) => handleSettingChange('singleHero', e.target.checked)} />
                <span>{t('lostStartHeroDefeat')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: '10px' }}>{t('lostStartHeroDefeatHelp')}</p>

              <div style={victoryGroupLabelStyle}>{t('victoryGroupExtra')}</div>

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.desertionEnabled} onChange={(e) => handleSettingChange('desertionEnabled', e.target.checked)} />
                <span>{t('desertionRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: settings.desertionEnabled ? '4px' : '10px' }}>{t('desertionRuleHelp')}</p>
              {settings.desertionEnabled && (
                <div style={indentedBlock}>
                  <div className="field-row" style={{ marginBottom: 0 }}>
                    <label style={{ marginBottom: 0 }}>
                      <span>{t('desertionDay')}</span>
                      <NumberField min={1} max={14} step={1} value={settings.desertionDay} onCommit={(v) => handleSettingChange('desertionDay', v)} />
                    </label>
                    <label style={{ marginBottom: 0 }}>
                      <span>{t('desertionValue')}</span>
                      <NumberField min={0} step={500} value={settings.desertionValue} onCommit={(v) => handleSettingChange('desertionValue', v)} />
                    </label>
                  </div>
                </div>
              )}

              <label className="toggle-line" style={{ marginBottom: '4px' }}>
                <input type="checkbox" checked={settings.heroLightingEnabled} onChange={(e) => handleSettingChange('heroLightingEnabled', e.target.checked)} />
                <span>{t('heroLightingRule')}</span>
              </label>
              <p className="field-note" style={{ marginBottom: settings.heroLightingEnabled ? '4px' : '10px' }}>{t('heroLightingRuleHelp')}</p>
              {settings.heroLightingEnabled && (
                <div style={indentedBlock}>
                  <label style={{ marginBottom: 0 }}>
                    <span>{t('heroLightingDay')}</span>
                    <NumberField min={1} max={14} step={1} value={settings.heroLightingDay} onCommit={(v) => handleSettingChange('heroLightingDay', v)} />
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Subsection 3: Generation & Geometry */}
        {isExpert && (
        <div className="settings-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Compass size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--muted-soft)' }}>
              {t('settingsSectionGeneration')}
            </span>
          </div>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={settings.fixedOrientation}
              onChange={(e) => handleSettingChange('fixedOrientation', e.target.checked)}
            />
            <span>{t('fixedOrientation')}</span>
          </label>
          <p className="field-note">{t('fixedOrientationHelp')}</p>
          
          {settings.fixedOrientation && (
            <div style={{ display: 'grid', gap: '8px', borderLeft: '2px solid var(--accent)', paddingLeft: '8px', marginBottom: '8px', marginTop: '4px' }}>
              <label style={{ marginBottom: 0 }}>
                <span>{t('orientationAnchor')}</span>
                <select
                  value={settings.orientationAnchor}
                  onChange={(e) => handleSettingChange('orientationAnchor', e.target.value)}
                  disabled={!zones.length}
                >
                  {zones.length ? (
                    zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.id} ({zone.label})
                      </option>
                    ))
                  ) : (
                    <option value="">{t('orientationNoZones')}</option>
                  )}
                </select>
              </label>
            </div>
          )}

          <label className="toggle-line" style={{ marginTop: '10px', marginBottom: '4px' }}>
            <input
              type="checkbox"
              checked={settings.preserveLayout}
              onChange={(e) => handleSettingChange('preserveLayout', e.target.checked)}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {t('preserveLayout')}
              <span style={{
                background: 'var(--accent-2)',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 800,
                padding: '1px 4px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                lineHeight: 1,
                letterSpacing: '0.5px'
              }} title={t('preserveLayoutBetaNote')}>
                {t('preserveLayoutBeta')}
              </span>
            </span>
          </label>
          <p className="field-note" style={{ marginBottom: '12px' }}>{t('preserveLayoutHelp')}</p>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={settings.encounterHoles}
              onChange={(e) => handleSettingChange('encounterHoles', e.target.checked)}
            />
            <span>{t('encounterHoles')}</span>
          </label>
          <p className="field-note">{t('encounterHolesHelp')}</p>

          <div className="field-row" style={{ marginTop: '10px' }}>
            <label style={{ marginBottom: 0 }}>
              <span>{t('borderWater')}</span>
              <select
                value={String(settings.borderWaterWidth)}
                onChange={(e) => handleSettingChange('borderWaterWidth', Number(e.target.value))}
              >
                {![0, 3, 4, 6].includes(settings.borderWaterWidth) && (
                  <option value={String(settings.borderWaterWidth)}>
                    {t('borderWaterCustom')} ({settings.borderWaterWidth})
                  </option>
                )}
                <option value="0">{t('borderWaterNone')}</option>
                <option value="3">{t('borderWaterNarrow')}</option>
                <option value="4">{t('borderWaterMedium')}</option>
                <option value="6">{t('borderWaterWide')}</option>
              </select>
            </label>
            <label style={{ marginBottom: 0 }}>
              <span>{t('borderCornerRadius')}</span>
              <NumberField
                min={0}
                max={1}
                step={0.05}
                value={settings.borderCornerRadius}
                onCommit={(v) => handleSettingChange('borderCornerRadius', v)}
              />
            </label>
          </div>
          <p className="field-note" style={{ marginBottom: variants.length > 1 ? '4px' : '12px' }}>{t('borderHelp')}</p>
          {variants.length > 1 && (
            <p className="field-note" style={{ marginBottom: '12px', fontWeight: 600 }}>
              {t('variantScopedNote', {
                name: `${t('variant')} ${Math.max(0, variants.findIndex((v) => v.id === activeVariantId)) + 1}`
              })}
            </p>
          )}

          <p
            className="field-note"
            style={{ marginTop: '10px', color: 'var(--accent-2)', display: 'flex', gap: '6px', alignItems: 'flex-start' }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{t('rmgGeometryWarning')}</span>
          </p>
        </div>
        )}
          </div>
        )}
      </section>


      <BansSection />

      {isExpert && <BonusesSection />}

      {isExpert && <ValueOverridesSection />}

      {/* Variants are a power feature: most maps ship a single variant */}
      {isExpert && <VariantsSection />}

      {/* Presets Section */}
      <section className="collapsible-section">
        <div id="zonePresetsHeader" className="collapsible-header" onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}>
          <h2>
            <Sliders size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('presetsTitle') || 'Presets'}
          </h2>
          <div className="collapsible-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
              <button className="compact-button" type="button" onClick={handleExportPresets} title={t('exportPresets')}>
                <Download size={12} />
              </button>
              <button className="compact-button" type="button" onClick={() => presetsFileInputRef.current?.click()} title={t('importPresets')}>
                <Upload size={12} />
              </button>
              <input
                ref={presetsFileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportPresets}
                style={{ display: 'none' }}
              />
            </div>
            {isPresetsExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
          </div>
        </div>
        
        {isPresetsExpanded && (
          <div className="collapsible-body">
        
        <p className="field-note" style={{ marginBottom: '8px' }}>
          {t('presetsDescription')}
        </p>

        {/* Presets list */}
        <div className="presets-list" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: '4px', maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', marginBottom: '8px', paddingRight: '4px' }}>
          {Object.values(presets).map((preset) => {
            const isSelected = selected?.type === 'preset' && selected.id === preset.id;
            
            const getPresetColor = () => {
              if (preset.biomeMode === 'specific' && preset.biomeId) {
                const bId = preset.biomeId.toLowerCase();
                const resolvedBiome = bId === 'deathland' ? 'wasteland' : bId === 'autumn' ? 'highlands' : bId;
                return biomeColors[resolvedBiome] || biomeColors.random;
              }
              return biomeColors.random;
            };

            return (
              <div
                key={preset.id}
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
                onClick={() => actions.setSelected({ type: 'preset', id: preset.id })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                  <button
                    type="button"
                    className="compact-button primary"
                    title={t('addZoneToCanvas') || 'Добавить на холст'}
                    style={{ flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.addZone(preset.id);
                    }}
                  >
                    <Plus size={10} />
                  </button>
                  <span
                    className="swatch"
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: preset.baseType === 'spawn' ? '2px' : '50%',
                      background: getPresetColor(),
                      flexShrink: 0
                    }}
                  ></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {presetDisplayName(preset, t)}
                      </span>
                      {preset.isCustom && (
                        <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'var(--line)', color: 'var(--ink)', flexShrink: 0 }}>
                          cstm
                        </span>
                      )}
                    </span>
                    {preset.guardedValue > 0 && (
                      <span style={{ fontSize: '10px', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ≈{Math.round(preset.guardedValue / 1000)}k
                        <ValueBadge kind="zoneGuarded" value={preset.guardedValue} />
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="compact-button"
                    title={t('clonePreset')}
                    onClick={() => actions.createPreset(`${presetDisplayName(preset, t)} (Copy)`, preset.baseType, preset.id)}
                  >
                    <Copy size={10} />
                  </button>
                  {preset.isCustom && (
                    <button
                      type="button"
                      className="compact-button danger"
                      title={t('deletePreset')}
                      onClick={() => {
                        if (window.confirm(t('confirmDeletePreset', { name: preset.label }))) {
                          actions.deletePreset(preset.id);
                        }
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create preset button/form */}
        {!showCreateForm ? (
          <button
            type="button"
            className="small-button"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowCreateForm(true)}
          >
            <Plus size={12} style={{ marginRight: '4px' }} />
            {t('createPresetBtn') || 'Create Preset'}
          </button>
        ) : (
          <form onSubmit={handleCreatePreset} style={{ display: 'grid', gap: '6px', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--panel-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>{t('createNewPreset') || 'Create Preset'}</span>
              <button type="button" className="compact-button" onClick={() => setShowCreateForm(false)}>
                ✕
              </button>
            </div>
            
            <label style={{ fontSize: '11px', display: 'grid', gap: '2px' }}>
              {t('presetName') || 'Name'}
              <input
                type="text"
                required
                placeholder="My Preset"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              />
            </label>
            
            <label style={{ fontSize: '11px', display: 'grid', gap: '2px' }}>
              {t('presetBaseType') || 'Base Type'}
              <select
                value={newPresetBaseType}
                onChange={(e) => {
                  if (isPresetBaseType(e.target.value)) {
                    setNewPresetBaseType(e.target.value);
                  }
                }}
                style={{ padding: '4px 6px', fontSize: '12px' }}
              >
                <option value="spawn">Spawn</option>
                <option value="blank">Blank</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="neutral">Neutral</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            
            <div className="field-row" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '11px', display: 'grid', gap: '2px', marginBottom: 0 }}>
                {t('presetRole')}
                <select
                  value={newPresetRole}
                  onChange={(e) => {
                    const role = e.target.value as PresetRole | '';
                    setNewPresetRole(role);
                    if (role) {
                      setNewPresetCloneSource('');
                      setNewPresetBaseType(PRESET_RECIPES[role][newPresetTier].baseType as typeof newPresetBaseType);
                    }
                  }}
                  style={{ padding: '4px 6px', fontSize: '12px' }}
                >
                  <option value="">{t('presetRoleNone')}</option>
                  {PRESET_ROLES.map((role) => (
                    <option key={role} value={role}>{t(`presetRole_${role}`)}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '11px', display: 'grid', gap: '2px', marginBottom: 0, opacity: newPresetRole ? 1 : 0.5 }}>
                {t('presetTier')}
                <select
                  value={newPresetTier}
                  disabled={!newPresetRole}
                  onChange={(e) => {
                    const tier = e.target.value as PresetTier;
                    setNewPresetTier(tier);
                    if (newPresetRole) {
                      setNewPresetBaseType(PRESET_RECIPES[newPresetRole][tier].baseType as typeof newPresetBaseType);
                    }
                  }}
                  style={{ padding: '4px 6px', fontSize: '12px' }}
                >
                  {PRESET_TIERS.map((tier) => (
                    <option key={tier} value={tier}>{t(`presetTier_${tier}`)}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-note" style={{ margin: 0 }}>{t('presetRecipeHelp')}</p>

            <label style={{ fontSize: '11px', display: 'grid', gap: '2px', opacity: newPresetRole ? 0.5 : 1 }}>
              {t('cloneFrom') || 'Clone from'}
              <select
                value={newPresetCloneSource}
                disabled={Boolean(newPresetRole)}
                onChange={(e) => setNewPresetCloneSource(e.target.value)}
                style={{ padding: '4px 6px', fontSize: '12px' }}
              >
                <option value="">{t('none') || 'None'}</option>
                {Object.values(presets).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <button type="submit" className="small-button primary" style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
              {t('createPresetBtn') || 'Create'}
            </button>
          </form>
        )}

        <button
          type="button"
          className="small-button"
          style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
          title={t('resetBuiltInsTitle')}
          onClick={() => {
            if (window.confirm(t('confirmResetBuiltInPresets'))) {
              actions.resetBuiltInPresets();
            }
          }}
        >
          <RotateCcw size={12} style={{ marginRight: '4px' }} />
          {t('resetBuiltInsBtn')}
        </button>

          </div>
        )}
      </section>

      {/* Terrain profiles (zoneLayouts) */}
      {isExpert && (
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsTerrainExpanded(!isTerrainExpanded)}>
          <h2>
            <Mountain size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('terrainProfilesTitle')}
          </h2>
          {isTerrainExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>

        {isTerrainExpanded && (
          <div className="collapsible-body">
            <p className="field-note" style={{ marginBottom: '8px' }}>
              {t('terrainProfilesDescription')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: '4px', maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', marginBottom: '8px', paddingRight: '4px' }}>
              {settings.terrainProfiles.map((profile) => {
                const isSelected = selected?.type === 'terrainProfile' && selected.id === profile.name;
                // Zones without an explicit profile resolve to a built-in via
                // the type-based "Auto" option — count those references too.
                const usedCount = zones.filter((zone) => {
                  const baseType = presets[zone.type]?.baseType || zone.type;
                  const resolved = zone.layout || zoneTypes[baseType as keyof typeof zoneTypes]?.layout || zoneTypes.neutral.layout;
                  return resolved === profile.name;
                }).length;
                const isBuiltIn = isBuiltInProfileName(profile.name);
                return (
                  <div
                    key={profile.name}
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
                    onClick={() => actions.setSelected({ type: 'terrainProfile', id: profile.name })}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', minWidth: 0, flex: 1 }} title={profile.name}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {profile.name}
                        </span>
                        {profile.custom && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'var(--line)', color: 'var(--ink)', flexShrink: 0 }}>
                            cstm
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('terrainProfileSummary', {
                          obstacles: profile.obstaclesFill ?? '—',
                          lakes: profile.lakesFill ?? '—',
                          zones: usedCount
                        })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="compact-button"
                        title={t('terrainProfileDuplicate')}
                        onClick={() => actions.duplicateTerrainProfile(profile.name)}
                      >
                        <Copy size={10} />
                      </button>
                      <button
                        type="button"
                        className="compact-button danger"
                        title={isBuiltIn
                          ? t('terrainProfileBuiltInDeleteBlocked')
                          : usedCount > 0 ? t('terrainProfileDeleteBlockedShort') : t('terrainProfileDelete')}
                        disabled={isBuiltIn || usedCount > 0}
                        style={isBuiltIn || usedCount > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                        onClick={() => actions.deleteTerrainProfile(profile.name)}
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
              onClick={() => actions.addTerrainProfile()}
            >
              <Plus size={12} style={{ marginRight: '4px' }} />
              {t('terrainProfileCreate')}
            </button>

            <button
              type="button"
              className="small-button"
              style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              title={t('resetBuiltInsTitle')}
              onClick={() => {
                if (window.confirm(t('confirmResetBuiltInTerrain'))) {
                  actions.resetBuiltInTerrainProfiles();
                }
              }}
            >
              <RotateCcw size={12} style={{ marginRight: '4px' }} />
              {t('resetBuiltInsBtn')}
            </button>
          </div>
        )}
      </section>
      )}

      {/* Content-limit presets (contentCountLimits) */}
      {isExpert && (
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsLimitsExpanded(!isLimitsExpanded)}>
          <h2>
            <ListChecks size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('contentLimitsTitle')}
          </h2>
          {isLimitsExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>

        {isLimitsExpanded && (
          <div className="collapsible-body">
            <p className="field-note" style={{ marginBottom: '8px' }}>
              {t('contentLimitsDescription')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: '4px', maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', marginBottom: '8px', paddingRight: '4px' }}>
              {settings.contentLimitPresets.map((limitPreset) => {
                const isSelected = selected?.type === 'contentLimits' && selected.id === limitPreset.name;
                // Zones without explicit references resolve to a built-in stub
                // by type — count those "Auto" references too.
                const usedCount = zones.filter((zone) => {
                  if (zone.contentCountLimits) return zone.contentCountLimits.includes(limitPreset.name);
                  const baseType = presets[zone.type]?.baseType || zone.type;
                  const hasSpawn = baseType === 'spawn' || (zone.mainObjects || []).some((mo) => mo.type === 'Spawn');
                  return limitPreset.name === (hasSpawn ? 'content_limits_spawn' : 'content_limits_side');
                }).length;
                const isBuiltIn = isBuiltInLimitName(limitPreset.name);
                return (
                  <div
                    key={limitPreset.name}
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
                    onClick={() => actions.setSelected({ type: 'contentLimits', id: limitPreset.name })}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', minWidth: 0, flex: 1 }} title={limitPreset.name}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {limitPreset.name}
                        </span>
                        {limitPreset.custom && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'var(--line)', color: 'var(--ink)', flexShrink: 0 }}>
                            cstm
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('contentLimitSummary', {
                          rows: limitPreset.limits.length,
                          zones: usedCount
                        })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="compact-button"
                        title={t('contentLimitDuplicate')}
                        onClick={() => actions.duplicateContentLimitPreset(limitPreset.name)}
                      >
                        <Copy size={10} />
                      </button>
                      <button
                        type="button"
                        className="compact-button danger"
                        title={isBuiltIn
                          ? t('contentLimitBuiltInDeleteBlocked')
                          : usedCount > 0 ? t('contentLimitDeleteBlockedShort') : t('contentLimitDelete')}
                        disabled={isBuiltIn || usedCount > 0}
                        style={isBuiltIn || usedCount > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                        onClick={() => actions.deleteContentLimitPreset(limitPreset.name)}
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
              onClick={() => actions.addContentLimitPreset()}
            >
              <Plus size={12} style={{ marginRight: '4px' }} />
              {t('contentLimitCreate')}
            </button>

            <button
              type="button"
              className="small-button"
              style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              title={t('resetBuiltInsTitle')}
              onClick={() => {
                if (window.confirm(t('confirmResetBuiltInLimits'))) {
                  actions.resetBuiltInContentLimits();
                }
              }}
            >
              <RotateCcw size={12} style={{ marginRight: '4px' }} />
              {t('resetBuiltInsBtn')}
            </button>
          </div>
        )}
      </section>
      )}

      {/* Content pools (contentPools) */}
      {isExpert && (
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsPoolsExpanded(!isPoolsExpanded)}>
          <h2>
            <Coins size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('contentPoolsTitle')}
          </h2>
          {isPoolsExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>

        {isPoolsExpanded && (
          <div className="collapsible-body">
            <p className="field-note" style={{ marginBottom: '8px' }}>
              {t('contentPoolsDescription')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: '4px', maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden', marginBottom: '8px', paddingRight: '4px' }}>
              {settings.contentPoolPresets.length === 0 && (
                <p className="field-note" style={{ margin: 0 }}>{t('contentPoolsEmpty')}</p>
              )}
              {settings.contentPoolPresets.map((pool) => {
                const isSelected = selected?.type === 'contentPool' && selected.id === pool.name;
                const usedCount = zones.filter((zone) =>
                  zone.guardedContentPool?.includes(pool.name) ||
                  zone.unguardedContentPool?.includes(pool.name) ||
                  zone.resourcesContentPool?.includes(pool.name)
                ).length;
                return (
                  <div
                    key={pool.name}
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
                    onClick={() => actions.setSelected({ type: 'contentPool', id: pool.name })}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', minWidth: 0, flex: 1 }} title={pool.name}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pool.name}
                        </span>
                        {pool.custom && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'var(--line)', color: 'var(--ink)', flexShrink: 0 }}>
                            cstm
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--muted-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('contentPoolSummary', {
                          groups: pool.groups.length,
                          bans: pool.bans.length,
                          zones: usedCount
                        })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="compact-button"
                        title={t('contentPoolDuplicate')}
                        onClick={() => actions.duplicateContentPoolPreset(pool.name)}
                      >
                        <Copy size={10} />
                      </button>
                      <button
                        type="button"
                        className="compact-button danger"
                        title={usedCount > 0 ? t('contentPoolDeleteBlockedShort') : t('contentPoolDelete')}
                        disabled={usedCount > 0}
                        style={usedCount > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                        onClick={() => actions.deleteContentPoolPreset(pool.name)}
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
              onClick={() => actions.addContentPoolPreset()}
            >
              <Plus size={12} style={{ marginRight: '4px' }} />
              {t('contentPoolCreate')}
            </button>
          </div>
        )}
      </section>
      )}

      {/* Object Library */}
      <section 
        className="collapsible-section" 
        style={isObjectsExpanded ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: '380px' } : undefined}
      >
        <div className="collapsible-header" onClick={() => setIsObjectsExpanded(!isObjectsExpanded)}>
          <h2>
            <Library size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('objects')}
          </h2>
          <div className="collapsible-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="compact-button" 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                coreZipInputRef.current?.click();
              }} 
              disabled={coreLoadingState === 'loading'}
            >
              <FileArchive size={12} />
              {t('loadCore')}
            </button>
            <input
              id="coreZipInput"
              ref={coreZipInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={handleLoadCoreZip}
              style={{ display: 'none' }}
            />
            {isObjectsExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
          </div>
        </div>
        
        {isObjectsExpanded && (
          <div className="collapsible-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        
        <div className="library-filter">
          <Search size={14} className="search-icon" />
          <input
            type="search"
            placeholder={t('searchObject')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(50);
            }}
            disabled={!coreCatalog}
          />
        </div>

        {/* Core Status Message */}
        {coreLoadingState === 'loading' && (
          <div className="core-status">{t('coreCatalogLoading')}</div>
        )}
        {coreLoadingState === 'failed' && (
          <div className="core-status warning">{t('coreCatalogFailed')}: {coreLoadingError}</div>
        )}
        {coreLoadingState === 'success' && coreCatalog && (
          <div className="core-status">
            <Check size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle', color: 'var(--ok)' }} />
            {t('coreCatalogReady')}: {objectLibrary.length} {t('statusObjects')}
          </div>
        )}
        {coreLoadingState === 'idle' && !coreCatalog && (
          <div className="core-status warning">{t('coreRequiredStatus')}</div>
        )}
        {coreLoadingState === 'idle' && coreCatalog && (
          <div className="core-status">
            {t('coreCatalogReady')}: {objectLibrary.length} {t('statusObjects')}
          </div>
        )}

        {/* Library Items */}
        <div className="object-library">
          {coreCatalog ? (
            <>
              {filteredCatalogItems.slice(0, visibleCount).map((item) => {
                const label = itemLabel(item, language);
                const desc = itemDescription(item, language) || describeCatalogItem(item, t);
                const sid = item.sid || item.includeList || '';
                
                return (
                  <div key={item.id} className="object-row">
                    <button
                      type="button"
                      className="compact-button primary"
                      onClick={() => handleAddObject(item)}
                      disabled={isAddDisabled}
                      title={getAddButtonTooltip()}
                    >
                      <Plus size={10} />
                    </button>
                    <div className="object-row-details">
                      <strong>{label}</strong>
                      <span className="object-row-desc">
                        {sid && <code className="sid-badge">{sid}</code>}
                        {desc}
                      </span>
                      {item.kind === 'list' && item.contentEntries && item.contentEntries.length > 0 && (
                        <LazyDetails
                          className="list-contents"
                          summary={t('listContents', { count: item.count || (item.contentEntries?.length || 0) })}
                          renderContent={() => (
                            <div className="list-contents-body">
                              {item.contentEntries?.map((entry, index) => {
                                const entryLabel = entry.labelByLang?.[language] || entry.sid || entry.technicalId || t('unknownObject');
                                const entryDesc = entry.descriptionByLang?.[language] || t('unknownObject');
                                const entryTechnical = entry.technicalId || entry.sid || entry.includeLists?.join(', ') || '?';
                                const entryMetadata = [];
                                if (entry.weight !== null && entry.weight !== undefined) {
                                  entryMetadata.push(t('listWeight', { value: entry.weight }));
                                }
                                if (entry.biome) {
                                  entryMetadata.push(t('listBiome', { value: t(`biome${entry.biome}`) || entry.biome }));
                                }
                                if (entry.variant !== null && entry.variant !== undefined) {
                                  entryMetadata.push(t('listVariant', { value: entry.variant }));
                                }
                                
                                return (
                                  <details key={index} className="list-content-entry">
                                    <summary>
                                      <span className="list-entry-name">{entryLabel}</span>
                                      {entryMetadata.length > 0 && (
                                        <span className="list-entry-meta">{entryMetadata.join(' · ')}</span>
                                      )}
                                    </summary>
                                    <div className="list-entry-description">
                                      <p>{entryDesc}</p>
                                      <code>{entryTechnical}</code>
                                    </div>
                                  </details>
                                );
                              })}
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredCatalogItems.length > visibleCount && (
                <button
                  type="button"
                  className="show-more-button"
                  onClick={() => setVisibleCount((prev) => prev + 50)}
                  style={{
                    margin: '8px 0',
                    padding: '8px',
                    width: '100%',
                    background: 'var(--panel-2)',
                    border: '1px dashed var(--line)',
                    borderRadius: '8px',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    textAlign: 'center',
                    transition: 'background 150ms ease, border-color 150ms ease'
                  }}
                >
                  {t('showMore', { count: Math.min(50, filteredCatalogItems.length - visibleCount) })}
                </button>
              )}
            </>
          ) : (
            objectLibrary.map((item: CatalogItem) => (
              <div key={item.id} className="object-row" style={{ opacity: 0.5 }}>
                <button
                  type="button"
                  className="compact-button"
                  onClick={() => handleAddObject(item)}
                  disabled={isAddDisabled}
                  title={getAddButtonTooltip()}
                >
                  <Plus size={10} />
                </button>
                <div className="object-row-details">
                  <strong>{item.label}</strong>
                  <span className="object-row-desc">
                    {item.id && <code className="sid-badge">{item.id}</code>}
                    {item.description}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
          </div>
        )}
      </section>

      {/* Custom Object Lists */}
      {isExpert && (
      <section className="collapsible-section">
        <div className="collapsible-header" onClick={() => setIsCustomListsExpanded(!isCustomListsExpanded)}>
          <h2>
            <Sliders size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('customListsTitle') || 'Custom Object Sets'}
          </h2>
          {isCustomListsExpanded ? <ChevronDown size={14} className="collapse-icon" /> : <ChevronRight size={14} className="collapse-icon" />}
        </div>
        {isCustomListsExpanded && (
          <div className="collapsible-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder={t('customListsSearchPlaceholder') || 'Search custom lists...'}
                value={customListSearchQuery}
                onChange={(e) => setCustomListSearchQuery(e.target.value)}
              />
            </div>

            <div className="object-library" style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {Object.values(customObjectLists)
                .filter(list => {
                  if (!customListSearchQuery) return true;
                  const q = customListSearchQuery.toLowerCase();
                  return list.label.toLowerCase().includes(q) || list.id.toLowerCase().includes(q);
                })
                .map((list) => {
                  const isActive = selected?.type === 'customList' && selected.id === list.id;
                  
                  return (
                    <div 
                      key={list.id} 
                      className={`custom-list-row ${isActive ? 'active' : ''}`}
                      title={getCustomListTooltip(list)}
                      onClick={() => actions.setSelected({ type: 'customList', id: list.id })}
                    >
                      {/* Plus button on the left */}
                      <button
                        type="button"
                        className="compact-button primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          const item: CatalogItem = {
                            id: list.id,
                            kind: 'list',
                            includeList: list.id,
                            label: list.label,
                            description: 'Custom object set',
                            guarded: true
                          };
                          if (selectedZone) {
                            actions.addObjectToZone(selectedZone.id, item);
                          } else if (selectedPresetId) {
                            actions.addObjectToPreset(selectedPresetId, item);
                          }
                        }}
                        disabled={!selectedZone && !selectedPresetId}
                        title={selectedZone ? t('addObjectTitle') : selectedPresetId ? t('addObjectToPresetTitle') || 'Add to selected preset' : t('chooseZoneFirst')}
                      >
                        <Plus size={10} />
                      </button>

                      {/* Content details in the center */}
                      <div className="object-row-details">
                        <strong>{list.label}</strong>
                        <span className="object-row-desc">
                          <code className="sid-badge">{list.id}</code>
                          {t('listContentsCount', { count: list.entries.length }) || `Entries: ${list.entries.length}`}
                        </span>
                      </div>

                      {/* Action buttons (clone and delete) on the right */}
                      <div className="object-row-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="compact-button"
                          title={t('clone')}
                          onClick={() => actions.createCustomList(`${list.id}_clone`, `${list.label} (Copy)`, list.id)}
                        >
                          <Copy size={10} />
                        </button>
                        <button
                          type="button"
                          className="compact-button danger"
                          title={t('delete')}
                          onClick={() => {
                            if (window.confirm(t('confirmDeleteCustomList') || `Are you sure you want to delete custom list ${list.label}?`)) {
                              actions.deleteCustomList(list.id);
                            }
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              
              {Object.keys(customObjectLists).length === 0 && (
                <div style={{ padding: '10px', textAlign: 'center', fontSize: '11px', opacity: 0.6 }}>
                  {t('noCustomLists') || 'No custom sets'}
                </div>
              )}
            </div>

            {/* Create Set form */}
            {!showCreateCustomListForm ? (
              <button
                type="button"
                className="small-button"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  setShowCreateCustomListForm(true);
                  setNewCustomListName('');
                  setNewCustomListId('');
                  setNewCustomListCloneSource('');
                }}
              >
                <Plus size={12} style={{ marginRight: '4px' }} />
                {t('createCustomListBtn') || 'Create List'}
              </button>
            ) : (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newCustomListId.trim()) return;
                  const success = actions.createCustomList(newCustomListId.trim(), newCustomListName.trim() || newCustomListId.trim(), newCustomListCloneSource || undefined);
                  if (success) {
                    setShowCreateCustomListForm(false);
                  }
                }} 
                style={{ display: 'grid', gap: '6px', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--panel-2)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>{t('createCustomListBtn') || 'Create List'}</span>
                  <button type="button" className="compact-button" onClick={() => setShowCreateCustomListForm(false)}>
                    ✕
                  </button>
                </div>
                
                <label style={{ fontSize: '11px', display: 'grid', gap: '2px' }}>
                  {t('customListIdLabel') || 'ID набора (латиница):'}
                  <input
                    type="text"
                    required
                    placeholder="my_list_id"
                    value={newCustomListId}
                    onChange={(e) => setNewCustomListId(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  />
                </label>

                <label style={{ fontSize: '11px', display: 'grid', gap: '2px' }}>
                  {t('customListLabelLabel') || 'Название набора:'}
                  <input
                    type="text"
                    placeholder="My Custom List"
                    value={newCustomListName}
                    onChange={(e) => setNewCustomListName(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  />
                </label>
                
                <label style={{ fontSize: '11px', display: 'grid', gap: '2px' }}>
                  {t('cloneFrom') || 'Clone from'}
                  <select
                    value={newCustomListCloneSource}
                    onChange={(e) => setNewCustomListCloneSource(e.target.value)}
                    style={{ padding: '4px 6px', fontSize: '12px' }}
                  >
                    <option value="">{t('none') || 'None'}</option>
                    {Object.values(customObjectLists).map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </label>

                <button type="submit" className="small-button primary" style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                  {t('createCustomListBtn') || 'Create'}
                </button>
              </form>
            )}
          </div>
        )}
      </section>
      )}
    </aside>
  );
};

// Helpers for sorting and translation
