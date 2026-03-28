-- Fix placeholder titles: stamp the clip_code as title for any row where title was set to '.'
UPDATE clip_details SET title = clip_code WHERE title = '.';
