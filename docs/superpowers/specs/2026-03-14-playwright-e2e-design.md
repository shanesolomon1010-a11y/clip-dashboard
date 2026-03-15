# Playwright E2E Testing — Design Spec
Date: 2026-03-14
Revision: 2 (post spec-review)

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
- `use.screenshot: 'only-on-failure'` → `outputDir: 'tests/screenshots/'`
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
| `DashboardView.tsx` | Each row in the **Top Content** section (not `TopPostsTable`) | `post-row` |
| `VideoPreviewModal.tsx` | Modal container div | `video-modal` |
| `VideoPreviewModal.tsx` | Close (X) button | `modal-close` |
| `VideoPreviewModal.tsx` | URL input | `url-input` |
| `VideoPreviewModal.tsx` | Save button | `save-url-btn` |
| `TopBar.tsx` | Each date range button | `date-btn-{value}` (e.g. `date-btn-7d`) |
| `TopBar.tsx` | Active date button also gets `data-active="true"` | (see filters section) |
| `TopBar.tsx` | Platform select | `platform-select` |
| `Sidebar.tsx` | Each nav button | `nav-{id}` (e.g. `nav-analytics`) |
| `AnalyticsView.tsx` | CSV Export button | `csv-export-btn` |
| `CaptionView.tsx` | Description textarea | `caption-description` |
| `CaptionView.tsx` | Each platform button | `caption-platform-{name}` (e.g. `caption-platform-Instagram`) |
| `CaptionView.tsx` | Each tone button | `caption-tone-{name}` (e.g. `caption-tone-Engaging`) |
| `CaptionView.tsx` | Generate button | `generate-caption-btn` |
| `CaptionView.tsx` | Caption output `<pre>` | `caption-output` |

**Note on `data-active` for TopBar date buttons:** Playwright's `toHaveClass()` matcher is brittle against Tailwind CSS variable classes (e.g. `bg-[var(--gold)]`). Instead, each date range button in `TopBar.tsx` receives `data-active={dateRange === value ? 'true' : undefined}`. Filter tests assert `toHaveAttribute('data-active', 'true')`.

---

## Loading State Handling

Every `beforeEach` navigates fresh to `/` and waits for the loading spinner to disappear:

```ts
await page.goto('/');
await page.waitForSelector('.animate-spin', { state: 'hidden' });
```

On each `page.goto('/')`, React state (including `FilterContext`) resets to its defaults (`dateRange: '30d'`, `platform: 'all'`). Supabase fetch fails in test environment (no env vars), error is caught in `page.tsx`, app falls back to `SAMPLE_POSTS`. Tests always run against SAMPLE_POSTS.

---

## Network Mocking

**No Supabase mocking required.** `updatePostUrl` in `db.ts` wraps its Supabase call in a `try/catch` that silently swallows errors. `fetchAllPosts` failure is caught by `.catch()` in `page.tsx`. The app functions correctly against SAMPLE_POSTS with no network mocking.

**Anthropic API (captions.spec.ts only):**

Use `https://api.anthropic.com/**` (with scheme prefix — `**/` prefix form does not match across `://` boundary in Playwright URL globs):

```ts
await page.route('https://api.anthropic.com/**', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      content: [{ type: 'text', text: 'Mock caption #testing' }]
    })
  })
);
```

API key is injected before page load via:
```ts
await page.addInitScript(() =>
  localStorage.setItem('clip_studio_anthropic_key', 'test-key')
);
```

---

## Test Files

### `tests/e2e/dashboard.spec.ts`

`beforeEach`: navigate to `/`, wait for spinner hidden.

1. **Page loads without crashing** — assert `[data-testid="metric-card"]` is visible
2. **Four metric cards visible** — assert `locator('[data-testid="metric-card"]').count()` equals 4
3. **Top posts renders at least one row** — assert `[data-testid="post-row"]` count ≥ 1
4. **Clicking a post row opens modal** — click first `[data-testid="post-row"]`, assert `[data-testid="video-modal"]` visible
5. **Modal X button closes it** — click `[data-testid="modal-close"]`, assert `[data-testid="video-modal"]` not visible

### `tests/e2e/filters.spec.ts`

`beforeEach`: navigate to `/`, wait for spinner hidden.

1. **7D filter persists to Analytics** — click `[data-testid="date-btn-7d"]`, click `[data-testid="nav-analytics"]`, assert `[data-testid="date-btn-7d"]` has attribute `data-active="true"`
2. **90D filter persists to Content** — click `[data-testid="date-btn-90d"]`, click `[data-testid="nav-content"]`, assert `[data-testid="date-btn-90d"]` has attribute `data-active="true"` (90D chosen because 30D is the default — must change from default to test persistence)
3. **Platform dropdown exists** — assert `[data-testid="platform-select"]` visible

### `tests/e2e/analytics.spec.ts`

`beforeEach`: navigate to `/`, wait for spinner hidden, click `[data-testid="nav-analytics"]`.

1. **Analytics page loads** — assert `[data-testid="csv-export-btn"]` visible
2. **CSV Export triggers download** — assert `[data-testid="csv-export-btn"]` is enabled, then use `Promise.all([page.waitForEvent('download'), page.click('[data-testid="csv-export-btn"]')])`, assert `download.suggestedFilename()` matches `/^clip-studio-export-.*\.csv$/`

### `tests/e2e/captions.spec.ts`

`beforeEach`:
1. `page.addInitScript(...)` to set API key in localStorage
2. `page.route('https://api.anthropic.com/**', ...)` to mock response
3. Navigate to `/`, wait for spinner hidden
4. Click `[data-testid="nav-captions"]`

Tests (single test covering the full flow):
1. Fill `[data-testid="caption-description"]` with `"A cat doing parkour"`
2. Click `[data-testid="caption-platform-Instagram"]` (not TikTok — TikTok is the default, must click a different platform to exercise state change)
3. Click `[data-testid="caption-tone-Engaging"]`
4. Click `[data-testid="generate-caption-btn"]`
5. Assert `[data-testid="caption-output"]` is visible and contains `"Mock caption #testing"`

### `tests/e2e/modal.spec.ts`

`beforeEach`: navigate to `/`, wait for spinner hidden.

No network mocking required (see Network Mocking section above).

1. **Post with no URL shows URL input** — click first `[data-testid="post-row"]`, assert `[data-testid="url-input"]` visible (SAMPLE_POSTS have no `url` field)
2. **Save YouTube URL → iframe appears without modal closing** — type `"https://www.youtube.com/watch?v=dQw4w9WgXcQ"` into `[data-testid="url-input"]`, click `[data-testid="save-url-btn"]`, wait for `iframe[src*="youtube.com/embed"]` to be visible, assert `[data-testid="video-modal"]` is still visible (not closed/reopened)

---

## Test Independence

Each test uses `test.beforeEach` with `page.goto('/')` to start fresh. React state resets on every full navigation. No `page.context()` state is shared between tests.

---

## Screenshots on Failure

`use.screenshot: 'only-on-failure'` in `playwright.config.ts`. Playwright writes screenshots automatically — no manual `page.screenshot()` calls needed in tests.
