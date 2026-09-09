import type { StoreContext } from '../context';
import type { EditorActions, HistorySnapshot } from '../types';
import { edgePairKey } from '../zones';

/**
 * The selection to keep after rolling to `snapshot`.
 *
 * Undo used to clear it outright, which emptied the inspector on every undo:
 * change a value, press undo, and the whole right panel goes blank with every
 * section you had open. Only selections whose element the rollback removed
 * need dropping — everything else stays where the user left it.
 */
function selectionAfterRollback<T extends { type: string; id: string } | null>(
  selected: T,
  snapshot: HistorySnapshot
): T | null {
  if (!selected) return selected;
  switch (selected.type) {
    case 'zone':
      return snapshot.zones.some((zone) => zone.id === selected.id) ? selected : null;
    case 'edge':
      return snapshot.edges.some((edge) => edge.id === selected.id) ? selected : null;
    case 'edgePair':
      return snapshot.edges.some((edge) => edgePairKey(edge.from, edge.to) === selected.id)
        ? selected
        : null;
    // Presets, terrain profiles, pools and the element list are not part of the
    // snapshot, so a rollback cannot invalidate them.
    default:
      return selected;
  }
}

export function createHistoryActions(ctx: StoreContext): Pick<EditorActions, 'undo' | 'redo' | 'sealHistory'> {
  const { set, saveToStorage } = ctx;
  return {
      undo: () => {
        set((state) => {
          const { past, future } = state.history;
          if (past.length === 0) return {};
          
          const previous = past[past.length - 1];
          const newPast = past.slice(0, -1);
          const current = {
            settings: state.settings,
            zones: state.zones,
            edges: state.edges
          };
          
          const nextState = {
            settings: previous.settings,
            zones: previous.zones,
            edges: previous.edges,
            selected: selectionAfterRollback(state.selected, previous),
            history: {
              past: newPast,
              future: [current, ...future]
            }
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      redo: () => {
        set((state) => {
          const { past, future } = state.history;
          if (future.length === 0) return {};
          
          const next = future[0];
          const newFuture = future.slice(1);
          const current = {
            settings: state.settings,
            zones: state.zones,
            edges: state.edges
          };
          
          const nextState = {
            settings: next.settings,
            zones: next.zones,
            edges: next.edges,
            selected: selectionAfterRollback(state.selected, next),
            history: {
              past: [...past, current],
              future: newFuture
            }
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
      sealHistory: () => {
        set((state) => (
          state.history.editKey === undefined
            ? {}
            : { history: { ...state.history, editKey: undefined } }
        ));
      },
  };
}
