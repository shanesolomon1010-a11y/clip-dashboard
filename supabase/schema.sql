CREATE TABLE posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  date text,
  title text,
  views bigint DEFAULT 0,
  likes bigint DEFAULT 0,
  comments bigint DEFAULT 0,
  shares bigint DEFAULT 0,
  saves bigint DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Unique constraint used for upsert deduplication on CSV upload
CREATE UNIQUE INDEX posts_platform_title_date_idx ON posts (platform, title, date);
