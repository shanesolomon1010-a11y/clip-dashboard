# scripts/

One-shot utilities. Run via `npx tsx scripts/<name>.ts`.

- `fill-posting-schedule.ts` — backfills `scheduled_posts` from existing content.
- `instagram-insights-probe.ts` — manual diagnostic that hits the IG Graph API and prints per-Reel insights to `probe-output/`. Read-only; safe to re-run.

## Removed

- `youtube-studio-sync.ts` + `.sh` + `.test.ts` + `com.clipstudio.youtubesync.plist` (deleted 2026-05-18). The Playwright LaunchAgent scraper was unloaded 2026-05-05 in favor of the Vercel cron at `/api/cron/youtube-sync`. Deleting the inert files removed the risk of someone re-loading the LaunchAgent and re-introducing the cumulative-vs-delta volatility from April. See CLAUDE.md.
