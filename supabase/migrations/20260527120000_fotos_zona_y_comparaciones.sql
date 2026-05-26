-- =====================================================================
-- 20260527120000_fotos_zona_y_comparaciones.sql
--
-- Día 6 — Galería fotográfica con evolución y comparación.
--
-- 1. Suaviza la columna fotos.zona_anatomica con un CHECK de longitud
--    (1..120 chars). La validación contra la lista de zonas válidas
--    (frente, mejilla_derecha, etc.) ocurre en el app layer (zod +
--    dropdown). Razón: dermatología tiene más nomenclatura anatómica
--    de la que cabe en una whitelist SQL razonable, y futuros casos
--    de uso (pliegues, lechos ungueales) no deberían exigir migración.
--
-- 2. Índices compuestos para el flujo de galería:
--    - (paciente_id, fecha desc): consulta principal del timeline
--    - (paciente_id, zona_anatomica): filtro por zona
--
-- 3. Tabla `comparaciones` para guardar comparaciones antes/después
--    que el médico haya creado en la galería. Permite recuperarlas
--    después y ver historial. exportada=true se setea cuando se baja
--    el JPG.
-- =====================================================================

-- ---------- 1. CHECK en fotos.zona_anatomica --------------------------

alter table public.fotos
  add constraint fotos_zona_anatomica_len_chk
  check (
    zona_anatomica is null
    or (char_length(zona_anatomica) between 1 and 120)
  );

comment on column public.fotos.zona_anatomica is
  'Zona anatómica de la lesión. Lista canónica viva en lib/zonas-anatomicas.ts; valores libres permitidos (con prefijo "otra:") para nomenclatura no listada. CHECK solo valida longitud para no exigir migración por cada nueva zona.';

-- ---------- 2. Índices compuestos -------------------------------------

create index if not exists fotos_paciente_fecha_idx
  on public.fotos (paciente_id, fecha desc);

create index if not exists fotos_paciente_zona_idx
  on public.fotos (paciente_id, zona_anatomica)
  where zona_anatomica is not null;

-- ---------- 3. Tabla comparaciones ------------------------------------

create table public.comparaciones (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  foto_antes_id uuid not null references public.fotos(id) on delete cascade,
  foto_despues_id uuid not null references public.fotos(id) on delete cascade,
  notas text,
  exportada boolean not null default false,
  fecha_creacion timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- no comparar una foto consigo misma
  constraint comparaciones_distintas_fotos check (foto_antes_id <> foto_despues_id)
);

create index comparaciones_paciente_idx
  on public.comparaciones (paciente_id, fecha_creacion desc);
create index comparaciones_medico_idx
  on public.comparaciones (medico_id);

create trigger comparaciones_updated_at
  before update on public.comparaciones
  for each row execute function public.set_updated_at();

comment on table public.comparaciones is
  'Comparaciones antes/después guardadas por el médico desde la galería. La generación del JPG es client-side; aquí solo guardamos los IDs de fotos + notas para poder recargar la comparación.';

-- ---------- 4. RLS ----------------------------------------------------

alter table public.comparaciones enable row level security;

create policy "comparaciones_select_own"
  on public.comparaciones for select
  using (auth.uid() = medico_id);

create policy "comparaciones_insert_own"
  on public.comparaciones for insert
  with check (auth.uid() = medico_id);

create policy "comparaciones_update_own"
  on public.comparaciones for update
  using (auth.uid() = medico_id)
  with check (auth.uid() = medico_id);

create policy "comparaciones_delete_own"
  on public.comparaciones for delete
  using (auth.uid() = medico_id);
