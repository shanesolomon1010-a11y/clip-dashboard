CREATE TABLE IF NOT EXISTS social_copy_generations (
  id BIGSERIAL PRIMARY KEY,
  clip_code TEXT NOT NULL,
  episode_context TEXT,
  transcript TEXT NOT NULL,
  additional_notes TEXT,
  headline_banner TEXT,
  question_banner TEXT,
  youtube_title TEXT,
  youtube_description TEXT,
  instagram_caption TEXT,
  raw_response TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_copy_clip ON social_copy_generations (clip_code);
CREATE INDEX IF NOT EXISTS idx_social_copy_created ON social_copy_generations (created_at DESC);
ALTER TABLE social_copy_generations DISABLE ROW LEVEL SECURITY;
