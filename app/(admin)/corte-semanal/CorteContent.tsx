'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface Mechanic {
  id: string;
  name: string;
  total: number;
  orderCount: number;
}

interface Props {
  weekStart: string;
  weekEnd: string;
  prevStart: string;
  prevEnd: string;
  nextStart: string;
  nextEnd: string;
  mechanics: Mechanic[];
  totalGeneral: number;
}

export default function CorteContent({
  weekStart, weekEnd, prevStart, prevEnd, nextStart, nextEnd,
  mechanics, totalGeneral,
}: Props) {
  const { t, lang } = useLanguage();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  const formatFecha = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const fmtMoney = (n: number) =>
    '$' + n.toLocaleString(locale, { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('weeklyCut.title')}</h1>
        <p className="text-slate-400 mt-1">{t('weeklyCut.subtitle')}</p>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <a
          href={`/corte-semanal?semana_inicio=${prevStart}&semana_fin=${prevEnd}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('weeklyCut.prevWeek')}
        </a>

        <div className="flex-1 bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3 text-center min-w-64">
          <p className="text-slate-500 text-xs mb-0.5">{t('weeklyCut.cutWeek')}</p>
          <p className="display-font text-amber-400 font-bold text-lg tracking-wide">
            {formatFecha(weekStart)} — {formatFecha(weekEnd)}
          </p>
        </div>

        <form method="GET" className="flex items-center gap-2">
          <input type="date" name="semana_inicio" defaultValue={weekStart}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50" />
          <span className="text-slate-600 text-xs">—</span>
          <input type="date" name="semana_fin" defaultValue={weekEnd}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50" />
          <button type="submit" className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-xs px-3 py-2 rounded-lg transition">
            {t('weeklyCut.go')}
          </button>
        </form>

        <a
          href={`/corte-semanal?semana_inicio=${nextStart}&semana_fin=${nextEnd}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm"
        >
          {t('weeklyCut.nextWeek')}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      <div className="flex justify-end mb-4">
        <Link
          href={`/reportes?tipo=semanal&desde=${weekStart}&hasta=${weekEnd}`}
          className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-400/30 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          {t('weeklyCut.generatePdf')}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('weeklyCut.stats.totalToPay')}</p>
          <p className="display-font text-2xl font-bold text-amber-400">{fmtMoney(totalGeneral)}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('weeklyCut.stats.mechanicsToPay')}</p>
          <p className="display-font text-2xl font-bold text-slate-200">{mechanics.length}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('weeklyCut.stats.jobsDone')}</p>
          <p className="display-font text-2xl font-bold text-slate-200">
            {mechanics.reduce((s, m) => s + m.orderCount, 0)}
          </p>
        </div>
      </div>

      {mechanics.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('weeklyCut.empty')}</p>
          <Link href="/ordenes/nueva" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            {t('weeklyCut.emptyAction')}
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 bg-white/2">
            <h2 className="display-font text-slate-400 font-semibold tracking-wide text-sm">{t('weeklyCut.checksTable')}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('weeklyCut.table.num')}</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('weeklyCut.table.mechanic')}</th>
                <th className="text-center px-5 py-3 text-slate-500 font-medium">{t('weeklyCut.table.jobs')}</th>
                <th className="text-right px-5 py-3 text-slate-500 font-medium">{t('weeklyCut.table.totalEarned')}</th>
                <th className="text-right px-5 py-3 text-slate-500 font-medium">{t('weeklyCut.table.checkAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {mechanics.map((m, idx) => (
                <tr key={m.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-5 py-4 text-slate-600">{idx + 1}</td>
                  <td className="px-5 py-4 text-slate-200 font-semibold">{m.name}</td>
                  <td className="px-5 py-4 text-center text-slate-400">{m.orderCount}</td>
                  <td className="px-5 py-4 text-right text-slate-300">{fmtMoney(m.total)}</td>
                  <td className="px-5 py-4 text-right">
                    <span className="display-font text-lg font-bold text-emerald-400">{fmtMoney(m.total)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/2">
                <td colSpan={3} className="px-5 py-4 text-slate-400 font-medium text-sm">{t('weeklyCut.totalPayroll')}</td>
                <td className="px-5 py-4 text-right text-slate-300 font-bold"></td>
                <td className="px-5 py-4 text-right">
                  <span className="display-font text-xl font-bold text-amber-400">{fmtMoney(totalGeneral)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
