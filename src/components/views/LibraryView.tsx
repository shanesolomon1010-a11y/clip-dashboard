'use client';

import { useEffect, useState } from 'react';
import { fetchAllClipDetails } from '@/lib/db';
import ClipGrid from './ClipGrid';

function extractEpisodePrefix(clip_details_code: string | null): string | null {
  if (!clip_details_code) return null;
  const match = clip_details_code.match(/^([A-Z]+\d+)/);
  return match ? match[1] : null;
}

export default function LibraryView() {
  const [episodes, setEpisodes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (selected) {
    return (
      <div className="p-8">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-[var(--text-2)] hover:text-[var(--text-1)] text-sm font-medium mb-8 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to Library
        </button>
        <h2 className="text-xl font-semibold text-[var(--text-1)] mb-6">{selected}</h2>
        <ClipGrid episodePrefix={selected} />
      </div>
    );
  }

  return (
    <div className="p-8">
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
              onClick={() => setSelected(episode)}
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
