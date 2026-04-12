import { chromium } from 'playwright-core';
import type { BrowserContext } from 'playwright-core';
import AdmZip from 'adm-zip';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as readline from 'readline';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

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

const CHROME_AUTOMATION_PROFILE = path.join(__dirname, '../.chrome-automation-profile');
const LOG_PATH = path.join(__dirname, '../logs/youtube-studio-sync.log');

const CHANNEL_ANALYTICS_URL =
  'https://studio.youtube.com/channel/UC-Ly0V7fa_9TaF3WXvsroZA/analytics/tab-overview/period-default/explore' +
  '?entity_type=CHANNEL&entity_id=UC-Ly0V7fa_9TaF3WXvsroZA' +
  '&ur_dimensions=CREATOR_CONTENT_TYPE&ur_values=%27SHORTS%27&ur_inclusive_starts=&ur_exclusive_ends=' +
  '&time_period=4_weeks&explore_type=TABLE_AND_CHART&metric=ENGAGED_VIEWS&granularity=DAY' +
  '&t_metrics=ENGAGED_VIEWS&t_metrics=AVERAGE_WATCH_TIME&t_metrics=AVERAGE_WATCH_PERCENTAGE' +
  '&t_metrics=VIDEO_COUNT_NEW&t_metrics=VIDEO_COUNT_FIRST_PUBLISHED&t_metrics=SHORTS_FEED_IMPRESSIONS_VTR' +
  '&t_metrics=ESTIMATED_UNIQUE_VIEWERS&t_metrics=AVERAGE_VIEWS_PER_VIEWER' +
  '&t_metrics=RECENT_VIEWERS&t_metrics=OCCASIONAL_VIEWERS&t_metrics=FREQUENT_VIEWERS&t_metrics=RETURNING_VIEWERS' +
  '&t_metrics=HYPES&t_metrics=HYPE_POINTS&t_metrics=SUBSCRIBERS_GAINED&t_metrics=SUBSCRIBERS_LOST' +
  '&t_metrics=RATINGS_LIKES&t_metrics=COMMENTS&t_metrics=SHARINGS' +
  '&t_metrics=LIKES_PER_LIKES_PLUS_DISLIKES_PERCENT&t_metrics=RATINGS_DISLIKES' +
  '&t_metrics=POST_IMPRESSIONS&t_metrics=POST_LIKES&t_metrics=POST_LIKES_PER_IMPRESSIONS' +
  '&t_metrics=POST_VOTES&t_metrics=POST_VOTES_PER_IMPRESSIONS&t_metrics=POST_SUBSCRIBERS_NET_CHANGE' +
  '&t_metrics=SHORTS_REMIX_COUNT&t_metrics=SHORTS_REMIX_VIEWS' +
  '&t_metrics=CLIP_VIDEO_WATCHTIME&t_metrics=CLIP_VIEWS' +
  '&t_metrics=EXTERNAL_VIEWS&t_metrics=EXTERNAL_WATCH_TIME&t_metrics=SUBSCRIBERS_NET_CHANGE' +
  '&t_metrics=TOTAL_ESTIMATED_EARNINGS&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS_VTR' +
  '&dimension=VIDEO&o_column=ENGAGED_VIEWS&o_direction=ANALYTICS_ORDER_DIRECTION_DESC';

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

export function parseChannelCSVRows(csvContent: string): Record<string, unknown>[] {
  const lines = csvContent.split('\n');

  // Find header row — look for a line containing a known dimension or metric column name
  const knownColumns = ['Video', 'Content', 'Views', 'Engaged views', 'Watch time (hours)'];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells.some(c => knownColumns.includes(c.trim()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    log('ERROR: Could not find header row in channel CSV');
    return [];
  }

  const headers = splitCSVLine(lines[headerIdx]).map(h => h.trim());
  log(`Channel CSV headers: ${headers.join(' | ')}`);

  // Find the video ID column (YouTube exports use "Video" for the ID column)
  const videoIdColIdx = headers.findIndex(h => h === 'Video');

  if (videoIdColIdx === -1) {
    log('ERROR: No "Video" column found in channel CSV headers');
    return [];
  }

  const today = new Date().toISOString().split('T')[0];
  const rows: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCSVLine(line);

    const videoId = cells[videoIdColIdx]?.trim();
    const clipDetailsCode = videoId ? VIDEO_MAP[videoId] : undefined;
    if (!clipDetailsCode) {
      log(`WARNING: No clip_details_code for video ID "${videoId}" — skipping`);
      continue;
    }

    const clipCode = deriveClipCode(clipDetailsCode);
    const row: Record<string, unknown> = {
      platform: 'youtube',
      content_type: 'short',
      clip_details_code: clipDetailsCode,
      clip_code: clipCode,
      stat_date: today,
    };

    for (let j = 0; j < headers.length; j++) {
      const dbCol = COLUMN_MAP[headers[j]];
      if (!dbCol || dbCol === 'stat_date') continue;
      const val = cells[j];
      if (dbCol === 'avg_view_duration_seconds') {
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

async function screenshotOnError(page: import('playwright-core').Page, videoId: string): Promise<void> {
  try {
    const screenshotPath = path.join(path.dirname(LOG_PATH), `${videoId}-error.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`[${videoId}] Screenshot saved to ${screenshotPath}`);
  } catch {
    // screenshot is best-effort
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

  // Validate env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    log('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    logStream.end();
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Prepare download directory — clear it each run
  const downloadDir = path.join(os.tmpdir(), 'yt-studio-sync');
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  log('Starting YouTube Studio channel-level sync');

  // --reset flag: wipe the profile so the user can re-authenticate
  if (process.argv.includes('--reset')) {
    log('--reset flag detected: clearing Chrome automation profile...');
    fs.rmSync(CHROME_AUTOMATION_PROFILE, { recursive: true, force: true });
  }

  const isFirstRun = !fs.existsSync(CHROME_AUTOMATION_PROFILE);
  let context: BrowserContext | null = null;
  try {
    log(`Launching Chrome with automation profile at ${CHROME_AUTOMATION_PROFILE}...`);
    context = await chromium.launchPersistentContext(CHROME_AUTOMATION_PROFILE, {
      channel: 'chrome',
      headless: false,
      acceptDownloads: true,
      ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--disable-infobars',
        '--hide-crash-restore-bubble',
      ],
    });

    // Detect login state
    const checkPage = await context.newPage();
    await checkPage.goto('https://studio.youtube.com', { waitUntil: 'load', timeout: 30000 });
    const studioUrl = checkPage.url();
    const needsLogin = isFirstRun || studioUrl.includes('accounts.google.com') || !studioUrl.includes('studio.youtube.com');
    await checkPage.close();

    if (needsLogin) {
      log('Login required — please log into YouTube Studio in the Chrome window that just opened.');
      log('Waiting 60 seconds for you to complete login...');
      await new Promise(r => setTimeout(r, 60000));
      log('Press Enter when you are logged into YouTube Studio...');
      await new Promise<void>(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('', () => { rl.close(); resolve(); });
      });
    }

    // Navigate directly to the channel analytics export URL
    const page = await context.newPage();
    log('Navigating to channel analytics...');
    await page.goto(CHANNEL_ANALYTICS_URL, { waitUntil: 'load', timeout: 60000 });
    log(`Analytics page URL: ${page.url()}`);

    // Wait for the data table to render before attempting export
    try {
      await page.waitForSelector('ytd-analytics-main-app-element, [data-test-id="analytics-table"], ytcp-analytics-data-table, ytcp-analytics-table', { timeout: 30000 });
      log('Data table rendered');
    } catch {
      log('WARNING: Data table selector not found — proceeding anyway');
    }
    await page.waitForTimeout(3000);

    // Wait for export button
    const exportSelector = '[aria-label="Export current view"]';
    try {
      await page.waitForSelector(exportSelector, { timeout: 30000 });
    } catch {
      log('ERROR: Export button not found');
      await screenshotOnError(page, 'channel-export');
      return;
    }

    // Click export button to open the dropdown menu
    await page.click(exportSelector);
    log('Clicked export button — waiting for dropdown menu');
    await page.waitForTimeout(2000);

    // Log all visible text to diagnose dropdown content
    const pageText = await page.evaluate(() => document.body.innerText);
    log(`Page text after export click (last 500 chars): ...${pageText.slice(-500)}`);

    const filePath = path.join(downloadDir, 'channel-export.bin');
    let download: import('playwright-core').Download;
    try {
      // Set up download listener BEFORE clicking so the event isn't missed
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });

      // Use evaluate to find and click the CSV option via shadow DOM traversal
      const csvClicked = await page.evaluate(() => {
        function findByText(root: Element | ShadowRoot, text: string): Element | null {
          for (const el of Array.from(root.querySelectorAll('*'))) {
            if (el.shadowRoot) {
              const found = findByText(el.shadowRoot, text);
              if (found) return found;
            }
            const content = el.textContent?.trim() ?? '';
            if (content.includes(text) && !el.querySelector('*')) {
              return el;
            }
          }
          return null;
        }
        const leaf = findByText(document.body, 'Comma separated values');
        if (!leaf) return false;
        // Walk up to find a clickable ancestor (paper-item, li, button, etc.)
        let target: Element | null = leaf;
        while (target && !['BUTTON', 'A', 'LI', 'TP-YT-PAPER-ITEM', 'YTCP-MENU-ITEM', 'PAPER-ITEM'].includes(target.tagName)) {
          target = target.parentElement;
        }
        (target ?? leaf as Element).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      });

      if (!csvClicked) {
        log('ERROR: CSV dropdown option not found via shadow DOM traversal');
        await screenshotOnError(page, 'channel-export');
        return;
      }
      log('Clicked CSV option via evaluate — waiting for download');

      download = await downloadPromise;
    } catch (err) {
      log(`ERROR: Download failed — ${err}`);
      await screenshotOnError(page, 'channel-export');
      return;
    }
    await download.saveAs(filePath);
    log(`Saved download to ${filePath}`);

    let csvContent: string;
    try {
      csvContent = getCSVContent(filePath);
    } catch (err) {
      log(`ERROR: Could not extract CSV — ${err}`);
      return;
    }

    const allRows = parseChannelCSVRows(csvContent);
    log(`Total rows collected: ${allRows.length}`);

    if (allRows.length > 0) {
      log('Upserting to Supabase...');
      const { error } = await supabase.from('posts').upsert(allRows, {
        onConflict: 'clip_details_code,platform,stat_date',
        ignoreDuplicates: false,
      });
      if (error) {
        log(`ERROR: Upsert failed — ${JSON.stringify(error)}`);
      } else {
        log(`SUCCESS: Upserted ${allRows.length} rows`);
      }
    } else {
      log('No rows collected — nothing to upsert');
    }

  } finally {
    if (context) {
      await context.close();
    }
    logStream.end();
  }
}

// Guard: only invoke main() when this file is run directly (not imported for tests).
// process.argv[1] is the test runner path during `npx tsx --test`, not this file.
if (process.argv[1]?.includes('youtube-studio-sync') && !process.argv[1]?.includes('.test.')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
