# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `bc63586` (docs: add lesson re Vercel Hobby cron best-effort behavior). Branch `main` is 12 commits ahead of `origin/main`, all unpushed. Data layer is healthy: Dashboard 7d/30d converges with Founder Report (0% divergence — both paths now read the same `posts` rows after the 1000-row cap fix and the 2026-05-01 read-side fixes). Long-form ingestion confirmed live; the apparent 4-day gap was Vercel Hobby cron best-effort skipping + YouTube Analytics ~3-day reporting lag (not OAuth, not code). Shorts ingestion remains paused at the source (LaunchAgent disabled 2026-05-05).

## Just completed (2026-05-06, data accuracy + long-form gap investigation)
- **Data accuracy health check** (read-only Supabase MCP):
  - Dashboard vs Founder Report convergence: 7d=1163 views, 30d=6676 views — identical between paths (zero NULL `content_type` rows in either window, so the two aggregations operate on the same source rows). **GREEN.**
  - Long-form max stat_date was 2026-05-02 (4 days stale) → flagged YELLOW.
  - Shorts max stat_date 2026-05-03 — pre-disable, no zombie writes. **GREEN.**
- **Long-form gap diagnosis**:
  - Read `vercel.json`, `src/app/api/cron/youtube-sync-longform/route.ts`, `src/lib/youtube-longform-sync.ts`.
  - Initial OAuth-revocation theory was WRONG. Manually triggered the production cron at `https://clip-dashboard-two.vercel.app/api/cron/youtube-sync-longform` with `Authorization: Bearer $CRON_SECRET` → returned 200 in 19.7s with `{discovered:15, synced:3661, errors:0}`. After the manual run: `last_synced_at` for all 15 videos = 2026-05-06 19:05 UTC; max stat_date advanced 2026-05-02 → 2026-05-04. Two new days landed (May 3 + May 4).
  - Real cause: Vercel Hobby plan crons are documented best-effort — today's 14:30 UTC scheduled run skipped silently. Plus YouTube Analytics has an inherent ~3-day reporting lag, so the apparent "4-day gap" was mostly normal lag + 1 missed cron run.
  - Lesson recorded in `tasks/lessons.md` 2026-05-06 (commit `bc63586`).
- **Long-form catalog audit**: Compared 18 video IDs against `long_form_videos`. 15 present (all `last_synced_at` 2026-05-06 19:05 UTC). 3 missing:
  - `GJ-vDDJvzzU`, `kmHxugBlq_I` — confirmed unlisted on Shane's channel (`UC-Ly0V7fa_9TaF3WXvsroZA`) via YouTube Data API. Filtered out by the cron's `privacyStatus !== 'public'` check at `src/lib/youtube-longform-sync.ts:163` — **working as designed**.
  - `Q8iJ2gBujpY` — not visible to YouTube Data API key. Could be private (most likely, given the pattern), deleted, or invalid ID. Disambiguating definitively requires OAuth, which isn't in local `.env.local` (see footnote).

## Recent commits (unpushed, top down)
- `bc63586` docs: add lesson re Vercel Hobby cron best-effort behavior
- `c66d85c` chore: session shutdown — record LaunchAgent disable + workflow lesson
- `1b8d44e` chore: disable YouTube Studio scraper LaunchAgent
- `cdf553e` chore: session primer rewrite (planning-only session)
- `72419ce` chore: add three slash commands to .claude/commands/
- `6e4698f` docs: add .claude/agents/README.md
- `ad08ceb` chore: add .claude/settings.json
- `a3c08e5` chore: add four agents to .claude/agents/
- `f20caf1` chore: establish CLAUDE.md as project constitution
- `c6ce368` refactor: remove Views Over Time chart from DashboardView
- `5da96e7` fix: push date window to DB in `getAllPostsByDate` (1000-row cap fix)
- `187c335` data-layer fix wave (Dashboard read-side corrections)

## In progress
- Nothing.

## Blocked / next
- **Pending manual step (sudo)**: run `sudo pmset repeat cancel` to remove the 5:55AM repeating wake left by the disabled LaunchAgent. Cosmetic — nothing fires at 06:00 anyway since the plist is gone.
- **Q8iJ2gBujpY status unresolved**: to disambiguate (private vs deleted vs invalid), need OAuth. Either paste `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN` into local `.env.local` or run from a Vercel preview shell and re-query `https://www.googleapis.com/youtube/v3/videos?id=Q8iJ2gBujpY&part=status,snippet`.
- **Decision pending**: should the cron's `privacyStatus !== 'public'` filter (`youtube-longform-sync.ts:163`) be loosened to include `unlisted`? Currently 2 known unlisted videos are intentionally excluded. If unlisted analytics matter, change the filter; otherwise leave as-is.
- **Vercel cron reliability**: Hobby plan crons are best-effort. Options if long-form freshness matters more than Hobby can guarantee: (a) Vercel Pro, (b) external scheduler hitting the same endpoint, (c) accept occasional misses (the 1500-day lookback self-heals on next successful run).
- **Diagnostics drift-check** will continue to read yellow indefinitely on Shorts ingest freshness while the LaunchAgent is off. Intended.
- **Natural next action (CLAUDE.md title comment)**: still pending. One-line surgical edit, no build/lint needed.
- **Push question**: 12 unpushed commits on `main`. Shane's rule is "never push unless I say push to git."
- **To re-enable Shorts scraper**: restore plist contents (recorded in 2026-05-05 entry of prior primer / commit `1b8d44e`), `launchctl load`, `sudo pmset repeat wakeorpoweron MTWRFSU 05:55:00`. Note `pmset repeat` is global per machine — run `pmset -g sched` first to avoid clobbering. The 05:55 vs 06:00 lead is intentional.
- **Engine test gate**: clip-finder API endpoint + UI still gated.
- **Pre-existing**: `studio_snapshots` migration not yet applied to Supabase.
- **Pre-existing**: `scripts/youtube-studio-sync.test.ts:163` asserts VIDEO_MAP=19; actual=30 (harmless, stale).
- **Open `docs/data-layer-audit.md` items**: #4 Stats Grid Total Impressions, #6 Top Content fallback labeling, #9 studio_snapshots semantics, 6.7 write-side guard in `upsertPosts`, 6.8 rename `getLatestPostsPerClip` → `getLatestSnapshotPerClip` + JSDoc warning.
- **Possible follow-up**: orphan Supabase tables from prior tab-deletion (`weekly_reports`, `schedule_recommendations`, `performance_analyses`, breakdowns equivalents, `insights`) — decide whether to drop server-side.

## Footnotes for next session
- **Local YouTube API debugging**: `.env.local` has `YOUTUBE_API_KEY` only. The OAuth path used by the cron (`YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN` via `getAccessToken()` in `src/lib/youtube.ts`) lives only on Vercel. API key can resolve public + unlisted videos but NOT private ones. For full disambiguation, grab OAuth secrets from Vercel.
- **Manual cron trigger pattern**: source `.env.local` in a subshell, curl with `Authorization: Bearer $CRON_SECRET`, never echo the secret. The route at `/api/cron/youtube-sync-longform` is GET, idempotent (upserts), safe to re-run.
- **YouTube Analytics reporting lag**: ~3 days. Even on a successful daily cron, max stat_date will lag today by 2-3 days. Don't treat that as a bug.
