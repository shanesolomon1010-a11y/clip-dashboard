'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS } from '@/types';
import { fetchAllClipDetails, insertClipDetail, upsertClipDetail, deleteClipDetail, updatePostsClipDetailsCode } from '@/lib/db';
import type { ClipDetail } from '@/lib/db';
import DataEditorTab from '@/components/DataEditorTab';
import YouTubeMergerTab from '@/components/YouTubeMergerTab';
import DiagnosticsView from '@/components/views/DiagnosticsView';

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

const VALID_STABS = new Set(['clips', 'data-editor', 'youtube-merger', 'connections', 'bulk-import', 'diagnostics']);

type SettingsTab = 'clips' | 'data-editor' | 'youtube-merger' | 'connections' | 'bulk-import' | 'diagnostics';

export default function SettingsView({ onClearData }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStab = (() => {
    const s = searchParams.get('stab');
    return (s && VALID_STABS.has(s) ? s : 'clips') as SettingsTab;
  })();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialStab);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('stab', activeTab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Clip Library state
  const [clips, setClips]           = useState<ClipDetail[]>([]);
  const [form, setForm]             = useState<ClipForm>(EMPTY_FORM);
  const [clipSubmitting, setClipSubmitting] = useState(false);
  const [clipStatus, setClipStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [urlSyncing, setUrlSyncing] = useState(false);
  const [urlSyncResult, setUrlSyncResult] = useState<{ updated: number; skipped: number; total: number } | null>(null);
  const [urlSyncError, setUrlSyncError] = useState<string | null>(null);

  async function handleSyncUrls() {
    setUrlSyncing(true);
    setUrlSyncResult(null);
    setUrlSyncError(null);
    try {
      const res = await fetch('/api/library/sync-urls', {
        method: 'POST',
        headers: { 'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '' },
      });
      const data = await res.json() as { updated: number; skipped: number; total: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setUrlSyncResult(data);
      const updated = await fetchAllClipDetails();
      setClips(updated);
    } catch (err) {
      setUrlSyncError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUrlSyncing(false);
    }
  }

  // YouTube API state
  const [ytConnected, setYtConnected]       = useState<boolean | null>(null);
  const [ytSyncing, setYtSyncing]           = useState(false);
  const [ytSyncResult, setYtSyncResult]     = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ytLastSync, setYtLastSync]         = useState<string | null>(() => localStorage.getItem('youtube_last_sync'));
  const [ytConnectedBanner, setYtConnectedBanner] = useState(false);

  // YouTube Analytics sync state
  const [ytAnalyticsSyncing, setYtAnalyticsSyncing] = useState(false);
  const [ytAnalyticsSyncResult, setYtAnalyticsSyncResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleYouTubeAnalyticsSync() {
    setYtAnalyticsSyncing(true);
    setYtAnalyticsSyncResult(null);
    try {
      const res = await fetch('/api/youtube-sync', {
        method: 'POST',
        headers: { 'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '' },
      });
      const data = await res.json() as { rowsProcessed?: number; error?: string };
      if (data.error) throw new Error(data.error);
      setYtAnalyticsSyncResult({ type: 'success', message: `Synced ${data.rowsProcessed ?? 0} rows` });
    } catch (err) {
      setYtAnalyticsSyncResult({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setYtAnalyticsSyncing(false);
    }
  }

  // YouTube long-form sync state
  const [ytLongFormSyncing, setYtLongFormSyncing] = useState(false);
  const [ytLongFormResult, setYtLongFormResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleYouTubeLongFormSync() {
    setYtLongFormSyncing(true);
    setYtLongFormResult(null);
    try {
      const res = await fetch('/api/youtube-sync-longform', {
        method: 'POST',
        headers: { 'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '' },
      });
      const data = await res.json() as {
        discovered?: number; synced?: number; errors?: number; error?: string;
      };
      if (data.error) throw new Error(data.error);
      setYtLongFormResult({
        type: 'success',
        message: `Discovered ${data.discovered ?? 0} videos, synced ${data.synced ?? 0} daily rows, ${data.errors ?? 0} errors`,
      });
    } catch (err) {
      setYtLongFormResult({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setYtLongFormSyncing(false);
    }
  }

  // Bulk Import state
  const [bulkImporting, setBulkImporting]   = useState(false);
  const [bulkResult, setBulkResult]         = useState<{ inserted: number; updated: number; clips: { clip_details_code: string; headline: string }[] } | null>(null);
  const [bulkError, setBulkError]           = useState<string | null>(null);

  async function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkImporting(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/import/clips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
        },
        body: JSON.stringify({ file: base64 }),
      });
      const text = await response.text();
      let result: { inserted: number; updated: number; clips: { clip_details_code: string; headline: string }[]; error?: string };
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Server error: ${text.slice(0, 200)}`);
      }
      if (!response.ok) {
        throw new Error(result?.error || 'Import failed');
      }
      const data = result;
      setBulkResult(data);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBulkImporting(false);
      e.target.value = '';
    }
  }

  // Folder view state
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);

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

  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      setYtConnectedBanner(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('connected');
      router.replace(`?${params.toString()}`, { scroll: false });
    }
    fetch('/api/youtube/status')
      .then(r => r.json())
      .then((d: { connected: boolean }) => setYtConnected(d.connected))
      .catch(() => setYtConnected(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleYouTubeSync() {
    setYtSyncing(true);
    setYtSyncResult(null);
    try {
      const res = await fetch('/api/youtube-sync', {
        method: 'POST',
        headers: { 'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '' },
      });
      const data = await res.json() as { rowsProcessed?: number; error?: string };
      if (data.error) throw new Error(data.error);
      const ts = new Date().toISOString();
      localStorage.setItem('youtube_last_sync', ts);
      setYtLastSync(ts);
      setYtSyncResult({ type: 'success', message: `Synced ${data.rowsProcessed ?? 0} rows` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setYtSyncResult({ type: 'error', message: msg });
    } finally {
      setYtSyncing(false);
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
            { key: 'bulk-import', label: 'Bulk Import' },
            { key: 'diagnostics', label: 'Diagnostics' },
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
      {activeTab === 'diagnostics' && <DiagnosticsView />}

      {activeTab === 'connections' && (
        <div className="max-w-2xl space-y-5">
          {ytConnectedBanner && (
            <div className="px-4 py-3 text-sm text-green-400 bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.15)] rounded-xl">
              YouTube connected successfully.
            </div>
          )}

          <Section title="YouTube Analytics API">
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  style={
                    ytConnected
                      ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
                      : { background: 'rgba(247,231,206,0.06)', color: 'var(--text-3)' }
                  }
                >
                  {ytConnected === null ? 'Checking…' : ytConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {ytConnected === false && (
                  <a
                    href="/api/auth"
                    className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity"
                  >
                    Connect YouTube
                  </a>
                )}
                {ytConnected && (
                  <button
                    type="button"
                    onClick={handleYouTubeSync}
                    disabled={ytSyncing}
                    className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {ytSyncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                )}
                {ytConnected && (
                  <button
                    type="button"
                    onClick={handleYouTubeLongFormSync}
                    disabled={ytLongFormSyncing}
                    className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {ytLongFormSyncing ? 'Syncing long-form…' : 'Sync Long-form Now'}
                  </button>
                )}
              </div>
              {ytSyncResult && (
                <p className={`text-xs ${ytSyncResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {ytSyncResult.message}
                </p>
              )}
              {ytLongFormResult && (
                <p className={`text-xs ${ytLongFormResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {ytLongFormResult.message}
                </p>
              )}
              <p className="text-[11px] text-[var(--text-3)]">
                {ytLastSync
                  ? `Last synced: ${new Date(ytLastSync).toLocaleString()}`
                  : 'Never synced'}
              </p>
            </div>
          </Section>

          <Section title="Sync YouTube Analytics">
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] text-[var(--text-3)]">
                Fetch the last 30 days of analytics for all mapped videos and upsert into the posts table.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleYouTubeAnalyticsSync}
                  disabled={ytAnalyticsSyncing}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ytAnalyticsSyncing ? 'Syncing…' : 'Sync YouTube Analytics'}
                </button>
              </div>
              {ytAnalyticsSyncResult && (
                <p className={`text-xs ${ytAnalyticsSyncResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {ytAnalyticsSyncResult.message}
                </p>
              )}
            </div>
          </Section>

        </div>
      )}

      {activeTab === 'bulk-import' && (
        <div className="max-w-2xl space-y-5">
          <Section title="Bulk Import Clips">
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-[var(--text-3)]">
                Upload a <span className="font-mono">.docx</span> file to extract and import clip data automatically using AI.
              </p>

              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-[rgba(247,231,206,0.12)] rounded-xl cursor-pointer hover:border-[var(--gold-border)] hover:bg-[rgba(247,231,206,0.02)] transition-all">
                <span className="text-xs text-[var(--text-3)]">
                  {bulkImporting ? 'Processing…' : 'Click to select a .docx file'}
                </span>
                <input
                  type="file"
                  accept=".docx"
                  onChange={handleBulkImport}
                  disabled={bulkImporting}
                  className="hidden"
                />
              </label>

              {bulkImporting && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
                  <span className="text-xs text-[var(--text-3)]">Extracting and importing clips…</span>
                </div>
              )}

              {bulkError && (
                <p className="text-xs text-red-400">{bulkError}</p>
              )}

              {bulkResult && (
                <div className="space-y-3">
                  <p className="text-xs text-green-400 font-semibold">
                    {bulkResult.inserted} clip{bulkResult.inserted !== 1 ? 's' : ''} imported, {bulkResult.updated} updated
                  </p>
                  {bulkResult.clips.length > 0 && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[rgba(247,231,206,0.05)]">
                          <th className="py-2 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Code</th>
                          <th className="py-2 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider pl-4">Headline</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                        {bulkResult.clips.map(clip => (
                          <tr key={clip.clip_details_code} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
                            <td className="py-2 font-mono text-[var(--text-2)] whitespace-nowrap">{clip.clip_details_code}</td>
                            <td className="py-2 pl-4 text-[var(--text-3)] truncate max-w-xs">{clip.headline}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
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

        {/* Sync Video URLs */}
        <div className="px-5 py-3 border-b border-[rgba(247,231,206,0.05)] flex items-center justify-between gap-4">
          <div>
            <p className="text-[12px] text-[var(--text-2)]">Sync video URLs from Supabase Storage</p>
            {urlSyncResult && (
              <p className="text-[11px] text-green-400 mt-0.5">
                {urlSyncResult.updated} updated, {urlSyncResult.skipped} already had a URL ({urlSyncResult.total} files total)
              </p>
            )}
            {urlSyncError && <p className="text-[11px] text-red-400 mt-0.5">{urlSyncError}</p>}
          </div>
          <button
            type="button"
            onClick={handleSyncUrls}
            disabled={urlSyncing}
            className="shrink-0 px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {urlSyncing ? 'Syncing…' : 'Sync Video URLs'}
          </button>
        </div>

        {/* Existing clips list — folder view */}
        <div>
          <div className="px-5 py-2 bg-[rgba(247,231,206,0.02)] flex items-center justify-between">
            <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">
              {selectedEpisode ? selectedEpisode : `Episodes (${new Set(clips.map(c => c.clip_code)).size})`}
            </p>
            {selectedEpisode && (
              <button
                onClick={() => { setSelectedEpisode(null); setEditingClipCode(null); }}
                className="text-[10px] text-[var(--text-3)] hover:text-[var(--gold)] transition-colors px-2 py-1 rounded hover:bg-[rgba(247,231,206,0.06)]"
              >
                ← Back
              </button>
            )}
          </div>
          {clips.length === 0 ? (
            <p className="px-5 py-4 text-xs text-[var(--text-3)]">No clips yet.</p>
          ) : selectedEpisode === null ? (
            <div className="p-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from(new Set(clips.map(c => c.clip_code))).sort().map(episode => {
                const count = clips.filter(c => c.clip_code === episode).length;
                return (
                  <button
                    key={episode}
                    onClick={() => setSelectedEpisode(episode)}
                    className="text-left px-4 py-3 rounded-xl border border-[rgba(247,231,206,0.07)] bg-[rgba(247,231,206,0.02)] hover:bg-[rgba(247,231,206,0.05)] hover:border-[var(--gold-border)] transition-all"
                  >
                    <p className="font-mono text-[12px] text-[var(--text-1)] font-semibold">{episode}</p>
                    <p className="text-[10px] text-[var(--text-3)] mt-0.5">{count} clip{count !== 1 ? 's' : ''}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[rgba(247,231,206,0.05)]">
                  <th className="px-5 py-2 text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Code</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                {clips.filter(c => c.clip_code === selectedEpisode).map(clip => (
                  <>
                    <tr key={clip.clip_code} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
                      <td className="px-5 py-3 font-mono text-[var(--text-2)] whitespace-nowrap">{clip.clip_details_code}</td>
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
