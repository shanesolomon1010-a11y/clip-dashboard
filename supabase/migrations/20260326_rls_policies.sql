-- Enable public read/insert on scheduled_posts and clip_details.
-- Run this in the Supabase SQL editor if RLS is enabled and dots aren't showing.

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_details    ENABLE ROW LEVEL SECURITY;

-- scheduled_posts
CREATE POLICY "public read"   ON scheduled_posts FOR SELECT USING (true);
CREATE POLICY "public insert" ON scheduled_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete" ON scheduled_posts FOR DELETE USING (true);

-- clip_details
CREATE POLICY "public read"   ON clip_details FOR SELECT USING (true);
CREATE POLICY "public insert" ON clip_details FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete" ON clip_details FOR DELETE USING (true);
