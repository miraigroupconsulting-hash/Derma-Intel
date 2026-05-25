-- =====================================================================
-- 20260524120600_base_conocimiento.sql
-- Personal knowledge base for RAG (Capa 2). Two tables:
--   - base_conocimiento: one row per uploaded document
--   - base_conocimiento_chunks: vectorized chunks for retrieval
-- Embedding dimension is 1024 (Voyage AI voyage-2). Bump in a future
-- migration if we switch to voyage-large-2 (1536) or voyage-medical.
-- =====================================================================

create type public.doc_tipo as enum
  ('paper', 'libro', 'guia', 'presentacion', 'nota');

-- ----- documents -------------------------------------------------------

create table public.base_conocimiento (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.medicos(id) on delete cascade,
  titulo text not null,
  storage_path text not null,
  tipo public.doc_tipo not null,
  num_paginas integer,
  resumen text,
  indexed_at timestamptz,
  fecha_subida timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index base_conocimiento_medico_idx on public.base_conocimiento (medico_id);
create index base_conocimiento_pending_idx
  on public.base_conocimiento (medico_id)
  where indexed_at is null;

comment on column public.base_conocimiento.indexed_at is
  'null = pendiente de vectorizar. Se llena cuando los chunks están listos.';

-- ----- chunks (vectorized) --------------------------------------------

create table public.base_conocimiento_chunks (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null
    references public.base_conocimiento(id) on delete cascade,
  medico_id uuid not null references public.medicos(id) on delete cascade,
  chunk_index integer not null,
  contenido text not null,
  pagina integer,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

create index base_conocimiento_chunks_doc_idx
  on public.base_conocimiento_chunks (documento_id, chunk_index);

create index base_conocimiento_chunks_embedding_idx
  on public.base_conocimiento_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ----- RLS -------------------------------------------------------------

alter table public.base_conocimiento enable row level security;
alter table public.base_conocimiento_chunks enable row level security;

create policy "base_conocimiento_select_own"
  on public.base_conocimiento for select
  using (auth.uid() = medico_id);
create policy "base_conocimiento_insert_own"
  on public.base_conocimiento for insert
  with check (auth.uid() = medico_id);
create policy "base_conocimiento_update_own"
  on public.base_conocimiento for update
  using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "base_conocimiento_delete_own"
  on public.base_conocimiento for delete
  using (auth.uid() = medico_id);

create policy "base_conocimiento_chunks_select_own"
  on public.base_conocimiento_chunks for select
  using (auth.uid() = medico_id);
create policy "base_conocimiento_chunks_insert_own"
  on public.base_conocimiento_chunks for insert
  with check (auth.uid() = medico_id);
create policy "base_conocimiento_chunks_update_own"
  on public.base_conocimiento_chunks for update
  using (auth.uid() = medico_id) with check (auth.uid() = medico_id);
create policy "base_conocimiento_chunks_delete_own"
  on public.base_conocimiento_chunks for delete
  using (auth.uid() = medico_id);
