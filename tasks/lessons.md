# Lessons Learned

_Append an entry here after any correction from Shane._
_Format: [YYYY-MM-DD] | what went wrong | rule for next time_
_Read this file at the START of every session and apply all rules before touching any code._

[2026-04-27] | Proposed a unique index on posts(clip_code, platform, stat_date) for the long-form sync, which would have collided with existing Shorts rows where many clip_details_code values share the same clip_code (e.g. MBM016 has 12 clips). | Before adding any unique index to `posts`, enumerate which content_type rows occupy the table. Long-form rows have NULL clip_details_code, so prefer a PARTIAL unique index keyed on a column that is unique per row (content_id) and scoped with WHERE content_type='long_form'. Don't reuse Shorts' conflict key for long-form.
