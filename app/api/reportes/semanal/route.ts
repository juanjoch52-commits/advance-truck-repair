import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Employee = {
  id: string;
  full_name: string;
};

type AssignmentRow = {
  id: string;
  employee_id: string;
  approved_amount: number;
  work_orders: {
    id: string;
    work_date: string;
    company: string;
    unit: string;
    invoice_number: string | null;
    labor_amount: number;
  } | null;
};

type LegacyWorkOrder = {
  id: string;
  employee_id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  mechanic_share: number;
};

type DebtPayment = {
  id: string;
  amount: number;
  debts: {
    employee_id: string;
    description: string;
  } | null;
};

type Deduction = {
  id: string;
  employee_id: string;
  amount: number;
  description: string;
  deduction_type: 'warranty' | 'advance' | 'other';
};

const EMAIL_RECIPIENT = 'advancetruckrepairllc@gmail.com';
const WHATSAPP_RECIPIENTS = ['+18452421684', '+13215271894'];

function getDefaultWeekRange(today = new Date()) {
  const day = today.getDay();
  const daysBackToThursday = (day - 4 + 7) % 7;
  const end = new Date(today);
  end.setDate(today.getDate() - daysBackToThursday);

  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase no configurado');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendWebhook(url: string | undefined, payload: unknown) {
  if (!url) {
    return { sent: false, reason: 'URL no configurada' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { sent: false, reason: `HTTP ${response.status}` };
  }

  return { sent: true };
}

export async function GET() {
  try {
    const supabase = getClient();
    const week = getDefaultWeekRange();

    const [
      { data: employees, error: employeesError },
      assignmentQuery,
      { data: debtPayments, error: debtPaymentsError },
      { data: deductions, error: deductionsError },
    ] = await Promise.all([
      supabase.from('employees').select('id,full_name').eq('role', 'mechanic').returns<Employee[]>(),
      supabase.from('work_order_assignments').select('id,employee_id,approved_amount,work_orders!inner(id,work_date,company,unit,invoice_number,labor_amount,status)')
        .eq('work_orders.status', 'approved')
        .gte('work_orders.work_date', week.start)
        .lte('work_orders.work_date', week.end)
        .returns<AssignmentRow[]>(),
      supabase.from('debt_payments').select('id,amount,debts(employee_id,description)')
        .eq('week_ending', week.end)
        .returns<DebtPayment[]>(),
      supabase.from('one_time_deductions').select('id,employee_id,amount,description,deduction_type')
        .eq('report_week_ending', week.end)
        .returns<Deduction[]>(),
    ]);

    if (employeesError) throw new Error(employeesError.message);
    if (debtPaymentsError) throw new Error(debtPaymentsError.message);
    if (deductionsError) throw new Error(deductionsError.message);

    let assignments = assignmentQuery.data ?? [];

    if (assignmentQuery.error) {
      const missingAssignmentsTable = assignmentQuery.error.message.includes("Could not find the table 'public.work_order_assignments'");

      if (!missingAssignmentsTable) {
        throw new Error(assignmentQuery.error.message);
      }

      const { data: legacyOrders, error: legacyOrdersError } = await supabase
        .from('work_orders')
        .select('id,employee_id,work_date,company,unit,invoice_number,labor_amount,mechanic_share')
        .gte('work_date', week.start)
        .lte('work_date', week.end)
        .returns<LegacyWorkOrder[]>();

      if (legacyOrdersError) {
        throw new Error(legacyOrdersError.message);
      }

      assignments = (legacyOrders ?? []).map((order) => ({
        id: `legacy-${order.id}`,
        employee_id: order.employee_id,
        approved_amount: Number(order.mechanic_share ?? 0),
        work_orders: {
          id: order.id,
          work_date: order.work_date,
          company: order.company,
          unit: order.unit,
          invoice_number: order.invoice_number,
          labor_amount: Number(order.labor_amount),
        },
      }));
    }

    const payroll = (employees ?? []).map((employee) => {
      const employeeAssignments = assignments.filter((row) => row.employee_id === employee.id);
      const employeeDebtPayments = (debtPayments ?? []).filter((row) => row.debts?.employee_id === employee.id);
      const employeeDeductions = (deductions ?? []).filter((row) => row.employee_id === employee.id);

      const gross = employeeAssignments.reduce((sum, row) => sum + Number(row.approved_amount), 0);
      const debt = employeeDebtPayments.reduce((sum, row) => sum + Number(row.amount), 0);
      const manual = employeeDeductions.reduce((sum, row) => sum + Number(row.amount), 0);
      const net = Math.max(0, gross - debt - manual);

      return {
        employee_id: employee.id,
        employee_name: employee.full_name,
        gross,
        debt_deductions: debt,
        manual_deductions: manual,
        net_pay: net,
        jobs: employeeAssignments.map((row) => ({
          work_date: row.work_orders?.work_date,
          company: row.work_orders?.company,
          unit: row.work_orders?.unit,
          invoice_number: row.work_orders?.invoice_number,
          labor_amount: row.work_orders?.labor_amount,
          approved_amount: row.approved_amount,
        })),
      };
    });

    const totalToPay = payroll.reduce((sum, row) => sum + row.net_pay, 0);

    const payload = {
      generated_at: new Date().toISOString(),
      week,
      recipients: {
        email: EMAIL_RECIPIENT,
        whatsapp: WHATSAPP_RECIPIENTS,
      },
      totals: {
        total_to_pay: totalToPay,
      },
      payroll,
    };

    const [emailResult, whatsappResult] = await Promise.all([
      sendWebhook(process.env.REPORT_EMAIL_WEBHOOK_URL, {
        to: EMAIL_RECIPIENT,
        subject: `Reporte semanal ${week.start} - ${week.end}`,
        report: payload,
      }),
      sendWebhook(process.env.REPORT_WHATSAPP_WEBHOOK_URL, {
        recipients: WHATSAPP_RECIPIENTS,
        message: `Reporte semanal ${week.start} - ${week.end}`,
        report: payload,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      payload,
      delivery: {
        email: emailResult,
        whatsapp: whatsappResult,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
