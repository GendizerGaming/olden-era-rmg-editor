import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useTranslation } from '../../i18n/context';
import type { StartingBonus } from '../../types/editor';
import { NumberField } from '../shared/NumberField';
import { Gift, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

/** Bonus types from the game's DB/map_bonuses catalog. `hero` = the bonus
 *  targets heroes and therefore needs a receiver filter. */
const BONUS_TYPES: Array<{ sid: string; hero: boolean }> = [
  { sid: 'add_bonus_res', hero: false },
  { sid: 'add_bonus_hero_exp', hero: true },
  { sid: 'add_bonus_side_exp', hero: false },
  { sid: 'add_bonus_hero_spell', hero: true },
  { sid: 'add_bonus_hero_item', hero: true },
  { sid: 'add_bonus_hero_unit', hero: true },
  { sid: 'add_bonus_hero_unit_multipler', hero: true },
  { sid: 'add_bonus_hero_stat', hero: true }
];

const RESOURCES = ['gold', 'wood', 'ore', 'gemstones', 'crystals', 'mercury', 'alchemicalDust'];

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

export const BonusesSection: React.FC = () => {
  const { t, language } = useTranslation();
  const settings = useEditorStore((state) => state.settings);
  const coreCatalog = useEditorStore((state) => state.coreCatalog);
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const actions = useEditorStore((state) => state.actions);

  const [expanded, setExpanded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [typeSid, setTypeSid] = useState('add_bonus_res');
  const [receiver, setReceiver] = useState('start_hero');
  const [resource, setResource] = useState('gold');
  const [amount, setAmount] = useState(15000);
  const [expValue, setExpValue] = useState(750);
  const [multiplier, setMultiplier] = useState(2);
  const [spellId, setSpellId] = useState('');
  const [itemId, setItemId] = useState('');
  const [unitSid, setUnitSid] = useState('');
  const [unitCount, setUnitCount] = useState(10);
  const [statPreset, setStatPreset] = useState<'movement' | 'freeSpell' | 'manual'>('movement');
  const [statSpellId, setStatSpellId] = useState('');
  const [statName, setStatName] = useState('');
  const [statValue, setStatValue] = useState(1);
  const [movementValue, setMovementValue] = useState(30);

  const bonuses = settings.startingBonuses;
  const spells = coreCatalog?.spells ?? [];
  const units = coreCatalog?.units ?? [];
  const heroStatNames = coreCatalog?.heroStatNames ?? [];
  const artifacts = objectLibrary.filter((item) => item.kind === 'sid' && item.tag === 'Artifact' && item.sid);

  const spellName = (id: string): string =>
    spells.find((spell) => spell.id === id)?.labelByLang[language] || id;
  const itemName = (id: string): string => {
    const item = artifacts.find((entry) => entry.sid === id);
    return item?.labelByLang?.[language] || item?.label || id;
  };
  const unitName = (id: string): string =>
    units.find((unit) => unit.id === id)?.labelByLang[language] || id;
  const resourceLabel = (name: string): string =>
    RESOURCES.includes(name) ? t(`bonusRes_${name}`) : name;

  /** Human-readable one-line summary of an existing bonus entry. */
  const summarize = (bonus: StartingBonus): string => {
    const p = bonus.parameters;
    switch (bonus.sid) {
      case 'add_bonus_res':
        return `${resourceLabel(p[0] ?? '')} × ${p[1] ?? '?'}`;
      case 'add_bonus_hero_exp':
      case 'add_bonus_side_exp':
        return `+${p[0] ?? '?'}`;
      case 'add_bonus_hero_spell':
        return spellName(p[0] ?? '');
      case 'add_bonus_hero_item':
        return itemName(p[0] ?? '');
      case 'add_bonus_hero_unit':
        return `${unitName(p[0] ?? '')} × ${p[1] ?? '?'}`;
      case 'add_bonus_hero_unit_multipler':
        return `× ${p[0] ?? '?'}`;
      case 'add_bonus_hero_stat':
        if (p[0] === 'movementBonus') {
          return p[1] && p[1] !== '0' ? `${t('bonusStat_movement')} +${p[1]}` : t('bonusStat_movement');
        }
        if (p[0] === 'magicCostSidSet') return `${t('bonusStat_freeSpell')}: ${spellName(p[1] ?? '')}`;
        return p.join(', ');
      default:
        return p.join(', ');
    }
  };

  const typeLabel = (sid: string): string =>
    BONUS_TYPES.some((entry) => entry.sid === sid) ? t(`bonusType_${sid}`) : `${t('bonusUnknown')} (${sid})`;

  const currentType = BONUS_TYPES.find((entry) => entry.sid === typeSid)!;

  /** Builds the parameters array for the add-form state; null = incomplete. */
  const buildParameters = (): string[] | null => {
    switch (typeSid) {
      case 'add_bonus_res':
        return [resource, String(amount)];
      case 'add_bonus_hero_exp':
      case 'add_bonus_side_exp':
        return [String(expValue)];
      case 'add_bonus_hero_spell':
        return spellId ? [spellId] : null;
      case 'add_bonus_hero_item':
        return itemId ? [itemId] : null;
      case 'add_bonus_hero_unit':
        return unitSid.trim() ? [unitSid.trim(), String(unitCount)] : null;
      case 'add_bonus_hero_unit_multipler':
        return [String(multiplier)];
      case 'add_bonus_hero_stat':
        if (statPreset === 'movement') return ['movementBonus', String(movementValue)];
        if (statPreset === 'freeSpell') return statSpellId ? ['magicCostSidSet', statSpellId, '-999', '0'] : null;
        return statName.trim() ? [statName.trim(), String(statValue)] : null;
      default:
        return null;
    }
  };

  const addBonus = () => {
    const parameters = buildParameters();
    if (!parameters) return;
    const entry: StartingBonus = {
      sid: typeSid,
      receiverSide: -1,
      receiverFilter: currentType.hero ? receiver : '',
      parameters
    };
    actions.updateSettings({ startingBonuses: [...bonuses, entry] });
    actions.addNotification('notificationBonusAdded', { name: typeLabel(typeSid) }, 'success');
  };

  const removeBonus = (index: number) => {
    const entry = bonuses[index];
    actions.updateSettings({ startingBonuses: bonuses.filter((_, i) => i !== index) });
    actions.addNotification('notificationBonusRemoved', { name: typeLabel(entry.sid) }, 'info');
  };

  const canAdd = buildParameters() !== null;
  const needsCore = ['add_bonus_hero_spell', 'add_bonus_hero_item'].includes(typeSid)
    ? (typeSid === 'add_bonus_hero_spell' ? spells.length === 0 : artifacts.length === 0)
    : typeSid === 'add_bonus_hero_stat' && statPreset === 'freeSpell' && spells.length === 0;

  const selectStyle: React.CSSProperties = { marginBottom: 0 };

  return (
    <section className="collapsible-section">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <h2>
          <Gift size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          {t('bonusesTitle')}{bonuses.length > 0 ? ` (${bonuses.length})` : ''}
        </h2>
        {expanded ? (
          <ChevronDown size={14} className="collapse-icon" />
        ) : (
          <ChevronRight size={14} className="collapse-icon" />
        )}
      </div>

      {expanded && (
        <div className="collapsible-body">
          <p className="field-note" style={{ marginBottom: '8px' }}>{t('bonusesHelp')}</p>

          {bonuses.length === 0 ? (
            <p className="field-note" style={{ margin: '4px 0 10px' }}>{t('bonusesEmpty')}</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gridAutoRows: 'max-content',
                alignContent: 'start',
                gap: '4px',
                maxHeight: '240px',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: '4px',
                margin: '4px 0 10px'
              }}
            >
              {bonuses.map((bonus, index) => {
                const summary = summarize(bonus);
                return (
                  <div key={index} style={rowStyle}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                      <span title={summary} style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {typeLabel(bonus.sid)}: {summary}
                      </span>
                      {bonus.receiverFilter && (
                        <span style={{ fontSize: '9px', color: 'var(--muted-soft)' }}>
                          {t(bonus.receiverFilter === 'all_heroes' ? 'bonusReceiverAll' : 'bonusReceiverStart')}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="compact-button danger"
                      title={t('bansRemove')}
                      style={{ flexShrink: 0 }}
                      onClick={() => removeBonus(index)}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!formOpen ? (
            <button
              type="button"
              className="compact-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => setFormOpen(true)}
            >
              <Plus size={12} />
              {t('bonusesAdd')}
            </button>
          ) : (
            <div style={{ display: 'grid', gap: '8px', borderLeft: '2px solid var(--accent)', paddingLeft: '8px' }}>
              <label style={selectStyle}>
                <span>{t('bonusTypeLabel')}</span>
                <select value={typeSid} onChange={(e) => setTypeSid(e.target.value)}>
                  {BONUS_TYPES.map((entry) => (
                    <option key={entry.sid} value={entry.sid}>{t(`bonusType_${entry.sid}`)}</option>
                  ))}
                </select>
              </label>
              <p className="field-note" style={{ margin: 0 }}>{t(`bonusTypeHelp_${typeSid}`)}</p>

              {currentType.hero && (
                <label style={selectStyle}>
                  <span>{t('bonusReceiver')}</span>
                  <select value={receiver} onChange={(e) => setReceiver(e.target.value)}>
                    <option value="start_hero">{t('bonusReceiverStart')}</option>
                    <option value="all_heroes">{t('bonusReceiverAll')}</option>
                  </select>
                </label>
              )}

              {typeSid === 'add_bonus_res' && (
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <label style={selectStyle}>
                    <span>{t('bonusParamResource')}</span>
                    <select value={resource} onChange={(e) => setResource(e.target.value)}>
                      {RESOURCES.map((name) => (
                        <option key={name} value={name}>{t(`bonusRes_${name}`)}</option>
                      ))}
                    </select>
                  </label>
                  <label style={selectStyle}>
                    <span>{t('bonusParamAmount')}</span>
                    <NumberField min={1} step={1} value={amount} onCommit={setAmount} />
                  </label>
                </div>
              )}

              {(typeSid === 'add_bonus_hero_exp' || typeSid === 'add_bonus_side_exp') && (
                <label style={selectStyle}>
                  <span>{t('bonusParamExp')}</span>
                  <NumberField min={1} step={50} value={expValue} onCommit={setExpValue} />
                </label>
              )}

              {typeSid === 'add_bonus_hero_spell' && (
                spells.length ? (
                  <label style={selectStyle}>
                    <span>{t('bonusParamSpell')}</span>
                    <select value={spellId} onChange={(e) => setSpellId(e.target.value)}>
                      <option value="">—</option>
                      {spells.map((spell) => (
                        <option key={spell.id} value={spell.id}>{spell.labelByLang[language] || spell.id}</option>
                      ))}
                    </select>
                  </label>
                ) : null
              )}

              {typeSid === 'add_bonus_hero_item' && (
                artifacts.length ? (
                  <label style={selectStyle}>
                    <span>{t('bonusParamItem')}</span>
                    <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                      <option value="">—</option>
                      {artifacts.map((item) => (
                        <option key={item.sid} value={item.sid}>{item.labelByLang?.[language] || item.label || item.sid}</option>
                      ))}
                    </select>
                  </label>
                ) : null
              )}

              {typeSid === 'add_bonus_hero_unit' && (
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <label style={selectStyle}>
                    <span>{t('bonusParamUnit')}</span>
                    {units.length ? (
                      <select value={unitSid} onChange={(e) => setUnitSid(e.target.value)}>
                        <option value="">—</option>
                        {units.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.labelByLang[language] || unit.id}{unit.tier ? ` (${unit.tier})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" value={unitSid} onChange={(e) => setUnitSid(e.target.value)} placeholder="minos" />
                    )}
                  </label>
                  <label style={selectStyle}>
                    <span>{t('bonusParamUnitCount')}</span>
                    <NumberField min={1} step={1} value={unitCount} onCommit={setUnitCount} />
                  </label>
                </div>
              )}

              {typeSid === 'add_bonus_hero_unit_multipler' && (
                <label style={selectStyle}>
                  <span>{t('bonusParamMultiplier')}</span>
                  <NumberField min={0} step={0.5} value={multiplier} onCommit={setMultiplier} />
                </label>
              )}

              {typeSid === 'add_bonus_hero_stat' && (
                <>
                  <label style={selectStyle}>
                    <span>{t('bonusStatPreset')}</span>
                    <select value={statPreset} onChange={(e) => setStatPreset(e.target.value as typeof statPreset)}>
                      <option value="movement">{t('bonusStat_movement')}</option>
                      <option value="freeSpell">{t('bonusStat_freeSpell')}</option>
                      <option value="manual">{t('bonusStat_manual')}</option>
                    </select>
                  </label>
                  {statPreset === 'movement' && (
                    <>
                      <label style={selectStyle}>
                        <span>{t('bonusStatValue')}</span>
                        <NumberField min={0} step={5} value={movementValue} onCommit={setMovementValue} />
                      </label>
                      <p className="field-note" style={{ margin: 0 }}>{t('bonusStatMovementHelp')}</p>
                    </>
                  )}
                  {statPreset === 'freeSpell' && spells.length > 0 && (
                    <label style={selectStyle}>
                      <span>{t('bonusParamSpell')}</span>
                      <select value={statSpellId} onChange={(e) => setStatSpellId(e.target.value)}>
                        <option value="">—</option>
                        {spells.map((spell) => (
                          <option key={spell.id} value={spell.id}>{spell.labelByLang[language] || spell.id}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {statPreset === 'manual' && (
                    <>
                      <div className="field-row" style={{ marginBottom: 0 }}>
                        <label style={selectStyle}>
                          <span>{t('bonusStatName')}</span>
                          {heroStatNames.length ? (
                            <select value={statName} onChange={(e) => setStatName(e.target.value)}>
                              <option value="">—</option>
                              {[...heroStatNames].sort().map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={statName}
                              autoComplete="off"
                              onChange={(e) => setStatName(e.target.value)}
                              placeholder="movementBonus"
                            />
                          )}
                        </label>
                        <label style={selectStyle}>
                          <span>{t('bonusStatValue')}</span>
                          <NumberField step={1} value={statValue} onCommit={setStatValue} />
                        </label>
                      </div>
                      <p className="field-note" style={{ margin: 0 }}>{t('bonusStatManualHelp')}</p>
                    </>
                  )}
                </>
              )}

              {needsCore && <p className="field-note" style={{ margin: 0 }}>{t('bonusesNeedCore')}</p>}

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="compact-button primary"
                  disabled={!canAdd}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: canAdd ? 1 : 0.5 }}
                  onClick={addBonus}
                >
                  <Plus size={12} />
                  {t('bonusesAdd')}
                </button>
                <button type="button" className="compact-button" onClick={() => setFormOpen(false)}>
                  {t('bonusesCloseForm')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
