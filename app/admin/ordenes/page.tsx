'use client';

import { useCallback, useEffect, useState } from 'react';
import { BackButton } from '@/components/BackButton';
import { SuperViewSelector } from '@/components/SuperViewSelector';
import { Toast } from '@/components/Toast';

type Assignment = {
  id: string;
  employee_id: string;
  approved_amount: number;
  employees: { full_name: string } | null;
};

type WorkOrder = {
  id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  manager_labor_amount: number | null;
  status: string;
  created_at: string;
  work_order_assignments: Assignment[];
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  paid: 'Pagado',
};

const STATUS_COLORS: Record<string, string> = {
  approved: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  rejected: 'border-red-400/30 bg-red-400/10 text-red-300',
  paid: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

type MeResponse = {
  authenticated: boolean;
  user?: { is_super_user?: boolean; role?: string };
};

export default function GestionOrdenesPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('approved');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json: MeResponse) => {
        if (json.authenticated && (json.user?.is_super_user || json.user?.role === 'owner')) {
          setCanDelete(true);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadOrders = useCallback((status: string) => {
    setLoading(true);
    fetch(`/api/trabajos?status=${status}`)
      .then((r) => r.json())
      .then((json: { work_orders?: WorkOrder[]; error?: string }) => {
        if (!json.work_orders) throw new Error(json.error ?? 'Error al cargar órdenes');
        setOrders(json.work_orders);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Error al cargar';
        setToast({ message: msg, type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOrders(filterStatus);
  }, [loadOrders, filterStatus]);

  async function handleDelete(orderId: string) {
    if (confirmDeleteId !== orderId) {
      setConfirmDeleteId(orderId);
      return;
    }

    setDeletingId(orderId);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/trabajos/${orderId}`, { method: 'DELETE' });
      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo eliminar la orden.', type: 'error' });
        return;
      }

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setToast({ message: '🗑 Orden eliminada correctamente.', type: 'success' });
    } catch {
      setToast({ message: 'Error de conexión al eliminar.', type: 'error' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Panel Super-Usuario</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Gestión de Órdenes</h1>
          </div>
          <SuperViewSelector />
        </div>

        {/* Info banner */}
        <div className="rounded-2xl border border-red-400/20 bg-red-950/20 px-5 py-3 text-sm text-red-200/80">
          ⚠️ Esta pantalla permite eliminar órdenes de trabajo. Las eliminaciones son <strong className="text-red-300">irreversibles</strong>. Solo úsala si el cliente lo solicita expresamente.
        </div>

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
          <span className="text-sm text-slate-400">Filtrar por estado:</span>
          {['approved', 'pending', 'rejected', 'paid'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition ${
                filterStatus === s
                  ? 'bg-amber-400 text-slate-950'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {STATUS_LABELS[s] ?? s}
            </button>
          ))}
          <span className="ml-auto text-sm text-slate-500">{orders.length} resultado{orders.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-10 text-center text-slate-400">
            Cargando órdenes…
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-10 text-center space-y-2">
            <p className="text-2xl">📋</p>
            <p className="text-slate-300 font-semibold">No hay órdenes con estado "{STATUS_LABELS[filterStatus] ?? filterStatus}".</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 shadow-2xl backdrop-blur">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Compañía / Unidad</th>
                  <th className="px-4 py-3">Mecánico(s)</th>
                  <th className="px-4 py-3">Labor</th>
                  <th className="px-4 py-3">Estado</th>
                  {canDelete && <th className="px-4 py-3">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const mechanics = order.work_order_assignments
                    .map((a) => a.employees?.full_name ?? '—')
                    .join(', ');
                  const isBusy = deletingId === order.id;
                  const isConfirming = confirmDeleteId === order.id;

                  return (
                    <tr key={order.id} className="border-b border-white/5 text-slate-200 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-slate-300">{order.work_date}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{order.company}</p>
                        <p className="text-xs text-slate-400">{order.unit}</p>
                        {order.invoice_number && (
                          <p className="text-xs text-slate-500">#{order.invoice_number}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{mechanics || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-white">
                        {money.format(Number(order.manager_labor_amount ?? order.labor_amount))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${STATUS_COLORS[order.status] ?? 'border-white/10 bg-white/5 text-slate-300'}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                      {canDelete && (
                        <td className="px-4 py-3">
                          {isConfirming ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleDelete(order.id)}
                                disabled={isBusy}
                                className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-red-400 disabled:opacity-50"
                              >
                                {isBusy ? 'Eliminando…' : '¿Confirmar?'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleDelete(order.id)}
                              disabled={isBusy}
                              className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
                            >
                              🗑 Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
