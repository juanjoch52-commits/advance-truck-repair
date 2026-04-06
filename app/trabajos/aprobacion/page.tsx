'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Toast } from '@/components/Toast';

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
  work_order_assignments: Assignment[];
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function AprobacionTrabajosPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [approvalModeByOrder, setApprovalModeByOrder] = useState<Record<string, 'auto_percent' | 'manual_amount'>>({});
  const [managerLaborByOrder, setManagerLaborByOrder] = useState<Record<string, string>>({});
  const [assignmentValuesByOrder, setAssignmentValuesByOrder] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    fetch('/api/trabajos?status=pending')
      .then((res) => res.json())
      .then((json: { work_orders?: WorkOrder[]; error?: string }) => {
        if (!json.work_orders) {
          throw new Error(json.error ?? 'No se pudieron cargar las órdenes');
        }

        setOrders(json.work_orders);

        const defaultModes: Record<string, 'auto_percent' | 'manual_amount'> = {};
        const defaultLabor: Record<string, string> = {};
        const defaultAssignments: Record<string, Record<string, string>> = {};

        json.work_orders.forEach((order) => {
          defaultModes[order.id] = 'auto_percent';
          defaultLabor[order.id] = String(order.manager_labor_amount ?? order.labor_amount ?? 0);
          defaultAssignments[order.id] = Object.fromEntries(
            order.work_order_assignments.map((assignment) => [
              assignment.employee_id,
              String(assignment.percent_share ?? assignment.manual_amount ?? 0),
            ]),
          );
        });

        setApprovalModeByOrder(defaultModes);
        setManagerLaborByOrder(defaultLabor);
        setAssignmentValuesByOrder(defaultAssignments);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Error al cargar aprobaciones';
        setToast({ message, type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  const totalPending = useMemo(() => orders.length, [orders]);

  async function handleApprove(order: WorkOrder) {
    const mode = approvalModeByOrder[order.id] ?? 'auto_percent';
    const managerLabor = Number(managerLaborByOrder[order.id] ?? order.labor_amount);
    const assignmentsMap = assignmentValuesByOrder[order.id] ?? {};

    const assignments = order.work_order_assignments.map((assignment) => ({
      employee_id: assignment.employee_id,
      mode: mode === 'auto_percent' ? 'percent' : 'manual',
      value: Number(assignmentsMap[assignment.employee_id] ?? 0),
    }));

    if (mode === 'auto_percent') {
      const totalPercent = assignments.reduce((sum, row) => sum + row.value, 0);
      if (totalPercent > 100) {
        setToast({ message: 'La suma de porcentajes no puede superar 100%.', type: 'error' });
        return;
      }
    }

    setApprovingId(order.id);
    try {
      const response = await fetch(`/api/trabajos/${order.id}/aprobar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_mode: mode,
          manager_labor_amount: managerLabor,
          approved_by: 'manager',
          assignments,
        }),
      });

      const json = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo aprobar la orden.', type: 'error' });
        return;
      }

      setOrders((current) => current.filter((item) => item.id !== order.id));
      setToast({ message: 'Orden aprobada correctamente.', type: 'success' });
    } catch {
      setToast({ message: 'Error de conexión al aprobar.', type: 'error' });
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Control del Mánager</p>
            <h1 className="display-font mt-2 text-4xl font-bold uppercase text-white">Aprobación de Trabajos</h1>
            <p className="mt-2 text-sm text-slate-300">Pendientes: {totalPending}</p>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-amber-300/30 hover:text-white">
            ← Dashboard
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center text-slate-400">Cargando órdenes pendientes...</div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center text-slate-400">No hay órdenes pendientes de aprobación.</div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const mode = approvalModeByOrder[order.id] ?? 'auto_percent';
              const managerLabor = managerLaborByOrder[order.id] ?? String(order.labor_amount);
              const assignmentValues = assignmentValuesByOrder[order.id] ?? {};

              return (
                <article key={order.id} className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="display-font text-2xl font-bold text-white">{order.company} · {order.unit}</h2>
                      <p className="mt-1 text-sm text-slate-300">Fecha: {order.work_date} · Invoice: {order.invoice_number ?? 'Sin invoice'}</p>
                      <p className="text-sm text-slate-300">Labor registrado por mecánico: {money.format(order.labor_amount)}</p>
                    </div>
                    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Pendiente</span>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-3">
                    <label className="text-sm text-slate-300">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Monto final (mányager)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={managerLabor}
                        onChange={(event) => setManagerLaborByOrder((current) => ({ ...current, [order.id]: event.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                      />
                    </label>

                    <label className="text-sm text-slate-300 lg:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Modo de aprobación</span>
                      <select
                        value={mode}
                        onChange={(event) => setApprovalModeByOrder((current) => ({
                          ...current,
                          [order.id]: event.target.value as 'auto_percent' | 'manual_amount',
                        }))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                      >
                        <option value="auto_percent">Aplicar porcentaje automático</option>
                        <option value="manual_amount">Asignar montos manuales</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 space-y-3">
                    {order.work_order_assignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-semibold text-white">{assignment.employees?.full_name ?? 'Mecánico'}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              {mode === 'auto_percent' ? 'Porcentaje (%)' : 'Monto manual ($)'}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={assignmentValues[assignment.employee_id] ?? ''}
                              onChange={(event) => setAssignmentValuesByOrder((current) => ({
                                ...current,
                                [order.id]: {
                                  ...(current[order.id] ?? {}),
                                  [assignment.employee_id]: event.target.value,
                                },
                              }))}
                              className="w-40 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleApprove(order)}
                      disabled={approvingId === order.id}
                      className="rounded-xl bg-emerald-400 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                    >
                      {approvingId === order.id ? 'Aprobando...' : 'Aprobar trabajo'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
