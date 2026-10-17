import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow H: Wardrobe Gap Intelligence & Persistent Preferences (Phase 1)', () => {
  test('Dismisses gaps, ignores categories, and verifies persistence across page reload', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // 1. Restore sample data from Settings to ensure consistent baseline
    await page.goto('/settings');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.getByText(/Restored the labeled sample wardrobe/i)).toBeVisible();

    // 2. Visit Insights page
    await page.goto('/insights');
    await expect(page.getByRole('heading', { name: 'Wardrobe Insights', level: 1 })).toBeVisible();

    // Verify Category balance & potential gaps section
    await expect(page.getByText('Capsule Structure')).toBeVisible();
    await expect(page.getByText('Category balance & potential gaps')).toBeVisible();

    // Verify at least one dismiss button exists for a thin category
    const dismissBtns = page.getByRole('button', { name: /^Dismiss gap for/i });
    const initialDismissCount = await dismissBtns.count();
    expect(initialDismissCount).toBeGreaterThan(0);

    // 3. Dismiss an individual gap
    const firstDismissBtn = dismissBtns.first();
    const btnLabel = await firstDismissBtn.getAttribute('aria-label');
    await firstDismissBtn.click();

    // Verify toast feedback
    await expect(page.getByText(/Gap dismissed from active recommendations/i)).toBeVisible();

    // Verify Preferences link or count is visible
    const prefsBtn = page.getByRole('button', { name: /Preferences \(\d+\)/i });
    await expect(prefsBtn).toBeVisible();

    // 4. Verify persistence after reload
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Wardrobe Insights', level: 1 })).toBeVisible();

    // The dismissed gap should no longer have an active dismiss button in the active list
    if (btnLabel) {
      await expect(page.getByRole('button', { name: btnLabel })).toHaveCount(0);
    }

    // 5. Open Preferences archive and restore the dismissed gap
    await page.getByRole('button', { name: /Preferences \(\d+\)/i }).click();
    await expect(page.getByText('Dismissed gaps & ignored categories')).toBeVisible();

    const restoreBtn = page.getByRole('button', { name: /^Restore gap for/i }).first();
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    await expect(page.getByText(/Gap restored to active analysis/i)).toBeVisible();

    // 6. Test Ignoring a category (e.g. Accessory or Dress)
    const ignoreBtn = page.getByRole('button', { name: /^Ignore .* category/i }).first();
    await expect(ignoreBtn).toBeVisible();
    await ignoreBtn.click();

    await expect(page.getByText(/will be ignored in gap recommendations/i)).toBeVisible();

    // Verify Ignored badge is displayed
    await expect(page.locator('.badge').filter({ hasText: 'Ignored' })).toBeVisible();

    // 7. Verify persistence of ignored category after reload
    await page.reload();
    await expect(page.locator('.badge').filter({ hasText: 'Ignored' })).toBeVisible();

    // 8. Re-enable the ignored category
    const reEnableBtn = page.getByRole('button', { name: /Re-enable/i }).first();
    await expect(reEnableBtn).toBeVisible();
    await reEnableBtn.click();

    await expect(page.getByText(/re-enabled in wardrobe gap analysis/i)).toBeVisible();

    // Verify zero unauthorized network calls and no console errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('Flow H (Mobile): 375px Gap Intelligence Responsiveness & Empty State', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('375px mobile view renders gap intelligence controls without horizontal page overflow', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/insights');
    await expect(page.getByRole('heading', { name: 'Wardrobe Insights', level: 1 })).toBeVisible();

    // Check horizontal page overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow, 'Insights must not have horizontal overflow on 375px mobile').toBe(false);

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Displays honest empty state without phantom gaps or recommendations when wardrobe is empty', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // Clear all browser data from settings to establish zero-item state
    await page.goto('/settings');
    await page.getByRole('button', { name: /Clear all browser data/i }).click();
    await page.getByRole('button', { name: /Confirm erase everything/i }).click();
    await expect(page.getByText(/Cleared all wardrobe items/i)).toBeVisible();

    // Visit Insights
    await page.goto('/insights');
    await expect(page.getByText(/No wardrobe data to analyze yet/i)).toBeVisible();
    await expect(page.getByText(/Your wardrobe has healthy coverage/i)).not.toBeVisible();

    // Restore sample wardrobe to leave database in clean state
    await page.goto('/settings');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.getByText(/Restored the labeled sample wardrobe/i)).toBeVisible();

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
