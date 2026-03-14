'use client';

import { useCallback, useState } from 'react';
import { parseCSV } from '@/lib/normalizers';
import { UnifiedPost } from '@/types';
import { IconUpload } from './Icons';

interface Props {
  onUpload: (posts: UnifiedPost[]) => void;
}

export default function UploadZone({ onUpload }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setStatus({ type: 'error', msg: 'Please upload a .csv file.' });
        return;
      }
      setProcessing(true);
      setStatus(null);
      parseCSV(
        file,
        (posts) => {
          onUpload(posts);
          setStatus({ type: 'success', msg: `Imported ${posts.length} posts from ${file.name}` });
          setProcessing(false);
        },
        (msg) => {
          setStatus({ type: 'error', msg });
          setProcessing(false);
        }
      );
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-1)]">Import CSV Data</h2>
        <span className="text-[11px] text-[var(--text-2)]">Auto-detects platform from column headers</span>
      </div>

      <label
        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 px-6 cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-sky-400/60 bg-sky-500/[0.08]'
            : 'border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".csv" className="hidden" onChange={onInputChange} />
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
          isDragging ? 'bg-sky-500/20' : 'bg-white/[0.04] border border-white/[0.06]'
        }`}>
          {processing
            ? <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-sky-400 animate-spin" />
            : <IconUpload className={`w-5 h-5 ${isDragging ? 'text-sky-400' : 'text-[var(--text-2)]'}`} />
          }
        </div>
        <div className="text-center">
          <p className="text-[var(--text-1)] font-medium text-sm">
            {processing ? 'Processing…' : 'Drop a CSV export here'}
          </p>
          <p className="text-[var(--text-2)] text-xs mt-1">
            or click to browse your files
          </p>
        </div>
        {!processing && (
          <span className="text-xs text-sky-400 border border-sky-500/25 rounded-lg px-3 py-1.5 hover:bg-sky-500/10 hover:border-sky-500/40 transition-colors font-medium">
            Browse file
          </span>
        )}
      </label>

      {status && (
        <div
          className={`mt-3 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${
            status.type === 'success'
              ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/[0.08] text-red-400 border border-red-500/20'
          }`}
        >
          <span className="text-base leading-none">{status.type === 'success' ? '✓' : '✕'}</span>
          {status.msg}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        {(
          [
            { label: 'TikTok',    cols: 'Video views, Likes, Comments, Shares', color: '#FF0050' },
            { label: 'Instagram', cols: 'Impressions, Likes, Comments, Saves',  color: '#E1306C' },
            { label: 'LinkedIn',  cols: 'Impressions, Reactions, Comments',     color: '#0A66C2' },
            { label: 'X/Twitter', cols: 'Impressions, Likes, Reposts',          color: '#1DA1F2' },
            { label: 'YouTube',   cols: 'Views, Likes, Comments',               color: '#FF0000' },
          ] as const
        ).map(({ label, cols, color }) => (
          <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-2.5 text-xs hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[var(--text-1)] font-semibold">{label}</span>
            </div>
            <p className="text-[var(--text-2)] leading-relaxed">{cols}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
