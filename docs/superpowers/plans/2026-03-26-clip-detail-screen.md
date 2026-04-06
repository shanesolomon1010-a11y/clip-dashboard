# Clip Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade VideoPreviewModal into a full Clip Detail Screen that shows a mini player, banner copy, and per-platform captions when a clip_code is available.

**Architecture:** Add a `clip_details` Supabase table seeded with copy data; thread `clip_code` through VideoModalContext so any component can open the detail screen; upgrade VideoPreviewModal to render either the existing player-only screen (no clip_code) or the full detail screen (clip_code present + data fetched). PostingScheduleView is the primary entry point since scheduled posts already carry `clip_code`.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (supabase-js), Playwright (e2e)

---

## Chunk 1: Database + Data Layer

### Task 1: Create clip_details migration

**Files:**
- Create: `supabase/migrations/20260326_clip_details.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- clip_details: stores per-clip copy assets (banners, captions, video URL)
CREATE TABLE IF NOT EXISTS clip_details (
  id                  uuid primary key default gen_random_uuid(),
  clip_code           text not null unique,
  title               text not null,
  headline_banner     text,
  question_banner     text,
  caption_tiktok      text,
  caption_instagram   text,
  caption_youtube     text,
  caption_linkedin    text,
  caption_twitter     text,
  video_url           text,
  created_at          timestamptz default now()
);

-- Seed data (video_url left blank — filled in later)
INSERT INTO clip_details (
  clip_code, title,
  headline_banner, question_banner,
  caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter,
  video_url
) VALUES
(
  'MBM015-CLIP-001',
  'Your customer data is your only real moat',
  'Your Customer Data Is Your Only Real Moat',
  'Do You Actually Know Who''s Buying From You?',
  'Most brands can''t tell you who their customer actually is beyond a basic demo. That gap is costing you more than any bad ad ever will.',
  'Everyone talks about creative. Almost nobody talks about the thing that actually determines whether any of it works — do you know your customer deeper than age and gender?',
  'Why understanding your customer at a deeper level is the most valuable skill in media buying right now.',
  'The businesses winning on paid media right now aren''t the ones with the best creative or the biggest budgets. They''re the ones who actually understand their customer.',
  '1-2 genuine customer insights can reshape an entire company''s growth trajectory. Most brands don''t have even one.',
  ''
),
(
  'MBM015-CLIP-003',
  'Audience to angle to format',
  'Most Ads Fail Before You Write a Single Word',
  'Are You Building Ads in the Wrong Order?',
  'Audience first. Then angle. Then format. Most people do it backwards and wonder why their ads don''t work.',
  'The pyramid that changes how you build every ad: know who you''re talking to before you decide what to say, and decide what to say before you decide how to say it.',
  'The three-step framework that determines whether your ad works before you shoot a single frame.',
  'Format is the last decision, not the first. Most media buyers pick the format then reverse-engineer the message. That''s why the message feels forced.',
  'Audience → angle → format. In that order. Always.',
  ''
);
```

- [ ] **Step 2: Apply the migration in Supabase**

Run this against your Supabase project (via the SQL editor or CLI):
```bash
# If using Supabase CLI:
supabase db push
# Or paste the SQL directly into the Supabase dashboard SQL editor
```

Expected: table `clip_details` created, 2 rows seeded.

---

### Task 2: Add fetchClipDetails to db.ts

**Files:**
- Modify: `src/lib/db.ts` (append at end)

- [ ] **Step 1: Define the ClipDetail interface and export it**

Append to the end of `src/lib/db.ts`:

```typescript
// ── Clip details ───────────────────────────────────────────────────────────────

export interface ClipDetail {
  clip_code: string;
  title: string;
  headline_banner: string | null;
  question_banner: string | null;
  caption_tiktok: string | null;
  caption_instagram: string | null;
  caption_youtube: string | null;
  caption_linkedin: string | null;
  caption_twitter: string | null;
  video_url: string | null;
}

export async function fetchClipDetails(clipCode: string): Promise<ClipDetail | null> {
  const { data, error } = await supabase
    .from('clip_details')
    .select(
      'clip_code, title, headline_banner, question_banner, ' +
      'caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, ' +
      'video_url'
    )
    .eq('clip_code', clipCode)
    .maybeSingle();

  if (error) throw error;
  return data as ClipDetail | null;
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors related to db.ts.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard && git add supabase/migrations/20260326_clip_details.sql src/lib/db.ts && git commit -m "feat: add clip_details table migration and fetchClipDetails db function"
```

---

## Chunk 2: Context + Modal Upgrade

### Task 3: Thread clip_code through VideoModalContext

**Files:**
- Modify: `src/context/VideoModalContext.tsx`

Current: `open: (post: UnifiedPost) => void`
New: `open: (post: UnifiedPost, clipCode?: string) => void`

- [ ] **Step 1: Update VideoModalContext.tsx**

Replace the full file content with:

```typescript
'use client';

import { createContext, useContext, useState } from 'react';
import { UnifiedPost } from '@/types';
import VideoPreviewModal from '@/components/VideoPreviewModal';

interface VideoModalContextValue {
  open: (post: UnifiedPost, clipCode?: string) => void;
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
  const [selectedClipCode, setSelectedClipCode] = useState<string | undefined>(undefined);

  async function handleUrlSaved(platform: string, title: string, date: string, url: string) {
    await onUrlSaved(platform, title, date, url);
    setSelectedPost((prev) => (prev ? { ...prev, url } : null));
  }

  function openModal(post: UnifiedPost, clipCode?: string) {
    setSelectedPost(post);
    setSelectedClipCode(clipCode);
  }

  return (
    <VideoModalContext.Provider value={{ open: openModal }}>
      {children}
      {selectedPost && (
        <VideoPreviewModal
          post={selectedPost}
          onClose={() => { setSelectedPost(null); setSelectedClipCode(undefined); }}
          onUrlSaved={handleUrlSaved}
          clipCode={selectedClipCode}
        />
      )}
    </VideoModalContext.Provider>
  );
}
```

- [ ] **Step 2: Verify build still compiles (VideoPreviewModal will error until Task 4 — that's expected)**

The build will fail on VideoPreviewModal not accepting `clipCode` prop yet. That is expected. Proceed to Task 4.

---

### Task 4: Upgrade VideoPreviewModal to full Clip Detail Screen

**Files:**
- Modify: `src/components/VideoPreviewModal.tsx`

This is the main upgrade. The component gains two render modes:
1. **No clipCode** → existing layout (title, stats, VideoPlayer) — unchanged
2. **clipCode present** → full detail screen (title, mini player, banners, captions)

- [ ] **Step 1: Replace VideoPreviewModal.tsx with the full upgraded component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { UnifiedPost, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';
import { formatNum } from '@/lib/utils';
import { fetchClipDetails, ClipDetail } from '@/lib/db';

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

interface Props {
  post: UnifiedPost;
  onClose: () => void;
  onUrlSaved: (platform: string, title: string, date: string, url: string) => void;
  clipCode?: string;
}

// ── Video URL helpers ──────────────────────────────────────────────────────────

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

// ── VideoPlayer: used in legacy player-only mode (no clipCode) ─────────────────

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

  async function handleSave() {
    if (!urlInput.trim()) return;
    setSaving(true);
    await onUrlSaved(post.platform, post.title, post.date, urlInput.trim());
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] p-5 space-y-4">
      <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
        No video URL — add a direct video link to this post to enable preview
      </p>
      <div className="flex gap-2">
        <input
          data-testid="url-input"
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste YouTube, TikTok, or Instagram URL…"
          className="flex-1 bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-lg px-3 py-2 text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[rgba(247,231,206,0.16)] transition-colors"
        />
        <button
          data-testid="save-url-btn"
          onClick={handleSave}
          disabled={saving || !urlInput.trim()}
          className="px-4 py-2 bg-[rgba(247,231,206,0.08)] hover:bg-[rgba(247,231,206,0.12)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[12px] font-medium text-[var(--text-1)] transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── MiniPlayer: used in clip detail mode ──────────────────────────────────────

function MiniPlayer({ url, clipCode }: { url: string | null; clipCode: string }) {
  if (!url) {
    return (
      <div
        className="w-full rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] flex flex-col items-center justify-center gap-2"
        style={{ height: 280 }}
      >
        <p className="text-[11px] font-mono text-[var(--text-3)]">{clipCode}</p>
        <p className="text-[12px] text-[var(--text-2)]">Video URL not set yet</p>
      </div>
    );
  }

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      return (
        <div className="w-full rounded-xl overflow-hidden bg-black" style={{ height: 280 }}>
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
        <div
          className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center"
          style={{ height: 280 }}
        >
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
    return (
      <div style={{ height: 280, overflow: 'hidden' }} className="rounded-xl">
        <InstagramEmbed url={url} />
      </div>
    );
  }

  // Unrecognized URL — treat as no URL
  return (
    <div
      className="w-full rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] flex flex-col items-center justify-center gap-2"
      style={{ height: 280 }}
    >
      <p className="text-[11px] font-mono text-[var(--text-3)]">{clipCode}</p>
      <p className="text-[12px] text-[var(--text-2)]">Video URL not set yet</p>
    </div>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[rgba(247,231,206,0.06)] hover:bg-[rgba(247,231,206,0.1)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ── ClipDetailBody ─────────────────────────────────────────────────────────────

const CAPTION_PLATFORMS: {
  key: keyof Pick<ClipDetail, 'caption_tiktok' | 'caption_instagram' | 'caption_youtube' | 'caption_linkedin' | 'caption_twitter'>;
  label: string;
  color: string;
}[] = [
  { key: 'caption_tiktok',    label: 'TikTok',     color: '#FF004F' },
  { key: 'caption_instagram', label: 'Instagram',  color: '#C13584' },
  { key: 'caption_youtube',   label: 'YouTube',    color: '#FF0000' },
  { key: 'caption_linkedin',  label: 'LinkedIn',   color: '#0A66C2' },
  { key: 'caption_twitter',   label: 'Twitter/X',  color: '#1D9BF0' },
];

function ClipDetailBody({ detail }: { detail: ClipDetail }) {
  return (
    <div className="space-y-6 pt-2">

      {/* Banners */}
      <div>
        <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-3">
          Banners
        </h3>
        <div className="space-y-2">
          {detail.headline_banner && (
            <div className="rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] p-4">
              <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.12em] mb-1.5">
                Headline Banner
              </p>
              <p className="text-[13px] font-semibold text-[var(--text-1)] leading-snug">
                {detail.headline_banner}
              </p>
            </div>
          )}
          {detail.question_banner && (
            <div className="rounded-xl border border-[rgba(247,231,206,0.08)] bg-[rgba(247,231,206,0.03)] p-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.12em]">
                  Question Banner
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(212,146,42,0.15)] text-[var(--gold)]">
                  Recommended
                </span>
              </div>
              <p className="text-[13px] font-semibold text-[var(--text-1)] leading-snug">
                {detail.question_banner}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Platform Captions */}
      <div>
        <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-3">
          Platform Captions
        </h3>
        <div className="space-y-2">
          {CAPTION_PLATFORMS.map(({ key, label, color }) => {
            const text = detail[key];
            if (!text) return null;
            return (
              <div
                key={key}
                className="rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                  <CopyButton text={text} />
                </div>
                <p className="text-[12px] text-[var(--text-2)] leading-relaxed">{text}</p>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function VideoPreviewModal({ post, onClose, onUrlSaved, clipCode }: Props) {
  const [clipDetail, setClipDetail] = useState<ClipDetail | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipFetched, setClipFetched] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!clipCode) return;
    setClipLoading(true);
    fetchClipDetails(clipCode)
      .then((detail) => setClipDetail(detail))
      .catch(() => setClipDetail(null))
      .finally(() => { setClipLoading(false); setClipFetched(true); });
  }, [clipCode]);

  // ── Shared backdrop + close button ─────────────────────────────────────────

  const closeBtn = (
    <button
      data-testid="modal-close"
      onClick={onClose}
      className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-[rgba(247,231,206,0.06)] hover:bg-[rgba(247,231,206,0.1)] transition-colors text-[var(--text-3)]"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="w-3.5 h-3.5">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );

  // ── MODE A: clip detail screen (clipCode present) ──────────────────────────
  if (clipCode) {
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
          data-testid="video-modal"
          className="relative bg-[var(--bg-card)] border border-[rgba(247,231,206,0.08)] rounded-2xl w-full max-w-[720px] p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {closeBtn}

          {/* Title + clip code */}
          <div className="mb-5 pr-8">
            <p className="text-[10px] font-mono text-[var(--text-3)] mb-1">{clipCode}</p>
            <h2 className="text-[16px] font-semibold text-[var(--text-1)] leading-snug">
              {clipDetail?.title ?? post.title}
            </h2>
          </div>

          {/* Section 1: Mini player */}
          <MiniPlayer
            url={clipDetail?.video_url ?? null}
            clipCode={clipCode}
          />

          {/* Section 2: Copy details */}
          <div className="mt-6">
            {clipLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!clipLoading && clipFetched && !clipDetail && (
              <p className="text-[12px] text-[var(--text-3)] text-center py-6">
                No copy data added for this clip yet
              </p>
            )}
            {!clipLoading && clipDetail && <ClipDetailBody detail={clipDetail} />}
          </div>
        </div>
      </div>
    );
  }

  // ── MODE B: player-only screen (no clipCode) — original layout ─────────────
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
        data-testid="video-modal"
        className="relative bg-[var(--bg-card)] border border-[rgba(247,231,206,0.08)] rounded-2xl w-full max-w-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {closeBtn}

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

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -30
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard && git add src/context/VideoModalContext.tsx src/components/VideoPreviewModal.tsx && git commit -m "feat: upgrade VideoPreviewModal to full clip detail screen with banner and caption copy"
```

---

## Chunk 3: Wire PostingScheduleView

### Task 5: Make scheduled post cards open the clip detail modal

**Files:**
- Modify: `src/components/views/PostingScheduleView.tsx`

Currently the post cards in the drawer are read-only. We need to make the title clickable so it opens the clip detail screen.

Changes needed:
1. Import `useVideoModal` and `UnifiedPost` type from types
2. Add a `SCHEDULE_TO_UNIFIED` platform map (`'yt'|'ig'|'tt'|'tw'` → `'youtube'|'instagram'|'tiktok'|'twitter'`)
3. Add `onClick` to post card title that calls `open(minimalPost, post.clip_code)`

- [ ] **Step 1: Add imports at the top of PostingScheduleView.tsx**

After line 4 (`import { supabase } from '@/lib/supabase';`), add:

```typescript
import { useVideoModal } from '@/context/VideoModalContext';
import type { UnifiedPost, Platform as UnifiedPlatform } from '@/types';
```

- [ ] **Step 2: Add platform mapping constant after the existing PLATFORM_LABELS constant (after line 35)**

```typescript
const SCHEDULE_TO_UNIFIED: Record<Platform, UnifiedPlatform> = {
  yt: 'youtube',
  ig: 'instagram',
  tt: 'tiktok',
  tw: 'twitter',
};
```

- [ ] **Step 3: Add useVideoModal hook inside the component, right after the useState declarations (after line 80)**

Inside `PostingScheduleView()`, after the `const [todayStr] = useState(getTodayStr);` line, add:

```typescript
  const { open: openModal } = useVideoModal();
```

- [ ] **Step 4: Replace the post card title `<p>` with a clickable version**

Find the title paragraph in the drawer (around line 337):
```typescript
                {/* Title */}
                <p className="text-sm font-medium text-[var(--text-1)] leading-snug">
                  {post.title}
                </p>
```

Replace with:
```typescript
                {/* Title — click to open clip detail */}
                <button
                  onClick={() => {
                    const minimalPost: UnifiedPost = {
                      id: post.id,
                      platform: SCHEDULE_TO_UNIFIED[post.platform],
                      title: post.title,
                      date: post.scheduled_date,
                      views: 0,
                      likes: 0,
                      comments: 0,
                      shares: 0,
                      saves: 0,
                      engagementRate: 0,
                    };
                    openModal(minimalPost, post.clip_code);
                  }}
                  className="text-left text-sm font-medium text-[var(--text-1)] leading-snug hover:text-[rgba(247,231,206,0.8)] transition-colors w-full"
                >
                  {post.title}
                </button>
```

- [ ] **Step 5: Verify build compiles**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -30
```

Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
cd /Users/shane/clip-dashboard && git add src/components/views/PostingScheduleView.tsx && git commit -m "feat: wire PostingScheduleView post card titles to open clip detail modal"
```

---

## Chunk 4: Final Verification

### Task 6: Build + e2e verification + git push

- [ ] **Step 1: Final build check**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -30
```

Expected: Exit 0, no errors.

- [ ] **Step 2: Run e2e tests**

```bash
cd /Users/shane/clip-dashboard && npm run test:e2e 2>&1 | tail -40
```

Expected: All existing tests pass. If any fail, read the error, fix the root cause, re-run.

Common failure patterns to check:
- `data-testid="video-modal"` still present in both render modes ✓ (kept in plan)
- `data-testid="modal-close"` still present ✓ (kept in plan)
- `data-testid="url-input"` and `data-testid="save-url-btn"` still present in MODE B ✓

- [ ] **Step 3: Push to git**

```bash
cd /Users/shane/clip-dashboard && git push
```

---

## Summary of Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/20260326_clip_details.sql` | Create — new table + seed |
| `src/lib/db.ts` | Modify — append `ClipDetail` interface + `fetchClipDetails` |
| `src/context/VideoModalContext.tsx` | Modify — add `clipCode?` param to `open()` |
| `src/components/VideoPreviewModal.tsx` | Modify — full upgrade with detail screen |
| `src/components/views/PostingScheduleView.tsx` | Modify — wire post card titles to modal |

**ContentView.tsx** and **DashboardView.tsx** require no changes. Their `open(post)` calls are already compatible with the new `open(post, clipCode?)` signature; since `UnifiedPost` objects from the `posts` table have no `clip_code`, they naturally fall back to the player-only MODE B.
