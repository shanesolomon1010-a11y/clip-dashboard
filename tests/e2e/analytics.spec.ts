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
