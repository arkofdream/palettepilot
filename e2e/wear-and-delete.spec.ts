import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow E: Wear Logging & Deletion Protection', () => {
  test('Safely handles wear logging, protects against invalid dates, and enforces two-step deletion confirmation', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // Ensure sample wardrobe is restored
    await page.goto('/settings');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.getByText(/Restored the labeled sample wardrobe/i)).toBeVisible();

    // 1. Navigate to My Wardrobe
    await page.goto('/wardrobe');
    const targetCard = page
      .locator('.garment-card')
      .filter({ hasText: 'White Oxford shirt' });
    await expect(targetCard).toBeVisible();

    // 2. Open edit modal
    await targetCard.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.modal-panel')).toBeVisible();

    // 3. Test empty date safety: empty input disables "Log wear" and does not crash
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('');
    const logWearBtn = page.getByRole('button', { name: /Log wear/i });
    await expect(logWearBtn).toBeDisabled();

    // 4. Test logging valid wear date
    await dateInput.fill('2026-10-15');
    await expect(logWearBtn).toBeEnabled();
    await logWearBtn.click();

    // Verify logged wear date badge appears
    await expect(page.locator('.modal-body .badge').filter({ hasText: 'Oct 15' })).toBeVisible();

    // 5. Test deletion cancellation: click "Delete item" -> click "Cancel"
    await page.getByRole('button', { name: /Delete item/i }).click();
    const confirmDeleteBtn = page.getByRole('button', { name: /Confirm delete/i });
    const cancelDeleteBtn = page.getByRole('button', { name: 'Cancel' }).first();
    await expect(confirmDeleteBtn).toBeVisible();
    await expect(cancelDeleteBtn).toBeVisible();

    // Cancel deletion
    await cancelDeleteBtn.click();
    await expect(confirmDeleteBtn).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Delete item/i })).toBeVisible();

    // Close modal without deleting
    await page.locator('.modal-header button[aria-label="Close"]').click();
    await expect(targetCard).toBeVisible();

    // 6. Test confirmed deletion
    await targetCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: /Delete item/i }).click();
    await page.getByRole('button', { name: /Confirm delete/i }).click();

    // Verify modal closes and item is removed from wardrobe grid
    await expect(page.locator('.modal-panel')).not.toBeVisible();
    await expect(page.getByText(/Removed item from My Wardrobe/i)).toBeVisible();
    await expect(targetCard).not.toBeVisible();

    // 7. Verify deletion persists across page reload
    await page.reload();
    await expect(targetCard).not.toBeVisible();

    // Assert zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
