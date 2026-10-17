import type { Comparison, FactorId, PurchaseAnalysis } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { VERDICT_THRESHOLDS } from './engine/scoring';
import { LOCAL_OWNER_ID, newId, nowIso } from './ids';

export const TIE_MARGIN = 4;

export const productLabel = (a: PurchaseAnalysis, fallback: string) => a.product.name?.trim() || fallback;

/**
 * Compares two analyses factor by factor. Pure and deterministic; reasons are
 * derived only from the two analyses' recorded factors.
 */
export function compareAnalyses(a: PurchaseAnalysis, b: PurchaseAnalysis): Pick<Comparison, 'winner' | 'reasons'> {
  const nameA = productLabel(a, 'Option A');
  const nameB = productLabel(b, 'Option B');
  const reasons: string[] = [];

  if (a.smartBuyScore === null || b.smartBuyScore === null) {
    return {
      winner: 'tie',
      reasons: ['At least one option could not be scored because the wardrobe is too small. Add more items and compare again.'],
    };
  }

  const factor = (x: PurchaseAnalysis, id: FactorId) => x.factors.find((f) => f.id === id)!;
  const diffs: { id: FactorId; d: number }[] = (['compatibility', 'versatility', 'uniqueness', 'gapFill', 'budget'] as FactorId[])
    .filter((id) => factor(a, id).status === 'assessed' && factor(b, id).status === 'assessed')
    .map((id) => ({ id, d: factor(a, id).score - factor(b, id).score }))
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

  for (const { id, d } of diffs) {
    if (Math.abs(d) < 8) continue;
    const better = d > 0 ? nameA : nameB;
    const fa = factor(a, id);
    const fb = factor(b, id);
    switch (id) {
      case 'compatibility': {
        const pa = fa.metrics?.pairable ?? 0;
        const pb = fb.metrics?.pairable ?? 0;
        reasons.push(`${better} works with more of your wardrobe (${pa} vs. ${pb} owned pieces).`);
        break;
      }
      case 'versatility': {
        const oa = fa.metrics?.outfits ?? 0;
        const ob = fb.metrics?.outfits ?? 0;
        reasons.push(`${better} enables more complete outfits with what you own (${oa} vs. ${ob}).`);
        break;
      }
      case 'uniqueness':
        reasons.push(`${better} duplicates less of what you already have (${fa.score}/100 vs. ${fb.score}/100 uniqueness).`);
        break;
      case 'gapFill':
        reasons.push(`${better} fills a thinner part of your wardrobe.`);
        break;
      case 'budget': {
        const pa = a.product.price ? formatMoney(a.product.price) : '—';
        const pb = b.product.price ? formatMoney(b.product.price) : '—';
        reasons.push(`${better} sits more comfortably in your budget (${pa} vs. ${pb}).`);
        break;
      }
    }
  }

  const budgetA = factor(a, 'budget').status;
  const budgetB = factor(b, 'budget').status;
  if (budgetA !== budgetB) {
    reasons.push('Budget fit was only assessed for one option, so the scores are not fully like-for-like.');
  }

  const delta = a.smartBuyScore - b.smartBuyScore;
  if (a.smartBuyScore < VERDICT_THRESHOLDS.consider && b.smartBuyScore < VERDICT_THRESHOLDS.consider) {
    reasons.unshift('Neither option scores well against your current wardrobe. Skipping both is a reasonable choice.');
    return { winner: 'neither', reasons };
  }
  if (Math.abs(delta) < TIE_MARGIN) {
    reasons.unshift(`The scores are within ${TIE_MARGIN} points — too close to call. Personal preference should decide.`);
    return { winner: 'tie', reasons };
  }
  const winnerName = delta > 0 ? nameA : nameB;
  reasons.unshift(`${winnerName} scores ${Math.abs(delta)} points higher overall.`);
  if (!reasons.slice(1).length) reasons.push('No single factor differs strongly; the lead comes from small advantages across several factors.');
  return { winner: delta > 0 ? 'A' : 'B', reasons };
}

export function buildComparison(a: PurchaseAnalysis, b: PurchaseAnalysis): Comparison {
  const { winner, reasons } = compareAnalyses(a, b);
  return {
    id: newId('cmp'),
    ownerId: LOCAL_OWNER_ID,
    createdAt: nowIso(),
    title: `${productLabel(a, 'Option A')} vs. ${productLabel(b, 'Option B')}`,
    analysisA: a,
    analysisB: b,
    winner,
    reasons,
    saved: false,
    isSample: false,
  };
}
