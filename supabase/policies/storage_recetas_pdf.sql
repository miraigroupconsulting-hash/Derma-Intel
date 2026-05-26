-- =====================================================================
-- supabase/policies/storage_recetas_pdf.sql
-- HUMAN-READABLE MIRROR for the recetas-pdf bucket policies.
-- Source: migrations/20260525140000_recetas_pdf_bucket.sql
-- =====================================================================

create policy "recetas_pdf_select_own"
  on storage.objects for select
  using (
    bucket_id = 'recetas-pdf'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recetas_pdf_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'recetas-pdf'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recetas_pdf_update_own"
  on storage.objects for update
  using (
    bucket_id = 'recetas-pdf'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recetas-pdf'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recetas_pdf_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'recetas-pdf'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
