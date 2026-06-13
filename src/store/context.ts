import type { StoreApi } from 'zustand';
import type { EditorStoreState } from './types';

export interface StoreContext {
  set: StoreApi<EditorStoreState>['setState'];
  get: StoreApi<EditorStoreState>['getState'];
  saveToStorage: (state: Partial<EditorStoreState>) => void;
}
