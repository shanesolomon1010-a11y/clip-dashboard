'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchAllClipDetails } from '@/lib/db';
import ClipGrid from './ClipGrid';

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

  useEffect(() => {
    fetchAllClipDetails()
      .then((rows) => {
        const prefixes = new Set<string>();
        for (const row of rows) {
          const prefix = extractEpisodePrefix(row.clip_details_code);
          if (prefix) prefixes.add(prefix);
        }
        setEpisodes(Array.from(prefixes).sort());
      })
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, []);

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
          {episodes.map((episode) => (
            <button
              key={episode}
              onClick={() => handleSelectEpisode(episode)}
              className="bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-xl aspect-square flex items-center justify-center hover:border-[var(--gold-border)] hover:bg-[var(--gold-dim)] transition-all duration-150 group"
            >
              <span className="text-sm font-semibold text-[var(--text-2)] group-hover:text-[var(--gold)] transition-colors">
                {episode}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
