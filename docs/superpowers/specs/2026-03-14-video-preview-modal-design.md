# Video Preview Modal — Design Spec
Date: 2026-03-14

## Overview

Add a global video preview modal that opens whenever a post title or row is clicked anywhere on the site. The modal shows clip metadata and an embedded video player based on the post's URL.

## Clickable Surfaces

The following locations will gain click handlers:

| File | Element |
|---|---|
| `DashboardView.tsx` | Top posts row `<div>` |
| `ContentView.tsx` | Recently-added card `<div>` |
| `TopPostsTable.tsx` | Post title row (shared component, covers ContentView table) |
| `PlatformsView.tsx` | Best-post container `<div>` per platform |

AnalyticsView and ComparisonView are excluded — they show only aggregate data, no individual post rows.

## Data Layer

### Type change
Add `url?: string` to `UnifiedPost` in `src/types/index.ts`.

### DB function
Add `updatePostUrl(id: string, url: string)` to `src/lib/db.ts`:
- Single Supabase `update` on the `posts` table filtered by `id`
- Mirrors the existing `updatePostContentType` pattern

### Supabase migration
Run manually in Supabase dashboard SQL editor:
```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS url text;
```

`fetchAllPosts` already uses `select('*')` so no query change needed.

## Modal Component

**File:** `src/components/VideoPreviewModal.tsx`

**Props:**
```ts
interface Props {
  post: UnifiedPost;
  onClose: () => void;
  onUrlSaved: (id: string, url: string) => void;
}
```

**Overlay:** `fixed inset-0 z-50`, `bg-black/60` + `backdrop-filter: blur(4px)`, `fadeIn 200ms ease` animation (keyframe already in globals.css). Backdrop click closes.

**Card content:**
1. X button (top-right) to close
2. Clip title (`text-[var(--text-1)]`, large)
3. Platform badge (colored dot using `PLATFORM_COLORS` + label from `PLATFORM_LABELS`)
4. Stats row: views, likes, comments (formatted with `formatNum`)
5. Video player — switches on `post.url`:

| Condition | Render |
|---|---|
| URL contains `youtube` or `youtu.be` | `<iframe>` with YouTube embed (extract video ID) |
| URL contains `tiktok` | `<iframe>` with TikTok oembed player |
| URL contains `instagram` | Instagram blockquote embed + script |
| Empty or unrecognized | Placeholder message + URL input + Save button |

**Placeholder (no URL):**
- Text: "No video URL — add a direct video link to this post to enable preview"
- Controlled `<input>` for pasting a URL
- "Save" button calls `onUrlSaved(post.id, inputValue)`

## Context & Provider

**File:** `src/context/VideoModalContext.tsx`

**Exports:**
- `VideoModalProvider` — holds `selectedPost: UnifiedPost | null` state; renders `{children}` plus `<VideoPreviewModal>` when a post is selected; accepts `onUrlSaved` prop
- `useVideoModal()` — returns `{ open: (post: UnifiedPost) => void }`

**Integration in `src/app/page.tsx`:**
- Wrap layout JSX in `<VideoModalProvider onUrlSaved={handleUrlSaved}>`
- Add handler:
```ts
async function handleUrlSaved(id: string, url: string) {
  await updatePostUrl(id, url);
  setPosts(prev => prev.map(p => p.id === id ? { ...p, url } : p));
}
```

## Modal Style

Matches Creator Tips modal aesthetic:
- Dark overlay: `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- Card: `bg-[var(--bg-card)]`, `border border-white/[0.08]`, `rounded-2xl`, `shadow-2xl`
- Max width: `max-w-lg` (slightly wider than tips modal to accommodate video)
- `fadeIn 200ms ease` animation (keyframe already in globals.css)

## Error Handling

- If YouTube video ID extraction fails (malformed URL), fall through to the unrecognized/placeholder case
- Instagram embed script is loaded dynamically via a `<script>` tag; if it fails to load, the blockquote still renders as readable text
- `updatePostUrl` failures are silently swallowed for now (consistent with how `updatePostContentType` works)

## Files Changed

| File | Change |
|---|---|
| `src/types/index.ts` | Add `url?: string` to `UnifiedPost` |
| `src/lib/db.ts` | Add `updatePostUrl` function |
| `src/context/VideoModalContext.tsx` | New file — provider + hook |
| `src/components/VideoPreviewModal.tsx` | New file — modal UI |
| `src/app/page.tsx` | Wrap in provider, add `handleUrlSaved` |
| `src/components/views/DashboardView.tsx` | Add `onClick` to top posts rows |
| `src/components/views/ContentView.tsx` | Add `onClick` to recently-added cards |
| `src/components/TopPostsTable.tsx` | Add `onClick` to post rows |
| `src/components/views/PlatformsView.tsx` | Add `onClick` to best-post cards |
