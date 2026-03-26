-- Create scheduled_posts table
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id             uuid primary key default gen_random_uuid(),
  clip_code      text not null,
  title          text not null,
  platform       text not null,
  scheduled_date date not null,
  post_time      text default '11:00 AM CT',
  status         text default 'scheduled',
  content_type   text,
  created_at     timestamptz default now()
);

-- Seed data: 16 rows (one per platform per clip)
INSERT INTO scheduled_posts (clip_code, title, platform, scheduled_date) VALUES
  ('MBM015-CLIP-001', 'Your customer data is your only real moat',  'yt', '2026-03-26'),
  ('MBM015-CLIP-001', 'Your customer data is your only real moat',  'ig', '2026-03-26'),
  ('MBM015-CLIP-003', 'Audience to angle to format',                'yt', '2026-03-27'),
  ('MBM015-CLIP-003', 'Audience to angle to format',                'ig', '2026-03-27'),
  ('MBM015-CLIP-005', 'Why volume-based creative testing fails',     'yt', '2026-03-28'),
  ('MBM015-CLIP-005', 'Why volume-based creative testing fails',     'ig', '2026-03-28'),
  ('MBM015-CLIP-007', 'Facebook as a market research tool',         'yt', '2026-03-30'),
  ('MBM015-CLIP-007', 'Facebook as a market research tool',         'ig', '2026-03-30'),
  ('MBM015-CLIP-009', 'The insight extraction framework',           'yt', '2026-04-01'),
  ('MBM015-CLIP-009', 'The insight extraction framework',           'ig', '2026-04-01'),
  ('MBM015-CLIP-012', 'Mining customer reviews the right way',      'yt', '2026-04-03'),
  ('MBM015-CLIP-012', 'Mining customer reviews the right way',      'ig', '2026-04-03'),
  ('MBM015-CLIP-013', '1 insight can change your whole year',       'ig', '2026-04-06'),
  ('MBM015-CLIP-002', 'What your competitor''s reviews reveal',     'yt', '2026-04-08'),
  ('MBM015-CLIP-004', 'Stop testing creative, test insights',       'yt', '2026-04-10'),
  ('MBM015-CLIP-004', 'Stop testing creative, test insights',       'ig', '2026-04-10');
