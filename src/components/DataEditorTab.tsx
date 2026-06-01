'use client';

import { useEffect, useMemo, useState } from 'react';
import { UnifiedPost } from '@/types';
import { getAllPosts, updatePost, deletePost } from '@/lib/db';

type ColDef = {
  key: keyof UnifiedPost;
  label: string;
  type: 'text' | 'number';
  width: string;
};

const COLS: ColDef[] = [
  { key: 'clip_code',                  label: 'clip_code',            type: 'text',   width: '130px' },
  { key: 'platform',                   label: 'platform',             type: 'text',   width: '100px' },
  { key: 'stat_date',                  label: 'stat_date',            type: 'text',   width: '105px' },
  { key: 'title',                      label: 'title',                type: 'text',   width: '220px' },
  { key: 'views',                      label: 'views',                type: 'number', width: '80px'  },
  { key: 'likes',                      label: 'likes',                type: 'number', width: '70px'  },
  { key: 'comments',                   label: 'comments',             type: 'number', width: '85px'  },
  { key: 'shares',                     label: 'shares',               type: 'number', width: '70px'  },
  { key: 'impressions',                label: 'impressions',          type: 'number', width: '100px' },
  { key: 'impression_ctr',             label: 'impression_ctr',       type: 'number', width: '115px' },
  { key: 'watch_time_hours',           label: 'watch_time_hrs',       type: 'number', width: '120px' },
  { key: 'avg_view_duration_seconds',  label: 'avg_view_dur_s',       type: 'number', width: '115px' },
  { key: 'avg_view_percentage',        label: 'avg_view_%',           type: 'number', width: '100px' },
  { key: 'daily_engaged_views',        label: 'daily_engaged',        type: 'number', width: '115px' },
  { key: 'total_engaged_views',        label: 'total_engaged',        type: 'number', width: '115px' },
  { key: 'unique_viewers',             label: 'unique_viewers',       type: 'number', width: '120px' },
  { key: 'subscribers_gained',         label: 'subs_gained',          type: 'number', width: '105px' },
  { key: 'subscribers_lost',           label: 'subs_lost',            type: 'number', width: '90px'  },
  { key: 'youtube_premium_views',      label: 'yt_premium_views',     type: 'number', width: '135px' },
  { key: 'duration_seconds',           label: 'duration_s',           type: 'number', width: '95px'  },
  { key: 'date',                       label: 'posted_at',            type: 'text',   width: '100px' },
  { key: 'url',                        label: 'url',                  type: 'text',   width: '200px' },
];

const INPUT_BASE =
  'w-full bg-transparent text-[var(--text-1)] text-[12px] focus:outline-none focus:bg-[rgba(247,231,206,0.06)] rounded px-1 py-0.5 tabular-nums';

export default function DataEditorTab() {
  const [posts, setPosts] = useState<UnifiedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'youtube' | 'instagram'>('all');
  const [dirty, setDirty] = useState<Map<string, Partial<UnifiedPost>>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    getAllPosts()
      .then(p => { setPosts(p); setLoadError(null); })
      .catch(err => {
        console.error('getAllPosts error:', err);
        setLoadError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  const displayed = useMemo(() => {
    return posts.filter(p => {
      if (platformFilter !== 'all' && p.platform !== platformFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (p.clip_code ?? '').toLowerCase().includes(s) || p.title.toLowerCase().includes(s);
      }
      return true;
    });
  }, [posts, search, platformFilter]);

  function getCellValue(post: UnifiedPost, key: keyof UnifiedPost): string {
    const dirtyEntry = dirty.get(post.id);
    const val = dirtyEntry && key in dirtyEntry ? dirtyEntry[key] : post[key];
    return val != null ? String(val) : '';
  }

  function setDirtyField(postId: string, key: keyof UnifiedPost, rawVal: string, type: 'text' | 'number') {
    const val: unknown = type === 'number'
      ? (rawVal === '' ? undefined : Number(rawVal))
      : rawVal;
    setDirty(prev => {
      const next = new Map(prev);
      const existing = next.get(postId) ?? {};
      next.set(postId, { ...existing, [key]: val });
      return next;
    });
  }

  async function saveRow(post: UnifiedPost) {
    const fields = dirty.get(post.id);
    if (!fields || Object.keys(fields).length === 0) return;
    setSaving(prev => new Set(prev).add(post.id));
    try {
      await updatePost(post.id, fields);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...fields } : p));
      setDirty(prev => { const next = new Map(prev); next.delete(post.id); return next; });
    } catch (err) {
      console.error('updatePost error:', err);
    } finally {
      setSaving(prev => { const next = new Set(prev); next.delete(post.id); return next; });
    }
  }

  async function deleteRow(postId: string) {
    try {
      await deletePost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setDirty(prev => { const next = new Map(prev); next.delete(postId); return next; });
    } catch (err) {
      console.error('deletePost error:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-3)] text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search clip_code or title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 text-xs bg-[var(--bg-card)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] w-64"
        />
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value as 'all' | 'youtube' | 'instagram')}
          className="px-3 py-2 text-xs bg-[var(--bg-card)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] focus:outline-none focus:border-[var(--gold-border)]"
        >
          <option value="all">All Platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
        </select>
        <span className="text-[11px] text-[var(--text-3)] ml-auto">
          {displayed.length} row{displayed.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loadError ? (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl py-12 text-center text-red-400 text-sm">
          Couldn&apos;t load posts: {loadError}
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl py-12 text-center text-[var(--text-3)] text-sm">
          No rows match the current filters.
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-[12px] border-collapse" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr className="border-b border-[rgba(247,231,206,0.06)]">
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className="px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.12em] whitespace-nowrap sticky top-0 bg-[var(--bg-card)]"
                      style={{ minWidth: col.width }}
                    >
                      {col.label}
                    </th>
                  ))}
                  {/* Actions column */}
                  <th className="px-3 py-2.5 sticky top-0 bg-[var(--bg-card)]" style={{ minWidth: '100px' }} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                {displayed.map(post => {
                  const isDirty = (dirty.get(post.id) && Object.keys(dirty.get(post.id)!).length > 0) ?? false;
                  const isSaving = saving.has(post.id);
                  return (
                    <tr
                      key={post.id}
                      className={[
                        'hover:bg-[rgba(247,231,206,0.015)] transition-colors',
                        isDirty ? 'bg-[rgba(247,201,72,0.04)]' : '',
                      ].join(' ')}
                    >
                      {COLS.map(col => (
                        <td key={col.key} className="px-2 py-1.5" style={{ minWidth: col.width }}>
                          <input
                            type={col.type === 'number' ? 'number' : 'text'}
                            value={getCellValue(post, col.key)}
                            onChange={e => setDirtyField(post.id, col.key, e.target.value, col.type)}
                            className={INPUT_BASE}
                            style={{ fontFamily: col.type === 'number' ? 'var(--font-mono)' : undefined }}
                          />
                        </td>
                      ))}
                      {/* Actions */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isDirty && (
                            <button
                              onClick={() => saveRow(post)}
                              disabled={isSaving}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--gold)] text-[var(--bg-base)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                            >
                              {isSaving ? '…' : 'Save'}
                            </button>
                          )}
                          <button
                            onClick={() => deleteRow(post.id)}
                            className="text-[11px] text-[var(--text-3)] hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-[rgba(255,68,68,0.08)]"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
