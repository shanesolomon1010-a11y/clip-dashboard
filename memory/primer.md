# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `cf3b8b5` on `main` — the Option B refactor extracting `buildDiagnostics` into a shared lib (`src/lib/diagnostics.ts`) and dropping the inter-route HTTP fetch from `/api/cron/diagnostics-alert`. **Deployed and verified live** by manual curl at 18:17 UTC returning `HTTP/2 200 {"alerted":false,"red_paths":[]}` from the new bundle.

The close commit landing right after this primer carries the lessons + CLAUDE.md updates + this rewrite + `memory/cloudmemory.md` (post-commit-hook auto-dirty). The close commit is **unpushed**; Shane pushes manually after reviewing the handoff.

### Commits shipped this session
- `cf3b8b5` refactor(cron): extract buildDiagnostics into shared lib, drop inter-route fetch

### Commits unpushed on `main`
- The close commit being made now (memory/lessons/CLAUDE.md hygiene).

## Just completed

### Option B refactor (cf3b8b5)
Background: the 2026-05-18 4e80c0f fix tried to bypass Vercel deployment protection by propagating `Authorization: Bearer ${cronSecret}` to the diagnostics-alert's secondary fetch to `/api/diagnostics`. **Two consecutive scheduled ticks (1 AM and 7 AM UTC) both 401'd despite the Bearer header.** Manual curls succeeded because they hit the public URL, not the protected alias. Hypothesis empirically wrong.

Refactor surface:
- **`src/lib/diagnostics.ts` (new, ~530 lines):** runtime-agnostic `buildDiagnostics(options?: BuildDiagnosticsOptions): Promise<DiagnosticsResponse>`. Owns all 7 check builders (cron_health, data_freshness, schema_integrity, internal_consistency, drift_check, coverage, scraper_history), all helpers, and all types. No `Request`, no `NextResponse`, no header reads. `BuildDiagnosticsOptions` takes the 5 thresholds + `origin` (consumed only by `buildInternalConsistency` for the founder-report sub-fetch).
- **`src/app/api/diagnostics/route.ts`** (slim, ~37 lines): parses 5 threshold query params, calls `buildDiagnostics({ ..., origin: new URL(request.url).origin })`, wraps in `NextResponse.json` with the existing `Cache-Control: public, s-maxage=60, stale-while-revalidate=30` header. Response shape and 500 error wrapping unchanged. No app-level auth (verified during session — the prior 401s were Vercel protection, not a route gate).
- **`src/app/api/cron/diagnostics-alert/route.ts`:** dropped the `fetch(${origin}/api/diagnostics)` block and the Bearer-workaround comment. Calls `buildDiagnostics({ origin })` directly in-process. Top-level Bearer auth on the cron route itself, `KNOWN_RED_PATHS`, Slack message format, missing-webhook skip-with-200 all preserved.

Verification: `npm run build` clean (Next 14.2.35, 22/22 static pages, no type or lint errors). Manual curl at 18:17 UTC returned 200 with new bundle headers. **True cron-context verification was still pending at session close** — see carryover #1.

### Stale-bundle alert diagnosed by message-format inspection (no code action)
After cf3b8b5 deployed, the 12:00 UTC scheduled tick produced a Slack message reading `"diagnostics-alert cron: /api/diagnostics returned 401"`. Investigation outcome:
- cf3b8b5 committed at 17:09 UTC (12:09 PM CDT) — ~5h **after** the 12:00 UTC tick fired.
- The string `"/api/diagnostics returned 401"` only exists in pre-cf3b8b5 source. The new bundle uses `"buildDiagnostics threw"` on the same catch path.
- Conclusion: stale-bundle alert, no code action. Captured as lessons.md technique (2026-05-19, second entry).

### Diagnostics + cron coverage audit (research only, no code)
Produced a comprehensive gap-analysis report on what `/api/diagnostics` currently covers vs what the YT/IG cron failure modes actually surface. Output:
- **7 checks currently covered** (the existing `buildDiagnostics` shape).
- **8 high-priority gaps identified** — top 3: IG sync coverage (currently zero on diagnostics), per-clip anomaly detection (10× day-over-day view jumps, watch_time > views × max_duration), token-expiry early warning + cron-completion signal.
- **Prioritized 7-step build queue** with complexity estimates and per-step Shane-action items.

Report lives in conversation history; not committed as a doc file (per project convention: tasks/notes live in conversation unless explicitly persisted).

## In progress
None. The audit produced a build queue but Shane scoped the session as research, not building.

## Carryover for next session

### 1. Option B fix — final cron-context verification still pending
The 18:00 UTC scheduled tick (first cron-context invocation of the new bundle) had not yet been observed when the session closed. Check Slack for any `:rotating_light:` or `:warning:` message dated 2026-05-19 18:00 UTC or later. Two outcomes map to two next actions:

- **Silent OR only-pre-existing-mute-list paths in alert** → full fix held end-to-end. Move on to the build queue.
- **`internal_consistency.status` listed in red_paths** → the founder-report sub-fetch is the open layer. The `buildInternalConsistency` call inside `buildDiagnostics` still makes one HTTP hop to `/api/founder-report`, which in cron context hits the same Vercel-protection 401. Two ways to resolve:
  - (a) one-line mute: add `'internal_consistency.status'` to `KNOWN_RED_PATHS` in `src/app/api/cron/diagnostics-alert/route.ts`. Cheap but silences a real consistency check.
  - (b) ~30-min refactor: extract `/api/founder-report`'s computation into `src/lib/founder-report.ts`, call it in-process from `buildInternalConsistency`. Preserves the check. **Recommend (b).**

### 2. Diagnostics gap queue (from this session's audit)
Build queue, ordered by recommended ship order (full details in audit report — conversation history):

1. **C1 — IG sync coverage** (~30 min, small, no schema). Extend cron_health + data_freshness + schema_integrity with IG-specific subfields. Pure addition to `src/lib/diagnostics.ts`.
2. **C7 — internal_consistency cron-context fix** (one-liner mute OR ~30-min extract). See carryover #1.
3. **C5 — anomaly check** (~1.5h, medium). New `buildAnomalyCheck()` flagging views > 100× previous day, watch_time > views × 1.0, etc. Returns top 5 anomalous rows in response so the Slack alert is actionable.
4. **C6 — postToSlack error handling + daily heartbeat** (~20 min). Meta-alerting hygiene: detect when the alerter itself can't deliver.
5. **C2 — token expiry early warning** (~30 min). IG token has structured expiry in `instagram_auth.token_expiry`; compute days remaining, surface yellow/red.
6. **C8 — duplicate-row schema check** (~30 min). `GROUP BY (clip_details_code, platform, stat_date) HAVING COUNT(*) > 1` — joins existing schema_integrity card.
7. **C3 + C4 — cron_runs table + error surfacing** (bigger, needs migration). Replaces the "rows updated_at" proxy with a real "did this cron complete?" signal.

Open questions Shane should weigh in on before C3 (cron_runs schema shape) and C5 (anomaly thresholds).

### 3. IG `avg_view_duration_seconds` populate check (carried from prior session)
24h+ after the 2026-05-18 433ff73 IG-sync expansion, run:
```sql
SELECT COUNT(avg_view_duration_seconds) FROM posts WHERE platform='instagram';
```
> 0 confirms the new metric is flowing.

### 4. Dashboard Avg View Duration UI math flip (carried, deferred)
Once IG AVD data has accumulated, decide whether to drop the "YouTube only" caption + IG → "N/A" override. Open question: tolerate the daily-YT-AVD vs lifetime-IG-AVD semantic mismatch, or split into a separate `lifetime_avg_view_duration_seconds` column?

## Known non-issues (don't escalate)
- **Pre-deploy scheduled ticks 401ing.** The Vercel protected-alias 401s from 12:00 UTC and earlier ran the pre-cf3b8b5 bundle. Don't re-debug.
- **The 4 KNOWN_RED_PATHS** (`cron_health.last_scraper_run.status`, `scraper_history.status`, `data_freshness.studio_snapshots_latest_stat.status`, `coverage.status`). Structural fallout from scraper deletion 2026-05-18; all explicitly muted in the alerter.
- **`/api/diagnostics` has no route-level auth.** Verified during this session. The cron-context 401s were Vercel deployment protection, not an app-level gate.
- **YT cron `stat_date` trailing today by 2-3 days** — intrinsic YouTube Analytics API reporting lag, not a cron failure.

## Data shape facts (still current — no schema changes this session)
- **5,123 YT posts rows** across 69 distinct clip keys, 0 orphans.
- **269 IG posts rows.** New rows since 433ff73 populate `avg_view_duration_seconds`; historical rows stay NULL.
- **5,392 total posts rows.** Lifetime YT view total per `getTotalViewsPerClip('youtube')` = 138,800.

## Architectural pattern established this session
**Computation that's callable from both an HTTP route and a cron should live in a runtime-agnostic lib** (no `Request` / `NextResponse` / header reads). The HTTP route is a thin wrapper; the cron calls the lib directly. Precedent: `src/lib/diagnostics.ts` (cf3b8b5). Avoids the Vercel deployment-protection trap entirely. Same pattern likely applies to `/api/founder-report` if C7's option (b) is taken.

## Next natural action (in priority order)
1. **Check Slack for the 18:00 UTC + 00:00 UTC ticks** before doing anything else. The outcome decides whether C7 needs the bigger fix or just the one-line mute.
2. **Push the close commit** (`git push origin main`).
3. **Pick C1 (IG diagnostics coverage)** as the first build queue item — fastest, smallest, highest value-per-line.

## Blocked / open
- Supabase MCP write tools (`apply_migration`, `execute_sql` for DML) still blocked. Manual SQL Editor workflow for DDL/DML. Read-only SELECT for diagnostics fine without asking.
