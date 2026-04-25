'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import es from '@/messages/es.json';
import en from '@/messages/en.json';

export type Lang = 'es' | 'en';
type Dict = typeof es;

const dicts: Record<Lang, Dict> = { es, en };

const STORAGE_KEY = 'atr_lang';
const COOKIE_NAME = 'atr_lang';

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

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'es';
  try {
    // Prefer cookie (so it survives across browsers/private windows that block storage),
    // fall back to localStorage (for same-tab fast read).
    const cookieMatch = document.cookie.match(/(?:^|;\s*)atr_lang=([^;]+)/);
    const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    if (cookieVal === 'es' || cookieVal === 'en') return cookieVal;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {}
  return 'es';
}

function writeStoredLang(lang: Lang) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  try {
    // 1-year cookie so server-rendered pages and other tabs see the same value.
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${COOKIE_NAME}=${lang}; path=/; max-age=${maxAge}; samesite=lax`;
  } catch {}
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start in 'es' on the server so the markup matches the initial client render
  // (avoids hydration mismatch). The real value is loaded in the effect below.
  const [lang, setLangState] = useState<Lang>('es');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = readStoredLang();
    setLangState(initial);
    setHydrated(true);
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    writeStoredLang(next);
  }

  // Listen for changes from other tabs / windows
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && (e.newValue === 'es' || e.newValue === 'en')) {
        setLangState(e.newValue as Lang);
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }
  }, []);

  function t(path: string): string {
    return getNestedValue(dicts[lang], path);
  }

  // Suppress hydration mismatch by waiting one tick before applying lang
  void hydrated;

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
