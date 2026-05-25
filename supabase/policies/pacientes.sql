-- =====================================================================
-- supabase/policies/pacientes.sql
-- HUMAN-READABLE MIRROR of public.pacientes RLS policies.
-- DO NOT apply directly. Source of truth: migrations/20260524120200_pacientes.sql
-- =====================================================================

-- Patrón uniforme: 4 policies, todas con auth.uid() = medico_id.

create policy "pacientes_select_own"
  on public.pacientes for select
  using (auth.uid() = medico_id);

create policy "pacientes_insert_own"
  on public.pacientes for insert
  with check (auth.uid() = medico_id);

create policy "pacientes_update_own"
  on public.pacientes for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "pacientes_delete_own"
  on public.pacientes for delete
  using (auth.uid() = medico_id);
