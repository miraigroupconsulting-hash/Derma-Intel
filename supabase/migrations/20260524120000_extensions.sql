-- =====================================================================
-- 20260524120000_extensions.sql
-- Required Postgres extensions.
-- =====================================================================

-- pgvector for embeddings in base_conocimiento_chunks (Capa 2 RAG).
create extension if not exists vector;
