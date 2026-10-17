import type {
  Category,
  Comparison,
  PurchaseAnalysis,
  UserSettings,
  WardrobeItem,
  WardrobeItemDraft,
} from '@/domain/types';
import { CATEGORIES } from '@/domain/catalog';
import { LOCAL_OWNER_ID, newId, nowIso } from './ids';
import type { KeyValueStore } from './storage/keyValueStore';
import type { ImageStore } from './storage/imageStore';

/**
 * Repository contracts. All methods are async so a REST/GraphQL implementation
 * can replace the local ones without touching hooks or components.
 */
export interface WardrobeRepository {
  list(): Promise<WardrobeItem[]>;
  get(id: string): Promise<WardrobeItem | null>;
  create(draft: WardrobeItemDraft, opts?: { isSample?: boolean }): Promise<WardrobeItem>;
  update(id: string, patch: Partial<WardrobeItemDraft>): Promise<WardrobeItem>;
  remove(id: string): Promise<void>;
  logWear(id: string, dateIso: string): Promise<WardrobeItem>;
  removeWear(id: string, index: number): Promise<WardrobeItem>;
  replaceAll(items: WardrobeItem[]): Promise<void>;
}

export interface AnalysisRepository {
  list(): Promise<PurchaseAnalysis[]>;
  get(id: string): Promise<PurchaseAnalysis | null>;
  save(analysis: PurchaseAnalysis): Promise<PurchaseAnalysis>;
  remove(id: string): Promise<void>;
  replaceAll(items: PurchaseAnalysis[]): Promise<void>;
}

export interface ComparisonRepository {
  list(): Promise<Comparison[]>;
  get(id: string): Promise<Comparison | null>;
  save(comparison: Comparison): Promise<Comparison>;
  remove(id: string): Promise<void>;
  replaceAll(items: Comparison[]): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<UserSettings>;
  update(patch: Partial<UserSettings>): Promise<UserSettings>;
  reset(): Promise<UserSettings>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} could not be found. It may have been deleted.`);
    this.name = 'NotFoundError';
  }
}

const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

class LocalCollection<T extends { id: string; createdAt: string }> {
  constructor(private kv: KeyValueStore, private key: string) {}

  async all(): Promise<T[]> {
    return ((await this.kv.get<T[]>(this.key)) ?? []).slice().sort(byNewest);
  }
  async write(items: T[]) {
    await this.kv.set(this.key, items);
  }
  async find(id: string) {
    return (await this.all()).find((x) => x.id === id) ?? null;
  }
  async upsert(item: T) {
    const items = await this.all();
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.push(item);
    await this.write(items);
    return item;
  }
  async delete(id: string) {
    const items = await this.all();
    const removed = items.find((x) => x.id === id) ?? null;
    await this.write(items.filter((x) => x.id !== id));
    return removed;
  }
}

export class LocalWardrobeRepository implements WardrobeRepository {
  private col: LocalCollection<WardrobeItem>;
  constructor(kv: KeyValueStore, private images: ImageStore) {
    this.col = new LocalCollection(kv, 'wardrobe.items');
  }
  list() {
    return this.col.all();
  }
  get(id: string) {
    return this.col.find(id);
  }
  async create(draft: WardrobeItemDraft, opts: { isSample?: boolean } = {}) {
    const ts = nowIso();
    const item: WardrobeItem = {
      ...draft,
      name: draft.name.trim(),
      wearLog: draft.wearLog ?? [],
      id: newId('item'),
      ownerId: LOCAL_OWNER_ID,
      isSample: !!opts.isSample,
      createdAt: ts,
      updatedAt: ts,
    };
    return this.col.upsert(item);
  }
  async update(id: string, patch: Partial<WardrobeItemDraft>) {
    const existing = await this.col.find(id);
    if (!existing) throw new NotFoundError('This item');
    if (patch.image && existing.image && JSON.stringify(patch.image) !== JSON.stringify(existing.image)) {
      await this.images.remove(existing.image);
    }
    const next: WardrobeItem = { ...existing, ...patch, updatedAt: nowIso() };
    if ('price' in patch && !patch.price) delete next.price;
    if ('image' in patch && !patch.image) {
      if (existing.image) await this.images.remove(existing.image);
      delete next.image;
    }
    return this.col.upsert(next);
  }
  async remove(id: string) {
    const removed = await this.col.delete(id);
    if (removed?.image) await this.images.remove(removed.image);
  }
  async logWear(id: string, dateIso: string) {
    const existing = await this.col.find(id);
    if (!existing) throw new NotFoundError('This item');
    const wearLog = [...existing.wearLog, dateIso].sort();
    return this.col.upsert({ ...existing, wearLog, updatedAt: nowIso() });
  }
  async removeWear(id: string, index: number) {
    const existing = await this.col.find(id);
    if (!existing) throw new NotFoundError('This item');
    const wearLog = existing.wearLog.filter((_, i) => i !== index);
    return this.col.upsert({ ...existing, wearLog, updatedAt: nowIso() });
  }
  replaceAll(items: WardrobeItem[]) {
    return this.col.write(items);
  }
}

export class LocalAnalysisRepository implements AnalysisRepository {
  private col: LocalCollection<PurchaseAnalysis>;
  constructor(kv: KeyValueStore, private images: ImageStore) {
    this.col = new LocalCollection(kv, 'analyses');
  }
  list() {
    return this.col.all();
  }
  get(id: string) {
    return this.col.find(id);
  }
  save(a: PurchaseAnalysis) {
    return this.col.upsert(a);
  }
  async remove(id: string) {
    const removed = await this.col.delete(id);
    if (removed?.product.image) await this.images.remove(removed.product.image);
  }
  replaceAll(items: PurchaseAnalysis[]) {
    return this.col.write(items);
  }
}

export class LocalComparisonRepository implements ComparisonRepository {
  private col: LocalCollection<Comparison>;
  constructor(kv: KeyValueStore, private images: ImageStore) {
    this.col = new LocalCollection(kv, 'comparisons');
  }
  list() {
    return this.col.all();
  }
  get(id: string) {
    return this.col.find(id);
  }
  save(c: Comparison) {
    return this.col.upsert(c);
  }
  async remove(id: string) {
    const removed = await this.col.delete(id);
    if (removed) {
      for (const a of [removed.analysisA, removed.analysisB]) if (a.product.image) await this.images.remove(a.product.image);
    }
  }
  replaceAll(items: Comparison[]) {
    return this.col.write(items);
  }
}

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: '',
  currency: 'USD',
  monthlyBudget: 250,
  maxItemPrice: 180,
  budgetStrictness: 'balanced',
  styleTags: ['minimal', 'classic'],
  favoriteColors: ['navy', 'camel'],
  avoidColors: [],
  primaryOccasions: ['work', 'casual'],
  dismissedGaps: [],
  ignoredCategories: [],
  updatedAt: new Date(0).toISOString(),
};

export class LocalSettingsRepository implements SettingsRepository {
  constructor(private kv: KeyValueStore) {}
  async get(): Promise<UserSettings> {
    const raw = await this.kv.get<UserSettings>('settings');
    const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    const validCategoryIds = new Set(CATEGORIES.map((c) => c.id));
    return {
      ...merged,
      dismissedGaps: Array.isArray(merged.dismissedGaps)
        ? merged.dismissedGaps.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        : [],
      ignoredCategories: Array.isArray(merged.ignoredCategories)
        ? merged.ignoredCategories.filter((c): c is Category => validCategoryIds.has(c))
        : [],
    };
  }
  async update(patch: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.get();
    const next: UserSettings = { ...current, ...patch, updatedAt: nowIso() };
    if (patch.dismissedGaps) {
      next.dismissedGaps = Array.from(
        new Set(patch.dismissedGaps.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)),
      );
    }
    if (patch.ignoredCategories) {
      const validCategoryIds = new Set(CATEGORIES.map((c) => c.id));
      next.ignoredCategories = Array.from(
        new Set(patch.ignoredCategories.filter((c): c is Category => validCategoryIds.has(c))),
      );
    }
    if ('monthlyBudget' in patch && patch.monthlyBudget === undefined) delete next.monthlyBudget;
    if ('maxItemPrice' in patch && patch.maxItemPrice === undefined) delete next.maxItemPrice;
    await this.kv.set('settings', next);
    return next;
  }
  async reset(): Promise<UserSettings> {
    await this.kv.delete('settings');
    return this.get();
  }
}
