-- =====================================================================
-- 20260525120000_fotos_consultas_bucket.sql
-- Private Storage bucket for clinical photos.
-- Path convention: fotos-consultas/{medico_id}/{consulta_id|temp-xxx}/{photo-uuid}.jpg
-- RLS reads the first path segment as medico_id and compares to auth.uid().
-- =====================================================================

-- Create the private bucket. Idempotent.
insert into storage.buckets (id, name, public)
values ('fotos-consultas', 'fotos-consultas', false)
on conflict (id) do nothing;

-- ----- RLS policies on storage.objects --------------------------------
-- Same uniform pattern as our public tables: own data only.

create policy "fotos_consultas_select_own"
  on storage.objects for select
  using (
    bucket_id = 'fotos-consultas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "fotos_consultas_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'fotos-consultas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "fotos_consultas_update_own"
  on storage.objects for update
  using (
    bucket_id = 'fotos-consultas'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'fotos-consultas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "fotos_consultas_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'fotos-consultas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
