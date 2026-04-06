import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf8');
  return content.split('\n').reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return env;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return env;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    env[key] = value;
    return env;
  }, {});
}

const rootDir = process.cwd();
const env = loadEnvFile(path.join(rootDir, '.env.local'));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan las variables NEXT_PUBLIC_SUPABASE_URL y una key de Supabase en .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const employees = [
  { full_name: 'Juan Chavez Medina', phone: null, access_pin: '2026', hire_date: '2024-01-01', notes: 'Administrador del Sistema / Tech.', role: 'SUPER_USER' },
  { full_name: 'Ana G. Garcia de Torrealba', phone: null, access_pin: '3001', hire_date: '2024-01-01', notes: 'Administración Principal.', role: 'admin' },
  { full_name: 'Carmen', phone: null, access_pin: '3002', hire_date: '2024-01-01', notes: 'Oficina / Pagos.', role: 'admin' },
  { full_name: 'Kenia', phone: null, access_pin: '3003', hire_date: '2024-01-01', notes: 'Oficina / Pagos.', role: 'admin' },
  { full_name: 'Diosdel Valdivieso Medina', phone: null, access_pin: '1101', hire_date: '2024-01-01', notes: 'Mecánico.', role: 'mechanic' },
  { full_name: 'Santiago Silverio', phone: null, access_pin: '1102', hire_date: '2024-01-01', notes: 'Mecánico.', role: 'mechanic' },
  { full_name: 'Jose Mendez', phone: null, access_pin: '1103', hire_date: '2024-01-01', notes: 'Mecánico.', role: 'mechanic' },
  { full_name: 'Pablo Gonzalez', phone: null, access_pin: '1104', hire_date: '2024-01-01', notes: 'Mecánico.', role: 'mechanic' },
  { full_name: 'Geiler Rodriguez', phone: null, access_pin: '1105', hire_date: '2024-01-01', notes: 'Mecánico.', role: 'mechanic' },
  { full_name: 'Jairo Parra', phone: null, access_pin: '1106', hire_date: '2024-01-01', notes: 'Mecánico.', role: 'mechanic' },
];

const names = employees.map((employee) => employee.full_name);
const { data: existing, error: existingError } = await supabase
  .from('employees')
  .select('full_name')
  .in('full_name', names);

if (existingError) {
  throw existingError;
}

const existingNames = new Set((existing ?? []).map((employee) => employee.full_name));
const missingEmployees = employees.filter((employee) => !existingNames.has(employee.full_name));

if (missingEmployees.length === 0) {
  console.log('Todos los empleados iniciales ya existen.');
  process.exit(0);
}

const { error: insertError } = await supabase.from('employees').insert(missingEmployees);

if (insertError) {
  throw insertError;
}

console.log(`Seed completado. Insertados ${missingEmployees.length} empleados.`);
