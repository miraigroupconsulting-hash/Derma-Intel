-- =====================================================================
-- 20260525130000_uso_ia.sql
-- Per-call IA usage log. Used for cost analytics, future tier limits,
-- and proof that the app fits the unit economics promised in the PRD.
-- =====================================================================

create type public.ia_modo as enum (
  'caso_clinico',
  'express',
  'bibliografia',
  'histopatologia',
  'terapeutica',
  'docente'
);

create table public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  -- Nullable so a future bibliografia-from-anywhere screen can log without
  -- a consulta. ON DELETE SET NULL keeps the cost row even if the
  -- médico hard-deletes the underlying consulta.
  consulta_id uuid references public.consultas(id) on delete set null,
  modo public.ia_modo not null,
  modelo text not null,
  tokens_input integer not null check (tokens_input >= 0),
  tokens_output integer not null check (tokens_output >= 0),
  costo_usd numeric(10, 6) not null check (costo_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  -- 'completed' = normal Claude response; 'error' = upstream failure;
  -- 'aborted' = client cancelled mid-stream. Bills only completed +
  -- partial-aborted (tokens already counted).
  estado text not null default 'completed'
    check (estado in ('completed', 'error', 'aborted')),
  fecha timestamptz not null default now()
);

create index uso_ia_medico_fecha_idx
  on public.uso_ia (medico_id, fecha desc);

create index uso_ia_medico_modo_fecha_idx
  on public.uso_ia (medico_id, modo, fecha desc);

create index uso_ia_consulta_idx
  on public.uso_ia (consulta_id)
  where consulta_id is not null;

comment on table public.uso_ia is
  'Per-call IA usage and cost log. Drives analytics + future tier gating.';

-- ----- RLS -------------------------------------------------------------

alter table public.uso_ia enable row level security;

-- Médicos can only read their own usage.
create policy "uso_ia_select_own"
  on public.uso_ia for select
  using (auth.uid() = medico_id);

-- INSERT happens server-side via service role only — no client-side
-- policy. Same pattern as public.medicos (no INSERT policy = no
-- spoofing via the anon key). If we ever need client-side insert, add
-- a WITH CHECK (auth.uid() = medico_id) policy here.

-- UPDATE / DELETE: not allowed by design. usage rows are immutable
-- audit trail. If a row is wrong, write a compensating entry.
