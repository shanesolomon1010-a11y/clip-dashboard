-- Migration: add caption_youtube_title column to clip_details
-- Run this in the Supabase SQL editor:
--
--   ALTER TABLE clip_details
--   ADD COLUMN caption_youtube_title text;

ALTER TABLE clip_details
ADD COLUMN caption_youtube_title text;
