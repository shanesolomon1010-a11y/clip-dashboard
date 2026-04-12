import { test } from 'node:test';
import assert from 'node:assert/strict';

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
  assert.equal(parseTimeToSeconds(undefined), null);
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
  assert.equal(rows.length, 2);
});

test('parseCSVRows: returns empty array if no Date header found', () => {
  const rows = parseCSVRows('no header here\njust garbage', 'MBM015-CLIP-014');
  assert.equal(rows.length, 0);
});

test('parseCSVRows: correctly parses quoted numbers with commas', () => {
  const csv = `"Date","Views"
"2025-01-01","1,234"
`;
  const rows = parseCSVRows(csv, 'MBM015-CLIP-014');
  assert.equal(rows[0].views, 1234);
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
