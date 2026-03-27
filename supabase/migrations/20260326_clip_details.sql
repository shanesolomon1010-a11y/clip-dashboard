-- clip_details: stores per-clip copy assets (banners, captions, video URL)
CREATE TABLE IF NOT EXISTS clip_details (
  id                  uuid primary key default gen_random_uuid(),
  clip_code           text not null unique,
  title               text not null,
  headline_banner     text,
  question_banner     text,
  caption_tiktok      text,
  caption_instagram   text,
  caption_youtube     text,
  caption_linkedin    text,
  caption_twitter     text,
  video_url           text,
  created_at          timestamptz default now()
);

-- Seed data (video_url left blank — filled in later)
INSERT INTO clip_details (
  clip_code, title,
  headline_banner, question_banner,
  caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter,
  video_url
) VALUES
(
  'MBM015-CLIP-001',
  'Your customer data is your only real moat',
  'Your Customer Data Is Your Only Real Moat',
  'Do You Actually Know Who''s Buying From You?',
  'Most brands can''t tell you who their customer actually is beyond a basic demo. That gap is costing you more than any bad ad ever will.',
  'Everyone talks about creative. Almost nobody talks about the thing that actually determines whether any of it works — do you know your customer deeper than age and gender?',
  'Why understanding your customer at a deeper level is the most valuable skill in media buying right now.',
  'The businesses winning on paid media right now aren''t the ones with the best creative or the biggest budgets. They''re the ones who actually understand their customer.',
  '1-2 genuine customer insights can reshape an entire company''s growth trajectory. Most brands don''t have even one.',
  ''
),
(
  'MBM015-CLIP-003',
  'Audience to angle to format',
  'Most Ads Fail Before You Write a Single Word',
  'Are You Building Ads in the Wrong Order?',
  'Audience first. Then angle. Then format. Most people do it backwards and wonder why their ads don''t work.',
  'The pyramid that changes how you build every ad: know who you''re talking to before you decide what to say, and decide what to say before you decide how to say it.',
  'The three-step framework that determines whether your ad works before you shoot a single frame.',
  'Format is the last decision, not the first. Most media buyers pick the format then reverse-engineer the message. That''s why the message feels forced.',
  'Audience → angle → format. In that order. Always.',
  ''
);
