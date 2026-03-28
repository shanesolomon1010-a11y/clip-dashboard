'use client';

import { useRef, useState } from 'react';
import Papa from 'papaparse';

interface ChartRow {
  Date: string;
  Content: string;
  'Video title': string;
  'Video publish time': string;
  Duration: string;
  'Engaged views': string;
}

interface TableRow {
  Content: string;
  'Video title': string;
  'Video publish time': string;
  Duration: string;
  Views: string;
  'Engaged views'?: string;
  'Watch time (hours)': string;
  'Average view duration': string;
  'Average percentage viewed (%)': string;
  Impressions: string;
  'Impressions click-through rate (%)': string;
  Likes: string;
  'Comments added': string;
  Shares: string;
  'Subscribers gained': string;
  'Subscribers lost': string;
  'YouTube Premium views': string;
  'Unique viewers': string;
}

function parseCSV<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => resolve(result.data),
      error: err => reject(err),
    });
  });
}

function buildCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function YouTubeMergerTab() {
  const [clipId, setClipId] = useState('');
  const [chartFile, setChartFile] = useState<File | null>(null);
  const [totalsFile, setTotalsFile] = useState<File | null>(null);
  const [tableFile, setTableFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  const chartRef = useRef<HTMLInputElement>(null);
  const totalsRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    if (!chartFile || !tableFile || !clipId.trim()) {
      setStatus({ type: 'error', message: 'Please provide both CSV files and a Clip ID.' });
      return;
    }
    setProcessing(true);
    setStatus(null);
    try {
      const [chartRows, tableRows] = await Promise.all([
        parseCSV<ChartRow>(chartFile),
        parseCSV<TableRow>(tableFile),
      ]);

      // Build lookup from Content → TableRow (skip "Total" row)
      const tableMap = new Map<string, TableRow>();
      for (const row of tableRows) {
        if (row.Content?.toLowerCase() === 'total') continue;
        tableMap.set(row.Content, row);
      }

      // Group chart rows by Content: track most-recent date row and sum engaged views
      const chartByContent = new Map<string, { latestRow: ChartRow; totalEngaged: number }>();
      for (const chart of chartRows) {
        const contentId = chart.Content;
        const existing = chartByContent.get(contentId);
        const engagedViews = Number(chart['Engaged views']) || 0;
        if (!existing) {
          chartByContent.set(contentId, { latestRow: chart, totalEngaged: engagedViews });
        } else {
          const isNewer = new Date(chart.Date) > new Date(existing.latestRow.Date);
          chartByContent.set(contentId, {
            latestRow: isNewer ? chart : existing.latestRow,
            totalEngaged: existing.totalEngaged + engagedViews,
          });
        }
      }

      const outputRows = Array.from(chartByContent.values()).map(({ latestRow: chart, totalEngaged }) => {
        const table = tableMap.get(chart.Content) ?? {} as TableRow;
        return {
          clip_id:                    clipId.trim(),
          date:                       chart.Date ?? '',
          content_id:                 chart.Content ?? '',
          video_title:                chart['Video title'] ?? '',
          video_publish_time:         chart['Video publish time'] ?? '',
          duration_seconds:           chart.Duration ?? '',
          daily_engaged_views:        String(totalEngaged),
          total_engaged_views:        table['Engaged views'] ?? '',
          total_views:                table.Views ?? '',
          watch_time_hours:           table['Watch time (hours)'] ?? '',
          average_view_duration:      table['Average view duration'] ?? '',
          average_percentage_viewed:  table['Average percentage viewed (%)'] ?? '',
          impressions:                table.Impressions ?? '',
          impressions_ctr:            table['Impressions click-through rate (%)'] ?? '',
          unique_viewers:             table['Unique viewers'] ?? '',
          likes:                      table.Likes ?? '',
          comments:                   table['Comments added'] ?? '',
          shares:                     table.Shares ?? '',
          subscribers_gained:         table['Subscribers gained'] ?? '',
          subscribers_lost:           table['Subscribers lost'] ?? '',
          youtube_premium_views:      table['YouTube Premium views'] ?? '',
          platform:                   'YouTube',
        };
      });

      const csv = buildCSV(outputRows);
      downloadCSV(csv, `${clipId.trim()}-youtube-merged.csv`);
      setStatus({ type: 'success', message: `Generated ${outputRows.length} rows.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setStatus({ type: 'error', message: msg });
    } finally {
      setProcessing(false);
    }
  }

  const inputClass = 'w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]';
  const labelClass = 'text-[11px] text-[var(--text-3)]';

  return (
    <div className="max-w-lg space-y-5">
      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)]">
          <h3 className="text-[13px] font-semibold text-[var(--text-1)]">YouTube CSV Merger</h3>
          <p className="text-[11px] text-[var(--text-3)] mt-1">
            Merge Chart data and Table data exports into one import-ready CSV.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Clip ID */}
          <div className="space-y-1">
            <label className={labelClass}>Clip ID</label>
            <input
              type="text"
              placeholder="e.g. MBM015-CLIP-004"
              value={clipId}
              onChange={e => setClipId(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Chart data file */}
          <div className="space-y-1">
            <label className={labelClass}>Chart data CSV <span className="text-[var(--text-3)] font-normal">(Chart_data.csv)</span></label>
            <div
              className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl cursor-pointer hover:border-[var(--gold-border)] transition-colors"
              onClick={() => chartRef.current?.click()}
            >
              <span className="text-xs text-[var(--text-3)] flex-1 truncate">
                {chartFile ? chartFile.name : 'Choose file…'}
              </span>
              <span className="text-[10px] font-semibold text-[var(--text-3)] bg-[rgba(247,231,206,0.06)] px-2 py-0.5 rounded-lg">Browse</span>
            </div>
            <input
              ref={chartRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => setChartFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Totals file (accepted but not used) */}
          <div className="space-y-1">
            <label className={labelClass}>Totals CSV <span className="text-[var(--text-3)] font-normal">(Totals.csv)</span></label>
            <div
              className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl cursor-pointer hover:border-[var(--gold-border)] transition-colors"
              onClick={() => totalsRef.current?.click()}
            >
              <span className="text-xs text-[var(--text-3)] flex-1 truncate">
                {totalsFile ? totalsFile.name : 'Choose file…'}
              </span>
              <span className="text-[10px] font-semibold text-[var(--text-3)] bg-[rgba(247,231,206,0.06)] px-2 py-0.5 rounded-lg">Browse</span>
            </div>
            <input
              ref={totalsRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => setTotalsFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Table data file */}
          <div className="space-y-1">
            <label className={labelClass}>Table data CSV <span className="text-[var(--text-3)] font-normal">(Table_data.csv)</span></label>
            <div
              className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl cursor-pointer hover:border-[var(--gold-border)] transition-colors"
              onClick={() => tableRef.current?.click()}
            >
              <span className="text-xs text-[var(--text-3)] flex-1 truncate">
                {tableFile ? tableFile.name : 'Choose file…'}
              </span>
              <span className="text-[10px] font-semibold text-[var(--text-3)] bg-[rgba(247,231,206,0.06)] px-2 py-0.5 rounded-lg">Browse</span>
            </div>
            <input
              ref={tableRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => setTableFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {status && (
            <p className={['text-xs', status.type === 'success' ? 'text-green-400' : 'text-red-400'].join(' ')}>
              {status.message}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={processing || !clipId.trim() || !chartFile || !tableFile}
            className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing…' : 'Generate CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}
