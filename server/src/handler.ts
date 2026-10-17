/**
 * Main Request Handler for POST /api/v1/vision/extract-garment.
 *
 * Enforces all zero-unapproved-spend guarantees on the server side:
 * 1. Global kill switch check
 * 2. Disabled-by-default check
 * 3. Secret availability check
 * 4. Abuse & IP rate limit check
 * 5. Strict payload size (<= 4MB) and MIME validation
 * 6. Atomic budget reservation before upstream call
 * 7. Upstream execution with timeout and secret redaction
 */

import { AbuseGuard } from './abuseGuard';
import type { ServerBudgetStore } from './budget';
import { parseServerConfig, type Env } from './config';
import { callGeminiVision } from './gemini';

function jsonResponse(body: Record<string, unknown>, status = 200, origin = '*'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function getTodayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleExtractGarmentRequest(
  request: Request,
  env: Env,
  budgetStore: ServerBudgetStore,
  abuseGuard: AbuseGuard,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const config = parseServerConfig(env);
  const clientOrigin = request.headers.get('Origin') || '*';
  const effectiveOrigin = config.allowedOrigins.includes(clientOrigin) || config.allowedOrigins.includes('*')
    ? clientOrigin
    : 'null';

  // 1. Emergency Global Kill Switch
  if (config.globalKillSwitch) {
    return jsonResponse(
      {
        error: 'KILL_SWITCH_ACTIVE',
        message: 'Global Kill Switch is ACTIVE. All server-side external AI processing is halted.',
      },
      503,
      effectiveOrigin,
    );
  }

  // 2. Disabled by Default Policy
  if (!config.enableExternalAi) {
    return jsonResponse(
      {
        error: 'EXTERNAL_AI_DISABLED',
        message:
          'External AI vision processing is DISABLED by default (Zero-Spend Architecture). Set ENABLE_EXTERNAL_AI=true on the server to enable.',
      },
      403,
      effectiveOrigin,
    );
  }

  // 3. Secret Availability Check (Fail Closed)
  if (!config.hasApiKey && !config.isTestMockProvider) {
    return jsonResponse(
      {
        error: 'API_KEY_UNCONFIGURED',
        message: 'Vision provider secret (GEMINI_API_KEY) is not configured on this server.',
      },
      503,
      effectiveOrigin,
    );
  }

  // 4. IP Rate Limit & Origin Check
  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    '127.0.0.1';

  const ipCheck = abuseGuard.checkIpRateLimit(clientIp);
  if (!ipCheck.allowed) {
    return jsonResponse(
      {
        error: 'RATE_LIMIT_EXCEEDED',
        message: ipCheck.reason || 'Too many requests from this IP.',
      },
      429,
      effectiveOrigin,
    );
  }

  // 5. Payload extraction & validation
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse(
      {
        error: 'INVALID_CONTENT_TYPE',
        message: 'Request must be multipart/form-data with an "image" field.',
      },
      400,
      effectiveOrigin,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(
      {
        error: 'MALFORMED_FORM_DATA',
        message: 'Could not parse multipart form data.',
      },
      400,
      effectiveOrigin,
    );
  }

  const file = formData.get('image');
  if (!file || typeof file === 'string' || !(file instanceof Blob)) {
    return jsonResponse(
      {
        error: 'MISSING_IMAGE',
        message: 'Form data must include an "image" file.',
      },
      400,
      effectiveOrigin,
    );
  }

  const payloadCheck = abuseGuard.validatePayload(file.size, file.type);
  if (!payloadCheck.valid) {
    return jsonResponse(
      {
        error: 'PAYLOAD_REJECTED',
        message: payloadCheck.error || 'Invalid image payload.',
      },
      payloadCheck.status || 400,
      effectiveOrigin,
    );
  }

  // 6. Server-Enforced Atomic Budget Reservation
  const todayKey = getTodayUtcString();
  const reservation = await budgetStore.reserveAttempt(todayKey, {
    maxDaily: config.maxDailyRequests,
    maxLifetime: config.maxLifetimeRequests,
  });

  if (!reservation.allowed) {
    return jsonResponse(
      {
        error: 'QUOTA_EXHAUSTED',
        message: reservation.reason || 'Budget quota reached. Requests halted to prevent billing.',
        dailyRemaining: reservation.dailyRemaining,
        lifetimeRemaining: reservation.lifetimeRemaining,
      },
      429,
      effectiveOrigin,
    );
  }

  // 7. Convert blob to Base64
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  const imageBase64 = btoa(binaryString);

  // 8. Call Upstream Provider (with timeout and model allowlist check)
  const selectedModel = config.allowedModels[0] || 'gemini-2.5-flash';
  const callOutcome = await callGeminiVision({
    apiKey: config.apiKey,
    imageBase64,
    mimeType: file.type,
    model: selectedModel,
    timeoutMs: config.requestTimeoutMs,
    fetchImpl,
    isTestMock: config.isTestMockProvider,
  });

  if (!callOutcome.ok || !callOutcome.extraction) {
    return jsonResponse(
      {
        error: 'UPSTREAM_VISION_FAILED',
        message: callOutcome.error || 'Vision analysis failed.',
        dailyRemaining: reservation.dailyRemaining,
        lifetimeRemaining: reservation.lifetimeRemaining,
      },
      callOutcome.status || 502,
      effectiveOrigin,
    );
  }

  // 9. Successful Response: returns validated extraction
  return jsonResponse(
    {
      ...callOutcome.extraction,
      droppedValues: callOutcome.droppedValues || [],
      quota: {
        dailyRemaining: reservation.dailyRemaining,
        lifetimeRemaining: reservation.lifetimeRemaining,
      },
    },
    200,
    effectiveOrigin,
  );
}
