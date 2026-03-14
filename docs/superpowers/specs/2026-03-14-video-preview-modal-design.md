# Video Preview Modal — Design Spec
Date: 2026-03-14

## Overview

Add a global video preview modal that opens whenever a post title or row is clicked anywhere on the site. The modal shows clip metadata and an embedded video player based on the post's URL.

## Clickable Surfaces

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

### Shared utility
Extract `formatNum` from its current copy-paste locations into `src/lib/utils.ts` as a named export. Update `DashboardView.tsx`, `ContentView.tsx`, `TopPostsTable.tsx`, `PlatformsView.tsx`, and the new modal to import from there. This removes duplication and avoids an ESLint `no-unused-vars` violation in the new modal file.

### DB function
Add `updatePostUrl(platform: string, title: string, date: string, url: string)` to `src/lib/db.ts`.

**Important:** The `posts` table is matched using the composite key `{ platform, title, date }` — NOT by `id`. This mirrors the exact pattern used by `updatePostContentType`. The locally-generated `UnifiedPost.id` is not stored in Supabase.

```ts
export async function updatePostUrl(platform: string, title: string, date: string, url: string) {
  // Errors are silently swallowed — consistent with updatePostContentType behavior
  try {
    await supabase
      .from('posts')
      .update({ url })
      .eq('platform', platform)
      .eq('title', title)
      .eq('date', date);
  } catch {
    // no-op
  }
}
```

### `fetchAllPosts` mapper
The mapper in `db.ts` explicitly maps known fields. Add `url: row.url as string | undefined` to the mapping so URLs persisted to Supabase are returned after a page refresh.

### `upsertPosts` mapper
`upsertPosts` maps posts to DB rows and currently omits `url`. Because `upsertPosts` uses `ignoreDuplicates: true`, existing rows (and their `url` values) are never overwritten on re-upload — so URLs survive CSV re-uploads. The `url` field does NOT need to be added to the `upsertPosts` mapper. If `ignoreDuplicates` is ever changed, this would need revisiting.

### Supabase migration
Run manually in Supabase dashboard SQL editor:
```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS url text;
```

## Modal Component

**File:** `src/components/VideoPreviewModal.tsx`
**Must have `'use client'` at top** — uses `useState`, `useEffect`, and browser APIs.

**Props:**
```ts
interface Props {
  post: UnifiedPost;
  onClose: () => void;
  onUrlSaved: (platform: string, title: string, date: string, url: string) => void;
}
```

**Overlay:** `fixed inset-0 z-[60]` (higher than existing `z-50` content-type dropdown in `TopPostsTable`), `bg-black/60` + `backdrop-filter: blur(4px)`, `fadeIn 200ms ease` animation (keyframe already in globals.css). Backdrop click closes. Escape key also closes (via `useEffect` that adds/removes a `keydown` listener on mount).

**Card:** `bg-[var(--bg-card)]`, `border border-white/[0.08]`, `rounded-2xl`, `shadow-2xl`, `max-w-xl` (576px — accommodates 16:9 video plus title, stats, and no-URL input state).

**Card content:**
1. X button (`absolute top-4 right-4`) to close
2. Clip title (`text-[15px] font-semibold text-[var(--text-1)]`)
3. Platform badge (colored dot using `PLATFORM_COLORS` + label from `PLATFORM_LABELS`)
4. Stats row: views, likes, comments using `formatNum` from `src/lib/utils.ts`
5. Video player area — switches on `post.url`

### Video embed logic

| Condition | Render |
|---|---|
| URL contains `youtube.com` or `youtu.be` | YouTube `<iframe>` embed |
| URL contains `tiktok.com` | TikTok `<iframe>` embed |
| URL contains `instagram.com` | Instagram blockquote embed |
| Empty or unrecognized | No-URL placeholder |

**YouTube ID extraction:**
- `?v=` param for standard watch URLs
- Last path segment for `youtu.be/` short URLs
- `/shorts/` path segment for YouTube Shorts URLs (`youtube.com/shorts/{videoId}`)
- On extraction failure (malformed URL), fall through to the placeholder

Embed URL: `https://www.youtube.com/embed/{videoId}`

**TikTok ID extraction:** TikTok video URL format is `https://www.tiktok.com/@user/video/{videoId}`. Extract the numeric ID from the path. Embed as `https://www.tiktok.com/embed/v2/{videoId}`. Do NOT use the TikTok oEmbed API endpoint as an iframe src — that endpoint returns JSON.

**Instagram embed:** Use the standard Instagram blockquote embed markup. Inject the Instagram embed script via `useEffect`. TypeScript requires a `Window` type augmentation in the component file:

```ts
declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}
```

Script injection: on each mount of an Instagram embed, either inject the script (if absent) or call `process()` (if already loaded). To handle the race where the script was injected but hasn't finished loading yet, attach an `onload` handler rather than calling `process()` immediately.

```ts
useEffect(() => {
  const existing = document.querySelector('script[src*="instagram.com/embed.js"]');
  if (!existing) {
    const s = document.createElement('script');
    s.src = '//www.instagram.com/embed.js';
    s.async = true;
    document.body.appendChild(s);
  } else if (window.instgrm) {
    window.instgrm.Embeds.process();
  }
  // If script exists but window.instgrm is not yet defined, the script's own
  // onload will call process() automatically — no action needed.
}, []);
```

**Note:** Instagram embeds only work on `https://` origins. On `localhost:3000` they will silently fail and render the blockquote as plain text — this is acceptable for local development.

### No-URL placeholder
- Text: "No video URL — add a direct video link to this post to enable preview"
- Controlled `<input>` for pasting a URL
- "Save" button — while saving, button is disabled and shows "Saving…" (consistent with `TopPostsTable` saving-state pattern). Use local `saving: boolean` state.
- On save success, calls `onUrlSaved(post.platform, post.title, post.date, inputValue)`

## Context & Provider

**File:** `src/context/VideoModalContext.tsx`
*(Note: `src/context/` is a new directory — create it.)*
**Must have `'use client'` at top** — uses `useState` and renders JSX with hooks.

**Exports:**
- `VideoModalProvider` — holds `selectedPost: UnifiedPost | null` state; renders `{children}` plus `<VideoPreviewModal>` when a post is selected; accepts `onUrlSaved` prop (passed through to the modal); `onClose` sets `selectedPost` to `null`
- `useVideoModal()` — returns `{ open: (post: UnifiedPost) => void }`

The provider does not expose a `close` function via the hook — closing is internal only, via the modal's `onClose`.

**Wiring in `src/app/page.tsx`:**

```ts
const handleUrlSaved = async (platform: string, title: string, date: string, url: string) => {
  await updatePostUrl(platform, title, date, url);
  setPosts(prev => prev.map(p =>
    p.platform === platform && p.title === title && p.date === date
      ? { ...p, url }
      : p
  ));
};
```

`updatePostUrl` swallows errors internally — `handleUrlSaved` does not need an additional try/catch.

Wrap the layout JSX in `<VideoModalProvider onUrlSaved={handleUrlSaved}>`.

## Wiring Click Handlers

**`ContentView.tsx`, `PlatformsView.tsx`, `TopPostsTable.tsx`:** Each calls `const { open } = useVideoModal()` at the top of the component. Add `onClick={() => open(post)}` + `cursor-pointer` to the relevant row/card element.

**`DashboardView.tsx`:** Has an existing local state variable named `open` (controls the date-range dropdown at line ~181: `const [open, setOpen] = useState(false)`). To avoid a TypeScript duplicate-identifier error, destructure the hook under a different name:
```ts
const { open: openVideoModal } = useVideoModal();
```
Then use `onClick={() => openVideoModal(post)}` on the top posts rows.

**`TopPostsTable.tsx`:** Calls `useVideoModal()` directly inside the component — no new prop added to its `Props` interface. This is the correct approach: adding an `onPostClick` prop would require updating `ContentView` and any other caller, and would be redundant since the hook is available everywhere.

## Z-Index

The existing content-type dropdown in `TopPostsTable.tsx` uses `z-50`. The modal overlay uses `z-[60]` to render above it.

## Escape Key

The modal registers a `keydown` listener in a `useEffect` on mount and removes it on unmount. Pressing Escape calls `onClose`.

## Error Handling

- YouTube/TikTok/Instagram ID extraction failure → fall through to placeholder
- Instagram script load failure → blockquote renders as plain text
- `updatePostUrl` wraps in try/catch and swallows errors silently
- Save button shows disabled + "Saving…" state during the async call

## Files Changed

| File | Change |
|---|---|
| `src/types/index.ts` | Add `url?: string` to `UnifiedPost` |
| `src/lib/utils.ts` | New file — export shared `formatNum` |
| `src/lib/db.ts` | Add `updatePostUrl`; add `url` to `fetchAllPosts` mapper |
| `src/context/VideoModalContext.tsx` | New file — `'use client'`; provider + hook |
| `src/components/VideoPreviewModal.tsx` | New file — `'use client'`; modal UI + Window type augmentation |
| `src/app/page.tsx` | Wrap in provider, add `handleUrlSaved`, import `updatePostUrl` |
| `src/components/views/DashboardView.tsx` | `useVideoModal()` + `onClick` on top posts rows; import `formatNum` from utils |
| `src/components/views/ContentView.tsx` | `useVideoModal()` + `onClick` on recently-added cards; import `formatNum` from utils |
| `src/components/TopPostsTable.tsx` | `useVideoModal()` + `onClick` on post rows; import `formatNum` from utils |
| `src/components/views/PlatformsView.tsx` | `useVideoModal()` + `onClick` on best-post cards; import `formatNum` from utils |
