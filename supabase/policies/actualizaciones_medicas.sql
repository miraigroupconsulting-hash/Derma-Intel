-- =====================================================================
-- supabase/policies/actualizaciones_medicas.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260524120800_actualizaciones.sql
-- =====================================================================

create policy "actualizaciones_select_own"
  on public.actualizaciones_medicas for select
  using (auth.uid() = medico_id);

create policy "actualizaciones_insert_own"
  on public.actualizaciones_medicas for insert
  with check (auth.uid() = medico_id);

create policy "actualizaciones_update_own"
  on public.actualizaciones_medicas for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "actualizaciones_delete_own"
  on public.actualizaciones_medicas for delete
  using (auth.uid() = medico_id);
