-- =====================================================================
-- 20260526140000_recipes_revisiones.sql
--
-- Audit log mínimo para récipes. El médico puede desfirmar un récipe
-- ya firmado (corregirlo y volver a firmar). Cada acción queda en
-- `revisiones` con timestamp + tipo, sin perder el rastro del PDF
-- viejo (que permanece en Storage como evidencia).
--
-- Forma de cada entry en `revisiones`:
--   {
--     accion: 'firmado' | 'desfirmado' | 're_firmado',
--     fecha: timestamptz,         -- ISO string
--     pdf_storage_path: text|null -- snapshot del path en ese momento
--   }
--
-- medico_id no se almacena aquí — siempre es el dueño del récipe vía
-- RLS, y la fila de recipes ya tiene medico_id en el nivel superior.
-- =====================================================================

alter table public.recipes
  add column if not exists revisiones jsonb not null default '[]'::jsonb;

comment on column public.recipes.revisiones is
  'Audit log de firmado/desfirmado/re-firmado. Append-only desde la app, no se borra.';

-- Backfill: récipes ya firmados antes de esta migración reciben una
-- entrada inicial sintética para que la timeline no quede vacía.
update public.recipes
   set revisiones = jsonb_build_array(
         jsonb_build_object(
           'accion', 'firmado',
           'fecha', coalesce(firmado_at, created_at),
           'pdf_storage_path', pdf_storage_path
         )
       )
 where firmado = true
   and revisiones = '[]'::jsonb;
