# Analytics Tab — Visual & Structural Chart Spec

This document captures the **visual and structural** layer of every chart rendered in the Analytics tab. Data fetching, aggregation logic, and helper function names are intentionally omitted — that layer is being rebuilt and the old logic is irrelevant.

The Analytics tab itself is rendered by `src/components/views/AnalyticsView.tsx`. It mounts a fixed sequence of regions:

1. Date filter bar (preset pills + custom range calendar)
2. Platform toggle (YouTube / Instagram)
3. Demographics notice banner (YouTube only, no chart — informational only)
4. Metric selector dropdown
5. **Breakdowns section** (YouTube only) — 5 charts
6. **Metric card grid** — N cards, each containing a small chart (1 chart per selected metric)
7. Clip Details table (no chart)
8. Clip Performance table (YouTube only, no chart)

---

## Inventory

| # | Chart name (UI label) | Component / file | Graph type |
|---|---|---|---|
| 1 | *(per-metric)* — e.g. "Views", "Likes", "Avg View Duration" | `CardLineChart` in `src/components/views/AnalyticsView.tsx` | Multi-series line chart |
| 2 | "Duration (sec)" card | `DurationBarChart` in `src/components/views/AnalyticsView.tsx` | Vertical bar chart with top labels |
| 3 | "Traffic Sources" | `TrafficSourcesChart` → `HorizBarChart` in `src/components/charts/BreakdownCharts.tsx` | Horizontal bar chart |
| 4 | "Device Distribution" | `DeviceDistributionChart` → `DonutChart` in `src/components/charts/BreakdownCharts.tsx` | Donut (pie with inner radius) |
| 5 | "Subscriber Status" | `SubscriberStatusChart` → `DonutChart` in `src/components/charts/BreakdownCharts.tsx` | Donut (pie with inner radius) |
| 6 | "Top Countries" | `CountriesChart` → `HorizBarChart` in `src/components/charts/BreakdownCharts.tsx` | Horizontal bar chart |
| 7 | "Playback Location" | `PlaybackLocationChart` → `HorizBarChart` in `src/components/charts/BreakdownCharts.tsx` | Horizontal bar chart |

---

## Shared visual constants

These are referenced by multiple charts.

### Tooltip style (`TOOLTIP_STYLE`)

Used by every chart.

```ts
{
  background: '#1d1d1d',
  border: '1px solid rgba(247,231,206,0.1)',
  borderRadius: 8,
  padding: '6px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
}
```

### Color palette (`LINE_COLORS`)

Used as the index-based color cycle for line series, donut cells, and bar fills.

| Index | Hex | Usage |
|---|---|---|
| 0 | `#FF4444` | Red (default first series; bar fills) |
| 1 | `#FF8C42` | Orange |
| 2 | `#FFD166` | Yellow |
| 3 | `#06D6A0` | Green |
| 4 | `#118AB2` | Blue |
| 5 | `#7B2FBE` | Purple |
| 6 | `#F72585` | Pink |
| 7 | `#4CC9F0` | Cyan |

### Tick & axis styling (breakdown charts)

```ts
TICK_STYLE = { fill: 'rgba(247,231,206,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono' }
AXIS_STYLE = { stroke: 'rgba(247,231,206,0.06)' }
```

### Card wrapper (`BreakdownCard`)

Every breakdown chart is wrapped in a card with this chrome:

- Background: `var(--bg-card)`
- Border: `1px solid rgba(247,231,206,0.06)`
- Left accent border: `3px solid rgba(255,68,68,0.25)` (red)
- Border radius: `rounded-2xl`
- Padding: `px-4 pt-4 pb-3`
- Title: 10px uppercase, letter-spacing 0.14em, color `var(--text-3)`, font-weight 600, margin-bottom 1
- Optional subtitle: 10px, color `var(--text-3)`, margin-bottom 3

Loading state: card with `<div class="h-[200px] flex items-center justify-center">` containing the text "Loading…" in 12px `var(--text-3)`.

Empty state: same wrapper, text "No data available".

### Metric-card wrapper (used for charts 1 & 2)

Each card in the metric card grid:

- Background: `var(--bg-card)`
- Border: `1px solid rgba(247,231,206,0.06)`
- Left accent border: `3px solid rgba(255,68,68,0.25)` (YouTube) or `rgba(200,85,232,0.25)` (Instagram)
- Border radius: `rounded-2xl`
- Padding: `px-4 pt-4 pb-3`
- Hover border: `rgba(247,231,206,0.1)`
- Header rows above the chart:
  - Metric label: 10px uppercase, letter-spacing 0.14em, color `var(--text-3)`, weight 600
  - Big number: 2xl, weight 700, color `var(--gold)`, font `var(--font-mono)`, tabular-nums
  - Sub-label next to number: 10px, color `var(--text-3)` ("Total" or "Avg")
- Empty state inside card (when metric has no data): `<div class="h-[72px] flex items-center justify-center">` with text "No data" at 12px `var(--text-3)`

Grid layout: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.

---

## 1. Per-metric line chart (`CardLineChart`)

**Where:** Rendered inside each metric card in the metric-card grid (one card per selected metric, except `duration_seconds`).

**Component:** `CardLineChart` in `src/components/views/AnalyticsView.tsx` (lines 188–279).

**Library / component:** Recharts `<LineChart>` inside `<ResponsiveContainer>`.

**Graph type:** Multi-series line chart (one line per `clip_code`).

### Layout

- `<ResponsiveContainer width="100%" height={100}>` — fixed height 100px.
- Margin: `{ top: 4, right: 4, left: 0, bottom: 0 }`.

### X-axis

- `dataKey="label"` (pre-formatted `MMM D` date string)
- No axis label text
- Tick: `{ fill: 'rgba(247,231,206,0.25)', fontSize: 8, fontFamily: 'JetBrains Mono' }`
- `axisLine={false}`, `tickLine={false}`
- `interval="preserveStartEnd"`

### Y-axis

- `width={45}`, visible (`hide={false}`)
- Tick: `{ fontSize: 10, fill: '#9ca3af' }`
- `axisLine={false}`, `tickLine={false}`
- Tick formatter (per metric):
  - `avg_view_duration_seconds` → `M:SS` (e.g. `1:42`)
  - `watch_time_hours` / `watch_time_minutes` → `val.toFixed(1)`
  - `avg_view_percentage` / `engagement_rate` → `${val.toFixed(1)}%`
  - default → compact number formatter (`formatNum`)
- No domain explicitly set (Recharts auto)

### Series

- One `<Line>` per unique `clip_code`. Series `dataKey` is the clip code string.
- Stroke color: `LINE_COLORS[i % 8]` (cycles through the 8 hex codes above).
- `strokeWidth={1.5}`
- Dots: `{ r: 2, fill: <same series color> }`
- Active dot: `{ r: 3 }`
- `connectNulls={false}` — gaps stay as gaps.

### Legend

- Custom HTML legend rendered **below** the chart (not Recharts `<Legend>`).
- `flex flex-wrap gap-x-3 gap-y-1 mt-2`
- Each entry: a 12×2px rounded color swatch (matching the line color) + the clip code in 9px `rgba(247,231,206,0.4)`, `var(--font-mono)`.
- Hidden if there are no series.

### Tooltip

- Custom `content` renderer.
- Container: `TOOLTIP_STYLE`.
- Header: `props.label` (the formatted date) in `rgba(247,231,206,0.45)`, margin-bottom 4.
- One row per payload entry: `${name}: ${formattedValue}` styled `color: entry.color, fontWeight: 600`. Value formatted by metric:
  - `duration_seconds` → `${Math.round(val)}s`
  - `avg_view_duration_seconds` → `M:SS`
  - `watch_time_hours` → `${val.toFixed(1)} hrs`
  - `watch_time_minutes` → `val.toFixed(1)`
  - `avg_view_percentage` / `engagement_rate` → `${val.toFixed(2)}%`
  - default → `formatNum(val)`

### Reference lines / annotations

None.

### Empty state

If the parent metric card detects no data, the chart is **not rendered**; the card shows a 72px-tall "No data" placeholder instead (see metric-card wrapper section above).

---

## 2. Duration bar chart (`DurationBarChart`)

**Where:** Rendered inside the metric card for `duration_seconds` only (replaces `CardLineChart` for that one metric).

**Component:** `DurationBarChart` in `src/components/views/AnalyticsView.tsx` (lines 281–328).

**Library / component:** Recharts `<BarChart>` inside `<ResponsiveContainer>`.

**Graph type:** Vertical bar chart with value labels above each bar.

### Layout

- `<ResponsiveContainer width="100%" height={100}>` — fixed height 100px.
- Margin: `{ top: 14, right: 4, left: 0, bottom: 0 }` (top 14 to leave room for label-list values).

### X-axis

- `dataKey="label"` (clip code, sliced after `-CLIP-` if present)
- No axis label
- Tick: `{ fill: 'rgba(247,231,206,0.25)', fontSize: 7, fontFamily: 'JetBrains Mono' }`
- `axisLine={false}`, `tickLine={false}`
- `interval={0}` (every label rendered)

### Y-axis

- `<YAxis hide />` — fully hidden, no ticks, no axis line.
- No domain set.

### Series

- Single `<Bar dataKey="dur">`
- Fill: `LINE_COLORS[0]` = `#FF4444`
- `radius={[2, 2, 0, 0]}` (rounded top corners only)
- `<LabelList dataKey="dur" position="top">` — value labels above bars:
  - Formatter: `${Math.round(Number(v ?? 0))}s` (e.g. `42s`)
  - Style: `{ fill: 'rgba(247,231,206,0.4)', fontSize: 7, fontFamily: 'JetBrains Mono' }`

### Legend

None.

### Tooltip

- Custom `content` renderer.
- Container: `TOOLTIP_STYLE`.
- Line 1: clip code (`row.code`) in `rgba(247,231,206,0.45)`, margin-bottom 4.
- Line 2: `${dur}s` in `LINE_COLORS[0]` = `#FF4444`, weight 600.

### Reference lines / annotations

None.

### Empty state

If `data.length === 0`, the component returns `null` (the parent card's "No data" placeholder takes over).

---

## 3. Traffic Sources chart (`TrafficSourcesChart`)

**Where:** Top of the YouTube-only **Breakdowns** section, full-width.

**Component:** `TrafficSourcesChart` in `src/components/charts/BreakdownCharts.tsx`. Renders via the shared `HorizBarChart` helper.

**Library / component:** Recharts `<BarChart layout="vertical">`.

**Graph type:** Horizontal bar chart (top 10 sources by views).

**Card title:** `Traffic Sources` (no subtitle).

### Layout

- `<ResponsiveContainer width="100%" height={Math.max(180, data.length * 26)}>` — height grows with row count, minimum 180px.
- Margin: `{ top: 4, right: 8, left: 0, bottom: 4 }`.
- `BarChart` `layout="vertical"`.

### X-axis (numeric, horizontal direction)

- `type="number"`
- No `dataKey` (computed from series).
- No axis label.
- Tick: `TICK_STYLE` (`rgba(247,231,206,0.3)`, 10px, JetBrains Mono).
- `axisLine={AXIS_STYLE}` (`rgba(247,231,206,0.06)`).
- `tickLine={false}`.
- `tickFormatter={formatNum}` (compact number formatting).

### Y-axis (category, vertical direction)

- `type="category"`
- `dataKey="name"` (human-readable source label, mapped from raw enum values via `TRAFFIC_SOURCE_LABELS`).
- `width={140}` (overridden in the call).
- Tick: `TICK_STYLE`.
- `axisLine={false}`, `tickLine={false}`.
- No unit. No explicit domain.

### Series

- Single `<Bar dataKey="views">`.
- Fill: `LINE_COLORS[0]` = `#FF4444`.
- `radius={[0, 3, 3, 0]}` (rounded right side only).
- `maxBarSize={16}`.

### Legend

None.

### Tooltip

- Custom `content` renderer.
- Container: `TOOLTIP_STYLE`.
- Line 1: `row.name` in `rgba(247,231,206,0.5)`, margin-bottom 4.
- Line 2: `${formatNum(row.views)} views` in `LINE_COLORS[0]` = `#FF4444`, weight 600.
- Line 3: `${formatNum(Math.round(row.watchTime))} min watched` in `rgba(247,231,206,0.45)`.

### Reference lines / annotations

None.

### States

- **Loading:** `<LoadingCard title="Traffic Sources" />` — 200px-tall "Loading…" placeholder.
- **Empty:** `<EmptyCard title="Traffic Sources" />` — 200px-tall "No data available" placeholder.

---

## 4. Device Distribution chart (`DeviceDistributionChart`)

**Where:** Left column of the first 2-up grid below Traffic Sources (`md:grid-cols-2`).

**Component:** `DeviceDistributionChart` in `src/components/charts/BreakdownCharts.tsx`. Renders via the shared `DonutChart` helper.

**Library / component:** Recharts `<PieChart>` with `<Pie innerRadius={58} outerRadius={82}>`.

**Graph type:** Donut chart with center label and side legend.

**Card title:** `Device Distribution` (no subtitle).

### Layout

- Outer wrapper: `<div style={{ position: 'relative', height: 200 }}>`.
- `<ResponsiveContainer width="100%" height={200}>`.
- Pie geometry:
  - `cx="42%"`, `cy="50%"` (offset left to leave room for the right-side legend)
  - `innerRadius={58}`, `outerRadius={82}`
  - `startAngle={90}`, `endAngle={-270}` (starts at 12 o'clock, goes clockwise)
  - `strokeWidth={0}`
- `dataKey="value"`, slice label = `name` (mapped via `DEVICE_LABELS`: `MOBILE` → "Mobile", `DESKTOP` → "Desktop", `TABLET` → "Tablet", `TV` → "TV", `GAME_CONSOLE` → "Console").

### Series / cell colors (`DEVICE_COLORS`)

In data order:

| Index | Hex |
|---|---|
| 0 | `#FF4444` (LINE_COLORS[0]) |
| 1 | `#FF8C42` (LINE_COLORS[1]) |
| 2 | `#FFD166` (LINE_COLORS[2]) |
| 3 | `#888888` (gray) |

### Center label (absolutely positioned)

- Anchored at `top: 50%, left: 42%` with `translate(-50%, -50%)`, `pointer-events: none`.
- Top line: total views, `formatNum(total)` — 18px, weight 700, `var(--gold)`, `var(--font-mono)`.
- Bottom line: literal text `"total views"` — 9px, `rgba(247,231,206,0.4)`, `var(--font-mono)`.
- `lineHeight: 1.3`.

### Legend (custom HTML, right side)

- Absolutely positioned: `right: 8, top: 50%, transform: translateY(-50%)`.
- `display: flex; flex-direction: column; gap: 6; min-width: 120`.
- Per item:
  - 8×8px rounded swatch (`borderRadius: 2`) in the matching cell color.
  - Name line: 9px, `rgba(247,231,206,0.45)`, `var(--font-mono)`.
  - Value line: 10px, `rgba(247,231,206,0.7)`, `var(--font-mono)`, weight 600 — formatted as `${formatNum(value)} · ${pct}%`.

### Tooltip

- Custom `content` renderer.
- Container: `TOOLTIP_STYLE`.
- Line 1: slice name in `rgba(247,231,206,0.5)`, margin-bottom 4.
- Line 2: `${formatNum(value)} views` in `var(--gold)`, weight 600.
- Line 3: `${pct}% of total` in `rgba(247,231,206,0.45)` (1 decimal).

### Reference lines / annotations

None.

### States

- **Loading:** `LoadingCard("Device Distribution")` — 200px "Loading…".
- **Empty:** `EmptyCard("Device Distribution")` — 200px "No data available".

---

## 5. Subscriber Status chart (`SubscriberStatusChart`)

**Where:** Right column of the first 2-up grid below Traffic Sources.

**Component:** `SubscriberStatusChart` in `src/components/charts/BreakdownCharts.tsx`. Renders via the shared `DonutChart` helper.

**Library / component:** Recharts `<PieChart>` with `<Pie innerRadius={58} outerRadius={82}>`.

**Graph type:** Donut chart, two slices ("Subscribed", "Unsubscribed").

**Card title:** `Subscriber Status` (no subtitle).

### Layout

Identical to Device Distribution — same `DonutChart` helper, same geometry (`cx="42%"`, `cy="50%"`, `innerRadius={58}`, `outerRadius={82}`, start/end 90/-270, no stroke), same overall card height 200px, same legend position.

### Series / cell colors (`SUB_COLORS`)

| Index | Slice | Hex |
|---|---|---|
| 0 | Subscribed | `#118AB2` (LINE_COLORS[4], blue) |
| 1 | Unsubscribed | `#FF4444` (LINE_COLORS[0], red) |

### Center label

- Top line: `${unsubPct}%` (rounded integer % of unsubscribed views) — 18px, weight 700, `var(--gold)`, `var(--font-mono)`.
- Bottom line: literal text `"new viewers"` — 9px, `rgba(247,231,206,0.4)`, `var(--font-mono)`.

### Legend

Same structure as Device Distribution; items are `Subscribed` and `Unsubscribed`, with per-item value/percent lines.

### Tooltip

Identical structure to Device Distribution donut tooltip.

### Reference lines / annotations

None.

### States

- **Loading:** `LoadingCard("Subscriber Status")`.
- **Empty:** `EmptyCard("Subscriber Status")`.

---

## 6. Top Countries chart (`CountriesChart`)

**Where:** Left column of the second 2-up grid in the Breakdowns section.

**Component:** `CountriesChart` in `src/components/charts/BreakdownCharts.tsx`. Renders via the shared `HorizBarChart` helper.

**Library / component:** Recharts `<BarChart layout="vertical">`.

**Graph type:** Horizontal bar chart (top 10 countries).

**Card title:** `Top Countries`. **Subtitle:** `Last 30 days`.

### Layout

Same as Traffic Sources (`HorizBarChart` helper). Differences from Traffic Sources:

- `yWidth={120}` (Y-axis category column slightly narrower than Traffic Sources's 140).

All other chart props (margins, axis styling, bar fill `#FF4444`, bar radius, max bar size 16, tick formatter, tooltip) are identical to chart #3.

### Y-axis labels

- `name` is mapped from 2-letter ISO country codes via `COUNTRY_NAMES` (e.g. `US` → "United States", `GB` → "United Kingdom"). Unmapped codes fall back to the raw code.

### Tooltip

Same renderer as Traffic Sources — name, `views`, `watchTime` minutes.

### States

- **Loading:** `LoadingCard("Top Countries")`.
- **Empty:** `EmptyCard("Top Countries", "Last 30 days")` — empty card preserves the subtitle.

---

## 7. Playback Location chart (`PlaybackLocationChart`)

**Where:** Right column of the second 2-up grid in the Breakdowns section.

**Component:** `PlaybackLocationChart` in `src/components/charts/BreakdownCharts.tsx`. Renders via the shared `HorizBarChart` helper.

**Library / component:** Recharts `<BarChart layout="vertical">`.

**Graph type:** Horizontal bar chart.

**Card title:** `Playback Location`. **Subtitle:** `Last 30 days`.

### Layout

Same as Traffic Sources (`HorizBarChart` helper). Differences:

- `yWidth={110}` (narrowest of the three horizontal bar charts).

All other chart props (margins, axis styling, bar fill `#FF4444`, bar radius, max bar size 16, tick formatter, tooltip) are identical to chart #3.

### Y-axis labels

`name` is mapped from raw enum values via `PLAYBACK_LOCATION_LABELS`:

| Raw | Display |
|---|---|
| `WATCH` | Watch Page |
| `EMBEDDED` | Embedded |
| `MOBILE` | Mobile App |
| `CHANNEL` | Channel Page |
| `SHORTS` | Shorts |
| `BROWSE` | Browse |
| `UNKNOWN` | Unknown |
| `YT_OTHER` | YouTube (Other) |

### Tooltip

Same renderer as Traffic Sources.

### States

- **Loading:** `LoadingCard("Playback Location")`.
- **Empty:** `EmptyCard("Playback Location", "Last 30 days")`.

---

## Filter / control surface

Controls that influence which charts render and what data window they use. The controls themselves — not the data flow — are described here.

### Date filter bar

Rendered at the top of `AnalyticsView`. Layout: `flex items-center gap-1.5 flex-wrap`.

Four pill buttons in this order:

1. **7 Days** — preset value `'7d'`
2. **30 Days** — preset value `'30d'` (default selection on mount)
3. **All Time** — preset value `'all'`
4. **Custom Range** — opens a calendar popover

Pill styling:

- Class: `px-3 py-1.5 rounded-full text-xs font-semibold transition-all border`
- Active state: `background: var(--gold)`, `color: #000`, `border: transparent`
- Inactive: `background: rgba(247,231,206,0.04)`, `color: var(--text-3)`, `border: rgba(247,231,206,0.08)`
- The "Custom Range" pill additionally renders a `chevron-down` SVG (`w-3 h-3`) at its right edge. When a custom range is set, its label becomes `${start} → ${end}`.

**Affects:** charts 1, 2 (via `filteredClips`), and 3, 4, 5 (via `dateFrom`/`dateTo` props). Charts 6 (Countries) and 7 (Playback Location) **ignore the date filter** and always pull last-30-day data.

### Date range calendar (`DateRangeCalendar`)

Anchored popover under the "Custom Range" pill. Defined in `src/components/views/AnalyticsView.tsx` (lines 335–477).

- Container: `absolute z-50 top-full mt-2 left-0 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.1)] rounded-2xl shadow-2xl p-4 w-[280px]`.
- Header: prev/next month chevron buttons (7×7 rounded buttons, hover bg `rgba(247,231,206,0.06)`) flanking month/year text (13px, weight 600, `var(--text-1)`).
- Day-of-week row: `Su Mo Tu We Th Fr Sa` in 9px weight-600 `var(--text-3)`.
- Day grid: `grid-cols-7`. Per cell:
  - Empty cells (before month start) render a blank `<div>`.
  - Day cells: 11px text, 1.5 vertical padding, rounded.
  - Selected start/end: `background: var(--gold)`, `color: #000`, weight 700.
  - In-range hover state: `background: rgba(212,146,42,0.18)`, `color: var(--gold)`.
  - Default: transparent background, `color: var(--text-2)`.
- Footer: range summary text (10px `var(--text-3)`, max-width 130, truncate) on the left. Two buttons on the right:
  - "Cancel": 11px text, `var(--text-3)` → `var(--text-2)` on hover.
  - "Apply": 11px weight-600, `color: var(--gold)`, border `var(--gold-border)`, background `var(--gold-dim)`, disabled at 40% opacity until both endpoints are picked.

### Platform toggle

Rendered just below the date bar.

- Container: `flex gap-1 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-1`.
- Two pills: `YouTube`, `Instagram`.
- Active pill background:
  - YouTube → `#FF4444`
  - Instagram → `#C855E8`
- Active pill text color: `#fff`.
- Inactive pill: `background: transparent`, `color: var(--text-3)`.
- Pill class: `px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer select-none`.

**Affects:** which metric set is shown in the metric selector and the metric-card grid; whether the Breakdowns section (charts 3–7), Demographics notice, and Clip Performance table render at all (they are **YouTube-only**).

### Metric selector dropdown

Below the platform toggle and (on YouTube) the demographics notice.

- Trigger: `flex items-center gap-2 flex-wrap bg-[var(--bg-card)] border border-[rgba(247,231,206,0.08)] rounded-xl px-3 py-2 hover:border-[rgba(247,231,206,0.15)] min-w-[200px] text-left`.
- Trigger label: `Select Metrics` (11px `var(--text-3)`) followed by `(N selected)` count and a chevron-down icon (`w-3.5 h-3.5`, `ml-auto`).
- Dropdown panel: `absolute z-50 top-full mt-2 left-0 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.1)] rounded-2xl shadow-2xl p-4 min-w-[260px] max-h-[400px] overflow-y-auto`.
- Each option: `flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-[rgba(247,231,206,0.04)]` containing:
  - A native checkbox (`w-3.5 h-3.5`) with `accentColor` set to the active platform color (`#FF4444` or `#C855E8`).
  - Metric label (13px, `var(--text-2)`).

The metric list is platform-specific:

- **YouTube options:** `views`, `watch_time_hours`, `watch_time_minutes`, `avg_view_duration_seconds`, `avg_view_percentage`, `likes`, `dislikes`, `shares`, `comments`, `subscribers_gained`, `subscribers_lost`, `duration_seconds`.
- **YouTube defaults (selected on load):** `views`, `avg_view_duration_seconds`, `likes`, `watch_time_hours`.
- **Instagram options:** `views`, `plays`, `likes`, `comments`, `shares`, `reach`, `saves`, `profile_visits`, `follows`, `accounts_reached`, `accounts_engaged`, `engagement_rate`.
- **Instagram defaults (selected on load):** `views`, `likes`, `comments`, `shares`.

Display labels for those keys (`METRIC_LABELS`):

| Key | Label |
|---|---|
| `views` | Views |
| `watch_time_hours` | Total Watch Time |
| `watch_time_minutes` | Watch Time (min) |
| `avg_view_duration_seconds` | Avg View Duration |
| `avg_view_percentage` | Avg View % |
| `likes` | Likes |
| `dislikes` | Dislikes |
| `shares` | Shares |
| `comments` | Comments |
| `subscribers_gained` | Subscribers Gained |
| `subscribers_lost` | Subscribers Lost |
| `duration_seconds` | Duration (sec) |
| `plays` | Plays |
| `reach` | Reach |
| `saves` | Saves |
| `profile_visits` | Profile Visits |
| `follows` | Follows |
| `accounts_reached` | Accounts Reached |
| `accounts_engaged` | Accounts Engaged |
| `engagement_rate` | Engagement Rate |

**Affects:** which metric cards (and therefore which instances of charts 1 and 2) render. Each selected metric → one card. The card for `duration_seconds` renders chart 2; every other card renders chart 1.

### Outside-click dismissal

Both the metric dropdown and the date-range calendar close on `mousedown` outside their refs (single global handler).
