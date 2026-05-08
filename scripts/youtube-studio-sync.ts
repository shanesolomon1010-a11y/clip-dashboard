/**
 * YouTube Studio Watchdog Scraper
 *
 * STATUS: Active as of 2026-04-29.
 * Repurposed from a posts-writer to a watchdog scraper.
 *
 * PURPOSE:
 * Pulls daily metrics from YouTube Studio CSV exports and writes to the
 * studio_snapshots table. The Vercel cron at /api/cron/youtube-sync remains
 * the source of truth for the posts table. studio_snapshots exists as a
 * verification source so the Diagnostics tab in Settings can detect drift
 * between API data and Studio data.
 *
 * SCHEDULE: Daily 6 AM PT via LaunchAgent at
 * ~/Library/LaunchAgents/com.clipstudio.youtubesync.plist
 *
 * DO NOT make this script write to posts again. Posts is owned by the
 * Vercel cron.
 */

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
  'JJI4swcaLJQ': 'MBM016-CLIP-003',
  'QYcNH8fKXTs': 'MBM016-CLIP-004',
  'VH42AvIjbk0': 'MBM016-CLIP-005',
  'tPsydEmTaOo': 'MBM016-CLIP-006',
  'OKyFroQrWwM': 'MBM016-CLIP-007',
  '51DR6H8GQBc': 'MBM016-CLIP-009',
  'AqtzZNYdxTE': 'MBM016-CLIP-010',
  'kXt894vwO1c': 'MBM016-CLIP-011',
  'pkPSikierRM': 'MBM016-CLIP-012',
  '-cXhRAIu_AE': 'MBM016-CLIP-013',
  'CGQryafzaAY': 'MBM016-CLIP-014',
  'X6v-cvX2tew': 'MBM017-CLIP-001',
  '5SImwiVgWWA': 'MBM017-CLIP-002',
  '4e-SB9pZxGM': 'MBM020-CLIP-003',
  'fc3PZ8QOTc8': 'MBM024-CLIP-001',
  'YBIKT2Wxpm0': 'MBM024-CLIP-002',
  'uRDZUr1vzJ4': 'MBM025-CLIP-001',
  'yZS5qB_uvTQ': 'MBM025-CLIP-003',
  'D1y3gb1MfUI': 'MBM025-CLIP-004',
  'q_pNnD-JLnQ': 'MBM025-CLIP-005',
};

export const COLUMN_MAP: Record<string, string> = {
  'Date': 'stat_date',
  'Views': 'views',
  'Engaged views': 'views',           // channel Chart data.csv uses this header instead of "Views"
  'Watch time (hours)': 'watch_time_hours',
  'Average view duration': 'avg_view_duration_seconds',
  'Average percentage viewed (%)': 'avg_view_percentage',
  'Stayed to watch (%)': 'stayed_to_watch_pct',
  'Duration': 'duration_seconds',
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
  'Hypes': 'hypes',
  'Hype points': 'hype_points',
  'Post subscribers': 'post_subscribers',
};

const CHROME_AUTOMATION_PROFILE = path.join(__dirname, '../.chrome-automation-profile');
const LOG_PATH = path.join(__dirname, '../logs/youtube-studio-sync.log');
const CHANNEL_ID = 'UC-Ly0V7fa_9TaF3WXvsroZA';

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

// Per-video explore URL: same metrics as the channel export but scoped to a single
// video with dimension=DAY so the CSV has Date as the first column.
function buildVideoAnalyticsUrl(videoId: string): string {
  return (
    `https://studio.youtube.com/video/${videoId}/analytics/tab-overview/period-default/explore` +
    `?entity_type=VIDEO&entity_id=${videoId}` +
    `&time_period=4_weeks&explore_type=TABLE_AND_CHART&metric=ENGAGED_VIEWS&granularity=DAY` +
    `&t_metrics=ENGAGED_VIEWS&t_metrics=AVERAGE_WATCH_TIME&t_metrics=AVERAGE_WATCH_PERCENTAGE` +
    `&t_metrics=VIDEO_COUNT_NEW&t_metrics=VIDEO_COUNT_FIRST_PUBLISHED&t_metrics=SHORTS_FEED_IMPRESSIONS_VTR` +
    `&t_metrics=ESTIMATED_UNIQUE_VIEWERS&t_metrics=AVERAGE_VIEWS_PER_VIEWER` +
    `&t_metrics=RECENT_VIEWERS&t_metrics=OCCASIONAL_VIEWERS&t_metrics=FREQUENT_VIEWERS&t_metrics=RETURNING_VIEWERS` +
    `&t_metrics=HYPES&t_metrics=HYPE_POINTS&t_metrics=SUBSCRIBERS_GAINED&t_metrics=SUBSCRIBERS_LOST` +
    `&t_metrics=RATINGS_LIKES&t_metrics=COMMENTS&t_metrics=SHARINGS` +
    `&t_metrics=LIKES_PER_LIKES_PLUS_DISLIKES_PERCENT&t_metrics=RATINGS_DISLIKES` +
    `&t_metrics=POST_IMPRESSIONS&t_metrics=POST_LIKES&t_metrics=POST_LIKES_PER_IMPRESSIONS` +
    `&t_metrics=POST_VOTES&t_metrics=POST_VOTES_PER_IMPRESSIONS&t_metrics=POST_SUBSCRIBERS_NET_CHANGE` +
    `&t_metrics=SHORTS_REMIX_COUNT&t_metrics=SHORTS_REMIX_VIEWS` +
    `&t_metrics=CLIP_VIDEO_WATCHTIME&t_metrics=CLIP_VIEWS` +
    `&t_metrics=EXTERNAL_VIEWS&t_metrics=EXTERNAL_WATCH_TIME&t_metrics=SUBSCRIBERS_NET_CHANGE` +
    `&t_metrics=TOTAL_ESTIMATED_EARNINGS&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS&t_metrics=VIDEO_THUMBNAIL_IMPRESSIONS_VTR` +
    `&dimension=DAY`
  );
}

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
    if (!entries.length) throw new Error(`No CSV entry found in ZIP for ${filePath}`);
    // Prefer the entry whose first line starts with "Date" — that's the per-day data table.
    // Fall back to the first CSV if none match.
    const dateEntry = entries.find(e => {
      const firstLine = zip.readAsText(e).split('\n')[0] ?? '';
      return firstLine.split(',')[0].replace(/"/g, '').trim() === 'Date';
    });
    return zip.readAsText(dateEntry ?? entries[0]);
  }
  return buf.toString('utf-8');
}

// Extract the "Table data.csv" entry from a ZIP export — returns null if not applicable.
// Table data.csv contains per-period aggregate metrics (impressions, CTR, unique viewers, etc.).
export function getTableCSVContent(filePath: string): string | null {
  const buf = fs.readFileSync(filePath);
  if (!isZipBuffer(buf)) return null;
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find(e => e.entryName.trim() === 'Table data.csv');
  return entry ? zip.readAsText(entry) : null;
}

// Parse aggregate metrics from a Table data.csv.
// channelMode=true:  Content column contains video IDs (skip the "Total" summary row).
// channelMode=false: single-video export — one data row attributed to the provided videoId.
// Returns a map of videoId → DB column fields ready for upsert.
export function parseTableAggregates(
  tableCsv: string,
  channelMode: boolean,
  videoId?: string,
): Map<string, Record<string, unknown>> {
  const lines = tableCsv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return new Map();

  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  log(`Table data.csv headers (${channelMode ? 'channel' : 'per-video'}): ${headers.join(' | ')}`);

  const contentIdx = headers.findIndex(h => h === 'Content');
  const result = new Map<string, Record<string, unknown>>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);

    let rowVideoId: string;
    if (!channelMode) {
      if (!videoId) continue;
      rowVideoId = videoId; // per-video export: one known video
    } else {
      if (contentIdx === -1) continue;
      const contentVal = cells[contentIdx]?.trim();
      if (!contentVal || contentVal === 'Total') continue;
      if (!VIDEO_MAP[contentVal]) continue; // skip unmapped videos
      rowVideoId = contentVal;
    }

    if (result.has(rowVideoId)) continue;

    const metrics: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const col = headers[j];
      if (col === 'Content' || col === 'Video title' || col === 'Video publish time') continue;
      const dbCol = COLUMN_MAP[col];
      if (!dbCol || dbCol === 'stat_date') continue;
      const val = cells[j];
      if (dbCol === 'avg_view_duration_seconds') {
        metrics[dbCol] = parseTimeToSeconds(val);
      } else {
        metrics[dbCol] = safeNum(val);
      }
    }
    result.set(rowVideoId, metrics);

    if (!channelMode) break; // per-video: only one row needed
  }

  return result;
}

// Aggregate/rate columns from Table data.csv that get merged into the most recent real daily
// row only — not distributed across every day (they are period totals, not daily deltas).
const AGGREGATE_MERGE_COLS: ReadonlyArray<string> = [
  'impressions', 'impression_ctr', 'unique_viewers',
  'likes', 'comments', 'shares',
  'avg_view_duration_seconds', 'watch_time_hours', 'avg_view_percentage',
  'subscribers_gained', 'subscribers_lost',
  'new_viewers', 'casual_viewers', 'regular_viewers', 'returning_viewers',
  'hypes', 'hype_points', 'post_subscribers', 'stayed_to_watch_pct',
];

// Merge aggregate metrics from Table data.csv into the most recent real stat_date row for
// each video. Delta columns (views, likes, comments, shares) are left on every daily row as-is.
export function mergeAggregatesIntoLatestRow(
  rows: Record<string, unknown>[],
  aggregates: Map<string, Record<string, unknown>>,
): void {
  if (rows.length === 0 || aggregates.size === 0) return;

  const byCode = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const code = row.clip_details_code as string;
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(row);
  }

  for (const [videoId, metrics] of Array.from(aggregates)) {
    const clipDetailsCode = VIDEO_MAP[videoId];
    if (!clipDetailsCode) continue;
    const videoRows = byCode.get(clipDetailsCode);
    if (!videoRows || videoRows.length === 0) continue;

    const latestRow = videoRows.reduce((best, row) =>
      (row.stat_date as string) > (best.stat_date as string) ? row : best
    );

    for (const col of AGGREGATE_MERGE_COLS) {
      const val = metrics[col];
      if (val != null) latestRow[col] = val;
    }
  }
}

// Shape of a row in the studio_snapshots table. Scraper rows are built with
// extra fields shaped for posts (content_id, content_type, clip_code, dislikes,
// duration_seconds, post_subscribers); the mapper below filters those out.
export interface StudioSnapshotRow {
  clip_details_code: string;
  platform: string;
  stat_date: string;
  views: number | null;
  watch_time_hours: number | null;
  impressions: number | null;
  impression_ctr: number | null;
  avg_view_duration_seconds: number | null;
  avg_view_percentage: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  stayed_to_watch_pct: number | null;
  unique_viewers: number | null;
  new_viewers: number | null;
  casual_viewers: number | null;
  regular_viewers: number | null;
  returning_viewers: number | null;
  hypes: number | null;
  hype_points: number | null;
}

function pickNum(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  return typeof v === 'number' ? v : null;
}

export function toStudioSnapshot(row: Record<string, unknown>): StudioSnapshotRow {
  return {
    clip_details_code: row.clip_details_code as string,
    platform: row.platform as string,
    stat_date: row.stat_date as string,
    views: pickNum(row, 'views'),
    watch_time_hours: pickNum(row, 'watch_time_hours'),
    impressions: pickNum(row, 'impressions'),
    impression_ctr: pickNum(row, 'impression_ctr'),
    avg_view_duration_seconds: pickNum(row, 'avg_view_duration_seconds'),
    avg_view_percentage: pickNum(row, 'avg_view_percentage'),
    subscribers_gained: pickNum(row, 'subscribers_gained'),
    subscribers_lost: pickNum(row, 'subscribers_lost'),
    likes: pickNum(row, 'likes'),
    comments: pickNum(row, 'comments'),
    shares: pickNum(row, 'shares'),
    stayed_to_watch_pct: pickNum(row, 'stayed_to_watch_pct'),
    unique_viewers: pickNum(row, 'unique_viewers'),
    new_viewers: pickNum(row, 'new_viewers'),
    casual_viewers: pickNum(row, 'casual_viewers'),
    regular_viewers: pickNum(row, 'regular_viewers'),
    returning_viewers: pickNum(row, 'returning_viewers'),
    hypes: pickNum(row, 'hypes'),
    hype_points: pickNum(row, 'hype_points'),
  };
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
  videoId = '',
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
      ...(videoId ? { content_id: videoId } : {}),
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

  // Log first 3 data rows to diagnose the actual content format
  for (let i = headerIdx + 1; i <= headerIdx + 3 && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed) log(`CSV row ${i - headerIdx}: ${trimmed.slice(0, 200)}`);
  }

  // "Content" column contains the video ID, "Date" column has the row date
  const contentColIdx = headers.findIndex(h => h === 'Content');
  const dateColIdx = headers.findIndex(h => h === 'Date');
  const viewsColIdx = headers.findIndex(h => h === 'Views' || h === 'Engaged views');
  if (contentColIdx === -1) {
    log('ERROR: No "Content" column found in channel CSV headers');
    return [];
  }
  if (dateColIdx === -1) {
    log('ERROR: No "Date" column found in channel CSV headers');
    return [];
  }

  // Tally unique video IDs and match rate for diagnosis
  const seenIds = new Set<string>();
  // Maps unmapped video ID → total views across all its rows in this export
  const unmatchedViews = new Map<string, number>();

  const rows: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCSVLine(line);

    const contentVal = cells[contentColIdx]?.trim().replace(/^["']|["']$/g, '');
    seenIds.add(contentVal ?? '');

    const clipDetailsCode = contentVal ? VIDEO_MAP[contentVal] : undefined;
    if (!clipDetailsCode) {
      const id = contentVal ?? '';
      const rowViews = viewsColIdx !== -1 ? (safeNum(cells[viewsColIdx]) ?? 0) : 0;
      unmatchedViews.set(id, (unmatchedViews.get(id) ?? 0) + rowViews);
      continue;
    }

    const statDate = cells[dateColIdx]?.trim();
    if (!statDate || !/^\d{4}-\d{2}-\d{2}$/.test(statDate)) continue;

    const clipCode = deriveClipCode(clipDetailsCode);
    const row: Record<string, unknown> = {
      platform: 'youtube',
      content_type: 'short',
      clip_details_code: clipDetailsCode,
      clip_code: clipCode,
      stat_date: statDate,
      content_id: contentVal,
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

  const matchedIds = Array.from(seenIds).filter(id => VIDEO_MAP[id]);
  const csvOnlyIds = Array.from(unmatchedViews.keys()); // in CSV but not in VIDEO_MAP
  const missingFromCsv = Object.keys(VIDEO_MAP).filter(id => !seenIds.has(id));

  log(`Unique video IDs in CSV: ${seenIds.size} — matched: ${matchedIds.length}, unmatched: ${csvOnlyIds.length}`);
  log(`Matched IDs: ${matchedIds.join(', ')}`);
  if (csvOnlyIds.length > 0) {
    log(`In CSV but not in VIDEO_MAP: ${csvOnlyIds.join(', ')}`);
    for (const [id, totalViews] of Array.from(unmatchedViews)) {
      console.warn(`[channel-export] UNMAPPED video skipped: ${id} (${totalViews.toLocaleString()} views) — add to VIDEO_MAP to include`);
    }
  }
  if (missingFromCsv.length > 0) log(`In VIDEO_MAP but absent from CSV: ${missingFromCsv.join(', ')}`);

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

async function exportVideoCSV(
  page: import('playwright-core').Page,
  videoId: string,
  clipDetailsCode: string,
  downloadDir: string,
): Promise<Record<string, unknown>[]> {
  const url = `https://studio.youtube.com/video/${videoId}/analytics/tab-overview/period-default?c=${CHANNEL_ID}`;
  log(`[${videoId}] Navigating to video analytics...`);
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch (err) {
    log(`[${videoId}] ERROR: Navigation failed — ${err}`);
    await screenshotOnError(page, videoId);
    return [];
  }

  // Click Advanced mode to get the per-day data table
  try {
    await page.click('text="Advanced mode"', { timeout: 10000 });
    log(`[${videoId}] Advanced mode clicked`);
  } catch {
    log(`[${videoId}] WARNING: Advanced mode button not found — continuing`);
  }

  // Wait for the per-video report's chart/data to paint before attempting export.
  try {
    await page.waitForFunction(
      () => {
        if (document.querySelectorAll('canvas[role="img"]').length > 0) return true;
        const svgs = Array.from(document.querySelectorAll('svg'));
        for (const s of svgs) {
          const r = s.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return true;
        }
        const progress = document.querySelectorAll(
          '[role="progressbar"], tp-yt-paper-progress[indeterminate], paper-progress[indeterminate], paper-spinner[active]'
        );
        if (progress.length === 0) return true;
        return false;
      },
      { timeout: 120000 },
    );
  } catch {
    log(`[${videoId}] WARNING: Report data did not render within 120s — skipping`);
    await screenshotOnError(page, videoId);
    return [];
  }

  // Wait for export button — low-view videos may not render it; skip with a warning if so
  const exportSelector = '[aria-label="Export current view"]';
  try {
    await page.waitForSelector(exportSelector, { timeout: 30000 });
  } catch {
    log(`[${videoId}] WARNING: Export button not found within 30s — skipping (not enough data)`);
    await screenshotOnError(page, videoId);
    return [];
  }

  // Click export button to open the dropdown menu
  await page.click(exportSelector);
  log(`[${videoId}] Clicked export button — waiting for dropdown menu`);

  const filePath = path.join(downloadDir, `${videoId}.bin`);
  const attemptVideoExport = async (): Promise<import('playwright-core').Download> => {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.getByRole('menuitem', { name: /Comma-separated values/i }).click(),
    ]);
    return dl;
  };
  let download: import('playwright-core').Download;
  try {
    download = await attemptVideoExport();
  } catch (err) {
    log(`[${videoId}] First export attempt timed out — retrying once (${err})`);
    try { await page.click(exportSelector); } catch { /* dropdown may already be open */ }
    try {
      download = await attemptVideoExport();
    } catch (err2) {
      log(`[${videoId}] ERROR: Download failed — ${err2}`);
      await screenshotOnError(page, videoId);
      return [];
    }
  }
  await download.saveAs(filePath);
  log(`[${videoId}] Saved per-video export to ${filePath}`);

  let csvContent: string;
  try {
    csvContent = getCSVContent(filePath);
  } catch (err) {
    log(`[${videoId}] ERROR: Could not extract CSV — ${err}`);
    return [];
  }

  const firstLines = csvContent.split('\n').slice(0, 5).map(l => l.slice(0, 120));
  log(`[${videoId}] CSV first 5 lines: ${JSON.stringify(firstLines)}`);
  const rows = parseCSVRows(csvContent, clipDetailsCode, videoId);
  log(`[${videoId}] Parsed ${rows.length} rows`);

  // Merge aggregate metrics (impressions, CTR, unique_viewers) from Table data.csv into
  // the most recent daily row. These are period totals, not per-day values.
  const tableCSV = getTableCSVContent(filePath);
  if (tableCSV) {
    const aggregates = parseTableAggregates(tableCSV, false, videoId);
    mergeAggregatesIntoLatestRow(rows, aggregates);
    if (aggregates.size > 0) log(`[${videoId}] Merged aggregate metrics into latest row`);
  }

  return rows;
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

    // Wait for the report's chart/data to actually paint before attempting export.
    // Studio's CSV export silently no-ops when clicked on an empty report — clicking
    // through before data has rendered was the cause of the "Download failed" timeouts.
    log('Waiting for report data to render...');
    try {
      await page.waitForFunction(
        () => {
          if (document.querySelectorAll('canvas[role="img"]').length > 0) return true;
          const svgs = Array.from(document.querySelectorAll('svg'));
          for (const s of svgs) {
            const r = s.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return true;
          }
          const progress = document.querySelectorAll(
            '[role="progressbar"], tp-yt-paper-progress[indeterminate], paper-progress[indeterminate], paper-spinner[active]'
          );
          if (progress.length === 0) return true;
          return false;
        },
        { timeout: 120000 },
      );
      log('Report data rendered');
    } catch {
      log('ERROR: Studio report data did not render within 120s');
      await screenshotOnError(page, 'channel-export');
      throw new Error('Studio report data did not render within 120s');
    }

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

    const filePath = path.join(downloadDir, 'channel-export.bin');
    const attemptChannelExport = async (): Promise<import('playwright-core').Download> => {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.getByRole('menuitem', { name: /Comma-separated values/i }).click(),
      ]);
      return dl;
    };
    let download: import('playwright-core').Download;
    try {
      download = await attemptChannelExport();
    } catch (err) {
      log(`First export attempt timed out — retrying once (${err})`);
      try { await page.click(exportSelector); } catch { /* dropdown may already be open */ }
      try {
        download = await attemptChannelExport();
      } catch (err2) {
        log(`ERROR: Download failed — ${err2}`);
        await screenshotOnError(page, 'channel-export');
        throw new Error(`Channel export download failed after 2 attempts: ${err2}`);
      }
    }
    await download.saveAs(filePath);
    log(`Saved channel export to ${filePath}`);

    let csvContent: string;
    try {
      csvContent = getCSVContent(filePath);
    } catch (err) {
      log(`ERROR: Could not extract CSV — ${err}`);
      return;
    }

    const channelRows = parseChannelCSVRows(csvContent);
    log(`Channel export: ${channelRows.length} rows`);

    // Merge aggregate metrics (impressions, CTR, unique_viewers) from Table data.csv into
    // the most recent daily row per video.
    const channelTableCSV = getTableCSVContent(filePath);
    if (channelTableCSV) {
      const channelAggregates = parseTableAggregates(channelTableCSV, true);
      mergeAggregatesIntoLatestRow(channelRows, channelAggregates);
      log(`Channel aggregate metrics merged for ${channelAggregates.size} videos`);
    }

    // Identify which videos the channel export missed (low-view videos are excluded)
    const matchedCodes = new Set(channelRows.map(r => r.clip_details_code as string));
    const missingVideos = Object.entries(VIDEO_MAP).filter(([, code]) => !matchedCodes.has(code));
    log(`Channel export covered ${matchedCodes.size} videos; running per-video export for ${missingVideos.length} missing`);

    const perVideoRows: Record<string, unknown>[] = [];
    for (const [videoId, clipDetailsCode] of missingVideos) {
      const rows = await exportVideoCSV(page, videoId, clipDetailsCode, downloadDir);
      perVideoRows.push(...rows);
    }
    log(`Per-video export: ${perVideoRows.length} rows`);

    const allRows = [...channelRows, ...perVideoRows];
    log(`Total rows collected: ${allRows.length}`);

    // Deduplicate — keep last occurrence of each (clip_details_code, platform, stat_date)
    const deduped = Array.from(
      allRows.reduce((map, row) => {
        const key = `${row.clip_details_code}|${row.platform}|${row.stat_date}`;
        map.set(key, row);
        return map;
      }, new Map<string, Record<string, unknown>>()).values()
    );
    if (deduped.length !== allRows.length) {
      log(`Deduplicated ${allRows.length} → ${deduped.length} rows`);
    }

    if (deduped.length > 0) {
      log('Upserting to studio_snapshots...');
      // Map every row through toStudioSnapshot so we only send columns that exist
      // in studio_snapshots (the scraper builds rows shaped for posts, with extras
      // like content_id / content_type / clip_code that aren't on this table).
      const toUpsert = deduped.map(toStudioSnapshot);
      const { error } = await supabase.from('studio_snapshots').upsert(toUpsert, {
        onConflict: 'clip_details_code,platform,stat_date',
        ignoreDuplicates: false,
      });
      if (error) {
        log(`ERROR: Upsert failed — ${JSON.stringify(error)}`);
      } else {
        log(`SUCCESS: Upserted ${deduped.length} rows to studio_snapshots`);
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
