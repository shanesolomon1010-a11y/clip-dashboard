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

async function screenshotOnError(page: import('playwright-core').Page, videoId: string): Promise<void> {
  try {
    const screenshotPath = path.join(path.dirname(LOG_PATH), `${videoId}-error.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`[${videoId}] Screenshot saved to ${screenshotPath}`);
  } catch {
    // screenshot is best-effort
  }
}

async function processVideo(
  page: import('playwright-core').Page,
  channelId: string,
  videoId: string,
  clipDetailsCode: string,
  downloadDir: string,
): Promise<Record<string, unknown>[]> {
  try {
    // Step 1: Navigate to analytics in the existing SPA session
    log(`[${videoId}] Navigating to analytics...`);
    try {
      await page.goto(
        `https://studio.youtube.com/video/${videoId}/analytics/tab-overview/period-default/explore?entity_type=VIDEO&entity_id=${videoId}&time_period=4_weeks&explore_type=TABLE_AND_CHART&c=${channelId}`,
        { waitUntil: 'load', timeout: 30000 },
      );
      log(`[${videoId}] Analytics page URL: ${page.url()}`);
      // Wait for SPA to render — networkidle may never fire on Studio so catch the timeout
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
        log(`[${videoId}] networkidle timeout — proceeding`);
      });
    } catch (err) {
      log(`[${videoId}] ERROR: Navigation failed — ${err}`);
      await screenshotOnError(page, videoId);
      return [];
    }

    // Check for error page
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/something went wrong|oops/i.test(bodyText)) {
      log(`[${videoId}] ERROR: Page shows error state at ${page.url()} — skipping video`);
      await screenshotOnError(page, videoId);
      return [];
    }

    // Step 2: Wait for page to have visible content, then find export button
    // Wait for any known Studio element before attempting to find the export button
    await page.waitForFunction(
      () => document.body.innerText.trim().length > 50,
      { timeout: 30000 },
    ).catch(() => log(`[${videoId}] WARNING: Page body still sparse after 30s`));

    // Audit all buttons/icon-buttons on the page to help identify the export button
    const buttonAudit = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll(
        'button, [role="button"], tp-yt-paper-icon-button, ytcp-icon-button, ytcp-button',
      ));
      return els.map(el => ({
        tag: el.tagName.toLowerCase(),
        ariaLabel: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        text: el.textContent?.trim().slice(0, 40),
      })).filter(b => b.ariaLabel || b.title || b.text);
    });
    log(`[${videoId}] Buttons on page: ${JSON.stringify(buttonAudit)}`);

    const exportSelectors = [
      '[aria-label="Download"]',
      'tp-yt-paper-icon-button[title*="download" i]',
      'ytcp-icon-button[aria-label*="download" i]',
      '[aria-label*="export" i]',
      'button:has-text("Export")',
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
      await screenshotOnError(page, videoId);
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

  log(`Starting YouTube Studio sync for ${Object.keys(VIDEO_MAP).length} videos`);

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

    // Detect login state and extract channel ID from the Studio URL
    const checkPage = await context.newPage();
    await checkPage.goto('https://studio.youtube.com', { waitUntil: 'load', timeout: 30000 });
    const studioUrl = checkPage.url();
    const needsLogin = isFirstRun || studioUrl.includes('accounts.google.com') || !studioUrl.includes('studio.youtube.com');
    await checkPage.close();

    let channelId: string;

    if (needsLogin) {
      log('Login required — please log into YouTube Studio in the Chrome window that just opened.');
      log('Waiting 60 seconds for you to complete login...');
      await new Promise(r => setTimeout(r, 60000));
      log('Press Enter when you are logged into YouTube Studio...');
      await new Promise<void>(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('', () => { rl.close(); resolve(); });
      });
      // Re-navigate after login to get the authenticated Studio URL with channel ID
      const postLoginPage = await context.newPage();
      await postLoginPage.goto('https://studio.youtube.com', { waitUntil: 'load', timeout: 30000 });
      const postLoginUrl = postLoginPage.url();
      await postLoginPage.close();
      const m = postLoginUrl.match(/\/channel\/(UC[^/]+)/);
      if (!m) {
        log(`ERROR: Could not extract channel ID from URL after login: ${postLoginUrl}`);
        logStream.end();
        process.exit(1);
      }
      channelId = m[1];
    } else {
      const m = studioUrl.match(/\/channel\/(UC[^/]+)/);
      if (!m) {
        log(`ERROR: Could not extract channel ID from Studio URL: ${studioUrl}`);
        logStream.end();
        process.exit(1);
      }
      channelId = m[1];
    }
    log(`Channel ID: ${channelId}`);

    // Open a single page for the entire session so the SPA stays initialized
    const page = await context.newPage();
    log('Navigating to Studio to initialize SPA session...');
    await page.goto(`https://studio.youtube.com?c=${channelId}`, { waitUntil: 'load', timeout: 30000 });
    log(`Studio initialized at: ${page.url()}`);

    const allRows: Record<string, unknown>[] = [];
    for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP)) {
      log(`Processing ${videoId} (${clipDetailsCode})...`);
      const rows = await processVideo(page, channelId, videoId, clipDetailsCode, downloadDir);
      allRows.push(...rows);
    }

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
