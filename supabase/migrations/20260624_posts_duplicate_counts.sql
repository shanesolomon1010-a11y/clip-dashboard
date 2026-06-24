-- 20260624_posts_duplicate_counts.sql
--
-- APPLY MANUALLY via the Supabase SQL Editor (DDL is never run through Claude
-- Code / MCP — see CLAUDE.md). After applying, confirm with:
--   SELECT * FROM posts_duplicate_counts();   -- expect a single (0,0,0) row
--
-- Exact DB-side duplicate-row count for the schema_integrity diagnostics check,
-- one grouped query per stream. Replaces a client-side fetch-all-then-dedup-in-JS
-- implementation that silently truncated at PostgREST's 1000-row cap and reported
-- phantom duplicate counts that grew and cleared with row volume (same bug class
-- as the orphan check fixed in 577f086).
--
-- This lives in SQL because PostgREST aggregate functions are disabled on this
-- project (PGRST123 "Use of aggregate functions is not allowed"), so GROUP BY ...
-- HAVING COUNT(*) > 1 cannot be expressed from the supabase-js client. Wired into
-- diagnostics via supabase.rpc('posts_duplicate_counts'), mirroring
-- ig_mapping_desync() in 20260529_clip_mapping_integrity.sql.
--
-- Each stream groups by its own upsert conflict key (see CLAUDE.md "Upsert
-- conflict keys") and sums the surplus rows per group (COUNT(*) - 1). posts
-- enforces UNIQUE(clip_details_code, platform, stat_date) and
-- UNIQUE(content_id, platform, stat_date), so every group is structurally of
-- size 1 and the result is always 0 — an exact count that can never phantom-fire.

CREATE OR REPLACE FUNCTION public.posts_duplicate_counts()
 RETURNS TABLE(shorts bigint, longform bigint, instagram bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    (SELECT COALESCE(SUM(c - 1), 0) FROM (
       SELECT COUNT(*) AS c FROM posts
       WHERE platform = 'youtube' AND content_type = 'short'
         AND clip_details_code IS NOT NULL
       GROUP BY clip_details_code, platform, stat_date HAVING COUNT(*) > 1
     ) g) AS shorts,
    (SELECT COALESCE(SUM(c - 1), 0) FROM (
       SELECT COUNT(*) AS c FROM posts
       WHERE platform = 'youtube' AND content_type = 'long_form'
         AND content_id IS NOT NULL
       GROUP BY content_id, platform, stat_date HAVING COUNT(*) > 1
     ) g) AS longform,
    (SELECT COALESCE(SUM(c - 1), 0) FROM (
       SELECT COUNT(*) AS c FROM posts
       WHERE platform = 'instagram'
         AND content_id IS NOT NULL
       GROUP BY content_id, platform, stat_date HAVING COUNT(*) > 1
     ) g) AS instagram;
$function$;
