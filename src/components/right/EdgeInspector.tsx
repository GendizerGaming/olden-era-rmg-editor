import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { EditorActions } from '../../store/useEditorStore';
import type { TranslationFunction } from '../../i18n/context';
import type { Edge, Zone, ConnectionType } from '../../types/editor';
import type { RmgPlacementRule } from '../../types/rmg';
import { CONNECTION_TYPES } from '../../types/editor';
import { edgePairKey } from '../../store/zones';
import { resolveDistance, encodeDistance, ruleBounds } from '../../store/constants';
import { NumberField } from '../shared/NumberField';
import { Field, FieldRow, Toggle } from '../shared/primitives';
import { CollapsibleSubsection } from '../shared/CollapsibleSubsection';
import { CopyConnectionsControl } from './CopyConnectionsControl';
import { DistanceField } from '../shared/DistanceField';
import { ValueBadge } from '../shared/ValueBadge';
import { ArrowLeft } from 'lucide-react';

interface EdgeInspectorProps {
  edge: Edge;
  edges: Edge[];
  zones: Zone[];
  actions: EditorActions;
  t: TranslationFunction;
}

export const EdgeInspector: React.FC<EdgeInspectorProps> = ({ edge, edges, zones, actions, t }) => {
  const isExpert = useEditorStore((state) => state.uiMode) === 'expert';
  // Picking "exact value" is a UI choice, not something the number alone can
  // tell us: a value that happens to equal a preset must still keep the box
  // open. Keyed by edge id so selecting another connection resets it.
  const [customLengthFor, setCustomLengthFor] = React.useState<string | null>(null);
  const isProximity = edge.connectionType === 'Proximity';
  const isPortal = edge.connectionType === 'Portal';
  const pairId = edgePairKey(edge.from, edge.to);
  const pairCount = edges.filter((e) => edgePairKey(e.from, e.to) === pairId).length;

  // Portal mouth distance: the DistanceField shows the leading rule's bounds;
  // editing it rewrites that rule's distance and keeps the rest (type, weight,
  // any extra rules) verbatim. "any" clears the portal rules for that side.
  const portalValue = (rules?: RmgPlacementRule[]): string => {
    const bounds = rules?.[0] ? ruleBounds(rules[0]) : null;
    return bounds ? encodeDistance(bounds.min, bounds.max) : 'any';
  };
  const buildPortalRules = (current: RmgPlacementRule[] | undefined, value: string): RmgPlacementRule[] | undefined => {
    const bounds = resolveDistance(value);
    if (!bounds) return undefined;
    const rules: RmgPlacementRule[] = current?.length ? current.map((r) => ({ ...r })) : [{ type: 'Crossroads', args: [], weight: 1 }];
    const head = { ...rules[0] };
    delete head.target;
    rules[0] = { ...head, targetMin: bounds.min, targetMax: bounds.max };
    return rules;
  };

  // The one-spring-per-pair rule is enforced by the store: a blocked switch
  // leaves the edge unchanged and raises an error toast.
  const handleTypeChange = (next: ConnectionType) => {
    if (next === 'Proximity') {
      actions.updateEdgeField(edge.id, { connectionType: next, length: edge.length ?? 0.1 });
    } else {
      actions.updateEdgeField(edge.id, { connectionType: next });
    }
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {pairCount > 1 && (
        <button
          type="button"
          className="compact-button"
          style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          onClick={() => actions.setSelected({ type: 'edgePair', id: pairId })}
        >
          <ArrowLeft size={12} />
          {t('backToPairList')} ({pairCount})
        </button>
      )}

      <FieldRow>
        <Field label={t('from')}>
          <input type="text" value={edge.from} disabled />
        </Field>
        <Field label={t('to')}>
          <input type="text" value={edge.to} disabled />
        </Field>
      </FieldRow>

      {!isProximity && (
        <CopyConnectionsControl sourceEdges={[edge]} zones={zones} actions={actions} t={t} />
      )}

      <Field label={t('connectionPurpose')}>
        <select
          value={edge.connectionType}
          onChange={(e) => handleTypeChange(e.target.value as ConnectionType)}
        >
          {CONNECTION_TYPES.map((type) => (
            <option key={type} value={type}>{t(`connType${type}`)}</option>
          ))}
        </select>
      </Field>
      <p className="ui-field-hint" style={{ marginTop: 0 }}>{t(`connTypeHelp${edge.connectionType}`)}</p>

      {!isProximity ? (
        <div className="ui-indent" style={{ display: 'grid', gap: '8px' }}>
          <Field label={<>{t('passGuard')}<ValueBadge kind="guardStrength" value={edge.guardValue} /></>}>
            <NumberField
              min={0}
              step={5000}
              value={edge.guardValue}
              onCommit={(v) => actions.updateEdgeField(edge.id, { guardValue: v })}
            />
          </Field>

          {isExpert && (
          <>
          {/* guardRandomization is deliberately not offered here: the field
              exists on zones and main objects, but the game's Connection
              model ignores it (imported values still round-trip). */}
          <Field label={t('guardWeeklyIncrement')} tip={t('guardTuningHelp')}>
            <NumberField
              min={0}
              max={1}
              step={0.05}
              value={edge.guardWeeklyIncrement ?? 0}
              onCommit={(v) => actions.updateEdgeField(edge.id, { guardWeeklyIncrement: v })}
            />
          </Field>

          <Toggle
            checked={edge.guardEscape ?? true}
            onChange={(v) => actions.updateEdgeField(edge.id, { guardEscape: v })}
            label={t('guardEscape')}
            tip={t('guardEscapeHelp')}
          />
          </>
          )}

          {isPortal && isExpert && (
            <div style={{ display: 'grid', gap: '8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-2)', padding: '8px' }}>
              <div className="control-label" style={{ margin: 0 }}>{t('portalPlacementSection')}</div>
              <DistanceField
                label={t('portalPlacementFrom', { zone: edge.from })}
                value={portalValue(edge.portalPlacementRulesFrom)}
                onChange={(v) => actions.updateEdgeField(edge.id, { portalPlacementRulesFrom: buildPortalRules(edge.portalPlacementRulesFrom, v) })}
              />
              <DistanceField
                label={t('portalPlacementTo', { zone: edge.to })}
                value={portalValue(edge.portalPlacementRulesTo)}
                onChange={(v) => actions.updateEdgeField(edge.id, { portalPlacementRulesTo: buildPortalRules(edge.portalPlacementRulesTo, v) })}
              />
              <p className="ui-field-hint" style={{ margin: 0 }}>{t('portalPlacementHelp')}</p>

              {(() => {
                // A portal is two-way unless a side is switched off, so the
                // toggle is derived state: on means some side carries `false`.
                // The three one-way shapes map onto the pair of flags:
                //   entrance in From -> the To mouth is off
                //   entrance in To   -> the From mouth is off
                //   none             -> both off (no way in at all)
                const fromOff = edge.portalFromEnabled === false;
                const toOff = edge.portalToEnabled === false;
                const oneWay = fromOff || toOff;
                const entrance = fromOff && toOff ? 'none' : fromOff ? 'to' : 'from';
                // Once one-way is on, both sides are written out explicitly, the
                // way the engine authors document it: relying on the omitted
                // side defaulting to true would break if that default ever
                // changed. Switching one-way off drops both fields again, so a
                // plain two-way portal stays byte-identical to how it imported.
                const setEntrance = (next: string) =>
                  actions.updateEdgeField(edge.id, {
                    portalFromEnabled: next !== 'to' && next !== 'none',
                    portalToEnabled: next !== 'from' && next !== 'none'
                  });
                return (
                  <>
                    <Toggle
                      checked={oneWay}
                      onChange={(v) =>
                        v
                          ? setEntrance('from')
                          : actions.updateEdgeField(edge.id, {
                              portalFromEnabled: undefined,
                              portalToEnabled: undefined
                            })
                      }
                      label={t('portalOneWay')}
                      tip={t('portalOneWayHelp')}
                    />
                    {oneWay && (
                      <>
                        <Field label={t('portalEntrance')}>
                          <select value={entrance} onChange={(e) => setEntrance(e.target.value)}>
                            <option value="from">{t('portalEntranceIn', { zone: edge.from })}</option>
                            <option value="to">{t('portalEntranceIn', { zone: edge.to })}</option>
                            <option value="none">{t('portalEntranceNone')}</option>
                          </select>
                        </Field>
                        <p className="ui-field-hint" style={{ margin: 0, ...(entrance === 'none' ? { color: 'var(--accent-2)' } : {}) }}>
                          {entrance === 'none'
                            ? t('portalEntranceNoneHelp')
                            : t('portalEntranceHelp', { entry: entrance === 'from' ? edge.from : edge.to, exit: entrance === 'from' ? edge.to : edge.from })}
                        </p>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div className="control-label" style={{ marginTop: '4px' }}>
            {t(isPortal ? 'connectionRoutePortal' : 'connectionRoute')}
          </div>
          <div className="segmented-control" role="group" aria-label={t(isPortal ? 'connectionRoutePortal' : 'connectionRoute')}>
            <label>
              <input
                type="radio"
                name="edge-route"
                value="true"
                checked={edge.road}
                onChange={() => actions.updateEdgeField(edge.id, { road: true })}
              />
              <span>{t('routeRoad')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="edge-route"
                value="false"
                checked={!edge.road}
                onChange={() => actions.updateEdgeField(edge.id, { road: false })}
              />
              <span>{t('routePath')}</span>
            </label>
          </div>
          <p className="ui-field-hint">{t(isPortal ? 'routeHelpPortal' : 'routeHelp')}</p>

          {edge.road && (
            <>
              <Field label={t('roadTypeLabel')} tip={t('roadTypeHelp')}>
                <select
                  value={edge.roadType ?? 'Stone'}
                  onChange={(e) => actions.updateEdgeField(edge.id, { roadType: e.target.value === 'Dirt' ? 'Dirt' : 'Stone' })}
                >
                  <option value="Stone">{t('roadTypeStone')}</option>
                  <option value="Dirt">{t('roadTypeDirt')}</option>
                </select>
              </Field>
            </>
          )}

          {/* Rarely-touched knobs go last, below the everyday controls. */}
          {isExpert && (
          <CollapsibleSubsection id={`edge.advanced.${edge.id}`} title={t('edgeAdvancedSection')} defaultOpen={false} boxed>
            {(() => {
              const guardZone = edge.guardZone ?? '';
              const guardZoneKnown = ['', 'Center', edge.from, edge.to].includes(guardZone);
              const gatePlacement = edge.gatePlacement ?? '';
              const gateKnown = ['', 'Center'].includes(gatePlacement);
              const matchGroups = [...new Set(
                edges.map((e) => e.guardMatchGroup).filter((g): g is string => Boolean(g))
              )].sort();
              return (
                <div style={{ display: 'grid', gap: '8px' }}>
                  <Field label={t('edgeGuardZone')} tip={t('edgeGuardZoneHelp')}>
                    <select
                      value={guardZone}
                      onChange={(e) => actions.updateEdgeField(edge.id, { guardZone: e.target.value || undefined })}
                    >
                      <option value="">{t('edgeGuardZoneAuto')}</option>
                      <option value="Center">{t('edgeGuardZoneCenter')}</option>
                      <option value={edge.from}>{t('edgeGuardZoneIn', { id: edge.from })}</option>
                      <option value={edge.to}>{t('edgeGuardZoneIn', { id: edge.to })}</option>
                      {!guardZoneKnown && <option value={guardZone}>{guardZone}</option>}
                    </select>
                  </Field>

                  <Field label={t('edgeGuardMatchGroup')} tip={t('edgeGuardMatchGroupHelp')}>
                    <input
                      type="text"
                      list="edge-guard-match-groups"
                      autoComplete="off"
                      value={edge.guardMatchGroup ?? ''}
                      onChange={(e) => actions.updateEdgeField(edge.id, { guardMatchGroup: e.target.value || undefined })}
                      placeholder={t('edgeGuardMatchGroupPlaceholder')}
                    />
                    <datalist id="edge-guard-match-groups">
                      {matchGroups.map((group) => <option key={group} value={group} />)}
                    </datalist>
                  </Field>

                  <Field label={t('edgeGatePlacement')} tip={t('edgeGatePlacementHelp')}>
                    <select
                      value={gatePlacement}
                      onChange={(e) => actions.updateEdgeField(edge.id, { gatePlacement: e.target.value || undefined })}
                    >
                      <option value="">{t('edgeGatePlacementAuto')}</option>
                      <option value="Center">{t('edgeGatePlacementCenter')}</option>
                      {!gateKnown && <option value={gatePlacement}>{gatePlacement}</option>}
                    </select>
                  </Field>
                </div>
              );
            })()}
          </CollapsibleSubsection>
          )}
        </div>
      ) : (
        <div className="ui-indent" style={{ display: 'grid', gap: '8px' }}>
          <div className="control-label">{t('springBehavior')}</div>
          {(() => {
            // Shipped templates use far more than the five handy presets: some
            // springs carry no length at all (the engine then picks its own),
            // and many carry values no preset matches. The control has to be
            // able to show and keep every one of those, not round them off.
            const presets = [
              { val: 0.1, key: 'springDistSnap' },
              { val: 0.5, key: 'springDistClose' },
              { val: 1.5, key: 'springDistMedium' },
              { val: 4.0, key: 'springDistFar' },
              { val: 6.0, key: 'springDistMax' }
            ];
            const inCustomMode = customLengthFor === edge.id;
            const presetHit = edge.length === undefined
              ? undefined
              : presets.find((p) => Math.abs((edge.length as number) - p.val) < 0.01);
            const custom = inCustomMode || (edge.length !== undefined && !presetHit);
            const unset = !custom && edge.length === undefined;
            const matched = custom ? undefined : presetHit;
            return (
              <div style={{ display: 'grid', gap: '6px', padding: '4px 0' }}>
                <label className="ui-toggle" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="proximity-length"
                    checked={unset}
                    onChange={() => {
                      setCustomLengthFor(null);
                      actions.updateEdgeField(edge.id, { length: undefined });
                    }}
                  />
                  <span className="ui-toggle-text">{t('springDistUnset')}</span>
                </label>
                {presets.map((item) => (
                  <label key={item.val} className="ui-toggle" style={{ margin: 0 }}>
                    <input
                      type="radio"
                      name="proximity-length"
                      value={item.val}
                      checked={matched?.val === item.val}
                      onChange={() => {
                        setCustomLengthFor(null);
                        actions.updateEdgeField(edge.id, { length: item.val });
                      }}
                    />
                    <span className="ui-toggle-text">{t(item.key)}</span>
                  </label>
                ))}
                <label className="ui-toggle" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="proximity-length"
                    checked={custom}
                    onChange={() => {
                      setCustomLengthFor(edge.id);
                      if (edge.length === undefined) actions.updateEdgeField(edge.id, { length: 1 });
                    }}
                  />
                  <span className="ui-toggle-text">{t('springDistCustom')}</span>
                </label>
                {custom && (
                  <div style={{ paddingLeft: '22px' }}>
                    <NumberField
                      min={0}
                      step={0.1}
                      value={edge.length ?? 0}
                      title={t('springDistCustom')}
                      onCommit={(v) => actions.updateEdgeField(edge.id, { length: v })}
                      style={{ width: '90px' }}
                    />
                  </div>
                )}
              </div>
            );
          })()}
          <p className="ui-field-hint">{t('springHelp')}</p>
          <p className="ui-field-hint" style={{ color: 'var(--accent-2)' }}>{t('springWarning')}</p>
        </div>
      )}
    </div>
  );
};
