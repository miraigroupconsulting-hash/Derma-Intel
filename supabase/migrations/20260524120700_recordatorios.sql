-- =====================================================================
-- 20260524120700_recordatorios.sql
-- Follow-up reminders per patient. Capa 4 feature; schema only today.
-- =====================================================================

create type public.recordatorio_tipo as enum (
  'control',
  'seguimiento',
  'biopsia_pendiente',
  'tratamiento_finaliza',
  'otro'
);

create type public.recordatorio_estado as enum (
  'pendiente',
  'completado',
  'cancelado'
);

create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  medico_id uuid not null references public.medicos(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  tipo public.recordatorio_tipo not null,
  fecha_objetivo timestamptz not null,
  mensaje text,
  estado public.recordatorio_estado not null default 'pendiente',
  completado_at timestamptz,
  created_at timestamptz not null default now()
);

create index recordatorios_medico_pendientes_idx
  on public.recordatorios (medico_id, fecha_objetivo)
  where estado = 'pendiente';

create index recordatorios_paciente_idx
  on public.recordatorios (paciente_id);

-- ----- RLS -------------------------------------------------------------

alter table public.recordatorios enable row level security;

create policy "recordatorios_select_own"
  on public.recordatorios for select
  using (auth.uid() = medico_id);

create policy "recordatorios_insert_own"
  on public.recordatorios for insert
  with check (auth.uid() = medico_id);

create policy "recordatorios_update_own"
  on public.recordatorios for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "recordatorios_delete_own"
  on public.recordatorios for delete
  using (auth.uid() = medico_id);
