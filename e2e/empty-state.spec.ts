import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow A: Initial Launch & Empty States', () => {
  test('Dashboard loads without errors and clearly distinguishes sample data', async ({ page }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/');
    await expect(page).toHaveTitle(/PalettePilot/);

    // Header brand and nav check
    await expect(page.locator('.brand-name')).toHaveText('PalettePilot');
    await expect(page.locator('.brand-tag')).toHaveText('Wardrobe Match Engine');

    // On initial launch with seeded samples, sample banner or items are visible
    const sampleBadge = page.locator('.badge-sample').first();
    await expect(sampleBadge).toBeVisible();

    // Verify zero disallowed external network requests and no uncaught JS errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Empty wardrobe state shows honest guidance across all views without false metrics', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // 1. Clear all browser data in Settings to establish a clean zero-item state
    await page.goto('/settings');
    await page.getByRole('button', { name: /Clear all browser data/i }).click();
    await page.getByRole('button', { name: /Confirm erase everything/i }).click();
    await expect(page.getByText(/Cleared all wardrobe items/i)).toBeVisible();

    // 2. Dashboard empty state check
    await page.goto('/');
    await expect(page.getByText(/Your wardrobe is empty/i)).toBeVisible();
    await expect(
      page.getByText(/Add at least 3 pieces across tops, bottoms, and shoes/i),
    ).toBeVisible();
    await expect(page.locator('.header-actions .badge')).toHaveText('0 pieces');

    // 3. My Wardrobe empty state check
    await page.goto('/wardrobe');
    await expect(page.getByText(/No clothing in your wardrobe yet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add first garment/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Restore sample wardrobe/i })).toBeVisible();

    // 4. Wardrobe Insights empty state check — must NOT claim healthy coverage on empty closet
    await page.goto('/insights');
    await expect(page.getByText(/No wardrobe data to analyze yet/i)).toBeVisible();
    await expect(page.getByText(/Your wardrobe has healthy coverage/i)).not.toBeVisible();

    // 5. Buy or Skip empty state notice check
    await page.goto('/buy-or-skip');
    await expect(
      page.getByText(/Your wardrobe is currently empty. PalettePilot requires at least 3 complementary garments/i),
    ).toBeVisible();

    // 6. Shopping Showdown empty state notice check
    await page.goto('/showdown');
    await expect(
      page.getByText(/Your wardrobe has 0 items \(minimum 3 required for full scoring\)/i),
    ).toBeVisible();

    // 7. Restore sample wardrobe and verify "Sample" badge distinguishes it
    await page.goto('/wardrobe');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.locator('.garment-card').first()).toBeVisible();
    await expect(page.locator('.badge-sample').first()).toBeVisible();

    // Assert zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
