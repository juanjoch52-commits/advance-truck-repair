-- 1) Create public bucket for evidence photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-evidence',
  'work-evidence',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) RLS policies for uploads and reads
-- Note: storage.objects has RLS enabled by default in Supabase projects.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-public-read'
  ) then
    create policy "work-evidence-public-read"
    on storage.objects
    for select
    using (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-public-insert'
  ) then
    create policy "work-evidence-public-insert"
    on storage.objects
    for insert
    to public
    with check (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-public-update'
  ) then
    create policy "work-evidence-public-update"
    on storage.objects
    for update
    to public
    using (bucket_id = 'work-evidence')
    with check (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-public-delete'
  ) then
    create policy "work-evidence-public-delete"
    on storage.objects
    for delete
    to public
    using (bucket_id = 'work-evidence');
  end if;
end;
$$;
