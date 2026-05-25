-- =====================================================================
-- 20260524120200_pacientes.sql
-- Pacientes: root of clinical data per médico.
-- =====================================================================

create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  nombre text not null,
  apellido text not null,
  fecha_nacimiento date,
  sexo text check (sexo in ('M', 'F', 'O')),
  tipo_piel_fitzpatrick smallint check (tipo_piel_fitzpatrick between 1 and 6),
  alergias text,
  antecedentes text,
  medicacion_actual text,
  telefono text,
  email text,
  notas text,
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pacientes_medico_id_idx on public.pacientes (medico_id);
create index pacientes_archivado_idx on public.pacientes (medico_id, archivado);
create index pacientes_nombre_search_idx on public.pacientes
  using gin (to_tsvector('spanish',
    coalesce(nombre, '') || ' ' || coalesce(apellido, '')));

create trigger pacientes_updated_at
  before update on public.pacientes
  for each row execute function public.set_updated_at();

comment on column public.pacientes.archivado is
  'Soft-delete a nivel paciente. Filas con true no aparecen en listas por defecto.';

-- ----- RLS -------------------------------------------------------------

alter table public.pacientes enable row level security;

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
