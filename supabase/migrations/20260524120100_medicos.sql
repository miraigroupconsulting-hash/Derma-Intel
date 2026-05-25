-- =====================================================================
-- 20260524120100_medicos.sql
-- Médico profile (1-to-1 with auth.users).
-- Includes the auto-create trigger on signup and the generic updated_at
-- function used by other tables later in this migration set.
-- =====================================================================

-- ----- table -----------------------------------------------------------

create table public.medicos (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  apellido text,
  especialidad text,
  cedula_profesional text,
  pais_cedula text,
  telefono text,
  firma_digital_path text,
  plantilla_recipe jsonb,
  tier_suscripcion text not null default 'solo'
    check (tier_suscripcion in ('solo', 'pro', 'clinica')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index medicos_email_uniq on public.medicos (lower(email));

comment on table public.medicos is
  'Profesional dermatólogo. 1:1 con auth.users.id. Multi-tenant root.';
comment on column public.medicos.onboarding_completed is
  'true cuando cedula_profesional + especialidad fueron completados.';

-- ----- generic updated_at trigger function -----------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger medicos_updated_at
  before update on public.medicos
  for each row execute function public.set_updated_at();

-- ----- auto-create medico on signup -----------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.medicos (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----- RLS -------------------------------------------------------------
-- NOTE: no INSERT policy. Client cannot insert rows; only the
-- security-definer trigger can. This prevents spoofing medico rows
-- with arbitrary IDs. DELETE is handled by cascade from auth.users.

alter table public.medicos enable row level security;

create policy "medicos_select_own"
  on public.medicos for select
  using (auth.uid() = id);

create policy "medicos_update_own"
  on public.medicos for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
