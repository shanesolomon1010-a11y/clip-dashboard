# CLAUDE.md

## Project context
Clip Studio Dashboard — Next.js single-page app (one route, view-state via `activeNav`) that ingests YouTube/social analytics into a normalized `posts` table and surfaces founder-facing reports. Hosted at https://clip-dashboard-two.vercel.app.

## Stack & deployment
- Next.js 14 App Router, TypeScript strict, Tailwind, Recharts.
- Supabase (Postgres) for persistence; client uses anon key in-browser.
- FFmpeg.wasm for client-side video processing in EditorView.
- Anthropic API called direct from browser (`claude-sonnet-4-20250514`, requires `anthropic-dangerous-direct-browser-access: true`).
- Vercel for deploy; two crons in `vercel.json` (`/api/cron/youtube-sync`, `/api/cron/youtube-sync-longform`).

## Session protocol
- **Start:** read `memory/primer.md` (last session state), `tasks/lessons.md` (every rule applies), then `memory/project.md` / `decisions.md` / `preferences.md` / `cloudmemory.md` as needed.
- **During:** update the relevant `memory/*.md` after schema/format/architectural shifts. After any correction from Shane, append `[YYYY-MM-DD] | what went wrong | rule for next time` to `tasks/lessons.md`.
- **End:** rewrite `memory/primer.md` with Status / Just completed / In progress / Blocked-next.

## Conventions
- Surgical edits — don't rewrite working code while fixing one thing — because cosmetic churn buries the real diff and breaks `git blame`.
- No `any` types, ever — because ESLint `no-explicit-any` is enforced and Recharts tooltip props must be typed explicitly.
- Remove unused imports the moment they go unused — because `no-unused-vars` will fail the build.
- `'use client'` at the top of every component using hooks or browser APIs — because the App Router defaults to server components and silently breaks otherwise.
- Use `PLATFORM_COLORS` / `PLATFORM_LABELS` from `src/types/index.ts` — because hardcoding hex/strings creates per-view drift.
- All icons live inline-SVG in `src/components/Icons.tsx` — because installing an icon library bloats the bundle for shapes we already have.
- Dates are `YYYY-MM-DD` strings, `engagementRate` is 0–100 not a decimal — because every existing read assumes that and silent format drift is the worst class of bug here.
- `data-testid` on every interactive element — because Playwright is the only test surface and selectors break otherwise.
- **Sidebar hide pattern: comment in `NAV_GROUPS[].items`, NOT in `NAV_ITEMS`** — because commenting out `NAV_ITEMS` entries leaves icon imports unused and breaks the build via `no-unused-vars`. `NAV_GROUPS.items` is the visibility filter; `NAV_ITEMS` is the catalog. Re-enable = uncomment one id. Used in 927ae6b + a8a18e4.

## Don'ts
- **Never push to git unless Shane says "push to git"** — because pushes are visible to others and a normal "commit this" doesn't authorize publication.
- **Even when Shane says "push to git", commit but don't invoke `git push` yourself — his global deny rule blocks it** — because the denied tool call creates a permission prompt that goes nowhere and the command has to be re-run manually anyway; surface the commit hash + push command, Shane runs it.
- **Never run schema changes (DDL: CREATE / ALTER / DROP / migrations) via Claude Code's Supabase MCP tools** — because schema changes route through the Supabase SQL Editor manually so Shane can review them; commit migration files to `supabase/migrations/` and apply them by hand.
- **Never run data writes (DML: INSERT / UPDATE / DELETE, including via `mcp__supabase__execute_sql`) without explicit per-call approval** — because a TRUNCATE on `posts` wiped real data and the dashboard kept showing phantom rows from cache; writes must be explicit, never assumed. Read-only `SELECT` / `EXPLAIN` / `COUNT` for diagnostics is fine without asking.
- **Never paste secrets, API keys, or access tokens into chat** — because they get echoed back into the transcript and project memory; edit them directly into the destination file (`settings.json`, `.env`, etc.) via the editor instead. This burned us with the Supabase access token on 2026-05-04 and a leaked Google API key in a malformed `.env` filename earlier.
- **The legacy Playwright LaunchAgent scraper (`scripts/youtube-studio-sync.ts` + .sh + .test.ts + .plist) was deleted on 2026-05-18** — historical context: it wrote cumulative-as-delta, was unloaded 2026-05-05, then deleted as inert risk. Vercel cron `/api/cron/youtube-sync` is the sole production source. Don't recreate the LaunchAgent. If a future YT-sync flow ever needs a local fallback, build something new that respects delta semantics from the start (lessons.md 2026-04-29 + 2026-04-27).
- **Never write lifetime/cumulative totals into `posts.views`** — because that column is daily-delta; the YouTube Merger CSV bug stamped lifetime totals there and produced "8K one day, 2.5K the next" volatility.
- **Never reuse Shorts' upsert conflict key for long-form** — because long-form `posts` rows have NULL `clip_details_code` by design and a `clip_code` that IS the video title (16 distinct titles, 1:1 with `content_id`). The old framing ("MBM016 has 12 clips") referred to Shorts' episode-level grouping — long-form is per-video. Use a partial unique index on `content_id WHERE content_type='long_form'` for long-form-specific writes (lessons.md 2026-04-27, corrected 2026-05-17).
- **Vercel cron `/api/cron/youtube-sync` is the sole production source for Shorts.** The LaunchAgent fallback was deleted on 2026-05-18 (see rule above). Diagnostics endpoint's `last_scraper_run` will read RED forever; that's expected (lessons.md 2026-04-28 superseded 2026-05-17).
- **Manual curl is not a valid cron-context test** — because manual curls from your terminal hit the public production URL (`clip-dashboard-two.vercel.app`) with no Vercel deployment protection, while scheduled crons hit the protected alias domain where the protection wall sits. The two paths differ. For any fix tied to cron-alias routing or deployment protection, wait for the next scheduled tick or use the Vercel dashboard's "Run Cron Job" button — not curl. Confirmed empirically 2026-05-19 (manual curl succeeded, scheduled ticks 401'd, same code; see lessons.md 2026-05-18 Bearer entry, superseded 2026-05-19).
- **Never use `.not('col', 'like', PATTERN)` against a nullable column without an `.or('col.is.null,col.not.like.PATTERN')` clause** — because `NOT LIKE NULL` evaluates to NULL → row excluded. Long-form rows have NULL `clip_details_code` by design (3,698 of them); the naive filter would have silently zeroed founder-report long-form metrics (caught in review 2026-05-14).
- **No em-dashes in user-facing copy (UI strings, social captions, exports)** — because em-dashes are a known AI tell and reduce trust in human-written content. Internal markdown files are unaffected.
- **Before writing to any new table, audit RLS posture** (`SELECT relname, relrowsecurity` on `pg_class` + `pg_policy` for the table) — because Supabase enables RLS by default on new tables with NO policies, silently blocking the anon client. The IG cron returned 500 "No instagram_auth row found" for an existing row on 2026-05-15 because of this. Server-side writes to RLS-blocked tables need a service-role client.
- **Never instantiate the service-role Supabase client at module level in `src/lib/db.ts`** — because `db.ts` is imported by 13 frontend components, and module-level `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` would put server-only env references into the client bundle. Use a lazy in-function helper, or contain service-role to server-only files (`src/lib/instagram.ts` is server-only-imported and safe for a module-level `supabaseAdmin`).
- **Derive composite metrics at read time, don't store sums of other columns** — because storing pre-summed values creates dual-source-of-truth drift when component fields update without the sum being recomputed. Example: Meta defines `total_interactions` for Reels as `likes + comments + shares + saves` — compute in queries, don't add a denormalized column.
- **Avoid supabase-js `.not('col', 'is', null)` for newly-added text columns** — the client returned `[]` from the Vercel runtime despite raw curl on the same PostgREST URL returning rows. Root cause unidentified; suspected client-runtime quirk specific to recent schema additions. Default to fetch-all-then-JS-filter (`rows.filter(r => r.col != null)`) for any null-check filter in cron hot-paths or aggregation functions. Bit us 4 times in 2026-05-17 session (88d6a92 getInstagramRegistry, 07bec9e getShortsRegistry, ce23a65 + 1d25889 getTotalViewsPerClip, founder-report SELECT precedent).
- **Keying contract has FOUR sweeps, not three** — when changing a key-construction strategy (clip_code → clip_details_code, etc.), audit (1) PRODUCER (db function that aggregates `map.set(key, ...)`), (2) LOOKUP (consumers reading `totalsMap[key]`), (3) POPULATION (consumer useEffects writing `map[key] = t`), (4) RENDERING (JSX displaying the label via `{post.clip_code}` etc.). The rendering sweep is the easiest to skip because it doesn't break tests — it just shows wrong labels. Bit us repeatedly across the 2026-05-17 D4 unification (commits 6572803 missed population, 5e16e3e fixed rendering). Use the shared `clipKey()` / `displayClipCode()` helpers in `db.ts` so the contract is enforced by import, not by discipline.
- **Never recommend a data backfill or schema fix from a UI-symptom report without first tracing the rendering code path to confirm the column you'd touch is the one the UI reads** — because "symptom names a column" is an expensive assumption. On 2026-05-18 the "Video URL not set yet" modal placeholder was attributed to NULL `posts.url` rows; backfilled 208 rows successfully but the modal kept showing the placeholder because it reads `clip_details.video_url`, not `posts.url`. The real fix was a one-line modal change (wire the dead `post` prop, add fallback). Always grep for the exact rendered text or trace the data flow from the rendering component back to its source column before recommending a data fix.
- **Never trust "migration applied" without a catalog verification** — because Supabase SQL Editor can partial-apply (or hit an error you don't notice) and leave the trigger/function/policy absent from `pg_proc` / `pg_trigger` / `pg_policy`. On 2026-05-22 the `posts_updated_at_trigger` appeared applied but wasn't, and ~30 min of "the fix doesn't work" debugging followed. After any manual DDL, immediately run a catalog query confirming the object exists before any verification firing.
- **Never conflate `cron_runs.status='success'` with "writes landed in the target table" — they're distinct invariants.** The cron may have completed (function returned, finishCronRun ran) without any persistence happening (RLS block, silent upsert no-op, write to wrong table, trigger gap, etc.). Diagnostics that answer "did the cron complete?" must be paired with a check that answers "did data land in the target row's `updated_at`?" Bit us 2026-05-22 — IG cron reported success+57 rows for 3 days while `posts.updated_at` stayed frozen because the upsert was UPDATE-only and the BEFORE UPDATE trigger didn't exist yet. Backstop check shipped 2026-05-25 as `write_correlation` in `src/lib/diagnostics.ts` (commit 08386b0).
- **Migrating a `PENDING-*` clip_details row to a mapped code (e.g. `MBM###-CLIP-###`) must DELETE the PENDING row BEFORE setting `content_id` on the new MBM row** — because `clip_details.content_id` has a UNIQUE constraint and setting it on the MBM row while the PENDING row still holds it fails. Correct 4-step order: (1) INSERT MBM shell with `content_id=NULL`, (2) UPDATE posts to re-key from `PENDING-{vid}` to `MBM###-CLIP-###`, (3) DELETE the PENDING `clip_details` row, (4) UPDATE clip_details SET content_id on the MBM row. Bit us in Phase 2A planning 2026-05-25; the resulting SQL pattern lives in primer.md and handoff doc.
- **Never re-key `posts.clip_details_code` from `PENDING-IG-{id}` to `MBM###-CLIP-###` without also setting `clip_details.instagram_content_id` on the MBM row and deleting the PENDING-IG `clip_details` row in the same transaction** — because the IG cron's `getInstagramRegistry()` filters `clip_details` by non-null `instagram_content_id`, which post-Phase-2B lives ONLY on PENDING-IG rows (MBM rows have it NULL by design — `clip_details.content_id` holds the YT video_id; there's no native cross-platform slot). Re-keying posts alone leaves the cron iterating over stale `PENDING-IG-{id}` registry entries, upserting with the old `clip_details_code`, missing the now-MBM-keyed posts row, falling back to INSERT, and colliding on `posts_contentid_platform_statdate_key`. Full forward-migration order: (1) UPDATE clip_details SET instagram_content_id={igid} on the MBM row, (2) UPDATE posts.clip_details_code → MBM###-CLIP-###, (3) DELETE the PENDING-IG clip_details row. Bit us 2026-05-25: prior-session re-key in Phase 2B did only (2); IG cron failed 17:00 + 23:00 UTC ticks with 23505; revert SQL restored `posts.clip_details_code` to `PENDING-IG-{id}` (technical debt — real fix is cross-platform mapping refactor, captured in next-session priority 2).
- **Auto-mapper is known-broken until follow-up: `src/lib/shorts-discovery.ts:72-88` matches `MBM###-CLIP-###` against `snippet.tags`, which is always empty on this channel.** Every new YT short auto-creates a PENDING row by design. Planned fix: switch to `fileDetails.fileName` (YT Studio filename carries the clip code; requires `part=fileDetails` and may require additional OAuth scope). Until shipped, expect daily PENDING growth of ~1 YT short + ~4-7 IG reels. Plan doc at `docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md:36` notes the empty-tags observation.

## Critical architecture rules

### `posts` is daily-delta, not cumulative
Each row is one `(content_id|clip_details_code, platform, stat_date)` slice. `views` = views on that day, not lifetime. Any writer that has a "total_views" or "lifetime" column must compute the delta or skip the write — never substitute it for `views`.

### `DEFAULT now()` only fires on INSERT, never UPDATE
For a true "last touched" timestamp on UPDATE paths, add a `BEFORE UPDATE` trigger. Bit us on 2026-05-22: `posts.updated_at` had a column default that bumped only on first INSERT of a `(clip_details_code, platform, stat_date)` tuple. IG's 4×/day cron INSERTs once per UTC day and UPDATEs the next 3 ticks — `updated_at` stayed pinned for 18h+ while runs reported success. Fix shipped as migration `20260521_posts_updated_at_trigger.sql` (function `posts_set_updated_at` + trigger `posts_updated_at_trigger`). Any future table where `updated_at` must reflect UPDATE-time needs the same trigger pattern — column default alone is insufficient.

### Founder Report excludes PENDING; Dashboard includes — by design
`src/lib/founder-report.ts:80,110` applies `.or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')` to drop `PENDING-*` rows from founder-facing numbers. `getAllPostsByDate` (used by Dashboard) does NOT filter PENDING. The gap between Dashboard and Founder Report totals = un-mapped PENDING views (28 PENDING short rows / 1,876 views in the 30d window pre-2026-05-25 cleanup). Documented in Founder Report footer (1a05265). Don't "fix" this discrepancy by removing the filter without explicit direction — founder-facing surfaces should only count finalized clips. NULL `clip_details_code` (long-form rows by design) is explicitly allowed through via the `is.null` branch.

### Three aggregation functions, three distinct jobs (`src/lib/db.ts`)
- `getLatestPostsPerClip(platform?)` — one row per `(clip_code, platform)` at latest `stat_date`, with back-fill for agent-only fields. Use for "current state of each clip." **Do not** use to compute windowed sums; latest-row-only systematically under-reports by ~30× over 30d.
- `getAllPostsByDate(platform?, startDate?, endDate?)` — all daily rows in a window, **with date filter pushed to the DB layer**. Use for any 7d/30d/custom-window sum (Dashboard, Founder Report).
- `getTotalViewsPerClip(platform?)` — lifetime sum of daily deltas grouped by `(clip_code, platform)`. Use for "lifetime per clip" leaderboards (ContentView, PlatformsView, ComparisonView).

### Supabase 1000-row response cap
SELECT silently truncates at 1000 rows. Two defenses, applied per call-site:
- **Window callers**: push date filters at the DB layer (`.gte('stat_date', start).lte('stat_date', end)`) so the window naturally clips below 1000 — the original incident clipped 327 newest rows and silently zeroed out Dashboard 7d (commit `5da96e7`, primer.md 2026-05-01).
- **Aggregation callers** where bounds can't shrink the dataset (lifetime totals, "All Time", etc.): **paginate**. Pattern: `PAGE = 1000` + `.range(from, from+999)` loop with stable `.order()` + break-on-short-page. Same shape as `/api/founder-report`. Bit us 3 times in the 2026-05-17 session (b131a62 `getAllPostsByDate` unbounded "All Time", ce23a65 + 1d25889 `getTotalViewsPerClip` extension and re-extension). **Always include `.order()`** — pagination without ordering is undefined behavior and can skip/duplicate rows.

### Upsert conflict keys (different per writer)
- Shorts → `posts`: `onConflict: 'clip_details_code,platform,stat_date'` (`upsertPosts`).
- Long-form → `posts`: `onConflict: 'content_id,platform,stat_date'` (`upsertLongFormPosts`); long-form has NULL `clip_details_code`.
- Breakdowns: `onConflict: 'content_id,platform,stat_date,dimension_type,dimension_value'`.
- Long-form catalog → `long_form_videos`: `onConflict: 'video_id'`.
- `clip_details` manual edits (`upsertClipDetail`): `onConflict: 'clip_code'`.
- `clip_details` PENDING discovery (`registerPendingShort`): `onConflict: 'content_id'` — **must be a regular UNIQUE constraint, not a partial unique index**, because PostgREST can't use partial indexes as ON CONFLICT targets via `?on_conflict=col`. First attempt used a partial unique index and silently 400'd in prod 2026-05-14 (lessons.md 2026-05-14).
- Postgres rejects multi-row upserts that share a conflict key (error 21000); dedupe in JS first (`youtube-longform-sync.ts:336`).

### Single-route shell
`src/app/page.tsx` owns global state (`posts`, `activeNav`) and renders one `<*View>`. Views don't share filter state; each does its own `useMemo` filtering. New views go in `src/components/views/`, register in `Sidebar.tsx`'s `NavSection` / `NAV_ITEMS` / `NAV_GROUPS`, and a render branch in `page.tsx`.

### CSV ingestion (`src/lib/normalizers.ts`)
`parseCSV` → `detectPlatform(headers)` (case-sensitive column signatures) → per-platform normalizer → `UnifiedPost`. Adding a platform: extend `Platform` union, `PLATFORM_COLORS`, `PLATFORM_LABELS`, `detectPlatform`, the switch, and the normalizer. IDs are `{platform}-{slug}-{index}-{timestamp}` and dedup is by `id` equality.

## Commands
```bash
npm run dev         # localhost:3000
npm run build       # build + tsc + lint — must pass before commit (replaces tests)
npm run lint        # ESLint
npx tsc --noEmit    # type-check only
```
No unit tests; build pipeline is the gate. Playwright e2e screenshots in `tests/screenshots/`.

## Relevant docs
- `memory/primer.md` — start here every session.
- `tasks/lessons.md` — every rule applies before writing code.
- `docs/data-layer-audit.md` — open data-layer items (#4, #6, #9, 6.7, 6.8 still pending per primer).
- `docs/clip-finder-engine-v2.md` — clip-finder system prompt source.
- `docs/design-system/mediabuyer-design.md` — design system reference.
- `docs/superpowers/plans/` & `docs/superpowers/specs/` — implementation plans & specs.
