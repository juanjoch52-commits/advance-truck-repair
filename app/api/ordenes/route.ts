import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, sanitizeDbError } from '@/lib/payrollApi';
import { computePayout } from '@/lib/money';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Db = Awaited<ReturnType<typeof requirePayrollAccess>>['supabase'];

// Lunes–domingo de la semana que contiene la fecha. Mismo cálculo que hacía el
// cliente (mediodía para evitar corrimientos de fecha al usar toISOString).
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

type OrderAssignment = { employee_id: string; commission_percentage: number };
type OrderTask = {
  description: string;
  amount_charged_to_client: number;
  sort_order: number;
  assignments: OrderAssignment[];
};
type OrderHeader = {
  external_order_number: string | null;
  truck_number: string;
  company: string;
  work_date: string;
  notes: string | null;
  client_id: string | null;
  location_id: string | null;
  truck_id: string | null;
};

// Texto opcional: cadena recortada o null si viene vacío.
function optText(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

// Valida y normaliza el body { report, tasks } de crear/editar orden.
function parseOrderPayload(body: any): { error: string } | { report: OrderHeader; tasks: OrderTask[] } {
  const rep = body?.report;
  if (!rep || typeof rep !== 'object') return { error: 'Datos inválidos' };

  const truckNumber = String(rep.truck_number ?? '').trim();
  const company = String(rep.company ?? '').trim();
  const workDate = String(rep.work_date ?? '').trim();
  if (!truckNumber || !company || !ISO_DATE.test(workDate)) {
    return { error: 'Camión, compañía y fecha son requeridos' };
  }

  const report: OrderHeader = {
    external_order_number: optText(rep.external_order_number),
    truck_number: truckNumber,
    company,
    work_date: workDate,
    notes: optText(rep.notes),
    client_id: optText(rep.client_id),
    location_id: optText(rep.location_id),
    truck_id: optText(rep.truck_id),
  };

  if (!Array.isArray(body?.tasks)) return { error: 'Datos inválidos' };
  const tasks: OrderTask[] = [];
  for (let i = 0; i < body.tasks.length; i++) {
    const raw = body.tasks[i];
    const description = String(raw?.description ?? '').trim();
    const amount = Number(raw?.amount_charged_to_client);
    if (!description || !Number.isFinite(amount)) return { error: `Tarea ${i + 1} inválida` };
    if (!Array.isArray(raw?.assignments)) return { error: `Tarea ${i + 1} inválida` };

    const assignments: OrderAssignment[] = [];
    for (const a of raw.assignments) {
      const employeeId = String(a?.employee_id ?? '').trim();
      const pct = Number(a?.commission_percentage);
      if (!employeeId || !Number.isFinite(pct)) {
        return { error: `Asignación de mecánico inválida en la tarea ${i + 1}` };
      }
      assignments.push({ employee_id: employeeId, commission_percentage: pct });
    }
    tasks.push({ description, amount_charged_to_client: amount, sort_order: i, assignments });
  }
  return { report, tasks };
}

// Rollback manual best-effort: si un insert falla a mitad, borra lo que ya se
// había insertado de esta orden para no dejar datos huérfanos.
async function rollbackOrder(supabase: Db, reportId: string, taskIds: string[]) {
  try {
    await supabase.from('earned_entries').delete().eq('work_report_id', reportId);
    if (taskIds.length > 0) {
      await supabase.from('task_assignments').delete().in('task_id', taskIds);
    }
    await supabase.from('report_tasks').delete().eq('report_id', reportId);
    await supabase.from('work_reports').delete().eq('id', reportId);
  } catch (err) {
    console.error('[ordenes.rollback] No se pudo revertir la orden', reportId, err);
  }
}

// GET /api/ordenes?start=&end=[&mechanic_id=] → listado de órdenes con sus
// tareas y asignaciones. Sin start/end devuelve TODO (vista global de la página).
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePayrollAccess();

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const mechanicId = (searchParams.get('mechanic_id') ?? '').trim();
    if ((start !== null || end !== null) && (!ISO_DATE.test(start ?? '') || !ISO_DATE.test(end ?? ''))) {
      return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
    }

    let query = supabase
      .from('work_reports')
      .select('id, external_order_number, truck_number, company, work_date, created_by_name, created_by_role')
      .order('work_date', { ascending: false });
    if (start && end) {
      query = query.gte('work_date', start).lte('work_date', end);
    }

    const { data: reports, error: repErr } = await query;
    if (repErr) return NextResponse.json({ error: sanitizeDbError('ordenes.GET', repErr.message) }, { status: 500 });
    if (!reports || reports.length === 0) {
      return NextResponse.json({ reports: [], tasks: [], assignments: [] });
    }

    const reportIds = reports.map((r: any) => r.id);
    const { data: tasks, error: taskErr } = await supabase
      .from('report_tasks')
      .select('id, report_id, amount_charged_to_client')
      .in('report_id', reportIds);
    if (taskErr) return NextResponse.json({ error: sanitizeDbError('ordenes.GET', taskErr.message) }, { status: 500 });

    const taskIds = (tasks ?? []).map((t: any) => t.id);
    let assignments: any[] = [];
    if (taskIds.length > 0) {
      let assignQuery = supabase
        .from('task_assignments')
        .select('task_id, employee_id, mechanic_payout')
        .in('task_id', taskIds);
      if (mechanicId) assignQuery = assignQuery.eq('employee_id', mechanicId);

      const { data: ass, error: assErr } = await assignQuery;
      if (assErr) return NextResponse.json({ error: sanitizeDbError('ordenes.GET', assErr.message) }, { status: 500 });
      assignments = ass ?? [];
    }

    return NextResponse.json({ reports, tasks: tasks ?? [], assignments });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// POST /api/ordenes → crear orden completa (reporte + tareas + asignaciones +
// earned_entries). La auditoría se estampa con la sesión del servidor: el
// cliente NUNCA envía created_by / created_by_name / created_by_role.
export async function POST(request: Request) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrderPayload(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { report, tasks } = parsed;
    const { start: weekStart, end: weekEnd } = getWeekRange(report.work_date);

    // 1) Insertar la orden (work_report) con auditoría de la sesión.
    const { data: created, error: reportErr } = await supabase
      .from('work_reports')
      .insert({
        external_order_number: report.external_order_number,
        truck_number: report.truck_number,
        company: report.company,
        work_date: report.work_date,
        notes: report.notes,
        client_id: report.client_id,
        location_id: report.location_id,
        truck_id: report.truck_id,
        created_by: session.id,
        created_by_name: session.full_name,
        created_by_role: session.role,
      })
      .select('id')
      .single();
    if (reportErr || !created) {
      return NextResponse.json(
        { error: sanitizeDbError('ordenes.POST', reportErr?.message ?? 'insert sin datos') },
        { status: 500 }
      );
    }

    const reportId = created.id as string;
    const insertedTaskIds: string[] = [];

    // 2) Tareas + asignaciones + earned_entries (misma secuencia que hacía el
    // cliente; el payout se recalcula SIEMPRE en el servidor con computePayout).
    for (const task of tasks) {
      const { data: dbTask, error: taskErr } = await supabase
        .from('report_tasks')
        .insert({
          report_id: reportId,
          description: task.description,
          amount_charged_to_client: task.amount_charged_to_client,
          sort_order: task.sort_order,
        })
        .select('id')
        .single();
      if (taskErr || !dbTask) {
        await rollbackOrder(supabase, reportId, insertedTaskIds);
        return NextResponse.json(
          { error: sanitizeDbError('ordenes.POST', taskErr?.message ?? 'insert sin datos') },
          { status: 500 }
        );
      }
      insertedTaskIds.push(dbTask.id as string);

      for (const m of task.assignments) {
        const payout = computePayout(task.amount_charged_to_client, m.commission_percentage);

        const { data: assignment, error: assignErr } = await supabase
          .from('task_assignments')
          .insert({
            task_id: dbTask.id,
            employee_id: m.employee_id,
            commission_percentage: m.commission_percentage,
            mechanic_payout: payout,
          })
          .select('id')
          .single();
        if (assignErr || !assignment) {
          await rollbackOrder(supabase, reportId, insertedTaskIds);
          return NextResponse.json(
            { error: sanitizeDbError('ordenes.POST', assignErr?.message ?? 'insert sin datos') },
            { status: 500 }
          );
        }

        const { error: earnedErr } = await supabase.from('earned_entries').insert({
          task_assignment_id: assignment.id,
          work_report_id: reportId,
          employee_id: m.employee_id,
          amount: payout,
          work_date: report.work_date,
          truck_number: report.truck_number,
          mechanic_role: 'mechanic',
          entry_type: 'mechanic',
          description: task.description,
          week_start: weekStart,
          week_end: weekEnd,
        });
        if (earnedErr) {
          await rollbackOrder(supabase, reportId, insertedTaskIds);
          return NextResponse.json(
            { error: sanitizeDbError('ordenes.POST', earnedErr.message) },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, id: reportId });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
