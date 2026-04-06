# Taller Mecanico Arias

Proyecto base con Next.js (App Router) y TypeScript.

## Scripts

- npm run dev
- npm run build
- npm run start
- npm run lint

## Estado

- Scaffold inicial listo.
- Build validado.

## Supabase - Arquitectura DB

Se agrego la migracion SQL en `supabase/migrations/20260404_init_taller_mecanico_schema.sql` con:

- `employees`: ficha personal (nombre, telefono, correo, direccion, fecha contratacion, PIN, rol, notas).
- `work_orders`: produccion por mecanico con calculo automatico de `mechanic_share` al 50%.
- `debts`: deuda grande por empleado con cuota semanal fija y saldo pendiente.
- `debt_payments`: historial de descuentos semanales de deuda.
- `one_time_deductions`: deducciones unicas (warranty/advance/other).

### Cuotas semanales

La funcion SQL `process_weekly_debt_deductions(p_week_ending)`:

- descuenta una sola vez por semana cada deuda activa,
- usa `least(weekly_installment, remaining_balance)` para no pasar de cero,
- guarda el movimiento en `debt_payments`,
- actualiza `remaining_balance` y marca la deuda como pagada cuando llega a 0.

## Perfil del Empleado (Next.js + Tailwind)

Se creo la pagina `app/empleados/[id]/page.tsx` para mostrar:

- informacion personal del empleado,
- historial de trabajos (`work_orders`),
- resumen de labor total y 50% para mecanico,
- deudas pendientes y cuota semanal.

Configura estas variables para la consulta server-side:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
