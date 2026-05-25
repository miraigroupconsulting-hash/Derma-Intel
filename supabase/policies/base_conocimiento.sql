-- =====================================================================
-- supabase/policies/base_conocimiento.sql
-- HUMAN-READABLE MIRROR for both base_conocimiento and
-- base_conocimiento_chunks. Source: migrations/20260524120600_base_conocimiento.sql
-- =====================================================================

-- ----- base_conocimiento (documentos) -----

create policy "base_conocimiento_select_own"
  on public.base_conocimiento for select
  using (auth.uid() = medico_id);
create policy "base_conocimiento_insert_own"
  on public.base_conocimiento for insert
  with check (auth.uid() = medico_id);
create policy "base_conocimiento_update_own"
  on public.base_conocimiento for update
  using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "base_conocimiento_delete_own"
  on public.base_conocimiento for delete
  using (auth.uid() = medico_id);

-- ----- base_conocimiento_chunks (vectorizados) -----

create policy "base_conocimiento_chunks_select_own"
  on public.base_conocimiento_chunks for select
  using (auth.uid() = medico_id);
create policy "base_conocimiento_chunks_insert_own"
  on public.base_conocimiento_chunks for insert
  with check (auth.uid() = medico_id);
create policy "base_conocimiento_chunks_update_own"
  on public.base_conocimiento_chunks for update
  using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "base_conocimiento_chunks_delete_own"
  on public.base_conocimiento_chunks for delete
  using (auth.uid() = medico_id);
