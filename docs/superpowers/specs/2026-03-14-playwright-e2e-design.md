# Playwright E2E Testing — Design Spec
Date: 2026-03-14

## Overview

Add Playwright end-to-end testing to the clip-dashboard Next.js 14 project. The app is a single-page SPA with state-driven navigation (no URL routing). Tests run against `localhost:3000` using Chromium only.

---

## Installation & Configuration

**Dependencies:**
- `@playwright/test` added as a dev dependency
- Chromium browser installed via `npx playwright install chromium`

**`playwright.config.ts`** (project root):
- `testDir: 'tests/e2e'`
- `use.baseURL: 'http://localhost:3000'`
- `use.actionTimeout: 10_000`
- `use.screenshot: 'only-on-failure'` → saved to `tests/screenshots/`
- Single project: `{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }`
- `webServer` block NOT included — user starts `npm run dev` separately

**`package.json` scripts added:**
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

**Test file locations:** `tests/e2e/`

---

## `data-testid` Additions

Surgical additions to components — only elements tests need to locate:

| File | Element | `data-testid` |
|---|---|---|
| `MetricCard.tsx` | Card root div | `metric-card` |
| `DashboardView.tsx` | Each top-content post row | `post-row` |
| `VideoPreviewModal.tsx` | Modal container div | `video-modal` |
| `VideoPreviewModal.tsx` | Close (X) button | `modal-close` |
| `VideoPreviewModal.tsx` | URL input | `url-input` |
| `VideoPreviewModal.tsx` | Save button | `save-url-btn` |
| `TopBar.tsx` | Each date range button | `date-btn-{value}` (e.g. `date-btn-7d`) |
| `TopBar.tsx` | Platform select | `platform-select` |
| `Sidebar.tsx` | Each nav button | `nav-{id}` (e.g. `nav-analytics`) |
| `AnalyticsView.tsx` | CSV Export button | `csv-export-btn` |
| `CaptionView.tsx` | Description textarea | `caption-description` |
| `CaptionView.tsx` | Generate button | `generate-caption-btn` |
| `CaptionView.tsx` | Caption output `<pre>` | `caption-output` |

---

## Test Files

### `tests/e2e/dashboard.spec.ts`
1. Page loads without crashing — wait for loading spinner to disappear, assert `[data-testid="metric-card"]` visible
2. Four metric cards visible — assert `locator('[data-testid="metric-card"]').count()` equals 4
3. Top posts renders at least one row — assert `[data-testid="post-row"]` has count ≥ 1
4. Clicking a post row opens modal — click first `[data-testid="post-row"]`, assert `[data-testid="video-modal"]` visible
5. Modal X button closes it — click `[data-testid="modal-close"]`, assert modal gone

### `tests/e2e/filters.spec.ts`
1. 7D filter persists across nav — click `[data-testid="date-btn-7d"]`, click `[data-testid="nav-analytics"]`, assert `[data-testid="date-btn-7d"]` has active gold class
2. 30D filter persists across nav — click `[data-testid="date-btn-30d"]`, click `[data-testid="nav-content"]`, assert `[data-testid="date-btn-30d"]` has active class
3. Platform dropdown exists — assert `[data-testid="platform-select"]` visible

### `tests/e2e/analytics.spec.ts`
1. Analytics page loads — click `[data-testid="nav-analytics"]`, wait for content, assert `[data-testid="csv-export-btn"]` visible
2. CSV Export button visible — covered by above
3. CSV Export triggers download — use `page.waitForEvent('download')` concurrently with clicking the button, assert download filename matches `clip-studio-export-*.csv`

### `tests/e2e/captions.spec.ts`
Setup for every test: `page.addInitScript(() => localStorage.setItem('clip_studio_anthropic_key', 'test-key'))` + `page.route('**/api.anthropic.com/**', ...)` returning mock JSON with a hardcoded caption.

1. Navigate to captions — click `[data-testid="nav-captions"]`
2. Fill description — fill `[data-testid="caption-description"]` with test text
3. Select platform — click a platform button (e.g. TikTok)
4. Select tone — click a tone button (e.g. Engaging)
5. Click Generate — click `[data-testid="generate-caption-btn"]`
6. Caption appears — assert `[data-testid="caption-output"]` visible and contains mock caption text

### `tests/e2e/modal.spec.ts`
Setup: `page.route('**/*.supabase.co/**', ...)` mocking all Supabase REST calls to return `{ data: [], error: null }` (handles both initial load and URL upsert).

1. Click post with no URL → URL input visible — click a post row (SAMPLE_POSTS has posts without URLs by default), assert `[data-testid="url-input"]` visible
2. Enter YouTube URL → Save → iframe appears without modal closing — type URL into `[data-testid="url-input"]`, click `[data-testid="save-url-btn"]`, wait for `iframe[src*="youtube.com/embed"]` to appear, assert modal still visible (not closed/reopened)

---

## Loading State Handling

Every test navigates to `/` and waits for the loading spinner to disappear before proceeding:
```ts
await page.goto('/');
await page.waitForSelector('.animate-spin', { state: 'hidden' });
```
Supabase fetch will fail (no env vars in test), error is caught in `page.tsx`, app falls back to `SAMPLE_POSTS`. This is the expected test-environment path.

---

## Network Mocking

**Supabase (modal.spec.ts):** `page.route('**supabase**', route => route.fulfill({ status: 200, body: JSON.stringify({ data: [], error: null }) }))`

**Anthropic API (captions.spec.ts):**
```ts
page.route('**/api.anthropic.com/**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      content: [{ type: 'text', text: 'Mock caption #testing' }]
    })
  })
)
```

---

## Test Independence

Each test uses `test.beforeEach` to navigate to `/` and wait for content to load. No shared state between tests.

---

## Screenshots on Failure

`use.screenshot: 'only-on-failure'` with `outputDir` pointing to `tests/screenshots/`. Playwright saves failure screenshots automatically with this config — no manual screenshot calls needed in test bodies.
