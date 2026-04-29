# Lessons Learned

_Append an entry here after any correction from Shane._
_Format: [YYYY-MM-DD] | what went wrong | rule for next time_
_Read this file at the START of every session and apply all rules before touching any code._

[2026-04-27] | Proposed a unique index on posts(clip_code, platform, stat_date) for the long-form sync, which would have collided with existing Shorts rows where many clip_details_code values share the same clip_code (e.g. MBM016 has 12 clips). | Before adding any unique index to `posts`, enumerate which content_type rows occupy the table. Long-form rows have NULL clip_details_code, so prefer a PARTIAL unique index keyed on a column that is unique per row (content_id) and scoped with WHERE content_type='long_form'. Don't reuse Shorts' conflict key for long-form.
[2026-04-28] | Local Playwright scraper at scripts/youtube-studio-sync.ts was the actual source of daily Shorts data, not the Vercel cron — but it broke when YouTube Studio changed their CSV export DOM around Apr 24. | Before assuming a Vercel cron is broken because of stale data, check whether a local LaunchAgent or other scheduled job is the actual data source. Search for .plist files and scripts/ entries.
