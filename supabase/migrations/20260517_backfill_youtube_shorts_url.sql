UPDATE posts
SET url = 'https://www.youtube.com/shorts/' || content_id
WHERE platform = 'youtube'
  AND content_type = 'short'
  AND url IS NULL;
