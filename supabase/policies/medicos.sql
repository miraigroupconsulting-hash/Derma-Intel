-- =====================================================================
-- supabase/policies/medicos.sql
-- HUMAN-READABLE MIRROR of the RLS policies applied to public.medicos.
-- DO NOT apply this file directly — it lives here for code review.
-- The applied source of truth is supabase/migrations/20260524120100_medicos.sql.
-- =====================================================================

-- Aislamiento: cada médico solo ve y edita su propia fila.
-- No hay INSERT policy: el cliente nunca inserta directo, lo hace el
-- trigger handle_new_auth_user con SECURITY DEFINER al hacer signup.
-- No hay DELETE policy: la fila se borra solo via cascade desde
-- auth.users cuando el usuario elimina su cuenta.

create policy "medicos_select_own"
  on public.medicos for select
  using (auth.uid() = id);

create policy "medicos_update_own"
  on public.medicos for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
