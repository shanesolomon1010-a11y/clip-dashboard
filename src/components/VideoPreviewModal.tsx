'use client';

import { useEffect, useState } from 'react';
import { UnifiedPost } from '@/types';
import { formatNum } from '@/lib/utils';
import { fetchClipDetails, ClipDetail, fetchClipStats, ClipStats } from '@/lib/db';

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

interface Props {
  post: UnifiedPost;
  onClose: () => void;
  clipCode: string;
}

// ── Video URL detection ────────────────────────────────────────────────────────

type EmbedInfo =
  | { type: 'youtube';   id: string }
  | { type: 'instagram' }
  | { type: 'mp4' }
  | null;

function detectEmbed(url: string): EmbedInfo {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return { type: 'youtube', id: shortMatch[1] };
    const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return { type: 'youtube', id: shortsMatch[1] };
    const vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vMatch) return { type: 'youtube', id: vMatch[1] };
  }
  if (url.includes('instagram.com')) return { type: 'instagram' };
  if (url.endsWith('.mp4') || url.includes('supabase.co/storage')) return { type: 'mp4' };
  return null;
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

// ── MiniPlayer: used in clip detail mode ──────────────────────────────────────

const miniPlaceholder = (clipCode: string) => (
  <div
    className="w-full rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] flex flex-col items-center justify-center gap-2"
    style={{ height: 280 }}
  >
    <p className="text-[11px] font-mono text-[var(--text-3)]">{clipCode}</p>
    <p className="text-[12px] text-[var(--text-2)]">Video URL not set yet</p>
  </div>
);

function MiniPlayer({ url, clipCode }: { url: string | null; clipCode: string }) {
  if (!url) return miniPlaceholder(clipCode);

  const embed = detectEmbed(url);

  if (embed?.type === 'youtube') {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-black" style={{ height: 280 }}>
        <iframe
          title="YouTube video"
          src={`https://www.youtube.com/embed/${embed.id}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  if (embed?.type === 'instagram') {
    return (
      <div style={{ height: 280, overflow: 'hidden' }} className="rounded-xl">
        <InstagramEmbed url={url} />
      </div>
    );
  }

  if (embed?.type === 'mp4') {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-black" style={{ height: 280 }}>
        <video controls playsInline width="100%" height="100%" style={{ width: '100%', height: '100%' }}>
          <source src={url} type="video/mp4" />
        </video>
      </div>
    );
  }

  return miniPlaceholder(clipCode);
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
  key: keyof Pick<ClipDetail, 'caption_instagram' | 'caption_youtube'>;
  label: string;
  color: string;
}[] = [
  { key: 'caption_youtube',   label: 'YouTube',    color: '#FF4444' },
  { key: 'caption_instagram', label: 'Instagram',  color: '#C855E8' },
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

export default function VideoPreviewModal({ onClose, clipCode }: Props) {
  const [clipDetail, setClipDetail] = useState<ClipDetail | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipFetched, setClipFetched] = useState(false);
  const [clipStats, setClipStats] = useState<ClipStats>({ views: 0, likes: 0, comments: 0, shares: 0 });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!clipCode) return;
    let cancelled = false;
    setClipLoading(true);
    fetchClipDetails(clipCode)
      .then((detail) => { if (!cancelled) setClipDetail(detail); })
      .catch(() => { if (!cancelled) setClipDetail(null); })
      .finally(() => { if (!cancelled) { setClipLoading(false); setClipFetched(true); } });
    fetchClipStats(clipCode)
      .then((stats) => { if (!cancelled) setClipStats(stats); })
      .catch(() => {});
    return () => { cancelled = true; };
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

        {/* Clip code */}
        <div className="mb-5 pr-8">
          <p className="text-[10px] font-mono text-[var(--text-3)] mb-1">{clipCode}</p>
        </div>

        {/* Section 1: Mini player */}
        <MiniPlayer
          url={clipDetail?.video_url ?? null}
          clipCode={clipCode}
        />

        {/* Section 2: Stats row */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {(
            [
              { label: 'Views',    value: clipStats.views    },
              { label: 'Likes',    value: clipStats.likes    },
              { label: 'Comments', value: clipStats.comments },
              { label: 'Shares',   value: clipStats.shares   },
            ] as const
          ).map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)] px-4 py-3 text-center">
              <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.12em] mb-1">{label}</p>
              <p className="text-[15px] font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(value)}</p>
            </div>
          ))}
        </div>

        {/* Section 3: Copy details */}
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
