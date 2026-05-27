-- =====================================================================
-- 20260528120000_informes.sql
--
-- Día 11 — Informes médicos generados desde una consulta finalizada.
--
-- Estructura paralela a `recipes`: 1 consulta puede tener múltiples
-- informes (médica regeneró con IA polish, o con datos actualizados).
-- El PDF se guarda en bucket `informes-pdf` con el mismo patrón
-- {medico_id}/{consulta_id}/{informe_uuid}.pdf que récipes.
-- =====================================================================

create table public.informes (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references public.consultas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  medico_id uuid not null references public.medicos(id) on delete cascade,
  pdf_storage_path text,
  redactado_con_ia boolean not null default false,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.informes is
  'Informes médicos generados desde una consulta completada. PDF en bucket informes-pdf. redactado_con_ia=true cuando el toggle de redacción IA estuvo activo.';

create index informes_consulta_idx on public.informes (consulta_id, fecha desc);
create index informes_paciente_idx on public.informes (paciente_id, fecha desc);
create index informes_medico_idx on public.informes (medico_id);

create trigger informes_updated_at
  before update on public.informes
  for each row execute function public.set_updated_at();

-- ----- RLS ----------------------------------------------------------

alter table public.informes enable row level security;

create policy "informes_select_own"
  on public.informes for select
  using (auth.uid() = medico_id);

create policy "informes_insert_own"
  on public.informes for insert
  with check (auth.uid() = medico_id);

create policy "informes_update_own"
  on public.informes for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "informes_delete_own"
  on public.informes for delete
  using (auth.uid() = medico_id);

-- ----- Storage bucket -----------------------------------------------
-- Patrón idéntico al bucket `recetas-pdf` para consistencia.

insert into storage.buckets (id, name, public, file_size_limit)
values ('informes-pdf', 'informes-pdf', false, 5 * 1024 * 1024)
on conflict (id) do nothing;

-- Policies sobre storage.objects scoped por path {medico_id}/...

create policy "informes_pdf_select_own"
  on storage.objects for select
  using (
    bucket_id = 'informes-pdf'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "informes_pdf_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'informes-pdf'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "informes_pdf_update_own"
  on storage.objects for update
  using (
    bucket_id = 'informes-pdf'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "informes_pdf_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'informes-pdf'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
