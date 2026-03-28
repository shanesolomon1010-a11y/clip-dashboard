-- Fix placeholder/null titles: stamp clip_code wherever title was never properly set
UPDATE scheduled_posts SET title = clip_code WHERE title = '.' OR title IS NULL;
UPDATE clip_details SET title = clip_code WHERE title = '.' OR title IS NULL;
