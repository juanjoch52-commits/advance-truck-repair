'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/Toast';

type EmployeeOption = {
  id: string;
  full_name: string;
};

type PayrollDeductionFormProps = {
  weekEnding: string;
  employees: EmployeeOption[];
};

export function PayrollDeductionForm({ weekEnding, employees }: PayrollDeductionFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({
    employee_id: '',
    deduction_type: 'warranty' as 'warranty' | 'advance' | 'other',
    description: '',
    amount: '',
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(form.amount);
    if (!form.employee_id || !form.description || !amount || amount <= 0) {
      setToast({ message: 'Completa todos los campos con un monto válido.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/deducciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: form.employee_id,
          deduction_type: form.deduction_type,
          description: form.description,
          amount,
          report_week_ending: weekEnding,
        }),
      });

      const json = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo registrar la deducción.', type: 'error' });
        return;
      }

      setToast({ message: 'Deducción registrada en nómina.', type: 'success' });
      setForm({ employee_id: '', deduction_type: 'warranty', description: '', amount: '' });
      router.refresh();
    } catch {
      setToast({ message: 'Error de conexión al registrar deducción.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-5 shadow-2xl backdrop-blur print:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Deducciones manuales</p>
          <h3 className="display-font mt-1 text-xl font-bold uppercase text-white">Uniformes, garantías y adelantos</h3>
        </div>
        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Semana: {weekEnding}</span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select
          required
          value={form.employee_id}
          onChange={(event) => setForm((current) => ({ ...current, employee_id: event.target.value }))}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        >
          <option value="">Selecciona empleado</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.full_name}</option>
          ))}
        </select>

        <select
          value={form.deduction_type}
          onChange={(event) => setForm((current) => ({ ...current, deduction_type: event.target.value as 'warranty' | 'advance' | 'other' }))}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        >
          <option value="warranty">Garantía</option>
          <option value="advance">Adelanto</option>
          <option value="other">Otro</option>
        </select>

        <input
          type="text"
          required
          placeholder="Descripción"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        />

        <input
          type="number"
          required
          min={0.01}
          step={0.01}
          placeholder="Monto"
          value={form.amount}
          onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        />

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Aplicar'}
        </button>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}
