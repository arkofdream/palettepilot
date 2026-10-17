import { labelOf } from '@/domain/catalog';
import type { Occasion, OutfitSuggestion, Season } from '@/domain/types';
import { describeRelation, itemColorHarmony } from './color';
import {
  areComplementary,
  assessPair,
  occasionsOverlap,
  seasonsOverlap,
  sharedSeasons,
  type MatchableItem,
} from './matching';

type Role = 'top' | 'bottom' | 'dress' | 'shoes' | 'outer' | 'accessory';

interface Template {
  required: Role[];
}

const TEMPLATES: Template[] = [{ required: ['top', 'bottom', 'shoes'] }, { required: ['dress', 'shoes'] }];

const roleOf = (item: MatchableItem): Role => {
  switch (item.category) {
    case 'top':
    case 'knitwear':
      return 'top';
    case 'bottom':
      return 'bottom';
    case 'dress':
      return 'dress';
    case 'shoes':
      return 'shoes';
    case 'outerwear':
      return 'outer';
    default:
      return 'accessory';
  }
};

const PER_ROLE_LIMIT = 8;
const PAIRWISE_MIN = 0.55;

function compatible(a: MatchableItem, b: MatchableItem): boolean {
  return (
    areComplementary(a.category, b.category) &&
    seasonsOverlap(a.seasons, b.seasons) &&
    occasionsOverlap(a.occasions, b.occasions) &&
    itemColorHarmony(a.colors, b.colors).score >= PAIRWISE_MIN
  );
}

function meanHarmony(items: MatchableItem[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      sum += itemColorHarmony(items[i].colors, items[j].colors).score;
      n++;
    }
  return n ? sum / n : 1;
}

function commonOccasion(items: MatchableItem[], preferred: Occasion[]): Occasion | undefined {
  const counts = new Map<Occasion, number>();
  for (const it of items) for (const o of it.occasions) counts.set(o, (counts.get(o) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.find(([o]) => preferred.includes(o))?.[0] ?? ranked[0]?.[0];
}

function commonSeasons(items: MatchableItem[]): Season[] {
  return items.reduce<Season[]>((acc, it) => sharedSeasons(acc, it.seasons), []);
}

function rationale(anchor: MatchableItem, items: MatchableItem[], occasion?: Occasion): string {
  const others = items.filter((i) => i.id !== anchor.id);
  const relation = others.length ? itemColorHarmony(anchor.colors, others[0].colors).relation : 'neutral';
  const palette = [...new Set(items.map((i) => labelOf.color(i.colors[0]).toLowerCase()))].join(', ');
  const seasons = commonSeasons(items);
  const seasonText =
    seasons.length === 0 || seasons.length === 4
      ? 'year-round'
      : seasons.map((s) => labelOf.season(s).toLowerCase()).join(' and ');
  const occasionText = occasion ? `${labelOf.occasion(occasion).toLowerCase()} wear` : 'everyday wear';
  return `${describeRelation(relation)} — ${palette}. Suited to ${occasionText}, ${seasonText}.`;
}

export interface OutfitSearchResult {
  suggestions: OutfitSuggestion[];
  /** Number of distinct valid core outfits found (capped by search limits). */
  totalFound: number;
  occasionsCovered: Occasion[];
}

/**
 * Builds outfits around an anchor item using only items from the provided wardrobe.
 * Never invents items: every id in a suggestion refers to the anchor or an owned piece.
 */
export function suggestOutfits(
  anchor: MatchableItem,
  wardrobe: MatchableItem[],
  max = 3,
): OutfitSearchResult {
  const anchorRole = roleOf(anchor);
  const pool = wardrobe.filter((w) => w.id !== anchor.id);
  const pairScore = new Map<string, number>();
  for (const w of pool) {
    const p = assessPair(anchor, w);
    if (p.pairs) pairScore.set(w.id, p.harmony);
  }
  const byRole = (role: Role) =>
    pool
      .filter((w) => roleOf(w) === role && pairScore.has(w.id))
      .sort((a, b) => (pairScore.get(b.id) ?? 0) - (pairScore.get(a.id) ?? 0))
      .slice(0, PER_ROLE_LIMIT);

  const found: { items: MatchableItem[]; harmony: number }[] = [];

  for (const template of TEMPLATES) {
    const isLayer = anchorRole === 'outer' || anchorRole === 'accessory';
    if (!isLayer && !template.required.includes(anchorRole)) continue;
    const roles = template.required.filter((r) => r !== anchorRole);
    const options = roles.map(byRole);
    if (options.some((o) => o.length === 0)) continue;

    const walk = (idx: number, chosen: MatchableItem[]) => {
      if (idx === roles.length) {
        const core = [anchor, ...chosen];
        found.push({ items: core, harmony: meanHarmony(core) });
        return;
      }
      for (const opt of options[idx]) {
        if (chosen.every((c) => compatible(c, opt))) walk(idx + 1, [...chosen, opt]);
      }
    };
    walk(0, []);
  }

  // Optional finishing layers chosen per outfit.
  const outers = anchorRole === 'outer' ? [] : byRole('outer');
  const accessories = anchorRole === 'accessory' ? [] : byRole('accessory');
  const finish = (core: MatchableItem[]): MatchableItem[] => {
    const result = [...core];
    const coldSeason = commonSeasons(core).some((s) => s === 'autumn' || s === 'winter') || commonSeasons(core).length === 0;
    if (coldSeason) {
      const outer = outers.find((o) => result.every((r) => compatible(r, o)));
      if (outer) result.push(outer);
    }
    const acc = accessories.find((a) => result.every((r) => compatible(r, a)) && meanHarmony([...result, a]) >= 0.7);
    if (acc) result.push(acc);
    return result;
  };

  found.sort((a, b) => b.harmony - a.harmony);

  const suggestions: OutfitSuggestion[] = [];
  const used: string[][] = [];
  for (const f of found) {
    if (suggestions.length >= max) break;
    const ids = f.items.map((i) => i.id);
    // Prefer variety: each suggestion should change at least two pieces vs. earlier picks.
    const tooSimilar = used.some((u) => ids.filter((id) => !u.includes(id)).length < Math.min(2, ids.length - 1));
    if (tooSimilar) continue;
    used.push(ids);
    const full = finish(f.items);
    const occasion = commonOccasion(full, anchor.occasions);
    suggestions.push({
      id: `outfit-${ids.join('-')}`,
      itemIds: full.map((i) => i.id),
      harmony: meanHarmony(full),
      occasion,
      rationale: rationale(anchor, full, occasion),
    });
  }

  const occasionsCovered = [
    ...new Set(found.map((f) => commonOccasion(f.items, anchor.occasions)).filter(Boolean) as Occasion[]),
  ];

  return { suggestions, totalFound: found.length, occasionsCovered };
}
