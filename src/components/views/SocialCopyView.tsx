'use client';

import { useState, useEffect } from 'react';
import { getRecentSocialCopyGenerations, SocialCopyGeneration } from '@/lib/social-copy-db';

function Spinner() {
  return (
    <div
      className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
      style={{ borderColor: 'rgba(255,68,68,0.3)', borderTopColor: '#FF4444' }}
    />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-[11px] font-semibold px-2.5 py-1 rounded border shrink-0 transition-colors"
      style={{
        background: copied ? 'rgba(247,231,206,0.12)' : 'rgba(247,231,206,0.04)',
        border: '1px solid rgba(247,231,206,0.12)',
        color: copied ? 'var(--gold)' : 'var(--text-3)',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CopySection({
  label,
  content,
}: {
  label: string;
  content: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
          {label}
        </p>
        <CopyButton text={content} />
      </div>
      <p
        className="text-[13px] text-[var(--text-1)] leading-relaxed whitespace-pre-wrap p-3 rounded-lg"
        style={{ background: 'rgba(247,231,206,0.04)', border: '1px solid rgba(247,231,206,0.06)' }}
      >
        {content}
      </p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = diffMs / 3_600_000;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = diffMs / 86_400_000;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface GenerateResult {
  id: number;
  headline_banner: string;
  question_banner: string;
  youtube_title: string;
  youtube_description: string;
  instagram_caption: string;
  tokens_used: number;
}

export default function SocialCopyView() {
  const [clipCode, setClipCode]           = useState('');
  const [episodeContext, setEpisodeContext] = useState('');
  const [transcript, setTranscript]        = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState<GenerateResult | null>(null);

  const [history, setHistory]           = useState<SocialCopyGeneration[]>([]);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [expandedId, setExpandedId]     = useState<number | null>(null);

  useEffect(() => {
    getRecentSocialCopyGenerations(20).then(setHistory).catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!clipCode.trim() || !transcript.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/social-copy/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
        },
        body: JSON.stringify({
          clip_code: clipCode.trim(),
          episode_context: episodeContext.trim() || undefined,
          transcript: transcript.trim(),
          additional_notes: additionalNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Generation failed. Please try again.');
        return;
      }

      const data = await res.json() as GenerateResult;
      setResult(data);

      // Prepend to history
      const newEntry: SocialCopyGeneration = {
        id: data.id,
        clip_code: clipCode.trim(),
        episode_context: episodeContext.trim() || null,
        transcript: transcript.trim(),
        additional_notes: additionalNotes.trim() || null,
        headline_banner: data.headline_banner,
        question_banner: data.question_banner,
        youtube_title: data.youtube_title,
        youtube_description: data.youtube_description,
        instagram_caption: data.instagram_caption,
        raw_response: null,
        model_used: 'claude-sonnet-4-20250514',
        tokens_used: data.tokens_used,
        created_at: new Date().toISOString(),
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 20));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadDocx(id: number, clipCode?: string) {
    const res = await fetch(`/api/social-copy/export-docx?id=${id}`, {
      headers: { 'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '' },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const datePart = new Date().toISOString().slice(0, 10);
    a.download = `SocialCopy-${clipCode ?? id}-${datePart}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canGenerate = clipCode.trim().length > 0 && transcript.trim().length > 0;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-1)] tracking-tight">Social Copy Generator</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          Generate YouTube Shorts and Instagram Reels copy from podcast transcripts using the CreativeLaunch framework.
        </p>
      </div>

      {/* Input form */}
      <div
        className="rounded-xl p-6 space-y-5"
        style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(247,231,206,0.06)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Clip code */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
              Clip Code <span className="text-[#FF4444]">*</span>
            </label>
            <input
              type="text"
              value={clipCode}
              onChange={e => setClipCode(e.target.value)}
              placeholder="MBM018-CLIP-001"
              className="w-full text-[13px] text-[var(--text-1)] rounded-lg px-3 py-2.5 outline-none transition-colors placeholder:text-[var(--text-3)]"
              style={{ background: 'rgba(247,231,206,0.04)', border: '1px solid rgba(247,231,206,0.10)' }}
            />
          </div>

          {/* Episode context */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
              Episode Context <span className="text-[var(--text-3)]">(optional)</span>
            </label>
            <input
              type="text"
              value={episodeContext}
              onChange={e => setEpisodeContext(e.target.value)}
              placeholder="MBM018 - Marketing strategies with [guest]"
              className="w-full text-[13px] text-[var(--text-1)] rounded-lg px-3 py-2.5 outline-none transition-colors placeholder:text-[var(--text-3)]"
              style={{ background: 'rgba(247,231,206,0.04)', border: '1px solid rgba(247,231,206,0.10)' }}
            />
          </div>
        </div>

        {/* Transcript */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Transcript <span className="text-[#FF4444]">*</span>
          </label>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste the clip transcript here…"
            rows={12}
            className="w-full text-[13px] text-[var(--text-1)] rounded-lg px-3 py-2.5 outline-none resize-y transition-colors placeholder:text-[var(--text-3)] leading-relaxed"
            style={{ background: 'rgba(247,231,206,0.04)', border: '1px solid rgba(247,231,206,0.10)' }}
          />
        </div>

        {/* Additional notes */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Additional Notes <span className="text-[var(--text-3)]">(optional)</span>
          </label>
          <textarea
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            placeholder="Angle to emphasise, key quote to anchor copy to, etc."
            rows={3}
            className="w-full text-[13px] text-[var(--text-1)] rounded-lg px-3 py-2.5 outline-none resize-y transition-colors placeholder:text-[var(--text-3)]"
            style={{ background: 'rgba(247,231,206,0.04)', border: '1px solid rgba(247,231,206,0.10)' }}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-40"
            style={{ background: '#FF4444', color: '#fff' }}
          >
            {loading && <Spinner />}
            {loading ? 'Generating…' : 'Generate Social Copy'}
          </button>
          {loading && (
            <p className="text-[12px] text-[var(--text-3)]">Usually 20-40 seconds</p>
          )}
        </div>

        {error && (
          <p className="text-[13px] text-[#FF4444]">{error}</p>
        )}
      </div>

      {/* Result */}
      {result && (
        <div
          className="rounded-xl p-6 space-y-6"
          style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(247,231,206,0.06)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-[15px] font-bold text-[var(--text-1)]">Generated Copy</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadDocx(result.id, clipCode.trim())}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(247,231,206,0.06)', border: '1px solid rgba(247,231,206,0.12)', color: 'var(--text-2)' }}
              >
                Download .docx
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                style={{ background: 'rgba(247,231,206,0.06)', border: '1px solid rgba(247,231,206,0.12)', color: 'var(--text-2)' }}
              >
                Generate again
              </button>
            </div>
          </div>

          <div className="space-y-5 divide-y" style={{ borderColor: 'rgba(247,231,206,0.06)' }}>
            <CopySection label="Headline Banner"     content={result.headline_banner} />
            <div className="pt-5">
              <CopySection label="Question Banner"   content={result.question_banner} />
            </div>
            <div className="pt-5">
              <CopySection label="YouTube Title"     content={result.youtube_title} />
            </div>
            <div className="pt-5">
              <CopySection label="YouTube Description" content={result.youtube_description} />
            </div>
            <div className="pt-5">
              <CopySection label="Instagram Caption" content={result.instagram_caption} />
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-3)]">
            {result.tokens_used.toLocaleString()} tokens used · ID {result.id}
          </p>
        </div>
      )}

      {/* Recent generations */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(247,231,206,0.06)' }}
      >
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <p className="text-[13px] font-semibold text-[var(--text-2)]">
            Recent Generations
          </p>
          <span className="text-[var(--text-3)] text-[12px]">{historyOpen ? '▲' : '▼'}</span>
        </button>

        {historyOpen && (
          <div style={{ background: 'var(--bg-base)' }}>
            {history.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-[var(--text-3)]">No generations yet.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(247,231,206,0.06)' }}>
                {history.map(gen => (
                  <div key={gen.id}>
                    <button
                      onClick={() => setExpandedId(expandedId === gen.id ? null : gen.id)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[rgba(247,231,206,0.02)] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded shrink-0"
                          style={{ background: 'rgba(247,231,206,0.06)', color: 'var(--gold)' }}
                        >
                          {gen.clip_code}
                        </span>
                        <span className="text-[12px] text-[var(--text-2)] truncate">
                          {gen.headline_banner ?? '—'}
                        </span>
                      </div>
                      <span className="text-[11px] text-[var(--text-3)] shrink-0">
                        {relativeTime(gen.created_at)}
                      </span>
                    </button>

                    {expandedId === gen.id && gen.headline_banner && (
                      <div
                        className="px-5 pb-5 space-y-4"
                        style={{ background: 'rgba(247,231,206,0.02)' }}
                      >
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => handleDownloadDocx(gen.id, gen.clip_code)}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded transition-colors"
                            style={{ background: 'rgba(247,231,206,0.06)', border: '1px solid rgba(247,231,206,0.12)', color: 'var(--text-3)' }}
                          >
                            Download .docx
                          </button>
                        </div>
                        <CopySection label="Headline Banner"       content={gen.headline_banner} />
                        <CopySection label="Question Banner"       content={gen.question_banner ?? ''} />
                        <CopySection label="YouTube Title"         content={gen.youtube_title ?? ''} />
                        <CopySection label="YouTube Description"   content={gen.youtube_description ?? ''} />
                        <CopySection label="Instagram Caption"     content={gen.instagram_caption ?? ''} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
