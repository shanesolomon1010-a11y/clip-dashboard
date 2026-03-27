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

  // ── Shared close button ────────────────────────────────────────────────────

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
