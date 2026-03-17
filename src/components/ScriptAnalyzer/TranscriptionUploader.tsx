'use client';

import { useRef, useState } from 'react';
import { transcribeAudio } from '@/lib/transcribe';

interface Props {
  onTranscriptReady: (text: string) => void;
}

const ACCEPTED = '.mp4,.mp3,.mov,.wav,.m4a';

export default function TranscriptionUploader({ onTranscriptReady }: Props) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'transcribing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus('transcribing');
    setErrorMsg('');
    try {
      const text = await transcribeAudio(file);
      onTranscriptReady(text);
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMsg('Transcription failed. Check your AssemblyAI key and try again.');
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => status !== 'transcribing' && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-6 py-8 cursor-pointer transition-all ${
        dragging
          ? 'border-[var(--gold)] bg-[var(--gold-dim)]'
          : 'border-white/[0.10] bg-[var(--bg-elevated)] hover:border-white/20'
      } ${status === 'transcribing' ? 'cursor-default' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onInputChange}
      />

      {status === 'transcribing' && (
        <>
          <span className="w-5 h-5 border-2 border-white/20 border-t-[var(--gold)] rounded-full animate-spin" />
          <p className="text-[13px] text-[var(--text-2)] font-medium">Transcribing audio…</p>
        </>
      )}

      {status === 'done' && (
        <>
          <span className="text-lg">✓</span>
          <p className="text-[13px] text-emerald-400 font-medium">Transcript ready — script auto-filled below</p>
          <p className="text-[11px] text-[var(--text-3)]">Click to upload a different file</p>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="text-[13px] text-red-400 font-medium">{errorMsg}</p>
          <p className="text-[11px] text-[var(--text-3)]">Click to try again</p>
        </>
      )}

      {status === 'idle' && (
        <>
          <svg className="w-6 h-6 text-[var(--text-3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-[13px] text-[var(--text-2)] font-medium">
            Drag & drop or click to upload
          </p>
          <p className="text-[11px] text-[var(--text-3)]">
            Upload a video or audio file to auto-generate the script
          </p>
          <p className="text-[10px] text-[var(--text-3)] mt-1">
            MP4 · MP3 · MOV · WAV · M4A
          </p>
        </>
      )}
    </div>
  );
}
