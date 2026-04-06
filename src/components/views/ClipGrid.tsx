'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ClipDetail } from '@/lib/db';
import ClipReviewView from './ClipReviewView';

interface Props {
  episodePrefix: string;
  selectedClip?: string | null;
  onClipChange?: (clip: string | null) => void;
}

interface ClipWithThumb extends ClipDetail {
  thumbnail_url: string | null;
}

function formatCode(code: string | null): string {
  return code ?? '—';
}

export default function ClipGrid({ episodePrefix, selectedClip, onClipChange }: Props) {
  const [clips, setClips] = useState<ClipWithThumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, string>>({});

  const observerRef = useRef<IntersectionObserver | null>(null);
  const generatedRef = useRef<Set<string>>(new Set());

  const selected = selectedClip !== undefined ? selectedClip : internalSelected;
  const setSelected = (clip: string | null) => {
    setInternalSelected(clip);
    onClipChange?.(clip);
  };

  // Set up IntersectionObserver for lazy thumbnail generation
  useEffect(() => {
    generatedRef.current.clear();
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const code = el.dataset.clipCode;
          const videoUrl = el.dataset.videoUrl;
          if (!code || !videoUrl || generatedRef.current.has(code)) continue;
          generatedRef.current.add(code);
          observerRef.current?.unobserve(el);

          // Generate thumbnail via hidden video + canvas
          const proxy = `/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
          const vid = document.createElement('video');
          vid.muted = true;
          vid.preload = 'metadata';
          vid.crossOrigin = 'anonymous';
          vid.src = proxy;
          vid.currentTime = 0.1;
          vid.addEventListener('seeked', () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = vid.videoWidth || 320;
              canvas.height = vid.videoHeight || 568;
              canvas.getContext('2d')?.drawImage(vid, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              setVideoThumbnails((prev) => ({ ...prev, [code]: dataUrl }));
            } catch {
              // non-fatal — canvas taint or decode error
            }
          }, { once: true });
          vid.load();
        }
      },
      { rootMargin: '200px' }
    );

    return () => observerRef.current?.disconnect();
  }, [episodePrefix]);

  useEffect(() => {
    setInternalSelected(null);
    setLoading(true);
    setVideoThumbnails({});

    async function load() {
      const { data, error } = await supabase
        .from('clip_details')
        .select('*')
        .ilike('clip_details_code', `${episodePrefix}%`)
        .order('clip_details_code');

      if (error) throw error;
      const rows = (data ?? []) as unknown as ClipDetail[];

      // Look up thumbnail_url from posts for each clip
      const withThumbs: ClipWithThumb[] = await Promise.all(
        rows.map(async (clip) => {
          if (!clip.clip_details_code) return { ...clip, thumbnail_url: null };
          const { data: postRow } = await supabase
            .from('posts')
            .select('thumbnail_url')
            .eq('clip_details_code', clip.clip_details_code)
            .not('thumbnail_url', 'is', null)
            .limit(1)
            .maybeSingle();
          return {
            ...clip,
            thumbnail_url: (postRow?.thumbnail_url as string | null) ?? null,
          };
        })
      );

      setClips(withThumbs);
    }

    load().catch(() => setClips([])).finally(() => setLoading(false));
  }, [episodePrefix]);

  // When a clip is selected, render ClipReviewView filling the parent container
  if (selected) {
    return <ClipReviewView clipDetailsCode={selected} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="p-8">
        <p className="text-sm text-[var(--text-3)]">No clips found for {episodePrefix}.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {clips.map((clip) => {
          const code = clip.clip_details_code ?? clip.clip_code;
          const videoThumb = code ? videoThumbnails[code] : null;
          const displayThumb = clip.thumbnail_url ?? videoThumb ?? null;

          return (
            <button
              key={code}
              data-clip-code={code}
              data-video-url={(!clip.thumbnail_url && clip.video_url) ? clip.video_url : ''}
              ref={(el) => {
                if (el && !clip.thumbnail_url && clip.video_url && observerRef.current) {
                  observerRef.current.observe(el);
                }
              }}
              onClick={() => setSelected(code)}
              className="group bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-xl overflow-hidden hover:border-[var(--gold-border)] transition-all duration-150 text-left"
            >
              <div className="aspect-video w-full bg-black flex items-center justify-center overflow-hidden relative">
                {displayThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayThumb}
                    alt={formatCode(clip.clip_details_code)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[var(--text-3)]">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                    <path d="m10 10 4-2.5v5L10 10z" fill="currentColor" stroke="none" />
                  </svg>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-xs font-semibold text-[var(--text-2)] group-hover:text-[var(--gold)] transition-colors truncate">
                  {formatCode(clip.clip_details_code)}
                </p>
                {clip.title && (
                  <p className="text-[11px] text-[var(--text-3)] truncate mt-0.5">{clip.title}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
