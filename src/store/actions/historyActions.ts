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
    // These live inside settings, which the snapshot carries too, so undoing
    // their creation does take them away.
    case 'terrainProfile':
      return snapshot.settings.terrainProfiles.some((profile) => profile.name === selected.id)
        ? selected
        : null;
    case 'contentLimits':
      return snapshot.settings.contentLimitPresets.some((preset) => preset.name === selected.id)
        ? selected
        : null;
    case 'contentPool':
      return snapshot.settings.contentPoolPresets.some((preset) => preset.name === selected.id)
        ? selected
        : null;
    case 'preset':
      return selected.id in snapshot.presets ? selected : null;
    case 'customList':
      return selected.id in snapshot.customObjectLists ? selected : null;
    // The element list is a panel mode rather than an element.
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
            edges: state.edges,
            presets: state.presets,
            customObjectLists: state.customObjectLists,
            nextZoneNumber: state.nextZoneNumber
          };
          
          const nextState = {
            settings: previous.settings,
            zones: previous.zones,
            edges: previous.edges,
            presets: previous.presets,
            customObjectLists: previous.customObjectLists,
            nextZoneNumber: previous.nextZoneNumber,
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
            edges: state.edges,
            presets: state.presets,
            customObjectLists: state.customObjectLists,
            nextZoneNumber: state.nextZoneNumber
          };
          
          const nextState = {
            settings: next.settings,
            zones: next.zones,
            edges: next.edges,
            presets: next.presets,
            customObjectLists: next.customObjectLists,
            nextZoneNumber: next.nextZoneNumber,
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
