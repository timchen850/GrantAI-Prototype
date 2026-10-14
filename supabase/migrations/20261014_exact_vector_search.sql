-- Exact (not approximate) vector search for the exemplar library and the
-- private past-proposal RAG store.
--
-- Both tables had an IVFFlat index (lists = 100) created while they were empty.
-- IVFFlat trains its cluster centroids at CREATE INDEX time and, with the
-- default ivfflat.probes = 1, searches a single cluster. On a few hundred rows
-- that meant match_exemplar_chunks saw only a handful of chunks per query
-- (verified: a filtered Federal/<50k query returned 1 row when dozens matched,
-- and unfiltered queries kept returning the same proposal). Combined with the
-- funder_type/award_band WHERE filters, approximate search also post-filters
-- away most candidates.
--
-- At this scale an exact scan is fast and returns the true nearest neighbours,
-- so drop the approximate indexes. If either table grows past ~50k embedded
-- rows, add an HNSW index (pgvector >= 0.8, with hnsw.iterative_scan enabled
-- so filtered queries still fill their LIMIT) rather than IVFFlat.

drop index if exists public.idx_exemplar_chunks_embedding;
drop index if exists public.idx_doc_chunks_embedding;
