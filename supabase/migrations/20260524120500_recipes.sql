-- =====================================================================
-- 20260524120500_recipes.sql
-- Récipes (prescriptions). Always reviewed and signed by the médico
-- — never auto-signed. firmado=false means draft, firmado=true means
-- the médico finalized and (digitally) signed it.
-- =====================================================================

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references public.consultas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  medico_id uuid not null references public.medicos(id) on delete cascade,
  -- shape: [{ nombre, presentacion, dosis, via, duracion, indicaciones }]
  medicamentos jsonb not null,
  indicaciones_paciente text,
  fecha timestamptz not null default now(),
  pdf_storage_path text,
  firmado boolean not null default false,
  firmado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_paciente_idx on public.recipes (paciente_id, fecha desc);
create index recipes_consulta_idx on public.recipes (consulta_id);
create index recipes_medico_idx on public.recipes (medico_id);

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

comment on column public.recipes.firmado is
  'CLAUDE.md §2.2: el récipe lo firma el médico, nunca automático. firmado=false equivale a borrador no entregable.';

-- ----- RLS -------------------------------------------------------------

alter table public.recipes enable row level security;

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
