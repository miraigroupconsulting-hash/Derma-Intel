-- =====================================================================
-- 20260524120300_consultas.sql
-- Consultas: each clinical event for a patient.
-- =====================================================================

create type public.consulta_estado as enum ('borrador', 'completada', 'archivada');

create table public.consultas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  medico_id uuid not null references public.medicos(id) on delete cascade,
  fecha timestamptz not null default now(),
  motivo text,
  anamnesis text,
  examen_fisico text,
  -- IMPORTANT: column name is "diagnostico_diferencial", never
  -- "diagnostico" alone. CLAUDE.md §2.2 forbids the bare word
  -- "diagnóstico" anywhere user-facing, and the schema reflects that.
  diagnostico_diferencial text,
  plan_terapeutico text,
  notas_ia jsonb,
  audio_path text,
  estado public.consulta_estado not null default 'borrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultas_paciente_fecha_idx
  on public.consultas (paciente_id, fecha desc);
create index consultas_medico_fecha_idx
  on public.consultas (medico_id, fecha desc);

create trigger consultas_updated_at
  before update on public.consultas
  for each row execute function public.set_updated_at();

-- ----- RLS -------------------------------------------------------------
-- medico_id is denormalized so RLS does not need a join through pacientes.

alter table public.consultas enable row level security;

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
