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

  test('top posts section shows empty state when no data', async ({ page }) => {
    await expect(page.locator('text=No posts for')).toBeVisible();
  });
});

test.describe('Dashboard with data', () => {
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
