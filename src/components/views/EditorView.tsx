'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  EditorFeedbackRow,
  fetchEditorFeedback,
  saveEditorFeedback,
  clearEditorFeedback,
} from '@/lib/db';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL   = 'claude-sonnet-4-20250514';
const API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '';

const FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';

const FFMPEG_RULES =
  'You are an expert FFmpeg command generator for in-browser video editing.\n\n' +
  'Rules:\n' +
  '- Return ONLY a valid JSON array of FFmpeg argument arrays — no markdown, no explanation\n' +
  '- Each inner array is a single FFmpeg invocation (args only, no "ffmpeg" executable)\n' +
  '- Input file is always named "input.mp4". Final output must be named "output.mp4"\n' +
  '- Use intermediate files (temp1.mp4, temp2.mp4…) for chained operations\n' +
  '- For captions/text: use the drawtext filter with fontcolor=white, fontsize appropriate to resolution\n' +
  '- For crossfades/transitions between clips: use the xfade filter\n' +
  '- Avoid hardware acceleration flags (-hwaccel, -videotoolbox, etc) — not supported in WASM\n' +
  '- Avoid complex filter_complex chains where possible; prefer intermediate files\n' +
  '- Use -c copy where no transcoding is needed (cuts without re-encoding)\n' +
  '- Times are in seconds (or HH:MM:SS). Do NOT use ticks\n' +
  '- If no meaningful edit can be inferred, return a simple copy: [["-i","input.mp4","-c","copy","output.mp4"]]\n' +
  '- Example valid output: [["-i","input.mp4","-ss","10","-to","45","-c","copy","output.mp4"]]\n' +
  '- Treat REFERENCE INSTRUCTIONS, CUTTING INSTRUCTIONS, TRANSITION INSTRUCTIONS, and CAPTION INSTRUCTIONS as independent sections';

function buildSystemPrompt(history: EditorFeedbackRow[]): string {
  const mistakes = history.filter((r) => r.feedback_type === 'mistake');
  const good     = history.filter((r) => r.feedback_type === 'good');

  const mistakesBlock = mistakes.length > 0
    ? mistakes.map((r) => `  - Prompt: '${r.prompt}' → Issue: '${r.feedback}'`).join('\n')
    : '  (none yet)';

  const goodBlock = good.length > 0
    ? good.map((r) => `  - Prompt: '${r.prompt}'`).join('\n')
    : '  (none yet)';

  return (
    FFMPEG_RULES + '\n\n' +
    'Past mistakes to avoid:\n' + mistakesBlock + '\n\n' +
    'Things that worked well:\n' + goodBlock + '\n\n' +
    'Apply these lessons to every new generation. Never repeat a past mistake.'
  );
}

function buildUserPrompt(
  ref: string, cutting: string, transition: string, caption: string
): string {
  const sections: string[] = [];
  if (ref.trim())        sections.push(`REFERENCE INSTRUCTIONS: ${ref.trim()}`);
  if (cutting.trim())    sections.push(`CUTTING INSTRUCTIONS: ${cutting.trim()}`);
  if (transition.trim()) sections.push(`TRANSITION INSTRUCTIONS: ${transition.trim()}`);
  if (caption.trim())    sections.push(`CAPTION INSTRUCTIONS: ${caption.trim()}`);
  return sections.join('\n');
}

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoMeta {
  filename: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
}

type Status = 'idle' | 'generating' | 'processing' | 'done' | 'error';
type FeedbackState = 'none' | 'prompted' | 'submitted';

type TextBlock  = { type: 'text'; text: string };
type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };
type ContentBlock = TextBlock | ImageBlock;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024)        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function extractFrames(url: string, duration: number): Promise<string[]> {
  return new Promise((resolve) => {
    const video  = document.createElement('video');
    video.src    = url;
    video.muted  = true;
    video.playsInline = true;

    const canvas = document.createElement('canvas');
    canvas.width  = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve([]); return; }

    const count = 6;
    const timestamps = Array.from({ length: count }, (_, i) =>
      Math.min((duration * (i + 0.5)) / count, duration - 0.1)
    );
    const frames: string[] = [];
    let idx = 0;

    const seekNext = () => {
      if (idx >= timestamps.length) { resolve(frames); return; }
      video.currentTime = timestamps[idx];
    };

    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, 640, 360);
      frames.push(canvas.toDataURL('image/jpeg', 0.7).replace(/^data:image\/jpeg;base64,/, ''));
      idx++;
      seekNext();
    };

    video.onloadedmetadata = () => seekNext();
    video.onerror = () => resolve([]);
    video.load();
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditorView() {
  // FFmpeg
  const ffmpegRef      = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded,  setFfmpegLoaded]  = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [ffmpegError,   setFfmpegError]   = useState<string | null>(null);

  // Source video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl,  setVideoUrl]  = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Reference video
  const [refFile,           setRefFile]           = useState<File | null>(null);
  const [refUrl,            setRefUrl]             = useState<string | null>(null);
  const [refFrames,         setRefFrames]          = useState<string[]>([]);
  const [extractingFrames,  setExtractingFrames]   = useState(false);
  const [isRefDragging,     setIsRefDragging]      = useState(false);

  // Instructions
  const [refInstructions,        setRefInstructions]        = useState('');
  const [cuttingInstructions,    setCuttingInstructions]    = useState('');
  const [transitionInstructions, setTransitionInstructions] = useState('');
  const [captionInstructions,    setCaptionInstructions]    = useState('');

  // Generation & processing
  const [status,        setStatus]       = useState<Status>('idle');
  const [progress,      setProgress]     = useState(0);
  const [outputUrl,     setOutputUrl]    = useState<string | null>(null);
  const [commands,      setCommands]     = useState<string[][] | null>(null);
  const [processingMs,  setProcessingMs] = useState<number | null>(null);
  const [logLines,      setLogLines]     = useState<string[]>([]);
  const [error,         setError]        = useState<string | null>(null);

  // Feedback
  const [feedbackState,  setFeedbackState]  = useState<FeedbackState>('none');
  const [feedbackText,   setFeedbackText]   = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  // History
  const [feedbackHistory, setFeedbackHistory] = useState<EditorFeedbackRow[]>([]);
  const [historyOpen,     setHistoryOpen]     = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Snapshots for feedback saving
  const generatedPromptRef   = useRef('');
  const generatedCommandsRef = useRef('');

  // ── FFmpeg initialization ──────────────────────────────────────────────────

  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current || ffmpegLoading) return;
    setFfmpegLoading(true);
    setFfmpegError(null);
    try {
      const ff = new FFmpeg();
      ff.on('log',      ({ message }) => {
        setLogLines((prev) => [...prev.slice(-49), message]);
      });
      ff.on('progress', ({ progress: p }) => {
        setProgress(Math.max(0, Math.min(100, Math.round(p * 100))));
      });

      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(FFMPEG_CORE_URL, 'text/javascript'),
        toBlobURL(FFMPEG_WASM_URL, 'application/wasm'),
      ]);

      await ff.load({ coreURL, wasmURL });
      ffmpegRef.current = ff;
      setFfmpegLoaded(true);
    } catch (e) {
      setFfmpegError(e instanceof Error ? e.message : 'Failed to load FFmpeg');
    } finally {
      setFfmpegLoading(false);
    }
  }, [ffmpegLoading]);

  // Auto-load FFmpeg on mount
  useEffect(() => {
    loadFFmpeg();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load feedback history on mount
  useEffect(() => {
    fetchEditorFeedback()
      .then(setFeedbackHistory)
      .catch(() => { /* non-fatal */ });
  }, []);

  // ── Source video ──────────────────────────────────────────────────────────

  const loadVideo = useCallback((file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    setVideoFile(file);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setCommands(null);
    setProcessingMs(null);
    setLogLines([]);
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
        width:    vid.videoWidth,
        height:   vid.videoHeight,
        fps:      30,
        size:     file.size,
      });
    };
  }, [videoUrl, outputUrl]);

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
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMeta(null);
    setOutputUrl(null);
    setStatus('idle');
    setError(null);
    setProgress(0);
    setCommands(null);
    setProcessingMs(null);
    setFeedbackState('none');
    setFeedbackText('');
    setLogLines([]);
  };

  // ── Reference video ───────────────────────────────────────────────────────

  const loadRefVideo = useCallback(async (file: File) => {
    if (refUrl) URL.revokeObjectURL(refUrl);
    setRefFile(file);
    setRefFrames([]);
    setExtractingFrames(true);
    const url = URL.createObjectURL(file);
    setRefUrl(url);
    const vid = document.createElement('video');
    vid.src = url;
    vid.onloadedmetadata = async () => {
      const frames = await extractFrames(url, vid.duration);
      setRefFrames(frames);
      setExtractingFrames(false);
    };
    vid.onerror = () => setExtractingFrames(false);
    vid.load();
  }, [refUrl]);

  const handleRefFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadRefVideo(file);
    e.target.value = '';
  };

  const handleRefDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsRefDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) loadRefVideo(file);
    },
    [loadRefVideo]
  );

  const handleClearRef = () => {
    if (refUrl) URL.revokeObjectURL(refUrl);
    setRefFile(null);
    setRefUrl(null);
    setRefFrames([]);
    setExtractingFrames(false);
  };

  // ── Generate + Process ────────────────────────────────────────────────────

  const hasAnyInstruction = !!(
    refInstructions.trim() || cuttingInstructions.trim() ||
    transitionInstructions.trim() || captionInstructions.trim()
  );

  const handleGenerate = async () => {
    if (!hasAnyInstruction || !videoMeta || !API_KEY) return;

    setStatus('generating');
    setError(null);
    setOutputUrl(null);
    setCommands(null);
    setProgress(0);
    setProcessingMs(null);
    setLogLines([]);
    setFeedbackState('none');
    setFeedbackText('');

    // Ensure FFmpeg is loaded
    if (!ffmpegRef.current) {
      await loadFFmpeg();
      if (!ffmpegRef.current) {
        setError('FFmpeg failed to initialize. Please refresh and try again.');
        setStatus('error');
        return;
      }
    }

    // Fetch fresh history
    let history = feedbackHistory;
    try {
      history = await fetchEditorFeedback();
      setFeedbackHistory(history);
    } catch { /* use cached */ }

    const systemPrompt     = buildSystemPrompt(history);
    const instructionsText = buildUserPrompt(
      refInstructions, cuttingInstructions, transitionInstructions, captionInstructions
    );

    const metaLine =
      `Video: filename="${videoMeta.filename}", duration=${videoMeta.duration.toFixed(3)}s, ` +
      `${videoMeta.width}×${videoMeta.height}, fps=${videoMeta.fps}, size=${formatFileSize(videoMeta.size)}`;

    const userText = `${metaLine}\n\n${instructionsText}`;

    // Build content with optional reference frames
    const content: ContentBlock[] = [];
    if (refFrames.length > 0) {
      content.push({
        type: 'text',
        text: 'These 6 frames show the editing style I want. Match this style.',
      });
      for (const frame of refFrames) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame } });
      }
    }
    content.push({ type: 'text', text: userText });

    let parsedCommands: string[][];

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':  API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err?.error?.message ?? `API error ${res.status}`);
      }

      const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
      const raw  = data.content.find((c) => c.type === 'text')?.text ?? '';

      const cleaned = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim();

      parsedCommands = JSON.parse(cleaned) as string[][];
      if (!Array.isArray(parsedCommands) || parsedCommands.length === 0) {
        throw new Error('Claude returned an empty or invalid command list.');
      }

      generatedPromptRef.current   = instructionsText;
      generatedCommandsRef.current = JSON.stringify(parsedCommands, null, 2);
      setCommands(parsedCommands);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate FFmpeg commands');
      setStatus('error');
      return;
    }

    // Execute FFmpeg commands
    setStatus('processing');
    setProgress(0);
    const ff    = ffmpegRef.current!;
    const start = Date.now();

    try {
      // Write source video to virtual FS
      await ff.writeFile('input.mp4', await fetchFile(videoFile!));

      // Execute each command
      for (const args of parsedCommands) {
        const code = await ff.exec(args);
        if (code !== 0) throw new Error(`FFmpeg command failed (exit ${code}): ${args.join(' ')}`);
      }

      // Read output
      const data   = await ff.readFile('output.mp4');
      // FileData is Uint8Array | string — at runtime it's always Uint8Array here
      const blob   = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      const outUrl = URL.createObjectURL(blob);

      // Cleanup virtual FS
      const filesToClean = ['input.mp4', 'output.mp4',
        ...Array.from({ length: 10 }, (_, i) => `temp${i + 1}.mp4`)];
      for (const f of filesToClean) {
        try { await ff.deleteFile(f); } catch { /* ignore missing */ }
      }

      setOutputUrl(outUrl);
      setProcessingMs(Date.now() - start);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'FFmpeg processing failed');
      setStatus('error');
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!outputUrl || !videoFile) return;
    const baseName = videoFile.name.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href     = outputUrl;
    a.download = `${baseName}_edited.mp4`;
    a.click();
  };

  // ── Feedback ──────────────────────────────────────────────────────────────

  const submitFeedback = async (type: 'good' | 'mistake', text: string) => {
    setSavingFeedback(true);
    try {
      await saveEditorFeedback({
        prompt:                    generatedPromptRef.current,
        ffmpeg_commands_generated: generatedCommandsRef.current,
        feedback:                  text,
        feedback_type:             type,
      });
      setFeedbackState('submitted');
      const updated = await fetchEditorFeedback();
      setFeedbackHistory(updated);
    } catch { /* non-fatal */ } finally {
      setSavingFeedback(false);
    }
  };

  const handleThumbsUp      = () => submitFeedback('good', '');
  const handleThumbsDown    = () => setFeedbackState('prompted');
  const handleSubmitMistake = () => {
    if (!feedbackText.trim()) return;
    submitFeedback('mistake', feedbackText.trim());
  };

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

  const isBusy = status === 'generating' || status === 'processing';

  const dropZoneBase =
    'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all';

  const textareaClass =
    'w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-[var(--text-1)] ' +
    'placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] transition-all resize-none disabled:opacity-50';

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

      {/* FFmpeg status banner */}
      {ffmpegError ? (
        <div className="mx-5 mt-5 bg-red-500/08 border border-red-500/25 rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-sm text-red-200/90">
            FFmpeg failed to load: {ffmpegError}{' '}
            <button onClick={loadFFmpeg} className="underline text-red-300 ml-1">Retry</button>
          </p>
        </div>
      ) : ffmpegLoading ? (
        <div className="mx-5 mt-5 bg-[var(--gold-dim)] border border-[var(--gold-border)] rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <div className="w-3.5 h-3.5 border-2 border-[var(--gold)]/40 border-t-[var(--gold)] rounded-full animate-spin shrink-0" />
          <p className="text-sm text-[var(--text-1)]">Loading FFmpeg.wasm — this may take a moment…</p>
        </div>
      ) : ffmpegLoaded ? (
        <div className="mx-5 mt-5 bg-emerald-500/08 border border-emerald-500/20 rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-emerald-400 shrink-0">✓</span>
          <p className="text-sm text-emerald-200/80">
            FFmpeg ready. Describe your edit — Claude generates FFmpeg commands that run entirely in your browser.
          </p>
        </div>
      ) : null}

      {/* 3-column layout */}
      <div className="flex flex-col xl:flex-row gap-4 p-5 flex-1">

        {/* ── Left: source + reference video ───────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Source video */}
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Source Video</h3>
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
                  className={`${dropZoneBase} ${
                    isDragging
                      ? 'border-[var(--gold-border)] bg-[var(--gold-dim)]'
                      : 'border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-gray-500">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m10 8 6 4-6 4V8z" fill="currentColor" stroke="none" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-1)] mb-1">
                    {isDragging ? 'Drop to upload' : 'Drop a video here'}
                  </p>
                  <p className="text-xs text-[var(--text-3)]">MP4, MOV, WebM</p>
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
                        <div key={label} className="bg-white/[0.02] border border-white/[0.04] rounded-xl px-3 py-2.5 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-2)] mb-1">{label}</p>
                          <p className="text-xs font-semibold text-[var(--text-1)] font-['JetBrains_Mono'] tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Reference video */}
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                  Reference Video
                  <span className="ml-2 text-[11px] font-normal text-[var(--text-3)]" style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal' }}>(optional)</span>
                </h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">Show Claude the editing style you want</p>
              </div>
              {refFile && (
                <button
                  onClick={handleClearRef}
                  className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/[0.05]"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="p-5">
              {!refFile ? (
                <div
                  onDrop={handleRefDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsRefDragging(true); }}
                  onDragLeave={() => setIsRefDragging(false)}
                  onClick={() => refFileInputRef.current?.click()}
                  className={`${dropZoneBase} ${
                    isRefDragging
                      ? 'border-[var(--gold-border)] bg-[var(--gold-dim)]'
                      : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-gray-600">
                      <path d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-2)] mb-1">
                    {isRefDragging ? 'Drop reference video' : 'Drop a reference video'}
                  </p>
                  <p className="text-xs text-[var(--text-3)]">6 frames will be extracted and sent to Claude</p>
                  <input
                    ref={refFileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleRefFileInput}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-[var(--gold)] shrink-0">
                      <path d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    <span className="truncate text-gray-300 font-medium">{refFile.name}</span>
                  </div>
                  {extractingFrames ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-3)] py-2">
                      <div className="w-3 h-3 border border-[var(--gold)]/40 border-t-[var(--gold)] rounded-full animate-spin shrink-0" />
                      Extracting 6 frames for Claude…
                    </div>
                  ) : refFrames.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-[var(--text-3)]">{refFrames.length} frames ready</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {refFrames.map((frame, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={`data:image/jpeg;base64,${frame}`}
                            alt={`Frame ${i + 1}`}
                            className="w-full aspect-video object-cover rounded-lg border border-white/[0.06]"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-3)] py-1">Frame extraction failed — reference video will not be sent.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Center: instructions + output ─────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Four instruction boxes */}
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.04]">
              <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Edit Instructions</h3>
              <p className="text-xs text-[var(--text-3)] mt-0.5">Claude generates FFmpeg commands from your instructions</p>
            </div>
            <div className="p-5 space-y-5">

              {/* 1. Reference Instructions */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-2)]">
                  Reference Instructions
                  <span className="text-[10px] font-normal text-[var(--text-3)] border border-white/[0.06] rounded px-1.5 py-0.5">optional</span>
                </label>
                <textarea
                  value={refInstructions}
                  onChange={(e) => setRefInstructions(e.target.value)}
                  placeholder="e.g. Fast cuts every 2-3 seconds, bold white captions, hard cut transitions"
                  rows={2}
                  disabled={isBusy}
                  className={textareaClass}
                />
              </div>

              {/* 2. Cutting Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-2)] block">Cutting Instructions</label>
                <textarea
                  value={cuttingInstructions}
                  onChange={(e) => setCuttingInstructions(e.target.value)}
                  placeholder="e.g. Cut from 0:10 to 0:45, remove the last 30 seconds"
                  rows={2}
                  disabled={isBusy}
                  className={textareaClass}
                />
              </div>

              {/* 3. Transition Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-2)] block">Transition Instructions</label>
                <textarea
                  value={transitionInstructions}
                  onChange={(e) => setTransitionInstructions(e.target.value)}
                  placeholder="e.g. Add a 0.5s crossfade between each cut"
                  rows={2}
                  disabled={isBusy}
                  className={textareaClass}
                />
              </div>

              {/* 4. Caption Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-2)] block">Caption Instructions</label>
                <textarea
                  value={captionInstructions}
                  onChange={(e) => setCaptionInstructions(e.target.value)}
                  placeholder='e.g. Bold white centered text saying "Subscribe" from 0:05 to 0:10'
                  rows={2}
                  disabled={isBusy}
                  className={textareaClass}
                />
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!hasAnyInstruction || !videoFile || !API_KEY || isBusy || extractingFrames || (!ffmpegLoaded && !ffmpegLoading)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-[var(--gold)] hover:bg-[var(--gold-hi)] text-[var(--bg-base)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              >
                {status === 'generating' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Asking Claude…
                  </>
                ) : status === 'processing' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing with FFmpeg…
                  </>
                ) : extractingFrames ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Extracting frames…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 opacity-90">
                      <path d="M12 3l1.88 5.76a1 1 0 00.95.69H21l-4.94 3.59a1 1 0 00-.36 1.12L17.58 20 12 16.41 6.42 20l1.88-5.84a1 1 0 00-.36-1.12L3 9.45h6.17a1 1 0 00.95-.69L12 3z" />
                    </svg>
                    Generate Edit
                  </>
                )}
              </button>

              {/* Progress bar */}
              {status === 'processing' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Processing…</span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--gold)] rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Generated commands (collapsible) */}
          {commands && (
            <details className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden group">
              <summary className="px-5 py-3.5 text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-300 transition-colors flex items-center justify-between list-none">
                <span>FFmpeg Commands ({commands.length})</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 group-open:rotate-180 transition-transform">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="border-t border-white/[0.05] p-4 space-y-2">
                {commands.map((cmd, i) => (
                  <div key={i} className="bg-gray-950/70 border border-white/[0.05] rounded-xl px-3 py-2 font-mono text-[11px] text-emerald-300/80 break-all">
                    ffmpeg {cmd.join(' ')}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Output video */}
          {status === 'done' && outputUrl && (
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Output Preview</h3>
                </div>
                {processingMs !== null && (
                  <span className="text-[11px] text-gray-600 tabular-nums">
                    {(processingMs / 1000).toFixed(1)}s processing
                  </span>
                )}
              </div>
              <div className="p-5 space-y-4">
                <video
                  src={outputUrl}
                  controls
                  className="w-full rounded-xl bg-black aspect-video object-contain"
                />

                {/* Feedback */}
                <div className="border-t border-white/[0.05] pt-4">
                  {feedbackState === 'none' && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-500 flex-1">Did this edit come out correctly?</p>
                      <button
                        onClick={handleThumbsUp}
                        disabled={savingFeedback}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-emerald-400 border border-white/[0.07] hover:border-emerald-500/30 hover:bg-emerald-500/08 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                        Looks good
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
                        Had issues
                      </button>
                    </div>
                  )}

                  {feedbackState === 'prompted' && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-400">What went wrong with the generated edit?</p>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="e.g. Timecodes were off, text didn't render, wrong clip order…"
                        rows={3}
                        className={textareaClass}
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
                      Thanks — Claude will learn from this on the next generation.
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

        {/* ── Right: export + FFmpeg log ─────────────────────────────────── */}
        <div className="w-full xl:w-72 shrink-0 space-y-4">

          {/* Export */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Export</h3>
            </div>
            <div className="p-5">
              {status === 'done' && outputUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="shrink-0">✓</span>
                    <p className="text-sm font-semibold">MP4 ready</p>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.04] hover:bg-white/[0.07] text-[var(--text-1)] border border-white/[0.07] transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download MP4
                  </button>
                  {processingMs !== null && (
                    <p className="text-[11px] text-gray-600 text-center">
                      Processed in {(processingMs / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-600 text-center py-4 leading-relaxed">
                  {!videoFile
                    ? 'Upload a video to get started'
                    : !hasAnyInstruction
                    ? 'Add edit instructions to generate'
                    : 'Generate an edit to download'}
                </p>
              )}
            </div>
          </div>

          {/* FFmpeg log */}
          {logLines.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/[0.05]">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">FFmpeg Log</h3>
              </div>
              <div className="p-3 max-h-48 overflow-y-auto">
                <pre className="text-[10px] text-gray-600 font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {logLines.join('\n')}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Feedback History ───────────────────────────────────────────────── */}
      <div className="mx-5 mb-5 bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] text-[var(--text-1)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Feedback History</h3>
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
                {clearingHistory ? 'Clearing…' : 'Clear All'}
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
                No feedback yet. Rate generated edits to help Claude improve.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {feedbackHistory.map((row) => (
                  <div key={row.id} className="px-5 py-4 flex items-start gap-4">
                    <span className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      row.feedback_type === 'good'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>
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
