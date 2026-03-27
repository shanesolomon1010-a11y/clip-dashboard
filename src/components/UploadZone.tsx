'use client';

import { useCallback, useState } from 'react';
import { parseCSV, parseCSVPreview } from '@/lib/normalizers';
import { Platform, UnifiedPost } from '@/types';
import { IconUpload } from './Icons';

type Step = 'platform' | 'file' | 'preview';

interface Preview {
  headers: string[];
  rows: Record<string, string>[];
}

const EXPECTED_COLUMNS: Record<Platform, string> = {
  youtube: 'clip_code, title, content_type, posted_at, url, views, watch_time_minutes, avg_view_duration_seconds, avg_view_percentage, impressions, impression_ctr, likes, dislikes, comments, shares, subscribers_gained, subscribers_lost, card_clicks, card_ctr, end_screen_clicks, end_screen_ctr',
  instagram: 'clip_code, title, content_type, posted_at, url, plays, reach, impressions, likes, comments, shares, saves, profile_visits, follows, accounts_reached, accounts_engaged, engagement_rate',
};

interface Props {
  onUpload: (posts: UnifiedPost[]) => void;
}

export default function UploadZone({ onUpload }: Props) {
  const [step, setStep] = useState<Step>('platform');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handlePlatformSelect = (p: Platform) => {
    setPlatform(p);
    setStatus(null);
    setStep('file');
  };

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setStatus({ type: 'error', msg: 'Please upload a .csv file.' });
      return;
    }
    setProcessing(true);
    setStatus(null);
    parseCSVPreview(
      file,
      (headers, rows) => {
        setPendingFile(file);
        setPreview({ headers, rows });
        setStep('preview');
        setProcessing(false);
      },
      (msg) => {
        setStatus({ type: 'error', msg });
        setProcessing(false);
      }
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (!pendingFile || !platform) return;
    setProcessing(true);
    parseCSV(
      pendingFile,
      platform,
      (posts) => {
        onUpload(posts);
        setStatus({ type: 'success', msg: `Imported ${posts.length} posts` });
        setProcessing(false);
        setPendingFile(null);
        setPreview(null);
        setStep('file');
      },
      (msg) => {
        setStatus({ type: 'error', msg });
        setProcessing(false);
      }
    );
  }, [pendingFile, platform, onUpload]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.05)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--text-1)]">Import CSV Data</h2>
        {platform && step !== 'platform' && (
          <button
            onClick={() => { setStep('platform'); setPlatform(null); setStatus(null); setPreview(null); setPendingFile(null); }}
            className="text-[11px] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
          >
            ← Change platform
          </button>
        )}
      </div>

      {/* Step 1: Platform selector */}
      {step === 'platform' && (
        <div>
          <p className="text-xs text-[var(--text-2)] mb-3">Select the platform you&apos;re importing data for:</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { p: 'youtube' as Platform, label: 'YouTube', color: '#FF4444' },
              { p: 'instagram' as Platform, label: 'Instagram', color: '#C855E8' },
            ]).map(({ p, label, color }) => (
              <button
                key={p}
                onClick={() => handlePlatformSelect(p)}
                className="bg-[rgba(247,231,206,0.02)] border border-[rgba(247,231,206,0.08)] rounded-xl p-4 text-left hover:bg-[rgba(247,231,206,0.05)] hover:border-[rgba(247,231,206,0.15)] transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-semibold text-[var(--text-1)]">{label}</span>
                </div>
                <p className="text-[11px] text-[var(--text-2)]">Import {label} analytics</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: File upload with expected columns hint */}
      {step === 'file' && platform && (
        <>
          <div className="mb-3 bg-[rgba(247,231,206,0.02)] border border-[rgba(247,231,206,0.06)] rounded-xl p-3">
            <p className="text-[11px] font-semibold text-[var(--text-2)] mb-1.5">Expected columns</p>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed font-mono break-all">{EXPECTED_COLUMNS[platform]}</p>
          </div>

          <label
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 px-6 cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-[var(--gold-border)] bg-[var(--gold-dim)]'
                : 'border-[rgba(247,231,206,0.08)] hover:border-[rgba(247,231,206,0.15)] hover:bg-[rgba(247,231,206,0.02)]'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept=".csv" className="hidden" onChange={onInputChange} />
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              isDragging ? 'bg-[var(--gold-dim)] border border-[var(--gold-border)]' : 'bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.06)]'
            }`}>
              {processing
                ? <div className="w-5 h-5 rounded-full border-2 border-[rgba(247,231,206,0.20)] border-t-[var(--gold)] animate-spin" />
                : <IconUpload className={`w-5 h-5 ${isDragging ? 'text-[var(--gold)]' : 'text-[var(--text-2)]'}`} />
              }
            </div>
            <div className="text-center">
              <p className="text-[var(--text-1)] font-medium text-sm">
                {processing ? 'Processing…' : 'Drop a CSV export here'}
              </p>
              <p className="text-[var(--text-2)] text-xs mt-1">or click to browse your files</p>
            </div>
            {!processing && (
              <span className="text-xs text-[var(--gold)] border border-[var(--gold-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--gold-dim)] transition-colors font-medium">
                Browse file
              </span>
            )}
          </label>

          {status && (
            <div className={`mt-3 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${
              status.type === 'success'
                ? 'bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]'
                : 'bg-[rgba(247,231,206,0.06)] text-[var(--text-2)] border border-[rgba(247,231,206,0.12)]'
            }`}>
              <span className="text-base leading-none">{status.type === 'success' ? '✓' : '✕'}</span>
              {status.msg}
            </div>
          )}
        </>
      )}

      {/* Step 3: Preview first 3 rows */}
      {step === 'preview' && preview && (
        <div>
          <p className="text-xs text-[var(--text-2)] mb-3">Preview — first {preview.rows.length} row{preview.rows.length !== 1 ? 's' : ''}</p>
          <div className="overflow-x-auto rounded-xl border border-[rgba(247,231,206,0.08)] mb-3">
            <table className="text-[10px] w-full min-w-max">
              <thead>
                <tr className="border-b border-[rgba(247,231,206,0.06)] bg-[rgba(247,231,206,0.02)]">
                  {preview.headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[var(--text-2)] font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[rgba(247,231,206,0.04)] last:border-0">
                    {preview.headers.map((h) => (
                      <td key={h} className="px-3 py-2 text-[var(--text-1)] whitespace-nowrap max-w-[160px] truncate">{row[h] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setPreview(null); setPendingFile(null); setStep('file'); }}
              className="flex-1 text-xs py-2 rounded-xl border border-[rgba(247,231,206,0.10)] text-[var(--text-2)] hover:bg-[rgba(247,231,206,0.04)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={processing}
              className="flex-1 text-xs py-2 rounded-xl bg-[var(--gold-dim)] border border-[var(--gold-border)] text-[var(--gold)] font-semibold hover:bg-[rgba(247,197,80,0.15)] transition-colors disabled:opacity-50"
            >
              {processing ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
