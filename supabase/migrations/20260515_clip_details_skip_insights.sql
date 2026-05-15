-- 20260515_clip_details_skip_insights.sql
-- Adds a per-clip kill switch for the Instagram insights API call.
--
-- Why: 7 of the 52 mapped IG Reels were posted to matteo.mediabuyer BEFORE
-- the account was converted to a Business account. The /insights endpoint
-- returns a permanent "media was posted before the user's account was
-- converted to a business account" error for these media — not a transient
-- failure, not something we can scope our way out of. Pre-fix, the IG cron
-- wasted ~28 API calls/day (4 ticks × 7 Reels) and polluted error logs.
--
-- The runInstagramSync per-media loop checks this flag and silently
-- continues past any registry entry where skip_insights = true. Posts +
-- comments are not written for skipped Reels — the bootstrap rows they
-- already have remain frozen, which is the correct semantic (the Reel
-- exists in the catalog but its post-conversion delta is unobtainable).
--
-- Lifecycle: Shane manually flips skip_insights = true for affected media
-- IDs via Supabase SQL Editor after this migration ships. No UI exposure
-- for now — operational toggle only.

ALTER TABLE clip_details
  ADD COLUMN IF NOT EXISTS skip_insights boolean NOT NULL DEFAULT false;
