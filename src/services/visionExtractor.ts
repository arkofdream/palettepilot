import { CATEGORIES, COLORS, OCCASIONS, SEASONS } from '@/domain/catalog';
import type {
  AttributeProvenance,
  AttributeSource,
  Category,
  ColorId,
  Occasion,
  ProductCandidate,
  Season,
} from '@/domain/types';

export const VISION_CONFIDENCE = {
  HIGH: 0.75,
  MIN_USABLE: 0.5,
} as const;

export const MAX_VISION_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB post-compression limit for API calls

export type ImageQualityAssessment = 'clear' | 'obscured' | 'multi-item' | 'non-garment';

export interface FieldPrediction<T> {
  value: T;
  /** Model-reported or calibrated probability in [0, 1]. */
  confidence: number;
  alternatives?: T[];
  rationale?: string;
}

/**
 * Validated structured response schema for server-side vision extraction.
 *
 * Notice what is intentionally absent from this schema:
 * - No `fabricComposition` (cannot be determined reliably from a photo alone)
 * - No `price` or `brand` (must never be guessed from visual appearance)
 * - No `smartBuyScore` (scoring belongs exclusively to the deterministic Wardrobe Match Engine)
 */
export interface GarmentVisionExtraction {
  schemaVersion: '1.0';
  modelId: string;
  isGarment: boolean;
  imageQuality: ImageQualityAssessment;
  category: FieldPrediction<Category> | null;
  colors: FieldPrediction<ColorId[]> | null;
  seasons: FieldPrediction<Season[]> | null;
  occasions: FieldPrediction<Occasion[]> | null;
  suggestedName?: FieldPrediction<string> | null;
  ambiguityNotes: string[];
}

export type VisionValidationResult =
  | { ok: true; data: GarmentVisionExtraction; droppedValues: string[] }
  | { ok: false; error: string };

const VALID_CATEGORIES = new Set<Category>(CATEGORIES.map((c) => c.id));
const VALID_COLORS = new Set<ColorId>(COLORS.map((c) => c.id));
const VALID_SEASONS = new Set<Season>(SEASONS.map((s) => s.id));
const VALID_OCCASIONS = new Set<Occasion>(OCCASIONS.map((o) => o.id));
const VALID_QUALITIES = new Set<ImageQualityAssessment>([
  'clear',
  'obscured',
  'multi-item',
  'non-garment',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseConfidence(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return Math.round(v * 100) / 100;
}

/**
 * Strict runtime validator for raw JSON returned by a vision model or backend endpoint.
 * Filters out out-of-catalog enum values and rejects malformed structures.
 */
export function validateVisionExtraction(raw: unknown): VisionValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'Vision response must be a JSON object.' };
  }
  if (raw.schemaVersion !== '1.0') {
    return { ok: false, error: `Unsupported vision schemaVersion: ${String(raw.schemaVersion)}.` };
  }
  if (typeof raw.modelId !== 'string' || !raw.modelId.trim()) {
    return { ok: false, error: 'Vision response is missing a valid modelId.' };
  }
  if (typeof raw.isGarment !== 'boolean') {
    return { ok: false, error: 'Vision response is missing boolean isGarment.' };
  }
  if (typeof raw.imageQuality !== 'string' || !VALID_QUALITIES.has(raw.imageQuality as ImageQualityAssessment)) {
    return { ok: false, error: 'Vision response has an invalid imageQuality value.' };
  }

  const droppedValues: string[] = [];

  // Category prediction
  let category: FieldPrediction<Category> | null = null;
  if (raw.category !== null && raw.category !== undefined) {
    if (!isRecord(raw.category)) {
      return { ok: false, error: 'Invalid category prediction object.' };
    }
    const conf = parseConfidence(raw.category.confidence);
    if (conf === null) {
      return { ok: false, error: 'Category confidence must be a number between 0 and 1.' };
    }
    const val = raw.category.value;
    if (typeof val === 'string' && VALID_CATEGORIES.has(val as Category)) {
      const alts = Array.isArray(raw.category.alternatives)
        ? raw.category.alternatives.filter(
            (a): a is Category => typeof a === 'string' && VALID_CATEGORIES.has(a as Category),
          )
        : undefined;
      category = {
        value: val as Category,
        confidence: conf,
        alternatives: alts,
        rationale: typeof raw.category.rationale === 'string' ? raw.category.rationale : undefined,
      };
    } else {
      droppedValues.push(`category:${String(val)}`);
    }
  }

  // Colors prediction (1–3 valid ColorIds)
  let colors: FieldPrediction<ColorId[]> | null = null;
  if (raw.colors !== null && raw.colors !== undefined) {
    if (!isRecord(raw.colors) || !Array.isArray(raw.colors.value)) {
      return { ok: false, error: 'Invalid colors prediction object.' };
    }
    const conf = parseConfidence(raw.colors.confidence);
    if (conf === null) {
      return { ok: false, error: 'Colors confidence must be a number between 0 and 1.' };
    }
    const validColors: ColorId[] = [];
    for (const c of raw.colors.value) {
      if (typeof c === 'string' && VALID_COLORS.has(c as ColorId)) {
        if (!validColors.includes(c as ColorId) && validColors.length < 3) {
          validColors.push(c as ColorId);
        }
      } else {
        droppedValues.push(`color:${String(c)}`);
      }
    }
    if (validColors.length > 0) {
      colors = {
        value: validColors,
        confidence: conf,
        rationale: typeof raw.colors.rationale === 'string' ? raw.colors.rationale : undefined,
      };
    }
  }

  // Seasons prediction
  let seasons: FieldPrediction<Season[]> | null = null;
  if (raw.seasons !== null && raw.seasons !== undefined) {
    if (!isRecord(raw.seasons) || !Array.isArray(raw.seasons.value)) {
      return { ok: false, error: 'Invalid seasons prediction object.' };
    }
    const conf = parseConfidence(raw.seasons.confidence);
    if (conf === null) {
      return { ok: false, error: 'Seasons confidence must be a number between 0 and 1.' };
    }
    const validSeasons: Season[] = [];
    for (const s of raw.seasons.value) {
      if (typeof s === 'string' && VALID_SEASONS.has(s as Season)) {
        if (!validSeasons.includes(s as Season)) validSeasons.push(s as Season);
      } else {
        droppedValues.push(`season:${String(s)}`);
      }
    }
    if (validSeasons.length > 0) {
      seasons = { value: validSeasons, confidence: conf };
    }
  }

  // Occasions prediction
  let occasions: FieldPrediction<Occasion[]> | null = null;
  if (raw.occasions !== null && raw.occasions !== undefined) {
    if (!isRecord(raw.occasions) || !Array.isArray(raw.occasions.value)) {
      return { ok: false, error: 'Invalid occasions prediction object.' };
    }
    const conf = parseConfidence(raw.occasions.confidence);
    if (conf === null) {
      return { ok: false, error: 'Occasions confidence must be a number between 0 and 1.' };
    }
    const validOccasions: Occasion[] = [];
    for (const o of raw.occasions.value) {
      if (typeof o === 'string' && VALID_OCCASIONS.has(o as Occasion)) {
        if (!validOccasions.includes(o as Occasion)) validOccasions.push(o as Occasion);
      } else {
        droppedValues.push(`occasion:${String(o)}`);
      }
    }
    if (validOccasions.length > 0) {
      occasions = { value: validOccasions, confidence: conf };
    }
  }

  // Suggested name
  let suggestedName: FieldPrediction<string> | null = null;
  if (raw.suggestedName !== null && raw.suggestedName !== undefined) {
    if (isRecord(raw.suggestedName) && typeof raw.suggestedName.value === 'string') {
      const conf = parseConfidence(raw.suggestedName.confidence);
      const trimmed = raw.suggestedName.value.trim().slice(0, 80);
      if (conf !== null && trimmed) {
        suggestedName = { value: trimmed, confidence: conf };
      }
    }
  }

  const ambiguityNotes = Array.isArray(raw.ambiguityNotes)
    ? raw.ambiguityNotes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    : [];

  return {
    ok: true,
    droppedValues,
    data: {
      schemaVersion: '1.0',
      modelId: raw.modelId.trim(),
      isGarment: raw.isGarment,
      imageQuality: raw.imageQuality as ImageQualityAssessment,
      category,
      colors,
      seasons,
      occasions,
      suggestedName,
      ambiguityNotes,
    },
  };
}

import { spendGuard, SpendGuard } from './spendGuard';

export type VisionExtractionOutcome =
  | { status: 'ok'; extraction: GarmentVisionExtraction; droppedValues: string[] }
  | { status: 'not-a-garment'; extraction: GarmentVisionExtraction; reason: string }
  | { status: 'unconfigured'; reason: string }
  | {
      status: 'error';
      code:
        | 'blocked-by-spend-guard'
        | 'payload-too-large'
        | 'network'
        | 'timeout'
        | 'invalid-schema'
        | 'server-error';
      message: string;
    };

/**
 * Separate service contract for visual garment attribute extraction.
 * Keeps vision model calls decoupled from deterministic wardrobe matching and scoring.
 */
export interface GarmentVisionExtractor {
  readonly isConfigured: boolean;
  extract(image: Blob, signal?: AbortSignal): Promise<VisionExtractionOutcome>;
}

/**
 * Default extractor when no backend vision endpoint is configured.
 * Never fabricates AI findings.
 */
export class UnconfiguredVisionExtractor implements GarmentVisionExtractor {
  readonly isConfigured = false;
  async extract(): Promise<VisionExtractionOutcome> {
    return {
      status: 'unconfigured',
      reason:
        'Vision extraction endpoint is not configured. Select category, colors, and seasons manually.',
    };
  }
}

export interface HttpVisionExtractorOptions {
  endpoint: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  spendGuard?: SpendGuard;
}

/**
 * Client adapter that sends a compressed garment image to PalettePilot's backend
 * vision proxy (`/api/v1/vision/extract-garment`). Never holds provider API keys.
 * Fails closed if blocked by the Zero-Spend Guard.
 */
export class HttpVisionExtractor implements GarmentVisionExtractor {
  readonly isConfigured = true;
  private timeoutMs: number;
  private maxRetries: number;
  private fetchImpl: typeof fetch;
  private guard: SpendGuard;

  constructor(private opts: HttpVisionExtractorOptions) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = Math.min(1, Math.max(0, opts.maxRetries ?? 0)); // Bounded: 0 or 1 max
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.guard = opts.spendGuard ?? spendGuard;
  }

  async extract(image: Blob, signal?: AbortSignal): Promise<VisionExtractionOutcome> {
    if (image.size > MAX_VISION_PAYLOAD_BYTES) {
      return {
        status: 'error',
        code: 'payload-too-large',
        message: 'Compressed image exceeds the 4 MB limit for vision analysis.',
      };
    }

    // Zero-unapproved-spend check: fail-closed before any network request
    const permission = this.guard.canMakeExternalRequest(image.size);
    if (!permission.allowed) {
      return {
        status: 'error',
        code: 'blocked-by-spend-guard',
        message: permission.reason ?? 'Request blocked by Zero-Spend Policy.',
      };
    }

    const release = this.guard.beginRequest();
    const startTime = Date.now();
    let lastError: VisionExtractionOutcome | null = null;

    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        if (attempt > 0) {
          // Ensure physical retry does not bypass quota or kill switch
          const retryCheck = this.guard.canMakeRetryRequest(image.size);
          if (!retryCheck.allowed) {
            const retryBlocked: VisionExtractionOutcome = {
              status: 'error',
              code: 'blocked-by-spend-guard',
              message: `Retry blocked: ${retryCheck.reason}`,
            };
            this.guard.recordFailure(retryBlocked.message, Date.now() - startTime);
            return retryBlocked;
          }
          this.guard.recordRetryAttempt();
        }

        const controller = new AbortController();
        const onExternalAbort = () => controller.abort();
        signal?.addEventListener('abort', onExternalAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const form = new FormData();
          form.append('image', image, 'garment.jpg');
          const res = await this.fetchImpl(this.opts.endpoint, {
            method: 'POST',
            body: form,
            signal: controller.signal,
          });

          if (!res.ok) {
            const transient = res.status === 502 || res.status === 503 || res.status === 504;
            lastError = {
              status: 'error',
              code: 'server-error',
              message: `Vision service returned HTTP ${res.status}.`,
            };
            if (transient && attempt < this.maxRetries) continue;
            this.guard.recordFailure(lastError.message, Date.now() - startTime);
            return lastError;
          }

          const json: unknown = await res.json();
          const validated = validateVisionExtraction(json);
          if (!validated.ok) {
            lastError = {
              status: 'error',
              code: 'invalid-schema',
              message: validated.error,
            };
            this.guard.recordFailure(lastError.message, Date.now() - startTime);
            return lastError;
          }

          const data = validated.data;
          if (!data.isGarment || data.imageQuality === 'non-garment') {
            this.guard.recordSuccess(Date.now() - startTime);
            return {
              status: 'not-a-garment',
              extraction: data,
              reason:
                data.ambiguityNotes[0] ??
                'The uploaded image does not appear to show a single wearable garment.',
            };
          }

          this.guard.recordSuccess(Date.now() - startTime);
          return {
            status: 'ok',
            extraction: data,
            droppedValues: validated.droppedValues,
          };
        } catch (err) {
          const isAbort = err instanceof Error && err.name === 'AbortError';
          lastError = {
            status: 'error',
            code: isAbort ? 'timeout' : 'network',
            message: isAbort
              ? 'Vision analysis timed out.'
              : 'Could not reach the vision analysis service.',
          };
          if (attempt < this.maxRetries && !signal?.aborted) continue;
          this.guard.recordFailure(lastError.message, Date.now() - startTime);
          return lastError;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onExternalAbort);
        }
      }

      const finalErr =
        lastError ?? {
          status: 'error',
          code: 'network',
          message: 'Vision analysis failed.',
        };
      this.guard.recordFailure(finalErr.message, Date.now() - startTime);
      return finalErr;
    } finally {
      release();
    }
  }
}

export interface UserEnteredOverrides {
  name?: string;
  category?: Category;
  colors?: ColorId[];
  seasons?: Season[];
  intendedUse?: Occasion[];
  /** Explicit flags for which fields the user deliberately set or edited. */
  userEditedFields?: Partial<Record<'name' | 'category' | 'colors' | 'seasons' | 'intendedUse', boolean>>;
}

export interface HandoffResult {
  candidate: ProductCandidate;
  provenance: AttributeProvenance;
  lowConfidenceWarnings: string[];
}

/**
 * Deterministic handoff from validated vision extraction to a `ProductCandidate`
 * ready for `evaluateCandidate()`.
 *
 * Rules:
 * 1. Explicit user edits always win (`user` or `ai-user-confirmed` source).
 * 2. AI predictions are only applied when their confidence >= `VISION_CONFIDENCE.MIN_USABLE` (0.50).
 * 3. Predictions between 0.50 and 0.75 are applied as `'ai-inferred'` and emit a low-confidence warning.
 * 4. Predictions below 0.50 are not auto-applied; fallback defaults are used and flagged.
 * 5. Fabric composition, price, and URL content are never fabricated by vision.
 */
export function handoffVisionToCandidate(
  base: ProductCandidate,
  extraction: GarmentVisionExtraction | null,
  userEdits: Partial<Record<'name' | 'category' | 'colors' | 'seasons' | 'intendedUse', boolean>> = {},
): HandoffResult {
  const warnings: string[] = [];

  if (!extraction || !extraction.isGarment) {
    const provenance: AttributeProvenance = {
      category: userEdits.category ? 'user' : 'default',
      colors: userEdits.colors ? 'user' : 'default',
      seasons: userEdits.seasons ? 'user' : 'default',
      intendedUse: userEdits.intendedUse ? 'user' : 'default',
      name: base.name ? 'user' : undefined,
      price: base.price ? 'user' : 'missing',
      url: base.url ? 'user-unverified' : 'missing',
      fabricComposition: 'unavailable',
    };
    return {
      candidate: { ...base, provenance },
      provenance,
      lowConfidenceWarnings: warnings,
    };
  }

  if (extraction.imageQuality === 'obscured') {
    warnings.push('Garment is partially obscured or poorly lit in the photo; verify colors and category.');
  } else if (extraction.imageQuality === 'multi-item') {
    warnings.push('Multiple garments detected in the photo; attributes reflect the primary piece.');
  }
  for (const note of extraction.ambiguityNotes) {
    if (!warnings.includes(note)) warnings.push(note);
  }

  const resolveField = <T>(
    fieldLabel: string,
    editedByUser: boolean | undefined,
    baseVal: T,
    pred: FieldPrediction<T> | null | undefined,
  ): { value: T; source: AttributeSource } => {
    if (editedByUser) {
      const matchesAi = pred && JSON.stringify(pred.value) === JSON.stringify(baseVal);
      return { value: baseVal, source: matchesAi ? 'ai-user-confirmed' : 'user' };
    }
    if (!pred) {
      warnings.push(`Could not infer ${fieldLabel} from the photo; using selected value.`);
      return { value: baseVal, source: 'default' };
    }
    if (pred.confidence < VISION_CONFIDENCE.MIN_USABLE) {
      warnings.push(
        `Low visual confidence for ${fieldLabel} (${Math.round(pred.confidence * 100)}%); kept manual selection.`,
      );
      return { value: baseVal, source: 'default' };
    }
    if (pred.confidence < VISION_CONFIDENCE.HIGH) {
      warnings.push(
        `Moderate visual confidence for ${fieldLabel} (${Math.round(pred.confidence * 100)}%) — please review.`,
      );
    }
    return { value: pred.value, source: 'ai-inferred' };
  };

  const catRes = resolveField('category', userEdits.category, base.category, extraction.category);
  const colRes = resolveField('colors', userEdits.colors, base.colors, extraction.colors);
  const seaRes = resolveField('seasons', userEdits.seasons, base.seasons, extraction.seasons);
  const occRes = resolveField(
    'intended use',
    userEdits.intendedUse,
    base.intendedUse,
    extraction.occasions,
  );

  let name = base.name;
  let nameSource: AttributeSource | undefined = base.name ? 'user' : undefined;
  if (!userEdits.name && !base.name && extraction.suggestedName && extraction.suggestedName.confidence >= VISION_CONFIDENCE.MIN_USABLE) {
    name = extraction.suggestedName.value;
    nameSource = 'ai-inferred';
  }

  const confidences = [
    extraction.category?.confidence,
    extraction.colors?.confidence,
    extraction.seasons?.confidence,
    extraction.occasions?.confidence,
  ].filter((c): c is number => typeof c === 'number');
  const overallVisualConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
    : undefined;

  const provenance: AttributeProvenance = {
    category: catRes.source,
    colors: colRes.source,
    seasons: seaRes.source,
    intendedUse: occRes.source,
    name: nameSource,
    price: base.price ? 'user' : 'missing',
    url: base.url ? 'user-unverified' : 'missing',
    fabricComposition: 'unavailable',
    modelId: extraction.modelId,
    overallVisualConfidence,
    ambiguityNotes: warnings.length ? warnings : undefined,
  };

  const candidate: ProductCandidate = {
    ...base,
    name,
    category: catRes.value,
    colors: colRes.value,
    seasons: seaRes.value,
    intendedUse: occRes.value,
    provenance,
  };

  return { candidate, provenance, lowConfidenceWarnings: warnings };
}
