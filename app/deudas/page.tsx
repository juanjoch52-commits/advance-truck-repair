'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BackButton } from '@/components/BackButton';
import { Toast } from '@/components/Toast';

type Employee = { id: string; full_name: string };

type Debt = {
  id: string;
  employee_id: string;
  total_amount: number;
  remaining_balance: number;
  description: string;
  weekly_installment: number;
  created_at: string;
  employees: { full_name: string } | null;
};

function getWeekEndingThursday(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  result.setDate(result.getDate() + daysUntilThursday);
  return result.toISOString().slice(0, 10);
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition';

const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function DeudasPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingDebtId, setApplyingDebtId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    employee_id: '',
    total_amount: '',
    description: '',
    weekly_installment: '25',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, debtRes] = await Promise.all([
        fetch('/api/empleados'),
        fetch('/api/deudas'),
      ]);
      const empJson = await empRes.json() as { employees?: Employee[] };
      const debtJson = await debtRes.json() as { debts?: Debt[] };
      setEmployees(empJson.employees ?? []);
      setDebts(debtJson.debts ?? []);
    } catch {
      setToast({ message: 'Error al cargar datos.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id) {
      setToast({ message: 'Selecciona un empleado.', type: 'error' });
      return;
    }

    const totalAmount = parseFloat(form.total_amount);
    if (!totalAmount || totalAmount <= 0) {
      setToast({ message: 'El monto debe ser mayor a cero.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/deudas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: form.employee_id,
          total_amount: totalAmount,
          description: form.description,
          weekly_installment: parseFloat(form.weekly_installment) || 25,
        }),
      });

      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'Error al registrar la deuda.', type: 'error' });
        return;
      }

      setToast({ message: '¡Deuda registrada exitosamente!', type: 'success' });
      setForm({ employee_id: '', total_amount: '', description: '', weekly_installment: '25' });
      void loadData();
    } catch {
      setToast({ message: 'Error de conexión.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyWeeklyInstallment(debtId: string) {
    setApplyingDebtId(debtId);
    try {
      const res = await fetch(`/api/deudas/${debtId}/cuota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_ending: getWeekEndingThursday() }),
      });

      const json = await res.json() as { ok?: boolean; error?: string; payment?: { amount: number } };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo aplicar la cuota semanal.', type: 'error' });
        return;
      }

      setToast({ message: `Cuota aplicada por ${money.format(json.payment?.amount ?? 0)}.`, type: 'success' });
      await loadData();
    } catch {
      setToast({ message: 'Error de conexión al aplicar la cuota.', type: 'error' });
    } finally {
      setApplyingDebtId(null);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-4xl space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Control de Descuentos</p>
            <h1 className="display-font text-4xl font-bold uppercase text-white">Deudas</h1>
          </div>
        </div>

        {/* Formulario nuevo deuda */}
        <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-amber-300">Registrar nueva deuda</p>
          <h2 className="display-font mt-1 text-2xl font-bold text-white">Nueva Deuda</h2>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="employee_id" className={labelClass}>Mecánico</label>
              <select
                id="employee_id"
                required
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">{loading ? 'Cargando...' : 'Selecciona un mecánico'}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="total_amount" className={labelClass}>Monto Total ($)</label>
                <input
                  id="total_amount"
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  placeholder="0.00"
                  value={form.total_amount}
                  onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="weekly_installment" className={labelClass}>Descuento semanal ($)</label>
                <input
                  id="weekly_installment"
                  type="number"
                  required
                  min={1}
                  step="0.01"
                  placeholder="25.00"
                  value={form.weekly_installment}
                  onChange={(e) => setForm((f) => ({ ...f, weekly_installment: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="description" className={labelClass}>Descripción</label>
              <input
                id="description"
                type="text"
                required
                placeholder="Ej. Adelanto de nómina, herramienta, uniforme..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={inputClass}
              />
            </div>

            {form.total_amount && parseFloat(form.total_amount) > 0 && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Resumen</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-400">Monto total</p>
                    <p className="text-2xl font-bold text-white">{money.format(parseFloat(form.total_amount) || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Descuento / semana</p>
                    <p className="text-2xl font-bold text-amber-300">{money.format(parseFloat(form.weekly_installment) || 25)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Semanas aprox.</p>
                    <p className="text-2xl font-bold text-slate-300">
                      {Math.ceil((parseFloat(form.total_amount) || 0) / (parseFloat(form.weekly_installment) || 25))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-amber-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Registrar Deuda'}
            </button>
          </form>
        </div>

        {/* Lista de deudas activas */}
        <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Estado actual</p>
              <h2 className="display-font mt-1 text-2xl font-bold text-white">Deudas Activas</h2>
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Semana actual: corte {getWeekEndingThursday()}
            </p>
          </div>

          {loading ? (
            <div className="mt-6 text-center text-sm text-slate-400">Cargando deudas...</div>
          ) : debts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">
              No hay deudas activas registradas.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <th className="px-3 py-3">Mecánico</th>
                    <th className="px-3 py-3">Descripción</th>
                    <th className="px-3 py-3">Total</th>
                    <th className="px-3 py-3">Restante</th>
                    <th className="px-3 py-3">$/Semana</th>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((debt) => {
                    const pct = Math.round(((debt.total_amount - debt.remaining_balance) / debt.total_amount) * 100);
                    return (
                      <tr key={debt.id} className="border-b border-white/5 transition hover:bg-white/5">
                        <td className="px-3 py-3 font-semibold text-white">
                          {debt.employees?.full_name ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-slate-300">{debt.description}</td>
                        <td className="px-3 py-3 text-slate-300">{money.format(debt.total_amount)}</td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-red-300">{money.format(debt.remaining_balance)}</span>
                          <div className="mt-1 h-1 w-full rounded-full bg-white/10">
                            <div
                              className="h-1 rounded-full bg-amber-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-400">{money.format(debt.weekly_installment)}</td>
                        <td className="px-3 py-3 text-slate-500">
                          {new Date(debt.created_at).toLocaleDateString('en-US')}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => void handleApplyWeeklyInstallment(debt.id)}
                            disabled={applyingDebtId === debt.id}
                            className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200 transition hover:bg-amber-300 hover:text-slate-950 disabled:opacity-50"
                          >
                            {applyingDebtId === debt.id ? 'Aplicando...' : 'Aplicar Cuota Semanal'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </section>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </main>
  );
}
