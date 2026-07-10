# Market Research Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily pipeline that tracks competitor clip accounts across TikTok/Instagram/YouTube, detects outperformers, runs a Gemini vision extractor over them (and over MBM's own clips) into a controlled taxonomy, and surfaces a playable Feed + a gap-analysis view in the dashboard.

**Architecture:** Two Vercel crons (`research-collect` metadata poll, `research-analyze` bounded vision batch) writing three RLS-enabled Supabase tables, plus a one-time own-clip backfill script and one new single-route dashboard view. A shared extractor module (`research-extract.ts`) is the seam: the same code analyzes competitor and own clips into `research_analyses`. Follows the existing `cron_runs` / `supabaseAdmin` / diagnostics patterns exactly.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + service-role client), Google Gemini API (video input, `MEDIA_RESOLUTION_HIGH`), ScrapeCreators API, yt-dlp + ffmpeg (own-clip backfill), Tailwind, Recharts.

## Global Constraints

- **No `any` types.** ESLint `no-explicit-any` fails the build. Type everything.
- **Remove unused imports immediately** — `no-unused-vars` fails the build.
- **Gate:** `npm run build` (build + tsc + lint) must pass before every commit. There is **no unit-test runner** — verification is the build plus targeted probe scripts / SQL queries. Do not invent a jest/pytest harness.
- **Gemini calls MUST set `mediaResolution: "MEDIA_RESOLUTION_HIGH"`** — this is a correctness requirement (low res inverts colors and fabricates highlights; proven 2026-07-09).
- **Pin a concrete Gemini model id + fallback chain**; record `model` + `prompt_version` on every analysis row. Never a bare `-latest` alias as the only identifier.
- **Own-clip views come from `getTotalViewsPerClip()`**, never `SUM(posts.views)` (posts is daily-delta).
- **Own-clip video source is `posts.url`** (90 YT shorts), NOT `clip_details.video_url` (only 17/146 populated).
- **No `.not('col','is',null)`** in any Supabase query — fetch-then-JS-filter.
- **Paginate every unbounded read** with `.range()` + a stable `.order()` (1000-row cap).
- **Never select `clip_details.thumbnail_base64`** from anon/PostgREST — use `thumbnail_url`.
- **No em-dashes** in any user-facing string (UI copy). Internal code comments/markdown exempt.
- **Schema DDL** is applied by Shane via the Supabase SQL Editor from committed migration files, then catalog-verified — NEVER via MCP write tools. DML writes need explicit per-call approval.
- **Never push to git** — surface the commit hash + push command; Shane pushes.
- **Secrets** (`SCRAPECREATORS_API_KEY`) are edited into `.env.local` by Shane directly, never pasted into chat.
- **`'use client'`** at the top of every component using hooks/browser APIs.
- **RLS enabled** on all three new tables from day one: anon-read, service-role-write.
- **`updated_at` needs a BEFORE UPDATE trigger** — a column default only fires on INSERT.

## File Structure

**Create:**
- `supabase/migrations/20260710_research_engine.sql` — 3 tables, indexes, RLS policies, `updated_at` triggers.
- `src/lib/research-extract.ts` — the vision extractor (Gemini call + taxonomy contract + JSON parse/validate). The seam shared by both crons and the backfill.
- `src/lib/research-db.ts` — typed reads/writes for the three tables (upsert videos, select unanalyzed, write analysis, gap aggregation).
- `src/lib/scrapecreators.ts` — thin ScrapeCreators adapter: per-platform account fetch → normalized `CollectedVideo[]`.
- `src/lib/research-collect.ts` — orchestrates collection: poll accounts, upsert videos, recompute medians/outperformance.
- `src/lib/research-analyze.ts` — orchestrates a bounded analysis batch.
- `src/app/api/cron/research-collect/route.ts` — cron entry (auth + cron_runs wrapper).
- `src/app/api/cron/research-analyze/route.ts` — cron entry.
- `scripts/research-probe.mjs` — the 20-clip fidelity gate (standalone, mirrors the initial probe).
- `scripts/research-backfill-own.mjs` — one-time own-clip backfill (mirrors `ig-fresh-pull.mjs`).
- `src/components/views/ResearchView.tsx` — Feed + Gaps tabs.
- `src/components/Icons.tsx` — add `IconResearch` (inline SVG).

**Modify:**
- `src/lib/cron-runs.ts:3` — extend `CronName` union with the two new crons.
- `src/lib/diagnostics.ts` — add `research_collect` / `research_analyze` to `write_correlation`.
- `src/components/Sidebar.tsx` — add nav item + group entry.
- `src/app/page.tsx` — add render branch + `NavSection` wiring.
- `vercel.json` — register two crons + `maxDuration`.
- `CLAUDE.md` — document the new subsystem under conventions/architecture.

---

### Task 1: Database migration (3 tables, RLS, triggers)

**Files:**
- Create: `supabase/migrations/20260710_research_engine.sql`

**Interfaces:**
- Produces: tables `research_accounts`, `research_videos`, `research_analyses` with the columns named in the spec; a reusable `research_set_updated_at()` trigger function.

- [ ] **Step 1: Write the migration**

```sql
-- 20260710_research_engine.sql
-- Market Research Engine: competitor + own-clip craft analysis.
-- RLS enabled with explicit anon-read / service-role-write policies (NOT the
-- 14 wide-open legacy tables). updated_at maintained by BEFORE UPDATE trigger
-- because a column default only fires on INSERT.

CREATE TABLE IF NOT EXISTS research_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube')),
  handle TEXT NOT NULL,
  cohort TEXT NOT NULL CHECK (cohort IN ('niche','craft')),
  active BOOLEAN NOT NULL DEFAULT true,
  follower_count BIGINT,
  trailing_median_views NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

CREATE TABLE IF NOT EXISTS research_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES research_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  permalink TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  posted_at TIMESTAMPTZ,
  views BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  duration_sec NUMERIC,
  outperformance NUMERIC,
  analyze_attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS research_videos_account_idx ON research_videos(account_id);
CREATE INDEX IF NOT EXISTS research_videos_outperf_idx ON research_videos(outperformance DESC);

CREATE TABLE IF NOT EXISTS research_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('competitor','own')),
  research_video_id UUID REFERENCES research_videos(id) ON DELETE CASCADE,
  clip_details_code TEXT,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  media_resolution TEXT NOT NULL DEFAULT 'high',
  hook_type TEXT,
  framing TEXT,
  caption_style TEXT,
  gfx TEXT[],
  pacing JSONB,
  detail JSONB,
  recreate_brief TEXT,
  unlisted_observations TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS research_analyses_video_idx
  ON research_analyses(research_video_id) WHERE research_video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS research_analyses_own_idx
  ON research_analyses(clip_details_code) WHERE clip_details_code IS NOT NULL;

CREATE OR REPLACE FUNCTION research_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER research_accounts_updated_at BEFORE UPDATE ON research_accounts
  FOR EACH ROW EXECUTE FUNCTION research_set_updated_at();
CREATE TRIGGER research_videos_updated_at BEFORE UPDATE ON research_videos
  FOR EACH ROW EXECUTE FUNCTION research_set_updated_at();
CREATE TRIGGER research_analyses_updated_at BEFORE UPDATE ON research_analyses
  FOR EACH ROW EXECUTE FUNCTION research_set_updated_at();

ALTER TABLE research_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_videos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_accounts_anon_read ON research_accounts FOR SELECT TO anon USING (true);
CREATE POLICY research_videos_anon_read   ON research_videos   FOR SELECT TO anon USING (true);
CREATE POLICY research_analyses_anon_read ON research_analyses FOR SELECT TO anon USING (true);
-- service_role bypasses RLS; no write policy for anon (writes are service-role only).
```

- [ ] **Step 2: Verify it parses locally (dry syntax check)**

Run: `grep -c "CREATE TABLE" supabase/migrations/20260710_research_engine.sql`
Expected: `3`

- [ ] **Step 3: Hand off to Shane to apply**

Print: "Apply `supabase/migrations/20260710_research_engine.sql` in the Supabase SQL Editor, then run the catalog-verify query below. I will NOT apply DDL via MCP."

- [ ] **Step 4: Catalog-verify after Shane applies (read-only, allowed)**

Run this via `mcp__supabase__execute_sql` (read-only SELECT is permitted):
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'research_%';
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'research_%updated_at';
SELECT policyname FROM pg_policies WHERE tablename LIKE 'research_%';
```
Expected: 3 tables all `rowsecurity=t`; 3 triggers; 3 anon-read policies. Per the "never trust migration applied without catalog verification" rule.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260710_research_engine.sql
git commit -m "feat(research): migration for 3 research-engine tables + RLS + triggers"
```

---

### Task 2: Extractor module + 20-clip fidelity gate

This is the highest-risk task. It ends with a **manual review checkpoint** — do not proceed to Task 3 until Shane approves extractor output.

**Files:**
- Create: `src/lib/research-extract.ts`
- Create: `scripts/research-probe.mjs`

**Interfaces:**
- Produces:
  - `export const PROMPT_VERSION = 'v1'`
  - `export const GEMINI_MODEL_CHAIN: string[]` (fallback order)
  - `export interface TechniqueVector { hook_type, framing, caption_style, gfx: string[], pacing, detail, recreate_brief, unlisted_observations }` (all string/array/object fields per spec)
  - `export async function extractTechniques(videoBytes: Buffer, mimeType: string): Promise<{ vector: TechniqueVector; model: string; promptVersion: string }>` — sends video at `MEDIA_RESOLUTION_HIGH`, walks `GEMINI_MODEL_CHAIN` on 404/503, parses JSON, throws on unrecoverable failure.

- [ ] **Step 1: Write `src/lib/research-extract.ts`**

```typescript
const GEMINI_KEY = process.env.GEMINI_API_KEY;

export const PROMPT_VERSION = 'v1';

// Pinned concrete ids + fallback. gemini-2.5-flash is 404 for this key;
// gemini-3.5-flash / gemini-3-flash-preview 503 under load; gemini-flash-latest
// completed (verified 2026-07-10). Concrete-first so `model` is attributable.
export const GEMINI_MODEL_CHAIN = ['gemini-3.5-flash', 'gemini-flash-latest'];

const TAXONOMY_PROMPT = `You are a video production analyst. Watch this short-form vertical clip and describe its CRAFT: editing, graphics, typography, pacing. Ignore the topic/argument.

Return ONLY valid JSON (no markdown fence) matching:
{
  "hook_type": one of ["declarative","question","cold_open_punchline","stat","threat","story"],
  "framing": one of ["threat","opportunity","curiosity","authority"],
  "caption_style": one of ["none","static_block","word_pop","karaoke_highlight","keyword_color"],
  "gfx": subset of ["lower_third","headline_banner","progress_bar","data_viz","broll_overlay","zoom_punch","speaker_label","motion_bg","meme_cutaway","sfx_emphasis"],
  "pacing": { "avg_cut_sec": number, "zoom_count": number, "total_cuts": number },
  "detail": {
    "caption_detail": { "font_family_guess": string, "weight": string, "case": "upper"|"title"|"sentence", "position": string, "words_per_card": number, "highlight_color_hex": string|null, "stroke_or_shadow": string, "animation": string },
    "gfx_detail": [ { "element": string, "timestamp_sec": number, "description": string, "how_to_recreate": string } ],
    "color_grade": string,
    "framing_composition": string,
    "audio": { "music": boolean, "sfx_count": number, "notes": string }
  },
  "recreate_brief": "3-5 sentences telling an editor exactly how to rebuild this clip's look: colors, timings, easing, font weight. No vague words like dynamic or engaging.",
  "unlisted_observations": [ "notable things that did not fit the taxonomy above" ]
}
Be forensically specific, cite timestamps, use null when unsure. Do not guess.`;

export interface TechniqueVector {
  hook_type: string;
  framing: string;
  caption_style: string;
  gfx: string[];
  pacing: { avg_cut_sec: number; zoom_count: number; total_cuts: number };
  detail: Record<string, unknown>;
  recreate_brief: string;
  unlisted_observations: string[];
}

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

export async function extractTechniques(
  videoBytes: Buffer,
  mimeType: string,
): Promise<{ vector: TechniqueVector; model: string; promptVersion: string }> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
  const b64 = videoBytes.toString('base64');
  let lastErr = '';
  for (const model of GEMINI_MODEL_CHAIN) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: b64 } }, { text: TAXONOMY_PROMPT }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, mediaResolution: 'MEDIA_RESOLUTION_HIGH' },
        }),
      },
    );
    if (res.status === 404 || res.status === 503) { lastErr = `${model}: ${res.status}`; continue; }
    if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const text: string = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    const vector = JSON.parse(stripFence(text)) as TechniqueVector;
    return { vector, model, promptVersion: PROMPT_VERSION };
  }
  throw new Error(`All Gemini models unavailable: ${lastErr}`);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors from `research-extract.ts`.

- [ ] **Step 3: Write `scripts/research-probe.mjs` (the fidelity gate)**

The script reads a newline-delimited list of clip URLs (mixed platforms/cohorts), downloads each with `curl`, extracts 2 ffmpeg frames per clip to `scratchpad/`, calls the same Gemini contract as the module, and writes a side-by-side markdown report (`recreate_brief` + frame paths) to `/tmp/research-probe-report.md`. It duplicates the extractor prompt inline (Node script, no TS import) — acceptable for a throwaway gate. Reuse the proven probe shape from this session's `extract-probe.mjs`, adding: loop over URLs, `mediaResolution: 'MEDIA_RESOLUTION_HIGH'`, and frame extraction via `ffmpeg -vf "select='eq(n\\,30)+eq(n\\,300)'"`.

- [ ] **Step 4: Assemble ~20 clip URLs and run the probe**

Sources: MBM own clips from `posts.url` (query 8 YT shorts), plus competitor clips once Shane provides seed handles OR hand-picked public URLs spanning both cohorts. Run:
`node scripts/research-probe.mjs urls.txt`
Expected: `/tmp/research-probe-report.md` with one brief + 2 frames per clip.

- [ ] **Step 5: CHECKPOINT — review fidelity with Shane**

Open the report, spot-check each brief against its frames (colors, caption style, banner, cut count). This is the acceptance gate from the spec: "judged on whether its briefs match the pixels." If briefs are wrong on craft-cohort clips, iterate the prompt / add keyframe stills to the payload and re-run. **Do not commit crons until this passes.** Bump `PROMPT_VERSION` if the prompt changes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/research-extract.ts scripts/research-probe.mjs
git commit -m "feat(research): Gemini technique extractor (high-res) + fidelity probe"
```

---

### Task 3: research-db module

**Files:**
- Create: `src/lib/research-db.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` from `@/lib/instagram`; `TechniqueVector` from `@/lib/research-extract`.
- Produces:
  - `export interface ResearchAccount { id, platform, handle, cohort, active, trailing_median_views }`
  - `export interface CollectedVideo { external_id, permalink, thumbnail_url, caption, posted_at, views, likes, comments, shares, duration_sec }`
  - `export async function getActiveAccounts(): Promise<ResearchAccount[]>`
  - `export async function upsertVideos(accountId: string, platform: string, vids: CollectedVideo[]): Promise<number>` — upsert on `(platform, external_id)`.
  - `export async function recomputeAccountBaseline(accountId: string): Promise<void>` — sets `trailing_median_views` from that account's videos and updates each video's `outperformance`.
  - `export async function getAnalysisQueue(limit: number): Promise<{ id, platform, permalink, external_id }[]>` — `outperformance >= 1.5 AND analyze_attempts < 3` and no `research_analyses` row, ordered, limited.
  - `export async function writeAnalysis(row): Promise<void>` and `export async function bumpAttempts(videoId: string): Promise<void>`.
  - `export async function getGapData(): Promise<...>` — technique frequency by cohort + own.

- [ ] **Step 1: Write `research-db.ts`** with the functions above. Every multi-row read paginates with `.range(from, from+999)` + `.order('id')`. No `.not(...,'is',null)` — filter in JS. `upsertVideos` uses `.upsert(rows, { onConflict: 'platform,external_id' })`. `recomputeAccountBaseline` fetches the account's views, computes the median in JS, writes it, then updates `outperformance = views / median` per video.

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/research-db.ts
git commit -m "feat(research): typed DB layer for accounts/videos/analyses + gap agg"
```

---

### Task 4: ScrapeCreators adapter

**Files:**
- Create: `src/lib/scrapecreators.ts`

**Interfaces:**
- Consumes: `process.env.SCRAPECREATORS_API_KEY`; `CollectedVideo` from `@/lib/research-db`.
- Produces: `export async function fetchAccountVideos(platform: string, handle: string): Promise<CollectedVideo[]>` — one dispatch per platform to the correct ScrapeCreators endpoint, normalizing each platform's response fields into `CollectedVideo`. Throws on non-2xx so the caller can mark that account failed without aborting the run.

- [ ] **Step 1: Write `scrapecreators.ts`.** A `PLATFORM_ENDPOINT` map, a shared `scGet(path, params)` helper that injects the `x-api-key` header, and a per-platform normalizer (TikTok/IG/YouTube field names differ; map views/likes/comments/shares/duration/posted_at/permalink/thumbnail/external_id). Field mapping is verified against live responses in Step 3, so leave a `// FIELD MAP verified 2026-07-10` marker and use defensive `?? null`.

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live smoke test (needs `SCRAPECREATORS_API_KEY` set by Shane)**

Run a one-off: `node -e "import('./src/lib/scrapecreators.ts')"` is not viable (TS) — instead add a temporary `scripts/sc-smoke.mjs` that calls one known public handle per platform and prints the normalized output. Confirm views/duration/permalink populate for all three. Note IG view-count parity (spec risk). Delete the smoke script after.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scrapecreators.ts
git commit -m "feat(research): ScrapeCreators adapter with per-platform normalizers"
```

---

### Task 5: Collect orchestrator + cron route

**Files:**
- Create: `src/lib/research-collect.ts`, `src/app/api/cron/research-collect/route.ts`
- Modify: `src/lib/cron-runs.ts:3`

**Interfaces:**
- Consumes: `getActiveAccounts`, `upsertVideos`, `recomputeAccountBaseline` (Task 3); `fetchAccountVideos` (Task 4); `startCronRun`/`finishCronRun` (existing).
- Produces: `export async function runResearchCollect(): Promise<{ accounts: number; videos: number; failed: number }>`.

- [ ] **Step 1: Extend `CronName`**

In `src/lib/cron-runs.ts:3`, change the union to add `| 'research-collect' | 'research-analyze'`.

- [ ] **Step 2: Write `research-collect.ts`.** Loop accounts; per account `try { fetch → upsert → recompute } catch { failed++ }` so one dead handle can't abort the run. Return counts.

- [ ] **Step 3: Write the cron route** mirroring `youtube-sync/route.ts` exactly (Bearer `CRON_SECRET` check, `startCronRun('research-collect')`, `finishCronRun` with `'partial'` when `failed > 0` else `'success'`, `'failed'` on throw).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cron-runs.ts src/lib/research-collect.ts src/app/api/cron/research-collect/route.ts
git commit -m "feat(research): collect orchestrator + cron route (per-account isolation)"
```

---

### Task 6: Analyze orchestrator + cron route

**Files:**
- Create: `src/lib/research-analyze.ts`, `src/app/api/cron/research-analyze/route.ts`

**Interfaces:**
- Consumes: `getAnalysisQueue`, `writeAnalysis`, `bumpAttempts` (Task 3); `extractTechniques` (Task 2); `fetchAccountVideos`/a fresh-URL resolver (Task 4).
- Produces: `export async function runResearchAnalyze(batch: number): Promise<{ analyzed: number; failed: number }>`.

- [ ] **Step 1: Write `research-analyze.ts`.** Pull up to `batch` (10) queued videos. Per video: resolve a fresh video URL via ScrapeCreators (stored URLs are dead), `fetch` the bytes, `extractTechniques(buf, 'video/mp4')`, `writeAnalysis({ subject_type: 'competitor', research_video_id, model, prompt_version, ...vector })`. On any error: `bumpAttempts(id)`, `failed++`, continue.

- [ ] **Step 2: Write the cron route** (mirror Task 5 route; `runResearchAnalyze(10)`; `maxDuration` 300 registered in Task 9).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/research-analyze.ts src/app/api/cron/research-analyze/route.ts
git commit -m "feat(research): analyze orchestrator + cron route (bounded batch of 10)"
```

---

### Task 7: Own-clip backfill script

**Files:**
- Create: `scripts/research-backfill-own.mjs`

**Interfaces:**
- Standalone Node script (mirrors `scripts/ig-fresh-pull.mjs`): reads env from `.env.local`, service-role Supabase client.

- [ ] **Step 1: Write the script.** Query `posts.url` distinct YT shorts (90). Per clip: `yt-dlp -f mp4 -o` to scratchpad, read bytes, run the same Gemini contract as `research-extract.ts` (inline, high-res), upsert `research_analyses` with `subject_type='own'`, `clip_details_code` from the join, `model`/`prompt_version`. Skip clips already analyzed. Log progress; re-runnable.

- [ ] **Step 2: Dry-run on 2 clips**

Run: `node scripts/research-backfill-own.mjs --limit 2`
Expected: 2 rows written; verify via read-only SELECT `count(*) FROM research_analyses WHERE subject_type='own'`.

- [ ] **Step 3: Commit**

```bash
git add scripts/research-backfill-own.mjs
git commit -m "feat(research): one-time own-clip backfill script (posts.url + yt-dlp)"
```

---

### Task 8: Diagnostics write_correlation hook

**Files:**
- Modify: `src/lib/diagnostics.ts`

**Interfaces:**
- Consumes: existing `WriteCorrelationCheck` / `WriteCorrelationPerCron` / `buildWriteCorrelation` (diagnostics.ts:177-787).

- [ ] **Step 1: Add the two crons to write_correlation.** Extend `WriteCorrelationCheck` (line ~185) with `research_collect: WriteCorrelationPerCron; research_analyze: WriteCorrelationPerCron;`, and in `buildWriteCorrelation` add checks correlating each cron's latest `cron_runs` success against the newest `updated_at` in `research_videos` (collect) / `research_analyses` (analyze). Follow the existing per-cron block shape exactly.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/diagnostics.ts
git commit -m "feat(research): write_correlation backstop for research crons"
```

---

### Task 9: Register crons in vercel.json

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add cron schedules + maxDuration.** Add to `crons`: `research-collect` at `"0 8 * * *"`, `research-analyze` at `"30 8 * * *"` (after collect). Add to `functions`: both route paths at `maxDuration: 300`.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(research): register collect + analyze crons"
```

---

### Task 10: Icon + ResearchView (Feed tab)

**Files:**
- Create: `src/components/views/ResearchView.tsx`
- Modify: `src/components/Icons.tsx`

**Interfaces:**
- Consumes: `research-db` read helpers via a client fetch, or a new `/api/research` read route if anon RLS-read is insufficient (anon-read policy exists, so direct supabase-js from the client works).
- Produces: `export default function ResearchView()`.

- [ ] **Step 1: Add `IconResearch`** to `Icons.tsx` (inline SVG, follow existing icon signature `className`).

- [ ] **Step 2: Write `ResearchView.tsx`** with `'use client'`. Two-tab shell (`Feed` | `Gaps`). Feed tab: fetch this-week outperformers joined to their analysis, render each as a card with the platform embed (YouTube/IG/TikTok iframe from `permalink`), the `recreate_brief`, and the taxonomy chips. **Data-load `.catch` sets a visible error state** (never silent-empty). `data-testid` on the tab buttons and cards. No em-dashes in copy.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Icons.tsx src/components/views/ResearchView.tsx
git commit -m "feat(research): ResearchView Feed tab + IconResearch"
```

---

### Task 11: Gaps tab + nav wiring

**Files:**
- Modify: `src/components/views/ResearchView.tsx`, `src/components/Sidebar.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `getGapData` shape (Task 3).

- [ ] **Step 1: Build the Gaps tab.** Technique-frequency table/chart: for each taxonomy value, columns for `craft` %, `niche` %, `own` %, sorted by largest own-vs-craft gap. Header copy states it is a hypothesis generator with evidence, not a lift oracle. Recharts for the bar comparison, typed tooltip props (no `any`).

- [ ] **Step 2: Wire nav.** In `Sidebar.tsx`: add `'research'` to `NavSection`, add a `NAV_ITEMS` entry `{ id: 'research', label: 'Research', icon: <IconResearch className="w-4 h-4" /> }`, and add `'research'` to a `NAV_GROUPS` group's `items` (uncommented). In `page.tsx`: add `{activeNav === 'research' && <ResearchView />}` and import it.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Run the app and click through**

Run: `npm run dev`, open localhost:3000, click Research, confirm Feed cards play and Gaps renders. Per the `/run` discipline — observe it working, not just build-green.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/ResearchView.tsx src/components/Sidebar.tsx src/app/page.tsx
git commit -m "feat(research): Gaps tab + register Research nav view"
```

---

### Task 12: Seed accounts + docs

**Files:**
- Modify: `CLAUDE.md`
- Data: `research_accounts` rows (via approved DML)

**Interfaces:**
- Consumes: verified seed handles.

- [ ] **Step 1: Propose seed accounts.** Present candidate niche + craft handles (name + why) to Shane. For each approved handle, verify it resolves via `fetchAccountVideos` (a quick `scripts/sc-smoke.mjs`-style check) before seeding.

- [ ] **Step 2: Seed (needs explicit per-row DML approval).** Emit `INSERT INTO research_accounts (...)` statements for Shane to run in the SQL Editor (per the no-unapproved-DML rule). Do not run via MCP.

- [ ] **Step 3: Document the subsystem in `CLAUDE.md`.** Add a "Market Research Engine" subsection under architecture: the 3 tables, 2 crons, the high-media-resolution correctness rule, `posts.url` own-clip source, the taxonomy-as-product framing, and the gap-not-lift honesty constraint.

- [ ] **Step 4: Verify build + commit**

Run: `npm run build`
```bash
git add CLAUDE.md
git commit -m "docs(research): document market research engine subsystem + seed accounts"
```

---

## Self-Review

**Spec coverage:** 3 tables (T1) ✓ · extractor + high-res + fidelity gate (T2) ✓ · controlled taxonomy (T2 prompt) ✓ · outperformance/median (T3) ✓ · ScrapeCreators all-3-platforms (T4) ✓ · collect cron + per-account isolation (T5) ✓ · analyze cron + bounded-10 + attempt cap (T6) ✓ · own-clip backfill via posts.url (T7) ✓ · write_correlation (T8) ✓ · crons registered (T9) ✓ · Feed playable (T10) ✓ · Gaps + nav (T11) ✓ · two cohorts (T3 gap agg + T12 seeds) ✓ · RLS/triggers (T1) ✓ · seed accounts propose-and-verify (T12) ✓ · gap-not-lift honesty (T11 copy + T12 docs) ✓.

**Placeholder scan:** No TBD/TODO-as-work. The two intentionally deferred-to-runtime items — ScrapeCreators field maps (T4S3) and seed handles (T12S1) — are verification steps with explicit checks, not code placeholders, because they depend on live vendor responses and Shane's approval respectively.

**Type consistency:** `TechniqueVector` (T2) is consumed by `writeAnalysis` (T3) and both crons (T5/T6). `CollectedVideo` defined in T3, produced by T4, consumed by T5. `CronName` extended in T5S1 before either cron route references it. `GEMINI_MODEL_CHAIN` / `PROMPT_VERSION` (T2) referenced by T6/T7.
