import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, sanitizeDbError } from '@/lib/payrollApi';
import { computePayout } from '@/lib/money';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
// (Mismo contrato que POST /api/ordenes.)
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

// GET /api/ordenes/[id] → detalle completo de una orden: encabezado + tareas +
// asignaciones + empleados (id, full_name) para resolver nombres en el cliente.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePayrollAccess();
    const { id } = await params;

    const { data: report, error: repErr } = await supabase
      .from('work_reports')
      .select('id, external_order_number, truck_number, company, work_date, notes, created_at, created_by, created_by_name, created_by_role, client_id, location_id, truck_id')
      .eq('id', id)
      .maybeSingle();
    if (repErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].GET', repErr.message) }, { status: 500 });
    if (!report) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    const { data: tasks, error: taskErr } = await supabase
      .from('report_tasks')
      .select('id, description, amount_charged_to_client, sort_order')
      .eq('report_id', id)
      .order('sort_order', { ascending: true });
    if (taskErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].GET', taskErr.message) }, { status: 500 });

    const taskIds = (tasks ?? []).map((t: any) => t.id);
    let assignments: any[] = [];
    if (taskIds.length > 0) {
      const { data: ass, error: assErr } = await supabase
        .from('task_assignments')
        .select('id, task_id, employee_id, commission_percentage, mechanic_payout')
        .in('task_id', taskIds);
      if (assErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].GET', assErr.message) }, { status: 500 });
      assignments = ass ?? [];
    }

    // Empleados a resolver: los asignados + el creador (para el fallback de
    // auditoría cuando la orden no tiene el nombre "congelado").
    const employeeIds = new Set<string>(assignments.map((a: any) => String(a.employee_id)));
    const needsCreatorLookup = !report.created_by_name && !!report.created_by;
    if (needsCreatorLookup) employeeIds.add(String(report.created_by));

    let employees: any[] = [];
    if (employeeIds.size > 0) {
      const { data: emps, error: empErr } = await supabase
        .from('employees')
        .select('id, full_name, role')
        .in('id', Array.from(employeeIds));
      if (empErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].GET', empErr.message) }, { status: 500 });
      employees = emps ?? [];
    }

    // Fallback del creador (antes lo hacía el modal en el navegador): si la
    // orden no guardó el nombre pero sí el id, se resuelve desde employees.
    if (needsCreatorLookup) {
      const creator = employees.find((e: any) => e.id === report.created_by);
      if (creator) {
        (report as any).created_by_name = creator.full_name ?? null;
        (report as any).created_by_role = report.created_by_role ?? creator.role ?? null;
      }
    }

    return NextResponse.json({
      report,
      tasks: tasks ?? [],
      assignments,
      employees: employees.map((e: any) => ({ id: e.id, full_name: e.full_name })),
    });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// PUT /api/ordenes/[id] → edición completa: actualiza el encabezado y
// reemplaza TODAS las filas hijas (tareas / asignaciones / earned_entries),
// misma estrategia borrar-y-reinsertar que hacía la página de edición.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePayrollAccess();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = parseOrderPayload(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { report, tasks } = parsed;
    const { start: weekStart, end: weekEnd } = getWeekRange(report.work_date);

    // 1) Actualizar encabezado (la auditoría de creación NO se toca).
    const { data: existing, error: updErr } = await supabase
      .from('work_reports')
      .update({
        external_order_number: report.external_order_number,
        truck_number: report.truck_number,
        company: report.company,
        work_date: report.work_date,
        notes: report.notes,
        client_id: report.client_id,
        location_id: report.location_id,
        truck_id: report.truck_id,
      })
      .eq('id', id)
      .select('id');
    if (updErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].PUT', updErr.message) }, { status: 500 });
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    // 2) Ids de tareas actuales para limpiar sus asignaciones.
    const { data: oldTasks, error: oldErr } = await supabase
      .from('report_tasks')
      .select('id')
      .eq('report_id', id);
    if (oldErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].PUT', oldErr.message) }, { status: 500 });
    const oldTaskIds = (oldTasks ?? []).map((t: any) => t.id);

    // 3) Borrar earned_entries primero (FK a work_report_id).
    const { error: delEarnedErr } = await supabase.from('earned_entries').delete().eq('work_report_id', id);
    if (delEarnedErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].PUT', delEarnedErr.message) }, { status: 500 });

    // 4) Borrar asignaciones de esas tareas.
    if (oldTaskIds.length > 0) {
      const { error: delAssErr } = await supabase.from('task_assignments').delete().in('task_id', oldTaskIds);
      if (delAssErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].PUT', delAssErr.message) }, { status: 500 });
    }

    // 5) Borrar tareas viejas.
    const { error: delTasksErr } = await supabase.from('report_tasks').delete().eq('report_id', id);
    if (delTasksErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].PUT', delTasksErr.message) }, { status: 500 });

    // 6) Recrear tareas / asignaciones / earned_entries (payout recalculado
    // SIEMPRE en el servidor con computePayout).
    for (const task of tasks) {
      const { data: dbTask, error: taskErr } = await supabase
        .from('report_tasks')
        .insert({
          report_id: id,
          description: task.description,
          amount_charged_to_client: task.amount_charged_to_client,
          sort_order: task.sort_order,
        })
        .select('id')
        .single();
      if (taskErr || !dbTask) {
        return NextResponse.json(
          { error: sanitizeDbError('ordenes/[id].PUT', taskErr?.message ?? 'insert sin datos') },
          { status: 500 }
        );
      }

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
          return NextResponse.json(
            { error: sanitizeDbError('ordenes/[id].PUT', assignErr?.message ?? 'insert sin datos') },
            { status: 500 }
          );
        }

        const { error: earnedErr } = await supabase.from('earned_entries').insert({
          task_assignment_id: assignment.id,
          work_report_id: id,
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
          return NextResponse.json({ error: sanitizeDbError('ordenes/[id].PUT', earnedErr.message) }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// DELETE /api/ordenes/[id] → borrado en cascada manual, en el mismo orden que
// hacía la página: earned_entries → task_assignments → report_tasks → work_report.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePayrollAccess();
    const { id } = await params;

    // 1) Ids de tareas del reporte.
    const { data: tasks, error: taskErr } = await supabase
      .from('report_tasks')
      .select('id')
      .eq('report_id', id);
    if (taskErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].DELETE', taskErr.message) }, { status: 500 });
    const taskIds = (tasks ?? []).map((t: any) => t.id);

    // 2) earned_entries de este reporte.
    const { error: earnedErr } = await supabase.from('earned_entries').delete().eq('work_report_id', id);
    if (earnedErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].DELETE', earnedErr.message) }, { status: 500 });

    // 3) Asignaciones de esas tareas.
    if (taskIds.length > 0) {
      const { error: assErr } = await supabase.from('task_assignments').delete().in('task_id', taskIds);
      if (assErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].DELETE', assErr.message) }, { status: 500 });
    }

    // 4) Tareas del reporte.
    const { error: delTasksErr } = await supabase.from('report_tasks').delete().eq('report_id', id);
    if (delTasksErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].DELETE', delTasksErr.message) }, { status: 500 });

    // 5) El reporte.
    const { error: delRepErr } = await supabase.from('work_reports').delete().eq('id', id);
    if (delRepErr) return NextResponse.json({ error: sanitizeDbError('ordenes/[id].DELETE', delRepErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
