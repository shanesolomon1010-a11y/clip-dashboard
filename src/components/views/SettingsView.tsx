'use client';

import { useEffect, useState } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';
import { fetchAllClipDetails, insertClipDetail, deleteClipDetail } from '@/lib/db';
import type { ClipDetail } from '@/lib/db';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

interface Props {
  onClearData?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)]">
        <h3 className="text-[13px] font-semibold text-[var(--text-1)]">{title}</h3>
      </div>
      <div className="divide-y divide-[rgba(247,231,206,0.05)]">{children}</div>
    </div>
  );
}

function Row({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-[rgba(247,231,206,0.02)] transition-colors">
      <div>
        <p className="text-[13px] text-[var(--text-1)] font-medium">{label}</p>
        {sub && <p className="text-[11px] text-[var(--text-3)] mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0 ml-4">{right}</div>
    </div>
  );
}

// ── Clip form state ────────────────────────────────────────────────────────────

interface ClipForm {
  clip_code: string;
  title: string;
  headline_banner: string;
  question_banner: string;
  caption_tiktok: string;
  caption_instagram: string;
  caption_youtube: string;
  caption_linkedin: string;
  caption_twitter: string;
  video_url: string;
}

const EMPTY_FORM: ClipForm = {
  clip_code: '', title: '', headline_banner: '', question_banner: '',
  caption_tiktok: '', caption_instagram: '', caption_youtube: '',
  caption_linkedin: '', caption_twitter: '', video_url: '',
};

function nullIfEmpty(s: string): string | null {
  return s.trim() === '' ? null : s.trim();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SettingsView({ onClearData }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Clip Library state
  const [clips, setClips]           = useState<ClipDetail[]>([]);
  const [form, setForm]             = useState<ClipForm>(EMPTY_FORM);
  const [clipSubmitting, setClipSubmitting] = useState(false);
  const [clipStatus, setClipStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchAllClipDetails()
      .then(setClips)
      .catch(err => console.error('clip_details fetch error:', err));
  }, []);

  const handleRequestClear = () => setConfirmOpen(true);
  const handleCancel = () => setConfirmOpen(false);
  const handleConfirm = () => {
    setConfirmOpen(false);
    onClearData?.();
  };

  function setField(key: keyof ClipForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleAddClip(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clip_code.trim() || !form.title.trim()) return;
    setClipSubmitting(true);
    setClipStatus(null);
    try {
      await insertClipDetail({
        clip_code:        form.clip_code.trim(),
        title:            form.title.trim(),
        headline_banner:  nullIfEmpty(form.headline_banner),
        question_banner:  nullIfEmpty(form.question_banner),
        caption_tiktok:   nullIfEmpty(form.caption_tiktok),
        caption_instagram: nullIfEmpty(form.caption_instagram),
        caption_youtube:  nullIfEmpty(form.caption_youtube),
        caption_linkedin: nullIfEmpty(form.caption_linkedin),
        caption_twitter:  nullIfEmpty(form.caption_twitter),
        video_url:        nullIfEmpty(form.video_url),
      });
      setClipStatus({ type: 'success', message: `Clip "${form.clip_code.trim()}" added.` });
      setForm(EMPTY_FORM);
      const updated = await fetchAllClipDetails();
      setClips(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setClipStatus({ type: 'error', message: msg });
    } finally {
      setClipSubmitting(false);
    }
  }

  async function handleDeleteClip(clipCode: string) {
    try {
      await deleteClipDetail(clipCode);
      setClips(prev => prev.filter(c => c.clip_code !== clipCode));
    } catch (err) {
      console.error('delete clip error:', err);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-bold text-[var(--text-1)] mb-1 tracking-tight">Settings</h2>
        <p className="text-sm text-[var(--text-2)]">Manage your Clip Studio preferences.</p>
      </div>

      {/* Connected platforms */}
      <Section title="Connected Platforms">
        <div className="px-5 py-3 border-b border-[rgba(247,231,206,0.05)]">
          <p className="text-[11px] text-[var(--text-3)]">Live API connections coming soon. All platforms currently support CSV import.</p>
        </div>
        {ALL_PLATFORMS.map((pl) => (
          <Row
            key={pl}
            label={PLATFORM_LABELS[pl]}
            sub="CSV import only — no OAuth required"
            right={
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: `${PLATFORM_COLORS[pl]}15`, color: PLATFORM_COLORS[pl] }}
              >
                CSV Import Ready
              </span>
            }
          />
        ))}
      </Section>

      {/* Clip Library */}
      <Section title="Clip Library">

        {/* Add clip form */}
        <form onSubmit={handleAddClip} className="px-5 py-4 space-y-3">
          <p className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Add Clip</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-[var(--text-3)]">Clip Code</label>
              <input
                type="text"
                placeholder="MBM015-CLIP-014"
                value={form.clip_code}
                onChange={e => setField('clip_code', e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[var(--text-3)]">Title</label>
              <input
                type="text"
                placeholder="Clip title"
                value={form.title}
                onChange={e => setField('title', e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--text-3)]">Headline Banner</label>
            <input
              type="text"
              placeholder="Headline text shown on the clip"
              value={form.headline_banner}
              onChange={e => setField('headline_banner', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--text-3)]">Question Banner</label>
            <input
              type="text"
              placeholder="Question shown on the clip"
              value={form.question_banner}
              onChange={e => setField('question_banner', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
            />
          </div>

          {(['caption_tiktok', 'caption_instagram', 'caption_youtube', 'caption_linkedin', 'caption_twitter'] as const).map(field => {
            const labels: Record<typeof field, string> = {
              caption_tiktok: 'TikTok Caption',
              caption_instagram: 'Instagram Caption',
              caption_youtube: 'YouTube Caption',
              caption_linkedin: 'LinkedIn Caption',
              caption_twitter: 'Twitter/X Caption',
            };
            return (
              <div key={field} className="space-y-1">
                <label className="text-[11px] text-[var(--text-3)]">{labels[field]}</label>
                <textarea
                  rows={2}
                  placeholder={labels[field]}
                  value={form[field]}
                  onChange={e => setField(field, e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] resize-none"
                />
              </div>
            );
          })}

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--text-3)]">Video URL <span className="text-[var(--text-3)] font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="https://…"
              value={form.video_url}
              onChange={e => setField('video_url', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
            />
          </div>

          {clipStatus && (
            <p className={[
              'text-xs',
              clipStatus.type === 'success' ? 'text-green-400' : 'text-red-400',
            ].join(' ')}>
              {clipStatus.message}
            </p>
          )}

          <button
            type="submit"
            disabled={clipSubmitting || !form.clip_code.trim() || !form.title.trim()}
            className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {clipSubmitting ? 'Adding…' : 'Add Clip'}
          </button>
        </form>

        {/* Clip list */}
        {clips.length > 0 && (
          <div className="border-t border-[rgba(247,231,206,0.05)]">
            <div className="px-5 py-2 bg-[rgba(247,231,206,0.02)]">
              <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Existing Clips ({clips.length})</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[rgba(247,231,206,0.05)]">
                  <th className="px-5 py-2 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Code</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Title</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                {clips.map(clip => (
                  <tr key={clip.clip_code} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
                    <td className="px-5 py-3 font-mono text-[var(--text-2)] whitespace-nowrap">{clip.clip_code}</td>
                    <td className="px-3 py-3 text-[var(--text-1)] leading-snug">{clip.title}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => handleDeleteClip(clip.clip_code)}
                        className="text-[10px] text-[var(--text-3)] hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-[rgba(255,68,68,0.08)]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </Section>

      {/* Data & Privacy */}
      <Section title="Data & Privacy">
        <Row
          label="Clear all data"
          sub="Remove all imported posts from memory"
          right={
            <button
              onClick={handleRequestClear}
              className="text-xs font-semibold text-[var(--text-2)] border border-[rgba(247,231,206,0.12)] bg-[rgba(247,231,206,0.06)] px-3 py-1.5 rounded-xl hover:bg-[rgba(247,231,206,0.10)] transition-all"
            >
              Clear data
            </button>
          }
        />
      </Section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            onClick={handleCancel}
            className="absolute inset-0 bg-black/60"
          />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[rgba(247,231,206,0.09)] rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.06)]">
              <p className="text-sm font-semibold text-[var(--text-1)]">Clear all data?</p>
              <p className="text-xs text-[var(--text-3)] mt-1">
                This will remove all imported posts and delete saved AI insights from this browser. This can&apos;t be undone.
              </p>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-2 text-xs font-semibold text-[var(--text-1)] bg-[rgba(247,231,206,0.04)] hover:bg-[rgba(247,231,206,0.07)] border border-[rgba(247,231,206,0.08)] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] hover:opacity-90 rounded-xl transition-colors"
              >
                Yes, clear everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
