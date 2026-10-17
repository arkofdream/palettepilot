import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow C: Buy-or-Skip Decision Support Analysis', () => {
  test('Runs full purchase analysis with seeded wardrobe, validates factor breakdown & honesty', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // Ensure sample wardrobe is restored so we have sufficient pieces
    await page.goto('/settings');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.getByText(/Restored the labeled sample wardrobe/i)).toBeVisible();

    // 1. Navigate to Buy or Skip
    await page.goto('/buy-or-skip');
    await expect(page.getByRole('heading', { name: 'Buy or Skip', level: 1 })).toBeVisible();

    // 2. Fill candidate garment
    await page.locator('#cand-name').fill('Tailored Camel Overcoat');
    await page.locator('#cand-price').fill('175');

    // Select Category: Outerwear (already default, or click explicitly)
    await page
      .getByRole('radiogroup', { name: 'Category' })
      .getByRole('button', { name: 'Outerwear' })
      .click();

    // Ensure at least one color is selected
    const camelBtn = page
      .getByRole('group', { name: 'Colors' })
      .getByRole('button', { name: 'Camel' });
    if ((await camelBtn.getAttribute('aria-pressed')) !== 'true') {
      await camelBtn.click();
    }

    // 3. Submit analysis
    await page.getByRole('button', { name: /Run Wardrobe Match Analysis/i }).click();

    // 4. Verify analysis report renders with real score & transparent factors
    await expect(page.getByText('Tailored Camel Overcoat').first()).toBeVisible();
    await expect(page.getByText(/Smart Buy Score/i)).toBeVisible();

    // Verify numerical score between 0 and 100 is rendered
    const scoreElement = page.locator('.analysis-hero-grid .font-display');
    await expect(scoreElement).toBeVisible();
    const scoreText = await scoreElement.innerText();
    const numericScore = parseInt(scoreText.replace('/100', '').trim(), 10);
    expect(numericScore).toBeGreaterThanOrEqual(40);
    expect(numericScore).toBeLessThanOrEqual(100);

    // Verify decision factors are present and transparent
    await expect(page.locator('.title-sm', { hasText: 'Wardrobe compatibility' })).toBeVisible();
    await expect(page.locator('.title-sm', { hasText: 'Versatility estimate' })).toBeVisible();
    await expect(page.locator('.title-sm', { hasText: 'Low duplication' })).toBeVisible();
    await expect(page.locator('.title-sm', { hasText: 'Fills a gap' })).toBeVisible();
    await expect(page.locator('.title-sm', { hasText: 'Budget fit' })).toBeVisible();

    // Verify key score drivers highlight banner
    await expect(page.getByText('Top Driver').first()).toBeVisible();

    // Verify "Why this recommendation" explanation list
    await expect(page.getByText('Why this recommendation')).toBeVisible();

    // Verify confidence & data evaluation basis card is visible
    await expect(page.getByText(/Confidence Rationale & Evaluation Basis/i)).toBeVisible();

    // Verify visual distinction in outfits between candidate piece and owned wardrobe items
    const consideringBadge = page.locator('.outfit-items-grid').getByText('Considering').first();
    const ownedBadge = page.locator('.outfit-items-grid').getByText('Owned').first();
    await expect(consideringBadge).toBeVisible();
    await expect(ownedBadge).toBeVisible();

    // 5. Save to wardrobe action
    const saveBtn = page.getByRole('button', { name: /I bought it — add to My Wardrobe/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await expect(page.getByRole('button', { name: /Added to wardrobe/i })).toBeVisible();

    // Assert zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Produces no fake precision or made-up budget when wardrobe is empty and price is missing', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // 1. Clear all browser data in Settings
    await page.goto('/settings');
    await page.getByRole('button', { name: /Clear all browser data/i }).click();
    await page.getByRole('button', { name: /Confirm erase everything/i }).click();
    await expect(page.getByText(/Cleared all wardrobe items/i)).toBeVisible();

    // 2. Go to Buy or Skip with empty wardrobe
    await page.goto('/buy-or-skip');
    await page.locator('#cand-name').fill('Hypothetical Linen Shirt');
    // Note: cand-price is deliberately left empty

    await page
      .getByRole('radiogroup', { name: 'Category' })
      .getByRole('button', { name: 'Top' })
      .click();

    // Ensure White color is selected
    const whiteBtn = page
      .getByRole('group', { name: 'Colors' })
      .getByRole('button', { name: 'White' });
    if ((await whiteBtn.getAttribute('aria-pressed')) !== 'true') {
      await whiteBtn.click();
    }

    // Submit analysis
    await page.getByRole('button', { name: /Run Wardrobe Match Analysis/i }).click();

    // 3. Verify verdict is "More Data Needed" and score is "—/100" (no fake precision)
    await expect(page.getByText('More Data Needed').first()).toBeVisible();
    const scoreElement = page.locator('.analysis-hero-grid .font-display');
    await expect(scoreElement).toContainText('—');

    // Verify missing price was NOT fabricated
    await expect(
      page.getByText(/No price entered — budget fit not assessed/i).first(),
    ).toBeVisible();

    // Assert zero external network calls & no runtime errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
