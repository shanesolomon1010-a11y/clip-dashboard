# Unify Clip Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate clip detail display into one unified `VideoPreviewModal` component used everywhere, with correct stats and all 5 sections always visible.

**Architecture:** `VideoPreviewModal` already has a Mode A (clip detail) that includes all 5 required sections. The perceived "two different screens" are the same component behaving differently due to clip_code format mismatch between the `posts` table ("MBM014") and `clip_details` table ("MBM015-CLIP-014"). Mode B (legacy player-only, no clip_code) will be removed. All callers already go through `VideoModalContext`.

**Tech Stack:** Next.js 14, TypeScript, Supabase, React

---

## Investigation Summary (pre-read before executing)

| Location | File | clip_code format passed |
|---|---|---|
| Dashboard (top content) | `DashboardView.tsx:259` | `post.clip_code` from `posts` table → "MBM014" format |
| TopPostsTable | `TopPostsTable.tsx:89` | `post.clip_code` from `posts` table → "MBM014" format |
| ContentView | `ContentView.tsx:31` | `post.clip_code` from `posts` table → "MBM014" format |
| PlatformsView | `PlatformsView.tsx:115` | `post.clip_code` from `posts` table → "MBM014" format |
| PostingScheduleView | `PostingScheduleView.tsx:633` | `post.clip_code` from `scheduled_posts` table → "MBM015-CLIP-014" format |

All 5 callers go through `useVideoModal().open()` → `VideoModalContext` → `VideoPreviewModal`.

**Root causes:**
1. Dashboard passes "MBM014" → `fetchClipStats` works (stats show), `fetchClipDetails` returns null (no banners/captions)
2. PostingSchedule passes "MBM015-CLIP-014" → `fetchClipDetails` works (banners show), `fetchClipStats` returns 0 (no stats)
3. Bug in `db.ts:485`: `seen.has(platform)` should be `seen.add(platform)` — deduplication never fires

**The unified screen (Mode A) already has all 5 sections:**
1. Clip code + title header ✓ (lines 340–345)
2. Mini video player ✓ (lines 347–351)
3. Stats row ✓ (lines 354–368)
4. Banners ✓ (inside `ClipDetailBody`)
5. Platform Captions ✓ (inside `ClipDetailBody`)

---

## File Map

| File | Change |
|---|---|
| `src/lib/db.ts` | Fix `seen.has` → `seen.add` bug in `fetchClipStats` |
| `src/components/VideoPreviewModal.tsx` | Remove Mode B (legacy player-only); Mode A handles all cases |
| `src/context/VideoModalContext.tsx` | Remove `onUrlSaved` prop (no longer needed once Mode B gone) — **only if** it's unused elsewhere |

---

## Chunk 1: Fix the stats deduplication bug

### Task 1: Fix `seen.has` → `seen.add` in `fetchClipStats`

**Files:**
- Modify: `src/lib/db.ts:485`

- [ ] **Step 1: Open db.ts and locate the bug**

  In `fetchClipStats` (around line 484–488), change:
  ```typescript
  if (!seen.has(platform)) {
    seen.has(platform);   // ← BUG: never adds to set
  ```
  to:
  ```typescript
  if (!seen.has(platform)) {
    seen.add(platform);   // ← FIX
  ```

- [ ] **Step 2: Verify the change looks correct**

  The fixed block should be:
  ```typescript
  for (const row of (data ?? [])) {
    const platform = row.platform as string;
    if (!seen.has(platform)) {
      seen.add(platform);
      stats.views    += Number(row.views    ?? 0);
      stats.likes    += Number(row.likes    ?? 0);
      stats.comments += Number(row.comments ?? 0);
      stats.shares   += Number(row.shares   ?? 0);
    }
  }
  ```

---

## Chunk 2: Remove Mode B — make VideoPreviewModal Mode A the only mode

### Task 2: Strip Mode B from VideoPreviewModal

**Files:**
- Modify: `src/components/VideoPreviewModal.tsx`

Context: Mode B is the legacy "player-only" screen shown when `clipCode` is undefined. It allows entering a video URL via `onUrlSaved`. With the unified screen, all clicks pass a `clipCode` — Mode B is dead code.

- [ ] **Step 1: Remove the `VideoPlayer` sub-component**

  Delete lines 68–130 (the `VideoPlayer` function). It's only used in Mode B.

- [ ] **Step 2: Remove Mode B render block**

  Delete the Mode B section (lines 389–439 — the second `return` block in `VideoPreviewModal`). The component now only has the Mode A path.

- [ ] **Step 3: Clean up the Props interface**

  Remove `onUrlSaved` from the Props interface:
  ```typescript
  // Before
  interface Props {
    post: UnifiedPost;
    onClose: () => void;
    onUrlSaved: (platform: string, title: string, date: string, url: string) => void;
    clipCode?: string;
  }

  // After
  interface Props {
    post: UnifiedPost;
    onClose: () => void;
    clipCode?: string;
  }
  ```

- [ ] **Step 4: Remove `onUrlSaved` from the component signature**

  ```typescript
  // Before
  export default function VideoPreviewModal({ post, onClose, onUrlSaved, clipCode }: Props) {

  // After
  export default function VideoPreviewModal({ post, onClose, clipCode }: Props) {
  ```

- [ ] **Step 5: Remove Mode B-only imports if any remain**

  Check that `PLATFORM_COLORS` and `PLATFORM_LABELS` imports are still used in Mode A. If not (Mode A only uses `clipCode` and `clipDetail` data), remove them from the import line. **Do not remove `UnifiedPost` — it's used in Props.**

  Mode A uses `post.title` as fallback title only; it does NOT use `PLATFORM_COLORS`/`PLATFORM_LABELS`. Remove them:
  ```typescript
  // Before
  import { UnifiedPost, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';

  // After
  import { UnifiedPost } from '@/types';
  ```

---

## Chunk 3: Update VideoModalContext to drop onUrlSaved

### Task 3: Remove `onUrlSaved` from VideoModalContext

**Files:**
- Modify: `src/context/VideoModalContext.tsx`
- Check: `src/app/page.tsx` (or wherever `VideoModalProvider` is used — find the `onUrlSaved` prop usage)

- [ ] **Step 1: Find all usages of `onUrlSaved` in VideoModalContext**

  Search for `onUrlSaved` across the codebase. It appears in:
  - `VideoModalContext.tsx` — `ProviderProps` interface and `handleUrlSaved`
  - Wherever `<VideoModalProvider onUrlSaved={...}>` is used

- [ ] **Step 2: Check `src/app/page.tsx` for the provider usage**

  Read `src/app/page.tsx`. Find the `VideoModalProvider` and the `onUrlSaved` callback it receives. Note what logic is in that callback (saving a URL to the posts table).

- [ ] **Step 3: Decide whether to keep or remove `onUrlSaved`**

  - If `onUrlSaved` callback in `page.tsx` updates the DB (saves a video URL), that logic still needs to live somewhere even without Mode B.
  - **However:** Mode A uses `video_url` from `clip_details`, not from posts. So the URL-save path is no longer part of the clip detail screen.
  - Remove `onUrlSaved` from VideoModalContext and VideoModalProvider since it's no longer called.

- [ ] **Step 4: Update VideoModalContext**

  ```typescript
  // Remove ProviderProps interface's onUrlSaved field
  interface ProviderProps {
    children: React.ReactNode;
    // onUrlSaved removed
  }

  // Remove handleUrlSaved function
  // Remove onUrlSaved from VideoModalProvider props
  // Remove it from VideoPreviewModal render:
  <VideoPreviewModal
    post={selectedPost}
    onClose={() => { setSelectedPost(null); setSelectedClipCode(undefined); }}
    clipCode={selectedClipCode}
  />
  ```

- [ ] **Step 5: Update VideoModalProvider usage in page.tsx**

  Remove the `onUrlSaved` prop from `<VideoModalProvider>`.

---

## Chunk 4: Verify all clip-name click handlers pass clip_code

### Task 4: Audit all 5 openers

**Files (read-only verification):**
- `src/components/TopPostsTable.tsx`
- `src/components/views/ContentView.tsx`
- `src/components/views/PlatformsView.tsx`

All should already call `open(post, post.clip_code)` or `openModal(post, post.clip_code)`. No changes expected. This is a verification step only.

- [ ] **Step 1: Confirm TopPostsTable passes clip_code**

  Expected: `open(post, post.clip_code)` on the clickable row.

- [ ] **Step 2: Confirm ContentView passes clip_code**

  Expected: `open(post, post.clip_code)` on the clickable card.

- [ ] **Step 3: Confirm PlatformsView passes clip_code**

  Expected: `open(best, best.clip_code)` on the best-post card.

- [ ] **Step 4: Confirm DashboardView passes clip_code**

  Already confirmed: `openVideoModal(post, post.clip_code)` at line 259.

- [ ] **Step 5: Confirm PostingScheduleView passes clip_code**

  Already confirmed: `openModal(minimalPost, post.clip_code)` at line 633.

---

## Chunk 5: Build and ship

### Task 5: Verify build passes and push

- [ ] **Step 1: Run TypeScript build**

  ```bash
  cd /Users/shane/clip-dashboard && npm run build
  ```

  Expected: No TypeScript errors. If errors exist — fix them before continuing.

- [ ] **Step 2: Fix any TypeScript errors**

  Common errors to expect:
  - `onUrlSaved` prop still referenced somewhere → trace and remove
  - `PLATFORM_COLORS`/`PLATFORM_LABELS` import removed but still used → check Mode A doesn't use them

- [ ] **Step 3: Re-run build until clean**

  ```bash
  npm run build
  ```

- [ ] **Step 4: Commit and push**

  ```bash
  cd /Users/shane/clip-dashboard
  git add src/lib/db.ts src/components/VideoPreviewModal.tsx src/context/VideoModalContext.tsx src/app/page.tsx
  git commit -m "fix: consolidate clip detail into single unified screen"
  git push
  ```

---

## Notes on clip_code format mismatch

The stats query (`fetchClipStats`) uses exact `clip_code` match against `posts`. This is correct behavior per spec — show 0 if no matching posts. The format mismatch ("MBM014" in posts vs "MBM015-CLIP-014" in clip_details/scheduled_posts) is a data-layer concern. Stats will correctly show 0 for clips opened from PostingSchedule until the posts table is updated with matching clip_codes. No code change needed for this — exact match + show 0 is the intended behavior.
