-- =====================================================================
-- supabase/policies/uso_ia.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260525130000_uso_ia.sql
-- =====================================================================

-- Read-only for the owning médico. No INSERT/UPDATE/DELETE policies:
--   - INSERT happens server-side with service role from the route
--     handler that runs the IA call. Same anti-spoofing pattern as
--     public.medicos.
--   - UPDATE/DELETE are intentionally absent — usage is an immutable
--     audit + cost trail.

create policy "uso_ia_select_own"
  on public.uso_ia for select
  using (auth.uid() = medico_id);
