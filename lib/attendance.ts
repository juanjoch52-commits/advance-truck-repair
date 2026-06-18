import { roundMoney } from '@/lib/money';

// Días de la semana como índices 0..6 (0=Domingo .. 6=Sábado), igual que
// Date.getDay() y que employees.work_days en la BD.
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Días laborales por defecto: Lunes a Sábado.
export const DEFAULT_WORK_DAYS: number[] = [1, 2, 3, 4, 5, 6];

/** Las 7 fechas (ISO yyyy-mm-dd) de la semana, dado el domingo de inicio. */
export function weekDates(weekStartISO: string): { iso: string; dow: number }[] {
  const base = new Date(weekStartISO + 'T12:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return { iso: d.toISOString().split('T')[0], dow: d.getDay() };
  });
}

/** Normaliza work_days (puede venir null/desordenado) a un set de índices 0..6. */
export function normalizeWorkDays(workDays: unknown): number[] {
  const arr = Array.isArray(workDays) ? workDays : DEFAULT_WORK_DAYS;
  const set = new Set(arr.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6));
  return Array.from(set).sort((a, b) => a - b);
}

/** Tarifa diaria = salario semanal ÷ nº de días laborales (para mostrar). */
export function dailyRate(weeklySalary: number, workDaysCount: number): number {
  if (!workDaysCount) return 0;
  return roundMoney((Number(weeklySalary) || 0) / workDaysCount);
}

/**
 * Pago de la semana según asistencia.
 *   presentes = nº días laborales − faltas
 *   pago = salario_semanal × presentes / nº_días_laborales  (una sola división,
 *          un solo redondeo → cuando no hay faltas paga el salario exacto)
 */
export function computeWeekPay(weeklySalary: number, workDaysCount: number, absenceCount: number): number {
  if (!workDaysCount) return 0;
  const present = Math.max(0, workDaysCount - Math.max(0, absenceCount));
  return roundMoney((Number(weeklySalary) || 0) * present / workDaysCount);
}
