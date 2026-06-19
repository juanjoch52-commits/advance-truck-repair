-- Numeración de factura por FECHA: AAAAMMDD-N-CC
--   AAAAMMDD = fecha de la factura
--   N        = consecutivo del DÍA para ese taller (reinicia cada día)
--   CC       = código del negocio (01 = papá / Taller 1, 02 = hijo / Taller 2)
-- El código de negocio queda al final (como lo pidió el dueño). Ej: 20260618-1-01.
--
-- Regla: si el taller tiene business_code → usa este formato (con prefijo opcional
-- de letras delante). Si NO tiene business_code → mantiene el esquema viejo
-- (prefijo + correlativo corrido), por compatibilidad.
--
-- Consecutivo diario ATÓMICO: se lleva en la propia fila del taller (daily_date +
-- daily_seq). El UPDATE ... RETURNING toma lock de fila, así que dos facturas
-- simultáneas del mismo taller el mismo día no pueden tomar el mismo número.
-- NOTA fiscal: papá e hijo son DOS negocios separados (cada uno su EIN y libros);
-- el código 01/02 es solo etiqueta. El CPA debe validar el formato.

alter table public.shops
  add column if not exists business_code text,
  add column if not exists daily_date date,
  add column if not exists daily_seq integer not null default 0;

-- Reemplaza la función: ahora recibe la FECHA de la factura (default hoy) y
-- decide el formato según haya o no business_code.
drop function if exists public.next_shop_invoice_number(uuid);

create or replace function public.next_shop_invoice_number(p_shop_id uuid, p_date date default current_date)
returns text
language plpgsql
as $$
declare
  v_seq        integer;
  v_code       text;
  v_prefix     text;
  v_legacy_num integer;
begin
  update public.shops
     set daily_seq = case when daily_date is distinct from p_date then 1 else daily_seq + 1 end,
         daily_date = p_date,
         next_invoice_number = next_invoice_number + 1,
         updated_at = now()
   where id = p_shop_id
   returning daily_seq, business_code, invoice_prefix, next_invoice_number - 1
        into v_seq, v_code, v_prefix, v_legacy_num;

  if not found then
    return null;
  end if;

  if coalesce(v_code, '') <> '' then
    -- Formato por fecha: [prefijo]AAAAMMDD-N-CC
    return coalesce(v_prefix, '') || to_char(p_date, 'YYYYMMDD') || '-' || v_seq::text || '-' || v_code;
  else
    -- Esquema viejo: prefijo + correlativo corrido
    return coalesce(v_prefix, '') || v_legacy_num::text;
  end if;
end;
$$;
