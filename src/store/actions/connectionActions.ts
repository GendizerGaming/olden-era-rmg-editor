import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import type { Edge } from '../../types/editor';
import { uniqueKey } from '../ids';
import { captureHistory, pushHistory, defaultGuardForPair, edgePairKey } from '../zones';

export function createConnectionActions(ctx: StoreContext): Pick<EditorActions, 'connectZones' | 'updateEdgeField' | 'deleteEdge'> {
  const { set, saveToStorage } = ctx;
  return {
      connectZones: (fromId, toId, connectionType = 'Direct') => {
        set((state) => {
          // Only one spring per zone pair: a second one would contradict the
          // first and can make the template ungeneratable.
          if (
            connectionType === 'Proximity' &&
            state.edges.some(
              (e) =>
                e.connectionType === 'Proximity' &&
                edgePairKey(e.from, e.to) === edgePairKey(fromId, toId)
            )
          ) {
            return {
              notifications: [
                ...state.notifications,
                { id: uniqueKey(), key: 'notificationSpringExists', type: 'error' as const }
              ]
            };
          }

          const snapshot = captureHistory(state);

          let edgeId = `${fromId}__${toId}`;
          let suffix = 1;
          while (state.edges.some(e => e.id === edgeId)) {
            edgeId = `${fromId}__${toId}_${suffix}`;
            suffix++;
          }

          const guardValue = defaultGuardForPair(state.zones, fromId, toId);
          const newEdge: Edge = {
            id: edgeId,
            from: fromId,
            to: toId,
            guardValue: connectionType === 'Proximity' ? 0 : guardValue,
            road: true,
            connectionType,
            length: 0.1,
            simTurnSquad: connectionType === 'Proximity' ? undefined : true
          };

          const nextState = {
            edges: [...state.edges, newEdge],
            selected: { type: 'edge' as const, id: edgeId },
            mode: 'select' as const,
            connectStart: null,
            notifications: [
              ...state.notifications,
              {
                id: uniqueKey(),
                key: connectionType === 'Proximity' ? 'notificationSpringAdded' : 'notificationEdgeAdded',
                type: 'success' as const
              }
            ],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      updateEdgeField: (edgeId, updates) => {
        set((state) => {
          const edge = state.edges.find(e => e.id === edgeId);
          if (!edge) return {};
          // Enforce the one-spring-per-pair rule on type changes as well.
          if (
            updates.connectionType === 'Proximity' &&
            edge.connectionType !== 'Proximity' &&
            state.edges.some(
              (e) =>
                e.id !== edgeId &&
                e.connectionType === 'Proximity' &&
                edgePairKey(e.from, e.to) === edgePairKey(edge.from, edge.to)
            )
          ) {
            return {
              notifications: [
                ...state.notifications,
                { id: uniqueKey(), key: 'notificationSpringExists', type: 'error' as const }
              ]
            };
          }

          const snapshot = captureHistory(state);
          const nextEdges = state.edges.map(e => e.id === edgeId ? { ...e, ...updates } : e);
          const nextState = {
            edges: nextEdges,
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      deleteEdge: (edgeId) => {
        set((state) => {
          if (!state.edges.some(e => e.id === edgeId)) return {};
          const snapshot = captureHistory(state);
          const nextEdges = state.edges.filter(e => e.id !== edgeId);
          const nextSelected =
            state.selected?.type === 'edge' && state.selected.id === edgeId
              ? null
              : state.selected;
          const nextState = {
            edges: nextEdges,
            selected: nextSelected,
            notifications: [
              ...state.notifications,
              { id: uniqueKey(), key: 'notificationEdgeDeleted', type: 'info' as const }
            ],
            history: pushHistory(state, snapshot)
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
