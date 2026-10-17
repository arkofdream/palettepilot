import { COLOR_MAP } from '@/domain/catalog';
import type { ColorId } from '@/domain/types';

export type ColorRelation = 'neutral' | 'tonal' | 'analogous' | 'complementary' | 'contrast';

export interface HarmonyResult {
  score: number; // 0–1
  relation: ColorRelation;
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Neutral pairs that are traditionally debated; we score them slightly lower. */
const SOFT_CLASHES: [ColorId, ColorId][] = [
  ['black', 'navy'],
  ['black', 'brown'],
  ['navy', 'denim'],
];

/**
 * Rule-based color harmony between two named colors. These rules are deliberately
 * simple and explainable — they are styling conventions, not color science.
 */
export function colorHarmony(a: ColorId, b: ColorId): HarmonyResult {
  const ca = COLOR_MAP[a];
  const cb = COLOR_MAP[b];
  if (!ca || !cb) return { score: 0.5, relation: 'contrast' };
  if (a === b) return { score: ca.neutral ? 0.85 : 0.7, relation: 'tonal' };
  if (SOFT_CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
    return { score: 0.68, relation: 'neutral' };
  }
  if (ca.neutral || cb.neutral) return { score: 0.95, relation: 'neutral' };
  const d = hueDistance(ca.hue, cb.hue);
  if (d <= 25) return { score: 0.8, relation: 'analogous' };
  if (d <= 60) return { score: 0.65, relation: 'analogous' };
  if (d >= 150) return { score: 0.72, relation: 'complementary' };
  return { score: 0.4, relation: 'contrast' };
}

/** Harmony between two multi-color items, weighting the dominant colors most. */
export function itemColorHarmony(a: ColorId[], b: ColorId[]): HarmonyResult {
  if (!a.length || !b.length) return { score: 0.6, relation: 'neutral' };
  const dominant = colorHarmony(a[0], b[0]);
  let sum = 0;
  let n = 0;
  for (const x of a) for (const y of b) {
    sum += colorHarmony(x, y).score;
    n += 1;
  }
  return { score: 0.65 * dominant.score + 0.35 * (sum / n), relation: dominant.relation };
}

const DARK_NEUTRALS: ColorId[] = ['black', 'charcoal', 'navy'];
const LIGHT_NEUTRALS: ColorId[] = ['white', 'cream'];
const WARM_NEUTRALS: ColorId[] = ['beige', 'camel'];
const BLUES: ColorId[] = ['denim', 'blue', 'light-blue'];

/** How visually similar two colors are (for duplicate detection), 0–1. */
export function colorSimilarity(a: ColorId, b: ColorId): number {
  if (a === b) return 1;
  for (const group of [DARK_NEUTRALS, LIGHT_NEUTRALS, WARM_NEUTRALS, BLUES]) {
    if (group.includes(a) && group.includes(b)) return 0.6;
  }
  const ca = COLOR_MAP[a];
  const cb = COLOR_MAP[b];
  if (ca && cb && !ca.neutral && !cb.neutral && hueDistance(ca.hue, cb.hue) <= 20) return 0.6;
  return 0;
}

export function describeRelation(relation: ColorRelation): string {
  switch (relation) {
    case 'neutral':
      return 'Neutral base';
    case 'tonal':
      return 'Tonal';
    case 'analogous':
      return 'Analogous palette';
    case 'complementary':
      return 'Complementary contrast';
    default:
      return 'Bold contrast';
  }
}
