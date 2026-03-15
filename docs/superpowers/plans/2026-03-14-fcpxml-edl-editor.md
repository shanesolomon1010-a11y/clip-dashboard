# FCPXML/EDL Video Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EditorView.tsx with a multi-clip FCPXML/EDL export pipeline using FFmpeg.wasm for silence detection and Claude for caption generation.

**Architecture:** Single React component (`EditorView.tsx`) with all logic inline. Six sequential pipeline stages: upload+probe → silence detection → caption generation → FCPXML build → EDL build → download+save. Three-panel layout (clip list / instructions / log) with a bottom action bar.

**Tech Stack:** Next.js 14 App Router, React 18, FFmpeg.wasm 0.12.x (`@ffmpeg/ffmpeg`, `@ffmpeg/util`), Anthropic API (direct browser fetch), Supabase (`@supabase/supabase-js`), Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-14-fcpxml-edl-editor-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/components/views/EditorView.tsx` | Complete replacement — all pipeline logic and UI |
| Read   | `src/lib/db.ts:70-80` | `saveEditorFeedback` signature |
| Read   | `src/app/globals.css` | CSS variable tokens for styling |

No new files. All logic lives in `EditorView.tsx`.

---

## Chunk 1: Scaffold, State, FFmpeg Init, Upload & Probe

---

### Task 1: Replace EditorView with scaffold + state + FFmpeg init

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Replace the entire file with the new component skeleton. This establishes the type definitions, all state variables, FFmpeg initialization (identical pattern to the existing component), and the three-panel shell layout with no logic yet. The component renders but does nothing on button click.

- [ ] **Step 1: Write the new EditorView.tsx**

Replace the entire file at `src/components/views/EditorView.tsx` with:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { saveEditorFeedback } from '@/lib/db';

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL   = 'claude-sonnet-4-20250514';
const API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '';

const FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Segment {
  start: number;
  end: number;
}

interface Caption {
  startTime: number;
  endTime: number;
  text: string;
}

interface Clip {
  id: string;
  file: File;
  filename: string;
  duration: number;        // seconds, from native video element
  thumbnailUrl: string;    // blob URL, frame 1 from FFmpeg
  order: number;
  keepSegments: Segment[];
  captions: Caption[];
  analyzed: boolean;
}

type Instructions = {
  reference: string;
  cutting: string;
  transitions: string;
  captions: string;
};

type Status = 'idle' | 'analyzing' | 'generating' | 'done' | 'error';

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditorView() {
  // FFmpeg
  const ffmpegRef    = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded,  setFfmpegLoaded]  = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [ffmpegError,   setFfmpegError]   = useState<string | null>(null);

  // Clips
  const [clips, setClips] = useState<Clip[]>([]);

  // Instructions
  const [instructions, setInstructions] = useState<Instructions>({
    reference: '', cutting: '', transitions: '', captions: '',
  });

  // Pipeline state
  const [status,    setStatus]    = useState<Status>('idle');
  const [logLines,  setLogLines]  = useState<string[]>([]);
  const [fcpxmlBlob, setFcpxmlBlob] = useState<Blob | null>(null);
  const [edlBlob,    setEdlBlob]    = useState<Blob | null>(null);

  // Drag state for clip reorder
  const dragIndexRef = useRef<number | null>(null);

  // Log ref for auto-scroll
  const logRef = useRef<HTMLDivElement>(null);

  // ── FFmpeg initialization ───────────────────────────────────────────────────

  const addLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-199), line]);
  }, []);

  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current || ffmpegLoading) return;
    setFfmpegLoading(true);
    setFfmpegError(null);
    try {
      const ff = new FFmpeg();
      ff.on('log', ({ message }) => { addLog(message); });
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
  }, [ffmpegLoading, addLog]);

  useEffect(() => { loadFFmpeg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  // ── Placeholder handlers (implemented in later tasks) ──────────────────────

  const handleFiles = useCallback((_files: FileList | File[]) => {
    // Task 2
  }, []);

  const handleGenerate = useCallback(async () => {
    // Tasks 3–7
  }, []);

  // ── Drag-drop reorder ──────────────────────────────────────────────────────

  const handleDragStart = (index: number) => { dragIndexRef.current = index; };
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop      = (index: number) => {
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setClips((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next.map((c, i) => ({ ...c, order: i }));
    });
    dragIndexRef.current = null;
  };

  // ── Download helpers ───────────────────────────────────────────────────────

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const sortedClips = [...clips].sort((a, b) => a.order - b.order);
  const canGenerate = clips.length > 0 && ffmpegLoaded && status === 'idle';

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Three-panel body */}
      <div className="flex flex-col xl:flex-row flex-1 min-h-0 gap-4 p-4">

        {/* Left panel — Clip list */}
        <div className="xl:w-64 flex-shrink-0 flex flex-col gap-3">
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden flex flex-col flex-1">
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <p className="text-[13px] font-semibold text-[var(--text-1)]">Clips</p>
            </div>

            {/* Upload zone */}
            <div
              className="mx-3 mt-3 border-2 border-dashed border-white/[0.08] rounded-xl p-4 text-center cursor-pointer hover:border-[var(--gold-border)] transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById('clip-file-input')?.click()}
            >
              <p className="text-[12px] text-[var(--text-2)]">Drop .mp4 / .mov / .m4v</p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">or click to browse</p>
              <input
                id="clip-file-input"
                type="file"
                accept=".mp4,.mov,.m4v"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {/* Clip cards */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {sortedClips.map((clip, index) => (
                <div
                  key={clip.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-xl p-2 cursor-grab active:cursor-grabbing"
                >
                  {clip.thumbnailUrl
                    ? <img src={clip.thumbnailUrl} alt="" className="w-16 h-10 object-cover rounded-lg flex-shrink-0" />
                    : <div className="w-16 h-10 bg-white/[0.04] rounded-lg flex-shrink-0 animate-pulse" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[var(--text-1)] truncate">{clip.filename}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-[var(--text-3)]">
                        {clip.duration > 0 ? `${clip.duration.toFixed(1)}s` : '…'}
                      </span>
                      {clip.analyzed && (
                        <span className="text-[10px] text-[var(--gold)]">✓</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(clip.thumbnailUrl);
                      setClips((prev) => prev.filter((c) => c.id !== clip.id).map((c, i) => ({ ...c, order: i })));
                    }}
                    className="text-[var(--text-3)] hover:text-[var(--text-2)] text-[14px] px-1"
                  >×</button>
                </div>
              ))}
            </div>

            {/* Clear all */}
            {clips.length > 0 && (
              <div className="px-3 pb-3">
                <button
                  onClick={() => {
                    clips.forEach((c) => URL.revokeObjectURL(c.thumbnailUrl));
                    setClips([]);
                  }}
                  className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] w-full text-center py-1"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center panel — Instructions */}
        <div className="flex-1 min-w-0">
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <p className="text-[13px] font-semibold text-[var(--text-1)]">Instructions</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(['reference', 'cutting', 'transitions', 'captions'] as const).map((key) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1.5">
                    {key}
                  </label>
                  <textarea
                    value={instructions[key]}
                    onChange={(e) => setInstructions((prev) => ({ ...prev, [key]: e.target.value }))}
                    rows={3}
                    placeholder={`${key.charAt(0).toUpperCase() + key.slice(1)} instructions…`}
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] resize-none font-[var(--font-sans)]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel — Analysis log */}
        <div className="xl:w-80 flex-shrink-0">
          <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <p className="text-[13px] font-semibold text-[var(--text-1)]">Analysis Log</p>
            </div>
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-[11px]"
            >
              {ffmpegError && (
                <p className="text-red-400">{ffmpegError}</p>
              )}
              {ffmpegLoading && (
                <p className="text-[var(--text-3)]">Loading FFmpeg.wasm…</p>
              )}
              {logLines.map((line, i) => {
                const isGold = line.includes('silence_start') || line.includes('silence_end');
                const isRed  = line.includes('Error') || line.includes('error') || line.includes('Invalid');
                return (
                  <p key={i} className={
                    isGold ? 'text-[var(--gold)]' :
                    isRed  ? 'text-red-400' :
                    'text-[var(--text-3)]'
                  }>{line}</p>
                );
              })}
              {logLines.length === 0 && !ffmpegLoading && !ffmpegError && (
                <p className="text-[var(--text-3)]">Waiting for analysis…</p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="px-4 pb-4 flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="flex-1 flex items-center justify-center gap-2 bg-[var(--gold)] hover:bg-[var(--gold-hi)] disabled:opacity-40 text-[var(--bg-base)] font-semibold text-sm rounded-xl py-3 transition-colors"
        >
          {status === 'analyzing' || status === 'generating' ? (
            <>
              <span className="w-4 h-4 border-2 border-[var(--bg-base)]/40 border-t-[var(--bg-base)] rounded-full animate-spin" />
              <span>{status === 'analyzing' ? 'Analyzing…' : 'Generating captions…'}</span>
            </>
          ) : 'Analyze & Generate'}
        </button>

        {fcpxmlBlob && (
          <button
            onClick={() => downloadBlob(fcpxmlBlob, 'export.fcpxml')}
            className="px-4 py-3 border border-white/[0.07] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04] text-sm font-medium rounded-xl transition-colors"
          >
            Download FCPXML
          </button>
        )}
        {edlBlob && (
          <button
            onClick={() => downloadBlob(edlBlob, 'export.edl')}
            className="px-4 py-3 border border-white/[0.07] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04] text-sm font-medium rounded-xl transition-colors"
          >
            Download EDL
          </button>
        )}
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds. The component renders an empty shell. The `fetchFile` import is currently unused — that's fine, it'll be used in Task 2.

**Note:** If ESLint complains about unused `fetchFile`, remove it from the import for now — it'll be added back in Task 2.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: scaffold new EditorView with 3-panel layout and FFmpeg init"
```

---

### Task 2: Implement upload & probe (duration + thumbnail)

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Implement `handleFiles`: for each dropped/selected file, create a `Clip` with duration from the native video element, then extract a thumbnail frame via FFmpeg.wasm. Operations are serial to avoid virtual FS collisions.

- [ ] **Step 1: Add the `probeAndThumbnail` helper inside the component (after `loadFFmpeg`, before `handleFiles`)**

```tsx
// ── Upload & probe ─────────────────────────────────────────────────────────

/** Probe duration via native video element — avoids FFmpeg round-trip */
const probeDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.src = url;
    vid.onloadedmetadata = () => {
      resolve(vid.duration);
      URL.revokeObjectURL(url);
    };
    vid.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
  });

/** Extract frame 1 as a blob URL using FFmpeg.wasm */
const extractThumbnail = useCallback(async (file: File, id: string): Promise<string> => {
  const ff = ffmpegRef.current;
  if (!ff) return '';
  const inName  = `input_${id}.mp4`;
  const outName = `thumb_${id}.jpg`;
  try {
    await ff.writeFile(inName, await fetchFile(file));
    await ff.exec(['-i', inName, '-frames:v', '1', '-q:v', '2', outName]);
    const data = await ff.readFile(outName);
    const blob = new Blob([data], { type: 'image/jpeg' });
    return URL.createObjectURL(blob);
  } catch {
    return '';
  } finally {
    try { await ff.deleteFile(inName); } catch { /* ignore */ }
    try { await ff.deleteFile(outName); } catch { /* ignore */ }
  }
}, []);
```

- [ ] **Step 2: Replace the `handleFiles` placeholder with the real implementation**

```tsx
const handleFiles = useCallback(async (files: FileList | File[]) => {
  if (!ffmpegLoaded) return;
  const arr = Array.from(files).filter(
    (f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(f.name)
  );
  if (arr.length === 0) return;

  // Generate stable IDs outside the state updater so we can reference them in the serial loop
  const ids = arr.map((_, i) => `${Date.now()}-${i}`);

  // Add skeleton clips inside the updater so `order` uses real prev.length (no stale closure)
  setClips((prev) => [
    ...prev,
    ...arr.map((file, i) => ({
      id: ids[i],
      file,
      filename: file.name,
      duration: 0,
      thumbnailUrl: '',
      order: prev.length + i,
      keepSegments: [],
      captions: [],
      analyzed: false,
    })),
  ]);

  // Fill in duration + thumbnail serially (avoids FFmpeg virtual FS collisions)
  for (let i = 0; i < arr.length; i++) {
    const id       = ids[i];
    const duration = await probeDuration(arr[i]);
    const thumbUrl = await extractThumbnail(arr[i], id);
    setClips((prev) =>
      prev.map((c) => c.id === id ? { ...c, duration, thumbnailUrl: thumbUrl } : c)
    );
  }
}, [ffmpegLoaded, extractThumbnail]);
```

Note: `probeDuration` is not a hook so it doesn't need `useCallback` — it's a plain async function defined inside the component above `handleFiles`. `clips.length` is NOT in the dependency array — order is computed inside the `setClips` updater using `prev.length` to avoid stale closure bugs when multiple batches are uploaded.

- [ ] **Step 3: Add `fetchFile` back to the import at the top of the file**

The import line should be:
```tsx
import { fetchFile, toBlobURL } from '@ffmpeg/util';
```

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds. Clips can now be uploaded, duration shows, thumbnails appear.

- [ ] **Step 5: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: upload clips with duration probe and FFmpeg thumbnail extraction"
```

---

### Task 3: Implement silence detection (Stage 2)

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Add `parseSilences` and `invertSilences` as **module-level** functions (above the component, after the type definitions), then add `runSilenceDetection` as a `useCallback` inside the component. Keeping pure functions at module level avoids `react-hooks/exhaustive-deps` issues — they have no state dependencies.

- [ ] **Step 1: Add module-level silence helpers above the component (after the type definitions, before `export default function EditorView`)**

```tsx
// ── Silence detection helpers (module-level — no state dependencies) ────────

/** Parse FFmpeg silencedetect log lines into silence intervals */
function parseSilences(lines: string[]): Segment[] {
  const silences: Segment[] = [];
  let currentStart: number | null = null;
  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch   = line.match(/silence_end:\s*([\d.]+)/);
    if (startMatch) currentStart = parseFloat(startMatch[1]);
    if (endMatch && currentStart !== null) {
      silences.push({ start: currentStart, end: parseFloat(endMatch[1]) });
      currentStart = null;
    }
  }
  return silences;
}

/** Invert silence gaps into keep segments */
function invertSilences(silences: Segment[], duration: number): Segment[] {
  if (silences.length === 0) return [{ start: 0, end: duration }];
  const keeps: Segment[] = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start > cursor + 0.01) keeps.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (cursor < duration - 0.01) keeps.push({ start: cursor, end: duration });
  return keeps.length > 0 ? keeps : [{ start: 0, end: duration }];
}
```

- [ ] **Step 2: Add `runSilenceDetection` inside the component (after `extractThumbnail`)**

```tsx
const runSilenceDetection = useCallback(async (clipsToAnalyze: Clip[]): Promise<Map<string, Segment[]>> => {
  const ff = ffmpegRef.current;
  if (!ff) return new Map();
  const results = new Map<string, Segment[]>();

  for (const clip of clipsToAnalyze) {
    addLog(`── Silence detection: ${clip.filename}`);
    const inName = `input_${clip.id}.mp4`;
    const collected: string[] = [];

    // Capture log lines for silence parsing — global handler in loadFFmpeg already calls addLog
    const logHandler = ({ message }: { message: string }) => {
      collected.push(message);
    };
    ff.on('log', logHandler);

    try {
      await ff.writeFile(inName, await fetchFile(clip.file));
      await ff.exec([
        '-i', inName,
        '-af', 'silencedetect=noise=-30dB:d=0.5',
        '-f', 'null', '-',
      ]);
      const silences   = parseSilences(collected);
      const keepSegs   = invertSilences(silences, clip.duration);
      results.set(clip.id, keepSegs);
      addLog(`  → ${silences.length} silence(s), ${keepSegs.length} keep segment(s)`);
    } catch (e) {
      addLog(`  ⚠ Detection failed for ${clip.filename} — keeping full clip`);
      results.set(clip.id, [{ start: 0, end: clip.duration }]);
    } finally {
      ff.off('log', logHandler);
      try { await ff.deleteFile(inName); } catch { /* ignore */ }
    }
  }

  return results;
}, [addLog]);
```

**Note:** `ff.off` is fully typed and available in `@ffmpeg/ffmpeg` 0.12.x — no casting or workaround needed.

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: add silence detection with keepSegments inversion"
```

---

### Task 4: Implement caption generation (Stage 3)

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Add `generateCaptions` — one Claude API call per clip in parallel, using all 4 instruction boxes as context. Returns captions per clip.

- [ ] **Step 1: Add the `generateCaptions` helper inside the component (after `runSilenceDetection`)**

```tsx
// ── Caption generation ─────────────────────────────────────────────────────

const generateCaptionsForClip = useCallback(async (
  clip: Clip,
  instr: Instructions,
): Promise<Caption[]> => {
  const userContent = [
    `Generate captions for a video called "${clip.filename}" (${clip.duration.toFixed(1)}s long).`,
    `Active segments (silence removed): ${JSON.stringify(clip.keepSegments)}`,
    '',
    'Instructions context:',
    `Reference: ${instr.reference || '(none)'}`,
    `Cutting: ${instr.cutting || '(none)'}`,
    `Transitions: ${instr.transitions || '(none)'}`,
    `Captions: ${instr.captions || '(none)'}`,
    '',
    'Make captions punchy, social-media style, max 6 words each.',
  ].join('\n');

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
      max_tokens: 2048,
      system: 'You are a caption writer. Return ONLY a JSON array of {startTime, endTime, text} objects. No markdown, no explanation.',
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}`);

  const json = await res.json();
  const raw  = (json.content?.[0] as { type: string; text: string } | undefined)?.text ?? '';

  // Strip markdown code fences if Claude wraps the JSON
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed  = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Claude returned non-array JSON');
  return parsed as Caption[];
}, []);

const generateAllCaptions = useCallback(async (
  clipsWithSegments: Clip[],
  instr: Instructions,
): Promise<Map<string, Caption[]>> => {
  const results = await Promise.all(
    clipsWithSegments.map(async (clip) => {
      addLog(`── Generating captions: ${clip.filename}`);
      try {
        const captions = await generateCaptionsForClip(clip, instr);
        addLog(`  → ${captions.length} caption(s) generated`);
        return { id: clip.id, captions };
      } catch (e) {
        addLog(`  ⚠ Caption generation failed for ${clip.filename}: ${e instanceof Error ? e.message : 'unknown error'}`);
        return { id: clip.id, captions: [] };
      }
    })
  );
  return new Map(results.map(({ id, captions }) => [id, captions]));
}, [addLog, generateCaptionsForClip]);
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: add Claude caption generation for each clip"
```

---

## Chunk 2: FCPXML, EDL, Wiring, Download, Save

---

### Task 5: Implement FCPXML generation (Stage 4)

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Add `escapeXml` and `buildFcpxml` as **module-level** functions (alongside the other pure helpers above the component). Module-level placement eliminates any `react-hooks/exhaustive-deps` concern since these functions never need to be in a `useCallback` dependency array.

**Important:** `<title>` elements in FCPXML must reference an `<effect>` resource, not the `<format>` resource. We add a `<effect id="r_title">` entry using FCP's built-in Basic Title UID and give each title its own `<text-style-def>` so FCP can render the text.

- [ ] **Step 1: Add module-level FCPXML helpers above the component (after the silence helpers from Task 3)**

```tsx
// ── FCPXML generation helpers (module-level) ──────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// FCP's built-in Basic Title effect UID (resolves on any FCP 10.4+ installation)
const FCP_BASIC_TITLE_UID =
  '.../Titles.localized/Build In:Build Out.localized/Basic Title.localized/Basic Title.moti';

function buildFcpxml(orderedClips: Clip[]): string {
  // <resources> block
  const resourceEls = [
    `  <format id="r1" name="FFVideoFormat1080x1920at30" frameDuration="1/30s" width="1080" height="1920" colorSpace="1-1-1 (Rec. 709)"/>`,
    `  <effect id="r_title" name="Basic Title" uid="${FCP_BASIC_TITLE_UID}"/>`,
    ...orderedClips.map((clip, i) => {
      const totalFrames = Math.round(clip.duration * 30);
      return `  <asset id="r${i + 2}" name="${escapeXml(clip.filename)}" src="file:///${escapeXml(clip.filename)}" start="0s" duration="${totalFrames}/30s" hasVideo="1" hasAudio="1" format="r1"/>`;
    }),
  ].join('\n');

  // <spine> — one <asset-clip> per keepSegment
  let timelineFrames = 0;
  const spineItems: string[] = [];

  for (let ci = 0; ci < orderedClips.length; ci++) {
    const clip     = orderedClips[ci];
    const assetRef = `r${ci + 2}`;

    for (const seg of clip.keepSegments) {
      const segStartFrames    = Math.round(seg.start * 30);
      const segDurationFrames = Math.round((seg.end - seg.start) * 30);
      const offsetStr   = `${timelineFrames}/30s`;
      const startStr    = `${segStartFrames}/30s`;
      const durationStr = `${segDurationFrames}/30s`;

      // Captions within this segment become connected <title> clips on lane 1
      const titleEls = clip.captions
        .filter((cap) => cap.startTime >= seg.start && cap.startTime < seg.end)
        .map((cap, ti) => {
          const tsId              = `ts_${ci}_${ti}`;
          const capOffsetFrames   = Math.round((cap.startTime - seg.start) * 30);
          const capDurationFrames = Math.max(1, Math.round((cap.endTime - cap.startTime) * 30));
          return [
            `          <title ref="r_title" lane="1" offset="${capOffsetFrames}/30s" duration="${capDurationFrames}/30s" name="${escapeXml(cap.text)}">`,
            `            <text>`,
            `              <text-style ref="${tsId}">${escapeXml(cap.text)}</text-style>`,
            `            </text>`,
            `            <text-style-def id="${tsId}">`,
            `              <text-style font="Helvetica Neue" fontSize="48" fontFace="Bold" fontColor="1 1 1 1" bold="1" alignment="center"/>`,
            `            </text-style-def>`,
            `          </title>`,
          ].join('\n');
        }).join('\n');

      spineItems.push([
        `        <asset-clip ref="${assetRef}" offset="${offsetStr}" name="${escapeXml(clip.filename)}" start="${startStr}" duration="${durationStr}" format="r1">`,
        titleEls || null,
        `        </asset-clip>`,
      ].filter(Boolean).join('\n'));

      timelineFrames += segDurationFrames;
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    `<fcpxml version="1.10">`,
    `  <resources>`,
    resourceEls,
    `  </resources>`,
    `  <library>`,
    `    <event name="Exported">`,
    `      <project name="Export">`,
    `        <sequence format="r1" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    `          <spine>`,
    spineItems.join('\n'),
    `          </spine>`,
    `        </sequence>`,
    `      </project>`,
    `    </event>`,
    `  </library>`,
    `</fcpxml>`,
  ].join('\n');
}
```

Note: All timecode math is `Math.round(seconds * 30)` inline. Each `<title>` references `r_title` (the `<effect>` resource, not the `<format>`), has `lane="1"` for connected storyline placement, and carries its own `<text-style-def>` so FCP renders the text without requiring additional setup.

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: add FCPXML 1.10 template string generator"
```

---

### Task 6: Implement EDL generation (Stage 5)

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Add `toTimecode`, `toReelName`, and `buildEdl` as **module-level** functions (after `buildFcpxml`).

**Collision fix:** `toReelName` tracks a per-prefix counter (not `index % 10`) so reel names stay unique even with more than 10 clips sharing the same 8-char prefix.

- [ ] **Step 1: Add module-level EDL helpers above the component (after `buildFcpxml`)**

```tsx
// ── EDL generation helpers (module-level) ─────────────────────────────────

/** Seconds → CMX 3600 non-drop-frame timecode HH:MM:SS:FF */
function toTimecode(seconds: number): string {
  const totalFrames = Math.round(seconds * 30);
  const ff          = totalFrames % 30;
  const totalSecs   = Math.floor(totalFrames / 30);
  const ss          = totalSecs % 60;
  const mm          = Math.floor(totalSecs / 60) % 60;
  const hh          = Math.floor(totalSecs / 3600);
  return [hh, mm, ss, ff].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Build unique 8-char CMX reel names for all clips.
 * Uses a per-prefix counter so names stay unique regardless of how many clips collide.
 */
function buildReelNames(clips: Clip[]): string[] {
  const counters = new Map<string, number>();
  return clips.map((clip) => {
    const base = clip.filename
      .replace(/\.[^.]+$/, '')   // strip extension
      .replace(/\s+/g, '_')      // spaces → underscores
      .toUpperCase()
      .slice(0, 8);
    const count = counters.get(base) ?? 0;
    counters.set(base, count + 1);
    if (count === 0) return base;                                    // first occurrence: use base as-is
    return base.slice(0, 7) + String(count % 10);                   // subsequent: append counter digit
  });
}

function buildEdl(orderedClips: Clip[]): string {
  const lines: string[] = [
    'TITLE: Export',
    'FCM: NON-DROP FRAME',
    '',
  ];

  const reelNames   = buildReelNames(orderedClips);
  let eventNum      = 1;
  let recordSeconds = 0;

  for (let ci = 0; ci < orderedClips.length; ci++) {
    const clip     = orderedClips[ci];
    const reelName = reelNames[ci].padEnd(8);

    for (const seg of clip.keepSegments) {
      const srcIn  = toTimecode(seg.start);
      const srcOut = toTimecode(seg.end);
      const recIn  = toTimecode(recordSeconds);
      const segDur = seg.end - seg.start;
      recordSeconds += segDur;
      const recOut = toTimecode(recordSeconds);

      lines.push(
        `${String(eventNum).padStart(3, '0')}  ${reelName} V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`
      );
      eventNum++;
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: add CMX 3600 EDL generator with NDF timecodes"
```

---

### Task 7: Wire the full pipeline in `handleGenerate`

**Files:**
- Modify: `src/components/views/EditorView.tsx`

Replace the `handleGenerate` placeholder with the real implementation that orchestrates all 6 pipeline stages and sets `fcpxmlBlob` / `edlBlob` on completion.

- [ ] **Step 1: Replace the `handleGenerate` placeholder**

```tsx
const handleGenerate = useCallback(async () => {
  if (clips.length === 0 || !ffmpegLoaded) return;

  // Reset previous results and all analyzed flags
  setFcpxmlBlob(null);
  setEdlBlob(null);
  setLogLines([]);
  setClips((prev) => prev.map((c) => ({ ...c, analyzed: false, keepSegments: [], captions: [] })));
  setStatus('analyzing');

  try {
    const sortedByOrder = [...clips].sort((a, b) => a.order - b.order);

    // Guard: skip clips whose duration probe hasn't resolved yet (duration === 0)
    const validClips = sortedByOrder.filter((c) => c.duration > 0);
    if (validClips.length === 0) {
      addLog('⚠ No clips with known duration. Wait for thumbnail probing to finish, then retry.');
      setStatus('idle');
      return;
    }

    // Stage 2 — Silence detection (serial)
    addLog('=== Stage 1/3: Silence Detection ===');
    const segmentMap = await runSilenceDetection(validClips);

    // Apply keepSegments back to clip state
    const clipsWithSegs: Clip[] = validClips.map((clip) => ({
      ...clip,
      keepSegments: segmentMap.get(clip.id) ?? [{ start: 0, end: clip.duration }],
      analyzed: true,
    }));
    setClips((prev) =>
      prev.map((c) => {
        const updated = clipsWithSegs.find((x) => x.id === c.id);
        return updated ? { ...c, keepSegments: updated.keepSegments, analyzed: true } : c;
      })
    );

    // Stage 3 — Caption generation (parallel)
    setStatus('generating');
    addLog('=== Stage 2/3: Caption Generation ===');
    const captionMap = await generateAllCaptions(clipsWithSegs, instructions);

    const clipsWithCaptions: Clip[] = clipsWithSegs.map((clip) => ({
      ...clip,
      captions: captionMap.get(clip.id) ?? [],
    }));

    // Stage 4 — FCPXML
    addLog('=== Stage 3/3: Building FCPXML & EDL ===');
    const fcpxmlStr = buildFcpxml(clipsWithCaptions);
    const edlStr    = buildEdl(clipsWithCaptions);

    const newFcpxmlBlob = new Blob([fcpxmlStr], { type: 'application/xml' });
    const newEdlBlob    = new Blob([edlStr],    { type: 'text/plain' });
    setFcpxmlBlob(newFcpxmlBlob);
    setEdlBlob(newEdlBlob);

    addLog('✓ Done. Click Download FCPXML or Download EDL to export.');
    setStatus('done');

    // Stage 6 — Supabase save (non-blocking)
    saveEditorFeedback({
      prompt: JSON.stringify(instructions),
      ffmpeg_commands_generated: 'fcpxml_export',
      feedback: '',
      feedback_type: 'good',
    }).catch((e: unknown) => console.error('Supabase save failed:', e));

  } catch (e) {
    addLog(`✗ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    setStatus('error');
  }
// buildFcpxml and buildEdl are module-level pure functions — not state closures,
// so they are NOT in the dependency array (no exhaustive-deps warning).
}, [clips, ffmpegLoaded, instructions, addLog, runSilenceDetection, generateAllCaptions]);
```

**Important:** After setting `status('done')` or `status('error')`, the "Analyze & Generate" button re-enables only when `status === 'idle'`. Add a reset to allow re-runs: when the user clicks the button a second time, the pipeline already resets status at the top. However, `canGenerate` checks `status === 'idle'`. Update the `canGenerate` check in the render section:

```tsx
// Replace this line:
const canGenerate = clips.length > 0 && ffmpegLoaded && status === 'idle';

// With:
const canGenerate = clips.length > 0 && ffmpegLoaded && status !== 'analyzing' && status !== 'generating';
```

Also add a `setStatus('idle')` reset at the top of `handleGenerate` (before setting `analyzing`):

Add `setStatus('idle')` isn't needed — the pipeline immediately transitions to `analyzing`. The key fix is the `canGenerate` check above.

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds. All pipeline stages wired. Download buttons appear after generation.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "feat: wire full pipeline in handleGenerate — silence → captions → FCPXML/EDL"
```

---

### Task 8: Final verification and cleanup

**Files:**
- Modify: `src/components/views/EditorView.tsx` (cleanup only if needed)

Confirm the full build passes cleanly, check for any unused imports or ESLint errors, and do a final commit.

- [ ] **Step 1: Run full build and review all warnings**

```bash
cd /Users/shane/clip-dashboard && npm run build 2>&1
```

Expected: Zero errors. Review any warnings and fix them:

- **Unused import:** Remove any import that ESLint flags as unused
- **`no-explicit-any`:** If any `any` crept in, replace with specific types
- **`no-unused-vars`:** Remove or use any flagged variable

- [ ] **Step 2: Check that TypeScript is clean**

```bash
cd /Users/shane/clip-dashboard && npx tsc --noEmit 2>&1
```

Expected: Zero errors.

- [ ] **Step 3: Confirm no `react-hooks/exhaustive-deps` warnings**

All pure helper functions (`parseSilences`, `invertSilences`, `escapeXml`, `buildFcpxml`, `toTimecode`, `buildReelNames`, `buildEdl`) are module-level and will never appear in hook dependency arrays — no warnings expected for them.

If `exhaustive-deps` does flag any function, the correct fix is always to move that function to module level (above the component), not to add it to `useCallback` with an empty dep array.

`ff.off('log', logHandler)` is fully typed in `@ffmpeg/ffmpeg` 0.12.x — no casting needed.

- [ ] **Step 4: Final commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/EditorView.tsx
git commit -m "chore: final cleanup — all lint and type checks pass"
```

---

## Summary

| Task | What it builds | Verification |
|------|----------------|--------------|
| 1 | Component scaffold, state model, FFmpeg init, 3-panel UI shell | `npm run build` |
| 2 | File upload, duration probe (native video), thumbnail (FFmpeg) | `npm run build` |
| 3 | Silence detection, keepSegments inversion | `npm run build` |
| 4 | Claude caption generation (parallel per clip) | `npm run build` |
| 5 | FCPXML 1.10 template string builder | `npm run build` |
| 6 | CMX 3600 EDL builder | `npm run build` |
| 7 | Pipeline orchestration in `handleGenerate`, download + Supabase save | `npm run build` |
| 8 | Final lint/type check cleanup | `npm run build` + `tsc --noEmit` |
