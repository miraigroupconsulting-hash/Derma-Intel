-- =====================================================================
-- supabase/policies/fotos.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260524120400_fotos.sql
-- =====================================================================

create policy "fotos_select_own"
  on public.fotos for select
  using (auth.uid() = medico_id);

create policy "fotos_insert_own"
  on public.fotos for insert
  with check (auth.uid() = medico_id);

create policy "fotos_update_own"
  on public.fotos for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "fotos_delete_own"
  on public.fotos for delete
  using (auth.uid() = medico_id);
