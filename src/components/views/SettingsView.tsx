'use client';

import { useEffect, useState } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';
import { fetchAllClipDetails, insertClipDetail, upsertClipDetail, deleteClipDetail, updatePostsClipDetailsCode } from '@/lib/db';
import { syncInstagramReels } from '@/lib/apify';
import type { ClipDetail } from '@/lib/db';
import DataEditorTab from '@/components/DataEditorTab';
import YouTubeMergerTab from '@/components/YouTubeMergerTab';

const ALL_PLATFORMS: Platform[] = ['youtube', 'instagram'];

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
  clip_details_code: string;
  headline_banner: string;
  question_banner: string;
  caption_youtube_title: string;
  caption_youtube: string;
  caption_instagram: string;
  video_url: string;
}

const EMPTY_FORM: ClipForm = {
  clip_code: '', clip_details_code: '', headline_banner: '', question_banner: '',
  caption_youtube_title: '', caption_youtube: '', caption_instagram: '', video_url: '',
};

function nullIfEmpty(s: string): string | null {
  return s.trim() === '' ? null : s.trim();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SettingsView({ onClearData }: Props) {
  const [activeTab, setActiveTab] = useState<'clips' | 'data-editor' | 'youtube-merger' | 'connections'>('clips');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Clip Library state
  const [clips, setClips]           = useState<ClipDetail[]>([]);
  const [form, setForm]             = useState<ClipForm>(EMPTY_FORM);
  const [clipSubmitting, setClipSubmitting] = useState(false);
  const [clipStatus, setClipStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Connections / Apify state
  const [apifyToken, setApifyToken]           = useState(() => localStorage.getItem('apify_token') ?? '');
  const [apifyUsername, setApifyUsername]     = useState(() => localStorage.getItem('apify_instagram_username') ?? '');
  const [apifySaveLabel, setApifySaveLabel]   = useState<'Save' | 'Saved'>('Save');
  const [apifySyncing, setApifySyncing]       = useState(false);
  const [apifyStatus, setApifyStatus]         = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [apifyLastSync, setApifyLastSync]     = useState(() => localStorage.getItem('apify_last_sync'));

  // Edit state
  const [editingClipCode, setEditingClipCode] = useState<string | null>(null);
  const [editForm, setEditForm]               = useState<ClipForm>(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting]   = useState(false);
  const [editStatus, setEditStatus]           = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchAllClipDetails()
      .then(setClips)
      .catch(err => console.error('clip_details fetch error:', err));
  }, []);

  function handleApifySave() {
    localStorage.setItem('apify_token', apifyToken);
    localStorage.setItem('apify_instagram_username', apifyUsername);
    setApifySaveLabel('Saved');
    setTimeout(() => setApifySaveLabel('Save'), 2000);
  }

  async function handleApifySync() {
    setApifySyncing(true);
    setApifyStatus(null);
    try {
      await syncInstagramReels();
      const ts = localStorage.getItem('apify_last_sync');
      setApifyLastSync(ts);
      setApifyStatus({ type: 'success', message: 'Sync complete.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setApifyStatus({ type: 'error', message: msg });
    } finally {
      setApifySyncing(false);
    }
  }

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
    if (!form.clip_code.trim()) return;
    setClipSubmitting(true);
    setClipStatus(null);
    try {
      await insertClipDetail({
        clip_code:             form.clip_code.trim(),
        clip_details_code:     nullIfEmpty(form.clip_details_code),
        title:                 null,
        headline_banner:       nullIfEmpty(form.headline_banner),
        question_banner:       nullIfEmpty(form.question_banner),
        caption_youtube_title: nullIfEmpty(form.caption_youtube_title),
        caption_youtube:       nullIfEmpty(form.caption_youtube),
        caption_instagram:     nullIfEmpty(form.caption_instagram),
        caption_tiktok:        null,
        caption_linkedin:      null,
        caption_twitter:       null,
        video_url:             nullIfEmpty(form.video_url),
      });
      if (form.clip_details_code.trim()) {
        await updatePostsClipDetailsCode(form.clip_code.trim(), form.clip_details_code.trim());
      }
      setClipStatus({ type: 'success', message: `Clip "${form.clip_code.trim()}" added.` });
      setForm(EMPTY_FORM);
      const updated = await fetchAllClipDetails();
      setClips(updated);
    } catch (err) {
      const msg = (err instanceof Error || (err !== null && typeof err === 'object' && 'message' in err))
        ? (err as { message: string }).message
        : 'Unknown error';
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

  function handleStartEdit(clip: ClipDetail) {
    setEditingClipCode(clip.clip_code);
    setEditStatus(null);
    setEditForm({
      clip_code:             clip.clip_code,
      clip_details_code:     clip.clip_details_code ?? '',
      headline_banner:       clip.headline_banner ?? '',
      question_banner:       clip.question_banner ?? '',
      caption_youtube_title: clip.caption_youtube_title ?? '',
      caption_youtube:       clip.caption_youtube ?? '',
      caption_instagram:     clip.caption_instagram ?? '',
      video_url:             clip.video_url ?? '',
    });
  }

  function setEditField(key: keyof ClipForm, value: string) {
    setEditForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleUpdateClip(e: React.FormEvent) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditStatus(null);
    try {
      await upsertClipDetail({
        clip_code:             editForm.clip_code,
        clip_details_code:     nullIfEmpty(editForm.clip_details_code),
        title:                 null,
        headline_banner:       nullIfEmpty(editForm.headline_banner),
        question_banner:       nullIfEmpty(editForm.question_banner),
        caption_youtube_title: nullIfEmpty(editForm.caption_youtube_title),
        caption_tiktok:        null,
        caption_youtube:       nullIfEmpty(editForm.caption_youtube),
        caption_instagram:     nullIfEmpty(editForm.caption_instagram),
        caption_linkedin:      null,
        caption_twitter:       null,
        video_url:             nullIfEmpty(editForm.video_url),
      });
      if (editForm.clip_details_code.trim()) {
        await updatePostsClipDetailsCode(editForm.clip_code, editForm.clip_details_code.trim());
      }
      const updated = await fetchAllClipDetails();
      setClips(updated);
      setEditingClipCode(null);
    } catch (err) {
      const msg = (err instanceof Error || (err !== null && typeof err === 'object' && 'message' in err))
        ? (err as { message: string }).message
        : 'Unknown error';
      setEditStatus({ type: 'error', message: msg });
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-[var(--text-1)] mb-1 tracking-tight">Settings</h2>
        <p className="text-sm text-[var(--text-2)]">Manage your Clip Studio preferences.</p>
        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-1 w-fit">
          {([
            { key: 'clips', label: 'Clip Library' },
            { key: 'data-editor', label: 'Data Editor' },
            { key: 'youtube-merger', label: 'YouTube Merger' },
            { key: 'connections', label: 'Connections' },
          ] as { key: typeof activeTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: activeTab === key ? 'var(--gold)' : 'transparent',
                color: activeTab === key ? '#000' : 'var(--text-3)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'data-editor' && <DataEditorTab />}
      {activeTab === 'youtube-merger' && <YouTubeMergerTab />}

      {activeTab === 'connections' && (
        <div className="max-w-2xl space-y-5">
          <Section title="Apify — Instagram Sync">
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--text-3)]">Apify API Token</label>
                <input
                  type="password"
                  placeholder="apify_api_…"
                  value={apifyToken}
                  onChange={e => setApifyToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--text-3)]">Instagram Username (without @)</label>
                <input
                  type="text"
                  placeholder="foundername"
                  value={apifyUsername}
                  onChange={e => setApifyUsername(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApifySave}
                  className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity"
                >
                  {apifySaveLabel}
                </button>
                <button
                  type="button"
                  onClick={handleApifySync}
                  disabled={apifySyncing}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {apifySyncing ? 'Syncing…' : 'Sync Instagram Now'}
                </button>
              </div>
              {apifyStatus && (
                <p className={`text-xs ${apifyStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {apifyStatus.message}
                </p>
              )}
              <p className="text-[11px] text-[var(--text-3)]">
                {apifyLastSync
                  ? `Last synced: ${new Date(apifyLastSync).toLocaleString()}`
                  : 'Never synced'}
              </p>
            </div>
          </Section>
        </div>
      )}

      {activeTab === 'clips' && <div className="max-w-2xl space-y-5">

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

        {/* Existing clips list */}
        <div>
          <div className="px-5 py-2 bg-[rgba(247,231,206,0.02)]">
            <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Existing Clips ({clips.length})</p>
          </div>
          {clips.length === 0 ? (
            <p className="px-5 py-4 text-xs text-[var(--text-3)]">No clips yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[rgba(247,231,206,0.05)]">
                  <th className="px-5 py-2 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Code</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                {clips.map(clip => (
                  <>
                    <tr key={clip.clip_code} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
                      <td className="px-5 py-3 font-mono text-[var(--text-2)] whitespace-nowrap">{clip.clip_code}</td>
                      <td className="px-3 py-3 text-right flex items-center justify-end gap-1">
                        <button
                          onClick={() => editingClipCode === clip.clip_code ? setEditingClipCode(null) : handleStartEdit(clip)}
                          className="text-[10px] text-[var(--text-3)] hover:text-[var(--gold)] transition-colors px-2 py-1 rounded hover:bg-[rgba(247,231,206,0.06)]"
                        >
                          {editingClipCode === clip.clip_code ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          onClick={() => handleDeleteClip(clip.clip_code)}
                          className="text-[10px] text-[var(--text-3)] hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-[rgba(255,68,68,0.08)]"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {editingClipCode === clip.clip_code && (
                      <tr key={`${clip.clip_code}-edit`}>
                        <td colSpan={2} className="px-5 py-4 bg-[rgba(247,231,206,0.02)] border-b border-[rgba(247,231,206,0.05)]">
                          <form onSubmit={handleUpdateClip} className="space-y-3">
                            <p className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Edit Clip</p>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[11px] text-[var(--text-3)]">Clip Code</label>
                                <input
                                  type="text"
                                  value={editForm.clip_code}
                                  disabled
                                  className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-3)] font-mono opacity-60"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] text-[var(--text-3)]">Clip Details Code</label>
                                <input
                                  type="text"
                                  placeholder="MBM015-CLIP-014"
                                  value={editForm.clip_details_code}
                                  onChange={e => setEditField('clip_details_code', e.target.value)}
                                  className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] text-[var(--text-3)]">Headline Banner</label>
                              <input
                                type="text"
                                placeholder="Headline text shown on the clip"
                                value={editForm.headline_banner}
                                onChange={e => setEditField('headline_banner', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] text-[var(--text-3)]">Question Banner</label>
                              <input
                                type="text"
                                placeholder="Question shown on the clip"
                                value={editForm.question_banner}
                                onChange={e => setEditField('question_banner', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] text-[var(--text-3)]">YouTube Title</label>
                              <input
                                type="text"
                                placeholder="YouTube video title"
                                value={editForm.caption_youtube_title}
                                onChange={e => setEditField('caption_youtube_title', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                              />
                            </div>

                            {(['caption_youtube', 'caption_instagram'] as const).map(field => {
                              const labels: Record<typeof field, string> = {
                                caption_youtube: 'YouTube Caption',
                                caption_instagram: 'Instagram Caption',
                              };
                              return (
                                <div key={field} className="space-y-1">
                                  <label className="text-[11px] text-[var(--text-3)]">{labels[field]}</label>
                                  <textarea
                                    rows={2}
                                    placeholder={labels[field]}
                                    value={editForm[field]}
                                    onChange={e => setEditField(field, e.target.value)}
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
                                value={editForm.video_url}
                                onChange={e => setEditField('video_url', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                              />
                            </div>

                            {editStatus && (
                              <p className={['text-xs', editStatus.type === 'success' ? 'text-green-400' : 'text-red-400'].join(' ')}>
                                {editStatus.message}
                              </p>
                            )}

                            <div className="flex items-center gap-2">
                              <button
                                type="submit"
                                disabled={editSubmitting}
                                className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {editSubmitting ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingClipCode(null)}
                                className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add clip form */}
        <form onSubmit={handleAddClip} className="px-5 py-4 space-y-3 border-t border-[rgba(247,231,206,0.05)]">
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
              <label className="text-[11px] text-[var(--text-3)]">Clip Details Code</label>
              <input
                type="text"
                placeholder="MBM015-CLIP-014"
                value={form.clip_details_code}
                onChange={e => setField('clip_details_code', e.target.value)}
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

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--text-3)]">YouTube Title</label>
            <input
              type="text"
              placeholder="YouTube video title"
              value={form.caption_youtube_title}
              onChange={e => setField('caption_youtube_title', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
            />
          </div>

          {(['caption_youtube', 'caption_instagram'] as const).map(field => {
            const labels: Record<typeof field, string> = {
              caption_youtube: 'YouTube Caption',
              caption_instagram: 'Instagram Caption',
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
            disabled={clipSubmitting || !form.clip_code.trim()}
            className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {clipSubmitting ? 'Adding…' : 'Add Clip'}
          </button>
        </form>


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

      </div>}

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
