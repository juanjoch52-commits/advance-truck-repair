'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface Employee {
  id: string;
  full_name: string;
}

interface Assignment {
  employee_id: string;
  mechanic_role: 'principal' | 'ayudante';
  assigned_amount: number;
}

export default function NuevaOrdenPage() {
  const router = useRouter();
  const supabase = createClient();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [truckNumber, setTruckNumber] = useState('');
  const [company, setCompany] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([
    { employee_id: '', mechanic_role: 'principal', assigned_amount: 0 },
  ]);

  function getWeekRange(dateStr: string) {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMon);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    };
  }

  useEffect(() => {
    supabase
      .from('employees')
      .select('id, full_name')
      .order('full_name')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  function addAssignment() {
    setAssignments([...assignments, { employee_id: '', mechanic_role: 'ayudante', assigned_amount: 0 }]);
  }

  function removeAssignment(index: number) {
    setAssignments(assignments.filter((_, i) => i !== index));
  }

  function updateAssignment(index: number, field: keyof Assignment, value: string | number) {
    const updated = [...assignments];
    updated[index] = { ...updated[index], [field]: value };
    setAssignments(updated);
  }

  const totalAsignado = assignments.reduce((s, a) => s + Number(a.assigned_amount || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!truckNumber.trim()) return setError('El numero de camion es requerido.');
    if (assignments.some((a) => !a.employee_id)) return setError('Seleccione un mecanico para cada asignacion.');
    if (assignments.some((a) => Number(a.assigned_amount) <= 0)) return setError('El monto de cada mecanico debe ser mayor a $0.');

    const principalCount = assignments.filter((a) => a.mechanic_role === 'principal').length;
    if (principalCount !== 1) return setError('Debe haber exactamente un mecanico Principal.');

    setLoading(true);

    const { start: weekStart, end: weekEnd } = getWeekRange(workDate);
    const principalAssignment = assignments.find((a) => a.mechanic_role === 'principal');
    if (!principalAssignment) { setError('No hay mecanico principal.'); setLoading(false); return; }

    const { data: order, error: orderErr } = await (supabase as any)
      .from('work_orders')
      .insert({
        employee_id: principalAssignment.employee_id,
        truck_number: truckNumber.trim(),
        unit: truckNumber.trim(),
        company: company.trim() || 'Sin empresa',
        invoice_number: invoiceNumber.trim() || null,
        work_date: workDate,
        description: description.trim() || null,
        labor_amount: totalAsignado,
        week_start: weekStart,
        week_end: weekEnd,
        status: 'approved',
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      setError('Error al crear la orden: ' + (orderErr?.message ?? 'desconocido'));
      setLoading(false);
      return;
    }

    for (const a of assignments) {
      const { data: assign, error: assignErr } = await (supabase as any)
        .from('work_order_assignments')
        .insert({
          work_order_id: order.id,
          employee_id: a.employee_id,
          mechanic_role: a.mechanic_role,
          assignment_mode: 'manual',
          assigned_amount: Number(a.assigned_amount),
          manual_amount: Number(a.assigned_amount),
          approved_amount: Number(a.assigned_amount),
        })
        .select('id')
        .single();

      if (assignErr || !assign) {
        setError('Error al guardar asignacion: ' + (assignErr?.message ?? 'desconocido'));
        setLoading(false);
        return;
      }

      await (supabase as any).from('earned_entries').upsert({
        work_order_id: order.id,
        assignment_id: assign.id,
        employee_id: a.employee_id,
        truck_number: truckNumber.trim(),
        mechanic_role: a.mechanic_role,
        amount: Number(a.assigned_amount),
        work_date: workDate,
        week_start: weekStart,
        week_end: weekEnd,
      }, { onConflict: 'assignment_id' });
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/ordenes'), 1500);
  }

  if (success) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="display-font text-xl text-emerald-400">ORDEN CREADA</p>
          <p className="text-slate-400 text-sm mt-1">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <a href="/ordenes" className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver a Ordenes
        </a>
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">
          NUEVA ORDEN DE TRABAJO
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-5 tracking-wide text-lg">
            DATOS DEL CAMION
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">
                Numero de Camion / Unidad *
              </label>
              <input
                type="text"
                value={truckNumber}
                onChange={(e) => setTruckNumber(e.target.value)}
                required
                placeholder="Ej: TRK-001, Unidad 42"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Empresa / Cliente</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Nombre de la empresa"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Numero de Factura</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Ej: INV-2026-001"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">Fecha del Trabajo *</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                required
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-sm mb-2">Descripcion del Trabajo</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Descripcion breve del trabajo realizado..."
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition resize-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="display-font text-slate-300 font-semibold tracking-wide text-lg">
              MECANICOS ASIGNADOS
            </h2>
            <button
              type="button"
              onClick={addAssignment}
              className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1 border border-amber-500/30 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Agregar Mecanico
            </button>
          </div>

          <div className="space-y-3">
            {assignments.map((a, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-5">
                  {idx === 0 && <label className="block text-slate-500 text-xs mb-1.5">Mecanico</label>}
                  <select
                    value={a.employee_id}
                    onChange={(e) => updateAssignment(idx, 'employee_id', e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 text-sm transition"
                  >
                    <option value="">Seleccionar...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-3">
                  {idx === 0 && <label className="block text-slate-500 text-xs mb-1.5">Rol</label>}
                  <select
                    value={a.mechanic_role}
                    onChange={(e) => updateAssignment(idx, 'mechanic_role', e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 text-sm transition"
                  >
                    <option value="principal">Principal</option>
                    <option value="ayudante">Ayudante</option>
                  </select>
                </div>

                <div className="col-span-3">
                  {idx === 0 && <label className="block text-slate-500 text-xs mb-1.5">Monto ($)</label>}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={a.assigned_amount || ''}
                      onChange={(e) => updateAssignment(idx, 'assigned_amount', e.target.value)}
                      required
                      placeholder="0.00"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 text-sm transition"
                    />
                  </div>
                </div>

                <div className="col-span-1 flex justify-end">
                  {assignments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAssignment(idx)}
                      className="text-slate-600 hover:text-red-400 transition p-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-white/5 flex justify-end">
            <div className="text-right">
              <p className="text-slate-500 text-sm">Total a Devengar</p>
              <p className="display-font text-2xl font-bold text-amber-400">
                ${totalAsignado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-3 px-8 rounded-lg transition-all display-font tracking-wide"
          >
            {loading ? 'GUARDANDO...' : 'GUARDAR ORDEN'}
          </button>
          <a
            href="/ordenes"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-lg transition-all text-sm flex items-center"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}
