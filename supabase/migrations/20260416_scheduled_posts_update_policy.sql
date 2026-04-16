-- Add missing UPDATE policy for scheduled_posts.
-- Without this, RLS silently blocks all UPDATE operations from the anon key,
-- causing the inline time-edit save to appear to succeed but not persist.
CREATE POLICY "public update" ON scheduled_posts FOR UPDATE USING (true) WITH CHECK (true);
