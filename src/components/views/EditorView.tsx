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

// ── Module-level pure helpers ─────────────────────────────────────────────

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

// ── Silence detection helpers (module-level — no state dependencies) ────────

/** Parse FFmpeg silencedetect log lines into silence intervals */
function parseSilences(lines: string[], duration?: number): Segment[] {
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
  if (currentStart !== null && duration !== undefined) {
    silences.push({ start: currentStart, end: duration });
  }
  return silences;
}

/** Invert silence gaps into keep segments */
function invertSilences(silences: Segment[], duration: number): Segment[] {
  const MIN_SEG = 0.01; // suppress keep segments shorter than 10 ms
  if (silences.length === 0) return [{ start: 0, end: duration }];
  const keeps: Segment[] = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start > cursor + MIN_SEG) keeps.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (cursor < duration - MIN_SEG) keeps.push({ start: cursor, end: duration });
  return keeps.length > 0 ? keeps : [{ start: 0, end: duration }];
}

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
      // Note: src uses bare filename — FCP will need to relink media (browser File API cannot expose absolute paths)
      return `  <asset id="r${i + 2}" name="${escapeXml(clip.filename)}" src="file:///${escapeXml(clip.filename)}" start="0s" duration="${totalFrames}/30s" hasVideo="1" hasAudio="1" format="r1"/>`;
    }),
  ].join('\n');

  // <spine> — one <asset-clip> per keepSegment
  let timelineFrames = 0;
  const spineItems: string[] = [];

  for (let ci = 0; ci < orderedClips.length; ci++) {
    const clip     = orderedClips[ci];
    const assetRef = `r${ci + 2}`;

    for (let si = 0; si < clip.keepSegments.length; si++) {
      const seg = clip.keepSegments[si];
      const segStartFrames    = Math.round(seg.start * 30);
      const segDurationFrames = Math.round((seg.end - seg.start) * 30);
      const offsetStr   = `${timelineFrames}/30s`;
      const startStr    = `${segStartFrames}/30s`;
      const durationStr = `${segDurationFrames}/30s`;

      // Captions within this segment become connected <title> clips on lane 1
      const titleEls = clip.captions
        .filter((cap) => cap.startTime >= seg.start && cap.startTime < seg.end)
        .map((cap, ti) => {
          const tsId              = `ts_${ci}_${si}_${ti}`;
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
    if (count === 0) return base;                          // first occurrence: use base as-is
    return base.slice(0, 7) + String(count % 10);         // subsequent: append counter digit
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

  // Mount-only: loadFFmpeg omitted intentionally — singleton guard (ffmpegRef.current) prevents re-entrancy
  useEffect(() => { loadFFmpeg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  // ── Upload & probe ─────────────────────────────────────────────────────────

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
      // readFile returns FileData (Uint8Array | string); Blob accepts Uint8Array directly via cast
      const raw = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
      const blob = new Blob([raw as unknown as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
      return URL.createObjectURL(blob);
    } catch {
      return '';
    } finally {
      try { await ff.deleteFile(inName); } catch { /* ignore */ }
      try { await ff.deleteFile(outName); } catch { /* ignore */ }
    }
  // ffmpegRef is a stable ref object — excluded from deps intentionally
  }, []);

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
        const silences   = parseSilences(collected, clip.duration);
        const keepSegs   = invertSilences(silences, clip.duration);
        results.set(clip.id, keepSegs);
        addLog(`  → ${silences.length} silence(s), ${keepSegs.length} keep segment(s)`);
      } catch {
        addLog(`  ⚠ Detection failed for ${clip.filename} — keeping full clip`);
        results.set(clip.id, [{ start: 0, end: clip.duration }]);
      } finally {
        ff.off('log', logHandler);
        try { await ff.deleteFile(inName); } catch { /* ignore */ }
      }
    }

    return results;
  }, [addLog]);

  // ── Caption generation ─────────────────────────────────────────────────────

  const generateCaptionsForClip = useCallback(async (
    clip: Clip,
    instr: Instructions,
  ): Promise<Caption[]> => {
    interface AnthropicContent { type: string; text: string }
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

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Claude API error ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`);
    }

    const json = await res.json();
    const raw  = (json.content?.[0] as AnthropicContent | undefined)?.text ?? '';

    // Strip markdown code fences if Claude wraps the JSON
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Claude returned non-array JSON');
      return parsed as Caption[];
    } catch {
      throw new Error(`JSON parse failure: ${cleaned.slice(0, 80)}`);
    }
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
    const succeeded = results.filter((r) => r.captions.length > 0).length;
    addLog(`── Captions complete: ${succeeded}/${results.length} clip(s) succeeded`);
    return new Map(results.map(({ id, captions }) => [id, captions]));
  }, [addLog, generateCaptionsForClip]);

  // ── Placeholder handlers (implemented in later tasks) ──────────────────────

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
  const canGenerate = clips.length > 0 && ffmpegLoaded && status !== 'analyzing' && status !== 'generating';

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
