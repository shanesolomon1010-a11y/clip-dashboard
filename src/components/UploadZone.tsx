'use client';

import { useCallback, useState } from 'react';
import { parseCSV } from '@/lib/normalizers';
import { UnifiedPost } from '@/types';

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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">Import CSV Data</h2>
      <label
        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 px-6 cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".csv" className="hidden" onChange={onInputChange} />
        <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-2xl">
          {processing ? '⏳' : '📂'}
        </div>
        <div className="text-center">
          <p className="text-gray-300 font-medium">
            {processing ? 'Processing…' : 'Drop a CSV export here'}
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Supports TikTok, Instagram, LinkedIn, X/Twitter, YouTube — auto-detected from column headers
          </p>
        </div>
        {!processing && (
          <span className="text-xs text-indigo-400 border border-indigo-500/40 rounded-md px-3 py-1 hover:bg-indigo-500/10 transition-colors">
            Browse file
          </span>
        )}
      </label>

      {status && (
        <div
          className={`mt-3 rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${
            status.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          <span>{status.type === 'success' ? '✓' : '✕'}</span>
          {status.msg}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        {(
          [
            { label: 'TikTok', cols: 'Video views, Likes, Comments, Shares', color: '#FF0050' },
            { label: 'Instagram', cols: 'Impressions, Likes, Comments, Saves', color: '#E1306C' },
            { label: 'LinkedIn', cols: 'Impressions, Reactions, Comments, Reposts', color: '#0A66C2' },
            { label: 'X/Twitter', cols: 'impressions, likes, replies, reposts', color: '#1DA1F2' },
            { label: 'YouTube', cols: 'Views, Likes, Comments', color: '#FF0000' },
          ] as const
        ).map(({ label, cols, color }) => (
          <div key={label} className="bg-gray-800/60 rounded-lg p-2.5 text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-gray-300 font-semibold">{label}</span>
            </div>
            <p className="text-gray-600 leading-relaxed">{cols}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
