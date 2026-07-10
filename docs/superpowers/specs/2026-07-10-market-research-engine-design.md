# Market Research Engine — Design

**Date:** 2026-07-10
**Status:** Approved (design). Seed-account list pending Shane's approval before build.
**Owner:** Shane

## Problem

MBM ("Media Buyer Mafia") posts vertical clips cut from a paid-media / performance-marketing
podcast to YouTube Shorts and Instagram Reels. Shane wants continuous market research into
**what other brands and creators are doing — GFX, editing, hooks, pacing — to blow up on
social**, delivered as clean, playable inspiration he can recreate into MBM's own clips.

The request is about **craft, not topic.** View counts and titles cannot answer "what does
their caption animation look like." Answering it requires looking at the actual pixels: find
clips that outperformed → fetch the video → have a vision model watch it → extract structured,
recreate-able observations → aggregate into a report and a gap analysis against MBM's own clips.

This is the research counterpart to the **MBM Clip GFX** engine
(`2026-07-09-mbm-clip-gfx-design.md`): that project *produces* motion graphics; this one
*finds the techniques worth producing*. They share the "taste accumulates as data" thesis and
the same clip corpus, but no code. This spec does not depend on that one.

## Goal

A daily pipeline plus a dashboard view that:

1. Tracks a curated set of competitor accounts across TikTok, Instagram, YouTube.
2. Detects which of their recent clips **outperformed that account's own baseline**.
3. Runs a vision extractor over the outperformers, emitting a **controlled-taxonomy**
   technique vector plus a plain-English recreate brief.
4. Runs the **same extractor over MBM's own clips**, so the report is a **gap analysis**
   ("the craft cohort uses X in 34/50 clips; MBM uses it in 2/90"), not just a feed.
5. Surfaces both as: a weekly **Feed** (playable outperformers + brief + "how we'd remake it")
   and a **Gaps** view (technique frequency: craft cohort vs niche cohort vs MBM).

Acceptance bar, in Shane's words: **"enough for me to look at and try to recreate stuff."**
The system is judged on whether its briefs match the pixels, not on passing a type-check.

## Non-goals (explicitly deferred)

- Producing graphics (that is the MBM Clip GFX project).
- Statistical lift claims from MBM's own data. At ~90 YT shorts (median 148 views), MBM's
  numbers are a **gap-detector, not a lift-detector**. The system states "cohort does X, MBM
  does not"; it must **never** assert "X causes lift" from MBM's own small-n, confounded data.
- Topic/trend tracking as a primary output (metadata is collected, but craft is the product).
- Auto-adding competitor accounts. New candidates are *proposed*; a human seeds them.
- Antigravity or any second automation surface. Vercel cron + Gemini is the whole runtime.
- Storing video files or no-watermark URLs (short-lived, token-signed — dead columns).

## Verified facts (probe run 2026-07-09/10, before this spec)

These were established empirically, not assumed. They drive the design.

- **Own-clip video source:** `clip_details.video_url` covers only **17 of 146** rows
  (Supabase-hosted MP4s). The durable own-clip source is **`posts.url` — 90 distinct YouTube
  Short permalinks** (via yt-dlp). Do NOT assume `clip_details.video_url` is populated.
- **Gemini media resolution is a CORRECTNESS requirement, not an optimization.** At the API
  default (low res, ~91 tokens/sec of video) the extractor produced confidently-wrong,
  recreate-critical errors: it inverted the banner colors (claimed black-bg/white-text; truth
  is white-bg/black-text), **fabricated a `#FFCC00` caption highlight that does not exist**,
  and hallucinated a watermark timing. Setting `mediaResolution: "MEDIA_RESOLUTION_HIGH"`
  (~291 tokens/sec; 3,541 → 11,263 video tokens for the same 38.7s clip) fixed all three.
  **High media resolution is mandatory** on every extraction call.
- **Residual error even at high res:** the caption outline (a black *stroke*) was still called
  a "drop shadow." Mitigation to validate in build: pass 3–4 full-res ffmpeg keyframes
  alongside the video (~1,100 tokens each) since typography detail lives in single frames.
- **Model availability (this GEMINI_API_KEY, 2026-07-10):** `gemini-2.5-flash` returns 404
  "no longer available to new users." `gemini-3.5-flash` and `gemini-3-flash-preview` both
  returned **503 under load**. Only `gemini-flash-latest` completed. Design pins a concrete
  ID with a fallback chain and records `model` + `prompt_version` on every row (June's
  retired-model-ID incident is the precedent for not trusting a single hardcoded ID; a bare
  `-latest` alias is also rejected as unattributable).
- **Cost:** ~3.6¢/clip at high res. ~$11/mo at 300 clips/mo + ~$3 one-time to backfill 90
  MBM shorts. ScrapeCreators: $10 / 5,000 credits, credits never expire.
- **Own clips are reachable & inline-able:** sample clip 6.3 MB, `video/mp4`, HTTP 200.

## Acquisition posture (decided)

All three platforms via **ScrapeCreators** (single vendor, single key, metadata + no-watermark
video URLs). Shane has accepted that fetching video files is contrary to each platform's ToS;
the vendor takes the scraping posture. Sanctioned paths (YouTube Data API, IG business_discovery)
were considered and set aside for coverage and simplicity. One new secret:
`SCRAPECREATORS_API_KEY` (Shane adds it to `.env.local` + Vercel; never pasted into chat).

## Two cohorts (the core niche insight)

MBM's niche (paid-media education) has **mediocre GFX**; the accounts with elite GFX are **not
in MBM's niche**. One seed list cannot serve both stated goals, so accounts carry a `cohort`:

- **`niche`** — DTC / paid-media podcasters & agency founders. Read for **hooks, framing,
  topics** — what lands with MBM's audience.
- **`craft`** — high-production business/creator clip accounts regardless of topic. Read for
  **GFX, motion, typography, pacing** — the MrBeast-tier bar Shane is aiming at over time.

Same extractor over both; each cohort is *read* for different columns in the Gaps view. This is
MBM taking its own advice — two existing clips are literally titled "Steal Creative Types From
Similar Niches" and "4 Editing Styles You Should Be Testing."

## Data model

Three new tables. **RLS enabled from day one** with `anon`-read / `service_role`-write policies
— deliberately the opposite of the 14 existing RLS-disabled tables (flagged separately; the
public anon key can currently read/write them). All `updated_at` columns get a **BEFORE UPDATE
trigger**, per the documented rule that a column default only fires on INSERT.

### `research_accounts` — the seed registry
```
id              uuid pk
platform        text   -- 'tiktok' | 'instagram' | 'youtube'
handle          text
cohort          text   -- 'niche' | 'craft'
active          boolean default true
follower_count  bigint
trailing_median_views  numeric  -- recomputed by collector; the fairness denominator
notes           text
created_at, updated_at  timestamptz
UNIQUE (platform, handle)
```

### `research_videos` — one row per collected competitor clip
```
id            uuid pk
account_id    uuid fk -> research_accounts
platform      text
external_id   text
permalink     text
thumbnail_url text
caption       text
posted_at     timestamptz
views, likes, comments, shares  bigint
duration_sec  numeric
outperformance numeric  -- views / account.trailing_median_views  (cross-account-fair)
analyze_attempts int default 0
created_at, updated_at  timestamptz
UNIQUE (platform, external_id)
```
Deliberately NOT stored: the video file, the no-watermark URL (short-lived; fetched fresh at
analysis time and discarded).

### `research_analyses` — extractor output (competitor AND own, same schema)
```
id               uuid pk
subject_type     text   -- 'competitor' | 'own'
research_video_id uuid fk -> research_videos  (null for own)
clip_details_code text                        (null for competitor; joins MBM own clips)
model            text   -- concrete Gemini id used
prompt_version   text
media_resolution text   -- always 'high'
hook_type        text   -- controlled enum (see taxonomy)
framing          text
caption_style    text
gfx              text[] -- controlled enum set
pacing           jsonb  -- { avg_cut_sec, zoom_count, total_cuts }
detail           jsonb  -- caption_detail, gfx_detail[], color_grade, audio, framing_composition
recreate_brief   text
unlisted_observations text[]  -- taxonomy candidates (promoted to enum by hand later)
created_at, updated_at  timestamptz
```

## Taxonomy — the actual product

Free-text extraction yields "word pop" / "animated word captions" / "karaoke" as three
techniques and frequency counts become garbage. So Gemini receives a **fixed enum** and must
map what it sees into it; anything genuinely unlisted goes to `unlisted_observations` and pools
in a candidates view for periodic hand-promotion. The taxonomy is the product; the scraper is
plumbing. v1 enums (seeded from MBM's own vocabulary, which validates the shape):

- `hook_type`: declarative · question · cold_open_punchline · stat · threat · story
  *(MBM's insights table already found declarative beats question ~4× on YouTube)*
- `framing`: threat · opportunity · curiosity · authority
  *(MBM's insights already found threat framing is the IG breakout lever)*
- `caption_style`: none · static_block · word_pop · karaoke_highlight · keyword_color
- `gfx`: lower_third · headline_banner · progress_bar · data_viz · broll_overlay ·
  zoom_punch · speaker_label · motion_bg · meme_cutaway · sfx_emphasis
- `pacing`: `avg_cut_sec` (numeric) · `zoom_count` (int) · `total_cuts` (int)

`prompt_version` is bumped whenever the taxonomy or prompt changes, so re-analyses are
comparable and attributable.

## Pipeline

### `/api/cron/research-collect` (daily)
Poll each `active` account via ScrapeCreators → upsert `research_videos` on
`(platform, external_id)` → recompute each account's `trailing_median_views` and the
per-video `outperformance`. Metadata only, no downloads. **Per-account failures are isolated**:
a dead handle marks the run `partial` and does not abort the other accounts. Follows the
existing `cron_runs` start/finish pattern.

### `/api/cron/research-analyze` (daily)
Select up to **10** videos where `outperformance >= 1.5` AND not yet analyzed AND
`analyze_attempts < 3` → resolve a fresh video URL → download → Gemini at
`MEDIA_RESOLUTION_HIGH` (+ optional keyframe stills, validated in build) → write
`research_analyses`. **Bounded at 10** because 40 × ~15s would blow the 300s function ceiling.
Failures increment `analyze_attempts`; abandoned after 3 so one pathological video can't wedge
the queue. `model` fallback chain on 404/503.

### Own-clip backfill (one-time script, `scripts/` — mirrors `ig-fresh-pull.mjs`)
Iterate `posts.url` (90 YT shorts) → yt-dlp → same extractor → `research_analyses` with
`subject_type='own'`, joined by `clip_details_code`. ~$3. Own-clip *views* for any ranking come
from `getTotalViewsPerClip()`, never `SUM(posts.views)` (posts is daily-delta).

## Dashboard

One new view `ResearchView.tsx`, registered in `NAV_ITEMS` / `NAV_GROUPS.items` / `page.tsx`
render branch (single-route shell). Two tabs:

- **Feed** — this week's outperformers, each with the platform's native embed (playable in
  place) + extracted brief + "how we'd remake this."
- **Gaps** — technique frequency across `craft` cohort vs `niche` cohort vs MBM own, ranked by
  the largest MBM gap. Labeled honestly as a **hypothesis generator with evidence**, not a
  "what works" oracle.

Data-load `.catch` sets a visible error state (never silent-empty), per the documented rule.

## Failure modes designed against (from `tasks/lessons.md` / CLAUDE.md)

- **`status='success'` ≠ writes landed.** Both new tables get `updated_at` BEFORE UPDATE
  triggers + a `write_correlation` entry in `src/lib/diagnostics.ts` (the backstop that caught
  frozen IG timestamps).
- **No `.not('col','is',null)`** anywhere — fetch-then-JS-filter (footgun hit 4× prior).
- **Every unbounded read paginates** with `.range()` + stable `.order()` (1000-row cap).
- **RLS on** for all three tables (anon-read, service-role-write).
- **No `thumbnail_base64`** selected from anon/PostgREST — use `thumbnail_url`.
- **No em-dashes** in any user-facing string in the view.
- **Schema DDL** via committed migration files + Supabase SQL Editor by hand, then a catalog
  verification query — never via MCP write tools.

## Verification

1. `npm run build` (tsc + lint) is the commit gate.
2. **The honest test runs first, before any cron is wired:** re-run the extractor probe across
   ~20 clips spanning all three platforms and both cohorts, and check each brief against
   ffmpeg-extracted frames the way the initial probe was checked. This is a gate on the
   extractor prompt, not a nicety. Heavily-produced craft-cohort clips (motion graphics, b-roll,
   6 overlays/sec) are the known-hardest read and the explicit target of this check.

## Open risks

- **Extractor fidelity on complex edits is unproven.** The probe validated a simple two-speaker
  webcam cut. The 20-clip check exists to surface this early; if briefs are vague on
  craft-cohort clips, the fix is prompt/keyframe iteration, caught before the crons exist.
- **Seed handles must be verified live.** Candidate accounts are proposed by name/description
  and each handle is confirmed to resolve through ScrapeCreators before seeding; dead ones
  dropped. `research_accounts` is a table precisely so this stays editable.
- **ScrapeCreators coverage/field parity across platforms** (esp. IG view counts) verified
  during the first collect run, not assumed.

## Build order

1. Migrations (3 tables + triggers + RLS policies) → SQL Editor → catalog-verify.
2. Extractor module (`src/lib/research-extract.ts`) + the 20-clip fidelity gate. **Stop and
   review output with Shane before proceeding.**
3. ScrapeCreators adapter (`src/lib/scrapecreators.ts`) + `research-collect` cron.
4. `research-analyze` cron + `write_correlation` diagnostics hook.
5. Own-clip backfill script.
6. `ResearchView.tsx` (Feed, then Gaps).
7. Register crons in `vercel.json`; `npm run build`; wire diagnostics.

## Open questions

1. **Seed account list** — Shane to approve the proposed niche + craft cohorts (handles
   verified live before seeding). Gates step 1.
2. **Keyframe assist** — resolved empirically in step 2, not now.
3. **Concrete Gemini model pin** — chosen in step 2 from what the key can reach that day.
