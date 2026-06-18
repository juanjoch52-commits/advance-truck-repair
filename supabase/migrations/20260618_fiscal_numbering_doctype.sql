-- Facturación fiscal: numeración correlativa ATÓMICA por taller + tipo de documento.
--
-- 1) document_type: distingue la FACTURA FISCAL (reportable) de documentos NO
--    fiscales (estimate / work order). Solo 'invoice' consume el correlativo
--    fiscal del taller, entra a Cuentas por Cobrar y descuenta inventario.
--    estimate/work_order se rotulan, NO entran a CxC y NO mueven stock.
--
-- 2) next_shop_invoice_number(shop): incrementa shops.next_invoice_number de
--    forma atómica. El UPDATE ... RETURNING toma un lock de fila, así que dos
--    facturas simultáneas del mismo taller no pueden tomar el mismo número.
--    Devuelve prefijo + número consumido (ej. "ATR-1"). Si el taller no existe
--    devuelve NULL → la ruta API cae al esquema de respaldo.
--
-- SEGURIDAD: shops tiene RLS deny-all + force. Esta función NO es SECURITY
-- DEFINER, así que solo corre con service_role (las rutas API server-side); no
-- se expone a los roles anon/authenticated. Ver [[auth-architecture-weakness]].

alter table public.invoices
  add column if not exists document_type text not null default 'invoice'
    check (document_type in ('invoice', 'estimate', 'work_order'));

create index if not exists idx_invoices_doctype on public.invoices(document_type);

create or replace function public.next_shop_invoice_number(p_shop_id uuid)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_num integer;
begin
  update public.shops
     set next_invoice_number = next_invoice_number + 1,
         updated_at = now()
   where id = p_shop_id
   returning invoice_prefix, next_invoice_number - 1
        into v_prefix, v_num;

  if not found then
    return null;
  end if;

  return coalesce(v_prefix, '') || v_num::text;
end;
$$;
