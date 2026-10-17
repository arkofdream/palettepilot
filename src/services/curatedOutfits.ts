import type { Occasion, WardrobeItem } from '@/domain/types';
import type { MatchableItem } from './engine/matching';
import { suggestOutfits } from './engine/outfits';

export interface CuratedOutfit {
  id: string;
  items: WardrobeItem[];
  occasion?: Occasion;
  harmony: number;
  rationale: string;
}

export interface CuratedOutfitsResult {
  outfits: CuratedOutfit[];
  totalCombinationsCount: number;
  anchorsEvaluated: number;
}

/**
 * Curates harmonious outfit suggestions strictly from owned wardrobe pieces.
 * Never invents items; each item reference maps directly to a valid wardrobe piece.
 */
export function curateWardrobeOutfits(
  wardrobe: WardrobeItem[],
  limit = 5,
): CuratedOutfitsResult {
  if (wardrobe.length < 3) {
    return { outfits: [], totalCombinationsCount: 0, anchorsEvaluated: 0 };
  }

  const itemMap = new Map<string, WardrobeItem>(wardrobe.map((w) => [w.id, w]));

  // Core anchors to build complete outfits around (tops, knitwear, and dresses)
  const primaryAnchors = wardrobe.filter(
    (w) => w.category === 'top' || w.category === 'knitwear' || w.category === 'dress',
  );
  const anchors = primaryAnchors.length > 0 ? primaryAnchors : wardrobe;

  const seenCombos = new Set<string>();
  const collected: CuratedOutfit[] = [];
  let totalFoundAcrossAnchors = 0;

  for (const anchor of anchors) {
    const res = suggestOutfits(anchor as MatchableItem, wardrobe as MatchableItem[], 4);
    totalFoundAcrossAnchors += res.totalFound;

    for (const s of res.suggestions) {
      const sortedIds = [...s.itemIds].sort();
      const comboKey = sortedIds.join('|');
      if (seenCombos.has(comboKey)) continue;
      seenCombos.add(comboKey);

      const items = s.itemIds
        .map((id) => itemMap.get(id))
        .filter((item): item is WardrobeItem => Boolean(item));

      // A complete outfit requires at least 2 distinct pieces (e.g. dress + shoes or top + bottom)
      if (items.length >= 2) {
        collected.push({
          id: s.id,
          items,
          occasion: s.occasion,
          harmony: s.harmony,
          rationale: s.rationale,
        });
      }
    }
  }

  // Sort by harmony score descending
  collected.sort((a, b) => b.harmony - a.harmony);

  return {
    outfits: collected.slice(0, limit),
    totalCombinationsCount: seenCombos.size,
    anchorsEvaluated: anchors.length,
  };
}
