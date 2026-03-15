# Architectural Decisions

## State management
- No global state library — root `page.tsx` owns `posts` and `activeNav`, passes down as props
- Views do their own filtering/aggregation with `useMemo`; no shared filter state between views
- Video modal and filter state managed via React local state, not Context

## Persistence
- Supabase for all server-side persistence (posts, insights, editor_feedback, goals, captions)
- `localStorage` for client-only ephemeral state (Anthropic API key)

## Video processing
- FFmpeg.wasm for client-side silence detection and thumbnail extraction — no server needed
- Silence detection drives `keepSegments` (start/end pairs) per clip

## Editor export formats
- **Premiere XML** (Adobe Premiere Pro) — `buildPremiereXml()` in EditorView.tsx
  - Schema: `<PremiereData Version="3">` with `<VideoSegments>` / `<AudioSegments>`
  - Timecode unit: ticks (254,016,000,000 ticks/sec)
  - Download filename: `export.xml`
- **EDL** (CMX 3600, DaVinci Resolve compatible) — `buildEdl()` in EditorView.tsx
  - Non-drop-frame timecodes, 8-char reel names with collision handling
  - Download filename: `export.edl`
- FCPXML was explicitly removed — Shane uses Adobe Premiere Pro, not Final Cut Pro

## Testing
- Playwright for e2e testing (screenshots in `tests/screenshots/`)
- No unit tests — build pipeline (`npm run build`) runs ESLint + TypeScript as the test gate

## AI integration
- Anthropic API called directly from the browser via `fetch` (no SDK wrapper)
- Model: `claude-sonnet-4-20250514`
- Requires `anthropic-dangerous-direct-browser-access: true` header
