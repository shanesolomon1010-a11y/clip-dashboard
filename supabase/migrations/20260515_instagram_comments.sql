-- 20260515_instagram_comments.sql
-- Per-comment storage for Instagram media comments. Pairs with the daily-delta
-- comment count rollup on posts.comments (count-only) — Q5 in
-- docs/superpowers/plans/2026-05-15-instagram-pipeline.md locked "both": this
-- table holds the full per-comment rows, posts.comments holds the daily delta
-- count for aggregation queries.
--
-- We have the instagram_business_manage_comments scope, so we pull as much
-- structured data as the Graph API exposes.
--
-- Source endpoints:
--   Top-level: GET /{media-id}/comments?fields=id,text,timestamp,username,like_count,replies
--   Replies:   GET /{comment-id}/replies?fields=id,text,timestamp,username,like_count,parent_id
--
-- No foreign-key constraint to a media table:
--   We don't store IG media as its own table — clip_details.instagram_content_id
--   is the (nullable) link from the Shorts/IG registry side, but (a) it's not
--   guaranteed to exist when a comment is first ingested (PENDING rows are
--   registered separately), and (b) it's not 1:1 with all comments. Treat
--   media_id here as a soft reference. The instagram_comments_media_id_idx
--   index below supports the common "fetch all comments for a media" query
--   without needing an FK.

CREATE TABLE IF NOT EXISTS instagram_comments (
  -- IG comment IDs are stable strings, unique across the platform.
  comment_id         text PRIMARY KEY,

  -- Soft reference to the IG media (no FK, see header comment).
  media_id           text NOT NULL,

  -- Comment body. NOT NULL: IG enforces non-empty text on creation. If a
  -- comment is later hidden or the user is deleted, IG returns empty string
  -- (not null) per current API behavior — store as-is so downstream consumers
  -- can distinguish "" from missing data.
  text               text NOT NULL,

  -- IG returns timestamp as ISO-8601. Named posted_at to avoid the SQL
  -- TIMESTAMP keyword collision and to match the project convention
  -- (published_at, discovered_at, etc.).
  posted_at          timestamptz NOT NULL,

  -- IG always returns like_count (>= 0). NOT NULL with default 0 for safety
  -- if a future API version omits it on hidden/deleted comments.
  like_count         integer NOT NULL DEFAULT 0,

  -- Top-level comments expose a `replies` edge that we summarize as a count.
  -- For reply rows (rows that have parent_comment_id), reply_count is 0
  -- (IG does not support nested replies beyond one level). NOT NULL DEFAULT 0.
  reply_count        integer NOT NULL DEFAULT 0,

  -- Commenter handle. NULLABLE: IG may return null if the commenter's account
  -- is deleted, deactivated, or has been hidden via privacy controls. Storing
  -- the comment without attribution is preferable to dropping the row.
  username           text,

  -- NULL for top-level comments. Populated with the parent comment_id when
  -- this row represents a reply. The parent may not exist in this table yet
  -- if replies are ingested before their parent — no FK to enforce ordering.
  parent_comment_id  text,

  -- Bookkeeping. updated_at gets bumped on upsert (the sync writer is
  -- responsible for setting it; no trigger here to keep parity with the rest
  -- of the schema, which uses application-managed updated_at columns).
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Common query: "fetch all comments for media X, ordered newest first."
CREATE INDEX IF NOT EXISTS instagram_comments_media_id_idx
  ON instagram_comments (media_id, posted_at DESC);

-- Common query: "fetch the reply thread for parent comment Y."
-- Partial index keeps the index small (most rows are top-level, parent_comment_id IS NULL).
CREATE INDEX IF NOT EXISTS instagram_comments_parent_comment_id_idx
  ON instagram_comments (parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;
