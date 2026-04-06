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
  { full_name: 'Diosdel Valdivieso', phone: null, access_pin: '1111', hire_date: '2024-01-01', notes: 'Mecánico inicial del taller.', role: 'mechanic' },
  { full_name: 'Jose Mendez', phone: null, access_pin: '2222', hire_date: '2024-01-01', notes: 'Mecánico inicial del taller.', role: 'mechanic' },
  { full_name: 'Santiago Rodriguez', phone: null, access_pin: '3333', hire_date: '2024-01-01', notes: 'Mecánico inicial del taller.', role: 'mechanic' },
  { full_name: 'Pablo Sanchez', phone: null, access_pin: '4444', hire_date: '2024-01-01', notes: 'Mecánico inicial del taller.', role: 'mechanic' },
  { full_name: 'Geiler Hernandez', phone: null, access_pin: '5555', hire_date: '2024-01-01', notes: 'Mecánico inicial del taller.', role: 'mechanic' },
  { full_name: 'Jairo Parra', phone: null, access_pin: '6666', hire_date: '2024-01-01', notes: 'Mecánico inicial del taller.', role: 'mechanic' },
  { full_name: 'Ana', phone: null, access_pin: '7777', hire_date: '2024-01-01', notes: 'Administración del taller.', role: 'admin' },
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
