'use client';

import { useEffect, useRef, useState } from 'react';
import { Platform, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { IconSparkles, IconSend, IconRefresh } from '@/components/Icons';
import {
  InsightRow,
  fetchInsightHistory,
  saveInsight,
  clearInsightHistory,
} from '@/lib/db';

// ── Types ────────────────────────────────────────────────────────────────────

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface Insights {
  whatsWorking: string;
  whatToImprove: string;
  nextClips: string;
  bestTimes: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const INSIGHTS_STORAGE_KEY = 'clip_studio_ai_insights_v1';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function fingerprintPosts(posts: UnifiedPost[]): string {
  if (!posts.length) return 'empty';
  const ids = posts.map((p) => p.id).sort().join('|');
  const dates = posts.map((p) => p.date).sort();
  const sumViews = posts.reduce((s, p) => s + p.views, 0);
  return hashString(`${posts.length}|${dates[0]}|${dates[dates.length - 1]}|${sumViews}|${ids}`);
}

function getTopPlatform(posts: UnifiedPost[]): string {
  const totals = new Map<Platform, number>();
  for (const p of posts) totals.set(p.platform, (totals.get(p.platform) ?? 0) + p.views);
  let top: Platform | null = null;
  let topViews = 0;
  totals.forEach((views, platform) => {
    if (views > topViews) { top = platform; topViews = views; }
  });
  return top ? PLATFORM_LABELS[top] : 'Unknown';
}

function getAvgViews(posts: UnifiedPost[]): number {
  if (!posts.length) return 0;
  return Math.round(posts.reduce((s, p) => s + p.views, 0) / posts.length);
}

/** Converts structured insights to a human-readable string for Supabase storage. */
function insightsToText(ins: Insights): string {
  return [
    `What's Working:\n${ins.whatsWorking}`,
    `What to Improve:\n${ins.whatToImprove}`,
    `Your Next 3 Clips:\n${ins.nextClips}`,
    `Best Times to Post:\n${ins.bestTimes}`,
  ].join('\n\n');
}

/** Builds the system prompt, optionally injecting previous insight history. */
function buildSystemPrompt(history: InsightRow[]): string {
  const parts: string[] = [];

  if (history.length > 0) {
    const chronological = [...history].reverse(); // oldest → newest for Claude
    const lines = chronological.map((row) => {
      const date = new Date(row.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      return `${date}: ${row.insight_text}`;
    });
    parts.push(
      'You are a social media performance analyst with memory of past analyses. ' +
      'Use the previous insights below to identify trends, check if past recommendations were followed, ' +
      'and give increasingly specific advice over time.\n\n' +
      `Previous analyses (oldest to newest):\n${lines.join('\n\n')}`
    );
  } else {
    parts.push(
      'You are a social media performance analyst specializing in short-form video content for a clipping business. ' +
      'Analyze this creator\'s cross-platform performance data and give specific actionable recommendations.'
    );
  }

  parts.push(
    'When responding to the initial analysis request, always return valid JSON (no markdown fences, raw JSON only) ' +
    'with exactly these four string keys: whatsWorking, whatToImprove, nextClips, bestTimes. ' +
    'Each value should be a detailed multi-line string using plain numbered or bulleted lines — no markdown headers.'
  );

  return parts.join('\n\n');
}

function buildPostPayload(posts: UnifiedPost[]) {
  const sorted = [...posts].sort((a, b) => b.views - a.views);

  const top10 = sorted.slice(0, 10).map((p) => ({
    title: p.title,
    platform: PLATFORM_LABELS[p.platform],
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
    engagementRate: p.engagementRate,
    date: p.date,
  }));

  const bottom10 = sorted.slice(-10).reverse().map((p) => ({
    title: p.title,
    platform: PLATFORM_LABELS[p.platform],
    views: p.views,
    engagementRate: p.engagementRate,
    date: p.date,
  }));

  const platformBreakdown = (['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'] as const)
    .map((pl) => {
      const pp = posts.filter((p) => p.platform === pl);
      if (!pp.length) return null;
      return {
        platform: PLATFORM_LABELS[pl],
        posts: pp.length,
        totalViews: pp.reduce((s, p) => s + p.views, 0),
        totalLikes: pp.reduce((s, p) => s + p.likes, 0),
        totalShares: pp.reduce((s, p) => s + p.shares, 0),
        avgEngagementRate: parseFloat(
          (pp.reduce((s, p) => s + p.engagementRate, 0) / pp.length).toFixed(2)
        ),
        topPost: pp.sort((a, b) => b.views - a.views)[0]?.title,
      };
    })
    .filter(Boolean);

  const dates = posts.map((p) => p.date).sort();
  return {
    totalPosts: posts.length,
    dateRange: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
    platformBreakdown,
    top10ByViews: top10,
    bottom10ByViews: bottom10,
  };
}

function buildInitialUserMessage(posts: UnifiedPost[]): string {
  const payload = buildPostPayload(posts);
  return (
    `Here is my performance data:\n\n${JSON.stringify(payload, null, 2)}\n\n` +
    `Based on this performance data, give me: 1) What's Working (top 3 patterns from best performers), ` +
    `2) What to Improve (top 3 patterns from underperformers), 3) My Next 3 Clips (specific content ideas ` +
    `based on what performs best), 4) Best Times to Post broken down by platform. ` +
    `Be specific and reference actual numbers from the data.`
  );
}

function parseInsights(text: string): Insights | null {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.whatsWorking === 'string' &&
      typeof parsed.whatToImprove === 'string' &&
      typeof parsed.nextClips === 'string' &&
      typeof parsed.bestTimes === 'string'
    ) {
      return parsed as Insights;
    }
    return null;
  } catch {
    return null;
  }
}

async function callClaude(
  messages: ApiMessage[],
  systemPrompt: string
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ADMIN_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json() as { content: { text: string }[] };
  return data.content[0]?.text ?? '';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightCard({
  title, content, accent, icon,
}: {
  title: string; content: string; accent: string; icon: string;
}) {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-white/[0.05]">
      <div className="px-5 py-4 flex items-center gap-3" style={{ background: `${accent}0d`, borderBottom: `1px solid ${accent}18` }}>
        <span className="text-xl">{icon}</span>
        <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-2">
        {lines.map((line, i) => (
          <p key={i} className="text-[13px] text-[var(--text-1)] leading-relaxed">{line}</p>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--gold)] animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm text-[var(--text-1)] font-medium">Analyzing your performance data…</p>
        <p className="text-xs text-[var(--text-3)] mt-1">This usually takes 5–10 seconds</p>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center text-[10px] font-bold ${
        isUser
          ? 'bg-[var(--gold-dim)] text-[var(--gold)]'
          : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white'
      }`}>
        {isUser ? 'You' : 'AI'}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-[var(--gold-dim)] border border-[var(--gold-border)] text-[var(--text-1)]'
          : 'bg-white/[0.03] border border-white/[0.05] text-[var(--text-1)]'
      }`}>
        {msg.text.split('\n').map((line, i) => (
          <p key={i} className={line === '' ? 'mt-2' : ''}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      className={`w-4 h-4 text-[var(--text-2)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface Props {
  posts: UnifiedPost[];
}

export default function AIInsightsView({ posts }: Props) {
  const [loading, setLoading]                     = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [insights, setInsights]                   = useState<Insights | null>(null);
  const [rawFallback, setRawFallback]             = useState<string | null>(null);
  const [savedForFingerprint, setSavedForFingerprint] = useState<string | null>(null);

  // Persistent system prompt for the current session (includes history context)
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState(() => buildSystemPrompt([]));

  const [apiMessages, setApiMessages]             = useState<ApiMessage[]>([]);
  const [chatLog, setChatLog]                     = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]                 = useState('');
  const [chatLoading, setChatLoading]             = useState(false);

  // Supabase history
  const [insightHistory, setInsightHistory]       = useState<InsightRow[]>([]);
  const [historyOpen, setHistoryOpen]             = useState(false);
  const [clearingHistory, setClearingHistory]     = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Load on mount ───────────────────────────────────────────────────────────

  useEffect(() => {
    // Restore last session from localStorage
    try {
      const stored = localStorage.getItem(INSIGHTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          insights?: Insights | null;
          rawFallback?: string | null;
          postsFingerprint?: string;
        };
        if (parsed?.insights) setInsights(parsed.insights);
        if (typeof parsed?.rawFallback === 'string') setRawFallback(parsed.rawFallback);
        if (typeof parsed?.postsFingerprint === 'string') setSavedForFingerprint(parsed.postsFingerprint);
      }
    } catch { /* ignore */ }

    // Load Supabase history (non-fatal)
    fetchInsightHistory()
      .then((rows) => {
        setInsightHistory(rows);
        setSessionSystemPrompt(buildSystemPrompt(rows));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!ADMIN_API_KEY.trim() || !posts.length) return;
    setLoading(true);
    setError(null);
    setChatLog([]);
    setApiMessages([]);

    try {
      // Fetch latest history first so the prompt is as fresh as possible
      let history: InsightRow[] = insightHistory;
      try {
        history = await fetchInsightHistory();
        setInsightHistory(history);
      } catch { /* use cached */ }

      const sysPrompt = buildSystemPrompt(history);
      setSessionSystemPrompt(sysPrompt);

      const userMsg = buildInitialUserMessage(posts);
      const messages: ApiMessage[] = [{ role: 'user', content: userMsg }];
      const text = await callClaude(messages, sysPrompt);

      const parsed = parseInsights(text);
      if (parsed) {
        setInsights(parsed);
        setRawFallback(null);
      } else {
        setRawFallback(text);
        setInsights(null);
      }
      setApiMessages([...messages, { role: 'assistant', content: text }]);

      // Persist fingerprint + result to localStorage
      const fp = fingerprintPosts(posts);
      setSavedForFingerprint(fp);
      localStorage.setItem(INSIGHTS_STORAGE_KEY, JSON.stringify({
        insights: parsed,
        rawFallback: parsed ? null : text,
        generatedAt: new Date().toISOString(),
        postsFingerprint: fp,
      }));

      // Save snapshot to Supabase (non-fatal)
      const insightText = parsed ? insightsToText(parsed) : text;
      saveInsight({
        insight_text: insightText,
        post_count: posts.length,
        top_platform: getTopPlatform(posts),
        avg_views: getAvgViews(posts),
      })
        .then(() => fetchInsightHistory().then(setInsightHistory).catch(() => {}))
        .catch(() => {});

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ── Follow-up chat ──────────────────────────────────────────────────────────

  const handleFollowUp = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading || !ADMIN_API_KEY.trim()) return;

    setChatInput('');
    const newUserMsg: ApiMessage = { role: 'user', content: text };
    const updatedHistory = [...apiMessages, newUserMsg];
    setApiMessages(updatedHistory);
    setChatLog((prev) => [...prev, { role: 'user', text }]);
    setChatLoading(true);

    try {
      const reply = await callClaude(updatedHistory, sessionSystemPrompt);
      setApiMessages([...updatedHistory, { role: 'assistant', content: reply }]);
      setChatLog((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (e) {
      setChatLog((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Clear history ───────────────────────────────────────────────────────────

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      await clearInsightHistory();
      setInsightHistory([]);
      setSessionSystemPrompt(buildSystemPrompt([]));
    } catch { /* non-fatal */ } finally {
      setClearingHistory(false);
    }
  };

  // ── Derived state ───────────────────────────────────────────────────────────

  const hasInsights = insights !== null || rawFallback !== null;
  const canGenerate = !!ADMIN_API_KEY.trim() && posts.length > 0 && !loading;
  const insightsAreForCurrentData =
    !!savedForFingerprint && savedForFingerprint === fingerprintPosts(posts);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5 max-w-4xl">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-xl bg-[var(--gold-dim)] border border-[var(--gold-border)] flex items-center justify-center">
                  <IconSparkles className="w-4 h-4 text-[var(--gold)]" />
                </div>
                <h2 className="text-base font-bold text-[var(--text-1)] tracking-tight">AI Insights</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]">
                  Powered by Claude
                </span>
                {insightHistory.length > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-white/[0.05] text-[var(--text-2)] border border-white/[0.06]">
                    {insightHistory.length} saved
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-2)]">
                Get AI-generated analysis and recommendations based on your {posts.length} imported posts.
                {insightHistory.length > 0 && ' Claude has memory of your past analyses.'}
              </p>
            </div>
            {hasInsights && (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--text-2)] border border-white/[0.08] rounded-xl hover:text-[var(--text-1)] hover:border-white/[0.15] transition-all disabled:opacity-40 shrink-0"
              >
                <IconRefresh className="w-3.5 h-3.5" />
                Regenerate
              </button>
            )}
          </div>

          {/* API key status */}
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Anthropic API Key</h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  Configured by the admin at build-time. Users can&apos;t edit it.
                </p>
              </div>
              {ADMIN_API_KEY.trim() ? (
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-semibold">
                  ✓ Configured
                </span>
              ) : (
                <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg font-semibold">
                  Needs setup
                </span>
              )}
            </div>
            <div className="p-5">
              {ADMIN_API_KEY.trim() ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                  <p className="text-xs text-[var(--text-2)]">
                    Key present (hidden). Set via environment variable{' '}
                    <span className="text-[var(--text-1)] font-semibold">NEXT_PUBLIC_ANTHROPIC_API_KEY</span>.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-500/08 border border-amber-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-200/90">
                    Missing admin key. Add{' '}
                    <span className="text-amber-100 font-semibold">NEXT_PUBLIC_ANTHROPIC_API_KEY</span> and redeploy.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Generate CTA */}
          {!hasInsights && !loading && (
            <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl p-8 flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-[var(--gold-dim)] border border-[var(--gold-border)] flex items-center justify-center">
                  <IconSparkles className="w-7 h-7 text-[var(--gold)]" />
                </div>
                <div className="absolute -inset-2 rounded-2xl bg-[var(--gold-dim)] blur-xl" />
              </div>
              <div>
                <p className="text-[var(--text-1)] font-semibold mb-1.5">Ready to analyze {posts.length} posts</p>
                <p className="text-sm text-[var(--text-2)] max-w-sm leading-relaxed">
                  {insightHistory.length > 0
                    ? `Claude will analyze your data and compare against ${insightHistory.length} previous ${insightHistory.length === 1 ? 'analysis' : 'analyses'} to track trends and follow up on past recommendations.`
                    : 'Claude will identify patterns across your TikTok, Instagram, LinkedIn, X, and YouTube content and give you specific, data-backed recommendations.'}
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[var(--gold)] hover:bg-[var(--gold-hi)] text-[var(--bg-base)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              >
                <IconSparkles className="w-4 h-4" />
                Generate Insights
              </button>
              {!ADMIN_API_KEY.trim() && (
                <p className="text-xs text-amber-400/80">Admin setup required: configure the Anthropic API key.</p>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && <Spinner />}

          {/* Error */}
          {error && (
            <div className="bg-red-500/08 border border-red-500/25 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-red-400 text-base leading-none mt-0.5">✕</span>
              <div>
                <p className="text-sm font-semibold text-red-400">API Error</p>
                <p className="text-xs text-red-400/60 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Insight cards */}
          {insights && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InsightCard title="What's Working"     content={insights.whatsWorking}  accent="#22c55e" icon="✅" />
              <InsightCard title="What to Improve"    content={insights.whatToImprove} accent="#f59e0b" icon="🎯" />
              <InsightCard title="Your Next 3 Clips"  content={insights.nextClips}     accent="#d4922a" icon="🎬" />
              <InsightCard title="Best Times to Post" content={insights.bestTimes}     accent="#d4922a" icon="🕐" />
            </div>
          )}

          {/* Raw fallback */}
          {rawFallback && (
            <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2">
                <IconSparkles className="w-4 h-4 text-[var(--gold)]" />
                <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>AI Analysis</h3>
              </div>
              <div className="px-5 py-4 space-y-2">
                {rawFallback.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-[var(--text-1)] leading-relaxed">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* ── Insight History ──────────────────────────────────────────── */}
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Insight History</h3>
                {insightHistory.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[var(--text-2)] tabular-nums">
                    {insightHistory.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {insightHistory.length > 0 && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleClearHistory(); }}
                    className={`text-xs font-medium transition-colors ${
                      clearingHistory
                        ? 'text-[var(--text-3)] pointer-events-none'
                        : 'text-red-400/60 hover:text-red-400 cursor-pointer'
                    }`}
                  >
                    {clearingHistory ? 'Clearing…' : 'Clear history'}
                  </span>
                )}
                <ChevronIcon open={historyOpen} />
              </div>
            </button>

            {historyOpen && (
              <div className="border-t border-white/[0.04]">
                {insightHistory.length === 0 ? (
                  <p className="px-5 py-8 text-xs text-[var(--text-3)] text-center">
                    No analyses saved yet — generate your first insight above.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {insightHistory.map((row) => {
                      const preview = row.insight_text
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' · ');
                      const date = new Date(row.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      });
                      const time = new Date(row.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit',
                      });
                      return (
                        <div key={row.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-[var(--text-1)]">{date}</span>
                              <span className="text-[10px] text-[var(--text-3)]">{time}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-[var(--text-3)]">
                              <span className="tabular-nums">{row.post_count} posts</span>
                              <span
                                className="px-1.5 py-0.5 rounded-md bg-white/[0.04] font-medium"
                                style={{ color: '#9ca3af' }}
                              >
                                {row.top_platform}
                              </span>
                              <span className="tabular-nums">~{row.avg_views.toLocaleString()} avg views</span>
                            </div>
                          </div>
                          <p className="text-[12px] text-[var(--text-2)] leading-relaxed line-clamp-2">{preview}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Follow-up chat */}
          {hasInsights && (
            <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Ask a Follow-up</h3>
                </div>
                <span className="text-[11px] text-[var(--text-3)]">
                  {chatLog.length > 0
                    ? `${Math.ceil(chatLog.length / 2)} exchange${chatLog.length / 2 !== 1 ? 's' : ''}`
                    : 'Full context included'}
                </span>
              </div>

              {!insightsAreForCurrentData && (
                <div className="px-5 py-3 border-b border-white/[0.04] bg-amber-500/08">
                  <p className="text-xs text-amber-200/80">
                    These insights were generated for a previous dataset. Import new data and click Regenerate to update them.
                  </p>
                </div>
              )}

              {chatLog.length > 0 && (
                <div className="px-5 py-4 space-y-4 border-b border-white/[0.04] max-h-96 overflow-y-auto">
                  {chatLog.map((msg, i) => (
                    <ChatBubble key={i} msg={msg} />
                  ))}
                  {chatLoading && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        AI
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl px-4 py-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {chatLog.length === 0 && (
                <div className="px-5 pt-4 pb-2 flex flex-wrap gap-2">
                  {[
                    'Which platform should I focus on next month?',
                    'What type of hooks perform best in my data?',
                    'How can I improve my LinkedIn engagement?',
                    'What day of the week gets the most views?',
                  ].map((p) => (
                    <button
                      key={p}
                      onClick={() => setChatInput(p)}
                      className="text-xs text-[var(--text-2)] border border-white/[0.07] hover:border-white/[0.15] hover:text-[var(--text-1)] rounded-xl px-3 py-1.5 transition-all"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              <div className="px-5 py-4 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleFollowUp()}
                  placeholder="Ask anything about your content performance…"
                  disabled={chatLoading || !ADMIN_API_KEY.trim()}
                  className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!chatInput.trim() || chatLoading || !ADMIN_API_KEY.trim()}
                  className="w-10 h-10 rounded-xl bg-[var(--gold)] hover:bg-[var(--gold-hi)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[var(--bg-base)] transition-colors shadow-lg"
                >
                  <IconSend className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
