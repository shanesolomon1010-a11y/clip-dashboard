'use client';

import { useEffect, useRef, useState } from 'react';
import { PLATFORM_LABELS, UnifiedPost } from '@/types';
import { IconSparkles, IconSend, IconRefresh } from '@/components/Icons';

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

const SYSTEM_PROMPT =
  'You are a social media performance analyst specializing in short-form video content for a clipping business. ' +
  'Analyze this creator\'s cross-platform performance data and give specific actionable recommendations. ' +
  'When responding to the initial analysis request, always return valid JSON (no markdown fences, raw JSON only) ' +
  'with exactly these four string keys: whatsWorking, whatToImprove, nextClips, bestTimes. ' +
  'Each value should be a detailed multi-line string using plain numbered or bulleted lines — no markdown headers.';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashString(input: string): string {
  // Deterministic, lightweight hash (djb2 variant) for change detection.
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

async function callClaude(apiKey: string, messages: ApiMessage[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
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
  title,
  content,
  accent,
  icon,
}: {
  title: string;
  content: string;
  accent: string;
  icon: string;
}) {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div
      className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border"
      style={{ borderColor: `${accent}25` }}
    >
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ background: `${accent}0d`, borderBottom: `1px solid ${accent}18` }}
      >
        <span className="text-xl">{icon}</span>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-2">
        {lines.map((line, i) => (
          <p key={i} className="text-[13px] text-gray-300 leading-relaxed">
            {line}
          </p>
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
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-300 font-medium">Analyzing your performance data…</p>
        <p className="text-xs text-gray-600 mt-1">This usually takes 5–10 seconds</p>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center text-[10px] font-bold ${
          isUser
            ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'
            : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white'
        }`}
      >
        {isUser ? 'You' : 'AI'}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-500/12 border border-indigo-500/20 text-gray-200'
            : 'bg-white/[0.04] border border-white/[0.07] text-gray-200'
        }`}
      >
        {msg.text.split('\n').map((line, i) => (
          <p key={i} className={line === '' ? 'mt-2' : ''}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface Props {
  posts: UnifiedPost[];
}

export default function AIInsightsView({ posts }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [rawFallback, setRawFallback] = useState<string | null>(null);
  const [savedForFingerprint, setSavedForFingerprint] = useState<string | null>(null);

  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(INSIGHTS_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        insights?: Insights | null;
        rawFallback?: string | null;
        generatedAt?: string;
        postsFingerprint?: string;
      };
      if (parsed?.insights) setInsights(parsed.insights);
      if (typeof parsed?.rawFallback === 'string') setRawFallback(parsed.rawFallback);
      if (typeof parsed?.postsFingerprint === 'string') setSavedForFingerprint(parsed.postsFingerprint);
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const handleGenerate = async () => {
    if (!ADMIN_API_KEY.trim() || !posts.length) return;
    setLoading(true);
    setError(null);
    setChatLog([]);
    setApiMessages([]);

    const userMsg = buildInitialUserMessage(posts);
    const messages: ApiMessage[] = [{ role: 'user', content: userMsg }];

    try {
      const text = await callClaude(ADMIN_API_KEY.trim(), messages);
      const parsed = parseInsights(text);
      if (parsed) {
        setInsights(parsed);
        setRawFallback(null);
      } else {
        setRawFallback(text);
        setInsights(null);
      }
      setApiMessages([...messages, { role: 'assistant', content: text }]);

      const fp = fingerprintPosts(posts);
      setSavedForFingerprint(fp);
      localStorage.setItem(
        INSIGHTS_STORAGE_KEY,
        JSON.stringify({
          insights: parsed,
          rawFallback: parsed ? null : text,
          generatedAt: new Date().toISOString(),
          postsFingerprint: fp,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

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
      const reply = await callClaude(ADMIN_API_KEY.trim(), updatedHistory);
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

  const hasInsights = insights !== null || rawFallback !== null;
  const canGenerate = !!ADMIN_API_KEY.trim() && posts.length > 0 && !loading;
  const currentFingerprint = fingerprintPosts(posts);
  const insightsAreForCurrentData = !!savedForFingerprint && savedForFingerprint === currentFingerprint;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5 max-w-4xl">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                  <IconSparkles className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="text-base font-bold text-white tracking-tight">AI Insights</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/20">
                  Powered by Claude
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Get AI-generated analysis and recommendations based on your {posts.length} imported posts.
              </p>
            </div>
            {hasInsights && (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-500 border border-white/[0.08] rounded-xl hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
              >
                <IconRefresh className="w-3.5 h-3.5" />
                Regenerate
              </button>
            )}
          </div>

          {/* Admin API Key (non-user editable) */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Anthropic API Key</h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Configured by the admin at build-time. Users can’t edit it.
                </p>
              </div>
              {!!ADMIN_API_KEY.trim() ? (
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
              {!!ADMIN_API_KEY.trim() ? (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">
                    Key present (hidden). Set via environment variable{' '}
                    <span className="text-gray-300 font-semibold">NEXT_PUBLIC_ANTHROPIC_API_KEY</span>.
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
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-8 flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <IconSparkles className="w-7 h-7 text-violet-400" />
                </div>
                <div className="absolute -inset-2 rounded-2xl bg-violet-500/05 blur-xl" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1.5">Ready to analyze {posts.length} posts</p>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                  Claude will identify patterns across your TikTok, Instagram, LinkedIn, X, and YouTube
                  content and give you specific, data-backed recommendations.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-400 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30"
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
              <InsightCard title="Your Next 3 Clips"  content={insights.nextClips}     accent="#8b5cf6" icon="🎬" />
              <InsightCard title="Best Times to Post" content={insights.bestTimes}     accent="#38bdf8" icon="🕐" />
            </div>
          )}

          {/* Raw fallback */}
          {rawFallback && (
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center gap-2">
                <IconSparkles className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">AI Analysis</h3>
              </div>
              <div className="px-5 py-4 space-y-2">
                {rawFallback.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-gray-300 leading-relaxed">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up chat */}
          {hasInsights && (
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="text-sm font-semibold text-white">Ask a Follow-up</h3>
                </div>
                <span className="text-[11px] text-gray-600">
                  {chatLog.length > 0
                    ? `${Math.ceil(chatLog.length / 2)} exchange${chatLog.length / 2 !== 1 ? 's' : ''}`
                    : 'Full context included'}
                </span>
              </div>

              {!insightsAreForCurrentData && (
                <div className="px-5 py-3 border-b border-white/[0.05] bg-amber-500/08">
                  <p className="text-xs text-amber-200/80">
                    These insights were generated for a previous dataset. Import new data and click Regenerate to update them.
                  </p>
                </div>
              )}

              {chatLog.length > 0 && (
                <div className="px-5 py-4 space-y-4 border-b border-white/[0.05] max-h-96 overflow-y-auto">
                  {chatLog.map((msg, i) => (
                    <ChatBubble key={i} msg={msg} />
                  ))}
                  {chatLoading && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        AI
                      </div>
                      <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl px-4 py-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
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
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setChatInput(prompt)}
                      className="text-xs text-gray-500 border border-white/[0.07] hover:border-white/[0.15] hover:text-gray-200 rounded-xl px-3 py-1.5 transition-all"
                    >
                      {prompt}
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
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!chatInput.trim() || chatLoading || !ADMIN_API_KEY.trim()}
                  className="w-10 h-10 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors shadow-lg shadow-violet-900/20"
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
