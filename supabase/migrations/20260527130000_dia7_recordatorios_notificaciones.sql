-- =====================================================================
-- 20260527130000_dia7_recordatorios_notificaciones.sql
--
-- Día 7 — Recordatorios, alertas y dashboard proactivo.
--
-- 1. medicos.zona_horaria text → todos los jobs cron usan esta TZ
--    para calcular "06:00 hora del médico" y "próximas 2 horas".
--    Default America/Caracas (consistente con CLAUDE.md §6).
--
-- 2. Extender recordatorios:
--    - prioridad enum (baja/media/alta) — driving del color de alerta
--    - auto_generado bool — distinguir IA-suggested de médica-set
--    - unique constraint (paciente_id, tipo, fecha_objetivo::date)
--      para evitar duplicados cuando el cron re-evalúa
--
-- 3. Tabla notificaciones nueva (campana + drawer + dashboard).
--    Es derivative de recordatorios: cada notificación apunta al
--    recordatorio que la originó (opcional) y al paciente.
--
-- 4. Índices para queries calientes del dashboard.
-- =====================================================================

-- ---------- 1. medicos.zona_horaria -----------------------------------

alter table public.medicos
  add column if not exists zona_horaria text not null
  default 'America/Caracas';

comment on column public.medicos.zona_horaria is
  'IANA TZ name. Crons usan esto para calcular "hoy", "próximas 2h", etc. en hora local del médico, no UTC.';

-- ---------- 2. Extender recordatorios ---------------------------------

create type public.recordatorio_prioridad as enum ('baja', 'media', 'alta');

alter table public.recordatorios
  add column if not exists prioridad public.recordatorio_prioridad
    not null default 'media',
  add column if not exists auto_generado boolean not null default false;

comment on column public.recordatorios.prioridad is
  'Driving el color/severidad de la alerta: alta=rojo, media=ámbar, baja=verde.';
comment on column public.recordatorios.auto_generado is
  'true si fue creado automáticamente (parser IA, regla de récipe, regla de paciente perdido). false si la médica lo programó a mano.';

-- Unique constraint anti-dupe. Usamos cast a date para que dos
-- "control 12 May 09:00" y "control 12 May 14:00" cuenten como uno solo
-- (no queremos doble agendar el mismo día).
create unique index if not exists recordatorios_dedup_idx
  on public.recordatorios (paciente_id, tipo, ((fecha_objetivo at time zone 'UTC')::date))
  where estado = 'pendiente';

-- ---------- 3. Tabla notificaciones -----------------------------------

create type public.notificacion_tipo as enum (
  'recordatorio',
  'alerta',
  'sistema'
);

create type public.notificacion_prioridad as enum ('baja', 'media', 'alta');

create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  paciente_id uuid references public.pacientes(id) on delete cascade,
  recordatorio_id uuid references public.recordatorios(id) on delete cascade,
  tipo public.notificacion_tipo not null,
  prioridad public.notificacion_prioridad not null default 'media',
  titulo text not null,
  mensaje text,
  accion_url text,
  leida boolean not null default false,
  resuelta boolean not null default false,
  fecha_objetivo timestamptz,
  fecha_creacion timestamptz not null default now()
);

comment on table public.notificaciones is
  'Notificaciones in-app que arman el centro de la campana + alertas del dashboard. Generadas por crons o por server actions. resuelta=true cuando la médica tomó acción sobre el item.';

-- Índices calientes del dashboard. medico_id + leida + prioridad
-- cubre la query principal del top-3-alertas-críticas.
create index notificaciones_dashboard_idx
  on public.notificaciones (medico_id, resuelta, prioridad desc, fecha_creacion desc);

create index notificaciones_paciente_idx
  on public.notificaciones (paciente_id)
  where paciente_id is not null;

create index notificaciones_recordatorio_idx
  on public.notificaciones (recordatorio_id)
  where recordatorio_id is not null;

-- Dedup: si un cron re-evalúa y vuelve a generar la misma notif del
-- mismo recordatorio sin resolver, no creamos otra.
create unique index notificaciones_dedup_idx
  on public.notificaciones (medico_id, recordatorio_id)
  where recordatorio_id is not null and resuelta = false;

-- ---------- 4. RLS ----------------------------------------------------

alter table public.notificaciones enable row level security;

create policy "notificaciones_select_own"
  on public.notificaciones for select
  using (auth.uid() = medico_id);

create policy "notificaciones_insert_own"
  on public.notificaciones for insert
  with check (auth.uid() = medico_id);

create policy "notificaciones_update_own"
  on public.notificaciones for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "notificaciones_delete_own"
  on public.notificaciones for delete
  using (auth.uid() = medico_id);
