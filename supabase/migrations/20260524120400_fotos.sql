-- =====================================================================
-- 20260524120400_fotos.sql
-- Clinical and dermatoscopic photos linked to a consulta and paciente.
-- Storage buckets are created in a later migration when the photo flow
-- lands (Capa 1 Día 4).
-- =====================================================================

create type public.foto_tipo as enum ('clinica', 'dermatoscopia');

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references public.consultas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  medico_id uuid not null references public.medicos(id) on delete cascade,
  storage_path text not null,
  anonimizada_storage_path text,
  tipo public.foto_tipo not null,
  zona_anatomica text,
  notas text,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index fotos_paciente_idx on public.fotos (paciente_id);
create index fotos_consulta_idx on public.fotos (consulta_id);
create index fotos_medico_idx on public.fotos (medico_id);

comment on column public.fotos.anonimizada_storage_path is
  'Versión sin PII (rostro, tatuajes, EXIF) para presentaciones académicas (CLAUDE.md §2.3).';

-- ----- RLS -------------------------------------------------------------

alter table public.fotos enable row level security;

create policy "fotos_select_own"
  on public.fotos for select
  using (auth.uid() = medico_id);

create policy "fotos_insert_own"
  on public.fotos for insert
  with check (auth.uid() = medico_id);

create policy "fotos_update_own"
  on public.fotos for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "fotos_delete_own"
  on public.fotos for delete
  using (auth.uid() = medico_id);
