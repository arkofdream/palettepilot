import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpVisionExtractor,
  MAX_VISION_PAYLOAD_BYTES,
  UnconfiguredVisionExtractor,
  handoffVisionToCandidate,
  validateVisionExtraction,
  type GarmentVisionExtraction,
} from './visionExtractor';
import { LocalRuleBasedProvider } from './analysisProvider';
import { evaluateCandidate } from './engine/scoring';
import { DEFAULT_SETTINGS } from './repositories';
import { buildSampleItems } from './sampleData';
import { spendGuard } from './spendGuard';

const now = new Date('2026-10-17T12:00:00Z');
const wardrobe = buildSampleItems(now);

const sampleExtraction: GarmentVisionExtraction = {
  schemaVersion: '1.0',
  modelId: 'gemini-2.5-flash-vision',
  isGarment: true,
  imageQuality: 'clear',
  category: { value: 'outerwear', confidence: 0.92, alternatives: ['top'] },
  colors: { value: ['rust'], confidence: 0.88 },
  seasons: { value: ['spring', 'autumn'], confidence: 0.81 },
  occasions: { value: ['casual', 'weekend'], confidence: 0.79 },
  suggestedName: { value: 'Rust suede overshirt', confidence: 0.84 },
  ambiguityNotes: [],
};

describe('Vision Extraction Schema Validation', () => {
  it('validates a well-formed vision response', () => {
    const res = validateVisionExtraction(sampleExtraction);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.category?.value).toBe('outerwear');
      expect(res.data.colors?.value).toEqual(['rust']);
      expect(res.droppedValues).toEqual([]);
    }
  });

  it('drops out-of-catalog enum values while keeping valid ones', () => {
    const raw = {
      ...sampleExtraction,
      colors: { value: ['neon-chartreuse', 'navy', 'camel', ' olive '], confidence: 0.85 },
      seasons: { value: ['monsoon', 'autumn'], confidence: 0.8 },
    };
    const res = validateVisionExtraction(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.colors?.value).toEqual(['navy', 'camel']);
      expect(res.data.seasons?.value).toEqual(['autumn']);
      expect(res.droppedValues).toContain('color:neon-chartreuse');
      expect(res.droppedValues).toContain('season:monsoon');
    }
  });

  it('rejects malformed responses and out-of-range confidences', () => {
    expect(validateVisionExtraction(null).ok).toBe(false);
    expect(validateVisionExtraction({ ...sampleExtraction, schemaVersion: '2.0' }).ok).toBe(false);
    expect(
      validateVisionExtraction({
        ...sampleExtraction,
        category: { value: 'top', confidence: 1.4 },
      }).ok,
    ).toBe(false);
    expect(
      validateVisionExtraction({
        ...sampleExtraction,
        imageQuality: 'blurry-unknown',
      }).ok,
    ).toBe(false);
  });
});

describe('Uncertain Predictions & Provenance Handoff', () => {
  it('Withholds low-confidence predictions (<0.50) and emits warnings for moderate confidence (0.50–0.75)', () => {
    const uncertainExtraction: GarmentVisionExtraction = {
      ...sampleExtraction,
      imageQuality: 'obscured',
      category: { value: 'dress', confidence: 0.42 }, // below 0.50 -> must not override base
      colors: { value: ['burgundy'], confidence: 0.62 }, // moderate -> applied with warning
      seasons: { value: ['autumn', 'winter'], confidence: 0.85 },
      occasions: { value: ['evening'], confidence: 0.35 }, // below 0.50 -> must not override base
      ambiguityNotes: ['Sleeve length partially cropped.'],
    };

    const handoff = handoffVisionToCandidate(
      {
        category: 'top',
        colors: ['black'],
        seasons: ['spring'],
        intendedUse: ['casual'],
      },
      uncertainExtraction,
      {}, // no user overrides
    );

    // Category & intendedUse stayed on fallback defaults because confidence < 0.50
    expect(handoff.candidate.category).toBe('top');
    expect(handoff.provenance.category).toBe('default');
    expect(handoff.candidate.intendedUse).toEqual(['casual']);
    expect(handoff.provenance.intendedUse).toBe('default');

    // Colors & seasons were applied as ai-inferred
    expect(handoff.candidate.colors).toEqual(['burgundy']);
    expect(handoff.provenance.colors).toBe('ai-inferred');
    expect(handoff.candidate.seasons).toEqual(['autumn', 'winter']);
    expect(handoff.provenance.seasons).toBe('ai-inferred');

    // Fabric composition is never fabricated
    expect(handoff.provenance.fabricComposition).toBe('unavailable');
    expect(handoff.lowConfidenceWarnings.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves user-entered attributes over AI predictions and records provenance', () => {
    const handoff = handoffVisionToCandidate(
      {
        name: 'Custom Overshirt',
        category: 'outerwear', // matches AI -> ai-user-confirmed
        colors: ['navy'], // differs from AI ('rust') -> user
        seasons: ['autumn'],
        intendedUse: ['work'],
        price: { amount: 150, currency: 'USD' },
        url: 'https://shop.example.com/item',
      },
      sampleExtraction,
      { name: true, category: true, colors: true },
    );

    expect(handoff.candidate.colors).toEqual(['navy']);
    expect(handoff.provenance.colors).toBe('user');
    expect(handoff.provenance.category).toBe('ai-user-confirmed');
    expect(handoff.provenance.seasons).toBe('ai-inferred');
    expect(handoff.provenance.price).toBe('user');
    expect(handoff.provenance.url).toBe('user-unverified');
  });
});

describe('HttpVisionExtractor Failure, Size Limit & Retry Handling', () => {
  beforeEach(() => {
    spendGuard.setExternalAiApproved(true);
    spendGuard.setGlobalKillSwitch(false);
    spendGuard.resetSessionUsage();
  });
  it('rejects images larger than MAX_VISION_PAYLOAD_BYTES without calling fetch', async () => {
    const fetchSpy = vi.fn();
    const extractor = new HttpVisionExtractor({
      endpoint: '/api/v1/vision/extract-garment',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const hugeBlob = new Blob([new Uint8Array(MAX_VISION_PAYLOAD_BYTES + 10)], {
      type: 'image/jpeg',
    });
    const res = await extractor.extract(hugeBlob);
    expect(res.status).toBe('error');
    if (res.status === 'error') expect(res.code).toBe('payload-too-large');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retries once on transient HTTP 503 and succeeds on second attempt', async () => {
    let calls = 0;
    const mockFetch = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify(sampleExtraction), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const extractor = new HttpVisionExtractor({
      endpoint: '/api/v1/vision/extract-garment',
      maxRetries: 1,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const outcome = await extractor.extract(new Blob(['img'], { type: 'image/jpeg' }));
    expect(calls).toBe(2);
    expect(outcome.status).toBe('ok');
  });

  it('flags non-garment images cleanly without crashing', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ...sampleExtraction,
          isGarment: false,
          imageQuality: 'non-garment',
          ambiguityNotes: ['Photo shows a coffee mug, not clothing.'],
        }),
        { status: 200 },
      ),
    );
    const extractor = new HttpVisionExtractor({
      endpoint: '/api/v1/vision/extract-garment',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const outcome = await extractor.extract(new Blob(['img'], { type: 'image/jpeg' }));
    expect(outcome.status).toBe('not-a-garment');
  });
});

describe('Handoff from Vision Extractor into Deterministic Scoring Engine', () => {
  beforeEach(() => {
    spendGuard.setExternalAiApproved(true);
    spendGuard.setGlobalKillSwitch(false);
    spendGuard.resetSessionUsage();
  });
  it('feeds validated AI attributes into evaluateCandidate without altering the deterministic score', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify(sampleExtraction), { status: 200 }),
    );
    const extractor = new HttpVisionExtractor({
      endpoint: '/api/v1/vision/extract-garment',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const provider = new LocalRuleBasedProvider(extractor);

    const analysis = await provider.analyze({
      product: {
        category: 'top', // placeholder before AI extraction
        colors: ['black'],
        seasons: ['summer'],
        intendedUse: ['casual'],
        price: { amount: 165, currency: 'USD' },
      },
      matchSource: { mode: 'all' },
      wardrobe,
      settings: DEFAULT_SETTINGS,
      hasImage: true,
      imageBlob: new Blob(['fake-image'], { type: 'image/jpeg' }),
      userEditedFields: {}, // allow AI extraction to populate attributes
    });

    // Compare against direct deterministic scoring of the extracted attributes
    const direct = evaluateCandidate(
      {
        name: 'Rust suede overshirt',
        category: 'outerwear',
        colors: ['rust'],
        seasons: ['spring', 'autumn'],
        intendedUse: ['casual', 'weekend'],
        price: { amount: 165, currency: 'USD' },
      },
      wardrobe,
      DEFAULT_SETTINGS,
    );

    expect(analysis.smartBuyScore).toBe(direct.smartBuyScore);
    expect(analysis.verdict).toBe(direct.verdict);
    expect(analysis.engine.usesAI).toBe(true);
    expect(analysis.product.provenance?.category).toBe('ai-inferred');
    expect(analysis.dataSources.find((d) => d.label === 'Product photo')?.status).toBe('used');
  });

  it('gracefully falls back to manual rule-based analysis when vision is unconfigured or fails', async () => {
    const provider = new LocalRuleBasedProvider(new UnconfiguredVisionExtractor());
    const analysis = await provider.analyze({
      product: {
        name: 'Manual Navy Knit',
        category: 'knitwear',
        colors: ['navy'],
        seasons: ['autumn', 'winter'],
        intendedUse: ['work', 'casual'],
      },
      matchSource: { mode: 'all' },
      wardrobe,
      settings: DEFAULT_SETTINGS,
      hasImage: true,
      imageBlob: new Blob(['fake-image'], { type: 'image/jpeg' }),
    });

    expect(analysis.engine.usesAI).toBe(false);
    expect(analysis.dataSources.find((d) => d.label === 'Product photo')?.status).toBe(
      'provided-not-analyzed',
    );
  });
});
