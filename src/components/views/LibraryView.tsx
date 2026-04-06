'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchAllClipDetails } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import ClipGrid from './ClipGrid';

type EpisodeClip = { code: string; videoUrl: string; base64: string | null };

function generateAndStoreThumbnail(code: string, videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proxy = `/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
    const vid = document.createElement('video');
    vid.muted = true;
    vid.preload = 'metadata';
    vid.crossOrigin = 'anonymous';
    vid.src = proxy;

    const timeout = setTimeout(() => resolve(null), 20000);

    vid.addEventListener('error', () => { clearTimeout(timeout); resolve(null); }, { once: true });

    vid.addEventListener('seeked', async () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = vid.videoWidth || 320;
        canvas.height = vid.videoHeight || 568;
        canvas.getContext('2d')?.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
        try {
          await supabase.from('clip_details').update({ thumbnail_base64: base64 }).eq('clip_details_code', code);
        } catch { /* non-fatal */ }
        resolve(base64);
      } catch {
        resolve(null);
      }
    }, { once: true });

    vid.addEventListener('loadedmetadata', () => { vid.currentTime = 0.1; }, { once: true });
    vid.load();
  });
}

function ThumbCell({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`${className} bg-[rgba(247,231,206,0.03)]`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`${className} object-cover`} onError={() => setFailed(true)} />
  );
}

function extractEpisodePrefix(clip_details_code: string | null): string | null {
  if (!clip_details_code) return null;
  const match = clip_details_code.match(/^([A-Z]+\d+)/);
  return match ? match[1] : null;
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-[var(--text-3)]">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default function LibraryView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [episodes, setEpisodes] = useState<string[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(searchParams.get('episode'));
  const [selectedClip, setSelectedClip] = useState<string | null>(searchParams.get('clip'));
  const [loading, setLoading] = useState(true);
  const [clipsByEpisode, setClipsByEpisode] = useState<Record<string, EpisodeClip[]>>({});
  const [clipCounts, setClipCounts] = useState<Record<string, number>>({});
  const [folderThumbs, setFolderThumbs] = useState<Record<string, (string | null)[]>>({});

  const observerRef = useRef<IntersectionObserver | null>(null);
  const generatingRef = useRef<Set<string>>(new Set());

  // Load all clip details, pre-populate cached thumbs from thumbnail_base64
  useEffect(() => {
    fetchAllClipDetails()
      .then((rows) => {
        const prefixes = new Set<string>();
        const byEpisode: Record<string, EpisodeClip[]> = {};
        const counts: Record<string, number> = {};

        for (const row of rows) {
          const prefix = extractEpisodePrefix(row.clip_details_code);
          if (prefix) {
            prefixes.add(prefix);
            counts[prefix] = (counts[prefix] ?? 0) + 1;
            if (!byEpisode[prefix]) byEpisode[prefix] = [];
            if (byEpisode[prefix].length < 3 && row.video_url) {
              byEpisode[prefix].push({
                code: row.clip_details_code ?? '',
                videoUrl: row.video_url,
                base64: row.thumbnail_base64 ?? null,
              });
            }
          }
        }

        // Pre-populate thumbs from cached base64 — no async needed
        const initialThumbs: Record<string, (string | null)[]> = {};
        for (const [episode, clips] of Object.entries(byEpisode)) {
          initialThumbs[episode] = clips.map((c) =>
            c.base64 ? `data:image/jpeg;base64,${c.base64}` : null
          );
        }

        setEpisodes(Array.from(prefixes).sort());
        setClipsByEpisode(byEpisode);
        setClipCounts(counts);
        setFolderThumbs(initialThumbs);
      })
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, []);

  // IntersectionObserver: lazy-generate missing thumbnails when card enters viewport
  useEffect(() => {
    observerRef.current?.disconnect();
    generatingRef.current.clear();

    observerRef.current = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const episode = (entry.target as HTMLElement).dataset.episode;
        if (!episode) continue;
        observerRef.current?.unobserve(entry.target);

        const clips = clipsByEpisode[episode] ?? [];
        clips.forEach(async (clip, idx) => {
          if (clip.base64 || generatingRef.current.has(clip.code)) return;
          generatingRef.current.add(clip.code);

          const base64 = await generateAndStoreThumbnail(clip.code, clip.videoUrl);
          if (base64) {
            setFolderThumbs((prev) => {
              const existing = prev[episode] ?? new Array(clips.length).fill(null);
              const updated = [...existing];
              updated[idx] = `data:image/jpeg;base64,${base64}`;
              return { ...prev, [episode]: updated };
            });
          }
        });
      }
    }, { rootMargin: '200px' });

    return () => observerRef.current?.disconnect();
  }, [clipsByEpisode]);

  const updateURL = (episode: string | null, clip: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (episode) params.set('episode', episode); else params.delete('episode');
    if (clip) params.set('clip', clip); else params.delete('clip');
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleSelectEpisode = (episode: string) => {
    setSelectedEpisode(episode);
    setSelectedClip(null);
    updateURL(episode, null);
  };

  const handleBackToLibrary = () => {
    setSelectedEpisode(null);
    setSelectedClip(null);
    updateURL(null, null);
  };

  const handleClipChange = (clip: string | null) => {
    setSelectedClip(clip);
    updateURL(selectedEpisode, clip);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (selectedEpisode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[rgba(247,231,206,0.06)] shrink-0">
          <button onClick={handleBackToLibrary} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
            Library
          </button>
          <ChevronRight />
          {selectedClip ? (
            <>
              <button onClick={() => handleClipChange(null)} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
                {selectedEpisode}
              </button>
              <ChevronRight />
              <span className="text-xs text-[var(--text-1)] font-medium">{selectedClip}</span>
            </>
          ) : (
            <span className="text-xs text-[var(--text-1)] font-medium">{selectedEpisode}</span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ClipGrid episodePrefix={selectedEpisode} selectedClip={selectedClip} onClipChange={handleClipChange} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 overflow-y-auto h-full">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Library</h1>
      <p className="text-sm text-[var(--text-3)] mb-8">
        {episodes.length} episode{episodes.length !== 1 ? 's' : ''}
      </p>

      {episodes.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No episodes found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {episodes.map((episode) => {
            const thumbs = folderThumbs[episode];
            return (
              <button
                key={episode}
                data-episode={episode}
                ref={(el) => { if (el && observerRef.current) observerRef.current.observe(el); }}
                onClick={() => handleSelectEpisode(episode)}
                className="bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-xl overflow-hidden hover:border-[var(--gold-border)] transition-all duration-150 group text-left"
              >
                {/* Collage: large left + two stacked right */}
                <div className="w-full aspect-video bg-[#0a0a0a] flex overflow-hidden">
                  <div className="flex-[3] overflow-hidden">
                    {thumbs?.[0]
                      ? <ThumbCell src={thumbs[0]} className="w-full h-full" />
                      : <div className="w-full h-full bg-[rgba(247,231,206,0.03)]" />}
                  </div>
                  <div className="flex-[2] flex flex-col border-l border-[rgba(0,0,0,0.4)]">
                    <div className="flex-1 overflow-hidden border-b border-[rgba(0,0,0,0.4)]">
                      {thumbs?.[1]
                        ? <ThumbCell src={thumbs[1]} className="w-full h-full" />
                        : <div className="w-full h-full bg-[rgba(247,231,206,0.02)]" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      {thumbs?.[2]
                        ? <ThumbCell src={thumbs[2]} className="w-full h-full" />
                        : <div className="w-full h-full bg-[rgba(247,231,206,0.02)]" />}
                    </div>
                  </div>
                </div>
                {/* Info */}
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-[var(--text-1)] group-hover:text-[var(--gold)] transition-colors">{episode}</p>
                  <p className="text-[11px] text-[var(--text-3)] mt-0.5">{clipCounts[episode] ?? 0} clips</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
