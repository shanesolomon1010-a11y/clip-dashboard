# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `4e80c0f` on `main` (the Vercel-protection Bearer fix). All work shipped — `origin/main == 4e80c0f` after multiple background pushes during the cleanup pass. **No unpushed commits.** Working tree clean except for `memory/cloudmemory.md` (post-commit hook artifact, includable in close) and `.claude/worktrees/` (ignored).

This session was the "fix-only cleanup pass" — six items ranging from a one-line tooltip to a new cron alerter, executed across 7 commits. Closes out the carryover queue that built up over the 2026-05-17 → 2026-05-18 two-day audit arc.

### Commits unpushed on `main`
None. All 7 commits in this pass shipped during the session, plus the 4 prior unpushed commits from yesterday/yesterday's close which were pushed in the background early in this session.

### Commits shipped this session (oldest → newest)
- `8ec6bd9` chore: hygiene bundle — YT-delay caption, scheduled_posts query harden, delete inactive LaunchAgent (1a + 2a + 5a)
- `912953d` fix: add .order() to getTotalViewsPerClip pagination (3a)
- `32da918` feat(cron): diagnostics-alert posts RED statuses to Slack every 6h (5b)
- `433ff73` feat: pull ig_reels_avg_watch_time into IG sync (1b)
- `83c684c` fix(cron): diagnostics-alert noise patches — mute studio_snapshots, no-op when webhook unset
- `0496847` fix(cron): mute coverage.status — 4th scraper-deletion fallout
- `4e80c0f` fix(cron): pass Bearer CRON_SECRET on diagnostics-alert secondary fetch

## Just completed

### Hygiene bundle (8ec6bd9)
Three small items bundled because each was a one-line or one-file change:
- **1a (Founder Report YT-delay caption)**: Added a sub-caption under the "Data current through {date}" footer: "YouTube Analytics is 2-3 days delayed; this is the latest available data." Removes ambiguity for stakeholders who might read a 3-day-old date as a cron failure. Edited `src/components/views/FounderReportView.tsx`.
- **2a (scheduled_posts query hardening)**: Added `.order('scheduled_date', { ascending: true }).order('post_time', { ascending: true }).limit(5000)` to both `loadPosts()` and `refetchPosts()` in `PostingScheduleView.tsx`. Same defensive shape as the founder-report pagination fix. Currently at 76 rows, generous headroom.
- **5a (LaunchAgent deletion cascade)**: Deleted 4 files (`scripts/youtube-studio-sync.ts`, `.sh`, `.test.ts`, `com.clipstudio.youtubesync.plist`). Updated CLAUDE.md (two rules collapsed to one updated rule about the deletion). Rewrote `scripts/README.md` to a brief directory overview. Annotated `docs/superpowers/plans/2026-04-11-youtube-studio-sync.md` with a "STATUS — DELETED 2026-05-18" header. Cleaned stale comment refs in `src/lib/instagram.ts` and `scripts/instagram-insights-probe.ts`. Net -1,239 lines.

### getTotalViewsPerClip .order() fix (912953d)
**This is the actual root cause of the Dashboard 138.8K vs Platforms 138.7K divergence carried over from Round 21.** `getTotalViewsPerClip` paginates 1000 rows at a time but had no stable `.order()`, letting Postgres return rows in undefined order across pages — duplicates/skips silently shifted the lifetime total by ~95 views. One-line fix (`.order('id', { ascending: true })`). Top Content keying via `clipKey()` was always correct; the user's framing of the bug ("Top Content widget buckets by clip_code independently") was the wrong diagnosis — I investigated, found the real cause, and made the smaller correct fix instead of executing the proposed refactor. DB sum (138,800) = Dashboard statsGrid = Platforms now all agree.

### Diagnostics alerter (32da918 + 83c684c + 0496847 + 4e80c0f)
New cron at `/api/cron/diagnostics-alert` running every 6h, posts to Slack via `SLACK_DIAGNOSTICS_WEBHOOK`. Walks the diagnostics response for any `status === 'red'`, mutes a known-RED set, posts a single-line Slack alert via Incoming Webhook with the failing paths + link back to the diagnostics URL.

Iterated across 4 commits as we discovered structural realities of the diagnostics surface and Vercel's deployment protection:
- **32da918** — initial route + cron registration (`vercel.json`). Mute list: `last_scraper_run`, `scraper_history`.
- **83c684c** — two noise patches: added `studio_snapshots_latest_stat.status` to mute list, changed missing-webhook from 500 → 200 with `{ skipped: true }` (Vercel logs stay clean during env-var setup).
- **0496847** — added `coverage.status` to mute list. Coverage compares posts vs studio_snapshots clip sets over 7d; studio_snapshots stopped growing post-deletion, so the missing-from-studio gap accumulates. 4th scraper-deletion fallout, completes the mute set.
- **4e80c0f** — propagated `Authorization: Bearer ${cronSecret}` to the secondary fetch. Scheduled cron tick at 7 PM landed a 401 in Slack — Vercel cron routes scheduled invocations to a protected alias domain (Protect Cron Jobs); the primary request bypasses protection via Bearer, but a bare secondary fetch hit the auth wall. Manual curls bypassed this by hitting the public production URL directly, not the protected alias. Inline comment captures the workaround for any future cross-route fetch.

End-of-session manual verifications: `{"alerted":false,"red_paths":[]}` post-deploy. **Definitive verification of the protection fix is the next scheduled tick (1 AM UTC) — see carryover.**

### IG sync metric expansion (433ff73)
Pulled `ig_reels_avg_watch_time` into the IG sync pipeline:
- `src/lib/instagram.ts`: `REELS_METRICS` gains `'ig_reels_avg_watch_time'`; `MediaInsights` gains `avgWatchTimeSeconds` (IG returns ms, divided by 1000). Semantic-mismatch note inline: IG's value is lifetime-per-Reel (not a per-day delta like YT's), so we write it as-is rather than diffing.
- `src/lib/instagram-sync.ts`: writes `avg_view_duration_seconds` on both bootstrap and delta rows.
- **Dashboard UI Avg View Duration tile intentionally unchanged.** The "YouTube only" caption + IG → "N/A" override stay until enough IG rows accumulate (~24h of cron ticks) to make the weighted blend meaningful. UI flip is a future-session decision.
- Forward-only: historical 269 IG rows stay NULL.

## In progress
None. Carryover queue is empty after this pass; what remains is verification waiting.

## Carryover for next session

### Vercel protection-fix verification — wait for 1 AM UTC scheduled tick
The 4e80c0f Bearer-propagation fix is the surgical version of the workaround. Manual curl post-deploy returns clean `{"alerted":false,"red_paths":[]}`, but that path never hits the protected alias. **Definitive proof comes from the next scheduled tick.** Two outcomes:
- **Silent success** → fix held. Mute baseline + protection fix both correct. Move on.
- **Another 401 warning in Slack** → Option B fallback: extract diagnostics computation logic from `src/app/api/diagnostics/route.ts` into a shared lib (`src/lib/diagnostics.ts`) exporting a `buildDiagnostics()` function. Both the route handler and the cron alerter call it directly — no HTTP hop, no auth wall. ~30 min refactor. Surface the split before doing it.

### IG avg_view_duration_seconds populate check (24h after first cron tick)
After ~24h of IG cron ticks (every 6h), sanity-check that the new column is flowing:
```sql
SELECT COUNT(avg_view_duration_seconds) FROM posts WHERE platform='instagram';
```
If > 0, the metric is flowing. If 0, debug the IG sync path — `fetchMediaInsights` may be silently failing the new metric request, or the writer isn't picking up the field.

### Dashboard Avg View Duration UI math flip (deferred decision)
Once IG `avg_view_duration_seconds` data has accumulated, decide whether to flip the math:
- Drop the "YouTube only" caption on All Platforms
- Drop the IG → "N/A" override on the Instagram-only filter
- Let the existing weighted-blend math (which already skips NULL rows) produce a real cross-platform value

Open question for that future session: is the daily-YT-AVD vs lifetime-IG-AVD semantic mismatch tolerable for a single tile, or should the IG side write to a separate `lifetime_avg_view_duration_seconds` column? Re-read `src/lib/instagram.ts` MediaInsights comment for the prior thinking.

## Known non-issues (don't escalate)
- **`/api/diagnostics` has no route-level auth.** Verified during this session. The GET handler accepts any request — the 401 we saw on the scheduled tick was Vercel deployment protection, not a route gate. Don't add route-level auth without checking impacts on `buildInternalConsistency`'s sub-fetch to `/api/founder-report` (which already passes `x-dashboard-secret`).
- **YT cron stat_date trailing today by 2-3 days is intrinsic.** Per CLAUDE.md and lessons.md 2026-05-18. Cron itself runs fine.
- **`cron_health.last_scraper_run`, `scraper_history.status`, `data_freshness.studio_snapshots_latest_stat.status`, `coverage.status` all RED forever.** All four are downstream of the Playwright LaunchAgent deletion (2026-05-18). All four are explicitly muted in `KNOWN_RED_PATHS` so the alerter ignores them. Don't try to "fix" any of them by re-creating the scraper.

## Data shape facts (still current)
- **5,123 YT posts rows** across 1,062 distinct stat_dates (2023-06-16 → 2026-05-15). 69 distinct clip keys. 0 NULL clip_code AND clip_details_code (orphan-free).
- **269 IG posts rows** — historically all NULL `avg_view_duration_seconds`. Going forward, new rows populate via 433ff73.
- **5,392 total posts rows.** Lifetime YT view total per `getTotalViewsPerClip('youtube')` now correctly reports 138,800 (was reporting 138,705 pre-912953d due to pagination-without-order skips).
- **No Slack webhook configured yet OR it was configured during this session** — manual curl returned `alerted: true` on the first fire, proving the env var IS set. (User likely added it between commits 32da918 and the first fire-test.)

## Shared helpers in db.ts
- `clipKey({ clip_code?, clip_details_code?, platform })` — string per-clip lookup key.
- `displayClipCode({ clip_code?, clip_details_code? })` — user-facing label.
- `ClipTotals` — return shape from `getTotalViewsPerClip` including all engagement totals.

## Next natural action (in priority order)
1. **Wait for the 1 AM UTC diagnostics-alert tick.** No action required from anyone; just observe whether Slack stays silent (good) or sends a 401 warning (triggers Option B).
2. **24h after the IG cron started populating duration** (so roughly mid-day 2026-05-19+), run the IG AVD count check above. Confirm metric is flowing.
3. **Pick the next session's focus** — clip production / social copy / new dashboard features. The fix queue is empty.

## Blocked / open
- **Supabase MCP read-only** (carried from prior session): still blocked from running migrations + DML via `mcp__supabase__apply_migration` / `execute_sql`. Workflow remains manual SQL Editor for writes. Read-only SELECT for diagnostics is fine without asking.
- **`SLACK_DIAGNOSTICS_WEBHOOK` env var** appears to be set in Vercel envs (alerter posted a real Slack message on first fire). Confirm via Slack history — `:rotating_light: *Clip Dashboard diagnostics RED* (1) • coverage.status` should be in the alert channel.
