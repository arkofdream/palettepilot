import type { ProductCandidate, PurchaseAnalysis, UserSettings, WardrobeItem, WardrobeItemDraft } from '@/domain/types';
import { describeDataSources, RULE_ENGINE } from './analysisProvider';
import { buildComparison } from './comparison';
import { evaluateCandidate } from './engine/scoring';
import { LOCAL_OWNER_ID } from './ids';

/**
 * Bundled sample content so a new visitor can explore the product. Every record
 * created here carries `isSample: true` and is labeled as sample/demo data in the UI.
 * Wear dates are generated relative to "now" and are illustrative only.
 */

const IMG = (file: string) => ({ kind: 'static' as const, url: `/images/samples/${file}` });

const daysAgo = (n: number, now: Date) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

type SampleItemSpec = WardrobeItemDraft & { wearDaysAgo: number[]; addedDaysAgo: number };

const SAMPLE_ITEMS: SampleItemSpec[] = [
  { name: 'White Oxford shirt', category: 'top', colors: ['white'], seasons: ['spring', 'summer', 'autumn', 'winter'], occasions: ['work', 'casual'], price: { amount: 68, currency: 'USD' }, image: IMG('white-oxford-shirt.jpg'), wearDaysAgo: [3, 9, 16, 24, 31, 45, 60, 75], addedDaysAgo: 2 },
  { name: 'Navy merino crewneck', category: 'knitwear', colors: ['navy'], seasons: ['spring', 'autumn', 'winter'], occasions: ['work', 'casual', 'weekend'], price: { amount: 120, currency: 'USD' }, image: IMG('navy-merino-crewneck.jpg'), wearDaysAgo: [2, 8, 15, 22, 40], addedDaysAgo: 4 },
  { name: 'Indigo straight jeans', category: 'bottom', colors: ['denim'], seasons: ['spring', 'summer', 'autumn', 'winter'], occasions: ['casual', 'weekend', 'travel'], price: { amount: 98, currency: 'USD' }, image: IMG('indigo-straight-jeans.jpg'), wearDaysAgo: [1, 4, 7, 11, 14, 19, 25, 33, 41], addedDaysAgo: 5 },
  { name: 'Camel wool overcoat', category: 'outerwear', colors: ['camel'], seasons: ['autumn', 'winter'], occasions: ['work', 'evening', 'casual'], price: { amount: 340, currency: 'USD' }, image: IMG('camel-wool-coat.jpg'), wearDaysAgo: [5, 12, 190], addedDaysAgo: 1 },
  { name: 'Charcoal tailored trousers', category: 'bottom', colors: ['charcoal'], seasons: ['spring', 'autumn', 'winter'], occasions: ['work', 'evening'], price: { amount: 135, currency: 'USD' }, wearDaysAgo: [6, 20, 35], addedDaysAgo: 8 },
  { name: 'Black Chelsea boots', category: 'shoes', colors: ['black'], seasons: ['spring', 'autumn', 'winter'], occasions: ['work', 'casual', 'evening'], price: { amount: 210, currency: 'USD' }, wearDaysAgo: [2, 5, 9, 13], addedDaysAgo: 9 },
  { name: 'White leather sneakers', category: 'shoes', colors: ['white'], seasons: ['spring', 'summer', 'autumn'], occasions: ['casual', 'weekend', 'travel'], price: { amount: 115, currency: 'USD' }, image: IMG('white-leather-sneakers.jpg'), wearDaysAgo: [1, 3, 10, 17, 28], addedDaysAgo: 3 },
  { name: 'Beige trench coat', category: 'outerwear', colors: ['beige'], seasons: ['spring', 'autumn'], occasions: ['work', 'casual', 'travel'], price: { amount: 260, currency: 'USD' }, image: IMG('beige-trench-coat.jpg'), wearDaysAgo: [150, 170], addedDaysAgo: 12 },
  { name: 'Breton striped top', category: 'top', colors: ['cream', 'navy'], seasons: ['spring', 'summer', 'autumn'], occasions: ['casual', 'weekend'], price: { amount: 55, currency: 'USD' }, image: IMG('breton-striped-top.jpg'), wearDaysAgo: [95], addedDaysAgo: 6 },
  { name: 'Olive cotton chinos', category: 'bottom', colors: ['olive'], seasons: ['spring', 'summer', 'autumn'], occasions: ['casual', 'weekend'], wearDaysAgo: [], addedDaysAgo: 14 },
  { name: 'Black midi dress', category: 'dress', colors: ['black'], seasons: ['spring', 'summer', 'autumn', 'winter'], occasions: ['evening', 'work'], price: { amount: 150, currency: 'USD' }, wearDaysAgo: [120], addedDaysAgo: 15 },
  { name: 'Cognac leather tote', category: 'accessory', colors: ['brown'], seasons: ['spring', 'summer', 'autumn', 'winter'], occasions: ['work', 'casual', 'travel'], price: { amount: 190, currency: 'USD' }, wearDaysAgo: [], addedDaysAgo: 16 },
];

const SAMPLE_PRODUCTS: (ProductCandidate & { key: string; daysAgo: number })[] = [
  { key: 'rust', daysAgo: 1, name: 'Rust suede overshirt', category: 'outerwear', colors: ['rust'], seasons: ['spring', 'autumn'], intendedUse: ['casual', 'weekend'], price: { amount: 165, currency: 'USD' }, image: IMG('rust-suede-overshirt.jpg'), url: 'https://shop.example.com/products/suede-overshirt' },
  { key: 'cable', daysAgo: 3, name: 'Cream cable-knit sweater', category: 'knitwear', colors: ['cream'], seasons: ['autumn', 'winter'], intendedUse: ['casual', 'weekend'], price: { amount: 140, currency: 'USD' }, image: IMG('cream-cable-knit.jpg') },
  { key: 'loafers', daysAgo: 6, name: 'Burgundy penny loafers', category: 'shoes', colors: ['burgundy'], seasons: ['spring', 'autumn', 'winter'], intendedUse: ['work', 'casual'], price: { amount: 195, currency: 'USD' }, image: IMG('burgundy-loafers.jpg') },
  { key: 'navy', daysAgo: 9, name: 'Navy cotton crewneck', category: 'knitwear', colors: ['navy'], seasons: ['spring', 'autumn', 'winter'], intendedUse: ['casual', 'work'], price: { amount: 89, currency: 'USD' } },
];

export function buildSampleItems(now = new Date()): WardrobeItem[] {
  return SAMPLE_ITEMS.map(({ wearDaysAgo, addedDaysAgo, ...draft }, i) => {
    const ts = daysAgo(addedDaysAgo, now);
    return {
      ...draft,
      id: `sample-item-${i + 1}`,
      ownerId: LOCAL_OWNER_ID,
      wearLog: wearDaysAgo.map((d) => daysAgo(d, now)).sort(),
      isSample: true,
      createdAt: ts,
      updatedAt: ts,
    };
  });
}

export function buildSampleAnalyses(items: WardrobeItem[], settings: UserSettings, now = new Date()): PurchaseAnalysis[] {
  return SAMPLE_PRODUCTS.map(({ key, daysAgo: d, ...product }) => {
    const r = evaluateCandidate(product, items, settings);
    return {
      id: `sample-analysis-${key}`,
      ownerId: LOCAL_OWNER_ID,
      createdAt: daysAgo(d, now),
      product,
      matchSource: { mode: 'all' },
      wardrobeSize: items.length,
      smartBuyScore: r.smartBuyScore,
      verdict: r.verdict,
      confidence: r.confidence,
      confidenceReasons: r.confidenceReasons,
      factors: r.factors,
      similarItems: r.similarItems,
      outfits: r.outfits.suggestions,
      explanation: r.explanation,
      styleNotes: r.styleNotes,
      dataSources: describeDataSources({ product, matchSource: { mode: 'all' }, wardrobe: items, settings, hasImage: !!product.image }),
      engine: RULE_ENGINE,
      isSample: true,
    };
  });
}

export function buildSampleComparison(analyses: PurchaseAnalysis[], now = new Date()) {
  const a = analyses.find((x) => x.id === 'sample-analysis-cable');
  const b = analyses.find((x) => x.id === 'sample-analysis-navy');
  if (!a || !b) return null;
  return { ...buildComparison(a, b), id: 'sample-comparison-1', createdAt: daysAgo(2, now), saved: true, isSample: true };
}
