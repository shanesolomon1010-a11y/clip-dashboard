import { test, expect } from '@playwright/test';

const MOCK_POSTS = [
  {
    id: 'test-1',
    platform: 'tiktok',
    date: '2026-03-20',
    title: 'Test Post One',
    views: 5000,
    likes: 200,
    comments: 30,
    shares: 15,
    saves: 40,
    content_type: null,
    url: null,
  },
];

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.animate-spin', { state: 'hidden' });
    await page.click('[data-testid="nav-analytics"]');
  });

  test('analytics page loads and shows CSV export button', async ({ page }) => {
    await expect(page.locator('[data-testid="csv-export-btn"]')).toBeVisible();
  });

  test('CSV Export button is disabled when there are no posts', async ({ page }) => {
    await expect(page.locator('[data-testid="csv-export-btn"]')).toBeDisabled();
  });
});

test.describe('Analytics with data', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/rest/v1/posts**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_POSTS),
      });
    });
    await page.goto('/');
    await page.waitForSelector('.animate-spin', { state: 'hidden' });
    await page.click('[data-testid="nav-analytics"]');
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
