-- =====================================================================
-- supabase/policies/storage_fotos_consultas.sql
-- HUMAN-READABLE MIRROR for the storage.objects policies that gate the
-- fotos-consultas bucket. Source: migrations/20260525120000_fotos_consultas_bucket.sql
-- =====================================================================

-- Same uniform pattern as public tables. The bucket itself is private
-- (no anonymous access); RLS enforces médico isolation by reading the
-- first folder segment of the object path as the médico UUID.

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
