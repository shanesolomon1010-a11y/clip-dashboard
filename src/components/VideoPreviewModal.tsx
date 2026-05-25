'use client';

import { useEffect, useState } from 'react';
import { UnifiedPost } from '@/types';
import { fetchClipDetails, ClipDetail } from '@/lib/db';

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
    const embedUrl = url.endsWith('/embed/') ? url : `${url.replace(/\/$/, '')}/embed/`;
    return (
      <div className="w-full rounded-xl overflow-hidden bg-black" style={{ height: 280 }}>
        <iframe
          title="Instagram reel"
          src={embedUrl}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full"
          style={{ border: 0 }}
        />
      </div>
    );
  }

  if (embed?.type === 'mp4') {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-black" style={{ height: 280 }}>
        <video controls playsInline width="100%" height="100%" style={{ width: '100%', height: '100%' }}>
          <source src={`/api/video-proxy?url=${encodeURIComponent(url)}`} type="video/mp4" />
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

function DetailField({
  label,
  text,
  preWrap,
  accentColor,
}: {
  label: string;
  text: string;
  preWrap?: boolean;
  accentColor?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={
        accentColor
          ? {
              background: `color-mix(in srgb, ${accentColor} 6%, transparent)`,
              border: `1px solid color-mix(in srgb, ${accentColor} 20%, transparent)`,
              borderLeft: `3px solid color-mix(in srgb, ${accentColor} 50%, transparent)`,
            }
          : {
              background: 'rgba(247,231,206,0.02)',
              border: '1px solid rgba(247,231,206,0.06)',
            }
      }
    >
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: accentColor ?? 'var(--text-3)' }}
        >
          {label}
        </p>
        <CopyButton text={text} />
      </div>
      <p
        className="text-[13px] text-[var(--text-1)] leading-relaxed"
        style={preWrap ? { whiteSpace: 'pre-wrap' } : undefined}
      >
        {text}
      </p>
    </div>
  );
}

function ClipDetailBody({ detail }: { detail: ClipDetail }) {
  return (
    <div className="space-y-2 pt-2">
      {detail.headline_banner && (
        <DetailField label="Headline Banner" text={detail.headline_banner} />
      )}
      {detail.question_banner && (
        <DetailField label="Question Banner" text={detail.question_banner} />
      )}
      {detail.caption_youtube_title && (
        <DetailField label="YouTube Title" text={detail.caption_youtube_title} accentColor="#FF4444" />
      )}
      {detail.caption_youtube && (
        <DetailField label="YouTube Caption" text={detail.caption_youtube} accentColor="#FF4444" />
      )}
      {detail.caption_instagram && (
        <DetailField label="Instagram Caption" text={detail.caption_instagram} preWrap accentColor="#C855E8" />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function VideoPreviewModal({ post, onClose, clipCode }: Props) {
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
    let cancelled = false;
    setClipLoading(true);
    fetchClipDetails(clipCode)
      .then((detail) => { if (!cancelled) setClipDetail(detail); })
      .catch(() => { if (!cancelled) setClipDetail(null); })
      .finally(() => { if (!cancelled) { setClipLoading(false); setClipFetched(true); } });
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
          <p className="text-[22px] font-bold text-[var(--text-1)] leading-tight">{clipCode}</p>
        </div>

        {/* Section 1: Mini player */}
        <MiniPlayer
          url={clipDetail?.video_url ?? post?.url ?? null}
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
