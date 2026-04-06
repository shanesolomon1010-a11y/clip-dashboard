'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/lib/supabase';
import {
  getClipVersions,
  getReviewComments,
  addReviewComment,
  resolveComment,
  addClipVersion,
  ClipVersion,
  ReviewComment,
} from '@/lib/db';

interface Props {
  clipDetailsCode: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ClipReviewView({ clipDetailsCode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [versions, setVersions] = useState<ClipVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<ClipVersion | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'compressing' | 'uploading' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);

  // Load versions on mount / code change
  useEffect(() => {
    setLoadingVersions(true);
    getClipVersions(clipDetailsCode)
      .then((v) => {
        setVersions(v);
        if (v.length > 0) setActiveVersion(v[v.length - 1]);
      })
      .catch(() => {})
      .finally(() => setLoadingVersions(false));
  }, [clipDetailsCode]);

  // Load comments when active version changes
  const loadComments = useCallback(() => {
    if (!activeVersion) return;
    setLoadingComments(true);
    getReviewComments(clipDetailsCode, activeVersion.id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [clipDetailsCode, activeVersion]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleAddComment = async () => {
    if (!commentText.trim() || !activeVersion) return;
    const currentTime = videoRef.current?.currentTime ?? 0;
    setSubmitting(true);
    try {
      await addReviewComment({
        clip_details_code: clipDetailsCode,
        version_id: activeVersion.id,
        timestamp_start: currentTime,
        timestamp_end: null,
        comment: commentText.trim(),
      });
      setCommentText('');
      loadComments();
    } catch {
      // non-fatal
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: string) => {
    await resolveComment(id);
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: true } : c))
    );
  };

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/library/scan', { method: 'POST' });
      const json = await res.json() as { inserted?: number; skipped?: number; total?: number; error?: string };
      if (json.error) {
        setScanResult(`Error: ${json.error}`);
      } else {
        setScanResult(`Done — ${json.inserted} inserted, ${json.skipped} skipped (${json.total} total)`);
        // Reload versions in case new ones were added for this clip
        const updated = await getClipVersions(clipDetailsCode);
        setVersions(updated);
        if (updated.length > 0) setActiveVersion(updated[updated.length - 1]);
      }
    } catch {
      setScanResult('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // — Compress with FFmpeg.wasm —
      setUploadPhase('compressing');
      setUploadProgress(0);

      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
      }
      const ff = ffmpegRef.current;

      if (!ff.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ff.load({
          coreURL:  await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
          wasmURL:  await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      ff.on('progress', ({ progress }: { progress: number }) => {
        setUploadProgress(Math.round(progress * 100));
      });

      const inputName  = 'input.mp4';
      const outputName = 'output.mp4';

      await ff.writeFile(inputName, await fetchFile(file));
      await ff.exec([
        '-i', inputName,
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
        '-crf', '28',
        '-preset', 'fast',
        '-movflags', '+faststart',
        outputName,
      ]);

      const compressed = await ff.readFile(outputName);
      // Copy into a plain ArrayBuffer — readFile may return a SharedArrayBuffer-backed Uint8Array
      const raw = compressed as Uint8Array;
      const plain = new Uint8Array(raw.byteLength);
      plain.set(raw);
      const blob = new Blob([plain], { type: 'video/mp4' });

      // Clean up ffmpeg virtual FS
      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);

      // — Upload to Supabase Storage —
      setUploadPhase('uploading');
      setUploadProgress(0);

      const nextVersion = versions.length + 1;
      const path = `${clipDetailsCode}-v${nextVersion}.mp4`;

      const { error: uploadError } = await supabase.storage
        .from('Clips')
        .upload(path, blob, { upsert: true, contentType: 'video/mp4' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('Clips').getPublicUrl(path);
      await addClipVersion(clipDetailsCode, urlData.publicUrl, nextVersion);

      const updated = await getClipVersions(clipDetailsCode);
      setVersions(updated);
      setActiveVersion(updated[updated.length - 1]);
    } catch {
      // non-fatal
    } finally {
      setUploadPhase(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loadingVersions) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1.5">
          {versions.length === 0 ? (
            <span className="text-xs text-[var(--text-3)]">No versions yet</span>
          ) : (
            versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveVersion(v)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeVersion?.id === v.id
                    ? 'bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)] border border-transparent hover:border-[rgba(247,231,206,0.06)]'
                }`}
              >
                v{v.version_number}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          {scanResult && (
            <span className="text-[11px] text-[var(--text-3)] max-w-[220px] truncate" title={scanResult}>
              {scanResult}
            </span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[rgba(247,231,206,0.12)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[rgba(247,231,206,0.2)] transition-colors disabled:opacity-50"
          >
            {scanning ? (
              <div className="w-3 h-3 border border-[var(--text-3)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            )}
            {scanning ? 'Scanning…' : 'Scan Bucket'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhase !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--gold-border)] bg-[var(--gold-dim)] text-[var(--gold)] hover:bg-[rgba(212,146,42,0.12)] transition-colors disabled:opacity-50 min-w-[120px]"
          >
            {uploadPhase ? (
              <>
                <div className="w-3 h-3 border border-[var(--gold)] border-t-transparent rounded-full animate-spin shrink-0" />
                <span>
                  {uploadPhase === 'compressing' ? `Compressing ${uploadProgress}%` : `Uploading…`}
                </span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Version
              </>
            )}
          </button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex gap-5 min-h-0 flex-1">
        {/* Left: video + timeline + comment input */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Video player */}
          <div className="bg-black rounded-xl overflow-hidden aspect-video w-full">
            {activeVersion ? (
              <video
                ref={videoRef}
                key={activeVersion.id}
                src={activeVersion.video_url}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-sm text-[var(--text-3)]">No video — upload a version to get started</p>
              </div>
            )}
          </div>

          {/* Timeline bar */}
          <div className="relative w-full h-10 bg-[var(--bg-elevated)] rounded-xl border border-[rgba(247,231,206,0.06)]" />

          {/* Comment input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
              placeholder="Add a comment at current playback time…"
              disabled={!activeVersion || submitting}
              className="flex-1 bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] disabled:opacity-40 transition-colors"
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim() || !activeVersion || submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)] hover:bg-[rgba(212,146,42,0.12)] disabled:opacity-40 transition-colors"
            >
              {submitting ? '…' : 'Add'}
            </button>
          </div>
        </div>

        {/* Right: comments panel */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest">
            Comments
            {comments.length > 0 && (
              <span className="ml-2 text-[var(--text-3)] font-normal normal-case tracking-normal">
                ({comments.filter((c) => !c.resolved).length} open)
              </span>
            )}
          </p>

          <div className="flex flex-col gap-2 overflow-y-auto flex-1">
            {loadingComments ? (
              <div className="flex justify-center pt-6">
                <div className="w-5 h-5 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] pt-2">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className={`bg-[var(--bg-elevated)] border rounded-xl px-3 py-2.5 transition-opacity ${
                    c.resolved
                      ? 'border-[rgba(247,231,206,0.03)] opacity-40'
                      : 'border-[rgba(247,231,206,0.06)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-[var(--gold)] bg-[var(--gold-dim)] px-1.5 py-px rounded">
                          {formatTime(c.timestamp_start)}
                        </span>
                        <span className="text-[10px] text-[var(--text-3)]">{c.author}</span>
                      </div>
                      <p className="text-xs text-[var(--text-2)] leading-relaxed">{c.comment}</p>
                    </div>
                    {!c.resolved && (
                      <button
                        onClick={() => handleResolve(c.id)}
                        title="Resolve"
                        className="shrink-0 mt-0.5 w-5 h-5 rounded-full border border-[rgba(52,211,153,0.3)] text-emerald-400 hover:bg-[rgba(52,211,153,0.1)] flex items-center justify-center transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
