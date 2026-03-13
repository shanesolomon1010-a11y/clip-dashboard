'use client';

import { useCallback, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-20250514';
const API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '';
const MAX_FILE_BYTES = 500 * 1024 * 1024;

const SYSTEM_PROMPT =
  'You are a video editing assistant. The user will describe how they want to edit their video. You will respond with:\n' +
  '1. A brief plain English explanation of the edits\n' +
  '2. A JSON block with the ffmpeg args array like: { "args": ["-i", "input.mp4", "-vf", "scale=1080:1920", "output.mp4"] }\n' +
  "Always use 'input.mp4' as input filename and 'output.mp4' as output filename. " +
  'Only use ffmpeg filters that work in FFmpeg.wasm. Do not use hardware acceleration flags.';

const EXAMPLE_PROMPTS = [
  'Convert to 9:16 vertical',
  'Trim to the best 30 seconds',
  'Speed up 1.5x',
  'Add 2 second black intro',
  'Cut from 0:15 to 1:30',
  'Flip horizontally',
];

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
  size: number;
}

interface EditResult {
  explanation: string;
  args: string[];
}

type Status =
  | 'idle'
  | 'calling-claude'
  | 'loading-ffmpeg'
  | 'processing'
  | 'done'
  | 'error';

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

function parseClaudeResponse(text: string): EditResult | null {
  // Strip code fences
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Find "args" key and trace back to opening brace
  const argsIdx = cleaned.search(/"args"\s*:/);
  if (argsIdx === -1) return null;

  let braceStart = argsIdx - 1;
  while (braceStart >= 0 && cleaned[braceStart] !== '{') braceStart--;
  if (braceStart < 0) return null;

  // Match closing brace
  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) { braceEnd = i + 1; break; }
    }
  }
  if (braceEnd === -1) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(braceStart, braceEnd)) as { args?: unknown };
    if (!Array.isArray(parsed.args) || parsed.args.length === 0) return null;
    const explanation =
      cleaned.slice(0, braceStart).trim().replace(/^1\.\s*/m, '').trim() ||
      'Ready to apply edits.';
    return { explanation, args: parsed.args as string[] };
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EditorView() {
  const [videoFile, setVideoFile]     = useState<File | null>(null);
  const [videoUrl, setVideoUrl]       = useState<string | null>(null);
  const [videoMeta, setVideoMeta]     = useState<VideoMeta | null>(null);
  const [trimStart, setTrimStart]     = useState(0);
  const [trimEnd, setTrimEnd]         = useState(0);
  const [prompt, setPrompt]           = useState('');
  const [editResult, setEditResult]   = useState<EditResult | null>(null);
  const [outputUrl, setOutputUrl]     = useState<string | null>(null);
  const [status, setStatus]           = useState<Status>('idle');
  const [progress, setProgress]       = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const ffmpegRef   = useRef<FFmpeg | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──────────────────────────────────────────────────────────

  const loadVideo = useCallback((file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `File is ${formatFileSize(file.size)} — please use videos under 500 MB for browser processing.`
      );
      return;
    }
    setVideoFile(file);
    setEditResult(null);
    setOutputUrl(null);
    setError(null);
    setStatus('idle');
    setProgress(0);

    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    const vid = document.createElement('video');
    vid.src = url;
    vid.onloadedmetadata = () => {
      const meta: VideoMeta = {
        duration: vid.duration,
        width: vid.videoWidth,
        height: vid.videoHeight,
        size: file.size,
      };
      setVideoMeta(meta);
      setTrimStart(0);
      setTrimEnd(vid.duration);
    };
  }, []);

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
    setEditResult(null);
    setOutputUrl(null);
    setStatus('idle');
    setError(null);
    setProgress(0);
    setPrompt('');
  };

  // ── Claude ─────────────────────────────────────────────────────────────────

  const handleGenerateEdit = async () => {
    if (!prompt.trim() || !videoMeta || !API_KEY) return;
    setStatus('calling-claude');
    setError(null);
    setEditResult(null);

    const trimContext =
      trimStart > 0 || trimEnd < videoMeta.duration
        ? `\nTrim context: user wants output from ${formatTime(trimStart)} to ${formatTime(trimEnd)}.`
        : '';

    const userMsg =
      `User request: ${prompt.trim()}\n` +
      `Video info: duration=${videoMeta.duration.toFixed(1)}s, ` +
      `${videoMeta.width}×${videoMeta.height}, ${formatFileSize(videoMeta.size)}` +
      trimContext;

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
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err?.error?.message ?? `API error ${res.status}`);
      }

      const data = (await res.json()) as { content: { text: string }[] };
      const rawText = data.content[0]?.text ?? '';
      const parsed = parseClaudeResponse(rawText);
      if (!parsed) {
        throw new Error(
          'Claude did not return a valid ffmpeg command. Try rephrasing your prompt.'
        );
      }
      setEditResult(parsed);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  // ── FFmpeg ─────────────────────────────────────────────────────────────────

  const handleApplyEdits = async () => {
    if (!videoFile || !editResult) return;
    setError(null);
    setOutputUrl(null);
    setProgress(0);

    try {
      // Load FFmpeg once
      if (!ffmpegRef.current || !ffmpegLoaded) {
        setStatus('loading-ffmpeg');
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on('progress', ({ progress: p }: { progress: number }) => {
          setProgress(Math.round(Math.min(p, 1) * 100));
        });

        const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,     'text/javascript'),
          wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`,   'application/wasm'),
          workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });
        setFfmpegLoaded(true);
      }

      const ffmpeg = ffmpegRef.current!;
      setStatus('processing');

      // Clean up leftover files
      try { await ffmpeg.deleteFile('input.mp4'); } catch { /* empty */ }
      try { await ffmpeg.deleteFile('output.mp4'); } catch { /* empty */ }

      // Write input
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

      // Strip leading "ffmpeg" if Claude included it
      let args = [...editResult.args];
      if (args[0]?.toLowerCase() === 'ffmpeg') args = args.slice(1);

      await ffmpeg.exec(args);

      // Determine output filename from last arg
      const outputName = args[args.length - 1];
      const rawData = await ffmpeg.readFile(outputName);
      const ext = outputName.split('.').pop()?.toLowerCase() ?? 'mp4';
      const mime =
        ext === 'webm' ? 'video/webm' :
        ext === 'mov'  ? 'video/quicktime' :
                         'video/mp4';

      // Copy into a plain ArrayBuffer so Blob constructor accepts it
      const blob = new Blob([new Uint8Array(rawData as Uint8Array)], { type: mime });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'FFmpeg processing failed');
      setStatus('error');
    }
  };

  const handleDownload = () => {
    if (!outputUrl || !videoFile) return;
    const outputName = editResult?.args[editResult.args.length - 1] ?? 'output.mp4';
    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = `edited-${outputName}`;
    a.click();
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const isProcessing =
    status === 'loading-ffmpeg' ||
    status === 'calling-claude' ||
    status === 'processing';

  const duration = videoMeta?.duration ?? 0;

  const statusLabel =
    status === 'loading-ffmpeg' ? 'Loading video engine…' :
    status === 'calling-claude' ? 'Claude is planning your edit…' :
    status === 'processing'     ? `Applying edits… ${progress}%` :
    status === 'done'           ? 'Edit complete! Ready to download.' :
    null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* No API key banner */}
      {!API_KEY && (
        <div className="mx-5 mt-5 bg-amber-500/08 border border-amber-500/25 rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-amber-400 shrink-0">⚠</span>
          <p className="text-sm text-amber-200/90">
            No Anthropic API key configured — AI editing is disabled. Add{' '}
            <span className="font-semibold text-amber-100">NEXT_PUBLIC_ANTHROPIC_API_KEY</span> and
            redeploy, or set your key in the{' '}
            <span className="font-semibold text-amber-100">AI Insights</span> tab.
          </p>
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex flex-col xl:flex-row gap-4 p-5 flex-1">

        {/* ── Left panel: Upload + Preview ────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Source Video</h3>
              {videoFile && (
                <button
                  onClick={handleClear}
                  className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/[0.05]"
                >
                  Clear video
                </button>
              )}
            </div>
            <div className="p-5">
              {!videoFile ? (
                /* Drop zone */
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
                  <p className="text-xs text-gray-600">MP4, MOV, WebM · max 500 MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              ) : (
                /* Video preview */
                <div className="space-y-3">
                  <video
                    src={videoUrl ?? undefined}
                    controls
                    className="w-full rounded-xl bg-black aspect-video object-contain"
                  />
                  {videoMeta && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Duration',   value: formatTime(videoMeta.duration) },
                        { label: 'Resolution', value: `${videoMeta.width}×${videoMeta.height}` },
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

        {/* ── Center panel: Prompt + Claude response ───────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Prompt input */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-semibold text-white">Edit Prompt</h3>
              <p className="text-xs text-gray-600 mt-0.5">Describe what you want Claude to do with your video</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Example chips */}
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
                placeholder={'e.g. "Trim to 30s, convert to 9:16 vertical, and speed up 1.2x"'}
                rows={4}
                disabled={isProcessing}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none disabled:opacity-50"
              />

              <button
                onClick={handleGenerateEdit}
                disabled={!prompt.trim() || !videoFile || !API_KEY || isProcessing}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
              >
                {status === 'calling-claude' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Claude is planning your edit…
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
            </div>
          </div>

          {/* Claude's plan */}
          {editResult && (
            <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <h3 className="text-sm font-semibold text-white">Claude&apos;s Plan</h3>
              </div>
              <div className="p-5 space-y-3">
                {/* Explanation bubble */}
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3">
                  <p className="text-sm text-gray-300 leading-relaxed">{editResult.explanation}</p>
                </div>

                {/* FFmpeg args */}
                <div className="bg-gray-950/60 border border-white/[0.06] rounded-xl px-4 py-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 font-medium">
                    FFmpeg Command
                  </p>
                  <code className="text-[11px] text-emerald-400 font-mono leading-relaxed break-all">
                    ffmpeg {editResult.args.join(' ')}
                  </code>
                </div>

                {/* Apply button */}
                <button
                  onClick={handleApplyEdits}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
                >
                  {status === 'loading-ffmpeg' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Loading video engine…
                    </>
                  ) : status === 'processing' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Applying edits… {progress}%
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Apply Edits
                    </>
                  )}
                </button>
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

        {/* ── Right panel: Timeline + Export ──────────────────────────── */}
        <div className="w-full xl:w-72 shrink-0 space-y-4">

          {/* Timeline / Trim */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-semibold text-white">Timeline</h3>
              <p className="text-xs text-gray-600 mt-0.5">Set in/out points — passed to Claude as context</p>
            </div>
            <div className="p-5">
              {!videoMeta ? (
                <p className="text-xs text-gray-600 text-center py-6">
                  Upload a video to set trim points
                </p>
              ) : (
                <div className="space-y-5">
                  {/* Timeline bar */}
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

                  {/* In point slider */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-2">
                      <span className="text-gray-500 font-medium">In point</span>
                      <span className="text-white font-semibold tabular-nums">{formatTime(trimStart)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={trimStart}
                      onChange={(e) =>
                        setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.5))
                      }
                      className="w-full h-1.5 appearance-none bg-white/[0.08] rounded-full cursor-pointer accent-indigo-400"
                    />
                  </div>

                  {/* Out point slider */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-2">
                      <span className="text-gray-500 font-medium">Out point</span>
                      <span className="text-white font-semibold tabular-nums">{formatTime(trimEnd)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={trimEnd}
                      onChange={(e) =>
                        setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.5))
                      }
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

          {/* Export / Output */}
          <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-sm font-semibold text-white">Export</h3>
            </div>
            <div className="p-5 space-y-4">

              {/* Processing progress */}
              {(status === 'loading-ffmpeg' || status === 'processing') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin shrink-0" />
                    <p className="text-sm text-gray-300 font-medium">{statusLabel}</p>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{
                        width: status === 'loading-ffmpeg' ? '12%' : `${Math.max(progress, 4)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Output video */}
              {status === 'done' && outputUrl && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="text-base shrink-0">✓</span>
                    <p className="text-sm font-semibold">Edit complete! Ready to download.</p>
                  </div>
                  <video
                    src={outputUrl}
                    controls
                    className="w-full rounded-xl bg-black aspect-video object-contain"
                  />
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.07] hover:bg-white/[0.11] text-white border border-white/[0.1] transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download
                  </button>
                </div>
              )}

              {/* Idle hint */}
              {status !== 'loading-ffmpeg' && status !== 'processing' && status !== 'done' && (
                <p className="text-xs text-gray-600 text-center py-4 leading-relaxed">
                  {!videoFile
                    ? 'Upload a video to get started'
                    : !editResult
                    ? 'Generate an edit plan to continue'
                    : 'Click "Apply Edits" in the center panel to process your video'}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
