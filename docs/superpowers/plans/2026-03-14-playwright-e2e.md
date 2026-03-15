# Playwright E2E Testing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Playwright, add `data-testid` attributes to seven components, and write five E2E test files covering dashboard, filters, analytics, captions, and the video modal.

**Architecture:** Tests run against a locally-running `npm run dev` server (started separately). Navigation between views is done by clicking sidebar nav buttons — there is no URL routing, so `page.goto('/')` always lands on Dashboard. All tests start fresh with `page.goto('/')` in `beforeEach`. The app falls back to hardcoded SAMPLE_POSTS when Supabase is unavailable (expected in test environment).

**Tech Stack:** `@playwright/test`, TypeScript, Chromium only, Next.js 14 App Router SPA

---

## Chunk 1: Install, Config, and Component `data-testid` Additions

### Task 1: Install Playwright and write config

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install `@playwright/test` and Chromium**

  Run from `/Users/shane/clip-dashboard`:
  ```bash
  npm install --save-dev @playwright/test
  npx playwright install chromium
  ```
  Expected: installs without error, `@playwright/test` appears in `devDependencies`.

- [ ] **Step 2: Create `playwright.config.ts`**

  Create `/Users/shane/clip-dashboard/playwright.config.ts`:
  ```ts
  import { defineConfig, devices } from '@playwright/test';

  export default defineConfig({
    testDir: './tests/e2e',
    outputDir: './tests/screenshots',
    use: {
      baseURL: 'http://localhost:3000',
      actionTimeout: 10_000,
      screenshot: 'only-on-failure',
    },
    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ],
  });
  ```

- [ ] **Step 3: Add test scripts to `package.json`**

  In `package.json`, add to `"scripts"`:
  ```json
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
  ```

- [ ] **Step 4: Create `tests/e2e/` directory placeholder**

  Create `/Users/shane/clip-dashboard/tests/e2e/.gitkeep` (empty file) so git tracks the directory.

- [ ] **Step 5: Confirm Playwright can find the (empty) test directory**

  Run:
  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test --list
  ```
  Expected: `No tests found` or empty list — no error about missing config.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add playwright.config.ts package.json package-lock.json tests/e2e/.gitkeep
  git commit -m "chore: install Playwright and add e2e test config"
  ```

---

### Task 2: Add `data-testid` attributes to components

**Why up front:** All test files depend on these attributes. Adding them all in one task avoids circular dependency between tasks.

**Files:**
- Modify: `src/components/MetricCard.tsx`
- Modify: `src/components/views/DashboardView.tsx`
- Modify: `src/components/VideoPreviewModal.tsx`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/views/AnalyticsView.tsx`
- Modify: `src/components/views/CaptionView.tsx`

**Reference:** Spec at `docs/superpowers/specs/2026-03-14-playwright-e2e-design.md`

---

#### 2a — MetricCard.tsx

- [ ] **Step 1: Add `data-testid="metric-card"` to the root `<div>`**

  File: `src/components/MetricCard.tsx` line 14.

  Change:
  ```tsx
  <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4 hover:bg-[var(--bg-hover)] hover:border-white/[0.09] transition-all duration-200 group">
  ```
  To:
  ```tsx
  <div data-testid="metric-card" className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4 hover:bg-[var(--bg-hover)] hover:border-white/[0.09] transition-all duration-200 group">
  ```

---

#### 2b — DashboardView.tsx

- [ ] **Step 2: Add `data-testid="post-row"` to Top Content rows**

  File: `src/components/views/DashboardView.tsx` line 267 (the `<div>` inside the `topPosts.map`).

  Change:
  ```tsx
  <div key={post.id} onClick={() => openVideoModal(post)} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group cursor-pointer">
  ```
  To:
  ```tsx
  <div key={post.id} data-testid="post-row" onClick={() => openVideoModal(post)} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group cursor-pointer">
  ```

---

#### 2c — VideoPreviewModal.tsx

There are two components in this file: `VideoPlayer` (inner, handles URL input) and `VideoPreviewModal` (outer, handles close). Add testids to both.

- [ ] **Step 3: Add `data-testid="url-input"` to the URL `<input>`**

  File: `src/components/VideoPreviewModal.tsx` — the `<input type="url">` inside `VideoPlayer` (~line 121).

  Change:
  ```tsx
  <input
    type="url"
    value={urlInput}
    onChange={(e) => setUrlInput(e.target.value)}
    placeholder="Paste YouTube, TikTok, or Instagram URL…"
    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-white/[0.16] transition-colors"
  />
  ```
  To:
  ```tsx
  <input
    data-testid="url-input"
    type="url"
    value={urlInput}
    onChange={(e) => setUrlInput(e.target.value)}
    placeholder="Paste YouTube, TikTok, or Instagram URL…"
    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-white/[0.16] transition-colors"
  />
  ```

- [ ] **Step 4: Add `data-testid="save-url-btn"` to the Save `<button>`**

  File: `src/components/VideoPreviewModal.tsx` — the Save `<button>` inside `VideoPlayer` (~line 128).

  Change:
  ```tsx
  <button
    onClick={handleSave}
    disabled={saving || !urlInput.trim()}
    className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[12px] font-medium text-[var(--text-1)] transition-colors"
  >
  ```
  To:
  ```tsx
  <button
    data-testid="save-url-btn"
    onClick={handleSave}
    disabled={saving || !urlInput.trim()}
    className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[12px] font-medium text-[var(--text-1)] transition-colors"
  >
  ```

- [ ] **Step 5: Add `data-testid="video-modal"` to the inner modal card**

  File: `src/components/VideoPreviewModal.tsx` — the inner `<div>` that is the card (inside the backdrop, has `onClick={(e) => e.stopPropagation()}`), ~line 160.

  Change:
  ```tsx
  <div
    className="relative bg-[var(--bg-card)] border border-white/[0.08] rounded-2xl w-full max-w-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
    onClick={(e) => e.stopPropagation()}
  >
  ```
  To:
  ```tsx
  <div
    data-testid="video-modal"
    className="relative bg-[var(--bg-card)] border border-white/[0.08] rounded-2xl w-full max-w-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
    onClick={(e) => e.stopPropagation()}
  >
  ```

- [ ] **Step 6: Add `data-testid="modal-close"` to the X button**

  File: `src/components/VideoPreviewModal.tsx` — the close `<button>` inside `VideoPreviewModal`, ~line 164.

  Change:
  ```tsx
  <button
    onClick={onClose}
    className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-[var(--text-3)]"
  >
  ```
  To:
  ```tsx
  <button
    data-testid="modal-close"
    onClick={onClose}
    className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-[var(--text-3)]"
  >
  ```

---

#### 2d — TopBar.tsx

- [ ] **Step 7: Add `data-testid` and `data-active` to date range buttons**

  File: `src/components/TopBar.tsx` — the `<button>` inside `DATE_OPTIONS.map(...)`, ~line 34.

  Change:
  ```tsx
  <button
    key={value}
    onClick={() => setDateRange(value)}
    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
      dateRange === value
        ? 'bg-[var(--gold)] text-black'
        : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-white/[0.04]'
    }`}
  >
  ```
  To:
  ```tsx
  <button
    key={value}
    data-testid={`date-btn-${value}`}
    data-active={dateRange === value ? 'true' : undefined}
    onClick={() => setDateRange(value)}
    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
      dateRange === value
        ? 'bg-[var(--gold)] text-black'
        : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-white/[0.04]'
    }`}
  >
  ```

- [ ] **Step 8: Add `data-testid="platform-select"` to the platform `<select>`**

  File: `src/components/TopBar.tsx` — the `<select>`, ~line 49.

  Change:
  ```tsx
  <select
    value={platform}
    onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
    className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-[var(--text-2)] px-2.5 py-1 outline-none hover:border-white/[0.14] focus:border-white/[0.18] transition-colors cursor-pointer"
  >
  ```
  To:
  ```tsx
  <select
    data-testid="platform-select"
    value={platform}
    onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
    className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-[var(--text-2)] px-2.5 py-1 outline-none hover:border-white/[0.14] focus:border-white/[0.18] transition-colors cursor-pointer"
  >
  ```

---

#### 2e — Sidebar.tsx

- [ ] **Step 9: Add `data-testid={`nav-${id}`}` to each nav `<button>`**

  File: `src/components/Sidebar.tsx` — the `<button>` inside `groupItems.map(...)`, ~line 58.

  Change:
  ```tsx
  <button
    key={id}
    onClick={() => onNavigate(id)}
    className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 group ${
      isActive
        ? 'text-[var(--gold)] bg-[var(--gold-dim)]'
        : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04]'
    }`}
  >
  ```
  To:
  ```tsx
  <button
    key={id}
    data-testid={`nav-${id}`}
    onClick={() => onNavigate(id)}
    className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 group ${
      isActive
        ? 'text-[var(--gold)] bg-[var(--gold-dim)]'
        : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04]'
    }`}
  >
  ```

---

#### 2f — AnalyticsView.tsx

- [ ] **Step 10: Add `data-testid="csv-export-btn"` to the Export CSV button**

  File: `src/components/views/AnalyticsView.tsx` — the `<button onClick={() => exportToCSV(filtered)}>`, ~line 106.

  Change:
  ```tsx
  <button
    onClick={() => exportToCSV(filtered)}
    disabled={filtered.length === 0}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
  ```
  To:
  ```tsx
  <button
    data-testid="csv-export-btn"
    onClick={() => exportToCSV(filtered)}
    disabled={filtered.length === 0}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
  ```

---

#### 2g — CaptionView.tsx

- [ ] **Step 11: Add `data-testid="caption-description"` to the description `<textarea>`**

  File: `src/components/views/CaptionView.tsx` — the `<textarea>` for clip description, ~line 123.

  Change:
  ```tsx
  <textarea
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    placeholder="Describe your clip — what happens, the vibe, key moments"
    rows={3}
    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] resize-none transition-colors"
  />
  ```
  To:
  ```tsx
  <textarea
    data-testid="caption-description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    placeholder="Describe your clip — what happens, the vibe, key moments"
    rows={3}
    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] resize-none transition-colors"
  />
  ```

- [ ] **Step 12: Add `data-testid={`caption-platform-${p}`}` to each platform button**

  File: `src/components/views/CaptionView.tsx` — the `<button>` inside `PLATFORMS.map((p) => ...)`, ~line 139.

  Change:
  ```tsx
  <button
    key={p}
    onClick={() => setPlatform(p)}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
      platform === p
        ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
        : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
    }`}
  >
  ```
  To:
  ```tsx
  <button
    key={p}
    data-testid={`caption-platform-${p}`}
    onClick={() => setPlatform(p)}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
      platform === p
        ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
        : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
    }`}
  >
  ```

- [ ] **Step 13: Add `data-testid={`caption-tone-${t}`}` to each tone button**

  File: `src/components/views/CaptionView.tsx` — the `<button>` inside `TONES.map((t) => ...)`, ~line 163.

  Change:
  ```tsx
  <button
    key={t}
    onClick={() => setTone(t)}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
      tone === t
        ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
        : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
    }`}
  >
  ```
  To:
  ```tsx
  <button
    key={t}
    data-testid={`caption-tone-${t}`}
    onClick={() => setTone(t)}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
      tone === t
        ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
        : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
    }`}
  >
  ```

- [ ] **Step 14: Add `data-testid="generate-caption-btn"` to the Generate button**

  File: `src/components/views/CaptionView.tsx` — the `<button onClick={generate}>`, ~line 177.

  Change:
  ```tsx
  <button
    onClick={generate}
    disabled={generating || !description.trim() || noKey}
    className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--gold)] text-[var(--bg-base)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
  ```
  To:
  ```tsx
  <button
    data-testid="generate-caption-btn"
    onClick={generate}
    disabled={generating || !description.trim() || noKey}
    className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--gold)] text-[var(--bg-base)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
  ```

- [ ] **Step 15: Add `data-testid="caption-output"` to the output `<pre>`**

  File: `src/components/views/CaptionView.tsx` — the `<pre>` that displays the generated caption, ~line 193.

  Change:
  ```tsx
  <pre className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] whitespace-pre-wrap font-sans leading-relaxed pr-16">
    {caption}
  </pre>
  ```
  To:
  ```tsx
  <pre data-testid="caption-output" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] whitespace-pre-wrap font-sans leading-relaxed pr-16">
    {caption}
  </pre>
  ```

- [ ] **Step 16: Run build to confirm no TypeScript or ESLint errors**

  ```bash
  cd /Users/shane/clip-dashboard && npm run build
  ```
  Expected: exits 0 with no errors.

- [ ] **Step 17: Commit all component changes**

  ```bash
  cd /Users/shane/clip-dashboard
  git add src/components/MetricCard.tsx \
          src/components/views/DashboardView.tsx \
          src/components/VideoPreviewModal.tsx \
          src/components/TopBar.tsx \
          src/components/Sidebar.tsx \
          src/components/views/AnalyticsView.tsx \
          src/components/views/CaptionView.tsx
  git commit -m "feat(e2e): add data-testid attributes to components for Playwright tests"
  ```

---

## Chunk 2: Test Files

> **Before running any test:** ensure `npm run dev` is running in a separate terminal at `http://localhost:3000`.

---

### Task 3: dashboard.spec.ts

**File:**
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write the test file**

  Create `/Users/shane/clip-dashboard/tests/e2e/dashboard.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.animate-spin', { state: 'hidden' });
    });

    test('page loads without crashing', async ({ page }) => {
      await expect(page.locator('[data-testid="metric-card"]').first()).toBeVisible();
    });

    test('four metric cards are visible', async ({ page }) => {
      await expect(page.locator('[data-testid="metric-card"]')).toHaveCount(4);
    });

    test('top posts section renders at least one row', async ({ page }) => {
      const rows = page.locator('[data-testid="post-row"]');
      await expect(rows.first()).toBeVisible();
      expect(await rows.count()).toBeGreaterThanOrEqual(1);
    });

    test('clicking a post row opens the video modal', async ({ page }) => {
      await page.locator('[data-testid="post-row"]').first().click();
      await expect(page.locator('[data-testid="video-modal"]')).toBeVisible();
    });

    test('modal X button closes the modal', async ({ page }) => {
      await page.locator('[data-testid="post-row"]').first().click();
      await expect(page.locator('[data-testid="video-modal"]')).toBeVisible();
      await page.locator('[data-testid="modal-close"]').click();
      await expect(page.locator('[data-testid="video-modal"]')).not.toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run the test file**

  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test tests/e2e/dashboard.spec.ts
  ```
  Expected: 5 tests pass.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add tests/e2e/dashboard.spec.ts
  git commit -m "test(e2e): add dashboard spec"
  ```

---

### Task 4: filters.spec.ts

**File:**
- Create: `tests/e2e/filters.spec.ts`

- [ ] **Step 1: Write the test file**

  Create `/Users/shane/clip-dashboard/tests/e2e/filters.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('Filters', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.animate-spin', { state: 'hidden' });
    });

    test('7D filter persists after navigating to Analytics', async ({ page }) => {
      await page.click('[data-testid="date-btn-7d"]');
      await page.click('[data-testid="nav-analytics"]');
      await expect(page.locator('[data-testid="date-btn-7d"]')).toHaveAttribute('data-active', 'true');
    });

    test('90D filter persists after navigating to Content', async ({ page }) => {
      await page.click('[data-testid="date-btn-90d"]');
      await page.click('[data-testid="nav-content"]');
      await expect(page.locator('[data-testid="date-btn-90d"]')).toHaveAttribute('data-active', 'true');
    });

    test('platform dropdown is visible in the TopBar', async ({ page }) => {
      await expect(page.locator('[data-testid="platform-select"]')).toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run the test file**

  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test tests/e2e/filters.spec.ts
  ```
  Expected: 3 tests pass.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add tests/e2e/filters.spec.ts
  git commit -m "test(e2e): add filters spec"
  ```

---

### Task 5: analytics.spec.ts

**File:**
- Create: `tests/e2e/analytics.spec.ts`

- [ ] **Step 1: Write the test file**

  Create `/Users/shane/clip-dashboard/tests/e2e/analytics.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('Analytics', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.animate-spin', { state: 'hidden' });
      await page.click('[data-testid="nav-analytics"]');
    });

    test('analytics page loads and shows CSV export button', async ({ page }) => {
      await expect(page.locator('[data-testid="csv-export-btn"]')).toBeVisible();
    });

    test('clicking CSV Export triggers a file download', async ({ page }) => {
      const exportBtn = page.locator('[data-testid="csv-export-btn"]');
      await expect(exportBtn).toBeEnabled();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^clip-studio-export-.*\.csv$/);
    });
  });
  ```

- [ ] **Step 2: Run the test file**

  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test tests/e2e/analytics.spec.ts
  ```
  Expected: 2 tests pass.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add tests/e2e/analytics.spec.ts
  git commit -m "test(e2e): add analytics spec"
  ```

---

### Task 6: captions.spec.ts

**File:**
- Create: `tests/e2e/captions.spec.ts`

**Key context:**
- `addInitScript` must be called **before** `page.goto` — scripts registered after navigation do not affect the already-loaded page.
- `page.route` can be called any time before the matching request fires — it's fine to register in `beforeEach` before `page.goto`.
- The Generate button is `disabled` when `description` is empty OR no API key. The `addInitScript` sets the key in localStorage before page load, making `noKey` false once `useEffect` runs.

- [ ] **Step 1: Write the test file**

  Create `/Users/shane/clip-dashboard/tests/e2e/captions.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('Caption Generator', () => {
    test.beforeEach(async ({ page }) => {
      // Must be registered before goto so the page loads with the key already set
      await page.addInitScript(() => {
        localStorage.setItem('clip_studio_anthropic_key', 'test-key');
      });
      // Mock the Anthropic API — use full scheme prefix, not **/ prefix
      await page.route('https://api.anthropic.com/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: [{ type: 'text', text: 'Mock caption #testing' }],
          }),
        })
      );
      await page.goto('/');
      await page.waitForSelector('.animate-spin', { state: 'hidden' });
      await page.click('[data-testid="nav-captions"]');
    });

    test('generates a caption and displays it in the output area', async ({ page }) => {
      await page.fill('[data-testid="caption-description"]', 'A cat doing parkour');
      // Click Instagram — TikTok is the default, must change platform to exercise state
      await page.click('[data-testid="caption-platform-Instagram"]');
      // Click Professional — Engaging is the default, must change tone to exercise state
      await page.click('[data-testid="caption-tone-Professional"]');
      // CaptionView reads the API key from localStorage in a useEffect — wait for the
      // button to be enabled before clicking to avoid a race on first render.
      await expect(page.locator('[data-testid="generate-caption-btn"]')).toBeEnabled();
      await page.click('[data-testid="generate-caption-btn"]');
      const output = page.locator('[data-testid="caption-output"]');
      await expect(output).toBeVisible();
      await expect(output).toContainText('Mock caption #testing');
    });
  });
  ```

- [ ] **Step 2: Run the test file**

  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test tests/e2e/captions.spec.ts
  ```
  Expected: 1 test passes.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add tests/e2e/captions.spec.ts
  git commit -m "test(e2e): add captions spec"
  ```

---

### Task 7: modal.spec.ts

**File:**
- Create: `tests/e2e/modal.spec.ts`

**Key context:**
- SAMPLE_POSTS have no `url` field — clicking any post row shows the URL input.
- No network mocking needed: `updatePostUrl` in `db.ts` wraps its Supabase call in `try/catch` and silently swallows errors. The `VideoModalContext.handleUrlSaved` still calls `setSelectedPost` after `updatePostUrl` resolves, keeping the modal open and updating it with the new URL.
- After saving the YouTube URL, the `VideoPlayer` re-renders synchronously with the updated `post.url`. The `iframe` will appear once the component re-renders — Playwright's `toBeVisible()` auto-waits up to the configured `actionTimeout`.

- [ ] **Step 1: Write the test file**

  Create `/Users/shane/clip-dashboard/tests/e2e/modal.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test';

  test.describe('Video Preview Modal', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.animate-spin', { state: 'hidden' });
    });

    test('clicking a post with no URL shows the URL input field', async ({ page }) => {
      await page.locator('[data-testid="post-row"]').first().click();
      // Wait for modal to be fully mounted before asserting its child elements
      await expect(page.locator('[data-testid="video-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="url-input"]')).toBeVisible();
    });

    test('saving a YouTube URL shows the iframe without closing the modal', async ({ page }) => {
      await page.locator('[data-testid="post-row"]').first().click();
      await page.fill('[data-testid="url-input"]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await page.click('[data-testid="save-url-btn"]');
      await expect(page.locator('iframe[src*="youtube.com/embed"]')).toBeVisible();
      // Modal must remain open — save must NOT close and reopen it
      await expect(page.locator('[data-testid="video-modal"]')).toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run the test file**

  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test tests/e2e/modal.spec.ts
  ```
  Expected: 2 tests pass.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add tests/e2e/modal.spec.ts
  git commit -m "test(e2e): add video modal spec"
  ```

---

### Task 8: Run the full suite

- [ ] **Step 1: Run all E2E tests**

  ```bash
  cd /Users/shane/clip-dashboard && npx playwright test
  ```
  Expected output:
  ```
  Running 13 tests using 1 worker

    ✓ dashboard.spec.ts › Dashboard › page loads without crashing
    ✓ dashboard.spec.ts › Dashboard › four metric cards are visible
    ✓ dashboard.spec.ts › Dashboard › top posts section renders at least one row
    ✓ dashboard.spec.ts › Dashboard › clicking a post row opens the video modal
    ✓ dashboard.spec.ts › Dashboard › modal X button closes the modal
    ✓ filters.spec.ts › Filters › 7D filter persists after navigating to Analytics
    ✓ filters.spec.ts › Filters › 90D filter persists after navigating to Content
    ✓ filters.spec.ts › Filters › platform dropdown is visible in the TopBar
    ✓ analytics.spec.ts › Analytics › analytics page loads and shows CSV export button
    ✓ analytics.spec.ts › Analytics › clicking CSV Export triggers a file download
    ✓ captions.spec.ts › Caption Generator › generates a caption and displays it in the output area
    ✓ modal.spec.ts › Video Preview Modal › clicking a post with no URL shows the URL input field
    ✓ modal.spec.ts › Video Preview Modal › saving a YouTube URL shows the iframe without closing the modal

  13 passed (...)
  ```

- [ ] **Step 2: Remove `.gitkeep` now that the directory has real files**

  ```bash
  cd /Users/shane/clip-dashboard && rm tests/e2e/.gitkeep
  ```

- [ ] **Step 3: Final commit**

  ```bash
  cd /Users/shane/clip-dashboard
  git add -A
  git commit -m "test(e2e): all 13 Playwright tests passing"
  ```
