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
