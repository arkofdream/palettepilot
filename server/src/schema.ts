/**
 * Server-side structured schema validation and prompt definitions.
 * Validates model output against PalettePilot's strict domain catalog.
 */

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

export type ImageQualityAssessment = 'clear' | 'obscured' | 'multi-item' | 'non-garment';

export interface FieldPrediction<T> {
  value: T;
  confidence: number;
  alternatives?: T[];
  rationale?: string;
}

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

export const VALID_CATEGORIES = new Set<Category>([
  'top',
  'knitwear',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'accessory',
]);

export const VALID_SEASONS = new Set<Season>(['spring', 'summer', 'autumn', 'winter']);

export const VALID_OCCASIONS = new Set<Occasion>([
  'casual',
  'work',
  'evening',
  'weekend',
  'active',
  'travel',
]);

export const VALID_COLORS = new Set<ColorId>([
  'black',
  'charcoal',
  'grey',
  'white',
  'cream',
  'beige',
  'camel',
  'brown',
  'navy',
  'blue',
  'light-blue',
  'denim',
  'olive',
  'green',
  'burgundy',
  'red',
  'rust',
  'pink',
  'yellow',
  'purple',
]);

export const VALID_QUALITIES = new Set<ImageQualityAssessment>([
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

export function validateGarmentExtraction(raw: unknown): {
  ok: boolean;
  data?: GarmentVisionExtraction;
  error?: string;
  droppedValues?: string[];
} {
  if (!isRecord(raw)) {
    return { ok: false, error: 'Model response must be a JSON object.' };
  }
  if (raw.schemaVersion !== '1.0') {
    return { ok: false, error: `Invalid schemaVersion: expected "1.0", got "${String(raw.schemaVersion)}".` };
  }
  if (typeof raw.modelId !== 'string' || !raw.modelId.trim()) {
    return { ok: false, error: 'Missing or empty modelId.' };
  }
  if (typeof raw.isGarment !== 'boolean') {
    return { ok: false, error: 'Missing or non-boolean isGarment flag.' };
  }
  if (typeof raw.imageQuality !== 'string' || !VALID_QUALITIES.has(raw.imageQuality as ImageQualityAssessment)) {
    return { ok: false, error: `Invalid imageQuality: "${String(raw.imageQuality)}".` };
  }

  const droppedValues: string[] = [];

  // Category
  let category: FieldPrediction<Category> | null = null;
  if (raw.category !== null && raw.category !== undefined) {
    if (!isRecord(raw.category)) {
      return { ok: false, error: 'Invalid category structure.' };
    }
    const conf = parseConfidence(raw.category.confidence);
    if (conf === null) return { ok: false, error: 'Category confidence must be a number in [0, 1].' };
    const val = raw.category.value;
    if (typeof val === 'string' && VALID_CATEGORIES.has(val as Category)) {
      category = {
        value: val as Category,
        confidence: conf,
        alternatives: Array.isArray(raw.category.alternatives)
          ? raw.category.alternatives.filter((a): a is Category => typeof a === 'string' && VALID_CATEGORIES.has(a as Category))
          : undefined,
        rationale: typeof raw.category.rationale === 'string' ? raw.category.rationale : undefined,
      };
    } else {
      droppedValues.push(`category:${String(val)}`);
    }
  }

  // Colors
  let colors: FieldPrediction<ColorId[]> | null = null;
  if (raw.colors !== null && raw.colors !== undefined) {
    if (!isRecord(raw.colors) || !Array.isArray(raw.colors.value)) {
      return { ok: false, error: 'Invalid colors structure.' };
    }
    const conf = parseConfidence(raw.colors.confidence);
    if (conf === null) return { ok: false, error: 'Colors confidence must be a number in [0, 1].' };
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

  // Seasons
  let seasons: FieldPrediction<Season[]> | null = null;
  if (raw.seasons !== null && raw.seasons !== undefined) {
    if (!isRecord(raw.seasons) || !Array.isArray(raw.seasons.value)) {
      return { ok: false, error: 'Invalid seasons structure.' };
    }
    const conf = parseConfidence(raw.seasons.confidence);
    if (conf === null) return { ok: false, error: 'Seasons confidence must be a number in [0, 1].' };
    const validSeasons = raw.seasons.value.filter((s): s is Season => typeof s === 'string' && VALID_SEASONS.has(s as Season));
    if (validSeasons.length > 0) {
      seasons = {
        value: validSeasons,
        confidence: conf,
        rationale: typeof raw.seasons.rationale === 'string' ? raw.seasons.rationale : undefined,
      };
    }
  }

  // Occasions
  let occasions: FieldPrediction<Occasion[]> | null = null;
  if (raw.occasions !== null && raw.occasions !== undefined) {
    if (!isRecord(raw.occasions) || !Array.isArray(raw.occasions.value)) {
      return { ok: false, error: 'Invalid occasions structure.' };
    }
    const conf = parseConfidence(raw.occasions.confidence);
    if (conf === null) return { ok: false, error: 'Occasions confidence must be a number in [0, 1].' };
    const validOccasions = raw.occasions.value.filter((o): o is Occasion => typeof o === 'string' && VALID_OCCASIONS.has(o as Occasion));
    if (validOccasions.length > 0) {
      occasions = {
        value: validOccasions,
        confidence: conf,
        rationale: typeof raw.occasions.rationale === 'string' ? raw.occasions.rationale : undefined,
      };
    }
  }

  // Suggested name
  let suggestedName: FieldPrediction<string> | null = null;
  if (raw.suggestedName !== null && raw.suggestedName !== undefined) {
    if (isRecord(raw.suggestedName) && typeof raw.suggestedName.value === 'string' && raw.suggestedName.value.trim()) {
      const conf = parseConfidence(raw.suggestedName.confidence) ?? 0.7;
      suggestedName = {
        value: raw.suggestedName.value.trim().slice(0, 80),
        confidence: conf,
      };
    }
  }

  const ambiguityNotes: string[] = [];
  if (Array.isArray(raw.ambiguityNotes)) {
    for (const note of raw.ambiguityNotes) {
      if (typeof note === 'string' && note.trim()) {
        ambiguityNotes.push(note.trim().slice(0, 200));
      }
    }
  }

  return {
    ok: true,
    data: {
      schemaVersion: '1.0',
      modelId: raw.modelId,
      isGarment: raw.isGarment,
      imageQuality: raw.imageQuality as ImageQualityAssessment,
      category,
      colors,
      seasons,
      occasions,
      suggestedName,
      ambiguityNotes,
    },
    droppedValues,
  };
}

export const EXTRACTION_SYSTEM_PROMPT = `You are a fashion catalog vision extractor. Analyze the uploaded photograph of a garment or item and return ONLY a valid JSON object conforming strictly to schemaVersion "1.0".

Allowed Category: "top", "knitwear", "bottom", "dress", "outerwear", "shoes", "accessory".
Allowed Seasons: "spring", "summer", "autumn", "winter".
Allowed Occasions: "casual", "work", "evening", "weekend", "active", "travel".
Allowed Colors: "black", "charcoal", "grey", "white", "cream", "beige", "camel", "brown", "navy", "blue", "light-blue", "denim", "olive", "green", "burgundy", "red", "rust", "pink", "yellow", "purple".

RULES:
1. NEVER guess or fabricate fabric composition (e.g. "100% cashmere"), brand, or price.
2. If the image is not a clothing garment or wearable accessory, set isGarment: false, imageQuality: "non-garment", and category: null.
3. If uncertain, provide a lower confidence number between 0.0 and 1.0.
4. Output raw JSON ONLY with no markdown backticks, no comments, and no explanation.`;
