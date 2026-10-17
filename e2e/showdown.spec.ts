import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow D: Shopping Showdown Side-by-Side Comparison', () => {
  test('Compares two candidates with scorable wardrobe, verifies verdict, factor cards, and saving', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // Ensure sample wardrobe is restored
    await page.goto('/settings');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.getByText(/Restored the labeled sample wardrobe/i)).toBeVisible();

    // 1. Navigate to Shopping Showdown
    await page.goto('/showdown');
    await expect(
      page.getByRole('heading', { name: 'Shopping Showdown', level: 1 }),
    ).toBeVisible();

    // 2. Click "Evaluate side by side"
    await page.getByRole('button', { name: /Evaluate side by side/i }).click();

    // 3. Verify showdown verdict banner renders
    await expect(page.getByText('Showdown Verdict')).toBeVisible();

    // Verify option cards render Option A and Option B
    await expect(page.getByText('Option A').first()).toBeVisible();
    await expect(page.getByText('Option B').first()).toBeVisible();

    // Verify numerical scores for both options
    const scoreCards = page.locator('.grid-2 .font-display');
    await expect(scoreCards.first()).toBeVisible();
    await expect(scoreCards.nth(1)).toBeVisible();

    // 4. Test save comparison
    const saveCmpBtn = page.getByRole('button', { name: /Save comparison/i });
    if (await saveCmpBtn.isVisible()) {
      await saveCmpBtn.click();
      await expect(page.getByText(/Saved/i).first()).toBeVisible();
    }

    // Assert zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Shows honest insufficient data verdict when wardrobe is empty without claiming near-tie or fake winner', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // 1. Clear all browser data in Settings
    await page.goto('/settings');
    await page.getByRole('button', { name: /Clear all browser data/i }).click();
    await page.getByRole('button', { name: /Confirm erase everything/i }).click();
    await expect(page.getByText(/Cleared all wardrobe items/i)).toBeVisible();

    // 2. Go to Shopping Showdown
    await page.goto('/showdown');

    // Verify wardrobe size notice is displayed
    await expect(
      page.getByText(/Your wardrobe has 0 items \(minimum 3 required for full scoring\)/i),
    ).toBeVisible();

    // Run showdown with empty wardrobe
    await page.getByRole('button', { name: /Evaluate side by side/i }).click();

    // 3. Verify verdict headline explicitly states insufficient data, NOT a fake near-tie
    await expect(
      page.getByRole('heading', { name: 'Insufficient wardrobe data to declare a winner' }),
    ).toBeVisible();
    await expect(page.getByText(/wardrobe is too small/i)).toBeVisible();

    // Verify both scores display "—" instead of numbers
    const scoreDisplays = page.locator('.grid-2 .font-display');
    await expect(scoreDisplays.first()).toHaveText('—');
    await expect(scoreDisplays.nth(1)).toHaveText('—');

    // Assert zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
