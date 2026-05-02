# Project: Clip Studio Dashboard

## Identity
- **Name:** Clip Studio Dashboard
- **Local path:** `~/clip-dashboard`
- **GitHub:** https://github.com/shanesolomon1010-a11y/clip-dashboard
- **Deployed:** https://clip-dashboard-two.vercel.app
- **Branch strategy:** feature branches off `main`, PR to merge

## Environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_ANTHROPIC_API_KEY` | Anthropic API key (browser-side) |

## Supabase tables
| Table | Purpose |
|---|---|
| `posts` | Normalized social media posts across all platforms |
| `insights` | AI-generated insight snapshots |
| `editor_feedback` | Export metadata from EditorView (columns: `id`, `created_at`, `prompt`, `fcpxml_generated`, `feedback`, `feedback_type`) |
| `goals` | User-defined performance goals |
| `captions` | AI-generated captions for video clips |
| `clip_finder_calibration` | Proven winners/failures for the clip-finder system prompt. `category` is `'proven_winner'` or `'proven_failure'` (NOT `'winner'`/`'failure'`). |
| `clip_finder_duration_benchmarks` | Duration-range performance benchmarks for the clip-finder prompt |
| `clip_finder_title_pattern_stats` | Title-pattern performance rankings for the clip-finder prompt |

## Pending Supabase migrations
- `ALTER TABLE posts ADD COLUMN content_type text`
- `CREATE TABLE IF NOT EXISTS captions (...)`

## Nav sections
`dashboard` | `content` | `analytics` | `platforms` | `ai-insights` | `editor` | `caption` | `settings`

## Key files
- `src/app/page.tsx` — layout shell, global state (`posts`, `activeNav`)
- `src/types/index.ts` — `UnifiedPost`, `Platform`, `PLATFORM_COLORS`, `PLATFORM_LABELS`
- `src/lib/normalizers.ts` — CSV ingestion pipeline
- `src/lib/db.ts` — all Supabase read/write functions
- `src/components/views/EditorView.tsx` — video editor pipeline (FFmpeg, Premiere XML, EDL)
- `src/components/Icons.tsx` — all inline SVG icons
- `docs/clip-finder-engine-v2.md` — verbatim V2 engine doc; source for the skeleton
- `src/lib/clip-finder/` — clip-finder prompt assembly: `types.ts`, `calibration.ts` (Supabase reader), `skeleton-prompt.ts` (V2 doc with 4 data-section placeholders), `prompt-builder.ts` (`buildClipFinderPrompt()` renders sections + substitutes; no caching)
