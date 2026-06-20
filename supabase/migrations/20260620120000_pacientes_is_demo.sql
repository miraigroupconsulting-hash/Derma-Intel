-- =====================================================================
-- 20260620120000_pacientes_is_demo.sql
--
-- Auditoría — separar datos demo de PHI real con un flag de schema.
--
-- Hasta ahora los pacientes demo se distinguían por un MARCADOR DE TEXTO
-- en `notas` ("[MIRAI_DEMO_SEED_v1]") + sufijo "(Demo)"/"(Mirai)" en el
-- apellido. Eso es frágil (cualquier nota real podría colisionar y no es
-- filtrable de forma confiable). Esta migración formaliza un flag.
--
--   1. pacientes.is_demo boolean not null default false
--   2. Backfill: marca como demo los pacientes ya sembrados por los
--      scripts seed-* (por el marcador de notas o el sufijo de apellido).
--   3. Índice parcial para filtrar demo rápido en las vistas de prod.
--
-- Las tablas hijas (consultas, fotos, recipes, recordatorios, informes,
-- comparaciones, notificaciones) NO necesitan su propio flag: heredan la
-- condición demo vía paciente_id, y al borrar el paciente demo el CASCADE
-- limpia todo. El botón "Eliminar datos demo" en /perfil borra los
-- pacientes is_demo=true y el cascade hace el resto.
--
-- Aplicar ANTES de desplegar el código que referencia is_demo.
-- =====================================================================

alter table public.pacientes
  add column if not exists is_demo boolean not null default false;

comment on column public.pacientes.is_demo is
  'true = registro de demostración (creado por scripts seed-*). Las vistas de producción lo filtran por defecto; /perfil tiene un botón para borrarlos. Los registros clínicos reales SIEMPRE tienen is_demo=false.';

-- Backfill de los demos ya existentes en producción.
update public.pacientes
set is_demo = true
where is_demo = false
  and (
    coalesce(notas, '') ilike '%MIRAI_DEMO_SEED%'
    or coalesce(notas, '') ilike '%paciente demo%'
    or apellido ilike '%(demo)%'
    or apellido ilike '%(mirai)%'
  );

-- Índice parcial: la query "solo reales" (is_demo=false) es la caliente.
create index if not exists pacientes_no_demo_idx
  on public.pacientes (medico_id, archivado)
  where is_demo = false;
