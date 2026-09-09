import type { StoreContext } from '../context';
import type { EditorActions, EditorStoreState } from '../types';
import { historyForEdit } from '../zones';
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
          
          const touched = (Object.keys(normalized) as Array<keyof typeof normalized>)
            .filter((key) => JSON.stringify(state.settings[key]) !== JSON.stringify(normalized[key]));

          const nextState: Partial<EditorStoreState> = {
            settings: normalized
          };
          if (touched.length > 0) {
            // The updater can be a function, so the session is identified by
            // whichever settings actually moved: typing a map name is one step.
            nextState.history = historyForEdit(state, `settings::${touched.sort().join(',')}`);
          }
          saveToStorage({ ...state, ...nextState });
          return nextState;
        });
      },
  };
}
