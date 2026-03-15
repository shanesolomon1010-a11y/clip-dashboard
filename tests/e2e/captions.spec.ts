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
    // Wait for button to be enabled — useEffect reads key from localStorage after first render
    await expect(page.locator('[data-testid="generate-caption-btn"]')).toBeEnabled();
    await page.click('[data-testid="generate-caption-btn"]');
    const output = page.locator('[data-testid="caption-output"]');
    await expect(output).toBeVisible();
    await expect(output).toContainText('Mock caption #testing');
  });
});
