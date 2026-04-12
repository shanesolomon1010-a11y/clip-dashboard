# YouTube Studio Playwright Sync — Design Spec

**Date:** 2026-04-11
**Status:** Approved

---

## Problem

The YouTube Analytics API does not expose per-video viewer segmentation metrics at daily granularity. The following columns in the `posts` table remain NULL for all YouTube rows: `unique_viewers`, `new_viewers`, `returning_viewers`, `casual_viewers`, `regular_viewers`, and others. YouTube Studio exports these in Advanced mode CSV exports.

---

## Goal

A local Playwright script that logs into YouTube Studio using the user's existing Chrome session, navigates to each video's analytics, exports all available metrics as CSV, and upserts them into the `posts` table as daily delta rows.

---

## Files Created

| File | Purpose |
|------|---------|
| `scripts/youtube-studio-sync.ts` | Main sync script |
| `scripts/youtube-studio-sync.sh` | Shell wrapper for launchd |
| `scripts/com.clipstudio.youtubesync.plist` | macOS launchd plist (6 AM daily) |
| `scripts/README.md` | Setup and troubleshooting instructions |
| `logs/.gitkeep` | Creates logs directory (only `.log` files are gitignored, not `.gitkeep`) |

---

## Prerequisite: Supabase Unique Constraint

The upsert conflict key `(clip_details_code, platform, stat_date)` requires a unique constraint on the `posts` table. This constraint does **not** exist in the current migrations. Create it before running:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS posts_clip_platform_statdate_idx
  ON posts (clip_details_code, platform, stat_date);
```

Add this as a migration file: `supabase/migrations/YYYYMMDD_posts_youtube_upsert_constraint.sql`

---

## Video Map (19 videos — all YouTube Shorts, confirmed)

```typescript
const VIDEO_MAP: Record<string, string> = {
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
```

---

## Environment

- **Project root:** `/Users/shane/clip-dashboard`
- **Chrome executable:** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Chrome profile:** `~/Library/Application Support/Google/Chrome` (profile: `Default`)
- **Headless:** No — YouTube Studio blocks headless browsers
- **Chrome flag:** `--disable-blink-features=AutomationControlled`
- **Download dir:** `os.tmpdir()/yt-studio-sync` (cleared each run)
- **Env vars from:** `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

---

## Per-Video Flow

For each video in VIDEO_MAP, open a **new page** (same browser context). Close on success or error.

1. **Navigate** to `https://studio.youtube.com/video/{videoId}/analytics/tab-reach/period-28days`
   - Wait for network idle, 30s timeout
   - On timeout: log error, skip video

2. **Enter Advanced mode**
   - Try selectors: `text="Advanced mode"`, `[aria-label*="advanced" i]`, `a:has-text("Advanced")`
   - If URL already contains `/advanced`, skip click
   - After click: wait for URL to contain `advanced` OR 3s delay

3. **Select all metrics**
   - In Advanced mode, the metric selector is a sidebar panel. Look for an "Add metric" or pencil/edit button near the chart area and click it to expand the panel
   - Once the panel is open, find unchecked `input[type="checkbox"]` elements and click each
   - If no panel open button is found, scan the page for checkboxes directly
   - **If 0 checkboxes found after both attempts: log error and skip this video** — continuing would upsert rows with all metric columns NULL, which defeats the purpose of the script

4. **Date range** — set via URL param `period-28days`; verify visually, do not hard-fail

5. **Export CSV**
   - Try selectors: `button:has-text("Export")`, `[aria-label*="export" i]`, `button:has-text("Download")`, `ytcp-button:has-text("Export")`
   - Set up download handler BEFORE clicking
   - Use `await download.saveAs(filePath)` where `filePath` uses a neutral extension: `{downloadDir}/{videoId}.bin`

6. **Parse download — ZIP or CSV**
   - After save, read the first 4 bytes of the file
   - If bytes start with `PK\x03\x04` (ZIP magic): treat as ZIP, use adm-zip to extract
     - Find CSV entry whose name contains "Chart" (case-insensitive); fallback to "Table", then first CSV entry
   - Otherwise: treat as plain CSV, read full file content as text
   - Do NOT rely on file extension for type detection (the extension is always `.bin`)

7. **Parse CSV**
   - Skip metadata header rows; find row where first cell is `"Date"` or matches `YYYY-MM-DD`
   - Strip quotes, trim whitespace from all cells
   - Skip rows that don't start with a valid date

---

## Download API Integration

Use Playwright's download API:

```typescript
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.click(exportSelector),
]);
const filePath = path.join(downloadDir, `${videoId}.bin`);
await download.saveAs(filePath);
// Now read filePath from disk with fs.readFileSync / adm-zip
```

---

## Column Mapping

| YouTube Studio CSV header | DB column | Notes |
|---|---|---|
| Date | `stat_date` | |
| Views | `views` | |
| Watch time (hours) | `watch_time_hours` | |
| Average view duration | `avg_view_duration_seconds` | Exported as `M:SS` or `H:MM:SS` string — always parse to total seconds (e.g. `1:23` → 83, `0:02:30` → 150) |
| Average percentage viewed (%) | `avg_view_percentage` | |
| Impressions | `impressions` | |
| Impressions click-through rate (%) | `impression_ctr` | |
| Likes | `likes` | |
| Dislikes | `dislikes` | |
| Comments added | `comments` | |
| Shares | `shares` | |
| Subscribers gained | `subscribers_gained` | |
| Subscribers lost | `subscribers_lost` | |
| Unique viewers | `unique_viewers` | |
| New viewers | `new_viewers` | |
| Returning viewers | `returning_viewers` | |
| Casual viewers | `casual_viewers` | |
| Regular viewers | `regular_viewers` | |

**Fixed per row:**
- `platform: 'youtube'`
- `content_type: 'short'` — all 19 videos confirmed as YouTube Shorts
- `clip_details_code`: value from VIDEO_MAP
- `clip_code`: split `clip_details_code` on `-CLIP-`, take index 0 (e.g. `MBM015-CLIP-014 → MBM015`). If `-CLIP-` not present, use the full `clip_details_code` as fallback and log a warning

**Not in CSV export — will remain NULL:**
- `hypes`, `hype_points` — YouTube does not include these in CSV downloads

---

## Upsert

Single batch upsert after all videos are processed. This is intentional — if the script is interrupted mid-run, no partial data is written. Acceptable tradeoff for a nightly automation script.

```typescript
await supabase.from('posts').upsert(allRows, {
  onConflict: 'clip_details_code,platform,stat_date',
  ignoreDuplicates: false,
});
```

---

## Logging

- All output: console + `logs/youtube-studio-sync.log`
- Format: `[ISO-timestamp] message`
- Log per-video: start, metrics selected count, rows parsed, skip/error
- Log final: total rows upserted, any errors

---

## Chrome Safety

- Check `pgrep -x "Google Chrome"` before launch
- If Chrome is already running: log error, exit code 1
  - Intended behavior — launchd runs at 6 AM when Chrome is typically closed
  - For manual runs: close Chrome first
- Always close browser in `finally` block
- Each video's processing is wrapped in try/catch — one video failure does not abort the run

---

## Dry-Run Mode

`--dry-run` flag: log VIDEO_MAP entries and exit before launching Chrome. Validates the script compiles and env vars load.

---

## Scheduling

- Shell wrapper: `/Users/shane/clip-dashboard/scripts/youtube-studio-sync.sh`
- Uses `npx tsx` to run the TypeScript directly
- launchd plist: `com.clipstudio.youtubesync` — runs at 6:00 AM daily
- Logs: stdout → `logs/launchd-stdout.log`, stderr → `logs/launchd-stderr.log`

---

## .gitignore Additions

```
logs/*.log
logs/launchd-*.log
```

---

## Dependencies to Install

```
npm install playwright-core adm-zip dotenv --save-dev
npm install @types/adm-zip --save-dev
```
