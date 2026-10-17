import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow G: Premium Editorial Dashboard & Curated Outfit Carousel', () => {
  test('Displays curated outfits in scroll-snap carousel with real garments and wear logging', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // 1. Visit Dashboard
    await page.goto('/');
    await expect(page).toHaveTitle(/PalettePilot/);

    // Verify editorial hero greeting and core philosophy
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Welcome/i);
    await expect(page.getByText('Personal Wardrobe Intelligence')).toBeVisible();

    // Verify Quick Actions exist and link correctly
    await expect(page.locator('main').getByRole('link', { name: /Should I buy this\?/i })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: /Compare two options/i })).toBeVisible();

    // 2. Verify Curated Outfit Carousel (Carousel Cards)
    await expect(page.getByText(/Today's curated pairings/i)).toBeVisible();
    const carouselTrack = page.locator('.editorial-carousel-track');
    await expect(carouselTrack).toBeVisible();

    const outfitCards = page.locator('.editorial-outfit-card');
    const cardCount = await outfitCards.count();
    expect(cardCount, 'Expected at least 1 curated outfit from seeded wardrobe').toBeGreaterThan(0);

    // Verify first outfit card content
    const firstCard = outfitCards.first();
    await expect(firstCard.locator('.editorial-look-number')).toContainText(/Look 01/i);
    await expect(firstCard.locator('.editorial-harmony-badge')).toContainText(/% harmony/i);
    await expect(firstCard.locator('.editorial-garment-tile').first()).toBeVisible();

    // Verify carousel navigation controls
    const nextBtn = page.getByRole('button', { name: /Next outfit/i });
    if (cardCount > 1) {
      await expect(nextBtn).toBeEnabled();
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // 3. Test "Log as worn today" on the active outfit card
    const logWearBtn = firstCard.getByRole('button', { name: /Log as worn today/i });
    await expect(logWearBtn).toBeVisible();
    await expect(logWearBtn).toBeEnabled();
    await logWearBtn.click();

    // Verify success feedback and updated button state (disabled with checkmark)
    await expect(page.getByText(/Outfit logged in your wear diary/i)).toBeVisible();
    const wornBtn = firstCard.getByRole('button', { name: /Worn today/i });
    await expect(wornBtn).toBeVisible();
    await expect(wornBtn).toBeDisabled();

    // 4. Verify Wardrobe at a Glance metrics
    await expect(page.getByText('Your wardrobe at a glance')).toBeVisible();
    await expect(page.getByText('Total Pieces')).toBeVisible();
    await expect(page.getByText('Ready Outfits')).toBeVisible();
    await expect(page.getByText('Neutral Anchor')).toBeVisible();
    await expect(page.getByText('Wear Tracking')).toBeVisible();

    // Verify Neutral Anchor is an honest computed percentage (e.g. 83% for sample wardrobe)
    const neutralCard = page.locator('.editorial-metric-card').filter({ hasText: 'Neutral Anchor' });
    await expect(neutralCard.locator('.editorial-metric-number')).toHaveText(/\d+%/);

    // Verify Ready Outfits shows a genuine combination count
    const outfitsCard = page.locator('.editorial-metric-card').filter({ hasText: 'Ready Outfits' });
    await expect(outfitsCard.locator('.editorial-metric-number')).toHaveText(/\d+/);

    // Verify ownCount vs sampleCount breakdown
    const totalCard = page.locator('.editorial-metric-card').filter({ hasText: 'Total Pieces' });
    await expect(totalCard.locator('.editorial-metric-sub')).toContainText(/yours/i);
    await expect(totalCard.locator('.editorial-metric-sub')).toContainText(/sample/i);

    // 5. Verify Persistence across page reload
    await page.reload();
    await expect(page.getByText(/Today's curated pairings/i)).toBeVisible();
    const reloadedCards = page.locator('.editorial-outfit-card');
    await expect(reloadedCards.first().locator('.editorial-look-number')).toContainText(/Look 01/i);

    // Verify network guard & console errors
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('Flow G (Mobile): 375px Editorial Dashboard Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('375px mobile view renders carousel smoothly without horizontal page overflow', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/');

    // Verify carousel cards fit within mobile viewport
    const firstCard = page.locator('.editorial-outfit-card').first();
    await expect(firstCard).toBeVisible();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).not.toBeNull();
    if (cardBox) {
      expect(cardBox.width, 'Outfit card width must fit within 375px mobile width').toBeLessThanOrEqual(340);
    }

    // Verify the entire document has zero horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow, 'Dashboard must have no horizontal overflow on 375px mobile').toBe(false);

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
