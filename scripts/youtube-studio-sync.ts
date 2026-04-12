import { chromium } from 'playwright-core';
import type { BrowserContext } from 'playwright-core';
import AdmZip from 'adm-zip';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VIDEO_MAP: Record<string, string> = {
  '6dMQ7EyATRU': 'MBM015-CLIP-014',
  'UPyNkTKaraU': 'MBM015-CLIP-004',
  'ZgkpBit9UA0': 'MBM015-CLIP-009',
  'E2Fgd_6BJIE': 'MBM015-CLIP-008',
  '2gKSLs2-Nss': 'MBM015-CLIP-012',
  'DUpRLsIQGmA': 'MBM015-CLIP-011',
  'O9emVLO6n2U': 'MBM015-CLIP-013',
  'VpxBnfeKLi8': 'MBM015-CLIP-007',
  'SU-sXevLe64': 'MBM015-CLIP-010',
  'f1MhMrQswjg': 'MBM015-CLIP-016',
  'wWrk066VHqM': 'MBM015-CLIP-017',
  'fNp7epYo6wA': 'MBM015-CLIP-018',
  'BwN_zCjtAVc': 'MBM015-CLIP-019',
  'a6PHBY2cq5Q': 'MBM015-CLIP-020',
  'BjAdnIfIls4': 'MBM015-CLIP-021',
  'XaQfjuTzdDE': 'MBM015-CLIP-022',
  'a3bRUFpilGI': 'MBM016-CLIP-001',
  'tPsydEmTaOo': 'MBM016-CLIP-006',
  'VH42AvIjbk0': 'MBM016-CLIP-005',
};

export const COLUMN_MAP: Record<string, string> = {
  'Date': 'stat_date',
  'Views': 'views',
  'Watch time (hours)': 'watch_time_hours',
  'Average view duration': 'avg_view_duration_seconds',
  'Average percentage viewed (%)': 'avg_view_percentage',
  'Impressions': 'impressions',
  'Impressions click-through rate (%)': 'impression_ctr',
  'Likes': 'likes',
  'Dislikes': 'dislikes',
  'Comments added': 'comments',
  'Shares': 'shares',
  'Subscribers gained': 'subscribers_gained',
  'Subscribers lost': 'subscribers_lost',
  'Unique viewers': 'unique_viewers',
  'New viewers': 'new_viewers',
  'Returning viewers': 'returning_viewers',
  'Casual viewers': 'casual_viewers',
  'Regular viewers': 'regular_viewers',
};

const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_USER_DATA_DIR = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
const LOG_PATH = path.join(__dirname, '../logs/youtube-studio-sync.log');

// ---------------------------------------------------------------------------
// Logging — ensure logs/ directory exists before opening the write stream
// ---------------------------------------------------------------------------

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ---------------------------------------------------------------------------
// Utilities (exported for testing)
// ---------------------------------------------------------------------------

export function isChromeRunning(): boolean {
  try {
    execSync('pgrep -x "Google Chrome"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function safeNum(val: string | undefined): number | null {
  if (val === undefined || val === '') return null;
  const cleaned = val.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function parseTimeToSeconds(val: string): number | null {
  const trimmed = val.trim();
  const parts = trimmed.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function deriveClipCode(clipDetailsCode: string): string {
  const idx = clipDetailsCode.indexOf('-CLIP-');
  if (idx === -1) {
    log(`WARNING: No -CLIP- found in "${clipDetailsCode}", using full value as clip_code`);
    return clipDetailsCode;
  }
  return clipDetailsCode.slice(0, idx);
}

export function isZipBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[2] === 0x03 &&
    buf[3] === 0x04
  );
}

export function getCSVContent(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  if (isZipBuffer(buf)) {
    const zip = new AdmZip(buf);
    const entries = zip.getEntries().filter(e =>
      e.entryName.toLowerCase().endsWith('.csv'),
    );
    const entry =
      entries.find(e => e.entryName.toLowerCase().includes('chart')) ||
      entries.find(e => e.entryName.toLowerCase().includes('table')) ||
      entries[0];
    if (!entry) throw new Error(`No CSV entry found in ZIP for ${filePath}`);
    return zip.readAsText(entry);
  }
  return buf.toString('utf-8');
}

export function parseCSVRows(
  csvContent: string,
  clipDetailsCode: string,
): Record<string, unknown>[] {
  const lines = csvContent.split('\n');

  // Find the header row (first cell is "Date")
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i].split(',')[0].replace(/"/g, '').trim();
    if (first === 'Date') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx]
    .split(',')
    .map(h => h.replace(/"/g, '').trim());
  const clipCode = deriveClipCode(clipDetailsCode);
  const rows: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(',').map(c => c.replace(/"/g, '').trim());
    const dateVal = cells[0];
    if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) continue;

    const row: Record<string, unknown> = {
      platform: 'youtube',
      content_type: 'short',
      clip_details_code: clipDetailsCode,
      clip_code: clipCode,
    };

    for (let j = 0; j < headers.length; j++) {
      const dbCol = COLUMN_MAP[headers[j]];
      if (!dbCol) continue;
      const val = cells[j];
      if (dbCol === 'stat_date') {
        row[dbCol] = val;
      } else if (dbCol === 'avg_view_duration_seconds') {
        row[dbCol] = parseTimeToSeconds(val);
      } else {
        row[dbCol] = safeNum(val);
      }
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Placeholder stubs — implemented in Task 4 and Task 5
// ---------------------------------------------------------------------------

async function processVideo(
  _context: BrowserContext,
  _videoId: string,
  _clipDetailsCode: string,
  _downloadDir: string,
): Promise<Record<string, unknown>[]> {
  throw new Error('processVideo not yet implemented');
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    log('DRY RUN: VIDEO_MAP entries:');
    for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP)) {
      log(`  ${videoId} → ${clipDetailsCode} (clip_code: ${deriveClipCode(clipDetailsCode)})`);
    }
    log('DRY RUN complete — exiting before Chrome launch');
    logStream.end();
    process.exit(0);
  }

  throw new Error('main() not yet fully implemented — run with --dry-run');
}

// Guard: only invoke main() when this file is run directly (not imported for tests).
// process.argv[1] is the test runner path during `npx tsx --test`, not this file.
if (process.argv[1]?.includes('youtube-studio-sync')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
