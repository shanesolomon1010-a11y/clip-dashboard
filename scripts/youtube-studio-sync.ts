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

export function parseTimeToSeconds(val: string | undefined): number | null {
  if (val === undefined || val === '') return null;
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

function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
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

  const headers = splitCSVLine(lines[headerIdx]);
  const clipCode = deriveClipCode(clipDetailsCode);
  const rows: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCSVLine(line);
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
  context: BrowserContext,
  videoId: string,
  clipDetailsCode: string,
  downloadDir: string,
): Promise<Record<string, unknown>[]> {
  const page = await context.newPage();
  try {
    // Step 1: Navigate
    log(`[${videoId}] Navigating to analytics...`);
    try {
      await page.goto(
        `https://studio.youtube.com/video/${videoId}/analytics/tab-reach/period-28days`,
        { waitUntil: 'networkidle', timeout: 30000 },
      );
    } catch (err) {
      log(`[${videoId}] ERROR: Navigation failed — ${err}`);
      return [];
    }

    // Step 2: Enter Advanced mode
    if (!page.url().includes('/advanced')) {
      const advancedSelectors = [
        'text="Advanced mode"',
        '[aria-label*="advanced" i]',
        'a:has-text("Advanced")',
      ];
      for (const sel of advancedSelectors) {
        try {
          await page.click(sel, { timeout: 3000 });
          break;
        } catch {
          // try next selector
        }
      }
      try {
        await page.waitForURL(/advanced/, { timeout: 5000 });
      } catch {
        await page.waitForTimeout(3000);
      }
      if (!page.url().includes('/advanced')) {
        log(`[${videoId}] WARNING: Could not confirm Advanced mode — continuing anyway but export may be incomplete`);
      }
    }

    // Step 3: Open metrics panel and select all unchecked metrics
    const panelSelectors = [
      'button:has-text("Add metric")',
      '[aria-label*="add metric" i]',
      '[aria-label*="edit metrics" i]',
      'ytcp-button:has-text("Add")',
    ];
    for (const sel of panelSelectors) {
      try {
        await page.click(sel, { timeout: 2000 });
        await page.waitForTimeout(1000);
        break;
      } catch {
        // try next selector
      }
    }

    const checkboxes = await page.$$('input[type="checkbox"]:not(:checked)');
    if (checkboxes.length === 0) {
      log(`[${videoId}] ERROR: 0 unchecked metric checkboxes found — skipping video`);
      return [];
    }
    let clickedCount = 0;
    for (const cb of checkboxes) {
      try {
        await cb.click();
        clickedCount++;
      } catch {
        // checkbox may have disappeared; continue
      }
    }
    log(`[${videoId}] Selected ${clickedCount}/${checkboxes.length} metrics`);
    await page.waitForTimeout(500);

    // Step 4: Date range already set via URL param (period-28days) — no action needed

    // Step 5: Export
    const exportSelectors = [
      'button:has-text("Export")',
      '[aria-label*="export" i]',
      'button:has-text("Download")',
      'ytcp-button:has-text("Export")',
    ];
    let exportSelector: string | null = null;
    for (const sel of exportSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        exportSelector = sel;
        break;
      } catch {
        // try next selector
      }
    }
    if (!exportSelector) {
      log(`[${videoId}] ERROR: Export button not found — skipping video`);
      return [];
    }

    const filePath = path.join(downloadDir, `${videoId}.bin`);
    let download: import('playwright-core').Download;
    try {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.click(exportSelector),
      ]);
    } catch (err) {
      log(`[${videoId}] ERROR: Download failed — ${err}`);
      return [];
    }
    await download.saveAs(filePath);
    log(`[${videoId}] Saved download to ${filePath}`);

    // Step 6-7: Parse ZIP or CSV, then parse rows
    let csvContent: string;
    try {
      csvContent = getCSVContent(filePath);
    } catch (err) {
      log(`[${videoId}] ERROR: Could not extract CSV — ${err}`);
      return [];
    }
    const rows = parseCSVRows(csvContent, clipDetailsCode);
    log(`[${videoId}] Parsed ${rows.length} rows`);
    return rows;

  } catch (err) {
    log(`[${videoId}] ERROR: Unexpected error — ${err}`);
    return [];
  } finally {
    await page.close();
  }
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
if (process.argv[1]?.includes('youtube-studio-sync') && !process.argv[1]?.includes('.test.')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
