'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type EmployeeOption = {
  id: string;
  full_name: string;
};

type NominaFiltersProps = {
  start: string;
  end: string;
  selectedEmployeeId: string;
  employees: EmployeeOption[];
};

export function NominaFilters({ start, end, selectedEmployeeId, employees }: NominaFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [localStart, setLocalStart] = useState(start);
  const [localEnd, setLocalEnd] = useState(end);
  const [localEmployee, setLocalEmployee] = useState(selectedEmployeeId);

  function applyFilters() {
    const params = new URLSearchParams();
    params.set('start', localStart);
    params.set('end', localEnd);
    params.set('employee', localEmployee);

    startTransition(() => {
      router.replace(`/nomina?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-slate-300">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Inicio</span>
        <input
          type="date"
          value={localStart}
          onChange={(event) => setLocalStart(event.target.value)}
          className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        />
      </label>

      <label className="text-sm text-slate-300">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Fin</span>
        <input
          type="date"
          value={localEnd}
          onChange={(event) => setLocalEnd(event.target.value)}
          className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        />
      </label>

      <label className="text-sm text-slate-300">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Empleado</span>
        <select
          value={localEmployee}
          onChange={(event) => setLocalEmployee(event.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
        >
          <option value="all">Todos</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.full_name}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={applyFilters}
        disabled={isPending || !localStart || !localEnd}
        className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
      >
        {isPending ? 'Actualizando...' : 'Aplicar filtro'}
      </button>
    </div>
  );
}
