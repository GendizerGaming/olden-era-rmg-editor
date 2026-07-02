import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { Edge, Zone } from '../../types/editor';
import { Field, InfoTip } from '../shared/primitives';
import { Copy, MousePointerClick } from 'lucide-react';

interface CopyConnectionsControlProps {
  /** Connections to clone; springs are ignored (only guarded passages copy). */
  sourceEdges: Edge[];
  zones: Zone[];
  actions: EditorActions;
  t: TranslationFunction;
}

/**
 * Additive copy of a connection (or a whole pair's passages) onto another zone
 * pair: pick two zones, clones are appended between them, existing connections
 * there are left untouched. The (i) tip spells out what carries over.
 */
export const CopyConnectionsControl: React.FC<CopyConnectionsControlProps> = ({ sourceEdges, zones, actions, t }) => {
  const passages = sourceEdges.filter((e) => e.connectionType !== 'Proximity');
  const first = passages[0];
  const [open, setOpen] = React.useState(false);
  const [zoneA, setZoneA] = React.useState(first?.from ?? '');
  const [zoneB, setZoneB] = React.useState(first?.to ?? '');
  const zonePick = useEditorStore((state) => state.zonePick);
  const picking = zonePick !== null;

  // Canvas picks flow into the selects as they land; the second click ends
  // the picking session.
  React.useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      const pick = state.zonePick;
      if (!pick || pick === prev.zonePick || pick.length === 0) return;
      setZoneA(pick[0]);
      if (pick.length === 2) {
        setZoneB(pick[1]);
        actions.cancelZonePick();
      }
    });
  }, [actions]);

  // Leaving the picker (or the inspector) always ends the picking session.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actions.cancelZonePick();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      actions.cancelZonePick();
    };
  }, [open, actions]);

  if (passages.length === 0) return null;

  const single = passages.length === 1;
  const canApply = Boolean(zoneA) && Boolean(zoneB) && zoneA !== zoneB;

  const apply = () => {
    if (!canApply) return;
    actions.addConnectionsBetweenZones(passages.map((e) => e.id), zoneA, zoneB);
    setOpen(false);
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          className="compact-button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          onClick={() => setOpen((v) => !v)}
        >
          <Copy size={12} />
          {single ? t('copyConnectionButton') : t('copyConnectionsButton', { count: passages.length })}
        </button>
        <InfoTip text={t('copyConnectionsInfo')} />
      </div>

      {open && (
        <div
          style={{
            display: 'grid',
            gap: '8px',
            padding: '8px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--panel-2)'
          }}
        >
          <button
            type="button"
            className={`compact-button${picking ? ' active' : ''}`}
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={() => (picking ? actions.cancelZonePick() : actions.startZonePick())}
          >
            <MousePointerClick size={12} />
            {picking ? t('copyConnectionsPickCancel') : t('copyConnectionsPick')}
          </button>
          {picking && (
            <p className="ui-field-hint" style={{ margin: 0 }}>{t('copyConnectionsPickHint')}</p>
          )}

          <Field label={t('copyConnectionsZoneA')}>
            <select value={zoneA} onChange={(e) => setZoneA(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.id}</option>
              ))}
            </select>
          </Field>
          <Field label={t('copyConnectionsZoneB')}>
            <select value={zoneB} onChange={(e) => setZoneB(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.id}</option>
              ))}
            </select>
          </Field>
          {zoneA === zoneB && (
            <p className="ui-field-hint" style={{ margin: 0, color: 'var(--accent-2)' }}>{t('copyConnectionsSameZone')}</p>
          )}
          <button
            type="button"
            className="compact-button"
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            disabled={!canApply}
            onClick={apply}
          >
            <Copy size={12} />
            {single ? t('copyConnectionsApplyOne') : t('copyConnectionsApply', { count: passages.length })}
          </button>
        </div>
      )}
    </div>
  );
};
