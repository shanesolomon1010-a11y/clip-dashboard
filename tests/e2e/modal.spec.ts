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
