# Audit Report

_Generated 2026-04-30. Read-only audit; no code changed._

This report covers all 10 categories specified in the audit brief. Findings are
ranked by severity. Each item names the file/line, what's wrong, and a
recommended one-line fix — but **no fixes were applied**. Shane decides what to
fix.

---

## CRITICAL (fix before next deploy)

### 1. `NEXT_PUBLIC_DASHBOARD_SECRET` is bundled into the public client JS — auth is theatre on most "auth-guarded" routes
- **Files (server):** `src/app/api/{youtube-sync,youtube-sync-longform,import/clips,library/sync-urls,library/scan,insights,insights/analyze,insights/schedule-optimizer,insights/weekly-report,social-copy/generate,social-copy/export-docx,transcribe}/route.ts` (12 routes verify a header)
- **Files (client, leaks the value):** `src/components/views/{ClipReviewView.tsx:190, InsightsView.tsx:239,283,309, SocialCopyView.tsx:113,159, SettingsView.tsx:101,132,154,196,254}`
- **Description:** Server reads `process.env.DASHBOARD_SECRET`. Client sends the same value via the header `x-dashboard-secret`, sourced from `process.env.NEXT_PUBLIC_DASHBOARD_SECRET`. The `NEXT_PUBLIC_` prefix means Next.js inlines this value into the JS bundle that any visitor downloads. Anyone who loads `clip-dashboard-two.vercel.app` can extract the secret from devtools → Sources or the Network tab and call any of these 12 endpoints — including the ones that mutate posts, clip_details, and write social-copy / weekly-report / analytics-sync data. Effective auth = "you must have visited the homepage."
- **Recommended fix:** Replace dashboard-secret auth with a real session model (Supabase Auth, NextAuth, or even basic-auth at the Vercel edge). Until then, treat all 12 endpoints as if they had no auth at all.

### 2. `POST /api/library/set-video-url` is unauthenticated and uses the SERVICE_ROLE key to write
- **File:** `src/app/api/library/set-video-url/route.ts:6-30`
- **Description:** Endpoint accepts `{ clip_details_code, video_url }` and updates `clip_details.video_url` using `SUPABASE_SERVICE_ROLE_KEY`. No header check, no session check, no Vercel cron auth, no rate limit. Anyone on the internet can rewrite any clip's video URL.
- **Recommended fix:** Add the same `DASHBOARD_SECRET` check the sibling `library/sync-urls` route has — but note finding #1 first; the dashboard secret pattern is itself broken.

### 3. `POST /api/ai-proxy` is unauthenticated and burns the server's Anthropic key
- **File:** `src/app/api/ai-proxy/route.ts:10-30`
- **Description:** Accepts arbitrary `model`, `max_tokens`, `messages` from the request body and forwards to `https://api.anthropic.com/v1/messages` using `process.env.ANTHROPIC_API_KEY`. No auth, no rate limit, no input validation on `max_tokens`. A single attacker can send `max_tokens: 200000` requests in a loop and burn through Anthropic credits arbitrarily fast.
- **Recommended fix:** Require auth, cap `max_tokens` server-side, and add rate limiting (or remove the route — see finding #16, AIInsightsView is dead).

### 4. `POST /api/analyze-script` is unauthenticated and burns the server's Anthropic key
- **File:** `src/app/api/analyze-script/route.ts:198-235`
- **Description:** Same shape as #3. Hits `claude-opus-4-5` with `max_tokens: 3000` per call. No auth, no rate limit. Cheaper per-call than #3 but still unbounded. Note: this route also has no try/catch — a parse error in the Claude response (`JSON.parse(clean)` at the bottom) will throw and Next.js will return a default 500 to the caller, but the server-side log will surface the raw API output which may include user-supplied script text. Low-grade observability hazard, not a leak.
- **Recommended fix:** Require auth + rate limit. Wrap the Anthropic call in try/catch.

### 5. `POST /api/youtube/sync` is unauthenticated, writes to `posts`, and is an unused duplicate of the auth-guarded `/api/youtube-sync`
- **File:** `src/app/api/youtube/sync/route.ts` (entire file)
- **Description:** No client code references this URL (verified by grep). The auth-guarded route at `/api/youtube-sync` (hyphen, not slash) is what UI calls. This duplicate has no `DASHBOARD_SECRET` check; anyone can trigger a YouTube Analytics sync that writes to `posts`. Consequences are bounded (only writes to clips already in `posts.content_id`), but it's still an unguarded write endpoint that consumes YouTube API quota.
- **Recommended fix:** Delete the file. The slash form is unused and was likely superseded by the hyphen form.

### 6. The repo root has `.env.localAIzaSyDX8F7IsgLmX2XlhxsHIcSEY0cRlLwgatw` — **the filename appears to contain a real Google API key** and is not gitignored
- **File:** `/Users/shane/clip-dashboard/.env.localAIzaSyDX8F7IsgLmX2XlhxsHIcSEY0cRlLwgatw`
- **Description:** The file is 31 bytes, content is harmless (`YOUTUBE_API_KEY=paste-key-here`). The **filename** ends in `AIzaSyDX8F7IsgLmX2XlhxsHIcSEY0cRlLwgatw` — that's the canonical 39-char Google API key shape (`AIzaSy` prefix + 33 alphanumeric chars). Likely created by a copy-paste error in the shell that concatenated a real key onto the filename. The `.gitignore` pattern `.env*.local` does NOT match this filename (it must end with `.local`, this ends in `…gatw`), so a future `git add .` would commit it — and the key would land in public git history. The filename is also visible in every `ls`, every `git status` output, every screenshot of this directory, and was already echoed into earlier session memory files.
- **Recommended fix:** Treat the filename's key portion as compromised. Rotate the matching Google API key in GCP Console, then `rm` the file. (Both decisions are Shane's per the audit brief — flagging only.)

---

## HIGH (fix soon)

### 7. RLS DISABLED on multiple tables — verify anon role grants don't allow writes
- **Files:** `supabase/migrations/20260424_post_breakdowns.sql`, `…performance_analyses.sql`, `…weekly_reports.sql`, `…social_copy_generations.sql`, `…schedule_recommendations.sql`, `20260429_studio_snapshots.sql`
- **Description:** All these tables have `DISABLE ROW LEVEL SECURITY`. With RLS off, PostgREST falls back to Postgres GRANT permissions. Supabase's default project setup grants the `anon` role broad access on the `public` schema (the exact set depends on your project's initial config). If `anon` has INSERT/UPDATE/DELETE, the public anon key (which is correctly published to the client at `src/lib/supabase.ts:4`) lets anyone on the internet write to these tables. I cannot verify this from migration files alone — needs a `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated')` check in Supabase SQL Editor.
- **Recommended fix:** Run the GRANT inspection query. If anon has INSERT/UPDATE/DELETE on any of these, either re-enable RLS with explicit policies or REVOKE the unwanted privileges.

### 8. `/api/diagnostics` and `/api/founder-report` are unauthenticated and leak operational data
- **Files:** `src/app/api/diagnostics/route.ts`, `src/app/api/founder-report/route.ts`
- **Description:** Both are GET, both hit `posts` and aggregate. Diagnostics returns 30 clip codes, drift percentages, sync timestamps, scraper run history. Founder Report returns aggregated views, watch-hours, subscriber deltas. Neither requires auth. Anyone with the deployment URL can scrape revenue-relevant numbers and clip identifiers. (I built `/api/diagnostics` per Phase 3 spec — Shane explicitly didn't ask for auth on it. Flagging now so it's a deliberate decision rather than an oversight.)
- **Recommended fix:** Decide whether either is sensitive. If yes, either gate behind real auth (post finding #1 fix) or move both to a server-rendered page that requires session auth.

### 9. No rate limiting anywhere
- **Files:** none — there is no rate-limit dependency or middleware in `package.json` / `src/middleware.ts` (no middleware file exists)
- **Description:** None of the 26 API routes throttle requests. Consequences depend on the route: AI-proxy and analyze-script can burn Anthropic credits unbounded; library writes can DoS Supabase; YouTube-sync routes can exhaust YouTube API quota. Even the read-only routes (founder-report, diagnostics) are an N+1 query risk if hit in a loop.
- **Recommended fix:** Install `@upstash/ratelimit` (works with Vercel KV) and gate the AI proxies + writes. Read-only routes can stay unrate-limited if you're confident in the small audience.

### 10. `npm audit`: 7 high-severity vulnerabilities
- **Output:** `npm audit --audit-level=high` reports 7 high, 3 moderate, 0 critical. The high vulns are all transitive: `next` (chain), `picomatch` (ReDoS via extglob; method-injection in POSIX char classes), `glob`, `flatted`, `@xmldom/xmldom`, `@next/eslint-plugin-next`, `eslint-config-next`.
- **Description:** Most are reachable only via the Next.js build pipeline, not at request time, so the practical risk is low for a small private dashboard. The `picomatch` ReDoS could matter if any user input flows through a glob — none does in this codebase that I could find. `@xmldom/xmldom` is a transitive of `mammoth` (the .docx parser used by `/api/import/clips`); user-uploaded .docx files DO flow through it, so the XXE/parser risks are real for that one specific endpoint.
- **Recommended fix:** `npm audit fix` (no breaking changes) handles `picomatch`. The `next` vulns require `--force` and a major-version bump (14 → 16) — defer until you're ready for that migration.

### 11. Multiple API routes have no try/catch — unhandled rejections fall through to Next.js's default 500
- **Files:** `src/app/api/{auth/route.ts, analyze-script/route.ts, ai-proxy/route.ts, video-times/route.ts, transcribe/route.ts, social-copy/export-docx/route.ts, social-copy/generate/route.ts, auth/url/route.ts, auth/callback/route.ts, library/set-video-url/route.ts, library/sync-urls/route.ts, library/scan/route.ts, youtube/status/route.ts}` — 13 routes
- **Description:** Next.js's default 500 page does NOT leak stack traces in production, so this isn't a security leak. It IS an observability problem: unhandled errors don't get a `console.error` log line tagged with route name, so finding them in Vercel logs requires sifting through generic crash reports.
- **Recommended fix:** Add `try { … } catch (err) { console.error('[<route-name>] error:', err); return NextResponse.json({error: 'Internal error'}, { status: 500 }); }` to each. Don't surface the raw `err.message` to the client (see finding #14).

---

## MEDIUM (worth fixing eventually)

### 12. Eight dead component files in `src/components/`
- **Files (verified not imported anywhere in src/):**
  - `src/components/TopBar.tsx`
  - `src/components/ViewsLineChart.tsx`
  - `src/components/MetricCard.tsx`
  - `src/components/BestTimeCard.tsx`
  - `src/components/PlatformBarChart.tsx`
  - `src/components/GoalsSection.tsx`
  - `src/components/views/AIInsightsView.tsx`
  - `src/lib/sampleData.ts`
- **Description:** Verified by `grep -rl "from .*['\"]…<basename>['\"]" src/`. None of these are imported. Notably `AIInsightsView.tsx` is the AI Insights view that `CLAUDE.md` describes as a current view — but the codebase no longer imports it, so the description is stale. `ViewsLineChart` and `PlatformBarChart` are also described in `CLAUDE.md` but unused. They appear to have been replaced by inline charts in other views.
- **Recommended fix:** Delete the eight files. Update `CLAUDE.md` to remove the references to `AIInsightsView`, `ViewsLineChart`, `PlatformBarChart`. Bonus: the page bundle will shrink.

### 13. `/api/video-times` is unused dead code that burns YouTube quota if discovered
- **File:** `src/app/api/video-times/route.ts`
- **Description:** Not called from any client code (verified). Reads YouTube videos.list with the channel's OAuth token. Has its own outdated copy of `VIDEO_MAP` (only 19 entries vs. the canonical 38 in `src/lib/youtube-sync.ts`). If hit, it returns clip codes + publish timestamps and consumes a YouTube API call.
- **Recommended fix:** Delete the route. The duplicated `VIDEO_MAP` is also a maintenance hazard — adding clips in one place silently misses the other.

### 14. API routes return raw `error.message` to the client — leaks DB schema details
- **Files:** `src/app/api/{youtube-sync, library/set-video-url, youtube-sync-longform, import/clips, cron/youtube-sync, cron/youtube-sync-longform, founder-report}/route.ts`
- **Description:** On error the routes return `{ error: error.message }`, where `error.message` can be a Postgres error like `"duplicate key value violates unique constraint \"posts_contentid_platform_statdate_idx\""` — that string tells an attacker the index name and column. Not catastrophic on a personal dashboard, but a leak.
- **Recommended fix:** Log the full error server-side (`console.error(err)`) and return a generic message client-side (`{ error: 'Internal error' }`).

### 15. `/api/insights/route.ts:7` — falls back to anon key if SERVICE_ROLE missing
- **File:** `src/app/api/insights/route.ts:7` — `const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;`
- **Description:** Silent fallback. Insights is read-only so anon may be sufficient, but if `SUPABASE_SERVICE_ROLE_KEY` is ever unset (e.g. a misconfigured env in a preview deploy), this route silently uses the anon role with whatever permissions that role has. Reads will work; any future write added here would silently fail without auth. It also masks "missing env var" misconfigurations.
- **Recommended fix:** Drop the fallback. Either it needs SERVICE_ROLE (then crash if missing) or it doesn't (then use the shared `@/lib/supabase` anon client).

### 16. CSP only restricts `media-src`
- **File:** `next.config.js:8`
- **Description:** The Content-Security-Policy header is `media-src 'self' https://bfpjexlmoqoacoglqugl.supabase.co`. There's no `script-src`, `connect-src`, `default-src`, etc. So if any user-controllable data ever lands inside a `<script>` or unsafe HTML, there's no CSP defense. Also: the Supabase project ref is hardcoded in the CSP — fine, but means the CSP needs editing if you ever migrate Supabase projects.
- **Recommended fix:** Tighten the CSP. At minimum: `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://api.anthropic.com https://*.googleapis.com; …`. Test thoroughly before merging — restrictive CSPs love to break Recharts and Next.js inline scripts.

### 17. Many `// eslint-disable-line react-hooks/exhaustive-deps`
- **Files:** `src/app/page.tsx:47`, `src/components/views/PostingScheduleView.tsx:145`, `src/components/views/SettingsView.tsx:82,246`, `src/components/views/EditorView.tsx:292`
- **Description:** Each disables the exhaustive-deps lint check for a `useEffect`. Sometimes correct (effects that should only run on mount), sometimes the start of stale-closure bugs. Each is a micro-decision worth eyeballing.
- **Recommended fix:** Audit each of the 5 sites — if the effect genuinely runs once, replace `[deps]` with a comment explaining why; if it should re-run, fix the dep array.

### 18. ScriptAnalyzerView has an open TODO
- **File:** `src/components/views/ScriptAnalyzerView.tsx:77`
- **Description:** `// TODO: surface error state` — when the script analysis call fails, the UI silently does nothing.
- **Recommended fix:** Add a red error banner or toast. (Only TODO/FIXME in the entire codebase.)

---

## LOW (cosmetic / cruft)

### 19. `VIDEO_MAP` is duplicated and the duplicate has drifted
- **Files:** `src/lib/youtube-sync.ts:7-38` (canonical, 38 entries) and `src/app/api/video-times/route.ts:7-25` (stale, 19 entries)
- **Description:** The duplicate is missing 19 entries. Even if the route is deleted (finding #13), this pattern means new clips added to `youtube-sync.ts` won't propagate elsewhere unless someone remembers there were copies.
- **Recommended fix:** After deleting the duplicate route (or instead of), export `VIDEO_MAP` from `src/lib/youtube-sync.ts` as a named export and import it everywhere else.

### 20. Pre-existing test failure in `scripts/youtube-studio-sync.test.ts`
- **File:** `scripts/youtube-studio-sync.test.ts:163`
- **Description:** Asserts `VIDEO_MAP: has exactly 19 entries` but the actual scraper VIDEO_MAP has 30. This has been failing since clips grew past MBM015. Already documented in this session's `memory/primer.md`. Doesn't affect production — `npm run build` doesn't run this test.
- **Recommended fix:** Either delete the assertion or replace with a "≥ 30" sanity check.

### 21. ESLint disables for `<img>` instead of `next/image` (×2)
- **Files:** `src/components/views/ClipGrid.tsx:165`, `src/components/views/LibraryView.tsx:51`, `src/components/views/EditorView.tsx:627` (this third one warns at build time but isn't disabled)
- **Description:** Three uses of `<img>`. Two suppress the warning, one doesn't. Cosmetic — `next/image` would help LCP and bandwidth, but for a dashboard with a small number of users this is noise.
- **Recommended fix:** Either migrate to `next/image` or add the eslint-disable to the third site so the build is clean.

---

## NOT ISSUES (false positives — explicitly cleared during audit)

- **Anon Supabase key in `src/lib/supabase.ts`**: this is the public anon key, intended to be exposed client-side. RLS or GRANT permissions are what protect data. Per the audit brief's own rule: "Supabase ANON keys are SAFE to expose client-side." (See finding #7 for the related-but-different RLS audit.)
- **Service role key never reaches the client**: verified — every `SUPABASE_SERVICE_ROLE_KEY` reference is inside `src/app/api/*` route handlers (server-only). No `'use client'` component imports it.
- **No `: any` types in production code**: only matches were the literal word "any" in test name strings (`'aggregateStatus: any yellow → yellow'`). Zero real `: any` annotations or `as any` casts.
- **No `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`**: zero hits across `src/` and `scripts/`.
- **No `dangerouslySetInnerHTML` or `innerHTML`**: zero hits.
- **No `.rpc()` or raw SQL**: zero hits. All Supabase queries use the parameterized JS client.
- **No empty `catch {}` blocks**: zero hits.
- **Cron auth (`CRON_SECRET`) is correctly server-only**: verified — no `NEXT_PUBLIC_CRON_SECRET`, the cron routes verify a `Bearer ${CRON_SECRET}` header that Vercel auto-injects. This is the proper pattern.
- **No secrets in committed git history**: searched git history with `git log --all -p --pickaxe-regex -S` for `AIzaSy`, `sk-ant-`, `service_role`. Zero matches. The only secret-shaped string ever in the repo is the `.env.localAIzaSy…` filename in the working tree (finding #6) and it was never tracked.
- **TSC clean**: `npx tsc --noEmit` exits 0 with no output.
- **Cron schedules in `vercel.json`** are correct: `0 14 * * *` (Shorts), `30 14 * * *` (long-form), `0 14 * * 1` (weekly report). All 14:00–14:30 UTC, no overlap on the same minute.
- **Race conditions on upserts**: verified all upsert paths use `onConflict` with a key matched by a real DB unique constraint. The long-form pipeline at `src/lib/youtube-longform-sync.ts:338-342` explicitly dedupes within a single batch (per the lessons.md note about Postgres error 21000 from same-batch duplicates). No new race conditions surfaced.
- **`/api/video-proxy`** has hostname allowlist (`*.supabase.co`) — proper SSRF defense. Cleared.
- **`console.error` calls don't leak auth tokens or secrets**: hits for "token" / "key" / "secret" all turned out to be Anthropic input-token *count* estimates, not auth tokens. Cleared.

---

## Summary

- **TSC:** clean
- **Build:** passes
- **CRITICAL findings:** 6 (all auth-related: secret-in-bundle, 4 unauthed write/proxy endpoints, key-in-filename)
- **HIGH findings:** 5
- **MEDIUM findings:** 7
- **LOW findings:** 3
- **Cleared as not-issues:** 13

The pattern: this codebase is a **personal dashboard** that's been treated as if it were behind auth, but in practice it's deployed publicly on Vercel with auth that's only as secret as the URL itself. Most CRITICAL findings collapse into a single decision: **do you want this dashboard to require login?** If yes, install Supabase Auth or NextAuth and gate the whole app at the layout level — that fixes findings #1, #2, #3, #4, #5, #8 in one move. If no (single-user, security-by-obscurity is acceptable), at minimum: rotate the Google key in finding #6, delete the duplicate dead routes in #5/#13, and add rate limiting to the AI proxies (#9).

Audit was time-boxed; categories 1, 2, 3, 5, 6, 7, 9, 10 were thoroughly checked. Categories 4 (SQL injection) and 8 (Next.js config) had narrower surface area and are essentially clean. Category 9 (race conditions) relied on reading every upsert call site rather than running concurrent stress tests.
