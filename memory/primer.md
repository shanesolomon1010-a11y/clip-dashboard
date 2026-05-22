# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `83c8df7` on `main`, **all pushed**. Local matches origin/main. Two major fixes shipped + the 6-item proactive-alerting build queue from May 19 fully landed:

1. **6-item diagnostics buildout** (May 19) — IG sync coverage, IG token expiry, anomaly detection, duplicate-row schema check, Slack hardening + daily heartbeat, cron_runs tracking + completion check.
2. **YT shorts maxDuration bump 60s → 300s** (May 21) — scheduled tick was hitting Vercel's 60s timeout and stuck in `running` status; raised to 5× headroom.
3. **`posts.updated_at` BEFORE UPDATE trigger** (May 22) — `DEFAULT now()` was bumping INSERT-only, leaving `updated_at` frozen on every ON CONFLICT DO UPDATE. IG cron silently wrote successfully for 3 days without bumping the column. Trigger + function shipped via `supabase/migrations/20260521_posts_updated_at_trigger.sql`, applied manually in SQL Editor, verified end-to-end with both IG and YT shorts manual fires (lag dropped to <50s vs NOW).

### Commits shipped this multi-session arc
- `d3d9032` refactor(diagnostics): extract founder-report into shared lib, drop inter-route fetch
- `356b9bf` feat(diagnostics): IG sync coverage + IG token expiry checks
- `264cb80` feat(diagnostics): anomaly detection + duplicate-row schema check
- `ea0958e` feat(cron): Slack hardening + daily heartbeat + anomaly inline
- `1571582` feat(cron): cron_runs tracking + completion check
- `034643f` fix(cron): bump YT shorts maxDuration to 300s
- `83c8df7` chore(db): add posts.updated_at BEFORE UPDATE trigger migration

Plus the close commit landing right after this primer (memory + lessons + CLAUDE.md hygiene). All unpushed at session close, per protocol.

## Just completed

### IG silent-writes bug (root cause + fix)
3-day mystery: IG cron reported `status='success', rows_processed=57` while `MAX(posts.updated_at)` stayed pinned at 11:00 UTC May 21. Diagnostics surfaced it as `cron_health.last_instagram_sync` ratcheting to "19h ago" overnight despite the alerter showing all crons running. Root cause: `posts.updated_at` had `DEFAULT now()` but no `BEFORE UPDATE` trigger. ON CONFLICT DO UPDATE on the same `(clip_details_code, platform, stat_date)` tuple updates the row in place but doesn't fire column defaults — `updated_at` is never written by the UPDATE path. IG writes only today's stat_date, so the first daily INSERT bumps `updated_at`; the subsequent 3 ticks UPDATE the same row and leave it pinned. YT was masked because YT Analytics' 2–3 day reporting lag means each daily cron brings in NEW stat_dates → INSERTs → DEFAULT now() fires cleanly.

Fix: `BEFORE UPDATE` trigger on `posts` that sets `NEW.updated_at = now()`. Migration `20260521_posts_updated_at_trigger.sql`. One existing caller (`youtube-longform-sync.ts:394`) writes `updated_at` explicitly to `posts`; on INSERT the caller's value wins (no trigger fires), on UPDATE the trigger overrides — both end up "approximately the cron run time", which is the contract diagnostics has always assumed.

Initial migration apply via Supabase SQL Editor silently failed — `pg_proc` and `pg_trigger` were empty after Shane said "applied". 30 min of "the fix doesn't work" debugging until catalog query revealed the trigger absent. Shane re-ran successfully on second attempt. Verified end-to-end:
- IG fire: 58 rows touched, MAX(updated_at) 7.87s behind NOW(), 161ms after cron `finished_at`.
- YT shorts fire: 227 rows (all UPDATEs — YT lag means no new stat_dates today), 46s lag.
- `/api/diagnostics` `cron_health.last_instagram_sync.status: green`, `hours_ago: 0`.

### YT shorts 60s timeout (mitigated)
14:00 UTC scheduled ticks on May 20 + May 21 left `cron_runs` rows stuck in `status='running'` with no `finished_at`. Vercel killed the function at 60s before `finishCronRun` ran. Fix: bump `vercel.json` `maxDuration` for `/api/cron/youtube-sync` to 300s (Pro tier). Other crons unchanged. May 22 14:00 UTC scheduled tick ran 61s and succeeded — either deploy timing or Vercel grace margin; can't strictly confirm 300s deploy state from this single data point. Next scheduled tick on the fresh bundle is the clean test.

### 6-item diagnostics buildout (May 19 session — fully landed)
Detailed in commits above. Quick map of what each adds to `/api/diagnostics`:
- **C1**: `cron_health.last_instagram_sync`, `data_freshness.posts_instagram_latest_stat`, `schema_integrity.posts_instagram_null_content_id_count`.
- **C2**: new `auth_health.instagram` top-level field — surfaces IG token `days_remaining` (RED ≤3, YELLOW ≤14).
- **C5**: new `anomaly_check` top-level field — view spikes >100× day-over-day, watch_time > views × 1.0, negative metrics, view decay (skipping first 3 days post-upload). Top 5 anomalies returned inline; Slack alert includes them when `anomaly_check.status` is RED.
- **C8**: 3 new duplicate-row counts in `schema_integrity` (shorts/longform/IG).
- **C6**: `postToSlack` hardened (throws on non-2xx, caught at call sites with console.error). Daily heartbeat at 00:00 UTC tick with green/yellow/red counts + last-sync hours.
- **C3+C4**: new `cron_runs` table (migration `20260519_cron_runs.sql`, applied) + `src/lib/cron-runs.ts` with `startCronRun` / `finishCronRun` (sentinel-0 fallback for missing-table). All 4 cron routes wrapped. New `cron_completion` top-level field reads `cron_runs` for actual "did this cron finish?" signal, independent of `posts.updated_at`.

Plus Commit 1A (May 19): extracted `/api/founder-report` computation into runtime-agnostic `src/lib/founder-report.ts` so `buildInternalConsistency` calls it in-process instead of via HTTP — eliminates the Vercel deployment-protection 401 risk for the last surviving inter-route fetch. Pattern precedent: cf3b8b5 `src/lib/diagnostics.ts`.

## In progress
None.

## Carryover for next session

### 1. Backstop diagnostic — `rows_processed > 0 ⇒ updated_at moved`  [PRIORITY 1]
The IG silent-writes bug would have been caught immediately by a check correlating `cron_runs` windows against the corresponding `posts.updated_at` distribution. Shape: per cron, find the most recent `cron_runs` row with `status='success' AND rows_processed > 0`; check that `posts.updated_at >= cron_runs.started_at` exists for at least one row matching the cron's platform/content_type filter. If not, that's a silent-write event — RED.

Implementation plan:
- New `buildWriteCorrelation()` in `src/lib/diagnostics.ts`.
- 4 sub-checks: `youtube-sync` → posts WHERE platform='youtube' AND content_type='short'; `youtube-sync-longform` → posts WHERE platform='youtube' AND content_type='long_form'; `instagram-sync` → posts WHERE platform='instagram'; `diagnostics-alert` exempted (doesn't write data).
- New `write_correlation` top-level field in `DiagnosticsResponse`.
- Wire into the Slack alerter's red-paths walker automatically — no new KNOWN_RED_PATHS needed.

### 2. `schema_integrity.status` red-vs-green mystery (May 19, unresolved)
On May 19 verification, `diagnostics-alert` reported `red_paths: ["schema_integrity.status"]` while `/api/diagnostics` returned `schema_integrity.status: green` — deterministic divergence, same deployment, same call to `buildDiagnostics()`. Debug commit `09eb51a` was created to add a `_debug` field surfacing the cron-context data shape but never pushed and was later dropped via `git reset --hard HEAD~1`. The data may have shifted enough since then that the divergence is no longer reproducible. If it recurs, the next session should resurrect the debug-instrumentation approach: temporary `_debug` field on the cron response showing the actual `data.schema_integrity` object the cron sees.

### 3. YT shorts 300s maxDuration — full validation pending
The May 22 14:00 UTC scheduled tick ran 61s with success — we can't tell from that data point alone whether the 60s → 300s bump was deployed in time or whether Vercel allowed 1–2s grace. Validate by checking the next several 14:00 UTC scheduled ticks for `duration_sec` values that exceed 60s comfortably (e.g., 70s+ with success). If they cluster at 55–61s, ambiguous. If any exceed 60s with success, fix confirmed live.

### 4. Stuck `cron_runs.running` row from 11:00 UTC May 22 IG sync
One IG scheduled tick (started_at 2026-05-22 11:00:27, finished_at NULL) is stuck. Probably hit a function timeout. Doesn't affect `cron_completion` (which reads most-recent-success, not most-recent-anything), but a permanent leak. Periodic cleanup query needed eventually:
```sql
DELETE FROM cron_runs WHERE status='running' AND started_at < NOW() - INTERVAL '1 hour';
```
Defer until accumulation matters (currently 3 stuck rows total — 2 YT shorts from May 20/21 pre-fix, 1 IG from May 22).

### 5. IG `cron_completion.instagram_sync` thresholds may need tightening
Current: RED at 12h, YELLOW when last_run_errors > 0 OR status in ('partial', 'failed'). With IG running 4×/day (every 6h), the 12h RED threshold means we miss exactly 2 consecutive failures before alerting. That's probably too generous. Consider 8h (one missed cycle + buffer). Defer until we have data on real-world IG cron reliability.

## Known non-issues (don't escalate)
- **`last_scraper_run`, `studio_snapshots_latest_stat`, `coverage`, `scraper_history`** all read RED forever — Playwright LaunchAgent scraper deletion fallout from 2026-05-18. Explicitly muted in `KNOWN_RED_PATHS` set in `src/app/api/cron/diagnostics-alert/route.ts`.
- **YT cron `stat_date` trailing today by 2–3 days** — intrinsic YouTube Analytics API reporting lag, not a cron failure (CLAUDE.md / lessons.md 2026-05-18).
- **`/api/diagnostics` has no route-level auth.** Verified during this session. Vercel deployment protection is the only gate on production.
- **One row stuck in `cron_runs.status='running'` from 11:00 UTC May 22 IG tick** — see carryover #4.
- **`cron_health.last_youtube_sync_short.status: yellow` (16h ago)** at session close — that timestamp will refresh on the next scheduled 14:00 UTC tick. Not a real signal.

## Data shape facts (current)
- **499 IG posts rows** (up from 269 on May 19) — IG cron been running 4×/day, accumulating ~50/day.
- **58 IG rows per daily cycle** (Reels currently active).
- **YT shorts MAX(stat_date) = 2026-05-18, MAX(updated_at) = 2026-05-22 15:52** — lag is normal YT Analytics behavior; updated_at now bumps correctly post-trigger.
- **YT longform MAX(stat_date) = 2026-05-18, sync writes ~3700 rows per daily run.**
- **`cron_runs` table** has ~50 rows as of session close, mostly diagnostics-alert (4×/day) + IG (4×/day).

## Architectural patterns established this multi-session arc
- **Computation callable from both an HTTP route and a cron lives in a runtime-agnostic lib** (no `Request` / `NextResponse` / header reads). HTTP route is a thin wrapper; cron calls the lib directly. Avoids Vercel deployment-protection 401s. Precedents: `src/lib/diagnostics.ts` (cf3b8b5), `src/lib/founder-report.ts` (d3d9032).
- **Cron observability has two layers**: `cron_runs` (function-completion signal) and `posts.updated_at` (writes-landed signal). Both are necessary; neither replaces the other. The backstop check (carryover #1) is the missing correlation layer.
- **All `posts` upserts now bump `updated_at` on UPDATE** via the new BEFORE UPDATE trigger. Code-level discipline (passing `updated_at: now()` to upsertPosts) is no longer required for the invariant to hold.

## Next natural action (in priority order)
1. **Build the backstop write-correlation check** (carryover #1). Highest value-per-line for catching silent-write bugs going forward.
2. **Monitor next 1–2 days of 14:00 UTC YT shorts ticks** for duration distribution. Confirm 300s bump is live.
3. **Address `schema_integrity` mystery** if it recurs. Otherwise leave as a known historical anomaly.

## Blocked / open
- Supabase MCP write tools (`apply_migration`, `execute_sql` for DML) still blocked. Manual SQL Editor workflow for DDL/DML. Read-only SELECT for diagnostics fine without asking.
