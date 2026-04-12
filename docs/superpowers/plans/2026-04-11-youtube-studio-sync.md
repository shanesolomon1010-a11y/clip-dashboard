# YouTube Studio Playwright Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Playwright script that exports per-video analytics from YouTube Studio and upserts daily delta rows into the Supabase `posts` table.

**Architecture:** A single TypeScript script uses `playwright-core` with the user's existing Chrome session (non-headless, persistent context) to navigate to each video's Advanced analytics, export a ZIP/CSV, parse it, and batch-upsert all rows. Utility functions (CSV parsing, ZIP detection, time parsing) are extracted and unit tested separately. Scheduling is handled by macOS launchd.

**Tech Stack:** playwright-core, adm-zip, dotenv, @supabase/supabase-js (already installed), tsx (already available via npx), Node built-in test runner (`node:test`)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260411_posts_youtube_upsert_constraint.sql` | Add unique index for upsert conflict key |
| `scripts/youtube-studio-sync.ts` | Main script: env loading, VIDEO_MAP, browser automation, upsert |
| `scripts/youtube-studio-sync.test.ts` | Unit tests for pure utility functions |
| `scripts/youtube-studio-sync.sh` | Shell wrapper: cd to project root, run script via npx tsx |
| `scripts/com.clipstudio.youtubesync.plist` | launchd plist: 6 AM daily trigger |
| `scripts/README.md` | Setup and troubleshooting docs |
| `logs/.gitkeep` | Ensures logs directory is tracked |
| `.gitignore` | Add `logs/*.log` and `logs/launchd-*.log` |

---

## Chunk 1: Setup + Pure Utilities (TDD)

### Task 1: Migration, dependencies, logs directory, .gitignore

**Files:**
- Create: `supabase/migrations/20260411_posts_youtube_upsert_constraint.sql`
- Create: `logs/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1.1: Create the migration file**

```sql
-- supabase/migrations/20260411_posts_youtube_upsert_constraint.sql
-- Safe to run even if constraint already exists in the live database (IF NOT EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS posts_clip_platform_statdate_idx
  ON posts (clip_details_code, platform, stat_date);
```

- [ ] **Step 1.2: Create logs directory and .gitkeep**

```bash
mkdir -p /Users/shane/clip-dashboard/logs
touch /Users/shane/clip-dashboard/logs/.gitkeep
```

- [ ] **Step 1.3: Add log patterns to .gitignore**

Append to `/Users/shane/clip-dashboard/.gitignore`:

```
logs/*.log
logs/launchd-*.log
```

- [ ] **Step 1.4: Install dependencies**

```bash
cd /Users/shane/clip-dashboard
npm install playwright-core adm-zip dotenv --save-dev
npm install @types/adm-zip --save-dev
```

Expected: All four packages appear in `package.json` `devDependencies`.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/shane/clip-dashboard
git add supabase/migrations/20260411_posts_youtube_upsert_constraint.sql \
        logs/.gitkeep \
        .gitignore \
        package.json \
        package-lock.json
git commit -m "chore: add yt-studio-sync deps, migration, logs dir"
```

---

### Task 2: Script skeleton — imports, constants, env loading, logging, Chrome check, dry-run

**Files:**
- Create: `scripts/youtube-studio-sync.ts`

- [ ] **Step 2.1: Create the script skeleton**

Create `/Users/shane/clip-dashboard/scripts/youtube-studio-sync.ts`:

```typescript
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
```

- [ ] **Step 2.2: Verify dry-run compiles and runs**

```bash
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Expected output (19 lines of video entries plus start/end log lines):
```
[...] DRY RUN: VIDEO_MAP entries:
[...] 6dMQ7EyATRU → MBM015-CLIP-014 (clip_code: MBM015)
...
[...] DRY RUN complete — exiting before Chrome launch
```

- [ ] **Step 2.3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add scripts/youtube-studio-sync.ts
git commit -m "feat: add yt-studio-sync script skeleton with dry-run"
```

---

### Task 3: Unit tests for utility functions

**Files:**
- Create: `scripts/youtube-studio-sync.test.ts`

- [ ] **Step 3.1: Create the test file**

Create `/Users/shane/clip-dashboard/scripts/youtube-studio-sync.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Import pure utilities — these don't start the browser or open log files
import {
  safeNum,
  parseTimeToSeconds,
  deriveClipCode,
  isZipBuffer,
  parseCSVRows,
  COLUMN_MAP,
  VIDEO_MAP,
} from './youtube-studio-sync.js';

// ---------------------------------------------------------------------------
// safeNum
// ---------------------------------------------------------------------------

test('safeNum: parses plain integers', () => {
  assert.equal(safeNum('42'), 42);
});

test('safeNum: parses decimals', () => {
  assert.equal(safeNum('3.14'), 3.14);
});

test('safeNum: strips commas', () => {
  assert.equal(safeNum('1,234'), 1234);
  assert.equal(safeNum('1,234,567.89'), 1234567.89);
});

test('safeNum: returns null for empty string', () => {
  assert.equal(safeNum(''), null);
});

test('safeNum: returns null for undefined', () => {
  assert.equal(safeNum(undefined), null);
});

test('safeNum: returns null for non-numeric', () => {
  assert.equal(safeNum('N/A'), null);
  assert.equal(safeNum('--'), null);
});

// ---------------------------------------------------------------------------
// parseTimeToSeconds
// ---------------------------------------------------------------------------

test('parseTimeToSeconds: parses M:SS', () => {
  assert.equal(parseTimeToSeconds('1:23'), 83);
  assert.equal(parseTimeToSeconds('0:45'), 45);
});

test('parseTimeToSeconds: parses H:MM:SS', () => {
  assert.equal(parseTimeToSeconds('0:02:30'), 150);
  assert.equal(parseTimeToSeconds('1:00:00'), 3600);
});

test('parseTimeToSeconds: returns null for invalid', () => {
  assert.equal(parseTimeToSeconds('abc'), null);
  assert.equal(parseTimeToSeconds(''), null);
});

// ---------------------------------------------------------------------------
// deriveClipCode
// ---------------------------------------------------------------------------

test('deriveClipCode: extracts prefix before -CLIP-', () => {
  assert.equal(deriveClipCode('MBM015-CLIP-014'), 'MBM015');
  assert.equal(deriveClipCode('MBM016-CLIP-001'), 'MBM016');
});

test('deriveClipCode: falls back to full code when -CLIP- absent', () => {
  assert.equal(deriveClipCode('NOPREFIX'), 'NOPREFIX');
});

// ---------------------------------------------------------------------------
// isZipBuffer
// ---------------------------------------------------------------------------

test('isZipBuffer: detects ZIP magic bytes', () => {
  const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
  assert.equal(isZipBuffer(zipMagic), true);
});

test('isZipBuffer: returns false for plain text', () => {
  const csv = Buffer.from('Date,Views\n2025-01-01,100\n');
  assert.equal(isZipBuffer(csv), false);
});

test('isZipBuffer: returns false for short buffer', () => {
  assert.equal(isZipBuffer(Buffer.from([0x50, 0x4b])), false);
});

// ---------------------------------------------------------------------------
// parseCSVRows
// ---------------------------------------------------------------------------

const SAMPLE_CSV = `"Table: Chart data"
"Some metadata line"

"Date","Views","Likes","Average view duration","Unique viewers"
"2025-01-01","1000","50","0:45","800"
"2025-01-02","1200","60","1:02","900"
"invalid row"
`;

test('parseCSVRows: finds Date header and skips metadata', () => {
  const rows = parseCSVRows(SAMPLE_CSV, 'MBM015-CLIP-014');
  assert.equal(rows.length, 2);
});

test('parseCSVRows: maps stat_date correctly', () => {
  const rows = parseCSVRows(SAMPLE_CSV, 'MBM015-CLIP-014');
  assert.equal(rows[0].stat_date, '2025-01-01');
  assert.equal(rows[1].stat_date, '2025-01-02');
});

test('parseCSVRows: parses numeric columns', () => {
  const rows = parseCSVRows(SAMPLE_CSV, 'MBM015-CLIP-014');
  assert.equal(rows[0].views, 1000);
  assert.equal(rows[0].likes, 50);
  assert.equal(rows[0].unique_viewers, 800);
});

test('parseCSVRows: converts avg_view_duration to seconds', () => {
  const rows = parseCSVRows(SAMPLE_CSV, 'MBM015-CLIP-014');
  assert.equal(rows[0].avg_view_duration_seconds, 45);   // 0:45
  assert.equal(rows[1].avg_view_duration_seconds, 62);   // 1:02
});

test('parseCSVRows: sets fixed fields', () => {
  const rows = parseCSVRows(SAMPLE_CSV, 'MBM015-CLIP-014');
  assert.equal(rows[0].platform, 'youtube');
  assert.equal(rows[0].content_type, 'short');
  assert.equal(rows[0].clip_details_code, 'MBM015-CLIP-014');
  assert.equal(rows[0].clip_code, 'MBM015');
});

test('parseCSVRows: skips non-date rows', () => {
  const rows = parseCSVRows(SAMPLE_CSV, 'MBM015-CLIP-014');
  // "invalid row" should be skipped — only 2 rows
  assert.equal(rows.length, 2);
});

test('parseCSVRows: returns empty array if no Date header found', () => {
  const rows = parseCSVRows('no header here\njust garbage', 'MBM015-CLIP-014');
  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------------
// VIDEO_MAP and COLUMN_MAP sanity checks
// ---------------------------------------------------------------------------

test('VIDEO_MAP: has exactly 19 entries', () => {
  assert.equal(Object.keys(VIDEO_MAP).length, 19);
});

test('VIDEO_MAP: all values contain -CLIP-', () => {
  for (const code of Object.values(VIDEO_MAP)) {
    assert.ok(code.includes('-CLIP-'), `${code} missing -CLIP-`);
  }
});

test('COLUMN_MAP: maps Date to stat_date', () => {
  assert.equal(COLUMN_MAP['Date'], 'stat_date');
});

test('COLUMN_MAP: maps Average view duration to avg_view_duration_seconds', () => {
  assert.equal(COLUMN_MAP['Average view duration'], 'avg_view_duration_seconds');
});
```

- [ ] **Step 3.2: Run the tests — expect all to fail (functions are stubs)**

Wait — the functions ARE already implemented in Step 2.1 (they're pure utilities, not stubs). Run to verify they pass:

```bash
cd /Users/shane/clip-dashboard
npx tsx --test scripts/youtube-studio-sync.test.ts 2>&1
```

Expected: All tests pass. If any fail, fix the utility functions in `youtube-studio-sync.ts` before proceeding.

- [ ] **Step 3.3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add scripts/youtube-studio-sync.test.ts scripts/youtube-studio-sync.ts
git commit -m "test: add unit tests for yt-studio-sync utility functions"
```

---

## Chunk 2: Browser Automation + Upsert

### Task 4: Implement processVideo — full per-video browser flow

**Files:**
- Modify: `scripts/youtube-studio-sync.ts` (replace the processVideo stub)

- [ ] **Step 4.1: Replace the processVideo stub with the full implementation**

In `scripts/youtube-studio-sync.ts`, find the stub:

```typescript
async function processVideo(
  _context: BrowserContext,
  _videoId: string,
  _clipDetailsCode: string,
  _downloadDir: string,
): Promise<Record<string, unknown>[]> {
  throw new Error('processVideo not yet implemented');
}
```

Replace it with:

```typescript
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
    for (const cb of checkboxes) {
      try {
        await cb.click();
      } catch {
        // checkbox may have disappeared; continue
      }
    }
    log(`[${videoId}] Selected ${checkboxes.length} metrics`);
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
```

- [ ] **Step 4.2: Re-run dry-run to confirm no compilation errors were introduced**

```bash
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Expected: same 19-video dry-run output as before. No TypeScript errors.

- [ ] **Step 4.3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add scripts/youtube-studio-sync.ts
git commit -m "feat: implement processVideo browser automation flow"
```

---

### Task 5: Implement main() — Chrome safety, launch, iterate, upsert

**Files:**
- Modify: `scripts/youtube-studio-sync.ts` (replace main() stub)

- [ ] **Step 5.1: Replace the main() stub with the full implementation**

In `scripts/youtube-studio-sync.ts`, find:

```typescript
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
```

Replace with:

```typescript
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

  // Chrome safety check
  if (isChromeRunning()) {
    log('ERROR: Google Chrome is already running. Close Chrome before running this script.');
    logStream.end();
    process.exit(1);
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

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
      executablePath: CHROME_EXECUTABLE,
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
      acceptDownloads: true,
    });

    const allRows: Record<string, unknown>[] = [];
    for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP)) {
      log(`Processing ${videoId} (${clipDetailsCode})...`);
      const rows = await processVideo(context, videoId, clipDetailsCode, downloadDir);
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
```

- [ ] **Step 5.2: Re-run dry-run to confirm final script compiles**

```bash
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Expected: 19-video output, exits cleanly with code 0.

- [ ] **Step 5.3: Re-run unit tests to confirm no regressions**

```bash
cd /Users/shane/clip-dashboard
npx tsx --test scripts/youtube-studio-sync.test.ts 2>&1
```

Expected: All tests pass.

- [ ] **Step 5.4: Commit**

```bash
cd /Users/shane/clip-dashboard
git add scripts/youtube-studio-sync.ts
git commit -m "feat: implement main() with Chrome launch, video loop, and batch upsert"
```

---

## Chunk 3: Scheduling Files + README + Verification

### Task 6: Shell wrapper

**Files:**
- Create: `scripts/youtube-studio-sync.sh`

- [ ] **Step 6.1: Create the shell wrapper**

Create `/Users/shane/clip-dashboard/scripts/youtube-studio-sync.sh`:

```bash
#!/bin/bash
# Include both Intel (/usr/local) and Apple Silicon (/opt/homebrew) npm bin paths
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts >> logs/youtube-studio-sync.log 2>&1
```

- [ ] **Step 6.2: Make it executable**

```bash
chmod +x /Users/shane/clip-dashboard/scripts/youtube-studio-sync.sh
```

- [ ] **Step 6.3: Verify script still compiles**

```bash
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Expected: 19 video entries printed, exits 0. The shell wrapper is a passthrough — no separate test needed for it.

---

### Task 7: launchd plist

**Files:**
- Create: `scripts/com.clipstudio.youtubesync.plist`

- [ ] **Step 7.1: Create the plist**

Create `/Users/shane/clip-dashboard/scripts/com.clipstudio.youtubesync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.clipstudio.youtubesync</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/shane/clip-dashboard/scripts/youtube-studio-sync.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/shane/clip-dashboard/logs/launchd-stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/shane/clip-dashboard/logs/launchd-stderr.log</string>

  <key>RunAtLoad</key>
  <false/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>/Users/shane</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
```

---

### Task 8: README

**Files:**
- Create: `scripts/README.md`

- [ ] **Step 8.1: Create the README**

Create `/Users/shane/clip-dashboard/scripts/README.md`:

```markdown
# YouTube Studio Sync

Playwright script that logs into YouTube Studio using your existing Chrome session,
exports per-video analytics as CSV, and upserts daily delta rows into Supabase.

## One-time setup

1. Install dependencies (if not already done):
   ```bash
   npm install playwright-core adm-zip dotenv --save-dev
   npm install @types/adm-zip --save-dev
   ```

2. Apply the Supabase migration (safe to run if constraint already exists):
   ```bash
   # Run in Supabase SQL editor or via supabase CLI:
   # supabase/migrations/20260411_posts_youtube_upsert_constraint.sql
   ```

3. Make the shell wrapper executable:
   ```bash
   chmod +x scripts/youtube-studio-sync.sh
   ```

## Manual run

1. **Close Google Chrome** — the script needs to open Chrome with your profile.
2. From the project root:
   ```bash
   npx tsx scripts/youtube-studio-sync.ts
   ```
   Or via the shell wrapper:
   ```bash
   ./scripts/youtube-studio-sync.sh
   ```
3. Logs are written to `logs/youtube-studio-sync.log`.

### Dry run (no browser launch)

```bash
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Prints all 19 video entries and exits. Use to verify the script compiles and env vars load.

### Unit tests

```bash
npx tsx --test scripts/youtube-studio-sync.test.ts
```

## Enable automatic daily run (6 AM)

```bash
cp scripts/com.clipstudio.youtubesync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.clipstudio.youtubesync.plist
```

Verify it loaded:
```bash
launchctl list | grep clipstudio
```

Disable:
```bash
launchctl unload ~/Library/LaunchAgents/com.clipstudio.youtubesync.plist
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Chrome is already running" | Close Google Chrome before running |
| "0 unchecked metric checkboxes found" | YouTube Studio UI may have changed; check logs and run manually to inspect the page |
| "No export button found" | Same — YouTube Studio UI changed; check selector list in `processVideo` |
| Auth errors / redirected to login | Open YouTube Studio in Chrome manually to refresh session |
| Upsert error | Check Supabase logs; confirm `posts_clip_platform_statdate_idx` constraint exists |
```

---

### Task 9: Final commit and verification

**Files:** All scripts files, commit all

- [ ] **Step 9.1: Final dry-run**

```bash
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts --dry-run
```

Expected: 19 video entries printed, exits 0.

- [ ] **Step 9.2: Final unit test run**

```bash
cd /Users/shane/clip-dashboard
npx tsx --test scripts/youtube-studio-sync.test.ts 2>&1
```

Expected: All tests pass, 0 failures.

- [ ] **Step 9.3: Verify build still passes**

```bash
cd /Users/shane/clip-dashboard
npm run build 2>&1 | tail -5
```

Expected: Build succeeds (scripts directory is not included in Next.js build).

- [ ] **Step 9.4: Commit all scheduling and docs files**

```bash
cd /Users/shane/clip-dashboard
git add scripts/youtube-studio-sync.sh \
        scripts/com.clipstudio.youtubesync.plist \
        scripts/README.md \
        logs/.gitkeep
git commit -m "feat: add shell wrapper, launchd plist, README, logs dir"
```
