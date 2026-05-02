# Data-layer audit — surviving tabs

_Read-only investigation. Scope: Dashboard, Founder Report, Posting Schedule, Settings._

The `posts` table is **daily-delta data**: each row is one `(clip_details_code, platform, stat_date)` tuple holding _that day's incremental_ views/likes/comments/etc. `upsertPosts` enforces this with `onConflict: 'clip_details_code,platform,stat_date'`. The canonical aggregation rule for "totals over a window" is therefore `SUM(...) WHERE stat_date BETWEEN x AND y`, **never** `MAX(stat_date)` and never "latest row only."

Most surviving code follows this rule. There are several places that don't, and one upstream write path that **corrupts the daily-delta invariant itself** by stamping lifetime totals into the daily-delta `views` column. That write path is the most likely cause of the "8K one day, 2.5K the next" symptom.

---

## Section 1 — `posts` table read inventory

Every Supabase query that touches `posts`, traced to its caller in the surviving tabs.

| # | File:line | Reached from (surviving tab) | Metric returned | Aggregation | What it claims | Match? |
|---|---|---|---|---|---|---|
| 1 | `src/lib/db.ts:130` (`getPosts`) | **Dead** — no callers. | All columns | None (raw rows + `posted_at` filter) | "Posts in date range" | n/a |
| 2 | `src/lib/db.ts:141` (`fetchAllPosts`) | **Dead** — no callers. | All columns | None (raw rows) | "All posts" | n/a |
| 3 | `src/lib/db.ts:154` (`getLatestPostsPerClip`) | **Dashboard** (page.tsx:50 → `posts` prop, plus DashboardView:61), and **Settings → Library/Sync flows** indirectly | All columns | **One row per `(clip_code, platform)` at MAX(stat_date)**, with agent-only fields back-filled from older rows | Comment says: "Returns one row per clip_code+platform using the latest stat_date" | ⚠️ Claim is honest, but DashboardView treats this as the global `posts` prop and consumers do not all interpret it as a snapshot — see Section 3. |
| 4 | `src/lib/db.ts:209` (`getTotalViewsPerClip`) | **Dashboard** transitively only via the `posts` prop chain (no direct call from Dashboard); used by **Content / Platforms / Comparison** (out of audit scope). Surviving-tab impact: none direct. | `views` only | **SUM** of `views` grouped by `(clip_code, platform)` across all stat_dates | "Total views per clip" | ✅ Aggregation matches name. |
| 5 | `src/lib/db.ts:241` (`getAllPostsByDate`) | **Dashboard** (DashboardView:60) | All columns | None (raw rows ordered ASC by stat_date) | "Returns all rows ordered by stat_date ASC — used by Analytics metric cards" | ✅ Caller does the SUM downstream. |
| 6 | `src/lib/db.ts:256` (`getAllPosts`) | **Settings → DataEditorTab** (DataEditorTab:52) | All columns | None (raw rows) | "Returns all rows unfiltered — used by the Data Editor" | ✅ Editor needs raw rows. |
| 7 | `src/lib/db.ts:288` (`updatePost`) | **Settings → DataEditorTab** | n/a | UPDATE by id | Single-row write | ✅ |
| 8 | `src/lib/db.ts:293` (`deletePost`) | **Settings → DataEditorTab** | n/a | DELETE by id | Single-row delete | ✅ |
| 9 | `src/lib/db.ts:388` (`upsertPosts`) | **page.tsx:70** (CSV upload via UploadZone) and **`/api/youtube/sync` route, `youtube-sync.ts`** | n/a | UPSERT by `(clip_details_code, platform, stat_date)` | Write-side; expects daily-delta semantics | ⚠️ **Write-side semantics are violated by the CSV path — see Section 3 #1.** |
| 10 | `src/lib/db.ts:435` (`updatePostContentType`) | Out of scope (Content) | n/a | UPDATE | Mutates `content_type` only | ✅ |
| 11 | `src/lib/db.ts:537` (`fetchClipDetails` lookup helper) | Used by VideoModalContext clicks anywhere a clip is opened | Returns `clip_details_code` only | `LIMIT 1 + maybeSingle()` | Resolve a clip_code → clip_details_code | ✅ Just an ID lookup. |
| 12 | `src/lib/db.ts:584` (`updatePostsClipDetailsCode`) | **Settings** (clip detail editor) | n/a | UPDATE | Backfill clip_details_code | ✅ |
| 13 | `src/lib/db.ts:703` (`fetchClipStats`) | **Dead** — no callers. | views, likes, comments, shares | **Latest stat_date row per platform, then summed across platforms** | Function name is "ClipStats" (ambiguous); body comment says nothing. The implementation reads "latest snapshot per platform." | ⚠️ The aggregation is "latest day per platform" but the field is exposed as `ClipStats` — would mislead any future caller. Currently dead. |
| 14 | `src/app/api/founder-report/route.ts:49` | **Founder Report** | views, watch_time_hours, subscribers_gained/lost, content_type, stat_date | Raw rows, then **SUM** in a JS for-loop, with `stat_date BETWEEN x AND y` filter | "Daily metric rows in range — drives views, watch time, subs delta, lastDataDate" | ✅ Correct. |
| 15 | `src/app/api/founder-report/route.ts:61` | **Founder Report** | content_id, content_type, posted_at | Raw rows, then `Set.size` per content_type, with `posted_at BETWEEN x AND y` filter | "Posted-in-range rows — drives published counts (distinct content_id per content_type)" | ✅ Correct. |
| 16 | `src/app/api/diagnostics/route.ts:159, 168` | **Settings → Diagnostics** | `updated_at` only | `ORDER BY updated_at DESC LIMIT 1 + maybeSingle()` | Cron freshness check | ✅ Matches purpose (freshness, not totals). |
| 17 | `src/app/api/diagnostics/route.ts:203, 213` | **Settings → Diagnostics** | `stat_date` only | `ORDER BY stat_date DESC LIMIT 1 + maybeSingle()` | Data freshness check | ✅ |
| 18 | `src/app/api/diagnostics/route.ts:264` | **Settings → Diagnostics** | `clip_details_code` only | Raw rows, used to compute orphan-count | Orphan check | ✅ |
| 19 | `src/app/api/diagnostics/route.ts:345` | **Settings → Diagnostics** | content_type, views, watch_time_hours | Raw rows + `stat_date BETWEEN x AND y`, then **SUM** in JS | "Re-compute the founder report and compare to displayed values" | ✅ Internal-consistency check. |
| 20 | `src/app/api/diagnostics/route.ts:430` | **Settings → Diagnostics** | clip_details_code, platform, stat_date, views | Raw rows, used to compare against `studio_snapshots` per (clip,platform,date) | Drift detection between cron-API data and Studio scraper data | ✅ |
| 21 | `src/app/api/diagnostics/route.ts:522` | **Settings → Diagnostics** | various | (similar drift check) | drift comparison | ✅ |
| 22 | `src/app/api/youtube/sync/route.ts:61` | **Settings → "Sync YouTube Analytics" button** | content_id, clip_code | Raw rows, used to build `videoMap` | Discover which videos to sync | ✅ Just an ID lookup. |
| 23 | `src/lib/youtube-longform-sync.ts:302` | Cron + **Settings → "Sync long-form" button** | n/a | UPSERT (write path) | Cron daily-delta upsert | ✅ Write side. |
| 24 | `src/components/YouTubeMergerTab.tsx:101` | **Settings → YouTube Merger tab** | `stat_date` only | Raw rows, used to populate a Set of imported dates | "Calendar of imported dates" | ✅ Display-only marker; not a metric. |

---

## Section 2 — Library helper functions and how each call site uses them

### 2.1 `getLatestPostsPerClip(platform?)` — `src/lib/db.ts:152`

**Strategy:** Order all rows by `stat_date DESC`, then group by `(clip_code, platform)` and keep the first (= latest) row. For "agent-only" fields (`unique_viewers`, `new_viewers`, `returning_viewers`, `casual_viewers`, `regular_viewers`, `impressions`, `impression_ctr`, `stayed_to_watch_pct`, `hypes`, `hype_points`, `post_subscribers`) that are null on the latest row, walk older rows of the same key and back-fill the first non-null value found.

**Returns:** One `UnifiedPost` per `(clip_code, platform)`, with metric values that are **a single day's deltas** for `views`/`likes`/`comments`/`shares`/`watch_time_*` (because those are not in the back-fill list) but **may be from older stat_dates** for the back-filled agent-only fields.

**Call sites:**

| # | File:line | What it displays | Correct usage? |
|---|---|---|---|
| A | `src/app/page.tsx:50` | Sets the global `posts` prop passed to every view | ⚠️ **Mixed.** The shape "one row per clip at the latest stat_date" is a defensible default for surfaces that show *one card per clip* (Platforms, Comparison). But Dashboard, Content, and Founder Report all consume `posts` in places that imply totals/sums — see Section 3. |
| B | `src/components/views/DashboardView.tsx:61` | Powers `latestClipPosts` → drives `impressionCtrDisplay` and `topUniqueViewers` | ✅ for `unique_viewers` (it is a period-aggregate by definition; latest row + back-fill is the only sensible reading). ⚠️ for `impressionCtrDisplay` — see Section 3 #3. |

### 2.2 `getTotalViewsPerClip(platform?)` — `src/lib/db.ts:202`

**Strategy:** SELECT `clip_code, clip_details_code, platform, views` filtered by platform, then SUM in JS grouped by `(clip_code, platform)`, sorted DESC.

**Returns:** `{ clip_code, clip_details_code, platform, total_views }[]`.

**Call sites (none in the audit scope — listed for completeness):** Content (`ContentView.tsx:23`), Platforms (`PlatformsView.tsx:24`), Comparison (`ComparisonView.tsx:93`). All three use it as a per-clip total. ✅ correct.

### 2.3 `getAllPostsByDate(platform?)` — `src/lib/db.ts:239`

**Strategy:** SELECT all rows ordered ASC by stat_date, optionally platform-filtered. No aggregation.

**Returns:** Every daily-delta row, flat, sorted by stat_date.

**Call sites:**

| # | File:line | What it displays | Correct usage? |
|---|---|---|---|
| A | `src/components/views/DashboardView.tsx:60` | Stores into `allDailyPosts`. Date-filtered into `dateFilteredDailyPosts`, which then feeds the Stats Grid (sums views/impressions/likes/comments/shares + weighted avg duration), the Channel Summary "Total Views" big number, the per-clip top list, the line chart, and `peakByClip` | ✅ All consumers do correct SUMs (or MAX for `peakByClip`). |

### 2.4 `getAllPosts(platform?)` — `src/lib/db.ts:254`

**Strategy:** Raw select, ordered by `clip_code` ASC, `stat_date` DESC.

**Call sites:** `DataEditorTab.tsx:52`. ✅ Correct — editor needs raw rows.

### 2.5 `fetchAllPosts()` — `src/lib/db.ts:139` and `getPosts()` — `src/lib/db.ts:125`

Both **dead**. Zero callers in `src/`.

### 2.6 `fetchClipStats(clipCode)` — `src/lib/db.ts:701`

**Dead** — zero callers in `src/`. If revived, should be renamed/rewritten — its name implies "totals" but its body returns "latest stat_date row per platform, summed across platforms," which is neither lifetime totals nor daily delta — it's "one snapshot day per platform." Unsafe to call as-is.

### 2.7 `upsertPosts(posts)` — `src/lib/db.ts:323`

**Strategy:** UPSERT with `onConflict: 'clip_details_code,platform,stat_date'`. If two writers target the same conflict key with different `views` values, the later writer **overwrites**.

**Call sites:**

| # | File:line | Source | Semantics actually written | Daily-delta correct? |
|---|---|---|---|---|
| A | `src/app/page.tsx:70` (CSV upload via UploadZone in Content tab) | `normalizers.normalizeYouTube` reads `views` ?? `Views` ?? `total_views` and writes the result into the `views` column | If the CSV came from `YouTubeMergerTab` (Settings), `total_views` is a **lifetime cumulative number from YouTube Studio's "Views" column**, stamped with a single user-selected `stat_date` | ❌ **Daily-delta invariant broken.** See Section 3 #1. |
| B | `src/app/api/youtube/sync/route.ts:165` | YouTube Analytics API with `dimensions: 'day,video'` | Per-day deltas — one row per (video, day) | ✅ Correct daily-delta. |
| C | `src/lib/youtube-sync.ts:190` | YouTube Analytics API (the same daily-delta strategy) | Per-day deltas | ✅ |
| D | `src/lib/youtube-longform-sync.ts:302` | YouTube Analytics API for long-form | Per-day deltas | ✅ |

---

## Section 3 — High-risk pattern flags

Numbered, severity-tagged. Severity scale: **CRITICAL** = wrong number displayed today; **HIGH** = wrong if a particular tab/control is used; **MEDIUM** = misleading label, value technically defensible; **LOW** = dead code or cosmetic.

### 🔴 #1 — CRITICAL — `total_views` (lifetime) is written into the daily-delta `views` column via the CSV pipeline

**Smoking gun for "8K one day, 2.5K the next."**

The `YouTubeMergerTab` (Settings → YouTube Merger) takes two YouTube Studio CSV exports (chart + table). Per `YouTubeMergerTab.tsx:191-214`:

```
output row = {
  stat_date:           selectedDate,
  total_views:         table.Views,               // lifetime cumulative since publish
  total_engaged_views: table['Engaged views'],    // lifetime cumulative
  daily_engaged_views: sum of chart.Engaged views // sum of daily deltas in chart range
  ...
}
```

The user downloads `youtube-merged.csv` (`YouTubeMergerTab.tsx:221`) and re-uploads it through Content's UploadZone. UploadZone calls `parseCSV` → `normalizers.normalizeYouTube`. At `normalizers.ts:81`:

```
const views = parseNum(row['views'] || row['Views'] || row['total_views']);
```

When `views` and `Views` are absent, **`total_views` (lifetime) is silently substituted into the `views` field** that the rest of the app treats as a daily delta. `upsertPosts` then writes that lifetime number into the `views` column at the user-selected `stat_date`.

**Concrete failure mode:**

1. Cron has been writing daily-delta rows for clip X at stat_dates 2026-04-01 … 2026-04-30, each `views ≈ 100`.
2. User imports a CSV via YouTube Merger with `selectedDate = 2026-04-15`, lifetime `total_views = 8000`.
3. The 2026-04-15 row gets overwritten: `views = 8000`.
4. Dashboard's stats grid sums 2026-04-01 … 2026-04-30 → `30 × 100 + 7900 mismatch ≈ 10,900` instead of the real ~3,000.
5. Tomorrow another sync happens and the cron rewrites 2026-04-15 with `views = 100` again — total drops back to ~3,000.

This explains the **"8K one day, 2.5K the next" volatility exactly**: it depends on which writer touched the conflict-key row most recently.

The same hazard applies to `total_engaged_views` (CSV column: `Engaged views`), which is also lifetime-cumulative but currently stored in a `total_engaged_views` column that isn't summed by the Dashboard — but any future code that sums it across stat_dates would multiply the same lifetime number N times.

**Affects:** every read in the audit that does `SUM(views)` over `stat_date BETWEEN ...`:
- DashboardView Stats Grid "Total Views"
- DashboardView Channel Summary "Total Views" (right rail)
- DashboardView Views Over Time line chart (per-clip per-day series)
- Founder Report "Long-form Views" / "Shorts Views"
- Diagnostics internal-consistency re-compute
- Diagnostics drift-vs-studio_snapshots check

### 🟠 #2 — HIGH — DashboardView Platform Breakdown (right rail) uses `getLatestPostsPerClip` output as if it were a total

**File:** `DashboardView.tsx:106-113`, rendered at lines 414-445.

`platformTotals` is computed from `filteredPosts.filter(p => p.platform === pl).reduce((s, p) => s + p.views, 0)`. `filteredPosts` is derived from the `posts` prop (which is `getLatestPostsPerClip()` output from `page.tsx:50`), date-filtered.

That means the platform breakdown number is **the sum of one-day-per-clip values**, not the sum of all daily-delta rows in the date range. For a 30-day filter, this systematically under-reports the platform totals by ~30× compared to the stats grid Total Views (which uses `getAllPostsByDate`). The two numbers shown on the same Dashboard come from different aggregation strategies and are not internally consistent.

The user-visible inconsistency: stats grid says "Total Views: 1.2M" (correct SUM), platform breakdown says "YouTube: 45K · Instagram: 12K" (sum of latest-day-only).

### 🟠 #3 — HIGH — DashboardView Impression CTR pulls impressions from latest-day-only rows

**File:** `DashboardView.tsx:177-186`.

```
for (const p of latestClipPosts) {
  if (p.impressions) {
    sumImpressions += p.impressions;
    if (p.impression_ctr != null) sumWeightedCtr += p.impressions * p.impression_ctr;
  }
}
```

`latestClipPosts` = `getLatestPostsPerClip('youtube')`. Even though `impressions` is in the `AGENT_FIELDS` back-fill list, the back-fill picks the most recent older row that had a value — so the "impressions" number is **one day's impressions from whatever the back-fill found**, not the impressions across the user-selected date range.

Symptom: Dashboard shows "Impression CTR" as a card with no date label, but the underlying number is sensitive to (a) whether the cron ran today and back-fill skipped to yesterday, and (b) whether `impressions` is currently being written by the cron at all (the field comment in `getLatestPostsPerClip` says "the Analytics API writes newer daily rows without these"). Effective behavior: a snapshot of one day's impressions is divided as if it were a window-aggregated CTR.

### 🟡 #4 — MEDIUM — Stats Grid "Total Impressions" sums daily-deltas of a field that may be cumulative-by-source

**File:** `DashboardView.tsx:158, 169` and label at line 220.

`statsGrid.totalImpressions` = SUM of `p.impressions` across all daily-delta rows in the date filter window. This is correct *if* `impressions` is daily-delta (which is what `/api/youtube/sync` writes — YouTube Analytics with `dimensions: 'day,video'` returns per-day impressions). However:

- `impressions` is also one of the fields written by the Playwright "agent" (per the `getLatestPostsPerClip` comment) where it represents a **period-aggregate**, not a daily delta. If the agent ever wrote impressions onto an existing daily row, summing across the window would over-count.
- The `YouTubeMergerTab` CSV path also passes `impressions` through (table column `Impressions`). YouTube Studio's "Impressions" in the table view is **lifetime cumulative**, so this has the same #1 hazard for impressions if the Merger CSV is uploaded.

Severity is medium only because we cannot confirm from code alone which writer is currently active for `impressions`. If only `/api/youtube/sync` writes it in production, this is fine.

### 🟡 #5 — MEDIUM — DashboardView Total Posts (right rail) is "count of clips whose latest snapshot fell in the date filter," not "posts in the range"

**File:** `DashboardView.tsx:404` showing `filteredPosts.length`.

`filteredPosts` is `posts.filter(...)` then date-filtered on `stat_date ?? date`. Because `posts` is `getLatestPostsPerClip()` output, you only see one row per `(clip_code, platform)`. A clip whose **latest stat_date** falls outside the selected window will be excluded — even if it had daily-delta rows inside the window. Conversely, a clip's "Total Posts" count never grows by adding daily rows; it only grows by adding new clips.

For a 7-day window during a stretch when the cron was healthy, this happens to match the count the user expects (every clip has a row for yesterday). But for a 7-day window where a few clips' last sync was 10 days ago, those clips silently disappear from the count.

### 🟡 #6 — MEDIUM — DashboardView fallback path for "Top Content" sorts by single-day views

**File:** `DashboardView.tsx:98-101`.

```
const topPosts = useMemo(() => {
  if (dateFilteredClipTotals.length > 0) return dateFilteredClipTotals.slice(0, 6);
  return [...filteredPosts].sort((a, b) => b.views - a.views).slice(0, 6);
}, ...);
```

The happy path uses `dateFilteredClipTotals` (correct SUM). The fallback (taken when `dateFilteredClipTotals` is empty — i.e., when `getAllPostsByDate` returned no rows in the window) uses `filteredPosts.sort(b.views - a.views)`, which is the latest-day view count per clip. The labeling does not change between paths. If the cron is unhealthy and `getAllPostsByDate` returns no rows for "yesterday", the fallback shows the right *clips* but the wrong *number* (one-day views, not range total). UI presents both as the same thing.

### 🟡 #7 — MEDIUM — `fetchClipStats` (dead) returns "latest day per platform" while its name implies totals

**File:** `src/lib/db.ts:701-725`. Currently no callers, but documented here so it doesn't get re-introduced as a "Total Stats" function.

### 🔵 #8 — LOW — `getPosts`, `fetchAllPosts` are dead code

`src/lib/db.ts:125, 139`. No callers anywhere in `src/`. Each duplicates a slightly different cut of "select all posts." Removing them would shrink the surface area for future bugs.

### 🔵 #9 — LOW — Diagnostics drift check assumes `studio_snapshots.views` and `posts.views` are comparable per-day

`src/app/api/diagnostics/route.ts:418-440` builds a per-(clip, platform, stat_date) drift check between `posts` and `studio_snapshots`. If `studio_snapshots.views` is itself a cumulative scrape rather than a daily delta (the table is named "snapshots" — typically those are lifetime scrapes), then the drift check is comparing apples to oranges. Confirm the studio snapshot schema before relying on this signal.

---

## Section 4 — Data sources feeding the surviving tabs

### 4.1 Writers into `posts` (current, alive)

| Writer | Trigger | Semantics written | Field set |
|---|---|---|---|
| `/api/cron/youtube-sync/route.ts` (cron, 14:00 UTC daily) → `lib/youtube-sync.ts` → `upsertPosts` | Cron schedule in `vercel.json` | **Daily-delta** rows, `dimensions: day,video` | YouTube short metrics |
| `/api/cron/youtube-sync-longform/route.ts` (cron, 14:30 UTC daily) → `lib/youtube-longform-sync.ts` → direct upsert | Cron schedule | **Daily-delta** rows | YouTube long-form metrics |
| `/api/youtube/sync/route.ts` (POST) | Settings → YouTube section "Sync now" | **Daily-delta** rows (same dimensions as cron) | YouTube short metrics |
| `/api/youtube-sync/route.ts` (POST) | Settings → "Sync YouTube Analytics" button | **Daily-delta** rows | (verify — likely same as `/api/youtube/sync`) |
| `/api/youtube-sync-longform/route.ts` (POST) | Settings → "Sync long-form" button | **Daily-delta** rows | YouTube long-form metrics |
| `page.tsx:70` `handleUpload` from `UploadZone` (Content tab CSV) | User-uploaded CSV via Content | **MIXED.** If the CSV is the YouTube Merger output, `total_views` (lifetime) overwrites the daily-delta `views` field for the user-selected stat_date. See Section 3 #1. | YouTube short metrics, sometimes Instagram |
| `DataEditorTab` (`updatePost`, `deletePost`) | Settings → Data Editor | Direct edits to single rows | Any field |

### 4.2 Other writers (relevant context)

| Writer | Target table | Notes |
|---|---|---|
| Playwright/agent scraper (referenced in code comments, not in `src/`) | `studio_snapshots` *and* sometimes `posts` agent-only fields | The `getLatestPostsPerClip` comment names eleven "agent-only" fields written via this path: `unique_viewers`, `new_viewers`, `returning_viewers`, `casual_viewers`, `regular_viewers`, `impressions`, `impression_ctr`, `stayed_to_watch_pct`, `hypes`, `hype_points`, `post_subscribers`. These are **period-aggregates**, not daily deltas — the agent stamps them onto a chosen `stat_date` row. |
| `clip_details` writes from Settings, `/api/import/clips`, `/api/library/sync-urls` | `clip_details` | Clip metadata (titles, captions, video_url, thumbnails). Not metrics. |
| `scheduled_posts` writes from `PostingScheduleView` | `scheduled_posts` | Posting schedule. Not metrics. |

### 4.3 Per-tab consumption map

| Surviving tab | Read sources used |
|---|---|
| **Dashboard** | `getLatestPostsPerClip()` (via `posts` prop from `page.tsx`), `getAllPostsByDate('youtube')` (in DashboardView), `getLatestPostsPerClip('youtube')` (in DashboardView). All three target the same `posts` table. |
| **Founder Report** | `/api/founder-report` → two queries against `posts` (one filtered by `stat_date`, one by `posted_at`). Server-side SUM aggregation. |
| **Posting Schedule** | `scheduled_posts` table + `clip_details` table. **No reads from `posts`.** |
| **Settings** (and its sub-tabs) | `clip_details` (metadata), `posts` (raw rows for DataEditor and a stat_date Set for the Merger calendar), `studio_snapshots` (via `/api/diagnostics`), `long_form_videos` (via long-form sync), `youtube_auth` (via sync). Plus calls into `/api/youtube/sync`, `/api/youtube-sync*`, `/api/library/sync-urls`, `/api/import/clips`, `/api/diagnostics`, `/api/founder-report` (used by diagnostics consistency check). |

Tabs that read both API-fed *and* CSV-fed data for the same metric: **Dashboard** and **Founder Report**. Both will produce different numbers depending on which writer touched a given (clip, stat_date) cell most recently — see Section 3 #1.

---

## Section 5 — Deep dive: the Dashboard 30-day view count pipeline

This is the smoking gun for "8K one day, 2.5K the next." Tracing end-to-end.

### 5.1 The visible card

**Component:** `DashboardView.tsx:219` — Stats Grid card labeled `"Total Views"`, value `formatNum(statsGrid.totalViews)`.
**Mirror:** `DashboardView.tsx:396` — Channel Summary right-rail "Total Views" big number, value `formatNum(totalViews)` where `totalViews = dateFilteredClipTotals.reduce((s, c) => s + c.total_views, 0)`. Both values are computed independently but should match.

### 5.2 Frontend aggregation

```
DashboardView.tsx:60     allDailyPosts ← getAllPostsByDate('youtube')   // every daily-delta row
DashboardView.tsx:75-81  dateFilteredDailyPosts ← allDailyPosts filtered by p.stat_date ?? p.date in [filterStart, filterEnd]
DashboardView.tsx:152-175 statsGrid.totalViews ← Σ p.views for p in dateFilteredDailyPosts
DashboardView.tsx:83-95  dateFilteredClipTotals ← group dateFilteredDailyPosts by clip_code, sum views
DashboardView.tsx:103    totalViews ← Σ c.total_views for c in dateFilteredClipTotals
```

Both totals reduce to the same expression: `Σ views over all daily-delta rows where stat_date ∈ [start, end] AND platform = 'youtube'`. This is **the canonically correct aggregation** for a daily-delta table.

### 5.3 Date filter

`DateFilterBar` + `useDateFilter('30d')` produce `filterStart` and `filterEnd`. For the default 30d preset: `end = today (local)`, `start = today - 30 days`. Both formatted as YYYY-MM-DD. Filtering uses string comparison `d >= filterStart && d <= filterEnd` against `p.stat_date ?? p.date`.

Note: `p.stat_date` falls back to `p.date` (which is `posted_at` truncated to YYYY-MM-DD). If a row has no `stat_date` (legacy CSV imports might not have one), it gets filtered using its publish date instead. This is mostly harmless but means posts published before the window with no `stat_date` are excluded.

### 5.4 The Supabase query

`getAllPostsByDate('youtube')` (`db.ts:239`):

```
supabase.from('posts').select('*').eq('platform', 'youtube').order('stat_date', { ascending: true })
```

No date filter is applied at the database — the entire posts table is fetched and filtered in JS. (Performance note: at scale this is a lot of data shipped to the browser, but not a correctness issue.) Result is mapped to `UnifiedPost` via `mapPostRow`.

### 5.5 Where the value is corrupted upstream

Refer to Section 3 #1. The bug is **not** in this read pipeline. The read pipeline is correct. The bug is that the `views` column itself contains mixed semantics:

- For most `(clip, stat_date)` cells: real daily delta from `/api/cron/youtube-sync` (small number, ~50-300/day).
- For cells that were touched by a YouTube Merger CSV upload: lifetime cumulative `total_views` from YouTube Studio (large number, thousands+).
- After the next cron run, those poisoned cells get overwritten back to daily-delta values (small numbers).

So when the Dashboard reads "Σ views over the last 30 days," the answer oscillates between:
- "Mostly correct, ~3,000" (right after cron runs and overwrites poisoned cells)
- "Inflated by lifetime totals, ~8,000+" (right after a YouTube Merger CSV is uploaded)

The visible "8K one day, 2.5K the next" pattern is an exact match for: user uploads CSV → poisoned cell → next cron pass overwrites it → number drops.

### 5.6 Confirmatory clue inside the code

`/api/diagnostics/route.ts:307-403` (`buildInternalConsistency`) already exists and re-computes the founder report's view total from raw `posts` rows, then compares it to what `/api/founder-report` returns. The check is `status: 'red' if any delta > 0.0001`. If the two numbers ever disagree, the diagnostics tab will flag it. Run it after a CSV import, then again the next morning — the delta should bounce around for the affected clips.

---

## Section 6 — Recommended fixes (plain English, no code)

All of these are *recommendations*. None of them are applied to the codebase.

### 6.1 Stop poisoning the `views` column from CSV uploads (root cause of the volatility bug)

The CSV import path silently substitutes `total_views` (lifetime) for `views` (daily delta) when neither `views` nor `Views` is present in the row. The fix is to **never let lifetime totals reach the daily-delta `views` column**. Three ways to do this, in increasing scope:

1. **Cheapest:** Remove the `|| row['total_views']` fallback in `normalizers.normalizeYouTube` so `views` is only read from explicitly-named daily-delta columns. CSVs that lack a daily `views` column would write `views = 0`, which sums correctly (it just contributes nothing).
2. **Better:** In `YouTubeMergerTab`, change the output column name from `total_views` to a name that the normalizer ignores (e.g., `lifetime_views_do_not_use_for_aggregation`). The Merger today produces lifetime values it has no good place to store; storing them in the daily-delta table is the actual mistake.
3. **Best:** Decide whether the YouTube Merger flow should exist at all now that the cron-driven `/api/youtube/sync` writes correct daily-deltas. If the Merger predates the cron and is no longer needed, deleting it removes the corruption surface entirely. (This needs a product call; the audit only flags the hazard.)

### 6.2 Make the Dashboard's right-rail Platform Breakdown use the same aggregation as the Stats Grid

Today the Stats Grid reads from `dateFilteredDailyPosts` (sum of daily-deltas, correct) but the Platform Breakdown reads from `filteredPosts` (`getLatestPostsPerClip` result, latest-day-only). These two values are on the same screen and should be internally consistent.

The fix is to compute platform totals from `dateFilteredDailyPosts` instead of `filteredPosts`. Same data shape, just sum-grouped by platform instead of by clip.

### 6.3 Fix or remove the Dashboard Impression CTR card

The current implementation pulls `impressions` from one back-filled stat_date per clip, then divides one weighted product by another. The result is not a CTR over the user-selected date range — it's a CTR snapshot of whatever stat_dates the back-fill ended up on. Either:

1. Compute CTR by SUMing `impressions` and `views` over `dateFilteredDailyPosts` and dividing once at the end, mirroring the Stats Grid pattern; or
2. Drop the card and surface only the `impressions` figure that is already in the Stats Grid (so the user knows they're reading window-summed impressions, not a weighted CTR).

### 6.4 Make the Dashboard Top Content fallback path explicit

If `getAllPostsByDate` returns no rows in the date window, the fallback ranks clips by their single-day `views`. That's defensible only if the UI says so. A small label change ("based on most recent snapshot — no daily data in window") would let the user trust the right-hand number.

### 6.5 Delete dead code in `db.ts`

`getPosts`, `fetchAllPosts`, and `fetchClipStats` have no callers. `fetchClipStats` in particular is dangerous — its name implies cumulative totals while its body returns single-day snapshots. Remove all three.

### 6.6 Confirm `studio_snapshots` semantics before trusting the diagnostics drift check

The drift check (`/api/diagnostics/route.ts:418`) compares `posts.views` to `studio_snapshots.views` per `(clip, platform, stat_date)`. If `studio_snapshots.views` is a cumulative scrape (typical for "snapshot" tables) while `posts.views` is daily-delta, the drift signal is meaningless. Confirm the schema; if mismatched, change the comparison to "studio snapshot views ≥ sum of posts views up to that date."

### 6.7 Add a write-side guard for daily-delta semantics

`upsertPosts` doesn't validate that incoming `views` is plausible as a daily delta. A simple sanity check ("if `views > 50000` for a single day, reject or warn") would have caught the YouTube Merger CSV issue at write time. Where exactly to enforce this is a judgment call; it can sit in `upsertPosts` itself, or in the CSV normalizer.

### 6.8 Document `getLatestPostsPerClip`'s contract more loudly

The function's docstring is correct but easy to miss. Three of its consumers (DashboardView platform breakdown, DashboardView Total Posts, DashboardView Impression CTR) treat its output as if it were window-summed. Renaming to `getLatestSnapshotPerClip` and adding a JSDoc warning ("⚠️ Do not SUM these values across clips when displaying a date-range total — these are single-day snapshots") would help future readers.
