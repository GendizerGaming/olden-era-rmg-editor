import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { standardBanPreset } from '../../store/constants';
import { useTranslation } from '../../i18n/context';
import { Ban, Plus, Trash2, ChevronDown, ChevronRight, ShieldBan } from 'lucide-react';
import { ListRow } from '../shared/primitives';

type BanCategory = 'heroes' | 'spells' | 'items';

interface BanEntry {
  id: string;
  label: string;
  detail: string;
  group: string;
}

const SETTING_BY_CATEGORY = {
  heroes: 'bannedHeroes',
  spells: 'bannedSpells',
  items: 'bannedItems'
} as const;

export const BansSection: React.FC = () => {
  const { t, language } = useTranslation();
  const settings = useEditorStore((state) => state.settings);
  const coreCatalog = useEditorStore((state) => state.coreCatalog);
  const objectLibrary = useEditorStore((state) => state.objectLibrary);
  const factions = useEditorStore((state) => state.factions);
  const actions = useEditorStore((state) => state.actions);

  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<BanCategory>('heroes');
  const [query, setQuery] = useState('');

  const bannedByCategory: Record<BanCategory, string[]> = {
    heroes: settings.bannedHeroes,
    spells: settings.bannedSpells,
    items: settings.bannedItems
  };
  const totalBanned =
    settings.bannedHeroes.length + settings.bannedSpells.length + settings.bannedItems.length;

  const factionLabel = (id: string): string => {
    const faction = factions.find((entry) => entry.id === id);
    return faction?.labelByLang?.[language] || faction?.label || id || t('bansGroupOther');
  };

  // The full pickable catalog per category, with display labels and groups.
  const catalogs = useMemo<Record<BanCategory, BanEntry[]>>(() => {
    const heroes: BanEntry[] = (coreCatalog?.heroes ?? []).map((hero) => ({
      id: hero.id,
      label: hero.labelByLang[language] || hero.id,
      detail: hero.classType === 'magic' ? t('bansClassMagic') : t('bansClassMight'),
      group: factionLabel(hero.faction)
    }));

    const spells: BanEntry[] = (coreCatalog?.spells ?? []).map((spell) => ({
      id: spell.id,
      label: spell.labelByLang[language] || spell.id,
      detail: spell.kind === 'world' ? t('bansSpellWorld') : t('bansSpellBattle'),
      group: t(`bansSchool_${spell.school}`) || spell.school
    }));

    const rarityOrder = ['common', 'rare', 'epic', 'legendary'];
    const items: BanEntry[] = objectLibrary
      .filter((item) => item.kind === 'sid' && item.tag === 'Artifact' && item.sid)
      .map((item) => ({
        id: item.sid!,
        label: item.labelByLang?.[language] || item.label || item.sid!,
        detail: item.sid!,
        group: rarityOrder.includes(item.rarity || '')
          ? t(`bansRarity_${item.rarity}`)
          : t('bansGroupOther')
      }));

    return { heroes, spells, items };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreCatalog, objectLibrary, factions, language, t]);

  const activeCatalog = catalogs[category];
  const banned = bannedByCategory[category];

  const setBanned = (cat: BanCategory, next: string[]) => {
    actions.updateSettings({ [SETTING_BY_CATEGORY[cat]]: next });
  };
  const addBan = (cat: BanCategory, id: string, name: string) => {
    if (!bannedByCategory[cat].includes(id)) {
      setBanned(cat, [...bannedByCategory[cat], id]);
      actions.addNotification('notificationBanAdded', { name }, 'success');
    }
  };
  const removeBan = (cat: BanCategory, id: string, name: string) => {
    setBanned(cat, bannedByCategory[cat].filter((entry) => entry !== id));
    actions.addNotification('notificationBanRemoved', { name }, 'info');
  };
  const clearAllBans = () => {
    if (!window.confirm(t('bansClearConfirm'))) return;
    actions.updateSettings({ bannedItems: [], bannedSpells: [], bannedHeroes: [] });
    actions.addNotification('notificationBansCleared', undefined, 'info');
  };

  // One click bans what the official templates usually ban (merged on top
  // of the current bans, nothing is removed).
  const applyStandardBans = () => {
    const nextItems = [...new Set([...settings.bannedItems, ...standardBanPreset.items])];
    const nextSpells = [...new Set([...settings.bannedSpells, ...standardBanPreset.spells])];
    const added = (nextItems.length - settings.bannedItems.length) + (nextSpells.length - settings.bannedSpells.length);
    if (added === 0) {
      actions.addNotification('notificationStandardBansNone', undefined, 'info');
      return;
    }
    actions.updateSettings({ bannedItems: nextItems, bannedSpells: nextSpells });
    actions.addNotification('notificationStandardBansApplied', { count: added }, 'success');
  };

  // Grouped + filtered picker entries
  const grouped = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const filtered = lower
      ? activeCatalog.filter(
          (entry) =>
            entry.label.toLowerCase().includes(lower) || entry.id.toLowerCase().includes(lower)
        )
      : activeCatalog;
    const groups = new Map<string, BanEntry[]>();
    for (const entry of filtered) {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group)!.push(entry);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeCatalog, query]);

  // Display info for an already banned id (falls back to the raw id when the
  // catalog is not loaded)
  const bannedEntryLabel = (cat: BanCategory, id: string): string => {
    const entry = catalogs[cat].find((candidate) => candidate.id === id);
    return entry ? entry.label : id;
  };

  const categoryTitles: Record<BanCategory, string> = {
    heroes: t('bansCatHeroes'),
    spells: t('bansCatSpells'),
    items: t('bansCatItems')
  };

  return (
    <section className="collapsible-section">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <h2>
          <Ban size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          {t('bansTitle')}{totalBanned > 0 ? ` (${totalBanned})` : ''}
        </h2>
        {expanded ? (
          <ChevronDown size={14} className="collapse-icon" />
        ) : (
          <ChevronRight size={14} className="collapse-icon" />
        )}
      </div>

      {expanded && (
        <div className="collapsible-body">
          <p className="ui-field-hint" style={{ marginBottom: '8px' }}>{t('bansHelp')}</p>

          <button
            type="button"
            className="small-button"
            style={{ width: '100%', justifyContent: 'center', marginBottom: '10px' }}
            title={t('bansApplyStandardTitle')}
            onClick={applyStandardBans}
          >
            <ShieldBan size={12} style={{ marginRight: '4px' }} />
            {t('bansApplyStandard')}
          </button>

          {/* Banned list */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div className="control-label">{t('bansBannedList')} ({totalBanned})</div>
            {totalBanned > 0 && (
              <button
                type="button"
                className="compact-button danger"
                style={{ flexShrink: 0 }}
                onClick={clearAllBans}
              >
                {t('bansClear')}
              </button>
            )}
          </div>
          {totalBanned === 0 ? (
            <p className="ui-field-hint" style={{ margin: '4px 0 10px' }}>{t('bansEmpty')}</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gridAutoRows: 'max-content',
                alignContent: 'start',
                gap: '4px',
                maxHeight: '220px',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: '4px',
                margin: '4px 0 10px'
              }}
            >
              {(['heroes', 'spells', 'items'] as BanCategory[]).flatMap((cat) =>
                bannedByCategory[cat].map((id) => {
                  const label = bannedEntryLabel(cat, id);
                  return (
                    <ListRow
                      key={`${cat}:${id}`}
                      title={label}
                      subtitle={categoryTitles[cat]}
                      trailing={
                        <button
                          type="button"
                          className="compact-button danger"
                          title={t('bansRemove')}
                          onClick={() => removeBan(cat, id, label)}
                        >
                          <Trash2 size={10} />
                        </button>
                      }
                    />
                  );
                })
              )}
            </div>
          )}

          {/* Category picker */}
          <div className="segmented-control three" role="group" aria-label={t('bansTitle')} style={{ marginBottom: '8px' }}>
            {(['heroes', 'spells', 'items'] as BanCategory[]).map((cat) => (
              <label key={cat}>
                <input
                  type="radio"
                  name="bans-category"
                  value={cat}
                  checked={category === cat}
                  onChange={() => setCategory(cat)}
                />
                <span>{categoryTitles[cat]}</span>
              </label>
            ))}
          </div>

          {activeCatalog.length === 0 ? (
            <p className="ui-field-hint">{t('bansNeedCore')}</p>
          ) : (
            <>
              <div className="library-filter">
                <input
                  type="search"
                  placeholder={t('bansSearch')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ paddingLeft: '10px' }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  gridAutoRows: 'max-content',
                  alignContent: 'start',
                  gap: '6px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  paddingRight: '4px'
                }}
              >
                {grouped.map(([group, entries]) => (
                  <details key={group} open={grouped.length === 1 || Boolean(query.trim())}>
                    <summary
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: 'var(--fz-caption)',
                        fontWeight: 600,
                        color: 'var(--muted)',
                        padding: '2px 0'
                      }}
                    >
                      {group} ({entries.length})
                    </summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '4px', padding: '4px 0 6px' }}>
                      {entries.map((entry) => {
                        const isBanned = banned.includes(entry.id);
                        return (
                          <ListRow
                            key={entry.id}
                            active={isBanned}
                            leading={!isBanned && (
                              <button
                                type="button"
                                className="compact-button primary"
                                title={t('bansAdd')}
                                onClick={() => addBan(category, entry.id, entry.label)}
                              >
                                <Plus size={10} />
                              </button>
                            )}
                            title={entry.label}
                            subtitle={entry.detail}
                            trailing={isBanned && (
                              <button
                                type="button"
                                className="compact-button danger"
                                title={t('bansRemove')}
                                onClick={() => removeBan(category, entry.id, entry.label)}
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          />
                        );
                      })}
                    </div>
                  </details>
                ))}
                {grouped.length === 0 && (
                  <p className="ui-field-hint">{t('bansNothingFound')}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
