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
