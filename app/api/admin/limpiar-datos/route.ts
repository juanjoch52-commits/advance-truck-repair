import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/authSession';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST() {
  const session = await getServerSession();

  if (!session?.is_super_user) {
    return NextResponse.json({ error: 'Acceso restringido: se requiere Super-Usuario.' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServerClient();

    // Delete dependents first (FK constraints), then parents
    const steps: Array<{ table: string; label: string }> = [
      { table: 'debt_payments', label: 'pagos de deuda' },
      { table: 'one_time_deductions', label: 'deducciones únicas' },
      { table: 'debts', label: 'deudas' },
      { table: 'work_order_assignments', label: 'asignaciones' },
      { table: 'work_orders', label: 'órdenes de trabajo' },
    ];

    for (const step of steps) {
      const { error } = await supabase
        .from(step.table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // matches all rows

      if (error) {
        return NextResponse.json(
          { error: `Error al limpiar ${step.label}: ${error.message}` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
