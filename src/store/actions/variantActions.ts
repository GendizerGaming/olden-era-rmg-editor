import type { StoreContext } from '../context';
import type { EditorActions } from '../types';
import { activeSnapshot, applyVariantSettings, createVariantId } from '../variants';

export function createVariantActions(
  ctx: StoreContext
): Pick<EditorActions, 'setActiveVariant' | 'addVariant' | 'duplicateVariant' | 'deleteVariant'> {
  const { set, saveToStorage } = ctx;
  return {
    setActiveVariant: (id) => {
      set((state) => {
        if (id === state.activeVariantId) return {};
        const target = state.variantSnapshots[id];
        if (!target || !state.variants.some((variant) => variant.id === id)) {
          return {};
        }
        const nextSnapshots = { ...state.variantSnapshots };
        delete nextSnapshots[id];
        nextSnapshots[state.activeVariantId] = activeSnapshot(state);
        const nextState = {
          zones: target.zones,
          edges: target.edges,
          settings: applyVariantSettings(state.settings, target),
          activeVariantId: id,
          variantSnapshots: nextSnapshots,
          selected: null,
          connectStart: null,
          mode: 'select' as const,
          history: { past: [], future: [] }
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },

    addVariant: () => {
      set((state) => {
        const newId = createVariantId();
        const nextSnapshots = {
          ...state.variantSnapshots,
          [state.activeVariantId]: activeSnapshot(state)
        };
        const nextState = {
          zones: [],
          edges: [],
          // A fresh variant starts with default orientation and border,
          // matching the defaults of a brand-new map.
          settings: applyVariantSettings(state.settings, {
            zones: [],
            edges: [],
            fixedOrientation: false,
            orientationAnchor: '',
            preserveLayout: false,
            originalOrientation: undefined,
            borderWaterWidth: 0,
            borderCornerRadius: 0,
            originalBorder: undefined
          }),
          variants: [...state.variants, { id: newId }],
          activeVariantId: newId,
          variantSnapshots: nextSnapshots,
          selected: null,
          connectStart: null,
          mode: 'select' as const,
          history: { past: [], future: [] }
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },

    duplicateVariant: (id) => {
      set((state) => {
        const source =
          id === state.activeVariantId
            ? activeSnapshot(state)
            : state.variantSnapshots[id];
        if (!source) return {};
        const clone = structuredClone(source);
        const newId = createVariantId();
        const nextSnapshots = {
          ...state.variantSnapshots,
          [state.activeVariantId]: activeSnapshot(state)
        };
        const nextState = {
          zones: clone.zones,
          edges: clone.edges,
          settings: applyVariantSettings(state.settings, clone),
          variants: [...state.variants, { id: newId }],
          activeVariantId: newId,
          variantSnapshots: nextSnapshots,
          selected: null,
          connectStart: null,
          mode: 'select' as const,
          history: { past: [], future: [] }
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    },

    deleteVariant: (id) => {
      set((state) => {
        if (state.variants.length <= 1) return {};
        const index = state.variants.findIndex((variant) => variant.id === id);
        if (index < 0) return {};
        const nextVariants = state.variants.filter((variant) => variant.id !== id);
        const nextSnapshots = { ...state.variantSnapshots };
        delete nextSnapshots[id];
        if (id !== state.activeVariantId) {
          const nextState = { variants: nextVariants, variantSnapshots: nextSnapshots };
          saveToStorage({ ...state, ...nextState });
          return nextState;
        }
        const fallback = nextVariants[Math.min(index, nextVariants.length - 1)];
        const target = nextSnapshots[fallback.id];
        if (!target) return {};
        const finalSnapshots = { ...nextSnapshots };
        delete finalSnapshots[fallback.id];
        const nextState = {
          zones: target.zones,
          edges: target.edges,
          settings: applyVariantSettings(state.settings, target),
          activeVariantId: fallback.id,
          variants: nextVariants,
          variantSnapshots: finalSnapshots,
          selected: null,
          connectStart: null,
          mode: 'select' as const,
          history: { past: [], future: [] }
        };
        saveToStorage({ ...state, ...nextState });
        return nextState;
      });
    }
  };
}
