-- =====================================================================
-- supabase/policies/recordatorios.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260524120700_recordatorios.sql
-- =====================================================================

create policy "recordatorios_select_own"
  on public.recordatorios for select
  using (auth.uid() = medico_id);

create policy "recordatorios_insert_own"
  on public.recordatorios for insert
  with check (auth.uid() = medico_id);

create policy "recordatorios_update_own"
  on public.recordatorios for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "recordatorios_delete_own"
  on public.recordatorios for delete
  using (auth.uid() = medico_id);
