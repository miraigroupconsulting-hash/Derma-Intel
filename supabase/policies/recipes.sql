-- =====================================================================
-- supabase/policies/recipes.sql
-- HUMAN-READABLE MIRROR. Source: migrations/20260524120500_recipes.sql
-- =====================================================================

create policy "recipes_select_own"
  on public.recipes for select
  using (auth.uid() = medico_id);

create policy "recipes_insert_own"
  on public.recipes for insert
  with check (auth.uid() = medico_id);

create policy "recipes_update_own"
  on public.recipes for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "recipes_delete_own"
  on public.recipes for delete
  using (auth.uid() = medico_id);
