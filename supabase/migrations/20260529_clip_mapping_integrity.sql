-- 20260529_clip_mapping_integrity.sql
--
-- Version-control record of two functions APPLIED MANUALLY via the Supabase
-- SQL Editor on 2026-05-29. Definitions below are pulled verbatim from the
-- catalog (pg_get_functiondef) so this file matches the live database exactly.
--
-- map_clip() is the CANONICAL atomic path for ALL clip mappings. Never re-key
-- clip_details_code across PENDING/MBM with raw multi-statement SQL again — the
-- 5/25 incident came from a partial manual re-key. map_clip frees each UNIQUE
-- column (content_id, instagram_content_id) before claiming it on the MBM row,
-- and RAISEs on any half-state so a partial mapping can never persist.
--
-- ig_mapping_desync() is the heartbeat probe for the exact 5/25 cross-row
-- invariant. It is wired into diagnostics (schema_integrity.ig_mapping_desync)
-- and is NOT muted in KNOWN_RED_PATHS — any returned row alerts.

CREATE OR REPLACE FUNCTION public.map_clip(p_code text, p_yt_video_id text, p_ig_content_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pending_yt      text := CASE WHEN p_yt_video_id  IS NOT NULL THEN 'PENDING-'||p_yt_video_id END;
  v_pending_ig      text := CASE WHEN p_ig_content_id IS NOT NULL THEN 'PENDING-IG-'||p_ig_content_id END;
  v_posts_rekeyed   int := 0;
  v_pending_deleted int := 0;
BEGIN
  IF p_code IS NULL OR p_code NOT LIKE 'MBM%' THEN
    RAISE EXCEPTION 'map_clip: p_code must be an MBM code, got %', p_code;
  END IF;
  IF p_yt_video_id IS NULL AND p_ig_content_id IS NULL THEN
    RAISE EXCEPTION 'map_clip: at least one of p_yt_video_id / p_ig_content_id is required';
  END IF;
  PERFORM 1 FROM clip_details
    WHERE clip_details_code IN (p_code, v_pending_yt, v_pending_ig) FOR UPDATE;
  INSERT INTO clip_details (clip_code, clip_details_code, content_id, instagram_content_id)
  VALUES (split_part(p_code, '-', 1), p_code, NULL, NULL)
  ON CONFLICT (clip_details_code) DO NOTHING;
  BEGIN
    UPDATE posts SET clip_details_code = p_code
      WHERE clip_details_code IN (v_pending_yt, v_pending_ig);
    GET DIAGNOSTICS v_posts_rekeyed = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'map_clip: posts re-key for % collides with existing MBM rows (half-state, aborted)', p_code;
  END;
  DELETE FROM clip_details WHERE clip_details_code IN (v_pending_yt, v_pending_ig);
  GET DIAGNOSTICS v_pending_deleted = ROW_COUNT;
  UPDATE clip_details
    SET content_id           = COALESCE(p_yt_video_id, content_id),
        instagram_content_id = COALESCE(p_ig_content_id, instagram_content_id)
    WHERE clip_details_code = p_code;
  IF EXISTS (SELECT 1 FROM clip_details WHERE clip_details_code IN (v_pending_yt, v_pending_ig)) THEN
    RAISE EXCEPTION 'map_clip: PENDING clip_details survived for %', p_code;
  END IF;
  IF EXISTS (SELECT 1 FROM posts WHERE clip_details_code IN (v_pending_yt, v_pending_ig)) THEN
    RAISE EXCEPTION 'map_clip: PENDING posts survived for %', p_code;
  END IF;
  RETURN jsonb_build_object('code', p_code,
    'posts_rekeyed', v_posts_rekeyed, 'pending_deleted', v_pending_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ig_mapping_desync()
 RETURNS TABLE(ig_content_id text, posts_code text, registry_code text, ig_post_rows bigint)
 LANGUAGE sql
 STABLE
AS $function$
  -- For each IG media with posts, compare the code the posts are keyed under
  -- against the code on the clip_details row that owns that instagram_content_id.
  -- Any returned row is a desync (the exact 5/25 condition).
  SELECT
    p.content_id          AS ig_content_id,
    p.clip_details_code   AS posts_code,
    cd.clip_details_code  AS registry_code,
    count(*)              AS ig_post_rows
  FROM posts p
  LEFT JOIN clip_details cd
    ON cd.instagram_content_id = p.content_id
  WHERE p.platform = 'instagram'
    AND p.content_id IS NOT NULL
    AND (cd.clip_details_code IS NULL
         OR cd.clip_details_code <> p.clip_details_code)
  GROUP BY p.content_id, p.clip_details_code, cd.clip_details_code;
$function$;

-- ----------------------------------------------------------------------------
-- posts -> clip_details foreign key (APPLIED MANUALLY 2026-06-01 via SQL Editor)
--
-- The DB-level GUARD layer that completes the prevent/detect/guard model:
--   PREVENT — map_clip() is the only sanctioned re-key path (atomic, RAISEs on
--             any half-state) so a partial mapping can never be written.
--   DETECT  — ig_mapping_desync() heartbeat probe alerts on any cross-row drift.
--   GUARD   — this FK makes it physically impossible for a posts row to
--             reference a clip_details_code that isn't in clip_details.
--
-- ON DELETE RESTRICT: a clip_details row cannot be deleted while posts still
-- reference it (map_clip re-keys posts onto the MBM code BEFORE deleting the
-- PENDING row, so its own deletes are never blocked). ON UPDATE CASCADE: a
-- clip_details_code rename propagates to posts automatically. NULL children
-- (long-form posts, by design) are exempt from the check.
--
-- Pre-add trace confirmed zero orphan posts and clip_details_code UNIQUE
-- (clip_details_code_unique); see the 2026-06-01 read-only safety report.
ALTER TABLE posts
  ADD CONSTRAINT posts_clip_details_code_fkey
  FOREIGN KEY (clip_details_code) REFERENCES clip_details(clip_details_code)
  ON UPDATE CASCADE ON DELETE RESTRICT;
