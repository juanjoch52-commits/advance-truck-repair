'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BackButton } from '@/components/BackButton';
import { Toast } from '@/components/Toast';

type Employee = {
  id: string;
  full_name: string;
};

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400';

export default function NuevoTrabajoPage() {
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const [form, setForm] = useState({
    employee_id: '',
    secondary_employee_id: '',
    work_date: new Date().toISOString().slice(0, 10),
    company: '',
    unit: '',
    invoice_number: '',
    labor_amount: '',
  });

  const [paperworkPhoto, setPaperworkPhoto] = useState<File | null>(null);
  const [partPhoto, setPartPhoto] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/empleados')
      .then((res) => res.json())
      .then((data: { employees?: Employee[] }) => {
        setEmployees(data.employees ?? []);
      })
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, []);

  const laborValue = parseFloat(form.labor_amount) || 0;
  const isShared = Boolean(form.secondary_employee_id);
  const primaryEstimated = Math.round(laborValue * (isShared ? 0.25 : 0.5) * 100) / 100;
  const secondaryEstimated = Math.round(laborValue * 0.25 * 100) / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.employee_id) {
      setToast({ message: 'Selecciona un empleado primero.', type: 'error' });
      return;
    }

    if (!paperworkPhoto || !partPhoto) {
      setToast({ message: 'Debes subir 2 fotos: paperwork y pieza reparada.', type: 'error' });
      return;
    }

    setSaving(true);

    try {
      const payload = new FormData();
      payload.append('employee_id', form.employee_id);
      if (form.secondary_employee_id) {
        payload.append('secondary_employee_id', form.secondary_employee_id);
      }
      payload.append('work_date', form.work_date);
      payload.append('company', form.company);
      payload.append('unit', form.unit);
      payload.append('invoice_number', form.invoice_number);
      payload.append('labor_amount', String(laborValue));
      payload.append('paperwork_photo', paperworkPhoto);
      payload.append('part_photo', partPhoto);

      const res = await fetch('/api/trabajos', {
        method: 'POST',
        body: payload,
      });

      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'Error al guardar el trabajo.', type: 'error' });
        return;
      }

      setToast({ message: 'Trabajo registrado con éxito. Pendiente de aprobación por el mánager.', type: 'success' });
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch {
      setToast({ message: 'Error de conexión. Verifica tu red.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Dashboard</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Nuevo Trabajo</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur space-y-5">

          <div>
            <label htmlFor="employee_id" className={labelClass}>Mecanico</label>
            <select
              id="employee_id"
              required
              value={form.employee_id}
              onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">
                {loadingEmployees ? 'Cargando empleados...' : 'Selecciona un mecanico'}
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="secondary_employee_id" className={labelClass}>Segundo mecánico (opcional)</label>
            <select
              id="secondary_employee_id"
              value={form.secondary_employee_id}
              onChange={(e) => setForm((f) => ({ ...f, secondary_employee_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">Sin trabajo compartido</option>
              {employees
                .filter((emp) => emp.id !== form.employee_id)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="work_date" className={labelClass}>Fecha</label>
              <input
                id="work_date"
                type="date"
                required
                value={form.work_date}
                onChange={(e) => setForm((f) => ({ ...f, work_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="invoice_number" className={labelClass}>Invoice #</label>
              <input
                id="invoice_number"
                type="text"
                placeholder="Opcional"
                value={form.invoice_number}
                onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="company" className={labelClass}>Compañia</label>
              <input
                id="company"
                type="text"
                required
                placeholder="Ej. Transportes XYZ"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="unit" className={labelClass}>Unidad / Camion</label>
              <input
                id="unit"
                type="text"
                required
                placeholder="Ej. Peterbilt #14"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="labor_amount" className={labelClass}>Labor Amount ($)</label>
            <input
              id="labor_amount"
              type="number"
              required
              min={0}
              step="0.01"
              placeholder="0.00"
              value={form.labor_amount}
              onChange={(e) => setForm((f) => ({ ...f, labor_amount: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="paperwork_photo" className={labelClass}>Foto de Paperwork (obligatoria)</label>
              <input
                id="paperwork_photo"
                type="file"
                accept="image/*"
                required
                onChange={(e) => setPaperworkPhoto(e.target.files?.[0] ?? null)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="part_photo" className={labelClass}>Foto de Pieza Reparada (obligatoria)</label>
              <input
                id="part_photo"
                type="file"
                accept="image/*"
                required
                onChange={(e) => setPartPhoto(e.target.files?.[0] ?? null)}
                className={inputClass}
              />
            </div>
          </div>

          {laborValue > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Estimado antes de aprobación</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-400">Labor Amount</p>
                  <p className="text-2xl font-bold text-white">${laborValue.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Monto Mecánico #1</p>
                  <p className="text-2xl font-bold text-emerald-300">${primaryEstimated.toFixed(2)}</p>
                </div>
                {isShared && (
                  <div>
                    <p className="text-xs text-slate-400">Monto Mecánico #2</p>
                    <p className="text-2xl font-bold text-sky-300">${secondaryEstimated.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-amber-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Trabajo'}
          </button>
        </form>
      </section>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </main>
  );
}
