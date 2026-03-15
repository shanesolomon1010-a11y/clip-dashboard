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
