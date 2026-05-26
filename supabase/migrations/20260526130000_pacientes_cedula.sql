-- =====================================================================
-- 20260526130000_pacientes_cedula.sql
-- Add an optional cédula / DNI text field to pacientes. Free text so we
-- can accommodate venezolanos (V-X.XXX.XXX), extranjeros (E-X.XXX.XXX),
-- niños sin cédula aún (left null), and patients from other countries.
-- The médico can format it however their práctica expects.
-- =====================================================================

alter table public.pacientes
  add column if not exists cedula text;

comment on column public.pacientes.cedula is
  'Optional national ID or document number. Free text — no format enforced.';
