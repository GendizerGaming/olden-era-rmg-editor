import type { StoreContext } from '../context';
import type { EditorActions, EditorStoreState } from '../types';
import { captureHistory, pushHistory } from '../zones';
import { normalizeSettings } from '../normalizers';

export function createSettingsActions(ctx: StoreContext): Pick<EditorActions, 'updateSettings'> {
  const { set, saveToStorage } = ctx;
  return {
      updateSettings: (updater) => {
        set((state) => {
          const newSettings = typeof updater === 'function' ? { ...state.settings, ...updater(state.settings) } : { ...state.settings, ...updater };
          const normalized = normalizeSettings(newSettings);
          
          // Re-sync orientation anchor
          const hasAnchor = state.zones.some((z) => z.id === normalized.orientationAnchor);
          if (!hasAnchor && state.zones.length) {
            normalized.orientationAnchor = state.zones.find((z) => z.type === "spawn")?.id || state.zones[0]?.id || "";
          }
          
          const changed = JSON.stringify(state.settings) !== JSON.stringify(normalized);
          const snapshot = captureHistory(state);
          
          const nextState: Partial<EditorStoreState> = {
            settings: normalized
          };
          if (changed) {
            nextState.history = pushHistory(state, snapshot);
          }
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
