import type { StoreContext } from '../context';
import type { EditorActions } from '../types';

export function createHistoryActions(ctx: StoreContext): Pick<EditorActions, 'undo' | 'redo'> {
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
            selected: null,
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
            selected: null,
            history: {
              past: [...past, current],
              future: newFuture
            }
          };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
