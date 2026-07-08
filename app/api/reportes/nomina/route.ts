import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, requireOwnerAccess, sanitizeDbError } from '@/lib/payrollApi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tipos de entrada de nómina. Las comisiones de mecánicos ('mechanic') las
// puede ver el admin; las entradas admin_* derivan de salarios administrativos
// y son SOLO para owner/super_user.
const MECH_ENTRY_TYPES = ['mechanic'];
const ADMIN_ENTRY_TYPES = ['admin_fixed', 'admin_hourly', 'admin_manual'];

const TIPOS_REPORTE = ['semanal', 'mensual', 'anual'];
const PDF_LANGS = ['es', 'en'];

// Datos crudos para los PDFs de nómina de la página /reportes.
// OJO: middleware.ts deja pasar /api/reportes/* sin cookie, así que el
// requireRole dentro de cada método es la ÚNICA barrera de acceso.
//   scope='mechanic'      → owner/admin/super_user (requirePayrollAccess).
//   scope='admin' | 'all' → SOLO owner/super_user (requireOwnerAccess):
//                           incluye nómina administrativa que admin no ve.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde') ?? '';
    const hasta = searchParams.get('hasta') ?? '';
    const scope = searchParams.get('scope') ?? '';
    const employeeId = (searchParams.get('employee_id') ?? '').trim();

    if (!ISO_DATE.test(desde) || !ISO_DATE.test(hasta)) {
      return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
    }
    if (scope !== 'mechanic' && scope !== 'admin' && scope !== 'all') {
      return NextResponse.json({ error: 'Alcance inválido' }, { status: 400 });
    }

    // La barrera de rol: nómina administrativa exige sesión privilegiada.
    const { supabase } =
      scope === 'mechanic' ? await requirePayrollAccess() : await requireOwnerAccess();

    // ── Modo empleado individual (comprobante de pago) ────────────────────
    if (employeeId) {
      if (scope === 'all') {
        return NextResponse.json({ error: 'Alcance inválido para un empleado' }, { status: 400 });
      }
      const isMech = scope === 'mechanic';

      // Mismas columnas/joins que usaba la página para el comprobante.
      const entrySelect = isMech
        ? `id, amount, work_date, truck_number, description,
           work_reports!earned_entries_work_report_id_fkey(company, external_order_number)`
        : 'id, amount, work_date, hours_worked, description';

      const [entriesRes, debtRes] = await Promise.all([
        supabase
          .from('earned_entries')
          .select(entrySelect)
          .gte('work_date', desde)
          .lte('work_date', hasta)
          .eq('employee_id', employeeId)
          .in('entry_type', isMech ? MECH_ENTRY_TYPES : ADMIN_ENTRY_TYPES)
          .order('work_date', { ascending: true }),
        // Deducciones (abonos a deudas) del empleado en el periodo.
        supabase
          .from('debt_payments')
          .select('amount, week_ending, debts!inner(employee_id, description)')
          .gte('week_ending', desde)
          .lte('week_ending', hasta)
          .eq('debts.employee_id', employeeId),
      ]);

      if (entriesRes.error) {
        return NextResponse.json({ error: sanitizeDbError('reportes-nomina', entriesRes.error.message) }, { status: 500 });
      }
      if (debtRes.error) {
        return NextResponse.json({ error: sanitizeDbError('reportes-nomina', debtRes.error.message) }, { status: 500 });
      }

      return NextResponse.json({
        entries: entriesRes.data ?? [],
        deductions: debtRes.data ?? [],
      });
    }

    // ── Modo general (todos los empleados por tipo) ───────────────────────
    let mechEntries: unknown[] = [];
    if (scope === 'mechanic' || scope === 'all') {
      const { data, error } = await supabase
        .from('earned_entries')
        .select(`id, amount, work_date, truck_number, description,
          employees!earned_entries_employee_id_fkey(full_name),
          work_reports!earned_entries_work_report_id_fkey(company, external_order_number)`)
        .gte('work_date', desde)
        .lte('work_date', hasta)
        .in('entry_type', MECH_ENTRY_TYPES)
        .order('work_date', { ascending: true });
      if (error) {
        return NextResponse.json({ error: sanitizeDbError('reportes-nomina', error.message) }, { status: 500 });
      }
      mechEntries = data ?? [];
    }

    let adminEntries: unknown[] = [];
    if (scope === 'admin' || scope === 'all') {
      const { data, error } = await supabase
        .from('earned_entries')
        .select(`id, amount, work_date, hours_worked, description,
          employees!earned_entries_employee_id_fkey(full_name)`)
        .gte('work_date', desde)
        .lte('work_date', hasta)
        .in('entry_type', ADMIN_ENTRY_TYPES)
        .order('work_date', { ascending: true });
      if (error) {
        return NextResponse.json({ error: sanitizeDbError('reportes-nomina', error.message) }, { status: 500 });
      }
      adminEntries = data ?? [];
    }

    return NextResponse.json({ mechEntries, adminEntries });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// Auditoría de generación de PDF. Quién generó (generated_by / _name) se
// estampa con la sesión del SERVIDOR: se ignora lo que mande el cliente.
export async function POST(request: Request) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const body = await request.json().catch(() => ({}));

    const tipo = String(body.tipo ?? '').trim();
    const fechaDesde = String(body.fecha_desde ?? '').trim();
    const fechaHasta = String(body.fecha_hasta ?? '').trim();
    const pdfLanguage = String(body.pdf_language ?? '').trim();

    if (!TIPOS_REPORTE.includes(tipo) || !ISO_DATE.test(fechaDesde) || !ISO_DATE.test(fechaHasta)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    if (!PDF_LANGS.includes(pdfLanguage)) {
      return NextResponse.json({ error: 'Idioma inválido' }, { status: 400 });
    }

    const { error } = await supabase.from('report_logs').insert({
      generated_by: session.id,
      generated_by_name: session.full_name,
      tipo,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      pdf_language: pdfLanguage,
    });

    if (error) {
      return NextResponse.json({ error: sanitizeDbError('reportes-nomina', error.message) }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
