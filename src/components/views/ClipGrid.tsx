'use client';

import { useEffect, useState } from 'react';
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

  const selected = selectedClip !== undefined ? selectedClip : internalSelected;
  const setSelected = (clip: string | null) => {
    setInternalSelected(clip);
    onClipChange?.(clip);
  };

  useEffect(() => {
    setSelected(null);
    setLoading(true);

    async function load() {
      const { data, error } = await supabase
        .from('clip_details')
        .select(
          'clip_code, clip_details_code, title, headline_banner, question_banner, ' +
          'caption_youtube_title, caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, video_url'
        )
        .like('clip_details_code', `${episodePrefix}%`)
        .order('clip_details_code');

      if (error) throw error;
      const rows = (data ?? []) as unknown as ClipDetail[];

      // For each clip, look up thumbnail_url from posts
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (selected) {
    return (
      <>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-[var(--text-2)] hover:text-[var(--text-1)] text-sm font-medium mb-6 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to {episodePrefix}
        </button>
        <ClipReviewView clipDetailsCode={selected} />
      </>
    );
  }

  if (clips.length === 0) {
    return <p className="text-sm text-[var(--text-3)]">No clips found for {episodePrefix}.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {clips.map((clip) => (
        <button
          key={clip.clip_details_code ?? clip.clip_code}
          onClick={() => setSelected(clip.clip_details_code ?? clip.clip_code)}
          className="group bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-xl overflow-hidden hover:border-[var(--gold-border)] transition-all duration-150 text-left"
        >
          <div className="aspect-video w-full bg-[rgba(247,231,206,0.04)] flex items-center justify-center overflow-hidden">
            {clip.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clip.thumbnail_url}
                alt={formatCode(clip.clip_details_code)}
                className="w-full h-full object-cover"
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
      ))}
    </div>
  );
}
