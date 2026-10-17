import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Comparison,
  ImageRef,
  MatchSource,
  ProductCandidate,
  PurchaseAnalysis,
  UserSettings,
  WardrobeItem,
  WardrobeItemDraft,
} from '@/domain/types';
import { services } from '@/services';
import { useEffect, useState } from 'react';

export const qk = {
  wardrobe: ['wardrobe'] as const,
  item: (id: string) => ['wardrobe', id] as const,
  analyses: ['analyses'] as const,
  analysis: (id: string) => ['analyses', id] as const,
  comparisons: ['comparisons'] as const,
  comparison: (id: string) => ['comparisons', id] as const,
  settings: ['settings'] as const,
};

const seeded = () => services.data.ensureSeeded();

export function useWardrobe() {
  return useQuery({ queryKey: qk.wardrobe, queryFn: async () => (await seeded(), services.wardrobe.list()) });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: qk.item(id ?? ''),
    enabled: !!id,
    queryFn: async () => (await seeded(), services.wardrobe.get(id!)),
  });
}

export function useAnalyses() {
  return useQuery({ queryKey: qk.analyses, queryFn: async () => (await seeded(), services.analyses.list()) });
}

export function useAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: qk.analysis(id ?? ''),
    enabled: !!id,
    queryFn: async () => (await seeded(), services.analyses.get(id!)),
  });
}

export function useComparisons() {
  return useQuery({ queryKey: qk.comparisons, queryFn: async () => (await seeded(), services.comparisons.list()) });
}

export function useComparison(id: string | undefined) {
  return useQuery({
    queryKey: qk.comparison(id ?? ''),
    enabled: !!id,
    queryFn: async () => (await seeded(), services.comparisons.get(id!)),
  });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: async () => (await seeded(), services.settings.get()) });
}

/** Invalidate everything a mutation may have touched. */
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: (readonly string[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useSaveItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id?: string; draft: WardrobeItemDraft; newImage?: Blob | null }) => {
      let image: ImageRef | undefined = input.draft.image;
      if (input.newImage) image = await services.images.save(input.newImage);
      const draft = { ...input.draft, image };
      return input.id ? services.wardrobe.update(input.id, draft) : services.wardrobe.create(draft);
    },
    onSuccess: () => invalidate(qk.wardrobe),
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => services.wardrobe.remove(id),
    onSuccess: () => invalidate(qk.wardrobe),
  });
}

export function useLogWear() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; date: string } | { id: string; removeIndex: number }) =>
      'date' in input ? services.wardrobe.logWear(input.id, input.date) : services.wardrobe.removeWear(input.id, input.removeIndex),
    onSuccess: () => invalidate(qk.wardrobe),
  });
}

import type { GarmentVisionExtraction } from '@/services/visionExtractor';

export interface RunAnalysisInput {
  product: Omit<ProductCandidate, 'image'>;
  image?: Blob | null;
  matchSource: MatchSource;
  persist?: boolean;
  visionExtraction?: GarmentVisionExtraction | null;
  userEditedFields?: Partial<
    Record<'name' | 'category' | 'colors' | 'seasons' | 'intendedUse', boolean>
  >;
}

/** Resolves the wardrobe subset described by a match source. */
export function selectMatchSource(items: WardrobeItem[], source: MatchSource): WardrobeItem[] {
  if (source.mode === 'mine') return items.filter((i) => !i.isSample);
  if (source.mode === 'custom') return items.filter((i) => source.itemIds?.includes(i.id));
  return items;
}

export async function runAnalysis(input: RunAnalysisInput): Promise<PurchaseAnalysis> {
  const [items, settings] = await Promise.all([services.wardrobe.list(), services.settings.get()]);
  const image = input.image ? await services.images.save(input.image) : undefined;
  const product: ProductCandidate = { ...input.product, image };
  return services.analysisProvider.analyze({
    product,
    matchSource: input.matchSource,
    wardrobe: selectMatchSource(items, input.matchSource),
    settings,
    hasImage: !!image,
    imageBlob: input.image,
    visionExtraction: input.visionExtraction,
    userEditedFields: input.userEditedFields,
  });
}

export function useExtractGarmentAttributes() {
  return useMutation({
    mutationFn: (blob: Blob) => services.visionExtractor.extract(blob),
  });
}

export function useRunAnalysis() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: RunAnalysisInput) => {
      const analysis = await runAnalysis(input);
      return services.analyses.save(analysis);
    },
    onSuccess: () => invalidate(qk.analyses),
  });
}

export function useDeleteAnalysis() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => services.analyses.remove(id),
    onSuccess: () => invalidate(qk.analyses),
  });
}

export function useSaveComparison() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (c: Comparison) => services.comparisons.save({ ...c, saved: true }),
    onSuccess: () => invalidate(qk.comparisons),
  });
}

export function useDeleteComparison() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => services.comparisons.remove(id),
    onSuccess: () => invalidate(qk.comparisons),
  });
}

export function useUpdateSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) => services.settings.update(patch),
    onSuccess: () => invalidate(qk.settings),
  });
}

export function useDataAdmin() {
  const qc = useQueryClient();
  const all = () => qc.invalidateQueries();
  return {
    removeSamples: useMutation({ mutationFn: () => services.data.removeSampleData(), onSuccess: all }),
    restoreSamples: useMutation({ mutationFn: () => services.data.restoreSampleData(), onSuccess: all }),
    clearAll: useMutation({ mutationFn: () => services.data.clearAll(), onSuccess: all }),
    resetSettings: useMutation({ mutationFn: () => services.settings.reset(), onSuccess: all }),
  };
}

/** Resolves an ImageRef to a displayable URL (object URL for local blobs). */
export function useImageUrl(ref: ImageRef | undefined): { url: string | null; loading: boolean } {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>(() =>
    !ref ? { url: null, loading: false } : ref.kind === 'local' ? { url: null, loading: true } : { url: ref.url, loading: false },
  );
  const key = ref ? (ref.kind === 'local' ? ref.id : ref.url) : '';
  useEffect(() => {
    if (!ref) return setState({ url: null, loading: false });
    if (ref.kind !== 'local') return setState({ url: ref.url, loading: false });
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    services.images.resolve(ref).then(
      (url) => alive && setState({ url, loading: false }),
      () => alive && setState({ url: null, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
