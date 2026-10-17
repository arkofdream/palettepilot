import { test, expect } from '@playwright/test';
import { attachErrorMonitor, attachNetworkGuard } from './helpers';

test.describe('Flow F: Insights Analytics & Settings Governance', () => {
  test('Displays honest analytics on Insights and verifies zero-unapproved-spend governance in Settings', async ({
    page,
  }) => {
    const disallowed = attachNetworkGuard(page);
    const errors = attachErrorMonitor(page);

    // Ensure sample data is restored so we have rich metrics
    await page.goto('/settings');
    await page.getByRole('button', { name: /Restore sample wardrobe/i }).click();
    await expect(page.getByText(/Restored the labeled sample wardrobe/i)).toBeVisible();

    // 1. Navigate to Wardrobe Insights
    await page.goto('/insights');
    await expect(
      page.getByRole('heading', { name: 'Wardrobe Insights', level: 1 }),
    ).toBeVisible();

    // Verify Capsule structure & category balance meters
    await expect(page.getByText('Capsule Structure')).toBeVisible();
    await expect(page.getByText('Category balance & potential gaps')).toBeVisible();

    // Verify recorded wear frequency
    await expect(page.getByText('Recorded Wear Frequency')).toBeVisible();
    await expect(page.getByText(/Frequently worn pieces/i)).toBeVisible();

    // Verify estimated cost per wear (honest formula)
    await expect(page.getByText('Estimated cost per wear')).toBeVisible();
    await expect(
      page.getByText(/Requires a recorded purchase price and at least 3 logged wears/i),
    ).toBeVisible();

    // 2. Navigate to Settings
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    // Verify Currency & Budget section
    await expect(page.locator('#set-currency')).toBeVisible();
    await expect(page.locator('#set-max-item')).toBeVisible();
    await expect(page.locator('#set-monthly')).toBeVisible();

    // 3. Verify Zero-Unapproved-Spend Governance Controls
    await expect(page.getByText('Zero-Unapproved-Spend Controls & Usage Audit')).toBeVisible();

    // Verify External AI is disabled by default
    const aiApprovalBadge = page.locator('.badge').filter({ hasText: 'Disabled (Default)' });
    await expect(aiApprovalBadge).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Approve Free-Tier AI/i }),
    ).toBeVisible();

    // Verify Global Kill Switch exists and is inactive by default
    const killSwitchBadge = page.locator('.badge').filter({ hasText: /Inactive \(Monitoring\)/i });
    await expect(killSwitchBadge).toBeVisible();

    // Verify Cost transparency callout
    await expect(page.getByText('Estimated Incurred Spend')).toBeVisible();
    await expect(page.getByText(/Pricing policy rule/i)).toBeVisible();

    // 4. Test Kill Switch toggle interactivity
    const killSwitchBtn = page.getByRole('button', { name: /Engage Global Kill Switch/i });
    await killSwitchBtn.click();
    await expect(
      page.getByText(/Global Kill Switch ACTIVATED/i),
    ).toBeVisible();
    await expect(
      page.locator('.badge').filter({ hasText: /Active \(All AI Halted\)/i }),
    ).toBeVisible();

    // Deactivate kill switch
    await page.getByRole('button', { name: /Deactivate Kill Switch/i }).click();
    await expect(
      page.getByText(/Global Kill Switch deactivated/i),
    ).toBeVisible();

    // 5. Strict Zero-Spend Network Check: assert zero external network calls occurred
    expect(disallowed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
