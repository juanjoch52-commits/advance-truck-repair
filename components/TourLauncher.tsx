'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { startTour, tourKeyForPath, hasTour, type Lang } from '@/lib/tours';

const SEEN_PREFIX = 'atr_tour_v1_';
const seen = (k: string) => { try { return localStorage.getItem(SEEN_PREFIX + k) === '1'; } catch { return true; } };
const markSeen = (k: string) => { try { localStorage.setItem(SEEN_PREFIX + k, '1'); } catch {} };

export default function TourLauncher() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const langRef = useRef<Lang>(lang as Lang);
  langRef.current = lang as Lang;

  // Tour de la página actual (o bienvenida si la página no tiene uno propio).
  const pageKey = tourKeyForPath(pathname);

  // Arranque automático: bienvenida una sola vez; luego, el tour de cada página
  // la primera vez que se visita. Se espera a que la página monte.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!seen('welcome')) { markSeen('welcome'); startTour('welcome', langRef.current); return; }
      if (pageKey && !seen(pageKey)) { markSeen(pageKey); startTour(pageKey, langRef.current); }
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Tours lanzados desde dentro de un modal (formularios): los componentes
  // disparan window.dispatchEvent(new CustomEvent('atr:start-tour',{detail:{key}})).
  useEffect(() => {
    const onStart = (e: Event) => {
      const key = (e as CustomEvent).detail?.key;
      if (typeof key === 'string' && hasTour(key)) startTour(key, langRef.current);
    };
    window.addEventListener('atr:start-tour', onStart as EventListener);
    return () => window.removeEventListener('atr:start-tour', onStart as EventListener);
  }, []);

  function handleClick() {
    startTour(pageKey && hasTour(pageKey) ? pageKey : 'welcome', langRef.current);
  }

  return (
    <button
      type="button"
      data-tour="tour-help-btn"
      onClick={handleClick}
      title={lang === 'es' ? 'Tutorial de esta página' : 'Tutorial for this page'}
      aria-label={lang === 'es' ? 'Tutorial' : 'Tutorial'}
      className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center justify-center transition print:hidden"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>
  );
}
