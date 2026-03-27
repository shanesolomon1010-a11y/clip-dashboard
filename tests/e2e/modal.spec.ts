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

test.describe('Video Preview Modal', () => {
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
