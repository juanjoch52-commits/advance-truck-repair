-- Hardening + compatibility policies for public uploads to work-evidence bucket.
-- Use this when uploads are done with anon/authenticated JWTs from the app API.

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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-anon-insert'
  ) then
    create policy "work-evidence-anon-insert"
    on storage.objects
    for insert
    to anon
    with check (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-authenticated-insert'
  ) then
    create policy "work-evidence-authenticated-insert"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-anon-update'
  ) then
    create policy "work-evidence-anon-update"
    on storage.objects
    for update
    to anon
    using (bucket_id = 'work-evidence')
    with check (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-authenticated-update'
  ) then
    create policy "work-evidence-authenticated-update"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'work-evidence')
    with check (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-anon-delete'
  ) then
    create policy "work-evidence-anon-delete"
    on storage.objects
    for delete
    to anon
    using (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-authenticated-delete'
  ) then
    create policy "work-evidence-authenticated-delete"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'work-evidence');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'work-evidence-public-read-compatible'
  ) then
    create policy "work-evidence-public-read-compatible"
    on storage.objects
    for select
    to public
    using (bucket_id = 'work-evidence');
  end if;
end;
$$;
