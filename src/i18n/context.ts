import { createContext, useContext } from 'react';

export type TranslationFunction = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface TranslationContextValue {
  language: 'ru' | 'en';
  t: TranslationFunction;
}

export const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

export function useTranslation(): TranslationContextValue {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
