/**
 * Upstream Gemini 2.5 Flash Vision Client.
 *
 * NON-NEGOTIABLE SECURITY REQUIREMENTS:
 * - API key is never logged, echoed, or included in outgoing client responses.
 * - Timeouts are strictly enforced (8 seconds max).
 * - Upstream model responses are validated through strict runtime schema validation.
 * - In test mode, no network calls are ever made.
 */

import {
  EXTRACTION_SYSTEM_PROMPT,
  validateGarmentExtraction,
  type GarmentVisionExtraction,
} from './schema';

export interface GeminiVisionCallParams {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  isTestMock?: boolean;
}

export interface GeminiVisionResult {
  ok: boolean;
  extraction?: GarmentVisionExtraction;
  error?: string;
  status: number;
  droppedValues?: string[];
}

export async function callGeminiVision(
  params: GeminiVisionCallParams,
): Promise<GeminiVisionResult> {
  const { apiKey, imageBase64, mimeType, model, timeoutMs, isTestMock } = params;
  const fetchImpl = params.fetchImpl ?? fetch;

  // Local test mode: bypass network call entirely
  if (isTestMock) {
    return {
      ok: true,
      status: 200,
      extraction: {
        schemaVersion: '1.0',
        modelId: model,
        isGarment: true,
        imageQuality: 'clear',
        category: { value: 'outerwear', confidence: 0.92 },
        colors: { value: ['rust'], confidence: 0.88 },
        seasons: { value: ['spring', 'autumn'], confidence: 0.82 },
        occasions: { value: ['casual', 'weekend'], confidence: 0.78 },
        suggestedName: { value: 'Rust suede overshirt', confidence: 0.85 },
        ambiguityNotes: [],
      },
      droppedValues: [],
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: EXTRACTION_SYSTEM_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Redact: do NOT reflect upstream endpoint, query params, or API key
      const status = res.status;
      return {
        ok: false,
        status: status >= 500 ? 502 : 400,
        error: `Vision model provider returned error (HTTP ${status}).`,
      };
    }

    const json: any = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof rawText !== 'string' || !rawText.trim()) {
      return {
        ok: false,
        status: 502,
        error: 'Vision model returned an empty or malformed completion structure.',
      };
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        status: 502,
        error: 'Vision model output was not valid JSON.',
      };
    }

    // Inject modelId if not set by prompt
    if (typeof parsedPayload === 'object' && parsedPayload !== null && !('modelId' in parsedPayload)) {
      (parsedPayload as any).modelId = model;
    }

    const validation = validateGarmentExtraction(parsedPayload);
    if (!validation.ok || !validation.data) {
      return {
        ok: false,
        status: 502,
        error: `Structured validation failed: ${validation.error || 'Unknown schema error'}`,
      };
    }

    return {
      ok: true,
      status: 200,
      extraction: validation.data,
      droppedValues: validation.droppedValues,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      error: isAbort
        ? `Vision analysis timed out after ${timeoutMs}ms.`
        : 'Network communication with vision provider failed.',
    };
  } finally {
    clearTimeout(timer);
  }
}
