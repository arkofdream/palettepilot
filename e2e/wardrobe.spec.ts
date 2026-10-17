import { test, expect } from '@playwright/test';
import {
  attachErrorMonitor,
  attachNetworkGuard,
  INVALID_TEXT_BUFFER,
  SYNTHETIC_PNG_BUFFER,
} from './helpers';

test.describe('Flow B: Garment Adding, Filtering & Persistence', () => {
  test('Adds a garment with photo, verifies filtering, persistence across reload, and handles invalid inputs', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/wardrobe');

    // 1. Open Add garment modal
    await page.getByRole('button', { name: /Add garment/i }).first().click();
    await expect(page.locator('.modal-panel')).toBeVisible();

    // 2. Test invalid input validation (empty name & negative price)
    await page.locator('#item-price').fill('-25');
    await page.getByRole('button', { name: /Add to wardrobe/i }).click();
    await expect(page.getByText(/Please enter an item name/i)).toBeVisible();
    await expect(page.getByText(/Enter a valid non-negative price/i)).toBeVisible();

    // 3. Test unsupported file rejection without crashing
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: INVALID_TEXT_BUFFER,
    });
    await expect(page.getByText(/Please choose a JPEG, PNG or WebP image/i)).toBeVisible();

    // 4. Fill valid garment details
    await page.locator('#item-name').fill('Minimalist Charcoal Wool Blazer');
    await page.locator('#item-price').fill('220');

    // Select Category: Outerwear
    await page
      .getByRole('radiogroup', { name: 'Category' })
      .getByRole('button', { name: 'Outerwear' })
      .click();

    // Select Color: Charcoal
    await page
      .getByRole('group', { name: 'Colors' })
      .getByRole('button', { name: 'Charcoal' })
      .click();

    // Upload synthetic valid garment photo
    await fileInput.setInputFiles({
      name: 'test-garment.png',
      mimeType: 'image/png',
      buffer: SYNTHETIC_PNG_BUFFER,
    });
    await expect(page.getByText(/Image ready/i)).toBeVisible();

    // 5. Submit valid garment
    await page.getByRole('button', { name: /Add to wardrobe/i }).click();

    // Verify modal closed & feedback displayed
    await expect(page.locator('.modal-panel')).not.toBeVisible();
    await expect(page.getByText(/Added “Minimalist Charcoal Wool Blazer” to My Wardrobe/i)).toBeVisible();
    const itemCard = page.locator('.garment-card').filter({ hasText: 'Minimalist Charcoal Wool Blazer' });
    await expect(itemCard).toBeVisible();

    // 6. Test persistence across full page reload (IndexedDB check)
    await page.reload();
    await expect(page.locator('.garment-card').filter({ hasText: 'Minimalist Charcoal Wool Blazer' })).toBeVisible();

    // 7. Test category and search filters
    const categorySelect = page.locator('#filter-category');
    await categorySelect.selectOption('outerwear');
    await expect(page.locator('.garment-card').filter({ hasText: 'Minimalist Charcoal Wool Blazer' })).toBeVisible();

    // Filter by Dresses (our blazer should NOT be shown)
    await categorySelect.selectOption('dress');
    await expect(page.locator('.garment-card').filter({ hasText: 'Minimalist Charcoal Wool Blazer' })).not.toBeVisible();

    // Search filter
    await categorySelect.selectOption('all');
    const searchInput = page.locator('#wardrobe-search');
    await searchInput.fill('Minimalist');
    await expect(page.locator('.garment-card').filter({ hasText: 'Minimalist Charcoal Wool Blazer' })).toBeVisible();

    // Clear search
    await searchInput.fill('');

    // 8. Test Native Editorial Shared-Element Lightbox Focus, Accessibility & Actions
    const blazerCard = page.locator('.garment-card').filter({ hasText: 'Minimalist Charcoal Wool Blazer' });
    const blazerInspectBtn = blazerCard.getByRole('button', { name: /Inspect photo and details/i });
    await blazerInspectBtn.click();

    // Verify lightbox dialog is visible with correct ARIA semantics and editorial details
    const lightbox = page.locator('.editorial-lightbox-panel');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByRole('heading', { name: 'Minimalist Charcoal Wool Blazer' })).toBeVisible();
    await expect(lightbox.getByText(/Color Harmony Palette/i)).toBeVisible();
    await expect(lightbox.getByText(/Wear Frequency & Economics/i)).toBeVisible();

    // 8.1 Verify background scroll lock
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('hidden');

    // 8.2 Verify initial focus inside dialog
    const closeXBtn = page.getByRole('button', { name: /Close image inspection/i });
    await expect(closeXBtn).toBeFocused();

    // 8.3 Verify Tab focus trap (Shift+Tab wraps to last element, Tab wraps back to first)
    await page.keyboard.press('Shift+Tab');
    const closeBottomBtn = lightbox.getByRole('button', { name: 'Close', exact: true });
    await expect(closeBottomBtn).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(closeXBtn).toBeFocused();

    // 8.4 Test "Wore today" action within lightbox
    await expect(lightbox.getByText(/0 logged wears/i)).toBeVisible();
    await lightbox.getByRole('button', { name: /Wore today/i }).click();
    await expect(lightbox.getByText(/Logged a wear for “Minimalist Charcoal Wool Blazer” today/i)).toBeVisible();
    await expect(lightbox.getByText(/1× logged/i)).toBeVisible();

    // 8.5 Test closing via Escape key & verify focus returns to triggering garment card
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
    const restoredOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(restoredOverflow).toBe('');
    await expect(blazerInspectBtn).toBeFocused();

    // 8.6 Test "Edit details" handoff from Lightbox to Edit modal
    await blazerInspectBtn.click();
    await expect(lightbox).toBeVisible();
    await lightbox.getByRole('button', { name: /Edit details/i }).click();
    await expect(lightbox).not.toBeVisible();
    const editModal = page.locator('.modal-panel');
    await expect(editModal).toBeVisible();
    await expect(editModal.getByRole('heading', { name: 'Minimalist Charcoal Wool Blazer' })).toBeVisible();
    await editModal.locator('.modal-header button[aria-label="Close"]').click();
    await expect(editModal).not.toBeVisible();

    // 8.7 Test prefers-reduced-motion media query
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await blazerInspectBtn.click();
    await expect(lightbox).toBeVisible();
    const animName = await lightbox.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(animName).toBe('none');
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Verify zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
