-- =====================================================================
-- supabase/policies/consultas.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260524120300_consultas.sql
-- =====================================================================

-- medico_id está denormalizado en consultas; RLS no necesita join.

create policy "consultas_select_own"
  on public.consultas for select
  using (auth.uid() = medico_id);

create policy "consultas_insert_own"
  on public.consultas for insert
  with check (auth.uid() = medico_id);

create policy "consultas_update_own"
  on public.consultas for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "consultas_delete_own"
  on public.consultas for delete
  using (auth.uid() = medico_id);
