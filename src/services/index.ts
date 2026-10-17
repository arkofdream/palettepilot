import type { Comparison, PurchaseAnalysis, UserSettings, WardrobeItem } from '@/domain/types';
import { LocalRuleBasedProvider, type PurchaseAnalysisProvider } from './analysisProvider';
import {
  HttpVisionExtractor,
  UnconfiguredVisionExtractor,
  type GarmentVisionExtractor,
} from './visionExtractor';
import {
  LocalAnalysisRepository,
  LocalComparisonRepository,
  LocalSettingsRepository,
  LocalWardrobeRepository,
  type AnalysisRepository,
  type ComparisonRepository,
  type SettingsRepository,
  type WardrobeRepository,
} from './repositories';
import { buildSampleAnalyses, buildSampleComparison, buildSampleItems } from './sampleData';
import { IndexedDbStore, type KeyValueStore } from './storage/keyValueStore';
import { LocalImageStore, type ImageStore } from './storage/imageStore';

/**
 * Composition root. This is the single place that decides which implementations
 * back the app. Swap these for API-backed versions once accounts and cloud storage exist.
 */
export interface Services {
  wardrobe: WardrobeRepository;
  analyses: AnalysisRepository;
  comparisons: ComparisonRepository;
  settings: SettingsRepository;
  images: ImageStore;
  visionExtractor: GarmentVisionExtractor;
  analysisProvider: PurchaseAnalysisProvider;
  data: DataAdmin;
}

export interface ExportBundle {
  format: 'palettepilot-export';
  version: 1;
  exportedAt: string;
  items: WardrobeItem[];
  analyses: PurchaseAnalysis[];
  comparisons: Comparison[];
  settings: UserSettings;
  note: string;
}

export interface DataAdmin {
  ensureSeeded(): Promise<void>;
  removeSampleData(): Promise<void>;
  restoreSampleData(): Promise<void>;
  clearAll(): Promise<void>;
  exportAll(): Promise<ExportBundle>;
}

const SEED_KEY = 'meta.seedVersion';
const SEED_VERSION = 1;

function createServices(): Services {
  const dataKv: KeyValueStore = new IndexedDbStore('palettepilot', 'data');
  const imageKv: KeyValueStore = new IndexedDbStore('palettepilot-images', 'blobs');
  const images = new LocalImageStore(imageKv);
  const wardrobe = new LocalWardrobeRepository(dataKv, images);
  const analyses = new LocalAnalysisRepository(dataKv, images);
  const comparisons = new LocalComparisonRepository(dataKv, images);
  const settings = new LocalSettingsRepository(dataKv);

  let seeding: Promise<void> | null = null;

  const insertSamples = async () => {
    const s = await settings.get();
    const sampleItems = buildSampleItems();
    const sampleAnalyses = buildSampleAnalyses(sampleItems, s);
    const sampleComparison = buildSampleComparison(sampleAnalyses);
    const [items, an, cmp] = await Promise.all([wardrobe.list(), analyses.list(), comparisons.list()]);
    await wardrobe.replaceAll([...items.filter((i) => !i.isSample), ...sampleItems]);
    await analyses.replaceAll([...an.filter((a) => !a.isSample), ...sampleAnalyses]);
    await comparisons.replaceAll([...cmp.filter((c) => !c.isSample), ...(sampleComparison ? [sampleComparison] : [])]);
  };

  const data: DataAdmin = {
    ensureSeeded() {
      seeding ??= (async () => {
        const v = await dataKv.get<number>(SEED_KEY);
        if (v === undefined) {
          await insertSamples();
          await dataKv.set(SEED_KEY, SEED_VERSION);
        }
      })();
      return seeding;
    },
    async removeSampleData() {
      const [items, an, cmp] = await Promise.all([wardrobe.list(), analyses.list(), comparisons.list()]);
      await wardrobe.replaceAll(items.filter((i) => !i.isSample));
      await analyses.replaceAll(an.filter((a) => !a.isSample));
      await comparisons.replaceAll(cmp.filter((c) => !c.isSample));
    },
    async restoreSampleData() {
      await insertSamples();
    },
    async clearAll() {
      for (const k of await dataKv.keys()) if (k !== SEED_KEY) await dataKv.delete(k);
      for (const k of await imageKv.keys()) await imageKv.delete(k);
      await dataKv.set(SEED_KEY, SEED_VERSION);
    },
    async exportAll() {
      const [items, an, cmp, s] = await Promise.all([wardrobe.list(), analyses.list(), comparisons.list(), settings.get()]);
      return {
        format: 'palettepilot-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        items,
        analyses: an,
        comparisons: cmp,
        settings: s,
        note: 'Uploaded photos are stored separately in this browser and are not included in this file.',
      };
    },
  };

  const visionEndpoint =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_VISION_API_URL
      ? String(import.meta.env.VITE_VISION_API_URL).trim()
      : '';
  const visionExtractor: GarmentVisionExtractor = visionEndpoint
    ? new HttpVisionExtractor({ endpoint: visionEndpoint })
    : new UnconfiguredVisionExtractor();

  return {
    wardrobe,
    analyses,
    comparisons,
    settings,
    images,
    visionExtractor,
    analysisProvider: new LocalRuleBasedProvider(visionExtractor),
    data,
  };
}

export const services: Services = createServices();
