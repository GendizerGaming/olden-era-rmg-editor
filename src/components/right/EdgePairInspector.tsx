import React from 'react';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { Edge } from '../../types/editor';
import { edgePairKey } from '../../store/zones';
import { Plus, Trash2 } from 'lucide-react';

interface EdgePairInspectorProps {
  pairId: string;
  edges: Edge[];
  actions: EditorActions;
  t: TranslationFunction;
}

export const EdgePairInspector: React.FC<EdgePairInspectorProps> = ({ pairId, edges, actions, t }) => {
  const pairEdges = edges.filter((e) => edgePairKey(e.from, e.to) === pairId);

  if (pairEdges.length === 0) {
    return <div className="inspector-empty">{t('emptyInspector')}</div>;
  }

  const { from, to } = pairEdges[0];
  const passages = pairEdges.filter((e) => e.connectionType !== 'Proximity');
  const spring = pairEdges.find((e) => e.connectionType === 'Proximity');

  const renderRow = (edge: Edge, label: string, swatchColor: string, detail?: string) => (
    <div
      key={edge.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--panel-2)',
        border: '1px solid var(--line)',
        cursor: 'pointer',
        transition: 'background 150ms ease, border-color 150ms ease'
      }}
      onClick={() => actions.setSelected({ type: 'edge', id: edge.id })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
        <span
          style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: swatchColor,
            flexShrink: 0
          }}
        ></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
          <span style={{ fontSize: 'var(--fz-base)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          {detail && (
            <span style={{ fontSize: 'var(--fz-caption)', color: 'var(--muted-soft)' }}>{detail}</span>
          )}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="compact-button danger"
          title={t('deleteTitle')}
          onClick={() => actions.deleteEdge(edge.id)}
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ fontSize: 'var(--fz-emph)', fontWeight: 700 }}>
        {from} ↔ {to}
      </div>

      <div className="control-label">{t('pairPassages')} ({passages.length})</div>
      <div style={{ display: 'grid', gap: '4px' }}>
        {passages.map((edge) =>
          renderRow(
            edge,
            t(`connType${edge.connectionType}`),
            'var(--guard-label-fill)',
            `${t('passGuard')}: ${edge.guardValue.toLocaleString()}${edge.road ? ` (${t('road')})` : ''}`
          )
        )}
        {passages.length === 0 && (
          <p className="ui-field-hint" style={{ margin: 0 }}>{t('pairNoPassages')}</p>
        )}
      </div>
      <button
        type="button"
        className="compact-button"
        style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        onClick={() => actions.connectZones(from, to)}
      >
        <Plus size={12} />
        {t('pairAddPassage')}
      </button>

      <div className="control-label" style={{ marginTop: '4px' }}>{t('pairSpring')}</div>
      {spring ? (
        <div style={{ display: 'grid', gap: '4px' }}>
          {renderRow(spring, t('connTypeProximity'), 'var(--accent-2)')}
        </div>
      ) : (
        <>
          <p className="ui-field-hint" style={{ margin: 0 }}>{t('pairNoSpring')}</p>
          <button
            type="button"
            className="compact-button"
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={() => actions.connectZones(from, to, 'Proximity')}
          >
            <Plus size={12} />
            {t('pairAddSpring')}
          </button>
        </>
      )}
    </div>
  );
};
