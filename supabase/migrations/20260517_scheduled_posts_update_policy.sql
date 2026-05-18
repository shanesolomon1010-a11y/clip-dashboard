CREATE POLICY "public update" ON scheduled_posts FOR UPDATE USING (true) WITH CHECK (true);
