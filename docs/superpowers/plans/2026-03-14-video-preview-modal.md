# Video Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global video preview modal that opens when any post title or row is clicked across the site, showing clip metadata and an embedded video player.

**Architecture:** A React Context provider (`VideoModalProvider`) wraps the app in `page.tsx` and holds the selected post in state. Any component calls `useVideoModal().open(post)` to trigger the modal. The modal (`VideoPreviewModal`) renders once globally inside the provider and handles YouTube/TikTok/Instagram embeds based on the post's `url` field, falling back to a URL-input placeholder when empty.

**Tech Stack:** Next.js 14 App Router, React Context, Tailwind CSS, Supabase (existing client)

**Spec:** `docs/superpowers/specs/2026-03-14-video-preview-modal-design.md`

**Verification:** This project has no test suite. Verification at each step is `npx tsc --noEmit` (fast type check) and `npm run build` (full ESLint + TypeScript + Next.js build — treat failures as test failures).

---

## Chunk 1: Data Foundation

### Task 1: Add `url` field to `UnifiedPost` and run Supabase migration

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `url` to the `UnifiedPost` interface**

Open `src/types/index.ts`. The `UnifiedPost` interface currently ends with `content_type?: string`. Add `url` after it:

```ts
export interface UnifiedPost {
  id: string;
  platform: Platform;
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  title: string;
  content_type?: string;
  url?: string;            // ← add this line
}
```

- [ ] **Step 2: Run Supabase migration**

In the Supabase dashboard SQL editor, run:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS url text;
```

This is a one-time manual step. The column is nullable so existing rows are unaffected.

- [ ] **Step 3: Type-check**

```bash
cd /Users/shane/clip-dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add url field to UnifiedPost type"
```

---

### Task 2: Create shared `formatNum` utility

**Files:**
- Create: `src/lib/utils.ts`

`formatNum` is currently copy-pasted in four files. Extract it once here; all four files will import from here in later tasks.

- [ ] **Step 1: Create `src/lib/utils.ts`**

```ts
export function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: extract shared formatNum utility to src/lib/utils.ts"
```

---

### Task 3: Update `db.ts` — add `url` to mapper and add `updatePostUrl`

**Files:**
- Modify: `src/lib/db.ts:111-130` (fetchAllPosts mapper)
- Modify: `src/lib/db.ts:163` (after updatePostContentType)

- [ ] **Step 1: Add `url` to the `fetchAllPosts` mapper**

In `src/lib/db.ts`, the `fetchAllPosts` mapper (lines 111–129) currently ends with:

```ts
    content_type: row.content_type as string | undefined,
  }));
```

Change it to:

```ts
    content_type: row.content_type as string | undefined,
    url: row.url as string | undefined,
  }));
```

- [ ] **Step 2: Add `updatePostUrl` after `updatePostContentType` (after line 163)**

Add this function immediately after the closing `}` of `updatePostContentType`:

```ts
export async function updatePostUrl(
  platform: string,
  title: string,
  date: string,
  url: string
): Promise<void> {
  // Errors are silently swallowed — consistent with save-URL UX
  try {
    await supabase
      .from('posts')
      .update({ url })
      .match({ platform, title, date });
  } catch {
    // no-op
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add url to fetchAllPosts mapper and add updatePostUrl"
```

---

## Chunk 2: Modal Infrastructure

### Task 4: Create `VideoModalContext`

**Files:**
- Create: `src/context/VideoModalContext.tsx` (new directory)

- [ ] **Step 1: Create `src/context/VideoModalContext.tsx`**

```tsx
'use client';

import { createContext, useContext, useState } from 'react';
import { UnifiedPost } from '@/types';
import VideoPreviewModal from '@/components/VideoPreviewModal';

interface VideoModalContextValue {
  open: (post: UnifiedPost) => void;
}

const VideoModalContext = createContext<VideoModalContextValue | null>(null);

export function useVideoModal(): VideoModalContextValue {
  const ctx = useContext(VideoModalContext);
  if (!ctx) throw new Error('useVideoModal must be used within VideoModalProvider');
  return ctx;
}

interface ProviderProps {
  children: React.ReactNode;
  onUrlSaved: (platform: string, title: string, date: string, url: string) => void;
}

export function VideoModalProvider({ children, onUrlSaved }: ProviderProps) {
  const [selectedPost, setSelectedPost] = useState<UnifiedPost | null>(null);

  return (
    <VideoModalContext.Provider value={{ open: setSelectedPost }}>
      {children}
      {selectedPost && (
        <VideoPreviewModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUrlSaved={onUrlSaved}
        />
      )}
    </VideoModalContext.Provider>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: one error about `VideoPreviewModal` not existing yet — that is expected and will be resolved in the next task. If there are other errors, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/context/VideoModalContext.tsx
git commit -m "feat: add VideoModalContext provider and useVideoModal hook"
```

---

### Task 5: Create `VideoPreviewModal`

**Files:**
- Create: `src/components/VideoPreviewModal.tsx`

This component handles YouTube, TikTok, Instagram, and placeholder states.

- [ ] **Step 1: Create `src/components/VideoPreviewModal.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { UnifiedPost, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';
import { formatNum } from '@/lib/utils';

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

interface Props {
  post: UnifiedPost;
  onClose: () => void;
  onUrlSaved: (platform: string, title: string, date: string, url: string) => void;
}

function extractYouTubeId(url: string): string | null {
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];
  return null;
}

function extractTikTokId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

function InstagramEmbed({ url }: { url: string }) {
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
    // If script exists but window.instgrm is undefined, the script's own
    // onload handler calls process() automatically.
  }, []);

  return (
    <div className="w-full overflow-hidden rounded-xl">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
      />
    </div>
  );
}

function VideoPlayer({
  post,
  onUrlSaved,
}: {
  post: UnifiedPost;
  onUrlSaved: Props['onUrlSaved'];
}) {
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const url = post.url ?? '';

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      return (
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      );
    }
  }

  if (url.includes('tiktok.com')) {
    const videoId = extractTikTokId(url);
    if (videoId) {
      return (
        <div className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center" style={{ aspectRatio: '9/16', maxHeight: 400 }}>
          <iframe
            src={`https://www.tiktok.com/embed/v2/${videoId}`}
            allow="autoplay"
            className="w-full h-full"
          />
        </div>
      );
    }
  }

  if (url.includes('instagram.com')) {
    return <InstagramEmbed url={url} />;
  }

  // Placeholder — no URL or unrecognized URL
  async function handleSave() {
    if (!urlInput.trim()) return;
    setSaving(true);
    await onUrlSaved(post.platform, post.title, post.date, urlInput.trim());
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
      <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
        No video URL — add a direct video link to this post to enable preview
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste YouTube, TikTok, or Instagram URL…"
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-white/[0.16] transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving || !urlInput.trim()}
          className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[12px] font-medium text-[var(--text-1)] transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function VideoPreviewModal({ post, onClose, onUrlSaved }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={onClose}
    >
      <div
        className="relative bg-[var(--bg-card)] border border-white/[0.08] rounded-2xl w-full max-w-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-[var(--text-3)]"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="w-3.5 h-3.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        {/* Title + platform badge */}
        <div className="mb-4 pr-8">
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] mb-2 leading-snug">{post.title}</h2>
          <span
            className="inline-block text-[10px] font-semibold px-2 py-1 rounded-lg"
            style={{
              background: `${PLATFORM_COLORS[post.platform]}20`,
              color: PLATFORM_COLORS[post.platform],
            }}
          >
            {PLATFORM_LABELS[post.platform]}
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-5">
          {([
            { label: 'Views',    value: post.views    },
            { label: 'Likes',    value: post.likes    },
            { label: 'Comments', value: post.comments },
          ] as const).map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-[var(--text-3)] uppercase tracking-[0.12em] mb-0.5">{label}</p>
              <p className="text-[14px] font-semibold text-[var(--text-1)] font-['JetBrains_Mono'] tabular-nums">{formatNum(value)}</p>
            </div>
          ))}
        </div>

        {/* Video player */}
        <VideoPlayer post={post} onUrlSaved={onUrlSaved} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoPreviewModal.tsx
git commit -m "feat: add VideoPreviewModal with YouTube, TikTok, Instagram, and placeholder support"
```

---

### Task 6: Wire `VideoModalProvider` into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add imports to `page.tsx`**

In `src/app/page.tsx`, update the import block. Add these two imports after the existing db import on line 6:

```ts
import { fetchAllPosts, upsertPosts, updatePostUrl } from '@/lib/db';
import { VideoModalProvider } from '@/context/VideoModalContext';
```

(Replace the existing `import { fetchAllPosts, upsertPosts } from '@/lib/db';` with the one that also imports `updatePostUrl`.)

- [ ] **Step 2: Add `handleUrlSaved` handler**

Add this after `handlePostUpdate` (after line 76):

```ts
const handleUrlSaved = async (platform: string, title: string, date: string, url: string) => {
  await updatePostUrl(platform, title, date, url);
  setPosts((prev) =>
    prev.map((p) =>
      p.platform === platform && p.title === title && p.date === date
        ? { ...p, url }
        : p
    )
  );
};
```

- [ ] **Step 3: Wrap the return JSX in `VideoModalProvider`**

The `return` in `App()` currently starts with:

```tsx
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-white">
```

Wrap it:

```tsx
  return (
    <VideoModalProvider onUrlSaved={handleUrlSaved}>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-white">
        ...
      </div>
    </VideoModalProvider>
  );
```

Keep all existing content inside the `<div>` unchanged. Only add the `<VideoModalProvider>` wrapper around the outer `<div>`.

- [ ] **Step 4: Full build**

```bash
npm run build
```

Expected: clean build. The modal provider is now wired but no click handlers exist yet — that is fine.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire VideoModalProvider into app root with handleUrlSaved"
```

---

## Chunk 3: Click Handler Wiring

### Task 7: DashboardView — top posts rows

**Files:**
- Modify: `src/components/views/DashboardView.tsx`

**Important:** `DashboardView` already has `const [open, setOpen] = useState(false)` at line 181 (controls the date-range dropdown). Destructure the modal hook under a different name to avoid a TypeScript duplicate-identifier error.

- [ ] **Step 1: Update imports at the top of `DashboardView.tsx`**

Current import line (line 3):
```ts
import { useMemo, useState, useRef, useEffect } from 'react';
```
(No change needed here.)

Add two new import lines after the existing imports (after the `IconLightning` import line):
```ts
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
```

- [ ] **Step 2: Remove the local `formatNum` definition**

Delete lines 73–77 (the local `formatNum` function):

```ts
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
```

- [ ] **Step 3: Add `openVideoModal` inside `DashboardView`**

Inside `DashboardView` (the default export function), add this line right after the `const [open, setOpen] = useState(false);` line at line 181:

```ts
const { open: openVideoModal } = useVideoModal();
```

- [ ] **Step 4: Add click handler to top posts rows**

The top posts row `<div>` at line 322 is currently:

```tsx
<div key={post.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
```

Change it to:

```tsx
<div key={post.id} onClick={() => openVideoModal(post)} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group cursor-pointer">
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/DashboardView.tsx
git commit -m "feat: open video modal on top posts row click in DashboardView"
```

---

### Task 8: ContentView — recently-added cards

**Files:**
- Modify: `src/components/views/ContentView.tsx`

- [ ] **Step 1: Update imports**

Add after existing imports:
```ts
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
```

- [ ] **Step 2: Remove local `formatNum`**

Delete the local `formatNum` function (lines ~13–17 in ContentView.tsx):

```ts
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
```

- [ ] **Step 3: Add `open` from hook inside `ContentView`**

Inside the `ContentView` component function, add this after the `recent` const declaration (line 20: `const recent = [...posts].sort(...)`):

```ts
const { open } = useVideoModal();
```

- [ ] **Step 4: Add click handler to recently-added cards**

The recently-added card `<div>` is currently:

```tsx
<div
  key={post.id}
  className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-4 hover:bg-[var(--bg-hover)] hover:border-white/[0.09] transition-all group"
>
```

Change to:

```tsx
<div
  key={post.id}
  onClick={() => open(post)}
  className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-4 hover:bg-[var(--bg-hover)] hover:border-white/[0.09] transition-all group cursor-pointer"
>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/ContentView.tsx
git commit -m "feat: open video modal on recently-added card click in ContentView"
```

---

### Task 9: TopPostsTable — post title cell

**Files:**
- Modify: `src/components/TopPostsTable.tsx`

Note: The whole `<tr>` is not made clickable because it contains an interactive content-type dropdown button. Instead, only the title cell (`<td>`) gets the click handler — this is the most natural target and avoids event bubbling conflicts.

- [ ] **Step 1: Update imports**

Add after existing imports:
```ts
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
```

- [ ] **Step 2: Remove local `formatNum`**

Delete lines 23–27:

```ts
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
```

- [ ] **Step 3: Add `open` from hook inside `TopPostsTable`**

Inside the `TopPostsTable` component, add after the existing state declarations (lines 30–31):

```ts
const { open } = useVideoModal();
```

- [ ] **Step 4: Make the title cell clickable**

The title `<td>` at lines 91–96 is currently:

```tsx
<td className="px-5 py-3.5 max-w-[220px]">
  <span className="text-[var(--text-1)] truncate block text-[13px] group-hover:text-white transition-colors" title={post.title}>
    {post.title.length > 44 ? post.title.slice(0, 44) + '…' : post.title}
  </span>
  <span className="text-[var(--text-3)] text-[11px]">{post.date}</span>
</td>
```

Change to:

```tsx
<td className="px-5 py-3.5 max-w-[220px] cursor-pointer" onClick={() => open(post)}>
  <span className="text-[var(--text-1)] truncate block text-[13px] group-hover:text-white transition-colors" title={post.title}>
    {post.title.length > 44 ? post.title.slice(0, 44) + '…' : post.title}
  </span>
  <span className="text-[var(--text-3)] text-[11px]">{post.date}</span>
</td>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/TopPostsTable.tsx
git commit -m "feat: open video modal on title cell click in TopPostsTable"
```

---

### Task 10: PlatformsView — best post cards

**Files:**
- Modify: `src/components/views/PlatformsView.tsx`

- [ ] **Step 1: Update imports**

Add after existing imports:
```ts
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
```

- [ ] **Step 2: Remove local `formatNum`**

Delete the local `formatNum` function (around lines 19–23 in PlatformsView.tsx):

```ts
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
```

- [ ] **Step 3: Add `open` from hook inside `PlatformsView`**

Inside the `PlatformsView` component function, add as the first line:

```ts
const { open } = useVideoModal();
```

- [ ] **Step 4: Make the best-post container clickable**

The best-post container (around line 112) is currently:

```tsx
<div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3.5">
```

Change to:

```tsx
<div onClick={() => open(best)} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3.5 cursor-pointer hover:bg-white/[0.05] transition-colors">
```

- [ ] **Step 5: Full build**

```bash
npm run build
```

Expected: clean build with no TypeScript or ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/PlatformsView.tsx
git commit -m "feat: open video modal on best-post card click in PlatformsView"
```

---

### Task 11: Final verification and push

- [ ] **Step 1: Full build — final check**

```bash
npm run build
```

Expected: clean build. All routes build successfully.

- [ ] **Step 2: Manual smoke test**

Start the dev server:

```bash
npm run dev
```

Check each surface:
- Dashboard → click a top post row → modal opens with title, platform badge, stats, video player area
- Content → click a recently-added card → modal opens
- Content → click a title cell in the Top Posts table → modal opens
- Platforms → click a Best Post card → modal opens
- Clicking the dark backdrop closes the modal
- Pressing Escape closes the modal
- Clicking the X button closes the modal
- Paste a YouTube URL in the placeholder input, click Save → iframe embed appears on next open
- Paste a TikTok URL, click Save → TikTok embed appears on next open

- [ ] **Step 3: Push**

```bash
git push
```
