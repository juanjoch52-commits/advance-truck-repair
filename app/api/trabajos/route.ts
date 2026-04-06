import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDemoWorkOrders } from '@/lib/demoData';

type CreateWorkOrderBody = {
  employee_id: string;
  secondary_employee_id?: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number?: string;
  labor_amount: number;
};

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase no configurado');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeInvoiceNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function uploadEvidencePhoto(
  supabase: ReturnType<typeof createSupabaseClient>,
  file: File,
  workDate: string,
  folder: 'paperwork' | 'part',
) {
  const fileExt = file.type.includes('png') ? 'png' : 'jpg';
  const safeDate = workDate.replace(/[^0-9-]/g, '');
  const path = `${safeDate}/${folder}-${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('work-evidence')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`storage_${folder}: ${error.message}`);
  }

  const { data } = supabase.storage.from('work-evidence').getPublicUrl(path);
  return data.publicUrl;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'pending';
    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('work_orders')
      .select('id,employee_id,work_date,company,unit,invoice_number,labor_amount,manager_labor_amount,status,paperwork_path,part_photo_path,created_at,work_order_assignments(id,employee_id,assignment_mode,percent_share,manual_amount,approved_amount,employees(full_name))')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (!error && (data?.length ?? 0) > 0) {
      return NextResponse.json({ work_orders: data ?? [] });
    }

    if (error && error.code !== 'PGRST205') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const demoRows = getDemoWorkOrders()
      .filter((row) => row.status === status)
      .map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        work_date: row.work_date,
        company: row.company,
        unit: row.unit,
        invoice_number: row.invoice_number,
        labor_amount: row.labor_amount,
        manager_labor_amount: row.manager_labor_amount,
        status: row.status,
        paperwork_path: null,
        part_photo_path: null,
        created_at: row.created_at,
        work_order_assignments: [
          {
            id: `${row.id}-assignment`,
            employee_id: row.employee_id,
            assignment_mode: 'percent',
            percent_share: 50,
            manual_amount: null,
            approved_amount: row.mechanic_share,
            employees: { full_name: row.employee_name },
          },
        ],
      }));

    return NextResponse.json({ work_orders: demoRows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseClient();
    const contentType = request.headers.get('content-type') ?? '';

    let payload: CreateWorkOrderBody;
    let paperworkPhoto: File | null = null;
    let partPhoto: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      payload = {
        employee_id: String(formData.get('employee_id') ?? ''),
        secondary_employee_id: String(formData.get('secondary_employee_id') ?? ''),
        work_date: String(formData.get('work_date') ?? ''),
        company: String(formData.get('company') ?? ''),
        unit: String(formData.get('unit') ?? ''),
        invoice_number: normalizeInvoiceNumber(formData.get('invoice_number')) ?? undefined,
        labor_amount: Number(formData.get('labor_amount') ?? 0),
      };
      paperworkPhoto = formData.get('paperwork_photo') instanceof File ? (formData.get('paperwork_photo') as File) : null;
      partPhoto = formData.get('part_photo') instanceof File ? (formData.get('part_photo') as File) : null;
    } else {
      payload = await request.json() as CreateWorkOrderBody;
    }

    const { employee_id, secondary_employee_id, work_date, company, unit, invoice_number, labor_amount } = payload;

    if (!employee_id || !work_date || !company || !unit || labor_amount == null) {
      return NextResponse.json({ error: 'Empleado, fecha, compañía, unidad y monto son requeridos' }, { status: 400 });
    }

    if (labor_amount < 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor o igual a cero' }, { status: 400 });
    }

    if (secondary_employee_id && secondary_employee_id === employee_id) {
      return NextResponse.json({ error: 'El segundo mecánico debe ser diferente al primero' }, { status: 400 });
    }

    if (!paperworkPhoto || !partPhoto) {
      return NextResponse.json({ error: 'Debes subir 2 fotos: paperwork y pieza reparada' }, { status: 400 });
    }

    const paperworkUrl = await uploadEvidencePhoto(supabase, paperworkPhoto, work_date, 'paperwork');
    const partPhotoUrl = await uploadEvidencePhoto(supabase, partPhoto, work_date, 'part');

    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        employee_id,
        work_date,
        company,
        unit,
        invoice_number: invoice_number ?? null,
        labor_amount,
        status: 'pending',
        paperwork_path: paperworkUrl,
        part_photo_path: partPhotoUrl,
      })
      .select('id,labor_amount,status')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: `work_orders_insert: ${error?.message ?? 'No se pudo crear la orden'}` }, { status: 500 });
    }

    const assignments = secondary_employee_id
      ? [
          {
            work_order_id: data.id,
            employee_id,
            assignment_mode: 'percent',
            percent_share: 25,
            approved_amount: 0,
          },
          {
            work_order_id: data.id,
            employee_id: secondary_employee_id,
            assignment_mode: 'percent',
            percent_share: 25,
            approved_amount: 0,
          },
        ]
      : [
          {
            work_order_id: data.id,
            employee_id,
            assignment_mode: 'percent',
            percent_share: 50,
            approved_amount: 0,
          },
        ];

    const { error: assignmentsError } = await supabase.from('work_order_assignments').insert(assignments);

    if (assignmentsError) {
      return NextResponse.json({ error: `assignments_insert: ${assignmentsError.message}` }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        work_order: {
          id: data.id,
          status: data.status,
          labor_amount: data.labor_amount,
          assignments,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
