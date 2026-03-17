'use client';

import { useState } from 'react';
import TranscriptionUploader from '@/components/ScriptAnalyzer/TranscriptionUploader';

export default function TranscriberView() {
  const [transcript, setTranscript] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-1)] tracking-tight">Transcriber</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          Upload a video or audio file to get a text transcript via AssemblyAI.
        </p>
      </div>

      {/* Uploader */}
      <TranscriptionUploader onTranscriptReady={(text) => setTranscript(text)} />

      {/* Transcript output */}
      {transcript && (
        <div className="bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(247,231,206,0.05)]">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-1)]">Transcript</h2>
              <p className="text-[11px] text-[var(--text-3)] mt-0.5">{transcript.split(/\s+/).filter(Boolean).length} words</p>
            </div>
            <button
              onClick={copy}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[rgba(247,231,206,0.06)] border border-[rgba(247,231,206,0.08)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="px-5 py-4">
            <p className="text-[13px] text-[var(--text-1)] leading-relaxed whitespace-pre-wrap">{transcript}</p>
          </div>
        </div>
      )}
    </div>
  );
}
