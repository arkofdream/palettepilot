/**
 * Core domain model for PalettePilot.
 *
 * These types are intentionally backend-ready: every record has a stable string id,
 * an owner id (local placeholder until accounts exist), ISO timestamps, and image
 * references that can point at local storage today and cloud storage later.
 */

export type ISODateString = string;

export type Category =
  | 'top'
  | 'knitwear'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'accessory';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type Occasion = 'casual' | 'work' | 'evening' | 'weekend' | 'active' | 'travel';

export type ColorId =
  | 'black'
  | 'charcoal'
  | 'grey'
  | 'white'
  | 'cream'
  | 'beige'
  | 'camel'
  | 'brown'
  | 'navy'
  | 'blue'
  | 'light-blue'
  | 'denim'
  | 'olive'
  | 'green'
  | 'burgundy'
  | 'red'
  | 'rust'
  | 'pink'
  | 'yellow'
  | 'purple';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CAD' | 'SEK' | 'NOK' | 'DKK' | 'PLN';

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/**
 * Reference to an image. Today images live in the browser (IndexedDB) or ship as
 * static sample assets; a future backend can add a `remote` kind (e.g. a signed
 * cloud-storage URL) without changing the UI.
 */
export type ImageRef =
  | { kind: 'local'; id: string }
  | { kind: 'static'; url: string }
  | { kind: 'remote'; url: string };

export interface WardrobeItem {
  id: string;
  ownerId: string;
  name: string;
  category: Category;
  /** First color is treated as the dominant color. */
  colors: ColorId[];
  seasons: Season[];
  occasions: Occasion[];
  price?: Money;
  image?: ImageRef;
  notes?: string;
  /** Each entry is a recorded wear date. Empty means "no wear recorded", not "never worn". */
  wearLog: ISODateString[];
  /** True for the bundled demo items so they are always labeled in the UI. */
  isSample: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type WardrobeItemDraft = Omit<
  WardrobeItem,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'isSample' | 'wearLog'
> & { wearLog?: ISODateString[] };

export type AttributeSource = 'user' | 'ai-inferred' | 'ai-user-confirmed' | 'default';

export interface AttributeProvenance {
  category: AttributeSource;
  colors: AttributeSource;
  seasons: AttributeSource;
  intendedUse: AttributeSource;
  name?: AttributeSource;
  price?: 'user' | 'missing';
  url?: 'user-unverified' | 'missing';
  fabricComposition?: 'unavailable';
  modelId?: string;
  overallVisualConfidence?: number;
  ambiguityNotes?: string[];
}

/** A product the user is considering. Never assumed to be verified by a retailer. */
export interface ProductCandidate {
  name?: string;
  url?: string;
  price?: Money;
  image?: ImageRef;
  category: Category;
  colors: ColorId[];
  seasons: Season[];
  intendedUse: Occasion[];
  /** Tracks which attributes were entered by the user vs. inferred from an image. */
  provenance?: AttributeProvenance;
}

export type MatchSourceMode = 'all' | 'mine' | 'custom';

export interface MatchSource {
  mode: MatchSourceMode;
  /** Only used when mode === 'custom'. */
  itemIds?: string[];
}

export type FactorId = 'compatibility' | 'versatility' | 'uniqueness' | 'gapFill' | 'budget';

export type FactorStatus = 'assessed' | 'not-assessed';

export interface ScoreFactor {
  id: FactorId;
  label: string;
  /** 0–100, only meaningful when status === 'assessed'. */
  score: number;
  /** Nominal weight before re-normalisation (0–1). */
  weight: number;
  /** Weight actually applied after excluding non-assessed factors (0–1). */
  appliedWeight: number;
  status: FactorStatus;
  summary: string;
  details: string[];
  /** Raw counts behind the score (e.g. pairable items), for comparisons and display. */
  metrics?: Record<string, number>;
}

export type Verdict = 'buy' | 'consider' | 'skip' | 'insufficient';

export type Confidence = 'low' | 'medium' | 'high';

export type DataSourceStatus = 'used' | 'provided-not-analyzed' | 'unavailable' | 'missing';

export interface DataSourceNote {
  label: string;
  status: DataSourceStatus;
  note: string;
}

export interface OutfitSuggestion {
  id: string;
  itemIds: string[];
  /** 0–1 internal harmony score used to rank suggestions. */
  harmony: number;
  occasion?: Occasion;
  rationale: string;
}

export interface SimilarItem {
  itemId: string;
  similarity: number;
  reasons: string[];
}

export type ExplanationTone = 'positive' | 'neutral' | 'negative' | 'info';

export interface ExplanationPoint {
  tone: ExplanationTone;
  text: string;
}

/** Describes what produced an analysis, so the UI can label it honestly. */
export interface EngineInfo {
  id: string;
  label: string;
  /** True only when a real AI model contributed findings. */
  usesAI: boolean;
  version: string;
}

export interface PurchaseAnalysis {
  id: string;
  ownerId: string;
  createdAt: ISODateString;
  product: ProductCandidate;
  matchSource: MatchSource;
  /** Snapshot of how many items were considered. */
  wardrobeSize: number;
  smartBuyScore: number | null;
  verdict: Verdict;
  confidence: Confidence;
  confidenceReasons: string[];
  factors: ScoreFactor[];
  similarItems: SimilarItem[];
  outfits: OutfitSuggestion[];
  explanation: ExplanationPoint[];
  styleNotes: string[];
  dataSources: DataSourceNote[];
  engine: EngineInfo;
  /** Demo/sample analyses are always labeled as such in the UI. */
  isSample: boolean;
}

export interface Comparison {
  id: string;
  ownerId: string;
  createdAt: ISODateString;
  title: string;
  analysisA: PurchaseAnalysis;
  analysisB: PurchaseAnalysis;
  winner: 'A' | 'B' | 'tie' | 'neither';
  reasons: string[];
  saved: boolean;
  isSample: boolean;
}

export type StyleTag =
  | 'minimal'
  | 'classic'
  | 'relaxed'
  | 'tailored'
  | 'romantic'
  | 'street'
  | 'outdoor'
  | 'statement';

export interface UserSettings {
  displayName: string;
  currency: CurrencyCode;
  monthlyBudget?: number;
  maxItemPrice?: number;
  budgetStrictness: 'relaxed' | 'balanced' | 'strict';
  styleTags: StyleTag[];
  favoriteColors: ColorId[];
  avoidColors: ColorId[];
  primaryOccasions: Occasion[];
  /** Stable IDs of gaps dismissed by the user. */
  dismissedGaps: string[];
  /** Categories the user explicitly excludes from gap recommendations. */
  ignoredCategories: Category[];
  updatedAt: ISODateString;
}
