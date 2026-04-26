'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';

interface Entry {
  id: string;
  amount: number;
  work_date: string;
  truck_number: string | null;
  description: string | null;
  company: string | null;
}

interface EmployeeGroup {
  name: string;
  total: number;
  entries: Entry[];
}

interface Props {
  desde: string;
  hasta: string;
  totalGeneral: number;
  totalRecords: number;
  groups: EmployeeGroup[];
}

export default function NominaContent({ desde, hasta, totalGeneral, totalRecords, groups }: Props) {
  const { t, lang } = useLanguage();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  const fmtMoney = (n: number) =>
    '$' + n.toLocaleString(locale, { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('payroll.title')}</h1>
        <p className="text-slate-400 mt-1">{t('payroll.subtitle')}</p>
      </div>

      <form method="GET" className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('payroll.filters.from')}</label>
          <input type="date" name="desde" defaultValue={desde}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition" />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('payroll.filters.to')}</label>
          <input type="date" name="hasta" defaultValue={hasta}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition" />
        </div>
        <button type="submit" className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-sm px-4 py-2 rounded-lg transition">
          {t('payroll.filters.filter')}
        </button>
        <a href="/nomina" className="text-slate-500 hover:text-slate-300 text-sm py-2">{t('payroll.filters.clear')}</a>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('payroll.stats.totalEarned')}</p>
          <p className="display-font text-2xl font-bold text-amber-400">{fmtMoney(totalGeneral)}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('payroll.stats.records')}</p>
          <p className="display-font text-2xl font-bold text-slate-200">{totalRecords}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('payroll.stats.mechanicsWithPay')}</p>
          <p className="display-font text-2xl font-bold text-slate-200">{groups.length}</p>
        </div>
      </div>

      {totalRecords === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('payroll.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ name, total, entries }) => (
            <div key={name} className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/2">
                <span className="display-font text-slate-200 font-semibold tracking-wide">{name}</span>
                <span className="display-font text-emerald-400 font-bold text-lg">{fmtMoney(total)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">{t('payroll.table.date')}</th>
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">{t('payroll.table.truck')}</th>
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">{t('payroll.table.company')}</th>
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">{t('payroll.table.task')}</th>
                    <th className="text-right px-5 py-2 text-slate-600 font-normal">{t('payroll.table.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-2.5 text-slate-500">
                        {fmtDate(e.work_date)}
                      </td>
                      <td className="px-5 py-2.5 text-slate-300">{e.truck_number ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-400">{e.company ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-400 italic text-xs">{e.description ?? '—'}</td>
                      <td className="px-5 py-2.5 text-right text-emerald-400 font-medium">{fmtMoney(Number(e.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
