'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import es from '@/messages/es.json';
import en from '@/messages/en.json';

export type Lang = 'es' | 'en';
type Dict = typeof es;

const dicts: Record<Lang, Dict> = { es, en };

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (path: string) => string;
  dict: Dict;
}

const LanguageContext = createContext<LangCtx>({
  lang: 'es',
  setLang: () => {},
  t: (k) => k,
  dict: es,
});

function getNestedValue(obj: any, path: string): string {
  const parts = path.split('.');
  let val: any = obj;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) return path;
  }
  return typeof val === 'string' ? val : path;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('es');

  function t(path: string): string {
    return getNestedValue(dicts[lang], path);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dict: dicts[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

/** Returns the translation function for a specific language (used for PDF generation) */
export function getTranslator(lang: Lang) {
  return (path: string) => getNestedValue(dicts[lang], path);
}
