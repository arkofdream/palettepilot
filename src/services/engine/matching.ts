import { labelOf } from '@/domain/catalog';
import type { Category, ColorId, Occasion, Season } from '@/domain/types';
import { colorSimilarity, itemColorHarmony } from './color';

/** Minimal shape the engine needs. Wardrobe items and product candidates both fit. */
export interface MatchableItem {
  id: string;
  name: string;
  category: Category;
  colors: ColorId[];
  seasons: Season[];
  occasions: Occasion[];
}

export type Slot = 'top' | 'bottom' | 'onepiece' | 'outer' | 'shoes' | 'accessory';

export const slotOf = (c: Category): Slot => {
  switch (c) {
    case 'top':
    case 'knitwear':
      return 'top';
    case 'bottom':
      return 'bottom';
    case 'dress':
      return 'onepiece';
    case 'outerwear':
      return 'outer';
    case 'shoes':
      return 'shoes';
    default:
      return 'accessory';
  }
};

/** Whether two categories can be worn together in one outfit. */
export function areComplementary(a: Category, b: Category): boolean {
  if (a === b) return false;
  // A knit layers over a shirt or a dress.
  if ((a === 'knitwear' && (b === 'top' || b === 'dress')) || (b === 'knitwear' && (a === 'top' || a === 'dress'))) {
    return true;
  }
  const sa = slotOf(a);
  const sb = slotOf(b);
  if (sa === sb) return false;
  // Dresses replace top + bottom.
  if ((sa === 'onepiece' && (sb === 'top' || sb === 'bottom')) || (sb === 'onepiece' && (sa === 'top' || sa === 'bottom'))) {
    return false;
  }
  return true;
}

const OCCASION_GROUPS: Occasion[][] = [
  ['casual', 'weekend', 'travel'],
  ['work', 'evening'],
];

export function seasonsOverlap(a: Season[], b: Season[]): boolean {
  if (!a.length || !b.length) return true;
  return a.some((s) => b.includes(s));
}

export function sharedSeasons(a: Season[], b: Season[]): Season[] {
  if (!a.length) return b;
  if (!b.length) return a;
  return a.filter((s) => b.includes(s));
}

/** Occasions overlap directly, or are close neighbours (e.g. casual ↔ weekend). */
export function occasionsOverlap(a: Occasion[], b: Occasion[]): boolean {
  if (!a.length || !b.length) return true;
  if (a.some((o) => b.includes(o))) return true;
  return OCCASION_GROUPS.some((g) => a.some((o) => g.includes(o)) && b.some((o) => g.includes(o)));
}

const jaccard = <T,>(a: T[], b: T[]) => {
  if (!a.length && !b.length) return 1;
  const inter = a.filter((x) => b.includes(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
};

export const PAIR_THRESHOLD = 0.6;

export interface PairAssessment {
  item: MatchableItem;
  complementary: boolean;
  pairs: boolean;
  harmony: number;
  blockers: ('color' | 'season' | 'occasion')[];
}

export function assessPair(candidate: MatchableItem, item: MatchableItem): PairAssessment {
  const complementary = areComplementary(candidate.category, item.category);
  const harmony = itemColorHarmony(candidate.colors, item.colors).score;
  const blockers: PairAssessment['blockers'] = [];
  if (harmony < PAIR_THRESHOLD) blockers.push('color');
  if (!seasonsOverlap(candidate.seasons, item.seasons)) blockers.push('season');
  if (!occasionsOverlap(candidate.occasions, item.occasions)) blockers.push('occasion');
  return { item, complementary, pairs: complementary && blockers.length === 0, harmony, blockers };
}

export interface SimilarityAssessment {
  item: MatchableItem;
  similarity: number;
  reasons: string[];
}

/** How much an owned item overlaps with the candidate in role, color and use. */
export function assessSimilarity(candidate: MatchableItem, item: MatchableItem): SimilarityAssessment | null {
  let categoryScore = 0;
  if (candidate.category === item.category) categoryScore = 0.5;
  else if (slotOf(candidate.category) === slotOf(item.category) && slotOf(item.category) === 'top') categoryScore = 0.2;
  if (categoryScore === 0) return null;

  const colorScore = candidate.colors.length && item.colors.length ? colorSimilarity(candidate.colors[0], item.colors[0]) : 0;
  const seasonScore = jaccard(candidate.seasons, item.seasons);
  const occasionScore = jaccard(candidate.occasions, item.occasions);
  const similarity = categoryScore + 0.3 * colorScore + 0.1 * seasonScore + 0.1 * occasionScore;

  const reasons: string[] = [];
  reasons.push(
    categoryScore === 0.5 ? `Same category (${labelOf.category(item.category).toLowerCase()})` : 'Fills the same top layer',
  );
  if (colorScore === 1) reasons.push(`Same dominant color (${labelOf.color(item.colors[0]).toLowerCase()})`);
  else if (colorScore > 0) reasons.push(`Similar color (${labelOf.color(item.colors[0]).toLowerCase()})`);
  if (seasonScore >= 0.5) reasons.push('Worn in the same seasons');
  if (occasionScore >= 0.5) reasons.push('Used for the same occasions');
  return { item, similarity: Math.min(1, similarity), reasons };
}
