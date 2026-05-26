-- =====================================================================
-- 20260526120100_medico_assets_bucket.sql
-- Private Storage bucket for médico personal assets (logo + signature).
-- Path convention: medico-assets/{medico_id}/{logo|firma}.png
-- Same first-segment = auth.uid() RLS pattern as fotos-consultas.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('medico-assets', 'medico-assets', false)
on conflict (id) do nothing;

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
