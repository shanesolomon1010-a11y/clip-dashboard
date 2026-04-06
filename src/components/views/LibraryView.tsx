'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchAllClipDetails } from '@/lib/db';
import ClipGrid from './ClipGrid';

type EpisodeClip = { code: string; videoUrl: string };

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
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(
    searchParams.get('episode')
  );
  const [selectedClip, setSelectedClip] = useState<string | null>(
    searchParams.get('clip')
  );
  const [loading, setLoading] = useState(true);
  const [clipsByEpisode, setClipsByEpisode] = useState<Record<string, EpisodeClip[]>>({});
  const [folderThumbs, setFolderThumbs] = useState<Record<string, (string | null)[]>>({});

  useEffect(() => {
    fetchAllClipDetails()
      .then((rows) => {
        const prefixes = new Set<string>();
        const byEpisode: Record<string, EpisodeClip[]> = {};
        for (const row of rows) {
          const prefix = extractEpisodePrefix(row.clip_details_code);
          if (prefix) {
            prefixes.add(prefix);
            if (!byEpisode[prefix]) byEpisode[prefix] = [];
            if (byEpisode[prefix].length < 4 && row.video_url) {
              byEpisode[prefix].push({ code: row.clip_details_code ?? '', videoUrl: row.video_url });
            }
          }
        }
        setEpisodes(Array.from(prefixes).sort());
        setClipsByEpisode(byEpisode);
      })
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    for (const [episode, clips] of Object.entries(clipsByEpisode)) {
      if (clips.length === 0) continue;
      const thumbs: (string | null)[] = new Array(clips.length).fill(null);
      let resolved = 0;
      clips.forEach((clip, idx) => {
        const proxy = `/api/video-proxy?url=${encodeURIComponent(clip.videoUrl)}`;
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
            thumbs[idx] = canvas.toDataURL('image/jpeg', 0.7);
          } catch {
            thumbs[idx] = null;
          }
          resolved++;
          if (resolved === clips.length) {
            setFolderThumbs((prev) => ({ ...prev, [episode]: [...thumbs] }));
          }
        }, { once: true });
        vid.load();
      });
    }
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

  // Episode or clip selected — full-height layout with breadcrumb header
  if (selectedEpisode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Breadcrumb header */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[rgba(247,231,206,0.06)] shrink-0">
          <button
            onClick={handleBackToLibrary}
            className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
          >
            Library
          </button>
          <ChevronRight />
          {selectedClip ? (
            <>
              <button
                onClick={() => handleClipChange(null)}
                className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
              >
                {selectedEpisode}
              </button>
              <ChevronRight />
              <span className="text-xs text-[var(--text-1)] font-medium">{selectedClip}</span>
            </>
          ) : (
            <span className="text-xs text-[var(--text-1)] font-medium">{selectedEpisode}</span>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ClipGrid
            episodePrefix={selectedEpisode}
            selectedClip={selectedClip}
            onClipChange={handleClipChange}
          />
        </div>
      </div>
    );
  }

  // Episode grid
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
            const hasCollage = thumbs && thumbs.some(Boolean);
            return (
              <button
                key={episode}
                onClick={() => handleSelectEpisode(episode)}
                className="bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-xl aspect-square overflow-hidden hover:border-[var(--gold-border)] transition-all duration-150 group relative"
              >
                {hasCollage ? (
                  <>
                    <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="overflow-hidden bg-[#0a0a0a]">
                          {thumbs[i] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbs[i]!} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[rgba(247,231,206,0.03)]" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-xs font-semibold text-white">{episode}</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-[var(--text-2)] group-hover:text-[var(--gold)] transition-colors">
                      {episode}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
