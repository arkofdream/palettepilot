import { describe, expect, it } from 'vitest';
import type { UserSettings, WardrobeItem } from '@/domain/types';
import { DEFAULT_SETTINGS, LocalSettingsRepository } from './repositories';
import { MemoryStore } from './storage/keyValueStore';
import { computeInsights } from './insights';

const mockItem = (overrides: Partial<WardrobeItem>): WardrobeItem => ({
  id: 'item_test_' + Math.random().toString(36).slice(2, 7),
  ownerId: 'local-device',
  name: 'Test Item',
  category: 'top',
  colors: ['navy'],
  seasons: ['autumn', 'winter'],
  occasions: ['work', 'casual'],
  wearLog: [],
  isSample: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('Wardrobe Gap Intelligence & Preference Governance (Phase 1)', () => {
  const fixedNow = new Date('2026-10-17T12:00:00.000Z');

  it('provides backward-compatible UserSettings defaults and sanitizes invalid values', async () => {
    const kv = new MemoryStore();
    // Simulate legacy IndexedDB record without gap preferences and with invalid types
    await kv.set('settings', {
      displayName: 'Alex',
      currency: 'EUR',
      // missing dismissedGaps and ignoredCategories
      ignoredCategories: ['invalid-cat', 'outerwear'],
      dismissedGaps: [123, 'gap_category_bottom', ''],
    });

    const repo = new LocalSettingsRepository(kv);
    const settings = await repo.get();

    // Must default and sanitize safely
    expect(settings.displayName).toBe('Alex');
    expect(settings.currency).toBe('EUR');
    expect(settings.ignoredCategories).toEqual(['outerwear']); // filtered out 'invalid-cat'
    expect(settings.dismissedGaps).toEqual(['gap_category_bottom']); // filtered out non-strings and empty

    // Update settings with new gap preference
    await repo.update({
      dismissedGaps: ['gap_category_bottom', 'gap_bottleneck_shoes_work'],
    });
    const updated = await repo.get();
    expect(updated.dismissedGaps).toEqual(['gap_category_bottom', 'gap_bottleneck_shoes_work']);
  });

  it('generates stable, deterministic gap and bottleneck identifiers', () => {
    const wardrobe: WardrobeItem[] = [
      mockItem({ category: 'top', occasions: ['work'] }),
      mockItem({ category: 'top', occasions: ['work'] }),
      mockItem({ category: 'bottom', occasions: ['work'] }),
    ];

    const ins1 = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);
    const ins2 = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);

    // Identifiers must be stable
    expect(ins1.gaps.map((g) => g.id)).toEqual(ins2.gaps.map((g) => g.id));
    expect(ins1.bottlenecks.map((b) => b.id)).toEqual(ins2.bottlenecks.map((b) => b.id));

    // Must match stable convention
    for (const gap of ins1.gaps) {
      expect(gap.id).toBe(`gap_category_${gap.category}`);
    }
    for (const b of ins1.bottlenecks) {
      expect(b.id).toBe(`gap_bottleneck_${b.missingRole}_${b.occasion}`);
    }
  });

  it('filters dismissed gaps from active recommendations while preserving recovery in dismissed lists', () => {
    const wardrobe: WardrobeItem[] = [
      mockItem({ category: 'top', colors: ['white'] }),
      mockItem({ category: 'top', colors: ['blue'] }),
      mockItem({ category: 'shoes', colors: ['black'] }),
    ];
    // Bottoms are 0, reference is 3 -> triggers gap_category_bottom
    const initial = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);
    expect(initial.gaps.some((g) => g.id === 'gap_category_bottom')).toBe(true);

    // Dismiss gap_category_bottom
    const settingsWithDismissed: UserSettings = {
      ...DEFAULT_SETTINGS,
      dismissedGaps: ['gap_category_bottom'],
    };
    const afterDismiss = computeInsights(wardrobe, settingsWithDismissed, fixedNow);

    // Active gaps must NOT contain the dismissed gap
    expect(afterDismiss.gaps.some((g) => g.id === 'gap_category_bottom')).toBe(false);
    expect(afterDismiss.activeGaps.some((g) => g.id === 'gap_category_bottom')).toBe(false);

    // Dismissed list must retain it for recovery
    expect(afterDismiss.dismissedGaps.some((g) => g.id === 'gap_category_bottom')).toBe(true);

    // Additions must not recommend bottoms since the gap was dismissed
    expect(afterDismiss.additions.some((a) => a.category === 'bottom')).toBe(false);
  });

  it('excludes user-ignored clothing categories completely from gap analysis', () => {
    const wardrobe: WardrobeItem[] = [
      mockItem({ category: 'top' }),
      mockItem({ category: 'top' }),
      mockItem({ category: 'bottom' }),
      mockItem({ category: 'shoes' }),
    ];

    // Normally outerwear has 0 owned -> triggers gap
    const normal = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);
    expect(normal.gaps.some((g) => g.category === 'outerwear')).toBe(true);

    // User ignores outerwear
    const settingsWithIgnored: UserSettings = {
      ...DEFAULT_SETTINGS,
      ignoredCategories: ['outerwear'],
    };
    const ignoredRes = computeInsights(wardrobe, settingsWithIgnored, fixedNow);

    // Must be marked isIgnored in byCategory and excluded from gaps
    const outerRow = ignoredRes.byCategory.find((c) => c.category === 'outerwear');
    expect(outerRow?.isIgnored).toBe(true);
    expect(ignoredRes.gaps.some((g) => g.category === 'outerwear')).toBe(false);
    expect(ignoredRes.additions.some((a) => a.category === 'outerwear')).toBe(false);
  });

  it('detects genuine combination bottlenecks when separates exist but missing key pairing piece', () => {
    // User has 3 tops and 2 bottoms for work, but 0 work shoes
    const wardrobe: WardrobeItem[] = [
      mockItem({ name: 'Work Shirt 1', category: 'top', occasions: ['work'], colors: ['white'] }),
      mockItem({ name: 'Work Shirt 2', category: 'top', occasions: ['work'], colors: ['light-blue'] }),
      mockItem({ name: 'Work Knit', category: 'top', occasions: ['work'], colors: ['navy'] }),
      mockItem({ name: 'Work Trousers 1', category: 'bottom', occasions: ['work'], colors: ['charcoal'] }),
      mockItem({ name: 'Work Trousers 2', category: 'bottom', occasions: ['work'], colors: ['navy'] }),
      // Shoes are for active only, none for work
      mockItem({ name: 'Running Shoes', category: 'shoes', occasions: ['active'], colors: ['white'] }),
    ];

    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      primaryOccasions: ['work', 'casual'],
    };

    const res = computeInsights(wardrobe, settings, fixedNow);

    // Must identify shoe combination bottleneck for work
    const shoeBottleneck = res.bottlenecks.find(
      (b) => b.missingRole === 'shoes' && b.occasion === 'work',
    );
    expect(shoeBottleneck).toBeDefined();
    expect(shoeBottleneck?.id).toBe('gap_bottleneck_shoes_work');
    expect(shoeBottleneck?.evidence).toContain('no compatible shoes');

    // Additions should prioritize resolving the shoe bottleneck
    const additionShoes = res.additions.find((a) => a.category === 'shoes');
    expect(additionShoes).toBeDefined();
    expect(additionShoes?.reason).toContain('combination bottleneck for work');
  });

  it('recognizes existing alternatives (e.g. dresses) so low bottoms do not force unnecessary purchases', () => {
    // User has only 1 bottom, but 3 versatile dresses and 2 pairs of shoes
    const wardrobe: WardrobeItem[] = [
      mockItem({ name: 'Sole Bottom', category: 'bottom', colors: ['navy'] }),
      mockItem({ name: 'Black Midi Dress', category: 'dress', colors: ['black'], occasions: ['work', 'casual'] }),
      mockItem({ name: 'Wrap Dress', category: 'dress', colors: ['navy'], occasions: ['work', 'evening'] }),
      mockItem({ name: 'Shirt Dress', category: 'dress', colors: ['cream'], occasions: ['casual'] }),
      mockItem({ name: 'Loafers', category: 'shoes', colors: ['black'] }),
      mockItem({ name: 'Sneakers', category: 'shoes', colors: ['white'] }),
    ];

    const res = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);

    // Bottoms is low (< 2), but dresses substitute
    const bottomGap = res.gaps.find((g) => g.category === 'bottom');
    expect(bottomGap).toBeDefined();
    expect(bottomGap?.hasSubstitutes).toBe(true);
    expect(bottomGap?.substitutesNote).toContain('already form full-body outfits');

    // Because substitutes exist, additions engine must NOT push bottom purchases
    expect(res.additions.some((a) => a.category === 'bottom')).toBe(false);
  });

  it('reports missing metadata notice when items lack occasion or season tags', () => {
    const wardrobe: WardrobeItem[] = [
      mockItem({ name: 'Untagged Shirt', category: 'top', occasions: [], seasons: [] }),
      mockItem({ name: 'Tagged Pants', category: 'bottom', occasions: ['work'], seasons: ['winter'] }),
    ];

    const res = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);

    expect(res.metadataNotice).toBeDefined();
    expect(res.metadataNotice?.unassignedOccasionsCount).toBe(1);
    expect(res.metadataNotice?.unassignedSeasonsCount).toBe(1);
    expect(res.metadataNotice?.message).toContain('lack occasion tags');
  });

  it('safely handles empty and low-data wardrobes without phantom recommendations', () => {
    // Empty wardrobe
    const emptyRes = computeInsights([], DEFAULT_SETTINGS, fixedNow);
    expect(emptyRes.total).toBe(0);
    expect(emptyRes.gaps).toEqual([]);
    expect(emptyRes.additions).toEqual([]);
    expect(emptyRes.bottlenecks).toEqual([]);

    // 2 items (below 3-item minimum threshold)
    const lowRes = computeInsights(
      [mockItem({ category: 'top' }), mockItem({ category: 'bottom' })],
      DEFAULT_SETTINGS,
      fixedNow,
    );
    expect(lowRes.total).toBe(2);
    expect(lowRes.additions).toEqual([]); // No additions when under 3 items
  });

  it('guarantees identical output for identical inputs (deterministic calculation)', () => {
    const wardrobe: WardrobeItem[] = [
      mockItem({ name: 'Item 1', category: 'top', colors: ['navy'], seasons: ['autumn'] }),
      mockItem({ name: 'Item 2', category: 'bottom', colors: ['charcoal'], seasons: ['autumn'] }),
      mockItem({ name: 'Item 3', category: 'shoes', colors: ['black'], seasons: ['autumn'] }),
    ];

    const runA = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);
    const runB = computeInsights(wardrobe, DEFAULT_SETTINGS, fixedNow);

    expect(runA).toEqual(runB);
  });
});
