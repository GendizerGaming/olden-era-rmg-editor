import React from 'react';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import { List } from 'lucide-react';
import type { Edge, Zone } from '../../types/editor';

interface ElementsListInspectorProps {
  zones: Zone[];
  edges: Edge[];
  actions: EditorActions;
  t: TranslationFunction;
  language: 'ru' | 'en';
}

export const ElementsListInspector: React.FC<ElementsListInspectorProps> = ({
  zones,
  edges,
  actions,
  t,
  language
}) => {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
        <List size={16} />
        <h3 style={{ margin: 0, fontSize: '14px' }}>
          {t('elementsListTitle') || 'Все элементы схемы'}
        </h3>
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        <h4 style={{ margin: '4px 0 2px 0', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
          {t('elementsListZones') || 'Зоны схемы'} ({zones.length})
        </h4>
        
        {/* gridAutoRows: max-content keeps the cards at natural height: their
            overflow:hidden would otherwise let the constrained grid squash
            them flat instead of scrolling. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: '8px', maxHeight: '300px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>
          {zones.map((zone) => {
            const hasMainObjects = zone.mainObjects && zone.mainObjects.length > 0;
            const hasObjects = zone.objects && zone.objects.length > 0;
            return (
              <details
                key={zone.id}
                className="list-content-entry"
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  background: 'var(--panel-2)',
                  overflow: 'hidden'
                }}
              >
                <summary
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: zone.type === 'spawn' ? '#fef08a' : zone.type === 'neutral' ? '#cbd5e1' : '#bbf7d0',
                        border: '1px solid var(--line-dark)',
                        flexShrink: 0
                      }}
                    />
                    <strong style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {zone.label || zone.id}
                    </strong>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ({zone.id})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      actions.setSelected({ type: 'zone', id: zone.id });
                    }}
                    className="compact-button primary"
                    style={{ padding: '2px 6px', fontSize: '11px', height: '22px', marginLeft: '8px', flexShrink: 0 }}
                  >
                    {t('selectMode') || 'Выбрать'}
                  </button>
                </summary>
                
                <div style={{ padding: '8px 10px', display: 'grid', gap: '6px', fontSize: '11px', borderTop: '1px solid var(--line)', background: 'var(--panel)', lineHeight: 1.35 }}>
                  <div><strong>{t('zoneType')}:</strong> {zone.type}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><strong>{t('guarded')}:</strong> {zone.guardedValue.toLocaleString()}</div>
                    <div><strong>{t('unguarded')}:</strong> {zone.unguardedValue.toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><strong>{t('resources')}:</strong> {zone.resourcesValue.toLocaleString()}</div>
                    <div><strong>{t('zoneSize')}:</strong> {zone.size}</div>
                  </div>
                  
                  {hasMainObjects && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--muted-soft)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>
                        {t('elementsListMainObjects') || 'Замки и стартовые позиции'}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '12px', listStyleType: 'disc' }}>
                        {zone.mainObjects.map((mo, idx) => (
                          <li key={mo.key || idx}>
                            {mo.type === 'Spawn' 
                              ? `${t('startingZoneCheckbox') || 'Стартовая позиция'} (Игрок ${mo.player})` 
                              : `${t('zoneCity') || 'Замок'} (${mo.factionMode === 'specific' ? mo.factionId : mo.factionMode})`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--muted-soft)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>
                      {t('elementsListObjects') || 'Объекты'} ({zone.objects.length})
                    </div>
                    {hasObjects ? (
                      <ul style={{ margin: 0, paddingLeft: '12px', listStyleType: 'square' }}>
                        {zone.objects.map((obj) => {
                          const name = obj.labelByLang?.[language] || obj.label || obj.sid || obj.includeList || obj.id;
                          return (
                            <li key={obj.key} style={{ marginBottom: '2px' }}>
                              <code className="sid-badge" style={{ fontSize: '9px', padding: '0px 3px' }}>{obj.sid || obj.includeList || obj.id}</code>
                              <span>{name} x{obj.count} {obj.guarded ? `(${t('guardedShort') || 'охр.'})` : `(${t('unguardedShort') || 'без охр.'})`}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--muted-soft)', fontStyle: 'italic' }}>
                        {t('elementsListNoObjects') || 'Нет объектов'}
                      </span>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* Divider keeps the two sections from blending together */}
      <div style={{ display: 'grid', gap: '8px', marginTop: '4px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
        <h4 style={{ margin: '4px 0 2px 0', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
          {t('elementsListEdges') || 'Связи между зонами'} ({edges.length})
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: '8px', maxHeight: '300px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>
          {edges.map((edge) => {
            const isProximity = edge.connectionType === 'Proximity';
            return (
              <div
                key={edge.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  background: 'var(--panel-2)',
                  padding: '6px 10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {edge.from} ↔ {edge.to}
                  </div>
                  <span style={{ fontSize: '9px', color: 'var(--muted-soft)' }}>
                    {isProximity
                      ? `${t('connTypeProximity') || 'Пружина (Proximity)'}`
                      : `${t(`connType${edge.connectionType}`) || edge.connectionType}: ${edge.guardValue.toLocaleString()} ${edge.road ? `(${t('road')})` : ''}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => actions.setSelected({ type: 'edge', id: edge.id })}
                  className="compact-button primary"
                  style={{ padding: '2px 6px', fontSize: '11px', height: '22px', marginLeft: '8px', flexShrink: 0 }}
                >
                  {t('selectMode') || 'Выбрать'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

