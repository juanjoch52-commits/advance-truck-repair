'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackButton } from '@/components/BackButton';
import { Toast } from '@/components/Toast';
import { PhotoEvidenceButton } from '@/components/PhotoEvidenceButton';

type Assignment = {
  id: string;
  employee_id: string;
  assignment_mode: 'percent' | 'manual';
  percent_share: number | null;
  manual_amount: number | null;
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
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'pending_approval';
  paperwork_path: string | null;
  part_photo_path: string | null;
  created_at: string;
  work_order_assignments: Assignment[];
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type ApproveMode = 'auto_percent' | 'manual_amount';

export default function AprobacionesPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Per-order approval state
  const [approvalMode, setApprovalMode] = useState<Record<string, ApproveMode>>({});
  const [managerLabor, setManagerLabor] = useState<Record<string, string>>({});
  const [assignmentValues, setAssignmentValues] = useState<Record<string, Record<string, string>>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Rejection reason state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState<Record<string, string>>({});

  const loadOrders = useCallback(() => {
    setLoading(true);
    fetch('/api/trabajos?status=pending')
      .then((res) => res.json())
      .then((json: { work_orders?: WorkOrder[]; error?: string }) => {
        if (!json.work_orders) throw new Error(json.error ?? 'Error al cargar órdenes');

        setOrders(json.work_orders);

        const modes: Record<string, ApproveMode> = {};
        const labor: Record<string, string> = {};
        const assignments: Record<string, Record<string, string>> = {};

        json.work_orders.forEach((o) => {
          modes[o.id] = 'auto_percent';
          labor[o.id] = String(o.manager_labor_amount ?? o.labor_amount ?? 0);
          assignments[o.id] = Object.fromEntries(
            o.work_order_assignments.map((a) => [
              a.employee_id,
              String(a.percent_share ?? a.manual_amount ?? 0),
            ]),
          );
        });

        setApprovalMode(modes);
        setManagerLabor(labor);
        setAssignmentValues(assignments);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Error al cargar aprobaciones';
        setToast({ message: msg, type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const pendingCount = useMemo(() => orders.length, [orders]);

  async function handleApprove(order: WorkOrder) {
    const mode = approvalMode[order.id] ?? 'auto_percent';
    const laborAmt = Number(managerLabor[order.id] ?? order.labor_amount);
    const valuesMap = assignmentValues[order.id] ?? {};

    const assignments = order.work_order_assignments.map((a) => ({
      employee_id: a.employee_id,
      mode: mode === 'auto_percent' ? 'percent' as const : 'manual' as const,
      value: Number(valuesMap[a.employee_id] ?? 0),
    }));

    if (mode === 'auto_percent') {
      const totalPct = assignments.reduce((s, a) => s + a.value, 0);
      if (totalPct > 100) {
        setToast({ message: 'La suma de porcentajes no puede superar 100%.', type: 'error' });
        return;
      }
    }

    setActionId(order.id);
    try {
      const res = await fetch(`/api/trabajos/${order.id}/aprobar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_mode: mode,
          manager_labor_amount: laborAmt,
          approved_by: 'manager',
          assignments,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo aprobar la orden.', type: 'error' });
        return;
      }

      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setExpandedId(null);
      setToast({ message: '✅ Trabajo aprobado correctamente.', type: 'success' });
    } catch {
      setToast({ message: 'Error de conexión al aprobar.', type: 'error' });
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(orderId: string) {
    // First click → show the reason input
    if (rejectingId !== orderId) {
      setRejectingId(orderId);
      setExpandedId(null); // close approve form if open
      return;
    }

    // Second click (confirmed) → send to API
    const reason = rejectReasonDraft[orderId]?.trim() ?? '';
    setActionId(orderId);
    try {
      const res = await fetch(`/api/trabajos/${orderId}/rechazar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: reason || undefined }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo rechazar la orden.', type: 'error' });
        return;
      }

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setRejectingId(null);
      setToast({ message: '❌ Trabajo rechazado.', type: 'success' });
    } catch {
      setToast({ message: 'Error de conexión al rechazar.', type: 'error' });
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-5xl space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Panel del Mánager</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Aprobaciones</h1>
          </div>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-400/20 border border-amber-300/30 px-4 py-1.5 text-sm font-bold text-amber-300">
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Info bar ───────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 px-5 py-3 text-sm text-amber-200/80">
          Solo los trabajos <strong className="text-amber-300">aprobados</strong> se suman a la nómina y al dashboard.
          Los trabajos pendientes no afectan ningún total hasta que los apruebes.
        </div>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-10 text-center text-slate-400">
            Cargando trabajos pendientes…
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-10 text-center space-y-2">
            <p className="text-3xl">✅</p>
            <p className="text-slate-300 font-semibold">No hay trabajos pendientes de aprobación.</p>
            <p className="text-slate-500 text-sm">Todos los trabajos registrados han sido revisados.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const mode = approvalMode[order.id] ?? 'auto_percent';
              const laborVal = managerLabor[order.id] ?? String(order.labor_amount);
              const valuesMap = assignmentValues[order.id] ?? {};
              const isExpanded = expandedId === order.id;
              const isBusy = actionId === order.id;
              const isRejectingThisOrder = rejectingId === order.id;

              return (
                <article
                  key={order.id}
                  className="rounded-[28px] border border-white/10 bg-slate-950/60 shadow-2xl backdrop-blur overflow-hidden"
                >
                  {/* Row summary */}
                  <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="display-font text-lg font-bold text-white">
                          {order.company} · {order.unit}
                        </h2>
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                          Pendiente
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {order.work_date}
                        {order.invoice_number ? ` · Invoice: ${order.invoice_number}` : ''}
                        {' · '}Labor: <strong className="text-slate-200">{money.format(order.labor_amount)}</strong>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {order.work_order_assignments.map((a) => a.employees?.full_name ?? '—').join(', ')}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Expand to approve */}
                      <button
                        type="button"
                        onClick={() => { setExpandedId(isExpanded ? null : order.id); setRejectingId(null); }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                        disabled={isBusy}
                      >
                        ✅ Aprobar
                      </button>

                      {/* Reject — first click shows reason input, second confirms */}
                      {!isRejectingThisOrder ? (
                        <button
                          type="button"
                          onClick={() => void handleReject(order.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/20 border border-red-400/30 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
                        >
                          ❌ Rechazar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRejectingId(null)}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 hover:bg-white/10"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rejection reason input */}
                  {isRejectingThisOrder && (
                    <div className="border-t border-red-400/20 bg-red-950/20 px-5 py-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">⚠️ Motivo del rechazo</p>
                      <textarea
                        rows={2}
                        placeholder="Ej: Foto borrosa, número de serie ilegible, papelwork incorrecto…"
                        value={rejectReasonDraft[order.id] ?? ''}
                        onChange={(e) => setRejectReasonDraft((prev) => ({ ...prev, [order.id]: e.target.value }))}
                        className="w-full resize-none rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-red-400/60"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReject(order.id)}
                          disabled={isBusy}
                          className="rounded-xl bg-red-500 px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-red-400 disabled:opacity-50"
                        >
                          {isBusy ? 'Rechazando…' : '❌ Confirmar rechazo'}
                        </button>
                        <p className="text-xs text-slate-500">(El motivo será visible para el mecánico)</p>
                      </div>
                    </div>
                  )}

                  {/* Evidence photos */}
                  {(order.paperwork_path || order.part_photo_path) && (
                    <div className="px-5 pb-4">
                      <PhotoEvidenceButton
                        paperworkPath={order.paperwork_path}
                        partPhotoPath={order.part_photo_path}
                        uploadedAt={order.created_at}
                      />
                    </div>
                  )}

                  {/* Expanded approval form */}
                  {isExpanded && (
                    <div className="border-t border-white/10 bg-slate-900/50 px-5 py-5 space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Confirmar montos de aprobación
                      </p>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Monto final (mánager)
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={laborVal}
                            onChange={(e) => setManagerLabor((prev) => ({ ...prev, [order.id]: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Modo de pago
                          </span>
                          <select
                            value={mode}
                            onChange={(e) => setApprovalMode((prev) => ({
                              ...prev,
                              [order.id]: e.target.value as ApproveMode,
                            }))}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                          >
                            <option value="auto_percent">Porcentaje automático</option>
                            <option value="manual_amount">Montos manuales</option>
                          </select>
                        </label>
                      </div>

                      <div className="space-y-2">
                        {order.work_order_assignments.map((a) => (
                          <div key={a.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                            <span className="text-sm font-semibold text-white">{a.employees?.full_name ?? 'Mecánico'}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                {mode === 'auto_percent' ? '%' : '$'}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={valuesMap[a.employee_id] ?? ''}
                                onChange={(e) => setAssignmentValues((prev) => ({
                                  ...prev,
                                  [order.id]: { ...(prev[order.id] ?? {}), [a.employee_id]: e.target.value },
                                }))}
                                className="w-32 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(null)}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApprove(order)}
                          disabled={isBusy}
                          className="rounded-xl bg-emerald-500 px-6 py-2 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-emerald-400 disabled:opacity-50"
                        >
                          {isBusy ? 'Aprobando…' : '✅ Confirmar aprobación'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link
            href="/dashboard"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-300"
          >
            ← Volver al Dashboard
          </Link>
        </div>
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
