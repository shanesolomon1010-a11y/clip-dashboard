-- 20260521_posts_updated_at_trigger.sql
-- posts.updated_at currently bumps only on INSERT (column default now()).
-- ON CONFLICT DO UPDATE leaves it frozen at INSERT time, masking re-syncs
-- that update existing rows. IG cron exposed this: 4x/day ticks INSERT
-- once, UPDATE 3 times — diagnostics' MAX(updated_at) proxy ran 16+ hours
-- stale despite all 4 ticks succeeding.
--
-- This trigger makes the posts.updated_at column a true "last touched"
-- timestamp by bumping it on every UPDATE. INSERT keeps using the column
-- default (now()). One caller (youtube-longform-sync.ts) writes
-- updated_at = nowIso explicitly; on INSERT that value wins (no trigger
-- fires), on UPDATE the trigger overrides to server-side now(). Either
-- way the result is "approximately the cron run time", which is the
-- contract diagnostics has always assumed.

CREATE OR REPLACE FUNCTION posts_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at_trigger
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION posts_set_updated_at();
