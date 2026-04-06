import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { BackButton } from '@/components/BackButton';
import { NominaFilters } from '@/components/nomina/NominaFilters';
import { PayrollDeductionForm } from '@/components/PayrollDeductionForm';
import { PayrollPdfButton } from '@/components/PayrollPdfButton';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type Employee = {
  id: string;
  full_name: string;
  role: 'mechanic' | 'admin';
};

type WorkOrder = {
  id: string;
  employee_id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  mechanic_share: number;
};

type WorkAssignment = {
  id: string;
  employee_id: string;
  approved_amount: number;
  assignment_mode: 'percent' | 'manual';
  percent_share: number | null;
  manual_amount: number | null;
  work_orders: WorkOrder | null;
};

type DebtPayment = {
  id: string;
  debt_id: string;
  week_ending: string;
  amount: number;
  debts: {
    employee_id: string;
    description: string;
  } | null;
};

type OneTimeDeduction = {
  id: string;
  employee_id: string;
  description: string;
  deduction_type: 'warranty' | 'advance' | 'other';
  amount: number;
  applied: boolean;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function getDefaultPayrollRange(today = new Date(), extendToFriday = false) {
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  const day = start.getDay(); // 0=Sun, 6=Sat
  const daysSinceSaturday = (day + 1) % 7;
  start.setDate(start.getDate() - daysSinceSaturday);
  start.setHours(0, 0, 0, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function resolveRange(inputStart?: string, inputEnd?: string, extendToFriday = false) {
  const fallback = getDefaultPayrollRange(new Date(), extendToFriday);

  if (!inputStart || !inputEnd) {
    return fallback;
  }

  if (Number.isNaN(Date.parse(inputStart)) || Number.isNaN(Date.parse(inputEnd))) {
    return fallback;
  }

  if (inputStart > inputEnd) {
    return {
      start: inputEnd,
      end: inputStart,
    };
  }

  return {
    start: inputStart,
    end: inputEnd,
  };
}

export default async function NominaPage({
  searchParams,
}: {
  searchParams?: Promise<{ start?: string; end?: string; extend?: string; employee?: string }>;
}) {
  noStore();

  const params = (await searchParams) ?? {};
  const extendToFriday = params.extend === '1';
  const selectedEmployeeId = params.employee ?? 'all';
  const week = resolveRange(params.start, params.end, extendToFriday);

  try {
    const supabase = getSupabaseServerClient();

    const [
      { data: employees, error: empErr },
      assignmentQuery,
      { data: workOrders, error: woErr },
      { data: debtPayments, error: debtPaymentsErr },
      { data: oneTimeDeductions, error: otdErr },
    ] = await Promise.all([
      supabase.from('employees').select('id,full_name,role').eq('role', 'mechanic').order('full_name').returns<Employee[]>(),
      supabase.from('work_order_assignments').select('id,employee_id,approved_amount,assignment_mode,percent_share,manual_amount,work_orders!inner(id,work_date,company,unit,invoice_number,labor_amount,status)')
        .eq('work_orders.status', 'approved')
        .gte('work_orders.work_date', week.start).lte('work_orders.work_date', week.end)
        .returns<WorkAssignment[]>(),
      supabase.from('work_orders').select('id,employee_id,work_date,company,unit,invoice_number,labor_amount,mechanic_share')
        .eq('status', 'approved')
        .gte('work_date', week.start).lte('work_date', week.end).order('work_date').returns<WorkOrder[]>(),
      supabase.from('debt_payments').select('id,debt_id,week_ending,amount,debts(employee_id,description)')
        .eq('week_ending', week.end).returns<DebtPayment[]>(),
      supabase.from('one_time_deductions').select('id,employee_id,description,deduction_type,amount,applied')
        .eq('report_week_ending', week.end).returns<OneTimeDeduction[]>(),
    ]);

    let assignmentRows = assignmentQuery.data ?? [];
    const assignmentsErr = assignmentQuery.error;

    if (empErr) throw new Error(empErr.message);
    if (assignmentsErr) {
      // Fallback to legacy rows so payroll remains usable if assignments query fails due to schema/policy differences.
      assignmentRows = (workOrders ?? []).map((order) => ({
        id: `legacy-${order.id}`,
        employee_id: order.employee_id,
        approved_amount: Number(order.mechanic_share ?? 0),
        assignment_mode: 'percent',
        percent_share: 50,
        manual_amount: null,
        work_orders: {
          id: order.id,
          employee_id: order.employee_id,
          work_date: order.work_date,
          company: order.company,
          unit: order.unit,
          invoice_number: order.invoice_number,
          labor_amount: Number(order.labor_amount),
          mechanic_share: Number(order.mechanic_share),
          status: 'approved',
        },
      }));
    }
    if (woErr) throw new Error(woErr.message);
    if (debtPaymentsErr) throw new Error(debtPaymentsErr.message);
    if (otdErr) throw new Error(otdErr.message);

    const payroll = (employees ?? []).map((emp) => {
      const assignments = (assignmentRows ?? []).filter((row) => row.employee_id === emp.id && row.work_orders);
      const empDebtPayments = (debtPayments ?? []).filter((payment) => payment.debts?.employee_id === emp.id);
      const empOTD = (oneTimeDeductions ?? []).filter((d) => d.employee_id === emp.id);

      const grossEarnings = assignments.reduce((sum, row) => sum + Number(row.approved_amount), 0);
      const debtDeductions = empDebtPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const otdDeductions = empOTD.reduce((sum, d) => sum + Number(d.amount), 0);
      const totalDeductions = debtDeductions + otdDeductions;
      const netPay = Math.max(0, grossEarnings - totalDeductions);

      return { employee: emp, assignments, debtPayments: empDebtPayments, oneTimeDeductions: empOTD, grossEarnings, debtDeductions, otdDeductions, totalDeductions, netPay };
    });

    const filteredPayroll = selectedEmployeeId === 'all'
      ? payroll
      : payroll.filter((row) => row.employee.id === selectedEmployeeId);

    const totalLabor = filteredPayroll.reduce(
      (sum, row) => sum + row.assignments.reduce((inner, assignment) => inner + Number(assignment.work_orders?.labor_amount ?? 0), 0),
      0,
    );
    const totalNet = filteredPayroll.reduce((sum, row) => sum + row.netPay, 0);

    const pdfRows = filteredPayroll.map((row) => ({
      employeeName: row.employee.full_name,
      jobs: row.assignments.map((assignment) => ({
        date: assignment.work_orders?.work_date ?? '',
        unit: assignment.work_orders?.unit ?? '',
        invoice: assignment.work_orders?.invoice_number ?? 'N/A',
        laborTotal: Number(assignment.work_orders?.labor_amount ?? 0),
        mechanicPay: Number(assignment.approved_amount),
      })),
      deductions: [
        ...row.debtPayments.map((payment) => ({
          label: `Cuota deuda: ${payment.debts?.description ?? 'Deuda activa'}`,
          amount: Number(payment.amount),
        })),
        ...row.oneTimeDeductions.map((deduction) => ({
          label: `${deduction.description} (${deduction.deduction_type})`,
          amount: Number(deduction.amount),
        })),
      ],
      gross: Number(row.grossEarnings),
      totalDeductions: Number(row.totalDeductions),
      net: Number(row.netPay),
    }));

    return (
      <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6 print:bg-white print:text-black">
        <section className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/60 px-5 py-4 shadow-2xl backdrop-blur print:hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex shrink-0 items-center gap-3">
                <BackButton fallbackHref="/dashboard" label="Volver" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Advance Truck Repair</p>
                  <h1 className="display-font text-2xl font-bold uppercase text-white">Nómina Semanal</h1>
                </div>
              </div>

              <NominaFilters
                start={week.start}
                end={week.end}
                selectedEmployeeId={selectedEmployeeId}
                employees={(employees ?? []).map((employee) => ({
                  id: employee.id,
                  full_name: employee.full_name,
                }))}
              />
            </div>
          </div>

          <div className="hidden print:block text-center mb-6">
            <h1 className="text-2xl font-bold uppercase">Advance Truck Repair</h1>
            <p className="text-sm">Nómina Semanal del {week.start} al {week.end}</p>
          </div>

          <PayrollDeductionForm
            weekEnding={week.end}
            employees={(employees ?? []).map((employee) => ({ id: employee.id, full_name: employee.full_name }))}
          />

          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 print:border-black/20 print:bg-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200 print:text-gray-500">Corte</p>
                  <p className="mt-1 font-semibold text-white print:text-black">{week.start} — {week.end}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200 print:text-gray-500">Labor Total Taller</p>
                  <p className="mt-1 font-semibold text-white print:text-black">{money.format(totalLabor)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200 print:text-gray-500">Total a Pagar</p>
                  <p className="mt-1 font-bold text-emerald-300 print:text-green-700">{money.format(totalNet)}</p>
                </div>
              </div>
              <PayrollPdfButton
                periodStart={week.start}
                periodEnd={week.end}
                employeeFilterLabel={selectedEmployeeId === 'all' ? 'Todos' : (employees ?? []).find((employee) => employee.id === selectedEmployeeId)?.full_name ?? 'Empleado'}
                rows={pdfRows}
                totalNetPay={totalNet}
                large
              />
            </div>
          </div>

          {filteredPayroll.map(({ employee, assignments, debtPayments: empDebtPayments, oneTimeDeductions: empOTD, grossEarnings, debtDeductions, otdDeductions, netPay }) => (
            <section key={employee.id} className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur print:rounded-none print:border print:border-black/20 print:shadow-none print:bg-white print:text-black">
              <div className="flex items-center justify-between">
                <h2 className="display-font text-xl font-bold uppercase tracking-wide print:text-black">{employee.full_name}</h2>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200 print:border-gray-400 print:bg-gray-100 print:text-gray-700">
                  Mecanico
                </span>
              </div>

              {assignments.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm print:text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-slate-400 print:border-gray-300 print:text-gray-500">
                        <th className="py-2 pr-4">Fecha</th>
                        <th className="py-2 pr-4">Compania</th>
                        <th className="py-2 pr-4">Unidad</th>
                        <th className="py-2 pr-4">Invoice</th>
                        <th className="py-2 pr-4">Labor</th>
                        <th className="py-2">Cheque del mecánico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((row) => (
                        <tr key={row.id} className="border-b border-white/5 text-slate-200 print:border-gray-200 print:text-black">
                          <td className="py-2 pr-4">{row.work_orders?.work_date}</td>
                          <td className="py-2 pr-4">{row.work_orders?.company}</td>
                          <td className="py-2 pr-4">{row.work_orders?.unit}</td>
                          <td className="py-2 pr-4">{row.work_orders?.invoice_number ?? 'N/A'}</td>
                          <td className="py-2 pr-4">{money.format(Number(row.work_orders?.labor_amount ?? 0))}</td>
                          <td className="py-2 font-semibold text-emerald-300 print:text-green-700">{money.format(row.approved_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Sin trabajos registrados en este corte.</p>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  {empDebtPayments.map((payment) => (
                    <div key={payment.id} className="flex justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-sm print:border-gray-200 print:bg-gray-50">
                      <span className="text-slate-300 print:text-gray-600">— Cuota deuda: {payment.debts?.description ?? 'Deuda activa'}</span>
                      <span className="font-semibold text-amber-300 print:text-amber-700">-{money.format(payment.amount)}</span>
                    </div>
                  ))}
                  {empOTD.map((d) => (
                    <div key={d.id} className="flex justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-sm print:border-gray-200 print:bg-gray-50">
                      <span className="text-slate-300 print:text-gray-600">— {d.description} ({d.deduction_type})</span>
                      <span className="font-semibold text-red-300 print:text-red-700">-{money.format(d.amount)}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 print:border-gray-300 print:bg-gray-50">
                  <div className="flex justify-between text-sm text-slate-300 print:text-gray-600">
                    <span>Ganancia bruta (50%)</span>
                    <span>{money.format(grossEarnings)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-amber-300 print:text-amber-700">
                    <span>Cuotas de deuda</span>
                    <span>-{money.format(debtDeductions)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-red-300 print:text-red-700">
                    <span>Uniformes y otros</span>
                    <span>-{money.format(otdDeductions)}</span>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-white/10 pt-3 print:border-gray-300">
                    <span className="text-sm font-bold uppercase tracking-[0.16em] print:text-gray-900">Pago Neto</span>
                    <span className="text-xl font-bold text-emerald-300 print:text-green-700">{money.format(netPay)}</span>
                  </div>
                </div>
              </div>
            </section>
          ))}

          {filteredPayroll.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-8 text-center text-slate-400">
              No hay mecanicos registrados. Agrega empleados en Supabase para generar la nomina.
            </div>
          )}

          <p className="text-center text-xs text-slate-600 print:text-gray-400">
            Powered by JRC Smart Systems
          </p>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    return (
      <main className="brand-bg min-h-screen px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-3xl rounded-[28px] border border-red-500/20 bg-red-950/20 p-6 backdrop-blur">
          <h1 className="display-font mt-3 text-3xl font-bold uppercase text-white">Error en Nomina</h1>
          <p className="mt-4 text-sm text-red-100/90">{message}</p>
          <Link href="/dashboard" className="mt-5 inline-block text-sm text-amber-300 hover:underline">← Volver al dashboard</Link>
        </section>
      </main>
    );
  }
}

