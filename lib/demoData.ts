type DemoRole = 'owner' | 'SUPER_USER' | 'admin' | 'mechanic';

export type DemoEmployee = {
  id: string;
  full_name: string;
  phone: string | null;
  hire_date: string;
  role: DemoRole;
  notes: string | null;
  function_real: string;
};

export type DemoWorkOrder = {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  manager_labor_amount: number;
  mechanic_share: number;
  status: 'approved' | 'pending';
  created_at: string;
};

const OFFICIAL_EMPLOYEES: DemoEmployee[] = [
  {
    id: 'owner-arias',
    full_name: 'Arias',
    phone: null,
    hire_date: '2024-01-01',
    role: 'owner',
    notes: 'Dueño del taller.',
    function_real: 'Dueño del Taller',
  },
  {
    id: 'super-juan-chavez-medina',
    full_name: 'Juan Chavez Medina',
    phone: null,
    hire_date: '2024-01-01',
    role: 'SUPER_USER',
    notes: 'Administrador del sistema / Tech.',
    function_real: 'Administrador del Sistema / Tech',
  },
  {
    id: 'admin-ana-g-garcia-de-torrealba',
    full_name: 'Ana G. Garcia de Torrealba',
    phone: null,
    hire_date: '2024-01-01',
    role: 'admin',
    notes: 'Administración principal.',
    function_real: 'Administración Principal',
  },
  {
    id: 'admin-carmen',
    full_name: 'Carmen',
    phone: null,
    hire_date: '2024-01-01',
    role: 'admin',
    notes: 'Oficina / Pagos.',
    function_real: 'Oficina / Pagos',
  },
  {
    id: 'admin-kenia',
    full_name: 'Kenia',
    phone: null,
    hire_date: '2024-01-01',
    role: 'admin',
    notes: 'Oficina / Pagos.',
    function_real: 'Oficina / Pagos',
  },
  {
    id: 'mech-diosdel-valdivieso-medina',
    full_name: 'Diosdel Valdivieso Medina',
    phone: null,
    hire_date: '2024-01-01',
    role: 'mechanic',
    notes: 'Mecánico.',
    function_real: 'Mecánico',
  },
  {
    id: 'mech-santiago-silverio',
    full_name: 'Santiago Silverio',
    phone: null,
    hire_date: '2024-01-01',
    role: 'mechanic',
    notes: 'Mecánico.',
    function_real: 'Mecánico',
  },
  {
    id: 'mech-jose-mendez',
    full_name: 'Jose Mendez',
    phone: null,
    hire_date: '2024-01-01',
    role: 'mechanic',
    notes: 'Mecánico.',
    function_real: 'Mecánico',
  },
  {
    id: 'mech-pablo-gonzalez',
    full_name: 'Pablo Gonzalez',
    phone: null,
    hire_date: '2024-01-01',
    role: 'mechanic',
    notes: 'Mecánico.',
    function_real: 'Mecánico',
  },
  {
    id: 'mech-geiler-rodriguez',
    full_name: 'Geiler Rodriguez',
    phone: null,
    hire_date: '2024-01-01',
    role: 'mechanic',
    notes: 'Mecánico.',
    function_real: 'Mecánico',
  },
  {
    id: 'mech-jairo-parra',
    full_name: 'Jairo Parra',
    phone: null,
    hire_date: '2024-01-01',
    role: 'mechanic',
    notes: 'Mecánico.',
    function_real: 'Mecánico',
  },
];

function getRecentDates() {
  const end = new Date();
  end.setHours(12, 0, 0, 0);

  return [3, 2, 1, 0].map((offset) => {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);
    return date.toISOString().slice(0, 10);
  });
}

export function getDemoEmployees() {
  return OFFICIAL_EMPLOYEES.map((employee) => ({ ...employee }));
}

export function findDemoEmployeeById(id: string) {
  return OFFICIAL_EMPLOYEES.find((employee) => employee.id === id) ?? null;
}

export function getDemoWorkOrders() {
  const dates = getRecentDates();
  const byName = new Map(OFFICIAL_EMPLOYEES.map((employee) => [employee.full_name, employee]));

  const rawOrders = [
    ['Santiago Silverio', 'Oil Change', '#1020', 120, 'approved', dates[0]],
    ['Diosdel Valdivieso Medina', 'Brake Labor', '#4055', 240, 'approved', dates[0]],
    ['Jose Mendez', 'Wheel Seal', '#8821', 180, 'approved', dates[1]],
    ['Pablo Gonzalez', 'King Pin', '#3314', 450, 'approved', dates[1]],
    ['Geiler Rodriguez', 'Air Bag replacement', '#7190', 390, 'approved', dates[2]],
    ['Jairo Parra', 'Oil Change', '#2288', 95, 'approved', dates[2]],
    ['Santiago Silverio', 'Brake Labor', '#6402', 260, 'approved', dates[3]],
    ['Diosdel Valdivieso Medina', 'Wheel Seal', '#5501', 175, 'approved', dates[3]],
    ['Jose Mendez', 'King Pin', '#9084', 430, 'pending', dates[0]],
    ['Pablo Gonzalez', 'Air Bag replacement', '#7712', 410, 'pending', dates[1]],
    ['Geiler Rodriguez', 'Oil Change', '#6127', 110, 'pending', dates[2]],
    ['Jairo Parra', 'Brake Labor', '#4835', 225, 'pending', dates[3]],
  ] as const;

  return rawOrders.map(([employeeName, service, unit, labor, status, workDate], index) => {
    const employee = byName.get(employeeName);
    if (!employee) {
      throw new Error(`Empleado demo no encontrado: ${employeeName}`);
    }

    return {
      id: `demo-wo-${index + 1}`,
      employee_id: employee.id,
      employee_name: employeeName,
      work_date: workDate,
      company: service,
      unit,
      invoice_number: `ATR-${1001 + index}`,
      labor_amount: labor,
      manager_labor_amount: labor,
      mechanic_share: Number((labor * 0.5).toFixed(2)),
      status,
      created_at: `${workDate}T12:00:00.000Z`,
    } satisfies DemoWorkOrder;
  });
}
