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

## Don'ts
- **Never push to git unless Shane says "push to git"** — because pushes are visible to others and a normal "commit this" doesn't authorize publication.
- **Even when Shane says "push to git", commit but don't invoke `git push` yourself — his global deny rule blocks it** — because the denied tool call creates a permission prompt that goes nowhere and the command has to be re-run manually anyway; surface the commit hash + push command, Shane runs it.
- **Never run schema changes (DDL: CREATE / ALTER / DROP / migrations) via Claude Code's Supabase MCP tools** — because schema changes route through the Supabase SQL Editor manually so Shane can review them; commit migration files to `supabase/migrations/` and apply them by hand.
- **Never run data writes (DML: INSERT / UPDATE / DELETE, including via `mcp__supabase__execute_sql`) without explicit per-call approval** — because a TRUNCATE on `posts` wiped real data and the dashboard kept showing phantom rows from cache; writes must be explicit, never assumed. Read-only `SELECT` / `EXPLAIN` / `COUNT` for diagnostics is fine without asking.
- **Never paste secrets, API keys, or access tokens into chat** — because they get echoed back into the transcript and project memory; edit them directly into the destination file (`settings.json`, `.env`, etc.) via the editor instead. This burned us with the Supabase access token on 2026-05-04 and a leaked Google API key in a malformed `.env` filename earlier.
- **Never run `scripts/youtube-studio-sync.ts` end-to-end as a verification step** — because its full pipeline writes to `posts` and pollutes shared state (lessons.md 2026-04-29). Test isolated steps or use a dry-run.
- **Never write lifetime/cumulative totals into `posts.views`** — because that column is daily-delta; the YouTube Merger CSV bug stamped lifetime totals there and produced "8K one day, 2.5K the next" volatility.
- **Never reuse Shorts' upsert conflict key for long-form** — because long-form rows share `clip_code` (e.g. MBM016 has 12 clips); use a partial unique index on `content_id WHERE content_type='long_form'` (lessons.md 2026-04-27).
- **Never assume the Vercel cron is the data source for Shorts** — because the local Playwright scraper at `scripts/youtube-studio-sync.ts` (LaunchAgent) is the actual source; check `.plist` / `scripts/` before blaming the cron (lessons.md 2026-04-28).
- **Never use `.not('col', 'like', PATTERN)` against a nullable column without an `.or('col.is.null,col.not.like.PATTERN')` clause** — because `NOT LIKE NULL` evaluates to NULL → row excluded. Long-form rows have NULL `clip_details_code` by design (3,698 of them); the naive filter would have silently zeroed founder-report long-form metrics (caught in review 2026-05-14).
- **No em-dashes in user-facing copy (UI strings, social captions, exports)** — because em-dashes are a known AI tell and reduce trust in human-written content. Internal markdown files are unaffected.

## Critical architecture rules

### `posts` is daily-delta, not cumulative
Each row is one `(content_id|clip_details_code, platform, stat_date)` slice. `views` = views on that day, not lifetime. Any writer that has a "total_views" or "lifetime" column must compute the delta or skip the write — never substitute it for `views`.

### Three aggregation functions, three distinct jobs (`src/lib/db.ts`)
- `getLatestPostsPerClip(platform?)` — one row per `(clip_code, platform)` at latest `stat_date`, with back-fill for agent-only fields. Use for "current state of each clip." **Do not** use to compute windowed sums; latest-row-only systematically under-reports by ~30× over 30d.
- `getAllPostsByDate(platform?, startDate?, endDate?)` — all daily rows in a window, **with date filter pushed to the DB layer**. Use for any 7d/30d/custom-window sum (Dashboard, Founder Report).
- `getTotalViewsPerClip(platform?)` — lifetime sum of daily deltas grouped by `(clip_code, platform)`. Use for "lifetime per clip" leaderboards (ContentView, PlatformsView, ComparisonView).

### Supabase 1000-row response cap
SELECT silently truncates at 1000 rows. Always push window filters via `.gte('stat_date', start).lte('stat_date', end)` rather than fetching everything and filtering in JS — the cap clipped 327 newest rows and silently zeroed out Dashboard 7d (commit `5da96e7`, primer.md 2026-05-01).

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
