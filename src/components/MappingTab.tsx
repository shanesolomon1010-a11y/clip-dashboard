'use client';

import { useState } from 'react';
import { PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';
import type { PendingMapping } from '@/lib/db';

const CODE_RE = /^MBM\d+-CLIP-\d+$/;

interface Props {
  pending: PendingMapping[];
  mappedCodes: string[];
  onMapped: () => Promise<void> | void;
}

function PlatformBadge({ platform }: { platform: PendingMapping['platform'] }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-lg shrink-0"
      style={{ background: `${PLATFORM_COLORS[platform]}15`, color: PLATFORM_COLORS[platform] }}
    >
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

function MappingRow({
  item,
  onSuccess,
}: {
  item: PendingMapping;
  onSuccess: (message: string) => Promise<void> | void;
}) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = code.trim();
  const valid = CODE_RE.test(trimmed);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload =
      item.category === 'PENDING_IG'
        ? { p_code: trimmed, p_yt_video_id: null, p_ig_content_id: item.instagram_content_id }
        : { p_code: trimmed, p_yt_video_id: item.content_id, p_ig_content_id: null };
    try {
      const res = await fetch('/api/library/map-clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { posts_rekeyed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Mapping failed');
      const n = data.posts_rekeyed ?? 0;
      // On success this row drops out of the list (parent re-fetch), so the
      // confirmation is surfaced at the tab level rather than inline.
      await onSuccess(`${trimmed} mapped — ${n} post row${n === 1 ? '' : 's'} re-keyed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex gap-3 px-5 py-4">
      <div
        className="w-16 h-16 rounded-lg shrink-0 bg-cover bg-center bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.06)]"
        style={item.thumbnail_url ? { backgroundImage: `url(${item.thumbnail_url})` } : undefined}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={item.platform} />
          {item.posted_at && (
            <span className="text-[10px] text-[var(--text-3)]">{item.posted_at}</span>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--text-3)] hover:text-[var(--gold)] transition-colors"
            >
              View ↗
            </a>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-1)] mt-1 line-clamp-2">
          {item.title ?? <span className="text-[var(--text-3)]">Untitled</span>}
        </p>
        <p className="text-[10px] font-mono text-[var(--text-3)] mt-0.5 truncate">
          {item.clip_details_code}
        </p>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
          <input
            type="text"
            list="mbm-codes"
            placeholder="MBM015-CLIP-014"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] font-mono focus:outline-none focus:border-[var(--gold-border)]"
          />
          <button
            type="submit"
            disabled={!valid || submitting}
            className="shrink-0 px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Mapping…' : 'Map'}
          </button>
        </form>
        {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
      </div>
    </div>
  );
}

export default function MappingTab({ pending, mappedCodes, onMapped }: Props) {
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSuccess(message: string) {
    setBanner(message);
    await onMapped();
  }

  const withPosts = pending.filter((p) => p.has_posts);
  const orphans = pending.filter((p) => !p.has_posts);

  return (
    <div className="max-w-2xl space-y-5">
      <datalist id="mbm-codes">
        {mappedCodes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {banner && (
        <div className="px-4 py-3 text-sm text-green-400 bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.15)] rounded-xl">
          {banner}
        </div>
      )}

      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)]">
          <h3 className="text-[13px] font-semibold text-[var(--text-1)]">
            Unmapped clips ({withPosts.length})
          </h3>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">
            Enter the MBM###-CLIP-### code for each clip. Mapping re-keys its metrics and
            removes it from this list.
          </p>
        </div>
        {withPosts.length === 0 ? (
          <p className="px-5 py-6 text-xs text-[var(--text-3)]">Nothing to map — backlog is clear.</p>
        ) : (
          <div className="divide-y divide-[rgba(247,231,206,0.05)]">
            {withPosts.map((item) => (
              <MappingRow key={item.clip_details_code} item={item} onSuccess={handleSuccess} />
            ))}
          </div>
        )}
      </div>

      {orphans.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden opacity-70">
          <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-1)]">
              No metrics yet ({orphans.length})
            </h3>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">
              Registered but no posts data has landed — nothing to display until a sync runs.
            </p>
          </div>
          <div className="divide-y divide-[rgba(247,231,206,0.05)]">
            {orphans.map((item) => (
              <div key={item.clip_details_code} className="flex items-center gap-2 px-5 py-3">
                <PlatformBadge platform={item.platform} />
                <span className="text-[11px] font-mono text-[var(--text-3)] truncate">
                  {item.clip_details_code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
