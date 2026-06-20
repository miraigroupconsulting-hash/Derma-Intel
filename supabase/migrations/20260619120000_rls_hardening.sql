-- =====================================================================
-- 20260619120000_rls_hardening.sql
--
-- Auditoría de seguridad — endurecimiento de RLS (defensa en profundidad).
--
-- CONTEXTO: una auditoría externa pidió "asegurar RLS en toda tabla con
-- PHI". La verificación contra el repo mostró que TODAS las tablas con
-- datos de paciente YA tienen RLS habilitada + 4 policies explícitas
-- (select/insert/update/delete) scoped a `auth.uid() = medico_id`, con
-- deny-by-default (Postgres niega por defecto al habilitar RLS sin una
-- policy permisiva amplia). Es decir: NO había un hueco.
--
-- Esta migración NO recrea policies (eso fallaría por duplicado). Hace
-- dos cosas idempotentes y seguras de re-correr:
--
--   1. `enable row level security` en cada tabla PHI — no-op si ya está,
--      pero deja el estado explícito y auto-documentado en un solo lugar.
--
--   2. `force row level security` — defensa en profundidad: hace que
--      INCLUSO el rol dueño de la tabla (postgres) quede sujeto a las
--      policies. Los roles `authenticated`/`anon` ya estaban sujetos;
--      el rol `service_role` tiene BYPASSRLS y NO se ve afectado por
--      FORCE (los crons y los inserts server-side siguen funcionando).
--      Esto cierra la ventana teórica de "código que conecta como owner".
--
-- Aplicar con: supabase db push  (o el flujo de migración del proyecto).
-- Es seguro re-aplicar. No toca datos.
-- =====================================================================

-- Tablas con PHI o vinculadas a un médico tenant. Mantener en sync si se
-- agregan tablas nuevas con medico_id.
alter table public.pacientes        enable row level security;
alter table public.pacientes        force  row level security;

alter table public.consultas        enable row level security;
alter table public.consultas        force  row level security;

alter table public.fotos            enable row level security;
alter table public.fotos            force  row level security;

alter table public.recipes          enable row level security;
alter table public.recipes          force  row level security;

alter table public.recordatorios    enable row level security;
alter table public.recordatorios    force  row level security;

alter table public.notificaciones   enable row level security;
alter table public.notificaciones   force  row level security;

alter table public.comparaciones    enable row level security;
alter table public.comparaciones    force  row level security;

alter table public.informes         enable row level security;
alter table public.informes         force  row level security;

alter table public.uso_ia           enable row level security;
alter table public.uso_ia           force  row level security;

-- medicos: perfil del tenant. Ya tiene RLS (select/update own; insert solo
-- vía trigger SECURITY DEFINER en el signup). Forzamos también — el trigger
-- corre como definer (bypassa RLS), así que no se rompe.
alter table public.medicos          enable row level security;
alter table public.medicos          force  row level security;
