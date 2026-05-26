-- =====================================================================
-- 20260526120000_medicos_profile_assets.sql
-- Add optional profile assets to the médico: street address for the
-- récipe header and a path to a logo image in Storage. The signature
-- column (firma_digital_path) already exists from Día 2.
-- =====================================================================

alter table public.medicos
  add column if not exists direccion text;

alter table public.medicos
  add column if not exists logo_storage_path text;

comment on column public.medicos.direccion is
  'Optional clinic/office address shown in the récipe header.';
comment on column public.medicos.logo_storage_path is
  'Path inside medico-assets bucket to the médico''s logo PNG (transparent bg recommended).';
