-- =====================================================================
-- supabase/policies/storage_medico_assets.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260526120100_medico_assets_bucket.sql
-- =====================================================================

create policy "medico_assets_select_own"
  on storage.objects for select
  using (
    bucket_id = 'medico-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "medico_assets_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'medico-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "medico_assets_update_own"
  on storage.objects for update
  using (
    bucket_id = 'medico-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'medico-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "medico_assets_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'medico-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
