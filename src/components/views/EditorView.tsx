'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EditorFeedbackRow,
  fetchEditorFeedback,
  saveEditorFeedback,
  clearEditorFeedback,
} from '@/lib/db';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';
const API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '';

const FCPXML_RULES =
  'Rules:\n' +
  '- Return raw XML only — no markdown fences, no explanation before or after, nothing but the XML\n' +
  '- Use fcpxml version="1.10"\n' +
  '- In the <asset> element set src="file:///FILENAME" using the exact filename provided\n' +
  '- Choose a <format> frameDuration matching the fps (e.g. "1001/30000s" for 29.97, "1/30s" for 30, "1/24s" for 24, "1/25s" for 25)\n' +
  '- Express all time values as rational fractions followed by "s" (e.g. "30/1s", "15/1s", "45100/30000s")\n' +
  '- For trim edits: set the clip start= to the source in-point and duration= to the desired output length\n' +
  '- For speed changes: include a <timeMap> child with appropriate <timept> entries\n' +
  '- Set the asset duration to the full original video duration\n' +
  '- Set the sequence duration to the final output duration after edits\n' +
  '- Include one <event> named "Clip Studio Edit" and one <project> named after the edit request\n' +
  '- The response must start with <?xml version="1.0" encoding="UTF-8"?>';

function buildSystemPrompt(history: EditorFeedbackRow[]): string {
  const mistakes = history.filter((r) => r.feedback_type === 'mistake');
  const good     = history.filter((r) => r.feedback_type === 'good');

  const mistakesBlock =
    mistakes.length > 0
      ? mistakes.map((r) => `  - Prompt: '${r.prompt}' → Issue: '${r.feedback}'`).join('\n')
      : '  (none yet)';

  const goodBlock =
    good.length > 0
      ? good.map((r) => `  - Prompt: '${r.prompt}'`).join('\n')
      : '  (none yet)';

  return (
    'You are an expert FCPXML 1.10 generator. Learn from past feedback below before generating.\n\n' +
    'Past mistakes to avoid:\n' +
    mistakesBlock + '\n\n' +
    'Things that worked well:\n' +
    goodBlock + '\n\n' +
    'Apply these lessons to every new generation. Never repeat a past mistake.\n\n' +
    FCPXML_RULES
  );
}

const EXAMPLE_PROMPTS = [
  'Trim to the best 30 seconds',
  'Cut from 0:15 to 1:30',
  'Speed up 1.5x',
  'Keep only the in/out points',
  'Remove the first 10 seconds',
  'Export the last 45 seconds',
];

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoMeta {
  filename: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
}

type Status = 'idle' | 'calling-claude' | 'done' | 'error';
type FeedbackState = 'none' | 'prompted' | 'submitted';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditorView() {
  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [videoMeta, setVideoMeta]       = useState<VideoMeta | null>(null);
  const [trimStart, setTrimStart]       = useState(0);
  const [trimEnd, setTrimEnd]           = useState(0);
  const [prompt, setPrompt]             = useState('');
  const [fcpxml, setFcpxml]             = useState<string | null>(null);
  const [status, setStatus]             = useState<Status>('idle');
  const [error, setError]               = useState<string | null>(null);
  const [isDragging, setIsDragging]     = useState(false);

  // Feedback state
  const [feedbackState, setFeedbackState]   = useState<FeedbackState>('none');
  const [feedbackText, setFeedbackText]     = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  // History state
  const [feedbackHistory, setFeedbackHistory] = useState<EditorFeedbackRow[]>([]);
  const [historyOpen, setHistoryOpen]         = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Snapshot of prompt + fcpxml at generation time (for saving feedback)
  const generatedPromptRef  = useRef('');
  const generatedFcpxmlRef  = useRef('');

  // ── Load history on mount ─────────────────────────────────────────────────

  useEffect(() => {
    fetchEditorFeedback()
      .then(setFeedbackHistory)
      .catch(() => { /* non-fatal */ });
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────

  const loadVideo = useCallback((file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setFcpxml(null);
    setError(null);
    setStatus('idle');
    setPrompt('');
    setFeedbackState('none');
    setFeedbackText('');

    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    const vid = document.createElement('video');
    vid.src = url;
    vid.onloadedmetadata = () => {
      setVideoMeta({
        filename: file.name,
        duration: vid.duration,
        width: vid.videoWidth,
        height: vid.videoHeight,
        fps: 30,
        size: file.size,
      });
      setTrimStart(0);
      setTrimEnd(vid.duration);
    };
  }, [videoUrl]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadVideo(file);
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) loadVideo(file);
    },
    [loadVideo]
  );

  const handleClear = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMeta(null);
    setFcpxml(null);
    setStatus('idle');
    setError(null);
    setPrompt('');
    setFeedbackState('none');
    setFeedbackText('');
  };

  // ── Generate FCPXML via Claude ────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!prompt.trim() || !videoMeta || !API_KEY) return;
    setStatus('calling-claude');
    setError(null);
    setFcpxml(null);
    setFeedbackState('none');
    setFeedbackText('');

    // Fetch fresh history to build prompt
    let history: EditorFeedbackRow[] = feedbackHistory;
    try {
      history = await fetchEditorFeedback();
      setFeedbackHistory(history);
    } catch { /* use cached */ }

    const systemPrompt = buildSystemPrompt(history);

    const hasCustomTrim = trimStart > 0 || trimEnd < videoMeta.duration;
    const trimNote = hasCustomTrim
      ? `\nIn/out points set by user: start=${formatTime(trimStart)} (${trimStart.toFixed(3)}s), ` +
        `end=${formatTime(trimEnd)} (${trimEnd.toFixed(3)}s), ` +
        `selection=${formatTime(trimEnd - trimStart)} (${(trimEnd - trimStart).toFixed(3)}s).`
      : '';

    const userMsg =
      `Edit request: ${prompt.trim()}\n` +
      `Video: filename="${videoMeta.filename}", duration=${videoMeta.duration.toFixed(3)}s, ` +
      `${videoMeta.width}×${videoMeta.height}, fps=${videoMeta.fps}, size=${formatFileSize(videoMeta.size)}` +
      trimNote;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err?.error?.message ?? `API error ${res.status}`);
      }

      const data = (await res.json()) as { content: { text: string }[] };
      const raw = data.content[0]?.text ?? '';

      const cleaned = raw
        .replace(/^```xml\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();

      if (!cleaned.startsWith('<?xml') && !cleaned.startsWith('<fcpxml')) {
        throw new Error('Claude did not return valid FCPXML. Try rephrasing your prompt.');
      }

      generatedPromptRef.current  = prompt.trim();
      generatedFcpxmlRef.current  = cleaned;

      setFcpxml(cleaned);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!fcpxml || !videoFile) return;
    const baseName = videoFile.name.replace(/\.[^.]+$/, '');
    const blob = new Blob([fcpxml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.fcpxml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Feedback ──────────────────────────────────────────────────────────────

  const submitFeedback = async (type: 'good' | 'mistake', text: string) => {
    setSavingFeedback(true);
    try {
      await saveEditorFeedback({
        prompt: generatedPromptRef.current,
        fcpxml_generated: generatedFcpxmlRef.current,
        feedback: text,
        feedback_type: type,
      });
      setFeedbackState('submitted');
      // Refresh history
      const updated = await fetchEditorFeedback();
      setFeedbackHistory(updated);
    } catch { /* non-fatal */ } finally {
      setSavingFeedback(false);
    }
  };

  const handleThumbsUp = () => submitFeedback('good', '');

  const handleThumbsDown = () => setFeedbackState('prompted');

  const handleSubmitMistake = () => {
    if (!feedbackText.trim()) return;
    submitFeedback('mistake', feedbackText.trim());
  };

  // ── Clear history ─────────────────────────────────────────────────────────

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      await clearEditorFeedback();
      setFeedbackHistory([]);
    } catch { /* non-fatal */ } finally {
      setClearingHistory(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy   = status === 'calling-claude';
  const duration = videoMeta?.duration ?? 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* No API key warning */}
      {!API_KEY && (
        <div className="mx-5 mt-5 bg-amber-500/08 border border-amber-500/25 rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-amber-400 shrink-0">⚠</span>
          <p className="text-sm text-amber-200/90">
            No Anthropic API key configured. Add{' '}
            <span className="font-semibold font-mono text-amber-100">NEXT_PUBLIC_ANTHROPIC_API_KEY</span> and redeploy.
          </p>
        </div>
      )}

      {/* FCPXML info banner */}
      <div className="mx-5 mt-5 bg-indigo-500/08 border border-indigo-500/20 rounded-2xl px-5 py-3.5 flex items-start gap-3">
        <span className="text-indigo-400 shrink-0 mt-px">ℹ</span>
        <p className="text-sm text-indigo-200/80 leading-relaxed">
          <span className="font-semibold text-white">How it works:</span> Describe your edit, Claude generates an FCPXML file.
          Download it and import into{' '}
          <span className="font-semibold text-white">Premiere Pro</span> via{' '}
          <span className="font-mono text-indigo-300 text-[12px] bg-indigo-500/10 px-1.5 py-0.5 rounded-md">File → Import</span>.
          Relink media if prompted.
        </p>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-col xl:flex-row gap-4 p-5 flex-1">

        {/* ── Left: video upload + preview ──────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Source Video</h3>
              {videoFile && (
                <button
                  onClick={handleClear}
                  className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/[0.05]"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="p-5">
              {!videoFile ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-indigo-400/60 bg-indigo-500/08'
                      : 'border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-gray-500">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m10 8 6 4-6 4V8z" fill="currentColor" stroke="none" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-300 mb-1">
                    {isDragging ? 'Drop to upload' : 'Drop a video here'}
                  </p>
                  <p className="text-xs text-gray-600">MP4, MOV, WebM — any size</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <video
                    src={videoUrl ?? undefined}
                    controls
                    className="w-full rounded-xl bg-black aspect-video object-contain"
                  />
                  {videoMeta && (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Duration',   value: formatTime(videoMeta.duration) },
                        { label: 'Resolution', value: `${videoMeta.width}×${videoMeta.height}` },
                        { label: 'FPS',        value: `~${videoMeta.fps}` },
                        { label: 'Size',       value: formatFileSize(videoMeta.size) },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl px-3 py-2.5 text-center">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 font-medium">{label}</p>
                          <p className="text-xs font-semibold text-white tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Center: prompt + FCPXML output ────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Prompt input */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-semibold text-white">Edit Prompt</h3>
              <p className="text-xs text-gray-600 mt-0.5">Describe your edit — Claude generates the FCPXML</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPrompt(p)}
                    className="text-[11px] text-gray-500 border border-white/[0.07] hover:border-indigo-500/40 hover:text-indigo-300 hover:bg-indigo-500/08 rounded-lg px-2.5 py-1.5 transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={'e.g. "Trim to 30s" or "Cut 0:15 to 1:30, speed up 1.5x"'}
                rows={4}
                disabled={isBusy}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none disabled:opacity-50"
              />

              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || !videoFile || !API_KEY || isBusy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
              >
                {isBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating FCPXML…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 opacity-90">
                      <path d="M12 3l1.88 5.76a1 1 0 00.95.69H21l-4.94 3.59a1 1 0 00-.36 1.12L17.58 20 12 16.41 6.42 20l1.88-5.84a1 1 0 00-.36-1.12L3 9.45h6.17a1 1 0 00.95-.69L12 3z" />
                    </svg>
                    Generate FCPXML
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated FCPXML */}
          {fcpxml && (
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-white">Generated FCPXML</h3>
                </div>
                <span className="text-[11px] text-gray-600 font-mono tabular-nums">
                  {videoFile?.name.replace(/\.[^.]+$/, '')}.fcpxml
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-gray-950/70 border border-white/[0.06] rounded-xl overflow-auto max-h-72">
                  <pre className="px-4 py-3 text-[11px] text-emerald-300/90 font-mono leading-relaxed whitespace-pre-wrap break-all select-all">
                    {fcpxml}
                  </pre>
                </div>

                {/* Feedback section */}
                <div className="border-t border-white/[0.05] pt-4">
                  {feedbackState === 'none' && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-500 flex-1">Did this FCPXML work as expected?</p>
                      <button
                        onClick={handleThumbsUp}
                        disabled={savingFeedback}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-emerald-400 border border-white/[0.07] hover:border-emerald-500/30 hover:bg-emerald-500/08 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                        This worked
                      </button>
                      <button
                        onClick={handleThumbsDown}
                        disabled={savingFeedback}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 border border-white/[0.07] hover:border-red-500/30 hover:bg-red-500/08 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                          <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                        </svg>
                        This had issues
                      </button>
                    </div>
                  )}

                  {feedbackState === 'prompted' && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">What was wrong with the generated FCPXML?</p>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="e.g. Timecodes were off, speed ramp didn't export correctly…"
                        rows={3}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/40 transition-all resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSubmitMistake}
                          disabled={!feedbackText.trim() || savingFeedback}
                          className="flex items-center gap-2 text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/25 rounded-lg px-4 py-2 transition-all disabled:opacity-40"
                        >
                          {savingFeedback && (
                            <div className="w-3 h-3 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                          )}
                          Submit Feedback
                        </button>
                        <button
                          onClick={() => setFeedbackState('none')}
                          disabled={savingFeedback}
                          className="text-xs text-gray-600 hover:text-gray-300 px-3 py-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {feedbackState === 'submitted' && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-emerald-400 shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Thanks — feedback saved. Claude will apply this lesson on the next generation.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/08 border border-red-500/25 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-red-400 shrink-0 mt-0.5">✕</span>
              <div>
                <p className="text-sm font-semibold text-red-400">Error</p>
                <p className="text-xs text-red-400/70 mt-1 leading-relaxed">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: timeline + export ──────────────────────────────────── */}
        <div className="w-full xl:w-72 shrink-0 space-y-4">

          {/* Timeline / trim */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-semibold text-white">Timeline</h3>
              <p className="text-xs text-gray-600 mt-0.5">Set in/out points — passed to Claude as context</p>
            </div>
            <div className="p-5">
              {!videoMeta ? (
                <p className="text-xs text-gray-600 text-center py-6">Upload a video to set trim points</p>
              ) : (
                <div className="space-y-5">
                  <div className="relative h-3">
                    <div className="absolute inset-y-1 inset-x-0 bg-white/[0.06] rounded-full" />
                    <div
                      className="absolute inset-y-1 bg-indigo-500/50 rounded-full"
                      style={{
                        left:  `${(trimStart / duration) * 100}%`,
                        right: `${100 - (trimEnd / duration) * 100}%`,
                      }}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-2">
                      <span className="text-gray-500 font-medium">In point</span>
                      <span className="text-white font-semibold tabular-nums">{formatTime(trimStart)}</span>
                    </div>
                    <input
                      type="range" min={0} max={duration} step={0.1} value={trimStart}
                      onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.5))}
                      className="w-full h-1.5 appearance-none bg-white/[0.08] rounded-full cursor-pointer accent-indigo-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-2">
                      <span className="text-gray-500 font-medium">Out point</span>
                      <span className="text-white font-semibold tabular-nums">{formatTime(trimEnd)}</span>
                    </div>
                    <input
                      type="range" min={0} max={duration} step={0.1} value={trimEnd}
                      onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.5))}
                      className="w-full h-1.5 appearance-none bg-white/[0.08] rounded-full cursor-pointer accent-indigo-400"
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-gray-600 tabular-nums border-t border-white/[0.05] pt-3">
                    <span>Selection: {formatTime(trimEnd - trimStart)}</span>
                    <span>Total: {formatTime(duration)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Export / download */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-semibold text-white">Export</h3>
            </div>
            <div className="p-5">
              {status === 'done' && fcpxml ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="shrink-0">✓</span>
                    <p className="text-sm font-semibold">FCPXML ready</p>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.07] hover:bg-white/[0.11] text-white border border-white/[0.1] transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download .fcpxml
                  </button>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Import into Premiere Pro via{' '}
                    <span className="font-mono text-gray-500 text-[10px]">File → Import</span>.
                    Relink media if prompted.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-600 text-center py-4 leading-relaxed">
                  {!videoFile
                    ? 'Upload a video to get started'
                    : 'Generate FCPXML to enable download'}
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Feedback History ─────────────────────────────────────────────────── */}
      <div className="mx-5 mb-5 bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">Feedback History</h3>
            {feedbackHistory.length > 0 && (
              <span className="text-[11px] bg-white/[0.06] text-gray-400 rounded-full px-2 py-0.5 tabular-nums">
                {feedbackHistory.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {feedbackHistory.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); handleClearHistory(); }}
                disabled={clearingHistory}
                className="text-[11px] text-gray-600 hover:text-red-400 transition-colors px-2.5 py-1 rounded-lg hover:bg-red-500/08"
              >
                {clearingHistory ? 'Clearing…' : 'Clear Feedback History'}
              </button>
            )}
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={`w-4 h-4 text-gray-600 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {historyOpen && (
          <div className="border-t border-white/[0.05]">
            {feedbackHistory.length === 0 ? (
              <p className="px-5 py-8 text-xs text-gray-600 text-center">
                No feedback yet. Rate generated FCPXML to help Claude improve.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {feedbackHistory.map((row) => (
                  <div key={row.id} className="px-5 py-4 flex items-start gap-4">
                    <span
                      className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        row.feedback_type === 'good'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/15 text-red-400 border border-red-500/20'
                      }`}
                    >
                      {row.feedback_type === 'good' ? 'Good' : 'Mistake'}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-gray-300 font-medium truncate">{row.prompt}</p>
                      {row.feedback && (
                        <p className="text-xs text-gray-600 leading-relaxed">{row.feedback}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-700 tabular-nums">
                      {formatDate(row.created_at)}
                    </span>
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
