'use client';

import { useCallback, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/lib/supabase';

const FFMPEG_CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';

type ItemStatus = 'waiting' | 'compressing' | 'uploading' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  clipDetailsCode: string;
  status: ItemStatus;
  progress: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status, progress }: { status: ItemStatus; progress: number }) {
  const styles: Record<ItemStatus, string> = {
    waiting:     'bg-[rgba(247,231,206,0.06)] text-[var(--text-3)]',
    compressing: 'bg-[rgba(251,191,36,0.12)] text-yellow-400',
    uploading:   'bg-[rgba(59,130,246,0.12)] text-blue-400',
    done:        'bg-[rgba(34,197,94,0.12)] text-green-400',
    error:       'bg-[rgba(239,68,68,0.12)] text-red-400',
  };
  const labels: Record<ItemStatus, string> = {
    waiting:     'Waiting',
    compressing: `Compressing ${progress}%`,
    uploading:   'Uploading…',
    done:        'Done',
    error:       'Error',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function CompressView() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [summary, setSummary] = useState<{ success: number; failed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter((f) => /\.(mp4|mov|mkv)$/i.test(f.name));
    if (valid.length === 0) return;
    const items: QueueItem[] = valid.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      clipDetailsCode: f.name.replace(/\.[^.]+$/, ''),
      status: 'waiting',
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...items]);
    setSummary(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  }, [addFiles]);

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  async function ensureFFmpeg(): Promise<FFmpeg> {
    if (ffmpegRef.current && ffmpegLoaded) return ffmpegRef.current;
    setFfmpegLoading(true);
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(FFMPEG_CORE_URL, 'text/javascript'),
      wasmURL: await toBlobURL(FFMPEG_WASM_URL, 'application/wasm'),
    });
    ffmpegRef.current = ff;
    setFfmpegLoaded(true);
    setFfmpegLoading(false);
    return ff;
  }

  async function compressAndUpload() {
    const pending = queue.filter((item) => item.status === 'waiting' || item.status === 'error');
    if (pending.length === 0) return;

    setRunning(true);
    setSummary(null);

    let ff: FFmpeg;
    try {
      ff = await ensureFFmpeg();
    } catch (err) {
      setRunning(false);
      setFfmpegLoading(false);
      const msg = err instanceof Error ? err.message : 'Failed to load FFmpeg';
      for (const item of pending) updateItem(item.id, { status: 'error', error: msg });
      return;
    }

    let success = 0;
    let failed = 0;

    for (const item of pending) {
      const inputName = `input_${item.id}.mp4`;
      const outputName = `output_${item.id}.mp4`;
      const { clipDetailsCode } = item;

      // ── Compress ──────────────────────────────────────────────────────────
      updateItem(item.id, { status: 'compressing', progress: 0 });

      const onProgress = ({ progress }: { progress: number }) => {
        updateItem(item.id, { progress: Math.min(99, Math.round(progress * 100)) });
      };
      ff.on('progress', onProgress);

      try {
        await ff.writeFile(inputName, await fetchFile(item.file));
        await ff.exec([
          '-i', inputName,
          '-vf', 'scale=1080:1920',
          '-c:v', 'libx264',
          '-crf', '28',
          '-preset', 'medium',
          '-sar', '1:1',
          '-c:a', 'aac',
          '-f', 'mp4',
          '-movflags', '+faststart',
          outputName,
        ]);
        ff.off('progress', onProgress);

        const data = await ff.readFile(outputName) as Uint8Array;
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);

        // ── Upload ──────────────────────────────────────────────────────────
        updateItem(item.id, { status: 'uploading', progress: 100 });

        // Copy bytes into a plain ArrayBuffer (FFmpeg may use SharedArrayBuffer internally)
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        const blob = new Blob([copy.buffer], { type: 'video/mp4' });
        const storagePath = `${clipDetailsCode}.mp4`;

        const { error: uploadError } = await supabase.storage
          .from('Clips')
          .upload(storagePath, blob, { contentType: 'video/mp4', upsert: true });

        if (uploadError) throw new Error(uploadError.message);

        // ── Sync video_url in clip_details ──────────────────────────────────
        const videoUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Clips/${storagePath}`;
        await fetch('/api/library/set-video-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip_details_code: clipDetailsCode, video_url: videoUrl }),
        });

        updateItem(item.id, { status: 'done' });
        success++;
      } catch (err) {
        ff.off('progress', onProgress);
        try { await ff.deleteFile(inputName); } catch { /* already gone */ }
        try { await ff.deleteFile(outputName); } catch { /* already gone */ }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        updateItem(item.id, { status: 'error', error: msg });
        failed++;
      }
    }

    setSummary({ success, failed });
    setRunning(false);
  }

  const waitingCount = queue.filter((i) => i.status === 'waiting' || i.status === 'error').length;
  const canRun = !running && waitingCount > 0;

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-[18px] font-bold text-[var(--text-1)]">Compress & Upload</h1>
        <p className="text-[12px] text-[var(--text-2)] mt-0.5">
          Compress video files to 1080×1920 and upload to Supabase storage.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-2xl px-6 py-10 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors',
          dragOver
            ? 'border-[var(--gold)] bg-[var(--gold-dim)]'
            : 'border-[rgba(247,231,206,0.12)] hover:border-[rgba(247,231,206,0.22)] bg-[rgba(247,231,206,0.01)]',
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[var(--text-3)]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-[13px] text-[var(--text-2)] font-medium">Drop .mp4, .mov, or .mkv files here</p>
        <p className="text-[11px] text-[var(--text-3)]">or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.mkv"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[rgba(247,231,206,0.05)] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--text-2)] uppercase tracking-wider">
              Queue · {queue.length} file{queue.length !== 1 ? 's' : ''}
            </span>
            {!running && (
              <button
                onClick={() => setQueue([])}
                className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="divide-y divide-[rgba(247,231,206,0.04)]">
            {queue.map((item) => (
              <div key={item.id} className="px-5 py-4 space-y-2.5">
                <div className="flex items-start gap-3">
                  {/* Filename + size */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[var(--text-3)] truncate">{item.file.name}</p>
                    <p className="text-[10px] text-[var(--text-3)] opacity-60">{formatBytes(item.file.size)}</p>
                  </div>
                  <StatusBadge status={item.status} progress={item.progress} />
                  {!running && item.status !== 'done' && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors shrink-0 text-[12px] leading-none mt-0.5"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Clip details code input */}
                {(item.status === 'waiting' || item.status === 'error') && (
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-[var(--text-3)] shrink-0 uppercase tracking-wider">Code</label>
                    <input
                      type="text"
                      value={item.clipDetailsCode}
                      onChange={(e) => updateItem(item.id, { clipDetailsCode: e.target.value })}
                      disabled={running}
                      placeholder="e.g. MBM016-CLIP-002"
                      className="flex-1 px-2.5 py-1.5 text-[12px] font-mono bg-[var(--bg-base)] border border-[rgba(247,231,206,0.08)] rounded-lg text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] disabled:opacity-50"
                    />
                  </div>
                )}

                {/* Compression progress bar */}
                {item.status === 'compressing' && (
                  <div className="h-1.5 bg-[rgba(247,231,206,0.06)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}

                {/* Upload progress bar */}
                {item.status === 'uploading' && (
                  <div className="h-1.5 bg-[rgba(247,231,206,0.06)] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full animate-pulse" style={{ width: '100%' }} />
                  </div>
                )}

                {/* Error message */}
                {item.status === 'error' && item.error && (
                  <p className="text-[11px] text-red-400 leading-snug">{item.error}</p>
                )}

                {/* Done: show storage path */}
                {item.status === 'done' && (
                  <p className="text-[11px] text-green-400 font-mono">{item.clipDetailsCode}.mp4 → Clips/</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FFmpeg loading state */}
      {ffmpegLoading && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.12)]">
          <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-[12px] text-yellow-400">Loading FFmpeg.wasm (~20 MB)…</p>
        </div>
      )}

      {/* Action button */}
      {queue.length > 0 && (
        <button
          onClick={compressAndUpload}
          disabled={!canRun}
          className="w-full py-3 text-[13px] font-semibold rounded-xl bg-[var(--gold)] text-[var(--bg-base)] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running
            ? 'Processing…'
            : `Compress & Upload All (${waitingCount} file${waitingCount !== 1 ? 's' : ''})`}
        </button>
      )}

      {/* Summary */}
      {summary && (
        <div className={[
          'px-4 py-3.5 rounded-xl border text-[13px] font-medium',
          summary.failed === 0
            ? 'bg-[rgba(34,197,94,0.06)] border-[rgba(34,197,94,0.15)] text-green-400'
            : 'bg-[rgba(247,231,206,0.03)] border-[rgba(247,231,206,0.08)] text-[var(--text-2)]',
        ].join(' ')}>
          {summary.failed === 0
            ? `✓ ${summary.success} file${summary.success !== 1 ? 's' : ''} compressed and uploaded successfully.`
            : `${summary.success} succeeded · ${summary.failed} failed.`}
        </div>
      )}
    </div>
  );
}
