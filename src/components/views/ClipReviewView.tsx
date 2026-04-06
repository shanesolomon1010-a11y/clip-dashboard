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
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const scrubberRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isDraggingTimelineRef = useRef(false);

  const [clipDetailVideoUrl, setClipDetailVideoUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<ClipVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<ClipVersion | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'compressing' | 'uploading' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [commentMode, setCommentMode] = useState<'point' | 'range'>('point');
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

  const videoUrl = activeVersion?.video_url ?? clipDetailVideoUrl;
  const proxySrc = videoUrl ? `/api/video-proxy?url=${encodeURIComponent(videoUrl)}` : null;

  useEffect(() => {
    setLoadingVersions(true);
    setClipDetailVideoUrl(null);
    setActiveVersion(null);
    setComments([]);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    supabase
      .from('clip_details')
      .select('video_url')
      .eq('clip_details_code', clipDetailsCode)
      .maybeSingle()
      .then(({ data }) => {
        console.log('clip_details row:', data);
        setClipDetailVideoUrl((data?.video_url as string | null) ?? null);
      });

    getClipVersions(clipDetailsCode)
      .then((v) => {
        setVersions(v);
        if (v.length > 0) setActiveVersion(v[v.length - 1]);
      })
      .catch(() => {})
      .finally(() => setLoadingVersions(false));
  }, [clipDetailsCode]);

  const loadComments = useCallback((versionId: string) => {
    setLoadingComments(true);
    getReviewComments(clipDetailsCode, versionId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [clipDetailsCode]);

  useEffect(() => {
    if (activeVersion) loadComments(activeVersion.id);
  }, [activeVersion, loadComments]);

  const handleAddComment = async () => {
    console.log('handleAddComment fired', { commentText, commentMode, rangeStart, rangeEnd, activeVersionId: activeVersion?.id, clipDetailVideoUrl });
    if (!commentText.trim()) {
      console.log('No comment text, returning');
      return;
    }

    let timestampStart: number;
    let timestampEnd: number | null = null;

    if (commentMode === 'range' && rangeStart !== null && rangeEnd !== null) {
      timestampStart = Math.min(rangeStart, rangeEnd);
      timestampEnd = Math.max(rangeStart, rangeEnd);
    } else {
      timestampStart = videoRef.current?.currentTime ?? 0;
    }

    console.log('Submitting comment:', { timestampStart, timestampEnd });
    setSubmitting(true);

    try {
      let versionId = activeVersion?.id ?? null;

      if (!versionId && clipDetailVideoUrl) {
        console.log('No version — creating v1 from clip_details.video_url');
        await addClipVersion(clipDetailsCode, clipDetailVideoUrl, 1);
        const created = await getClipVersions(clipDetailsCode);
        const newVersion = created[0];
        setVersions(created);
        setActiveVersion(newVersion);
        versionId = newVersion?.id ?? null;
      }

      if (!versionId) {
        console.log('Still no version ID — aborting');
        return;
      }

      await addReviewComment({
        clip_details_code: clipDetailsCode,
        version_id: versionId,
        timestamp_start: timestampStart,
        timestamp_end: timestampEnd,
        comment: commentText.trim(),
      });

      console.log('Comment added successfully');
      setCommentText('');
      setRangeStart(null);
      setRangeEnd(null);
      loadComments(versionId);
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (id: string, currentlyResolved: boolean) => {
    if (currentlyResolved) {
      await supabase.from('review_comments').update({ resolved: false }).eq('id', id);
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: false } : c)));
    } else {
      await resolveComment(id);
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: true } : c)));
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      if (scrubberRef.current) scrubberRef.current.value = time.toString();
    }
  };

  const getTimeFromX = (clientX: number): number => {
    if (!timelineRef.current || !duration) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
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
        setScanResult(`${json.inserted} inserted, ${json.skipped} skipped`);
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
      setUploadPhase('compressing');
      setUploadProgress(0);
      if (!ffmpegRef.current) ffmpegRef.current = new FFmpeg();
      const ff = ffmpegRef.current;
      if (!ff.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ff.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }
      ff.on('progress', ({ progress }: { progress: number }) => {
        setUploadProgress(Math.round(progress * 100));
      });
      await ff.writeFile('input.mp4', await fetchFile(file));
      await ff.exec(['-i', 'input.mp4', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2', '-crf', '28', '-preset', 'fast', '-movflags', '+faststart', 'output.mp4']);
      const compressed = await ff.readFile('output.mp4');
      const raw = compressed as Uint8Array;
      const plain = new Uint8Array(raw.byteLength);
      plain.set(raw);
      const blob = new Blob([plain], { type: 'video/mp4' });
      await ff.deleteFile('input.mp4');
      await ff.deleteFile('output.mp4');
      setUploadPhase('uploading');
      setUploadProgress(0);
      const nextVersion = versions.length + 1;
      const path = `${clipDetailsCode}-v${nextVersion}.mp4`;
      const { error: uploadError } = await supabase.storage.from('Clips').upload(path, blob, { upsert: true, contentType: 'video/mp4' });
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
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeComments = comments.filter((c) => !c.resolved);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[rgba(247,231,206,0.06)] shrink-0">
        {/* Version tabs */}
        <div className="flex items-center gap-1">
          {versions.length === 0 ? (
            <span className="text-[11px] text-[var(--text-3)]">No versions</span>
          ) : (
            versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveVersion(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  activeVersion?.id === v.id
                    ? 'bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)] border border-transparent hover:border-[rgba(247,231,206,0.08)]'
                }`}
              >
                v{v.version_number}
              </button>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {scanResult && (
            <span className="text-[10px] text-[var(--text-3)] max-w-[160px] truncate" title={scanResult}>
              {scanResult}
            </span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] border border-transparent hover:border-[rgba(247,231,206,0.08)] transition-colors disabled:opacity-40"
          >
            {scanning
              ? <div className="w-2.5 h-2.5 border border-[var(--text-3)] border-t-transparent rounded-full animate-spin" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
            }
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhase !== null}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] border border-[rgba(247,231,206,0.08)] hover:border-[rgba(247,231,206,0.16)] transition-colors disabled:opacity-40 min-w-[76px]"
          >
            {uploadPhase ? (
              <>
                <div className="w-2.5 h-2.5 border border-[var(--text-3)] border-t-transparent rounded-full animate-spin shrink-0" />
                {uploadPhase === 'compressing' ? `${uploadProgress}%` : 'Uploading…'}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                Upload
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main panels ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: video + controls */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-6 py-5 gap-3">

          {/* Video — centered, max 70vh, 9:16 */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            {proxySrc ? (
              <video
                ref={videoRef}
                key={videoUrl!}
                src={proxySrc}
                muted={isMuted}
                onTimeUpdate={() => {
                  const t = videoRef.current?.currentTime ?? 0;
                  setCurrentTime(t);
                  if (scrubberRef.current) scrubberRef.current.value = t.toString();
                }}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="rounded-xl bg-black object-contain"
                style={{ maxHeight: '70vh', aspectRatio: '9/16', width: 'auto', maxWidth: '100%', pointerEvents: 'auto' }}
              />
            ) : (
              <div
                className="rounded-xl bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] flex items-center justify-center"
                style={{ maxHeight: '70vh', aspectRatio: '9/16', width: 'auto', minWidth: '180px' }}
              >
                <p className="text-xs text-[var(--text-3)]">No video yet</p>
              </div>
            )}
          </div>

          {/* Player bar */}
          {proxySrc && (
            <div className="w-full shrink-0 flex items-center gap-3 px-1">
              <button
                onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.08)] flex items-center justify-center hover:border-[var(--gold-border)] transition-colors"
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[var(--text-2)]">
                    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[var(--text-2)]">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>
              <span className="text-[10px] font-mono text-[var(--text-3)] shrink-0 w-9 text-right">{formatTime(currentTime)}</span>
              <input
                ref={scrubberRef}
                type="range"
                min={0}
                max={duration}
                step={0.01}
                defaultValue={0}
                onInput={() => {
                  if (videoRef.current && scrubberRef.current) {
                    videoRef.current.currentTime = parseFloat(scrubberRef.current.value);
                  }
                }}
                className="flex-1 accent-[var(--gold)] h-1 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-[var(--text-3)] shrink-0 w-9">{formatTime(duration)}</span>
              <button
                onClick={() => { if (videoRef.current) { videoRef.current.muted = !isMuted; setIsMuted(!isMuted); } }}
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.08)] flex items-center justify-center hover:border-[var(--gold-border)] transition-colors"
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[var(--text-3)]">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[var(--text-2)]">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* Timeline: comment dots/bars + range selection drag area */}
          {proxySrc && (
            <div
              ref={timelineRef}
              className={`w-full shrink-0 relative h-5 select-none ${commentMode === 'range' ? 'cursor-crosshair' : 'cursor-default'}`}
              onMouseDown={(e) => {
                if (commentMode !== 'range') return;
                const t = getTimeFromX(e.clientX);
                setRangeStart(t);
                setRangeEnd(t);
                isDraggingTimelineRef.current = true;
              }}
              onMouseMove={(e) => {
                if (!isDraggingTimelineRef.current) return;
                setRangeEnd(getTimeFromX(e.clientX));
              }}
              onMouseUp={(e) => {
                if (!isDraggingTimelineRef.current) return;
                setRangeEnd(getTimeFromX(e.clientX));
                isDraggingTimelineRef.current = false;
              }}
              onMouseLeave={() => { isDraggingTimelineRef.current = false; }}
            >
              {/* Track */}
              <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-[rgba(247,231,206,0.08)] rounded-full" />

              {/* Range selection highlight */}
              {commentMode === 'range' && rangeStart !== null && rangeEnd !== null && duration > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-1 bg-[var(--gold)] opacity-50 rounded-full pointer-events-none"
                  style={{
                    left: `${(Math.min(rangeStart, rangeEnd) / duration) * 100}%`,
                    width: `${(Math.abs(rangeEnd - rangeStart) / duration) * 100}%`,
                  }}
                />
              )}

              {/* Comment markers */}
              {duration > 0 && activeComments.map((c) => {
                const startPct = (c.timestamp_start / duration) * 100;
                const isHighlighted = highlightedCommentId === c.id;

                if (c.timestamp_end != null) {
                  const endPct = (c.timestamp_end / duration) * 100;
                  return (
                    <div
                      key={c.id}
                      className={`absolute top-1/2 -translate-y-1/2 h-2 rounded-full cursor-pointer transition-colors ${isHighlighted ? 'bg-[var(--gold)]' : 'bg-[rgba(247,231,206,0.45)] hover:bg-[rgba(247,231,206,0.7)]'}`}
                      style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0.5)}%` }}
                      onClick={() => seekTo(c.timestamp_start)}
                    />
                  );
                }

                return (
                  <div
                    key={c.id}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full cursor-pointer transition-colors ${isHighlighted ? 'bg-[var(--gold)]' : 'bg-white/60 hover:bg-white'}`}
                    style={{ left: `${startPct}%` }}
                    onClick={() => seekTo(c.timestamp_start)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Right: comments */}
        <div className="w-80 shrink-0 flex flex-col border-l border-[rgba(247,231,206,0.06)] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[rgba(247,231,206,0.06)] shrink-0 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-2)] uppercase tracking-widest">Comments</span>
            {activeComments.length > 0 && (
              <span className="text-[10px] text-[var(--text-3)]">{activeComments.length} open</span>
            )}
          </div>

          {/* Scrollable comment list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {loadingComments ? (
              <div className="flex justify-center pt-6">
                <div className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-[11px] text-[var(--text-3)] pt-2">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div
                  id={`comment-${c.id}`}
                  key={c.id}
                  className={`bg-[var(--bg-elevated)] border rounded-xl px-3 py-2.5 transition-all ${
                    highlightedCommentId === c.id
                      ? 'border-[var(--gold-border)] shadow-[0_0_0_1px_var(--gold-border)]'
                      : 'border-[rgba(247,231,206,0.06)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => { seekTo(c.timestamp_start); setHighlightedCommentId(c.id); }}
                          className="text-[10px] font-mono text-[var(--gold)] bg-[var(--gold-dim)] px-1.5 py-px rounded hover:brightness-110 transition-all"
                        >
                          {c.timestamp_end != null
                            ? `${formatTime(c.timestamp_start)} → ${formatTime(c.timestamp_end)}`
                            : formatTime(c.timestamp_start)}
                        </button>
                        <span className="text-[10px] text-[var(--text-3)]">{c.author}</span>
                        {c.resolved && (
                          <span className="text-[9px] font-semibold text-emerald-400 bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] px-1.5 py-px rounded-full">Resolved</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{c.comment}</p>
                    </div>
                    <button
                      onClick={() => handleResolve(c.id, c.resolved)}
                      title={c.resolved ? 'Mark unresolved' : 'Resolve'}
                      className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        c.resolved
                          ? 'border-[rgba(52,211,153,0.5)] bg-[rgba(52,211,153,0.15)] text-emerald-400 hover:bg-[rgba(52,211,153,0.05)]'
                          : 'border-[rgba(52,211,153,0.3)] text-emerald-400 hover:bg-[rgba(52,211,153,0.1)]'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          <div className="px-3 py-3 border-t border-[rgba(247,231,206,0.06)] shrink-0 flex flex-col gap-2">
            {/* Mode toggle */}
            <div className="flex items-center gap-1">
              {(['point', 'range'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setCommentMode(mode); setRangeStart(null); setRangeEnd(null); }}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all capitalize ${
                    commentMode === mode
                      ? 'bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]'
                      : 'text-[var(--text-3)] border border-transparent hover:border-[rgba(247,231,206,0.08)]'
                  }`}
                >
                  {mode === 'point' ? 'Point' : 'Range'}
                </button>
              ))}
              {commentMode === 'range' && rangeStart !== null && rangeEnd !== null && (
                <span className="ml-auto text-[10px] font-mono text-[var(--text-3)]">
                  {formatTime(Math.min(rangeStart, rangeEnd))} → {formatTime(Math.max(rangeStart, rangeEnd))}
                </span>
              )}
            </div>

            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
              placeholder={commentMode === 'range' ? 'Drag timeline to select range, then comment…' : 'Comment at current time…'}
              disabled={submitting}
              rows={2}
              className="w-full bg-[var(--bg-base)] border border-[rgba(247,231,206,0.06)] rounded-lg px-3 py-2 text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] disabled:opacity-40 transition-colors resize-none"
            />
            <button
              type="button"
              onClick={handleAddComment}
              disabled={!commentText.trim() || submitting}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)] hover:bg-[rgba(212,146,42,0.12)] disabled:opacity-40 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
