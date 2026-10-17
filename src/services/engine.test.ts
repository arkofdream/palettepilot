import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './repositories';
import { buildSampleAnalyses, buildSampleComparison, buildSampleItems } from './sampleData';
import { evaluateCandidate } from './engine/scoring';
import { computeInsights } from './insights';
import { inspectProductUrl } from './productUrl';
import { describeDataSources } from './analysisProvider';
import { compareAnalyses } from './comparison';

const now = new Date('2026-10-17T12:00:00Z');
const items = buildSampleItems(now);

describe('Wardrobe Match Engine', () => {
  const analyses = buildSampleAnalyses(items, DEFAULT_SETTINGS, now);

  it('scores sample products within 0–100 and exposes all factors', () => {
    for (const a of analyses) {
      console.log(
        a.product.name,
        a.smartBuyScore,
        a.verdict,
        a.factors.map((f) => `${f.id}:${f.status === 'assessed' ? f.score : '—'}`).join(' '),
        `outfits=${a.outfits.length}`,
      );
      expect(a.smartBuyScore).not.toBeNull();
      expect(a.smartBuyScore!).toBeGreaterThanOrEqual(0);
      expect(a.smartBuyScore!).toBeLessThanOrEqual(100);
      expect(a.factors).toHaveLength(5);
      const applied = a.factors.reduce((s, f) => s + f.appliedWeight, 0);
      expect(applied).toBeCloseTo(1, 5);
    }
  });

  it('flags the navy crewneck as a near duplicate of the owned navy merino', () => {
    const navy = analyses.find((a) => a.id === 'sample-analysis-navy')!;
    expect(navy.similarItems[0]?.itemId).toBe('sample-item-2');
    const cable = analyses.find((a) => a.id === 'sample-analysis-cable')!;
    expect(navy.smartBuyScore!).toBeLessThan(cable.smartBuyScore!);
  });

  it('only builds outfits from owned items plus the candidate', () => {
    const ids = new Set(items.map((i) => i.id));
    for (const a of analyses)
      for (const o of a.outfits) for (const id of o.itemIds) expect(id === 'candidate' || ids.has(id)).toBe(true);
  });

  it('excludes budget from the score when no price is given', () => {
    const r = evaluateCandidate(
      { category: 'top', colors: ['white'], seasons: ['summer'], intendedUse: ['casual'] },
      items,
      DEFAULT_SETTINGS,
    );
    const budget = r.factors.find((f) => f.id === 'budget')!;
    expect(budget.status).toBe('not-assessed');
    expect(budget.appliedWeight).toBe(0);
  });

  it('returns insufficient instead of a score for a tiny wardrobe', () => {
    const r = evaluateCandidate(
      { category: 'top', colors: ['white'], seasons: ['summer'], intendedUse: ['casual'] },
      items.slice(0, 2),
      DEFAULT_SETTINGS,
    );
    expect(r.smartBuyScore).toBeNull();
    expect(r.verdict).toBe('insufficient');
  });

  it('builds a comparison with a decision and reasons', () => {
    const c = buildSampleComparison(analyses, now)!;
    console.log(c.winner, c.reasons);
    expect(['A', 'B', 'tie', 'neither']).toContain(c.winner);
    expect(c.reasons.length).toBeGreaterThan(0);
  });

  it('handles comparisons with unscorable items honestly without fake certainty', () => {
    const unscorableA = { ...analyses[0], smartBuyScore: null };
    const unscorableB = { ...analyses[1], smartBuyScore: null };
    const cmp = compareAnalyses(unscorableA, unscorableB);
    expect(cmp.winner).toBe('tie');
    expect(cmp.reasons[0]).toContain('wardrobe is too small');
  });
});

describe('Honest data handling', () => {
  it('never claims a product URL was fetched', () => {
    const u = inspectProductUrl('www.zara.com/us/en/jacket-p123.html');
    expect(u.valid).toBe(true);
    expect(u.fetched).toBe(false);
    expect(u.hostname).toBe('zara.com');
    const notes = describeDataSources({
      product: { category: 'top', colors: ['white'], seasons: [], intendedUse: [], url: 'https://zara.com/x' },
      matchSource: { mode: 'all' },
      wardrobe: items,
      settings: DEFAULT_SETTINGS,
      hasImage: true,
    });
    expect(notes.find((n) => n.label.startsWith('Product link'))?.status).toBe('unavailable');
    expect(notes.find((n) => n.label === 'Product photo')?.status).toBe('provided-not-analyzed');
  });

  it('rejects invalid URLs', () => {
    expect(inspectProductUrl('not a url').valid).toBe(false);
  });

  it('computes cost per wear only with price and enough wears', () => {
    const ins = computeInsights(items, DEFAULT_SETTINGS, now);
    for (const c of ins.costPerWear.computed) {
      expect(c.item.price).toBeDefined();
      expect(c.wears).toBeGreaterThanOrEqual(3);
    }
    expect(ins.costPerWear.insufficient.some((x) => x.item.name === 'Olive cotton chinos')).toBe(true);
    // Items with no wear log must never be reported as rarely worn.
    for (const r of ins.wear.rarelyWorn) expect(r.item.wearLog.length).toBeGreaterThan(0);
    console.log('gaps', ins.gaps, 'additions', ins.additions, 'rarely', ins.wear.rarelyWorn.map((r) => r.item.name), 'rediscover', ins.rediscover.length);
  });

  it('handles completely empty wardrobe in insights safely without additions', () => {
    const ins = computeInsights([], DEFAULT_SETTINGS, now);
    expect(ins.total).toBe(0);
    expect(ins.additions).toEqual([]);
    expect(ins.wear.mostWorn).toEqual([]);
    expect(ins.wear.rarelyWorn).toEqual([]);
    expect(ins.costPerWear.computed).toEqual([]);
  });
});
