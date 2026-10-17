import type {
  Confidence,
  DataSourceNote,
  EngineInfo,
  MatchSource,
  ProductCandidate,
  PurchaseAnalysis,
  UserSettings,
  WardrobeItem,
} from '@/domain/types';
import { evaluateCandidate } from './engine/scoring';
import { LOCAL_OWNER_ID, newId, nowIso } from './ids';
import { inspectProductUrl } from './productUrl';
import {
  handoffVisionToCandidate,
  type GarmentVisionExtraction,
  type GarmentVisionExtractor,
} from './visionExtractor';

export interface AnalysisRequest {
  product: ProductCandidate;
  matchSource: MatchSource;
  /** Already filtered according to matchSource. */
  wardrobe: WardrobeItem[];
  settings: UserSettings;
  /** Whether the user attached a product photo. */
  hasImage: boolean;
  /** Optional raw image blob when available during submission for vision extraction. */
  imageBlob?: Blob | null;
  /** Optional pre-extracted vision output if the user ran extraction in the form. */
  visionExtraction?: GarmentVisionExtraction | null;
  /** Flags indicating which attributes were explicitly edited by the user. */
  userEditedFields?: Partial<
    Record<'name' | 'category' | 'colors' | 'seasons' | 'intendedUse', boolean>
  >;
}

/**
 * The seam for purchase analysis.
 *
 * Architectural rule: Visual attribute extraction (`GarmentVisionExtractor`) is
 * strictly separate from wardrobe matching and Smart Buy Score calculation
 * (`evaluateCandidate`). Even when a vision model extracts attributes from a photo,
 * the Smart Buy Score is always computed by the deterministic Wardrobe Match Engine.
 */
export interface PurchaseAnalysisProvider {
  readonly engine: EngineInfo;
  analyze(request: AnalysisRequest): Promise<PurchaseAnalysis>;
}

export const RULE_ENGINE: EngineInfo = {
  id: 'pp-wardrobe-match-rules',
  label: 'Wardrobe Match Engine (rule-based)',
  usesAI: false,
  version: '0.1.0',
};

export function buildVisionAssistedEngineInfo(modelId: string): EngineInfo {
  return {
    id: `pp-wardrobe-match-rules+vision:${modelId}`,
    label: `Wardrobe Match Engine (rules + ${modelId} attribute extraction)`,
    usesAI: true,
    version: '0.2.0',
  };
}

/**
 * Runs optional visual attribute extraction (when configured or provided), validates
 * and merges attributes with provenance via `handoffVisionToCandidate`, and then
 * executes the deterministic `evaluateCandidate` scoring & outfit engine.
 */
export class LocalRuleBasedProvider implements PurchaseAnalysisProvider {
  readonly engine = RULE_ENGINE;

  constructor(private visionExtractor?: GarmentVisionExtractor) {}

  async analyze(req: AnalysisRequest): Promise<PurchaseAnalysis> {
    // Yield so the UI can render its loading state before synchronous scoring.
    await new Promise((r) => setTimeout(r, 450));

    let extraction: GarmentVisionExtraction | null = req.visionExtraction ?? null;
    let visionErrorNote: string | null = null;

    if (!extraction && req.imageBlob && this.visionExtractor?.isConfigured) {
      const outcome = await this.visionExtractor.extract(req.imageBlob);
      if (outcome.status === 'ok') {
        extraction = outcome.extraction;
      } else if (outcome.status === 'not-a-garment') {
        visionErrorNote = outcome.reason;
      } else if (outcome.status === 'error') {
        visionErrorNote = outcome.message;
      }
    }

    const handoff = handoffVisionToCandidate(
      req.product,
      extraction,
      req.userEditedFields ?? {
        category: true,
        colors: true,
        seasons: true,
        intendedUse: true,
        name: !!req.product.name,
      },
    );

    const resolvedProduct = handoff.candidate;
    const usedVision = Boolean(
      extraction &&
        extraction.isGarment &&
        (handoff.provenance.category === 'ai-inferred' ||
          handoff.provenance.colors === 'ai-inferred' ||
          handoff.provenance.seasons === 'ai-inferred' ||
          handoff.provenance.intendedUse === 'ai-inferred' ||
          handoff.provenance.category === 'ai-user-confirmed' ||
          handoff.provenance.colors === 'ai-user-confirmed'),
    );

    const result = evaluateCandidate(resolvedProduct, req.wardrobe, req.settings);

    // Adjust confidence Reasons to reflect provenance honestly
    const confidenceReasons = [...result.confidenceReasons];
    if (usedVision && extraction) {
      confidenceReasons[0] = `Visual attributes extracted by ${extraction.modelId} (${Math.round(
        (handoff.provenance.overallVisualConfidence ?? 0.75) * 100,
      )}% avg confidence) and scored deterministically.`;
    }
    for (const w of handoff.lowConfidenceWarnings) {
      if (!confidenceReasons.includes(w)) confidenceReasons.push(w);
    }
    if (visionErrorNote) {
      confidenceReasons.push(`Vision note: ${visionErrorNote}`);
    }

    // Downgrade confidence if vision had low-confidence warnings on unconfirmed AI fields
    let confidence: Confidence = result.confidence;
    if (
      usedVision &&
      handoff.lowConfidenceWarnings.length > 0 &&
      confidence === 'high'
    ) {
      confidence = 'medium';
    }

    const resolvedReq: AnalysisRequest = {
      ...req,
      product: resolvedProduct,
      visionExtraction: extraction,
    };

    return {
      id: newId('analysis'),
      ownerId: LOCAL_OWNER_ID,
      createdAt: nowIso(),
      product: resolvedProduct,
      matchSource: req.matchSource,
      wardrobeSize: req.wardrobe.length,
      smartBuyScore: result.smartBuyScore,
      verdict: result.verdict,
      confidence,
      confidenceReasons,
      factors: result.factors,
      similarItems: result.similarItems,
      outfits: result.outfits.suggestions,
      explanation: result.explanation,
      styleNotes: result.styleNotes,
      dataSources: describeDataSources(resolvedReq, visionErrorNote),
      engine:
        usedVision && extraction
          ? buildVisionAssistedEngineInfo(extraction.modelId)
          : this.engine,
      isSample: false,
    };
  }
}

export function describeDataSources(
  req: AnalysisRequest,
  visionErrorNote?: string | null,
): DataSourceNote[] {
  const prov = req.product.provenance;
  const aiFields: string[] = [];
  const userFields: string[] = [];

  if (prov) {
    const entries: [string, string][] = [
      ['category', prov.category],
      ['colors', prov.colors],
      ['seasons', prov.seasons],
      ['intended use', prov.intendedUse],
    ];
    for (const [label, src] of entries) {
      if (src === 'ai-inferred') aiFields.push(label);
      else if (src === 'ai-user-confirmed') userFields.push(`${label} (AI-suggested, user-confirmed)`);
      else userFields.push(label);
    }
  }

  const itemDetailsNote =
    aiFields.length > 0
      ? `AI-inferred: ${aiFields.join(', ')}. User-entered/confirmed: ${
          userFields.length ? userFields.join(', ') : 'none'
        }.`
      : 'Category, colors, seasons and intended use entered by you drive every factor.';

  const photoUsedByAi = Boolean(prov?.modelId && (aiFields.length > 0 || req.visionExtraction?.isGarment));

  const notes: DataSourceNote[] = [
    {
      label: 'Garment attributes',
      status: 'used',
      note: itemDetailsNote,
    },
    {
      label: `Your wardrobe (${req.wardrobe.length} items)`,
      status: req.wardrobe.length ? 'used' : 'missing',
      note:
        req.matchSource.mode === 'all'
          ? 'All wardrobe items, including sample items.'
          : req.matchSource.mode === 'mine'
            ? 'Only items you added; sample items excluded.'
            : 'A custom selection of items.',
    },
    req.hasImage
      ? photoUsedByAi
        ? {
            label: 'Product photo',
            status: 'used',
            note: `Analyzed by ${prov?.modelId} for visual attributes${
              prov?.overallVisualConfidence !== undefined
                ? ` (${Math.round(prov.overallVisualConfidence * 100)}% avg confidence)`
                : ''
            }. Fabric composition is never guessed from photos.`,
          }
        : {
            label: 'Product photo',
            status: 'provided-not-analyzed',
            note:
              visionErrorNote ??
              'Saved for reference. Image recognition isn’t connected, so the photo was not analyzed.',
          }
      : { label: 'Product photo', status: 'missing', note: 'No photo attached.' },
  ];

  if (req.product.url) {
    const u = inspectProductUrl(req.product.url);
    notes.push({
      label: u.hostname ? `Product link (${u.hostname})` : 'Product link',
      status: 'unavailable',
      note: u.fetchNote,
    });
  } else {
    notes.push({ label: 'Product link', status: 'missing', note: 'No link provided.' });
  }

  notes.push(
    req.product.price
      ? { label: 'Price', status: 'used', note: 'Entered by you; not verified with the retailer.' }
      : { label: 'Price', status: 'missing', note: 'Not provided, so budget fit was excluded from the score.' },
    photoUsedByAi
      ? {
          label: `Vision model (${prov?.modelId})`,
          status: 'used',
          note: 'Used only to extract visual attributes. Smart Buy Score was calculated deterministically by the Wardrobe Match Engine.',
        }
      : {
          label: 'AI model',
          status: 'unavailable',
          note: visionErrorNote
            ? `Not connected (${visionErrorNote}). Scored using documented wardrobe rules without external AI spend.`
            : 'Not connected (Zero-Spend Default). Every finding comes from documented rules you can inspect below.',
        },
  );
  return notes;
}
