import { labelOf } from '@/domain/catalog';
import type {
  Category,
  Confidence,
  ExplanationPoint,
  FactorId,
  Money,
  ProductCandidate,
  ScoreFactor,
  SimilarItem,
  UserSettings,
  Verdict,
  WardrobeItem,
} from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { COLOR_MAP } from '@/domain/catalog';
import { assessPair, assessSimilarity, areComplementary, type MatchableItem } from './matching';
import { suggestOutfits, type OutfitSearchResult } from './outfits';

export const CANDIDATE_ID = 'candidate';

/** Nominal factor weights. Shown to users verbatim. */
export const FACTOR_WEIGHTS: Record<FactorId, number> = {
  compatibility: 0.35,
  versatility: 0.2,
  uniqueness: 0.2,
  gapFill: 0.1,
  budget: 0.15,
};

export const FACTOR_LABELS: Record<FactorId, string> = {
  compatibility: 'Wardrobe compatibility',
  versatility: 'Versatility estimate',
  uniqueness: 'Low duplication',
  gapFill: 'Fills a gap',
  budget: 'Budget fit',
};

export const FACTOR_DESCRIPTIONS: Record<FactorId, string> = {
  compatibility: 'Share of items in complementary categories that pair on color, season and occasion.',
  versatility: 'How many complete outfits it enables, across seasons and occasions.',
  uniqueness: 'Penalises close matches to pieces you already own.',
  gapFill: 'Rewards categories and occasions your wardrobe is thin on.',
  budget: 'Price against your per-item limit or monthly budget.',
};

/** Reference capsule used for gap detection. A heuristic, not a rule. */
export const CAPSULE_BASELINE: Record<Category, number> = {
  top: 4,
  knitwear: 2,
  bottom: 3,
  dress: 1,
  outerwear: 2,
  shoes: 3,
  accessory: 2,
};

export const VERDICT_THRESHOLDS = { buy: 72, consider: 50 };
export const MIN_WARDROBE_ITEMS = 3;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

export function candidateAsMatchable(p: ProductCandidate): MatchableItem {
  return {
    id: CANDIDATE_ID,
    name: p.name?.trim() || `New ${labelOf.category(p.category).toLowerCase()}`,
    category: p.category,
    colors: p.colors,
    seasons: p.seasons,
    occasions: p.intendedUse,
  };
}

interface FactorDraft {
  score: number;
  status: 'assessed' | 'not-assessed';
  summary: string;
  details: string[];
  metrics?: Record<string, number>;
}

function compatibilityFactor(candidate: MatchableItem, wardrobe: WardrobeItem[]) {
  const assessments = wardrobe.map((w) => assessPair(candidate, w));
  const complementary = assessments.filter((a) => a.complementary);
  const pairable = complementary.filter((a) => a.pairs).sort((a, b) => b.harmony - a.harmony);
  if (complementary.length === 0) {
    return {
      factor: {
        score: 0,
        status: 'not-assessed',
        summary: 'No items in complementary categories to pair with yet.',
        details: ['Add bottoms, shoes or layers to assess compatibility.'],
        metrics: { pairable: 0, complementary: 0 },
      } as FactorDraft,
      pairable,
      complementary,
    };
  }
  const ratio = pairable.length / complementary.length;
  const absolute = Math.min(pairable.length / 6, 1);
  const score = round(100 * (0.6 * ratio + 0.4 * absolute));
  const blocked = (k: 'color' | 'season' | 'occasion') => complementary.filter((a) => a.blockers.includes(k)).length;
  const details = [
    `Pairs with ${pairable.length} of ${complementary.length} items in complementary categories.`,
  ];
  if (pairable.length) details.push(`Strongest matches: ${pairable.slice(0, 3).map((p) => p.item.name).join(', ')}.`);
  if (blocked('color')) details.push(`${blocked('color')} item(s) are a weaker color match.`);
  if (blocked('season')) details.push(`${blocked('season')} item(s) are worn in different seasons.`);
  if (blocked('occasion')) details.push(`${blocked('occasion')} item(s) suit different occasions.`);
  return {
    factor: {
      score,
      status: 'assessed',
      summary: `Works with ${pairable.length} piece${pairable.length === 1 ? '' : 's'} you own.`,
      details,
      metrics: { pairable: pairable.length, complementary: complementary.length },
    } as FactorDraft,
    pairable,
    complementary,
  };
}

function versatilityFactor(candidate: MatchableItem, outfits: OutfitSearchResult): FactorDraft {
  const s1 = Math.min(outfits.totalFound / 12, 1);
  const s2 = candidate.seasons.length ? candidate.seasons.length / 4 : 0.5;
  const s3 = Math.min(outfits.occasionsCovered.length / 3, 1);
  const dominant = candidate.colors[0] ? COLOR_MAP[candidate.colors[0]] : undefined;
  const s4 = dominant?.neutral ? 1 : 0.5;
  const score = round(100 * (0.5 * s1 + 0.2 * s2 + 0.15 * s3 + 0.15 * s4));
  const count = outfits.totalFound >= 40 ? '40+' : String(outfits.totalFound);
  return {
    score,
    status: 'assessed',
    summary:
      outfits.totalFound === 0
        ? 'No complete outfits found with your current wardrobe.'
        : `About ${count} complete outfit combination${outfits.totalFound === 1 ? '' : 's'} with what you own.`,
    details: [
      `${count} outfit combination(s) found using owned pieces.`,
      `Intended for ${candidate.seasons.length || 'unspecified'} of 4 seasons.`,
      outfits.occasionsCovered.length
        ? `Occasions covered: ${outfits.occasionsCovered.map((o) => labelOf.occasion(o).toLowerCase()).join(', ')}.`
        : 'No occasions covered by complete outfits yet.',
      dominant?.neutral
        ? `${dominant.label} is a neutral, which tends to mix easily.`
        : `${dominant?.label ?? 'This color'} is an accent color, which mixes less freely than neutrals.`,
    ],
    metrics: { outfits: outfits.totalFound, seasons: candidate.seasons.length },
  };
}

function uniquenessFactor(candidate: MatchableItem, wardrobe: WardrobeItem[]) {
  const similar = wardrobe
    .map((w) => assessSimilarity(candidate, w))
    .filter((s): s is NonNullable<typeof s> => !!s && s.similarity >= 0.65)
    .sort((a, b) => b.similarity - a.similarity);
  const near = similar.filter((s) => s.similarity >= 0.85).length;
  const partial = similar.length - near;
  const score = round(clamp(100 - near * 60 - partial * 25, 5, 100));
  const summary =
    similar.length === 0
      ? 'Nothing very similar in your wardrobe.'
      : near
        ? `${near} close duplicate${near === 1 ? '' : 's'} already owned.`
        : `${partial} similar piece${partial === 1 ? '' : 's'} already owned.`;
  return {
    factor: {
      score,
      status: 'assessed',
      summary,
      details: similar.length
        ? similar.slice(0, 4).map((s) => `${s.item.name}: ${Math.round(s.similarity * 100)}% overlap — ${s.reasons.join(', ').toLowerCase()}.`)
        : ['No owned item shares this category and color closely.'],
      metrics: { nearDuplicates: near, partialDuplicates: partial },
    } as FactorDraft,
    similar,
  };
}

function gapFactor(candidate: MatchableItem, wardrobe: WardrobeItem[]): FactorDraft {
  const n = wardrobe.filter((w) => w.category === candidate.category).length;
  const target = CAPSULE_BASELINE[candidate.category];
  const ratio = target ? n / target : 1;
  const gapCategory = ratio < 0.5 ? 1 : ratio < 1 ? 0.6 : 0.2;
  const forOccasion = candidate.occasions.length
    ? wardrobe.filter((w) => w.occasions.some((o) => candidate.occasions.includes(o))).length
    : wardrobe.length;
  const gapOccasion = 1 - Math.min(forOccasion / 8, 1);
  const owned = new Set(wardrobe.flatMap((w) => w.colors));
  const newColor = candidate.colors[0] && !owned.has(candidate.colors[0]) ? 1 : 0;
  const score = round(100 * (0.6 * gapCategory + 0.3 * gapOccasion + 0.1 * newColor));
  const catLabel = labelOf.categoryPlural(candidate.category).toLowerCase();
  return {
    score,
    status: 'assessed',
    summary:
      gapCategory >= 0.6
        ? `You own ${n} ${catLabel} — fewer than a typical capsule (${target}).`
        : `You already own ${n} ${catLabel}.`,
    details: [
      `${n} owned in this category; reference capsule suggests about ${target}.`,
      candidate.occasions.length
        ? `${forOccasion} owned item(s) suit the intended use (${candidate.occasions.map((o) => labelOf.occasion(o).toLowerCase()).join(', ')}).`
        : 'No intended use given, so occasion coverage was not weighed specifically.',
      newColor ? `${labelOf.color(candidate.colors[0])} would be new to your wardrobe.` : 'Its main color already appears in your wardrobe.',
    ],
  };
}

function budgetFactor(price: Money | undefined, settings: UserSettings, outfitCount: number): FactorDraft {
  if (!price) {
    return { score: 0, status: 'not-assessed', summary: 'No price entered — budget fit not assessed.', details: ['Add a price to include budget fit in the score.'] };
  }
  if (price.currency !== settings.currency) {
    return {
      score: 0,
      status: 'not-assessed',
      summary: `Price is in ${price.currency}; your budget is in ${settings.currency}.`,
      details: ['Currency conversion is not available yet, so budget fit was not assessed.'],
    };
  }
  const reference = settings.maxItemPrice ?? (settings.monthlyBudget ? settings.monthlyBudget * 0.5 : undefined);
  const perOutfit = outfitCount > 0 ? `Roughly ${formatMoney({ amount: price.amount / Math.min(outfitCount, 40), currency: price.currency })} per outfit combination found.` : null;
  if (!reference) {
    return {
      score: 0,
      status: 'not-assessed',
      summary: 'No budget set — budget fit not assessed.',
      details: ['Set a per-item limit or monthly budget in Settings.', ...(perOutfit ? [perOutfit] : [])],
    };
  }
  const strictness = { relaxed: 1.25, balanced: 1, strict: 0.8 }[settings.budgetStrictness];
  const effective = reference * strictness;
  const r = price.amount / effective;
  let score: number;
  if (r <= 0.5) score = 100;
  else if (r <= 1) score = 100 - (r - 0.5) * 60;
  else if (r <= 1.5) score = 70 - (r - 1) * 100;
  else score = 20 - (r - 1.5) * 40;
  score = round(clamp(score));
  const details = [
    settings.maxItemPrice
      ? `Your per-item limit is ${formatMoney({ amount: settings.maxItemPrice, currency: settings.currency })} (${settings.budgetStrictness} strictness).`
      : `No per-item limit set; using half of your monthly budget as a reference (${formatMoney({ amount: reference, currency: settings.currency })}).`,
  ];
  if (settings.monthlyBudget) details.push(`Uses ${Math.round((price.amount / settings.monthlyBudget) * 100)}% of your monthly clothing budget.`);
  if (perOutfit) details.push(perOutfit);
  return {
    score,
    status: 'assessed',
    summary: r <= 1 ? `${formatMoney(price)} is within your budget.` : `${formatMoney(price)} is above your usual spend.`,
    details,
  };
}

export interface EngineResult {
  smartBuyScore: number | null;
  verdict: Verdict;
  confidence: Confidence;
  confidenceReasons: string[];
  factors: ScoreFactor[];
  similarItems: SimilarItem[];
  outfits: OutfitSearchResult;
  explanation: ExplanationPoint[];
  styleNotes: string[];
}

/** Pure scoring function. Deterministic for the same inputs. */
export function evaluateCandidate(
  product: ProductCandidate,
  wardrobe: WardrobeItem[],
  settings: UserSettings,
): EngineResult {
  const candidate = candidateAsMatchable(product);
  const outfits = suggestOutfits(candidate, wardrobe, 3);
  const compat = compatibilityFactor(candidate, wardrobe);
  const uniq = uniquenessFactor(candidate, wardrobe);
  const drafts: Record<FactorId, FactorDraft> = {
    compatibility: compat.factor,
    versatility: versatilityFactor(candidate, outfits),
    uniqueness: uniq.factor,
    gapFill: gapFactor(candidate, wardrobe),
    budget: budgetFactor(product.price, settings, outfits.totalFound),
  };

  const assessedWeight = (Object.keys(drafts) as FactorId[])
    .filter((id) => drafts[id].status === 'assessed')
    .reduce((s, id) => s + FACTOR_WEIGHTS[id], 0);

  const factors: ScoreFactor[] = (Object.keys(drafts) as FactorId[]).map((id) => ({
    id,
    label: FACTOR_LABELS[id],
    weight: FACTOR_WEIGHTS[id],
    appliedWeight: drafts[id].status === 'assessed' && assessedWeight ? FACTOR_WEIGHTS[id] / assessedWeight : 0,
    ...drafts[id],
  }));

  const insufficient = wardrobe.length < MIN_WARDROBE_ITEMS || drafts.compatibility.status !== 'assessed';
  const smartBuyScore = insufficient
    ? null
    : round(factors.reduce((s, f) => s + f.score * f.appliedWeight, 0));

  const verdict: Verdict =
    smartBuyScore === null
      ? 'insufficient'
      : smartBuyScore >= VERDICT_THRESHOLDS.buy
        ? 'buy'
        : smartBuyScore >= VERDICT_THRESHOLDS.consider
          ? 'consider'
          : 'skip';

  // Confidence reflects data completeness, not model certainty.
  const confidenceReasons: string[] = ['Based on the details you entered — the product photo itself was not analyzed.'];
  let points = 0;
  if (wardrobe.length >= 12) points += 2;
  else if (wardrobe.length >= 6) points += 1;
  confidenceReasons.push(`${wardrobe.length} wardrobe item${wardrobe.length === 1 ? '' : 's'} considered${wardrobe.length < 6 ? ' — more items give a better estimate' : ''}.`);
  if (drafts.budget.status === 'assessed') points += 1;
  else confidenceReasons.push('Budget fit was not included.');
  if (product.intendedUse.length) points += 1;
  else confidenceReasons.push('No intended use given.');
  const confidence: Confidence = points >= 4 ? 'high' : points >= 2 ? 'medium' : 'low';

  const similarItems: SimilarItem[] = uniq.similar.slice(0, 4).map((s) => ({
    itemId: s.item.id,
    similarity: s.similarity,
    reasons: s.reasons,
  }));

  const explanation = buildExplanation(factors, compat.pairable.length, uniq.similar.length, outfits.totalFound, verdict);
  const styleNotes = buildStyleNotes(product, settings);

  return { smartBuyScore, verdict, confidence, confidenceReasons, factors, similarItems, outfits, explanation, styleNotes };
}

function buildExplanation(
  factors: ScoreFactor[],
  pairable: number,
  similar: number,
  outfitCount: number,
  verdict: Verdict,
): ExplanationPoint[] {
  const pts: ExplanationPoint[] = [];
  const f = (id: FactorId) => factors.find((x) => x.id === id)!;
  if (verdict === 'insufficient') {
    pts.push({ tone: 'info', text: `Add at least ${MIN_WARDROBE_ITEMS} items, including pieces from other categories, to get a Smart Buy Score.` });
  }
  const compat = f('compatibility');
  if (compat.status === 'assessed') {
    pts.push({
      tone: compat.score >= 65 ? 'positive' : compat.score >= 40 ? 'neutral' : 'negative',
      text: `${compat.summary} ${compat.details[0]}`,
    });
  }
  pts.push({
    tone: outfitCount >= 6 ? 'positive' : outfitCount > 0 ? 'neutral' : 'negative',
    text: f('versatility').summary,
  });
  const uniq = f('uniqueness');
  pts.push({ tone: similar === 0 ? 'positive' : uniq.score < 50 ? 'negative' : 'neutral', text: uniq.summary });
  const gap = f('gapFill');
  pts.push({ tone: gap.score >= 60 ? 'positive' : 'neutral', text: gap.summary });
  const budget = f('budget');
  pts.push({
    tone: budget.status !== 'assessed' ? 'info' : budget.score >= 70 ? 'positive' : budget.score >= 40 ? 'neutral' : 'negative',
    text: budget.summary,
  });
  if (pairable === 0 && compat.status === 'assessed') {
    pts.push({ tone: 'negative', text: 'Nothing you own pairs cleanly with it yet — it may need other new purchases to work.' });
  }
  return pts;
}

function buildStyleNotes(product: ProductCandidate, settings: UserSettings): string[] {
  const notes: string[] = [];
  const avoid = product.colors.filter((c) => settings.avoidColors.includes(c));
  const fav = product.colors.filter((c) => settings.favoriteColors.includes(c));
  if (avoid.length) notes.push(`${avoid.map(labelOf.color).join(', ')} is on your “colors to avoid” list.`);
  if (fav.length) notes.push(`${fav.map(labelOf.color).join(', ')} is one of your favorite colors.`);
  if (settings.primaryOccasions.length && product.intendedUse.length) {
    const overlap = product.intendedUse.filter((o) => settings.primaryOccasions.includes(o));
    if (!overlap.length) notes.push('Its intended use is outside the occasions you dress for most.');
  }
  return notes;
}

/** Exposed for insights: count owned items that would pair with a hypothetical piece. */
export function countPairable(candidate: MatchableItem, wardrobe: MatchableItem[]): number {
  return wardrobe.filter((w) => areComplementary(candidate.category, w.category) && assessPair(candidate, w).pairs).length;
}
