import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf8');
  return content.split('\n').reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return acc;
    }

    const sep = trimmed.indexOf('=');
    if (sep === -1) {
      return acc;
    }

    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    acc[key] = value;
    return acc;
  }, {});
}

function weekEndingThursday(date = new Date()) {
  const ref = new Date(date);
  const day = ref.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  ref.setDate(ref.getDate() + daysUntilThursday);
  return ref.toISOString().slice(0, 10);
}

const rootDir = process.cwd();
const env = loadEnvFile(path.join(rootDir, '.env.local'));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de Supabase en .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const mechanics = [
  'Diosdel Valdivieso Medina',
  'Santiago Silverio',
  'Jose Mendez',
  'Pablo Gonzalez',
  'Geiler Rodriguez',
  'Jairo Parra',
];

const sampleRows = {
  'Santiago Silverio': [
    { unit: '#1020', company: 'Oil Change', labor: 120, invoice: 'ATR-1001', status: 'approved' },
    { unit: '#6402', company: 'Brake Labor', labor: 260, invoice: 'ATR-1007', status: 'approved' },
  ],
  'Diosdel Valdivieso Medina': [
    { unit: '#4055', company: 'Brake Labor', labor: 240, invoice: 'ATR-1002', status: 'approved' },
    { unit: '#5501', company: 'Wheel Seal', labor: 175, invoice: 'ATR-1008', status: 'approved' },
  ],
  'Jose Mendez': [
    { unit: '#8821', company: 'Wheel Seal', labor: 180, invoice: 'ATR-1003', status: 'approved' },
    { unit: '#9084', company: 'King Pin', labor: 430, invoice: 'ATR-1009', status: 'pending' },
  ],
  'Pablo Gonzalez': [
    { unit: '#3314', company: 'King Pin', labor: 450, invoice: 'ATR-1004', status: 'approved' },
    { unit: '#7712', company: 'Air Bag replacement', labor: 410, invoice: 'ATR-1010', status: 'pending' },
  ],
  'Geiler Rodriguez': [
    { unit: '#7190', company: 'Air Bag replacement', labor: 390, invoice: 'ATR-1005', status: 'approved' },
    { unit: '#6127', company: 'Oil Change', labor: 110, invoice: 'ATR-1011', status: 'pending' },
  ],
  'Jairo Parra': [
    { unit: '#2288', company: 'Oil Change', labor: 95, invoice: 'ATR-1006', status: 'approved' },
    { unit: '#4835', company: 'Brake Labor', labor: 225, invoice: 'ATR-1012', status: 'pending' },
  ],
};

const { data: employees, error: employeesError } = await supabase
  .from('employees')
  .select('id,full_name')
  .in('full_name', mechanics);

if (employeesError) {
  throw employeesError;
}

const employeeMap = new Map((employees ?? []).map((employee) => [employee.full_name, employee.id]));
const missingEmployees = mechanics.filter((name) => !employeeMap.get(name));
if (missingEmployees.length > 0) {
  throw new Error(`Faltan empleados para seed: ${missingEmployees.join(', ')}`);
}

let hasApprovalColumns = true;
const { error: approvalColumnsError } = await supabase
  .from('work_orders')
  .select('status,manager_labor_amount')
  .limit(1);

if (approvalColumnsError) {
  hasApprovalColumns = false;
}

const today = new Date();
const recentDates = [3, 2, 1, 0].map((offset) => {
  const date = new Date(today);
  date.setDate(today.getDate() - offset);
  return date.toISOString().slice(0, 10);
});

const allRows = [];
for (const [name, rows] of Object.entries(sampleRows)) {
  const employeeId = employeeMap.get(name);
  rows.forEach((row, index) => {
    const workDate = recentDates[index % recentDates.length];

    allRows.push({
      employee_id: employeeId,
      work_date: workDate,
      company: row.company,
      unit: row.unit,
      invoice_number: row.invoice,
      labor_amount: row.labor,
      ...(hasApprovalColumns
        ? {
            status: row.status,
            manager_labor_amount: row.labor,
          }
        : {}),
    });
  });
}

const dateMin = allRows.reduce((min, row) => (row.work_date < min ? row.work_date : min), '9999-12-31');
const dateMax = allRows.reduce((max, row) => (row.work_date > max ? row.work_date : max), '0000-01-01');

const { data: existingOrders, error: existingOrdersError } = await supabase
  .from('work_orders')
  .select('id,employee_id,work_date,company,unit,labor_amount')
  .gte('work_date', dateMin)
  .lte('work_date', dateMax);

if (existingOrdersError) {
  throw existingOrdersError;
}

const existingKeys = new Set(
  (existingOrders ?? []).map((row) => `${row.employee_id}|${row.work_date}|${row.company}|${row.unit}|${Number(row.labor_amount)}`),
);

const rowsToInsert = allRows.filter(
  (row) => !existingKeys.has(`${row.employee_id}|${row.work_date}|${row.company}|${row.unit}|${Number(row.labor_amount)}`),
);

let insertedOrders = [];
if (rowsToInsert.length > 0) {
  const { data, error } = await supabase
    .from('work_orders')
    .insert(rowsToInsert)
    .select('id,employee_id,labor_amount');

  if (error) {
    throw error;
  }
  insertedOrders = data ?? [];
}

let hasAssignmentsTable = true;
const { error: assignmentsCheckError } = await supabase
  .from('work_order_assignments')
  .select('id')
  .limit(1);

if (assignmentsCheckError) {
  hasAssignmentsTable = false;
}

if (hasAssignmentsTable && insertedOrders.length > 0) {
  const assignmentRows = insertedOrders.map((row) => ({
    work_order_id: row.id,
    employee_id: row.employee_id,
    assignment_mode: 'percent',
    percent_share: 50,
    approved_amount: Number((Number(row.labor_amount) * 0.5).toFixed(2)),
  }));

  const { error: assignmentInsertError } = await supabase
    .from('work_order_assignments')
    .insert(assignmentRows);

  if (assignmentInsertError) {
    throw assignmentInsertError;
  }
}

const debtTargets = [
  { name: 'Santiago Rodriguez', description: 'Adelanto de herramienta', weekly_installment: 25 },
  { name: 'Geiler Hernandez', description: 'Adelanto operativo', weekly_installment: 25 },
];

const weekEnding = weekEndingThursday();
let debtCreated = 0;

for (const target of debtTargets) {
  const employeeId = employeeMap.get(target.name);
  const { data: existingDebt } = await supabase
    .from('debts')
    .select('id,total_amount,remaining_balance,is_active')
    .eq('employee_id', employeeId)
    .eq('total_amount', 200)
    .eq('is_active', true)
    .maybeSingle();

  let debtId = existingDebt?.id;

  if (!debtId) {
    const { data: newDebt, error: debtInsertError } = await supabase
      .from('debts')
      .insert({
        employee_id: employeeId,
        total_amount: 200,
        description: target.description,
        weekly_installment: target.weekly_installment,
        remaining_balance: 200,
        is_active: true,
      })
      .select('id')
      .single();

    if (debtInsertError || !newDebt) {
      throw debtInsertError ?? new Error('No se pudo crear deuda');
    }

    debtId = newDebt.id;
    debtCreated += 1;
  }

  const { data: existingPayment } = await supabase
    .from('debt_payments')
    .select('id')
    .eq('debt_id', debtId)
    .eq('week_ending', weekEnding)
    .maybeSingle();

  if (!existingPayment) {
    const { error: paymentError } = await supabase
      .from('debt_payments')
      .insert({
        debt_id: debtId,
        week_ending: weekEnding,
        amount: 25,
      });

    if (paymentError) {
      throw paymentError;
    }

    const { error: debtUpdateError } = await supabase
      .from('debts')
      .update({ remaining_balance: 175 })
      .eq('id', debtId);

    if (debtUpdateError) {
      throw debtUpdateError;
    }
  }
}

console.log(`Seed real listo. Ordenes nuevas: ${insertedOrders.length}. Deudas creadas: ${debtCreated}. Assignments table: ${hasAssignmentsTable ? 'si' : 'no'}.`);
