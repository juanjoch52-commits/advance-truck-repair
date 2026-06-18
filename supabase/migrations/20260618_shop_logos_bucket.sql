-- Bucket público para los logos de cada taller (se muestran en la factura PDF).
-- Lectura pública (logos no son sensibles); la escritura va por API server-side
-- con service role. Aplicado en prod vía MCP el 2026-06-18.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-logos', 'shop-logos', true, 2097152, array['image/png','image/jpeg','image/jpg','image/webp'])
on conflict (id) do nothing;
