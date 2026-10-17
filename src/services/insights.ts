import { labelOf, COLOR_MAP } from '@/domain/catalog';
import type { Category, ColorId, Money, Occasion, Season, UserSettings, WardrobeItem } from '@/domain/types';
import { CAPSULE_BASELINE, countPairable } from './engine/scoring';
import { suggestOutfits } from './engine/outfits';
import type { MatchableItem } from './engine/matching';

export const MIN_WEARS_FOR_CPW = 3;
export const RECENT_WINDOW_DAYS = 90;
export const RARELY_WORN_DAYS = 60;

export interface CategoryGap {
  /** Stable identifier: gap_category_${category} */
  id: string;
  category: Category;
  owned: number;
  reference: number;
  evidence: string;
  hasSubstitutes?: boolean;
  substitutesNote?: string;
  dismissed?: boolean;
}

export interface CombinationBottleneck {
  /** Stable identifier: gap_bottleneck_${missingRole}_${occasion} */
  id: string;
  missingRole: 'top' | 'bottom' | 'shoes' | 'outer';
  missingCategory: Category;
  occasion: Occasion;
  availableItemsCount: number;
  matchingSeparatesCount: number;
  evidence: string;
  unlockedOutfitsEstimate: number;
  untaggedItemsNote?: string;
  dismissed?: boolean;
}

export interface OccasionGap {
  /** Stable identifier: gap_occasion_${occasion} */
  id: string;
  occasion: Occasion;
  count: number;
  evidence: string;
  dismissed?: boolean;
}

export interface MetadataDeficitNotice {
  unassignedOccasionsCount: number;
  unassignedSeasonsCount: number;
  message: string;
}

export interface WearStat {
  item: WardrobeItem;
  wears: number;
  recentWears: number;
  lastWorn: string;
}

export interface CostPerWear {
  item: WardrobeItem;
  wears: number;
  costPerWear: Money;
}

export interface AdditionIdea {
  category: Category;
  color: ColorId;
  pairsWith: number;
  reason: string;
}

export interface Rediscovery {
  item: WardrobeItem;
  outfitItemIds: string[];
  rationale: string;
}

export interface WardrobeInsights {
  total: number;
  ownCount: number;
  sampleCount: number;
  byCategory: { category: Category; count: number; isIgnored: boolean }[];
  byColor: { color: ColorId; count: number }[];
  neutralShare: number;
  seasonCoverage: { season: Season; count: number }[];
  occasionCoverage: { occasion: Occasion; count: number }[];
  /** Active (non-dismissed, non-ignored) category gaps. Backward-compatible. */
  gaps: CategoryGap[];
  activeGaps: CategoryGap[];
  dismissedGaps: CategoryGap[];
  bottlenecks: CombinationBottleneck[];
  dismissedBottlenecks: CombinationBottleneck[];
  ignoredCategories: Category[];
  occasionGaps: OccasionGap[];
  dismissedOccasionGaps: OccasionGap[];
  metadataNotice?: MetadataDeficitNotice;
  wear: {
    itemsWithData: number;
    itemsWithoutData: number;
    mostWorn: WearStat[];
    rarelyWorn: WearStat[];
  };
  costPerWear: {
    computed: CostPerWear[];
    insufficient: { item: WardrobeItem; reason: string }[];
  };
  totalValue: Money[];
  additions: AdditionIdea[];
  rediscover: Rediscovery[];
}

const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 86_400_000;

export function computeInsights(
  items: WardrobeItem[],
  settings: UserSettings,
  now = new Date(),
): WardrobeInsights {
  const dismissedSet = new Set(settings.dismissedGaps ?? []);
  const ignoredSet = new Set(settings.ignoredCategories ?? []);

  const categories = Object.keys(CAPSULE_BASELINE) as Category[];
  const allOccasions: Occasion[] = ['casual', 'work', 'evening', 'weekend', 'travel', 'active'];

  // Honest handling of completely empty wardrobe: no phantom gaps or recommendations
  if (items.length === 0) {
    return {
      total: 0,
      ownCount: 0,
      sampleCount: 0,
      byCategory: categories.map((c) => ({ category: c, count: 0, isIgnored: ignoredSet.has(c) })),
      byColor: [],
      neutralShare: 0,
      seasonCoverage: ['spring', 'summer', 'autumn', 'winter'].map((s) => ({ season: s as Season, count: 0 })),
      occasionCoverage: allOccasions.map((o) => ({ occasion: o, count: 0 })),
      gaps: [],
      activeGaps: [],
      dismissedGaps: [],
      bottlenecks: [],
      dismissedBottlenecks: [],
      ignoredCategories: Array.from(ignoredSet),
      occasionGaps: [],
      dismissedOccasionGaps: [],
      wear: { itemsWithData: 0, itemsWithoutData: 0, mostWorn: [], rarelyWorn: [] },
      costPerWear: { computed: [], insufficient: [] },
      totalValue: [],
      additions: [],
      rediscover: [],
    };
  }

  const count = <K extends string>(keys: K[], pick: (i: WardrobeItem) => K[]) =>
    keys.map((k) => ({ key: k, count: items.filter((i) => pick(i).includes(k)).length }));

  const byCategory = categories.map((c) => ({
    category: c,
    count: items.filter((i) => i.category === c).length,
    isIgnored: ignoredSet.has(c),
  }));

  const colorCounts = new Map<ColorId, number>();
  for (const i of items) if (i.colors[0]) colorCounts.set(i.colors[0], (colorCounts.get(i.colors[0]) ?? 0) + 1);
  const byColor = [...colorCounts.entries()].map(([color, c]) => ({ color, count: c })).sort((a, b) => b.count - a.count);
  const neutralShare = items.length ? items.filter((i) => i.colors[0] && COLOR_MAP[i.colors[0]]?.neutral).length / items.length : 0;

  const seasonCoverage = count<Season>(['spring', 'summer', 'autumn', 'winter'], (i) => i.seasons).map((x) => ({ season: x.key, count: x.count }));
  const occasionCoverage = count<Occasion>(allOccasions, (i) => i.occasions).map((x) => ({ occasion: x.key, count: x.count }));

  // Missing metadata inspection
  const unassignedOccasionsCount = items.filter((i) => !i.occasions || i.occasions.length === 0).length;
  const unassignedSeasonsCount = items.filter((i) => !i.seasons || i.seasons.length === 0).length;
  const metadataNotice: MetadataDeficitNotice | undefined =
    unassignedOccasionsCount > 0 || unassignedSeasonsCount > 0
      ? {
          unassignedOccasionsCount,
          unassignedSeasonsCount,
          message: `${unassignedOccasionsCount} item(s) lack occasion tags and ${unassignedSeasonsCount} item(s) lack season tags. Adding tags to existing pieces helps verify if outfit needs are already satisfied before buying.`,
        }
      : undefined;

  // Existing alternative substitutes detection
  const dressCount = items.filter((i) => i.category === 'dress').length;
  const topCount = items.filter((i) => i.category === 'top').length;

  // Category gaps detection
  const activeGaps: CategoryGap[] = [];
  const dismissedGaps: CategoryGap[] = [];

  for (const { category, count: n } of byCategory) {
    if (ignoredSet.has(category)) continue;
    // Dresses are treated as optional unless user already owns at least one
    if (category === 'dress' && n === 0) continue;

    const ref = CAPSULE_BASELINE[category];
    const threshold = Math.ceil(ref / 2);

    if (n < ref && n <= threshold) {
      const id = `gap_category_${category}`;
      let hasSubstitutes = false;
      let substitutesNote: string | undefined;

      if (category === 'bottom' && dressCount >= 2) {
        hasSubstitutes = true;
        substitutesNote = `You own ${dressCount} dresses which already form full-body outfits with your shoes. Additional bottoms are optional unless you want more separates.`;
      } else if (category === 'knitwear' && topCount >= 4) {
        hasSubstitutes = true;
        substitutesNote = `You have strong coverage in tops (${topCount} owned). Layering knitwear is optional.`;
      }

      const evidence = `You own ${n} ${labelOf.categoryPlural(category).toLowerCase()} (reference capsule suggests ${ref}).${
        substitutesNote ? ` ${substitutesNote}` : ''
      }`;

      const gapObj: CategoryGap = {
        id,
        category,
        owned: n,
        reference: ref,
        evidence,
        hasSubstitutes,
        substitutesNote,
        dismissed: dismissedSet.has(id),
      };

      if (dismissedSet.has(id)) {
        dismissedGaps.push(gapObj);
      } else {
        activeGaps.push(gapObj);
      }
    }
  }

  // Combination bottlenecks detection
  const activeBottlenecks: CombinationBottleneck[] = [];
  const dismissedBottlenecks: CombinationBottleneck[] = [];

  // Examine occasions of interest: user's primary occasions, or occasions present in wardrobe
  const occasionsToEvaluate = Array.from(
    new Set([...settings.primaryOccasions, ...items.flatMap((i) => i.occasions)]),
  );

  for (const occasion of occasionsToEvaluate) {
    // Items that can serve this occasion (either explicitly tagged or all-occasion untagged)
    const occItems = items.filter((i) => i.occasions.includes(occasion) || i.occasions.length === 0);
    const tops = occItems.filter((i) => i.category === 'top' || i.category === 'knitwear');
    const bottoms = occItems.filter((i) => i.category === 'bottom');
    const shoes = occItems.filter((i) => i.category === 'shoes');
    const dresses = occItems.filter((i) => i.category === 'dress');

    // Shoe bottleneck: user has separates or dresses for this occasion, but 0 compatible shoes
    if ((tops.length >= 2 && bottoms.length >= 1) || dresses.length >= 1) {
      if (shoes.length === 0 && !ignoredSet.has('shoes')) {
        const id = `gap_bottleneck_shoes_${occasion}`;
        const unlocked = Math.min(tops.length * bottoms.length + dresses.length, 6);
        const evidence = `You have ${tops.length} top(s) and ${bottoms.length} bottom(s) for ${labelOf.occasion(
          occasion,
        ).toLowerCase()} wear, but no compatible shoes. Adding shoes for this occasion could unlock up to ${unlocked} complete outfit(s).`;

        const bObj: CombinationBottleneck = {
          id,
          missingRole: 'shoes',
          missingCategory: 'shoes',
          occasion,
          availableItemsCount: shoes.length,
          matchingSeparatesCount: tops.length + bottoms.length + dresses.length,
          evidence,
          unlockedOutfitsEstimate: unlocked,
          dismissed: dismissedSet.has(id),
        };

        if (dismissedSet.has(id)) {
          dismissedBottlenecks.push(bObj);
        } else {
          activeBottlenecks.push(bObj);
        }
      }
    }

    // Bottoms bottleneck: user has tops and shoes for this occasion, but 0 bottoms and 0 dresses
    if (tops.length >= 2 && shoes.length >= 1 && bottoms.length === 0 && dresses.length === 0) {
      if (!ignoredSet.has('bottom')) {
        const id = `gap_bottleneck_bottom_${occasion}`;
        const unlocked = Math.min(tops.length * shoes.length, 6);
        const evidence = `You have ${tops.length} top(s) and ${shoes.length} pair(s) of shoes for ${labelOf.occasion(
          occasion,
        ).toLowerCase()} wear, but no bottoms or dresses to complete outfits.`;

        const bObj: CombinationBottleneck = {
          id,
          missingRole: 'bottom',
          missingCategory: 'bottom',
          occasion,
          availableItemsCount: bottoms.length,
          matchingSeparatesCount: tops.length + shoes.length,
          evidence,
          unlockedOutfitsEstimate: unlocked,
          dismissed: dismissedSet.has(id),
        };

        if (dismissedSet.has(id)) {
          dismissedBottlenecks.push(bObj);
        } else {
          activeBottlenecks.push(bObj);
        }
      }
    }
  }

  // Occasion gaps detection
  const activeOccasionGaps: OccasionGap[] = [];
  const dismissedOccasionGaps: OccasionGap[] = [];

  for (const o of settings.primaryOccasions) {
    const occCount = items.filter((i) => i.occasions.includes(o)).length;
    if (occCount < 4) {
      const id = `gap_occasion_${o}`;
      const evidence = `Your primary lifestyle includes ${labelOf.occasion(o).toLowerCase()} wear, but you have only ${occCount} item(s) cataloged for this occasion.`;
      const oObj: OccasionGap = {
        id,
        occasion: o,
        count: occCount,
        evidence,
        dismissed: dismissedSet.has(id),
      };
      if (dismissedSet.has(id)) {
        dismissedOccasionGaps.push(oObj);
      } else {
        activeOccasionGaps.push(oObj);
      }
    }
  }

  // Wear statistics — only from recorded wear logs.
  const withData = items.filter((i) => i.wearLog.length > 0);
  const stats: WearStat[] = withData.map((item) => {
    const sorted = [...item.wearLog].sort();
    return {
      item,
      wears: sorted.length,
      recentWears: sorted.filter((d) => daysBetween(now, new Date(d)) <= RECENT_WINDOW_DAYS).length,
      lastWorn: sorted[sorted.length - 1],
    };
  });
  const mostWorn = [...stats].sort((a, b) => b.recentWears - a.recentWears || b.wears - a.wears).filter((s) => s.recentWears > 0).slice(0, 4);
  const rarelyWorn = stats
    .filter((s) => daysBetween(now, new Date(s.lastWorn)) > RARELY_WORN_DAYS || s.recentWears <= 1)
    .filter((s) => !mostWorn.includes(s))
    .sort((a, b) => a.lastWorn.localeCompare(b.lastWorn))
    .slice(0, 4);

  // Cost per wear — only with a price and enough recorded wears.
  const computed: CostPerWear[] = [];
  const insufficient: { item: WardrobeItem; reason: string }[] = [];
  for (const item of items) {
    if (!item.price) {
      insufficient.push({ item, reason: 'No price recorded' });
    } else if (item.wearLog.length < MIN_WEARS_FOR_CPW) {
      insufficient.push({ item, reason: `${item.wearLog.length} of ${MIN_WEARS_FOR_CPW} wears logged` });
    } else {
      computed.push({
        item,
        wears: item.wearLog.length,
        costPerWear: { amount: Math.round((item.price.amount / item.wearLog.length) * 100) / 100, currency: item.price.currency },
      });
    }
  }
  computed.sort((a, b) => a.costPerWear.amount - b.costPerWear.amount);

  const valueMap = new Map<string, number>();
  for (const i of items) if (i.price) valueMap.set(i.price.currency, (valueMap.get(i.price.currency) ?? 0) + i.price.amount);
  const totalValue = [...valueMap.entries()].map(([currency, amount]) => ({ amount, currency: currency as Money['currency'] }));

  // Useful addition suggestions grounded in real gaps and bottlenecks
  const additions = suggestAdditions(
    items,
    activeGaps.filter((g) => !g.hasSubstitutes),
    activeBottlenecks,
    byColor.map((c) => c.color),
    dismissedSet,
  );

  const rediscover: Rediscovery[] = [];
  for (const s of rarelyWorn.slice(0, 3)) {
    const res = suggestOutfits(s.item as MatchableItem, items, 1);
    if (res.suggestions[0]) {
      rediscover.push({ item: s.item, outfitItemIds: res.suggestions[0].itemIds, rationale: res.suggestions[0].rationale });
    }
  }

  return {
    total: items.length,
    ownCount: items.filter((i) => !i.isSample).length,
    sampleCount: items.filter((i) => i.isSample).length,
    byCategory,
    byColor,
    neutralShare,
    seasonCoverage,
    occasionCoverage,
    gaps: activeGaps,
    activeGaps,
    dismissedGaps,
    bottlenecks: activeBottlenecks,
    dismissedBottlenecks,
    ignoredCategories: Array.from(ignoredSet),
    occasionGaps: activeOccasionGaps,
    dismissedOccasionGaps,
    metadataNotice,
    wear: { itemsWithData: withData.length, itemsWithoutData: items.length - withData.length, mostWorn, rarelyWorn },
    costPerWear: { computed, insufficient },
    totalValue,
    additions,
    rediscover,
  };
}

/**
 * Suggests at most three additions:
 * 1. Resolving combination bottlenecks for specific occasions (highest priority).
 * 2. Filling genuine category gaps that lack existing substitutes.
 * Only suggests an item if it pairs with >= 2 items (for occasion bottlenecks) or >= 3 items (for general gaps).
 */
function suggestAdditions(
  items: WardrobeItem[],
  gaps: CategoryGap[],
  bottlenecks: CombinationBottleneck[],
  ownedColors: ColorId[],
  dismissedSet: Set<string>,
): AdditionIdea[] {
  if (items.length < 3) return [];

  const neutrals: ColorId[] = ['navy', 'charcoal', 'black', 'white', 'cream', 'camel', 'grey', 'beige', 'brown'];
  const candidatesColors = [...ownedColors.filter((c) => neutrals.includes(c)), ...neutrals].filter((c, i, arr) => arr.indexOf(c) === i);
  const seasons = [...new Set(items.flatMap((i) => i.seasons))];
  const occasions = [...new Set(items.flatMap((i) => i.occasions))];
  const bottleneckIdeas: AdditionIdea[] = [];
  const gapIdeas: AdditionIdea[] = [];
  const seenIdeas = new Set<string>();

  // 1. Bottleneck-resolving additions (highest priority)
  for (const b of bottlenecks) {
    if (dismissedSet.has(`gap_category_${b.missingCategory}`)) continue;
    let best: AdditionIdea | null = null;
    for (const color of candidatesColors.slice(0, 6)) {
      const hypothetical: MatchableItem = {
        id: 'hypothetical_bottleneck',
        name: '',
        category: b.missingCategory,
        colors: [color],
        seasons: seasons.length ? seasons : ['spring', 'summer', 'autumn', 'winter'],
        occasions: [b.occasion],
      };
      const pairsWith = countPairable(hypothetical, items);
      if (!best || pairsWith > best.pairsWith) {
        best = {
          category: b.missingCategory,
          color,
          pairsWith,
          reason: `Resolves a combination bottleneck for ${labelOf.occasion(
            b.occasion,
          ).toLowerCase()} wear. A ${labelOf.color(color).toLowerCase()} piece pairs with ${pairsWith} pieces you already own.`,
        };
      }
    }
    if (best && best.pairsWith >= 2) {
      const key = `${best.category}-${best.color}`;
      if (!seenIdeas.has(key)) {
        seenIdeas.add(key);
        bottleneckIdeas.push(best);
      }
    }
  }

  // 2. Category gap additions (only if not already satisfied by substitutes and not dismissed)
  for (const gap of gaps) {
    if (gap.hasSubstitutes) continue;
    if (dismissedSet.has(gap.id)) continue;
    let best: AdditionIdea | null = null;
    for (const color of candidatesColors.slice(0, 6)) {
      const hypothetical: MatchableItem = {
        id: 'hypothetical_gap',
        name: '',
        category: gap.category,
        colors: [color],
        seasons: seasons.length ? seasons : ['spring', 'summer', 'autumn', 'winter'],
        occasions: occasions.length ? occasions : ['casual', 'work'],
      };
      const pairsWith = countPairable(hypothetical, items);
      if (!best || pairsWith > best.pairsWith) {
        best = {
          category: gap.category,
          color,
          pairsWith,
          reason: `You own ${gap.owned} ${labelOf.categoryPlural(gap.category).toLowerCase()}. A ${labelOf.color(
            color,
          ).toLowerCase()} piece would pair with ${pairsWith} items you already have.`,
        };
      }
    }
    if (best && best.pairsWith >= 3) {
      const key = `${best.category}-${best.color}`;
      if (!seenIdeas.has(key)) {
        seenIdeas.add(key);
        gapIdeas.push(best);
      }
    }
  }

  bottleneckIdeas.sort((a, b) => b.pairsWith - a.pairsWith);
  gapIdeas.sort((a, b) => b.pairsWith - a.pairsWith);

  // Return bottleneck solutions first, then fill remaining slots with category gap solutions
  return [...bottleneckIdeas, ...gapIdeas].slice(0, 3);
}
