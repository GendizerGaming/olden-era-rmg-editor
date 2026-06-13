import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import { uniqueKey } from '../ids';

// Sections hidden in the simple mode cannot stay selected when switching.
const EXPERT_ONLY_SELECTION_TYPES = new Set(['terrainProfile', 'contentLimits', 'contentPool', 'customList']);

export function createUiActions(ctx: StoreContext): Pick<EditorActions, 'setSelected' | 'setMode' | 'setConnectStart' | 'toggleTheme' | 'setUiMode' | 'addNotification' | 'removeNotification' | 'toggleSnapToGrid'> {
  const { set } = ctx;
  return {
      setSelected: (selected) => {
        set({ selected });
      },
      setUiMode: (uiMode) => {
        set((state) => {
          try {
            localStorage.setItem('olden-era-rmg-ui-mode', uiMode);
          } catch {
            // Ignore
          }
          const selected = uiMode === 'simple' && state.selected && EXPERT_ONLY_SELECTION_TYPES.has(state.selected.type)
            ? null
            : state.selected;
          return { uiMode, selected };
        });
      },
      setMode: (mode) => {
        set({ mode, connectStart: null });
      },
      setConnectStart: (connectStart) => {
        set({ connectStart });
      },
      toggleTheme: () => {
        set((state) => {
          const newTheme = state.theme === 'dark' ? 'light' : 'dark';
          try {
            localStorage.setItem('olden-era-rmg-visual-editor-theme', newTheme);
          } catch {
            // Ignore
          }
          document.body.className = newTheme;
          return { theme: newTheme };
        });
      },
      addNotification: (key, params, type = 'info') => {
        set((state) => {
          const id = uniqueKey();
          const newNotification = { id, key, params, type };
          return { notifications: [...state.notifications, newNotification] };
        });
      },
      removeNotification: (id) => {
        set((state) => {
          return { notifications: state.notifications.filter(n => n.id !== id) };
        });
      },
      toggleSnapToGrid: () => {
        set((state) => {
          const nextSnap = !state.snapToGrid;
          try {
            localStorage.setItem('olden-era-rmg-visual-editor-snap', String(nextSnap));
          } catch {
            // Ignore
          }
          return { snapToGrid: nextSnap };
        });
      },
  };
}
