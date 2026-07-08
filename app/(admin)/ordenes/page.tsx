'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';
import ReportDetailModal from '@/components/reports/ReportDetailModal';

interface Employee { id: string; full_name: string; }

interface WorkReport {
  id: string;
  external_order_number: string | null;
  truck_number: string;
  company: string;
  work_date: string;
  created_by_name: string | null;
  created_by_role: string | null;
  task_count: number;
  total_charged: number;
  total_payout: number;
}

export default function OrdenesPage() {
  const { t } = useLanguage();

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  );
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [globalView, setGlobalView] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WorkReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailReportId, setDetailReportId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'invoice'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fmt = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    // Rol de la sesión (cookie de PIN validada en el servidor).
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const j = await res.json();
          if (j?.authenticated && j.user?.role) {
            setCurrentUserRole(j.user.role);
          }
        }
      } catch {}
    })();

    // Solo mecánicos para el filtro (mismo criterio que antes:
    // role='mechanic' O payment_type='mechanic_commission').
    fetch('/api/empleados')
      .then(r => r.ok ? r.json() : { employees: [] })
      .then(j => {
        const mechanics = ((j.employees ?? []) as any[]).filter((e: any) =>
          e.role === 'mechanic' || e.payment_type === 'mechanic_commission'
        );
        setEmployees(mechanics.map((e: any) => ({ id: e.id, full_name: e.full_name })));
      })
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => { loadReports(); }, [dateFrom, dateTo, selectedMechanic, globalView]);

  async function loadReports() {
    setLoading(true);

    // Todo el listado sale de la API server-side; en vista global no se
    // envía rango de fechas (la API devuelve todo).
    const params = new URLSearchParams();
    if (!globalView) {
      params.set('start', dateFrom);
      params.set('end', dateTo);
    }
    if (selectedMechanic) params.set('mechanic_id', selectedMechanic);

    let rawReports: any[] = [];
    let tasks: any[] = [];
    let assignments: any[] = [];
    try {
      const res = await fetch(`/api/ordenes?${params.toString()}`);
      if (res.ok) {
        const j = await res.json();
        rawReports = j.reports ?? [];
        tasks = j.tasks ?? [];
        assignments = j.assignments ?? [];
      }
    } catch {}

    if (rawReports.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    const taskToReport: Record<string, string> = {};
    for (const t of tasks ?? []) {
      taskToReport[t.id] = t.report_id;
    }

    const tasksByReport: Record<string, Set<string>> = {};
    const payoutByReport: Record<string, number> = {};
    const reportsWithMechanic = new Set<string>();

    for (const a of assignments ?? []) {
      const rid = taskToReport[a.task_id];
      if (!rid) continue;
      if (!tasksByReport[rid]) tasksByReport[rid] = new Set();
      tasksByReport[rid].add(a.task_id);
      payoutByReport[rid] = (payoutByReport[rid] ?? 0) + Number(a.mechanic_payout);
      if (selectedMechanic) reportsWithMechanic.add(rid);
    }

    const chargedByReport: Record<string, number> = {};
    for (const t of tasks ?? []) {
      chargedByReport[t.report_id] = (chargedByReport[t.report_id] ?? 0) + Number(t.amount_charged_to_client);
    }

    const result: WorkReport[] = rawReports
      .filter((r: any) => !selectedMechanic || reportsWithMechanic.has(r.id))
      .map((r: any) => ({
        id: r.id,
        external_order_number: r.external_order_number,
        truck_number: r.truck_number,
        company: r.company,
        work_date: r.work_date,
        created_by_name: r.created_by_name ?? null,
        created_by_role: r.created_by_role ?? null,
        task_count: tasksByReport[r.id]?.size ?? 0,
        total_charged: chargedByReport[r.id] ?? 0,
        total_payout: payoutByReport[r.id] ?? 0,
      }));

    setReports(result);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const rid = deleteTarget.id;
    try {
      // El borrado en cascada (earned_entries → asignaciones → tareas →
      // reporte) ahora vive en el servidor.
      const res = await fetch(`/api/ordenes/${rid}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? 'Error al eliminar');
      }

      setReports(prev => prev.filter(r => r.id !== rid));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete error:', err);
    }
    setDeleting(false);
  }

  // Client-side text search filter
  const filtered = reports.filter(r => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (
      r.truck_number?.toLowerCase().includes(q) ||
      r.company?.toLowerCase().includes(q) ||
      (r.external_order_number ?? '').toLowerCase().includes(q)
    );
  });

  function toggleSort(col: 'date' | 'invoice') {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'date' ? 'desc' : 'asc'); }
  }

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'date') {
      cmp = a.work_date < b.work_date ? -1 : a.work_date > b.work_date ? 1 : 0;
    } else {
      const na = Number(a.external_order_number ?? '') || 0;
      const nb = Number(b.external_order_number ?? '') || 0;
      // Nulls always last regardless of direction
      if (!a.external_order_number && !b.external_order_number) cmp = 0;
      else if (!a.external_order_number) cmp = 1;
      else if (!b.external_order_number) cmp = -1;
      else cmp = na - nb;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalCharged = filtered.reduce((s, r) => s + r.total_charged, 0);
  const totalPayout  = filtered.reduce((s, r) => s + r.total_payout, 0);
  const totalProfit  = totalCharged - totalPayout;

  // Role-based permissions
  // - View full detail (creator + audit): super admin/user, owner, admin
  // - Edit + delete: super admin/user and owner ONLY
  // Accept both 'super_user' (PIN flow) and 'super_admin' (Supabase auth flow).
  const role = (currentUserRole || '').toLowerCase();
  const isSuper       = role === 'super_user' || role === 'super_admin';
  const canManage     = isSuper || role === 'owner' || role === 'admin';
  const canDelete     = canManage;
  const canEdit       = canManage;
  const canViewDetail = canManage;
  const showActionsCol = canDelete || canEdit || canViewDetail;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">
            {t('workReports.title')}
          </h1>
          <p className="text-slate-400 mt-1">{filtered.length} {t('workReports.records')}</p>
        </div>
        <Link
          href="/ordenes/nueva"
          data-tour="ord-add"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('workReports.newButton')}
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('workReports.filters.dateFrom')}</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            disabled={globalView}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition disabled:opacity-40" />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('workReports.filters.dateTo')}</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            disabled={globalView}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition disabled:opacity-40" />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('workReports.filters.mechanic')}</label>
          <select value={selectedMechanic} onChange={e => setSelectedMechanic(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition">
            <option value="">{t('workReports.filters.allMechanics')}</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setGlobalView(v => !v)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
            globalView
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('workReports.filters.globalView')}
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-5" data-tour="ord-search">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder={t('workReports.filters.search')}
            className="w-full bg-slate-900/60 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-amber-400/30 transition"
          />
          {searchText && (
            <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{t('workReports.table.totalCharged')}</p>
            <p className="display-font text-xl font-bold text-slate-100">{fmt(totalCharged)}</p>
          </div>
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{t('workReports.table.totalPayout')}</p>
            <p className="display-font text-xl font-bold text-amber-400">{fmt(totalPayout)}</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{t('workReports.table.companyProfit')}</p>
            <p className="display-font text-xl font-bold text-emerald-400">{fmt(totalProfit)}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('workReports.empty')}</p>
          <Link href="/ordenes/nueva" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            {t('workReports.emptyAction')}
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 font-medium">
                  <button onClick={() => toggleSort('date')}
                    className={`flex items-center gap-1 hover:text-amber-400 transition-colors ${sortBy === 'date' ? 'text-amber-400' : 'text-slate-500'}`}>
                    {t('workReports.table.date')}
                    <span className="text-xs">{sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('workReports.table.truck')}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('workReports.table.company')}</th>
                <th className="text-left px-4 py-3 font-medium">
                  <button onClick={() => toggleSort('invoice')}
                    className={`flex items-center gap-1 hover:text-amber-400 transition-colors ${sortBy === 'invoice' ? 'text-amber-400' : 'text-slate-500'}`}>
                    {t('workReports.table.orderNumber')}
                    <span className="text-xs">{sortBy === 'invoice' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                  </button>
                </th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">{t('workReports.table.tasks')}</th>
                {canViewDetail && (
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('reportDetail.createdBy')}</th>
                )}
                <th className="text-right px-4 py-3 text-slate-500 font-medium">{t('workReports.table.totalCharged')}</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">{t('workReports.table.totalPayout')}</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">{t('workReports.table.companyProfit')}</th>
                {showActionsCol && (
                  <th className="text-center px-4 py-3 text-slate-500 font-medium">{t('workReports.table.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3.5 text-slate-400">
                    {fmtDate(r.work_date)}
                  </td>
                  <td className="px-4 py-3.5 text-slate-200 font-medium">{r.truck_number}</td>
                  <td className="px-4 py-3.5 text-slate-400">{r.company}</td>
                  <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{r.external_order_number ?? '—'}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">{r.task_count}</span>
                  </td>
                  {canViewDetail && (
                    <td className="px-4 py-3.5 text-slate-300 text-xs">
                      {r.created_by_name ? (
                        <div>
                          <p className="text-slate-200 font-medium">{r.created_by_name}</p>
                          {r.created_by_role && (
                            <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                              {r.created_by_role.replace('_', ' ')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3.5 text-right text-slate-300 font-medium">{fmt(r.total_charged)}</td>
                  <td className="px-4 py-3.5 text-right text-amber-400">{fmt(r.total_payout)}</td>
                  <td className="px-4 py-3.5 text-right text-emerald-400 font-semibold">
                    {fmt(r.total_charged - r.total_payout)}
                  </td>
                  {showActionsCol && (
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canViewDetail && (
                          <button
                            onClick={() => setDetailReportId(r.id)}
                            title={t('workReports.view')}
                            className="text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg p-1.5 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                        {canEdit && (
                          <Link
                            href={`/ordenes/${r.id}/editar`}
                            title={t('workReports.edit')}
                            className="text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg p-1.5 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(r)}
                            title={t('workReports.delete')}
                            className="text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg p-1.5 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Report Detail Modal */}
      {detailReportId && (
        <ReportDetailModal
          reportId={detailReportId}
          onClose={() => setDetailReportId(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="w-12 h-12 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide text-center mb-2">
              {t('workReports.deleteConfirmTitle')}
            </h2>
            <div className="bg-slate-800/60 rounded-xl p-3 mb-4 text-center">
              <p className="text-slate-300 text-sm font-medium">{deleteTarget.company} — {deleteTarget.truck_number}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {new Date(deleteTarget.work_date + 'T12:00:00').toLocaleDateString('es-MX')}
                {deleteTarget.external_order_number ? ` · ${deleteTarget.external_order_number}` : ''}
              </p>
            </div>
            <p className="text-slate-400 text-sm text-center mb-6">{t('workReports.deleteConfirmMsg')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition"
              >
                {t('workReports.deleteCancelBtn')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 py-2.5 rounded-lg text-sm font-medium transition"
              >
                {deleting ? t('workReports.deleting') : t('workReports.deleteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
