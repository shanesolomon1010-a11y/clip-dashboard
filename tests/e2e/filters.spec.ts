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
