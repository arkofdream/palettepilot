import { describe, expect, it } from 'vitest';
import { MemoryStore } from './storage/keyValueStore';
import { LocalImageStore } from './storage/imageStore';
import {
  LocalAnalysisRepository,
  LocalComparisonRepository,
  LocalSettingsRepository,
  LocalWardrobeRepository,
} from './repositories';
import { LocalRuleBasedProvider } from './analysisProvider';
import { buildComparison } from './comparison';

describe('Repository & Service Layer Integration', () => {
  it('persists wardrobe CRUD, wear logs, analyses, comparisons, and settings', async () => {
    const kv = new MemoryStore();
    const imgKv = new MemoryStore();
    const images = new LocalImageStore(imgKv);
    const wardrobe = new LocalWardrobeRepository(kv, images);
    const analyses = new LocalAnalysisRepository(kv, images);
    const comparisons = new LocalComparisonRepository(kv, images);
    const settings = new LocalSettingsRepository(kv);
    const provider = new LocalRuleBasedProvider();

    // 1. Default settings use USD
    const s0 = await settings.get();
    expect(s0.currency).toBe('USD');

    // 2. Create wardrobe items
    const shirt = await wardrobe.create({
      name: 'Crisp White Shirt',
      category: 'top',
      colors: ['white'],
      seasons: ['spring', 'summer', 'autumn', 'winter'],
      occasions: ['work', 'casual'],
      price: { amount: 90, currency: 'USD' },
    });
    const trousers = await wardrobe.create({
      name: 'Charcoal Wool Trousers',
      category: 'bottom',
      colors: ['charcoal'],
      seasons: ['autumn', 'winter', 'spring'],
      occasions: ['work', 'evening'],
      price: { amount: 150, currency: 'USD' },
    });
    const shoes = await wardrobe.create({
      name: 'Black Leather Loafers',
      category: 'shoes',
      colors: ['black'],
      seasons: ['spring', 'summer', 'autumn', 'winter'],
      occasions: ['work', 'casual', 'evening'],
      price: { amount: 220, currency: 'USD' },
    });

    expect((await wardrobe.list()).length).toBe(3);

    // 3. Edit item & log wears
    const updatedShirt = await wardrobe.update(shirt.id, { name: 'Poplin White Shirt' });
    expect(updatedShirt.name).toBe('Poplin White Shirt');
    await wardrobe.logWear(shirt.id, '2026-10-01T09:00:00.000Z');
    await wardrobe.logWear(shirt.id, '2026-10-05T09:00:00.000Z');
    const afterWear = await wardrobe.get(shirt.id);
    expect(afterWear?.wearLog.length).toBe(2);

    // 4. Run purchase analyses through the provider interface
    const currentWardrobe = await wardrobe.list();
    const analysisA = await provider.analyze({
      product: {
        name: 'Camel Overcoat',
        category: 'outerwear',
        colors: ['camel'],
        seasons: ['autumn', 'winter'],
        intendedUse: ['work', 'casual'],
        price: { amount: 180, currency: 'USD' },
      },
      matchSource: { mode: 'all' },
      wardrobe: currentWardrobe,
      settings: s0,
      hasImage: false,
    });
    await analyses.save(analysisA);
    expect(analysisA.smartBuyScore).not.toBeNull();
    expect(analysisA.outfits.length).toBeGreaterThan(0);

    const analysisB = await provider.analyze({
      product: {
        name: 'Duplicate White Shirt',
        category: 'top',
        colors: ['white'],
        seasons: ['spring', 'summer', 'autumn', 'winter'],
        intendedUse: ['work', 'casual'],
        price: { amount: 160, currency: 'USD' },
      },
      matchSource: { mode: 'all' },
      wardrobe: currentWardrobe,
      settings: s0,
      hasImage: false,
    });
    await analyses.save(analysisB);

    // 5. Compare and save comparison
    const cmp = buildComparison(analysisA, analysisB);
    expect(cmp.winner).toBe('A');
    await comparisons.save({ ...cmp, saved: true });
    expect((await comparisons.list()).length).toBe(1);

    // 6. Change currency in settings
    const s1 = await settings.update({ currency: 'EUR', maxItemPrice: 200 });
    expect(s1.currency).toBe('EUR');
    expect(s1.maxItemPrice).toBe(200);

    // 7. Delete item
    await wardrobe.remove(trousers.id);
    await wardrobe.remove(shoes.id);
    expect((await wardrobe.list()).length).toBe(1);
  });
});
