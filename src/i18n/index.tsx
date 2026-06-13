import React from 'react';
import type { ReactNode } from 'react';
import ru from './ru.json';
import en from './en.json';
import { useEditorStore } from '../store/useEditorStore';
import { TranslationContext } from './context';

const dictionaries: Record<string, Record<string, string>> = { ru, en };

export const TranslationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const language = useEditorStore((state) => state.settings.language) || 'ru';

  const t = React.useCallback((key: string, params: Record<string, string | number> = {}): string => {
    const dict = dictionaries[language] || ru;
    let text = dict[key] || dictionaries.en[key] || key;
    
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`{${name}}`, 'g'), String(value));
    }
    return text;
  }, [language]);

  return (
    <TranslationContext.Provider value={{ language, t }}>
      {children}
    </TranslationContext.Provider>
  );
};
