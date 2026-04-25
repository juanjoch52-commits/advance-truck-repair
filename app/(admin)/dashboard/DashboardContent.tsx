'use client';

import { useLanguage } from '@/contexts/LanguageContext';

interface RecentOrder {
  id: string;
  externalOrderNumber: string;
  truckNumber: string;
  company: string;
  workDate: string;
}

interface Props {
  totalOrders: number;
  totalEmployees: number;
  weeklyEarned: number;
  weeklyAdminEarned: number;
  start: string;
  end: string;
  recentOrders: RecentOrder[];
}

export default function DashboardContent({
  totalOrders,
  totalEmployees,
  weeklyEarned,
  weeklyAdminEarned,
  start,
  end,
  recentOrders,
}: Props) {
  const { t, lang } = useLanguage();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  const totalWeeklyPayroll = weeklyEarned + weeklyAdminEarned;
  const fmtMoney = (n: number) => '$' + n.toLocaleString(locale, { minimumFractionDigits: 2 });

  const stats = [
    {
      label: t('dashboard.stats.totalOrders'),
      value: totalOrders,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10 border-sky-500/20',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      label: t('dashboard.stats.activeMechanics'),
      value: totalEmployees,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: t('dashboard.stats.weeklyEarned'),
      value: `$${weeklyEarned.toLocaleString(locale, { minimumFractionDigits: 2 })}`,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">
          {t('dashboard.title')}
        </h1>
        <p className="text-slate-400 mt-1">
          {t('dashboard.weekRange')}: {new Date(start + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short' })} — {new Date(end + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 ${s.bg}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`${s.color}`}>{s.icon}</span>
            </div>
            <p className={`display-font text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-slate-400 text-sm mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <a
          href="/ordenes/nueva"
          className="group bg-amber-500/10 border border-amber-500/20 hover:border-amber-400/40 rounded-xl p-5 flex items-center gap-4 transition-all"
        >
          <div className="w-12 h-12 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400 group-hover:bg-amber-500/30 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="display-font text-amber-400 font-bold tracking-wide">{t('dashboard.shortcuts.newOrder')}</p>
            <p className="text-slate-400 text-sm">{t('dashboard.shortcuts.newOrderDesc')}</p>
          </div>
        </a>

        <a
          href="/corte-semanal"
          className="group bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-400/40 rounded-xl p-5 flex items-center gap-4 transition-all"
        >
          <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/30 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="display-font text-emerald-400 font-bold tracking-wide">{t('dashboard.shortcuts.weeklyCut')}</p>
            <p className="text-slate-400 text-sm">{t('dashboard.shortcuts.weeklyCutDesc')}</p>
          </div>
        </a>
      </div>

      {/* Resumen de nóminas de la semana */}
      <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="display-font text-slate-300 font-semibold tracking-wide">
            {t('dashboard.payrollSummary')}
          </h2>
          <div className="flex items-center gap-3">
            <a href="/corte-semanal"
              className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-400/30 px-3 py-1.5 rounded-lg transition">
              {t('dashboard.shortcuts.weeklyCut')}
            </a>
            <a href="/nomina-admin"
              className="text-xs text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-400/30 px-3 py-1.5 rounded-lg transition">
              {t('nav.adminPayroll')}
            </a>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mecánicos */}
          <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-slate-400 text-xs">{t('dashboard.payroll.mechanics')}</p>
            </div>
            <p className="display-font text-2xl font-bold text-amber-400">{fmtMoney(weeklyEarned)}</p>
          </div>

          {/* Administración */}
          <div className="bg-violet-500/8 border border-violet-500/15 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-slate-400 text-xs">{t('dashboard.payroll.admin')}</p>
            </div>
            <p className="display-font text-2xl font-bold text-violet-400">{fmtMoney(weeklyAdminEarned)}</p>
          </div>

          {/* Total general */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-400 text-xs">{t('dashboard.payroll.total')}</p>
            </div>
            <p className="display-font text-2xl font-bold text-emerald-400">{fmtMoney(totalWeeklyPayroll)}</p>
          </div>
        </div>
      </div>

      {/* Recent reports */}
      {recentOrders.length > 0 && (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="display-font text-slate-300 font-semibold tracking-wide">
              {t('dashboard.recentActivity')}
            </h2>
            <a href="/ordenes" className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-400/30 px-3 py-1.5 rounded-lg transition">
              {t('nav.reports')} →
            </a>
          </div>
          <div className="space-y-1">
            {recentOrders.map((o) => (
              <a
                key={o.id}
                href={`/ordenes/${o.id}`}
                className="flex items-center justify-between py-2.5 px-3 border-b border-white/5 last:border-0 gap-3 hover:bg-white/3 rounded-lg transition-colors group"
              >
                {/* Orden # o camión */}
                <div className="flex items-center gap-2 shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-amber-400 text-xs font-mono font-semibold">
                    {o.externalOrderNumber ? `#${o.externalOrderNumber}` : o.truckNumber}
                  </span>
                </div>

                {/* Empresa */}
                <span className="text-slate-200 text-sm flex-1 truncate group-hover:text-white transition-colors">
                  {o.company}
                </span>

                {/* Camión si hay orden externa */}
                {o.externalOrderNumber && (
                  <span className="text-slate-500 text-xs shrink-0 hidden sm:block">
                    {o.truckNumber}
                  </span>
                )}

                {/* Fecha de trabajo */}
                <span className="text-slate-500 text-xs shrink-0">
                  {new Date(o.workDate + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short' })}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
