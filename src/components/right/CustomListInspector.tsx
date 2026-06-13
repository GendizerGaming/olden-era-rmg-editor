import React from 'react';
import { catalogItemForReference } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import { Trash2 } from 'lucide-react';
import type { CatalogItem, CustomObjectList, CustomObjectListEntry } from '../../types/editor';
import { NumberField } from '../shared/NumberField';

interface CustomListInspectorProps {
  listId: string;
  customObjectLists: Record<string, CustomObjectList>;
  actions: EditorActions;
  t: TranslationFunction;
  language: 'ru' | 'en';
  objectLibrary: CatalogItem[];
}

interface CustomListInspectorContentProps extends Omit<CustomListInspectorProps, 'listId'> {
  list: CustomObjectList;
}

export const CustomListInspectorContent: React.FC<CustomListInspectorContentProps> = ({
  list,
  customObjectLists,
  actions,
  t,
  language,
  objectLibrary
}) => {
  const listId = list.id;
  const [localId, setLocalId] = React.useState(list.id);
  const [localLabel, setLocalLabel] = React.useState(list.label);

  const handleCommitId = () => {
    const sanitized = localId.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitized) {
      setLocalId(list.id);
      return;
    }
    if (sanitized === list.id) {
      setLocalId(list.id);
      return;
    }
    const success = actions.updateCustomList(listId, { id: sanitized });
    if (success) {
      actions.addNotification('notificationCustomListIdUpdated', { id: sanitized }, 'success');
    } else {
      setLocalId(list.id);
    }
  };

  const handleCommitLabel = () => {
    const trimmed = localLabel.trim();
    if (!trimmed || trimmed === list.label) {
      setLocalLabel(list.label);
      return;
    }
    const success = actions.updateCustomList(listId, { label: trimmed });
    if (success) {
      actions.addNotification('notificationCustomListLabelUpdated', { label: trimmed }, 'success');
    } else {
      setLocalLabel(list.label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const getEntryName = (entry: CustomObjectListEntry): string => {
    if (entry.kind === 'list') {
      const nested = customObjectLists[entry.value];
      return nested ? nested.label : `${t('customListNestedNotFound', { listId: '', nestedId: entry.value }) || entry.value}`;
    } else {
      const item = catalogItemForReference(objectLibrary, { kind: 'sid', value: entry.value });
      if (item) {
        return item.labelByLang?.[language] || item.label || item.sid || item.id;
      }
      return entry.value;
    }
  };

  const getEntryDescription = (entry: CustomObjectListEntry): string => {
    if (entry.kind === 'list') {
      const nested = customObjectLists[entry.value];
      if (nested) {
        return t('customListDescription') || 'Custom object set';
      }
      const item = catalogItemForReference(objectLibrary, { kind: 'list', value: entry.value });
      if (item) {
        return item.descriptionByLang?.[language] || item.description || t('nestedListType') || 'Nested list';
      }
      return '';
    } else {
      const item = catalogItemForReference(objectLibrary, { kind: 'sid', value: entry.value });
      if (item) {
        return item.descriptionByLang?.[language] || item.description || '';
      }
      return '';
    }
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <label>
        {t('customListIdLabel') || 'ID набора (латиница, без пробелов):'}
        <input
          type="text"
          value={localId}
          onChange={(e) => setLocalId(e.target.value)}
          onBlur={handleCommitId}
          onKeyDown={handleKeyDown}
        />
      </label>

      <label>
        {t('customListLabelLabel') || 'Название набора:'}
        <input
          type="text"
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          onBlur={handleCommitLabel}
          onKeyDown={handleKeyDown}
        />
      </label>

      <div className="inspector-section-title" style={{ marginTop: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>
          {t('customListEntriesTitle') || 'Содержимое набора:'} ({list.entries.length})
        </h3>
      </div>

      <div style={{ display: 'grid', gap: '8px', maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' }}>
        {list.entries.map((entry) => (
          <div
            key={entry.key}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '8px',
              backgroundColor: 'var(--panel-bg-dark)',
              display: 'grid',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '12px' }}>{getEntryName(entry)}</strong>
                <span style={{ fontSize: '10px', opacity: 0.6 }}>
                  {entry.kind === 'list' ? `${t('nestedListType') || 'Вложенный список'}: ${entry.value}` : `SID: ${entry.value}`}
                </span>
                {getEntryDescription(entry) && (
                  <span style={{ fontSize: '10px', marginTop: '2px', color: 'var(--muted)', opacity: 0.85 }}>
                    {getEntryDescription(entry)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="icon-button delete"
                title={t('remove')}
                onClick={() => actions.removeEntryFromCustomList(listId, entry.key)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--red-color)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  fontSize: '11px'
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11px', margin: 0, whiteSpace: 'nowrap' }} htmlFor={`weight-${entry.key}`}>
                {t('customListEntryWeight') || 'Вес:'}
              </label>
              <NumberField
                id={`weight-${entry.key}`}
                min="0"
                value={entry.weight}
                onCommit={(v) => actions.updateEntryWeightInCustomList(listId, entry.key, Math.max(0, Math.floor(v)))}
                style={{ width: '70px', padding: '2px 6px', fontSize: '12px' }}
              />
            </div>
          </div>
        ))}

        {list.entries.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', opacity: 0.7, border: '1px dashed var(--border-color)', borderRadius: '4px', fontSize: '12px' }}>
            {t('emptyCustomListTip') || 'Выбирайте объекты в библиотеке слева и нажимайте "+", чтобы добавить их в этот набор.'}
          </div>
        )}
      </div>
    </div>
  );
};

export const CustomListInspector: React.FC<CustomListInspectorProps> = (props) => {
  const list = props.customObjectLists[props.listId];
  if (!list) {
    return <div className="inspector-empty">{props.t('emptyInspector')}</div>;
  }
  return (
    <CustomListInspectorContent
      key={`${list.id}:${list.label}`}
      list={list}
      customObjectLists={props.customObjectLists}
      actions={props.actions}
      t={props.t}
      language={props.language}
      objectLibrary={props.objectLibrary}
    />
  );
};

