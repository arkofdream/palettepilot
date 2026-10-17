import { describe, expect, it } from 'vitest';
import type { WardrobeItem } from '@/domain/types';
import { curateWardrobeOutfits } from './curatedOutfits';

describe('Curated Outfits Engine', () => {
  it('returns empty result when wardrobe has fewer than 3 items', () => {
    const empty = curateWardrobeOutfits([]);
    expect(empty.outfits).toEqual([]);
    expect(empty.totalCombinationsCount).toBe(0);

    const twoItems: WardrobeItem[] = [
      {
        id: '1',
        ownerId: 'local',
        isSample: false,
        name: 'White Shirt',
        category: 'top',
        colors: ['white'],
        seasons: ['spring', 'summer'],
        occasions: ['work'],
        wearLog: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        ownerId: 'local',
        isSample: false,
        name: 'Jeans',
        category: 'bottom',
        colors: ['denim'],
        seasons: ['spring', 'summer'],
        occasions: ['work'],
        wearLog: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const sparse = curateWardrobeOutfits(twoItems);
    expect(sparse.outfits).toEqual([]);
    expect(sparse.totalCombinationsCount).toBe(0);
  });

  it('curates complete, high-harmony outfits from a test wardrobe', () => {
    const wardrobe: WardrobeItem[] = [
      {
        id: 'top-1',
        ownerId: 'local',
        isSample: false,
        name: 'White Oxford shirt',
        category: 'top',
        colors: ['white'],
        seasons: ['spring', 'summer', 'autumn', 'winter'],
        occasions: ['work', 'casual'],
        wearLog: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'bottom-1',
        ownerId: 'local',
        isSample: false,
        name: 'Charcoal tailored trousers',
        category: 'bottom',
        colors: ['charcoal'],
        seasons: ['spring', 'autumn', 'winter'],
        occasions: ['work', 'evening'],
        wearLog: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'shoes-1',
        ownerId: 'local',
        isSample: false,
        name: 'Black Chelsea boots',
        category: 'shoes',
        colors: ['black'],
        seasons: ['spring', 'autumn', 'winter'],
        occasions: ['work', 'casual', 'evening'],
        wearLog: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'outer-1',
        ownerId: 'local',
        isSample: false,
        name: 'Camel wool overcoat',
        category: 'outerwear',
        colors: ['camel'],
        seasons: ['autumn', 'winter'],
        occasions: ['work', 'evening', 'casual'],
        wearLog: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = curateWardrobeOutfits(wardrobe, 4);

    expect(result.outfits.length).toBeGreaterThan(0);
    expect(result.totalCombinationsCount).toBeGreaterThan(0);

    for (const outfit of result.outfits) {
      expect(outfit.items.length).toBeGreaterThanOrEqual(2);
      expect(outfit.harmony).toBeGreaterThanOrEqual(0.5);
      expect(outfit.rationale).toBeTruthy();

      // Ensure every item in the outfit is an actual member of the input wardrobe
      const wardrobeIds = new Set(wardrobe.map((w) => w.id));
      for (const item of outfit.items) {
        expect(wardrobeIds.has(item.id)).toBe(true);
      }
    }
  });
});
