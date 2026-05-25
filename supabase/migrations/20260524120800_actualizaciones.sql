-- =====================================================================
-- 20260524120800_actualizaciones.sql
-- Weekly digest of medical updates harvested from PubMed/JAAD/DermNet/etc.
-- Capa 3 feature; schema only today.
-- =====================================================================

create table public.actualizaciones_medicas (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  fuente text not null,
  titulo text not null,
  resumen text not null,
  url_original text not null,
  fecha date not null,
  topics text[],
  leida boolean not null default false,
  guardada boolean not null default false,
  created_at timestamptz not null default now()
);

create index actualizaciones_medico_no_leidas_idx
  on public.actualizaciones_medicas (medico_id, fecha desc)
  where leida = false;

create index actualizaciones_medico_guardadas_idx
  on public.actualizaciones_medicas (medico_id, fecha desc)
  where guardada = true;

-- ----- RLS -------------------------------------------------------------

alter table public.actualizaciones_medicas enable row level security;

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
