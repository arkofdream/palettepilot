import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Mobile Usability & Responsiveness (375x812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Dashboard has no horizontal overflow and hamburger menu works on mobile', async ({ page }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/');
    await expect(page.locator('.brand-name')).toBeVisible();

    // Verify hamburger menu button is visible on mobile
    const menuBtn = page.getByRole('button', { name: /Toggle navigation menu/i });
    await expect(menuBtn).toBeVisible();

    // Toggle menu open
    await menuBtn.click();
    const nav = page.locator('.primary-nav');
    await expect(nav).toHaveClass(/open/);

    // Verify navigation links are visible and clickable
    await expect(page.getByRole('link', { name: 'My Wardrobe' })).toBeVisible();

    // Toggle menu closed
    await menuBtn.click();
    await expect(nav).not.toHaveClass(/open/);

    // Check horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow, 'Dashboard should not have horizontal overflow on 375px mobile').toBe(false);

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('My Wardrobe page and filters fit without horizontal overflow on mobile', async ({ page }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/wardrobe');
    await expect(page.getByRole('heading', { name: 'My Wardrobe', level: 1 })).toBeVisible();

    // Check horizontal overflow on Wardrobe page
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow, 'Wardrobe page should not have horizontal overflow on 375px mobile').toBe(false);

    // Verify search and filter elements are accessible
    await expect(page.locator('#wardrobe-search')).toBeVisible();
    await expect(page.locator('#filter-category')).toBeVisible();

    // Open add garment modal and verify it fits on mobile
    await page.getByRole('button', { name: /Add garment/i }).first().click();
    const modal = page.locator('.modal-panel');
    await expect(modal).toBeVisible();

    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    if (modalBox) {
      expect(modalBox.width).toBeLessThanOrEqual(375);
    }

    // Close modal
    await page.locator('.modal-header button[aria-label="Close"]').click();
    await expect(modal).not.toBeVisible();

    // Open Editorial Lightbox on mobile and verify it fits within 375px without horizontal overflow
    const firstGarmentCard = page.locator('.garment-card').first();
    await firstGarmentCard.getByRole('button', { name: /Inspect photo and details/i }).click();
    const lightbox = page.locator('.editorial-lightbox-panel');
    await expect(lightbox).toBeVisible();

    const lightboxOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(lightboxOverflow, 'Editorial Lightbox should not cause horizontal overflow on 375px mobile').toBe(false);

    // Close lightbox
    await page.getByRole('button', { name: /Close image inspection/i }).click();
    await expect(lightbox).not.toBeVisible();

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Buy-or-Skip and AnalysisReport fit without horizontal overflow on mobile', async ({ page }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    await page.goto('/buy-or-skip');
    await expect(page.getByRole('heading', { name: 'Buy or Skip', level: 1 })).toBeVisible();

    // Check horizontal overflow on form
    const formOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(formOverflow, 'Buy-or-Skip form should not have horizontal overflow on 375px mobile').toBe(false);

    // Run analysis
    await page.locator('#cand-name').fill('Mobile Test Garment');
    await page.getByRole('button', { name: /Run Wardrobe Match Analysis/i }).click();

    // Check report view
    await expect(page.getByText(/Smart Buy Score/i)).toBeVisible();
    const reportOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(reportOverflow, 'Analysis report should not have horizontal overflow on 375px mobile').toBe(false);

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Shopping Showdown, Insights, and Settings fit without horizontal overflow on mobile', async ({ page }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // 1. Showdown
    await page.goto('/showdown');
    await expect(page.getByRole('heading', { name: 'Shopping Showdown', level: 1 })).toBeVisible();
    const showdownOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(showdownOverflow, 'Shopping Showdown should not have horizontal overflow on 375px mobile').toBe(false);

    // 2. Insights
    await page.goto('/insights');
    await expect(page.getByRole('heading', { name: 'Wardrobe Insights', level: 1 })).toBeVisible();
    const insightsOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(insightsOverflow, 'Insights should not have horizontal overflow on 375px mobile').toBe(false);

    // 3. Settings
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    const settingsOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(settingsOverflow, 'Settings should not have horizontal overflow on 375px mobile').toBe(false);

    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
