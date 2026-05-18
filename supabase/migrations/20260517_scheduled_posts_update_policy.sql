-- scheduled_posts has RLS enabled with public insert / public read / public delete
-- policies but no UPDATE policy, so anon-client UPDATE calls silently no-op
-- (PostgREST returns 200 / 0-rows / null error when RLS blocks the operation).
-- This bit handleTimeSave in PostingScheduleView.tsx: inline post_time edits
-- appeared to succeed (optimistic local state update) but reverted on refresh
-- because the DB row never changed. Same silent-failure class as the IG cron
-- RLS incident on 2026-05-15.

CREATE POLICY "public update" ON scheduled_posts FOR UPDATE USING (true) WITH CHECK (true);
