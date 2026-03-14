'use client';

import { useEffect, useState } from 'react';
import { CaptionRow, fetchCaptions, saveCaption } from '@/lib/db';

const PLATFORMS = ['TikTok', 'Instagram', 'LinkedIn', 'X', 'YouTube'] as const;
type CaptionPlatform = typeof PLATFORMS[number];

const TONES = ['Engaging', 'Professional', 'Casual', 'Viral'] as const;
type CaptionTone = typeof TONES[number];

const PLATFORM_CHAR_LIMITS: Record<CaptionPlatform, number> = {
  TikTok:    2200,
  Instagram: 2200,
  LinkedIn:  3000,
  X:         280,
  YouTube:   5000,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CaptionView() {
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<CaptionPlatform>('TikTok');
  const [tone, setTone] = useState<CaptionTone>('Engaging');
  const [generating, setGenerating] = useState(false);
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState<CaptionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const key =
      typeof window !== 'undefined'
        ? (localStorage.getItem('clip_studio_anthropic_key') ?? '')
        : '';
    setApiKey(key);
    fetchCaptions()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const generate = async () => {
    if (!description.trim() || !apiKey || generating) return;
    setGenerating(true);
    setError('');
    setSaveError('');
    setCaption('');
    try {
      const system = `You are a social media caption writer. Write a single caption for a ${platform} post. Tone: ${tone}. The clip: ${description}. Requirements: Platform-native voice, relevant hashtags, within ${PLATFORM_CHAR_LIMITS[platform]} characters. Output only the caption text with hashtags — no explanation, no quotes.`;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          system,
          messages: [{ role: 'user', content: description }],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: { message?: string } }).error?.message ?? `API error ${res.status}`);
      }
      const json = await res.json();
      const text: string = (json.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      setCaption(text);
      try {
        await saveCaption({ clip_description: description, platform, tone, caption_text: text });
        const updated = await fetchCaptions();
        setHistory(updated);
      } catch {
        setSaveError('Caption generated but could not be saved to history.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const noKey = !apiKey;

  return (
    <div className="p-5 max-w-3xl space-y-5">
      {/* Generator card */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5 space-y-4">
        <h2 className="text-[15px] font-semibold text-[var(--text-1)]">Caption Generator</h2>

        {noKey && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-400">
            No API key found. Enter your Anthropic key in <strong>AI Insights</strong> first — it&apos;s shared across all AI features.
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-2 block">
            Clip Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your clip — what happens, the vibe, key moments"
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] resize-none transition-colors"
          />
        </div>

        {/* Platform */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-2 block">
            Platform
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  platform === p
                    ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
                    : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-2 block">
            Tone
          </label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  tone === t
                    ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
                    : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating || !description.trim() || noKey}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--gold)] text-[var(--bg-base)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {generating ? 'Generating…' : 'Generate Caption'}
        </button>

        {error && (
          <p className="text-[12px] text-red-400">{error}</p>
        )}

        {/* Output */}
        {caption && (
          <div className="space-y-2">
            <div className="relative">
              <pre className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] whitespace-pre-wrap font-sans leading-relaxed pr-16">
                {caption}
              </pre>
              <button
                onClick={copy}
                className="absolute top-2 right-2 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {saveError && (
              <p className="text-[11px] text-red-400">{saveError}</p>
            )}
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">History</h3>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">Last 10 captions</p>
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--text-2)] text-sm">
            No captions generated yet
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {history.map((c) => (
              <div key={c.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]">
                    {c.platform}
                  </span>
                  <span className="text-[10px] text-[var(--text-3)] border border-white/[0.06] px-2 py-0.5 rounded-md">
                    {c.tone}
                  </span>
                  <span className="text-[10px] text-[var(--text-3)] ml-auto">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-3)] truncate">{c.clip_description}</p>
                <p className="text-[13px] text-[var(--text-1)] leading-snug whitespace-pre-wrap">
                  {c.caption_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
