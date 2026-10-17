import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config';
import { InMemoryBudgetStore } from '../src/budget';
import { AbuseGuard } from '../src/abuseGuard';
import { handleExtractGarmentRequest } from '../src/handler';

function createMockImageFormData(sizeBytes: number, mimeType = 'image/jpeg'): FormData {
  const form = new FormData();
  const bytes = new Uint8Array(sizeBytes);
  const blob = new Blob([bytes], { type: mimeType });
  form.append('image', blob, 'test.jpg');
  return form;
}

function createRequest(
  method: string,
  url = 'http://localhost/api/v1/vision/extract-garment',
  body?: FormData | null,
  headers: Record<string, string> = {},
): Request {
  const reqInit: RequestInit = {
    method,
    headers: { ...headers },
  };
  if (body) {
    reqInit.body = body;
  }
  return new Request(url, reqInit);
}

describe('PalettePilot Server-Side Vision Proxy: Operational Controls & Spend Safeguards', () => {
  let env: Env;
  let budgetStore: InMemoryBudgetStore;
  let abuseGuard: AbuseGuard;

  beforeEach(() => {
    env = {
      GEMINI_API_KEY: 'test-secret-key-12345',
      ENABLE_EXTERNAL_AI: 'false', // strictly disabled by default
      GLOBAL_KILL_SWITCH: 'false',
      MAX_DAILY_REQUESTS: '5',
      MAX_LIFETIME_REQUESTS: '10',
      TEST_MOCK_PROVIDER: 'true',
    };
    budgetStore = new InMemoryBudgetStore();
    abuseGuard = new AbuseGuard(10);
  });

  it('rejects extraction requests with HTTP 403 when ENABLE_EXTERNAL_AI is false (disabled by default)', async () => {
    const form = createMockImageFormData(1024);
    const req = createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form);

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(403);

    const json: any = await res.json();
    expect(json.error).toBe('EXTERNAL_AI_DISABLED');
    expect(json.message).toContain('DISABLED by default');
  });

  it('immediately halts all requests with HTTP 503 when GLOBAL_KILL_SWITCH is true', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.GLOBAL_KILL_SWITCH = 'true';

    const form = createMockImageFormData(1024);
    const req = createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form);

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(503);

    const json: any = await res.json();
    expect(json.error).toBe('KILL_SWITCH_ACTIVE');
  });

  it('fails closed with HTTP 503 if GEMINI_API_KEY secret is unconfigured', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.GEMINI_API_KEY = '';
    env.TEST_MOCK_PROVIDER = 'false'; // test real config evaluation

    const form = createMockImageFormData(1024);
    const req = createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form);

    const res = await handleExtractGarmentRequest(req, env, budgetStore, abuseGuard);
    expect(res.status).toBe(503);

    const json: any = await res.json();
    expect(json.error).toBe('API_KEY_UNCONFIGURED');
    expect(json.message).not.toContain('test-secret-key');
  });

  it('rejects oversized payloads (> 4 MB) with HTTP 413 before upstream processing', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    const fiveMb = 5 * 1024 * 1024;
    const form = createMockImageFormData(fiveMb);
    const req = createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form);

    const res = await handleExtractGarmentRequest(req, env, budgetStore, abuseGuard);
    expect(res.status).toBe(413);

    const json: any = await res.json();
    expect(json.error).toBe('PAYLOAD_REJECTED');
    expect(json.message).toContain('exceeds the maximum allowed limit');

    // Verify budget quota was NOT consumed for rejected payload
    const usage = await budgetStore.getUsage('2026-10-17');
    expect(usage.dailyCount).toBe(0);
  });

  it('rejects unsupported image MIME types with HTTP 400', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    const form = createMockImageFormData(1024, 'application/pdf');
    const req = createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form);

    const res = await handleExtractGarmentRequest(req, env, budgetStore, abuseGuard);
    expect(res.status).toBe(400);

    const json: any = await res.json();
    expect(json.error).toBe('PAYLOAD_REJECTED');
    expect(json.message).toContain('Only JPEG, PNG, and WebP images are accepted');
  });

  it('enforces atomic daily budget and halts with HTTP 429 once daily quota is exhausted', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.MAX_DAILY_REQUESTS = '2';

    // Call 1: succeeds
    const form1 = createMockImageFormData(1024);
    const res1 = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form1),
      env,
      budgetStore,
      abuseGuard,
    );
    expect(res1.status).toBe(200);

    // Call 2: succeeds
    const form2 = createMockImageFormData(1024);
    const res2 = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form2),
      env,
      budgetStore,
      abuseGuard,
    );
    expect(res2.status).toBe(200);

    // Call 3: quota exhausted -> HTTP 429
    const form3 = createMockImageFormData(1024);
    const res3 = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form3),
      env,
      budgetStore,
      abuseGuard,
    );
    expect(res3.status).toBe(429);

    const json3: any = await res3.json();
    expect(json3.error).toBe('QUOTA_EXHAUSTED');
    expect(json3.message).toContain('Daily free-tier request limit reached');
  });

  it('enforces lifetime budget limit and halts with HTTP 429 once lifetime quota is reached', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.MAX_DAILY_REQUESTS = '100';
    env.MAX_LIFETIME_REQUESTS = '2';

    // 2 successful calls consume the lifetime quota
    for (let i = 0; i < 2; i++) {
      const res = await handleExtractGarmentRequest(
        createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
        env,
        budgetStore,
        abuseGuard,
      );
      expect(res.status).toBe(200);
    }

    // 3rd call is blocked by lifetime budget
    const res3 = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
      env,
      budgetStore,
      abuseGuard,
    );
    expect(res3.status).toBe(429);
    const json: any = await res3.json();
    expect(json.message).toContain('Lifetime prototype budget limit reached');
  });

  it('counts failed upstream attempts toward the budget and does not refund them', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.TEST_MOCK_PROVIDER = 'false';
    env.MAX_DAILY_REQUESTS = '2';

    // Mock an upstream provider 500 error
    const mockFailingFetch = vi.fn(async () => new Response('Internal Server Error', { status: 500 }));

    const res1 = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
      env,
      budgetStore,
      abuseGuard,
      mockFailingFetch as unknown as typeof fetch,
    );
    expect(res1.status).toBe(502);

    // Verify 1 attempt was permanently committed to the budget despite failure
    const today = new Date().toISOString().slice(0, 10);
    const usage = await budgetStore.getUsage(today);
    expect(usage.dailyCount).toBe(1);
    expect(usage.lifetimeCount).toBe(1);
  });

  it('never leaks the API key secret in error messages or response bodies', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.TEST_MOCK_PROVIDER = 'false';
    env.GEMINI_API_KEY = 'super-secret-production-key-999';

    const mockFailingFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Invalid key: super-secret-production-key-999' }), { status: 400 }),
    );

    const res = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
      env,
      budgetStore,
      abuseGuard,
      mockFailingFetch as unknown as typeof fetch,
    );

    const text = await res.text();
    expect(text).not.toContain('super-secret-production-key-999');
    expect(res.status).toBe(400);
  });

  it('handles malformed upstream model JSON with HTTP 502 without crashing', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.TEST_MOCK_PROVIDER = 'false';

    const mockMalformedFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{not-valid-json' }] } }],
        }),
        { status: 200 },
      ),
    );

    const res = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
      env,
      budgetStore,
      abuseGuard,
      mockMalformedFetch as unknown as typeof fetch,
    );
    expect(res.status).toBe(502);
    const json: any = await res.json();
    expect(json.message).toContain('not valid JSON');
  });

  it('handles upstream timeouts with HTTP 504 and safe diagnostic message', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.TEST_MOCK_PROVIDER = 'false';

    const mockTimeoutFetch = vi.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    const res = await handleExtractGarmentRequest(
      createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
      env,
      budgetStore,
      abuseGuard,
      mockTimeoutFetch as unknown as typeof fetch,
    );
    expect(res.status).toBe(504);
    const json: any = await res.json();
    expect(json.message).toContain('timed out');
  });

  it('health check endpoint reports status and operational flags without revealing secrets', async () => {
    const req = createRequest('GET', 'http://localhost/api/v1/health');
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.service).toBe('palettepilot-vision-proxy');
    expect(json.enableExternalAi).toBe(false);
    expect(json.hasApiKey).toBe(true);
    expect(JSON.stringify(json)).not.toContain('test-secret-key-12345');
  });

  it('guarantees zero overspend under high concurrency (30 parallel requests with 5 quota slots)', async () => {
    env.ENABLE_EXTERNAL_AI = 'true';
    env.MAX_DAILY_REQUESTS = '5';
    env.MAX_LIFETIME_REQUESTS = '100';

    // Fire 30 concurrent asynchronous requests simultaneously
    const requests = Array.from({ length: 30 }, () =>
      handleExtractGarmentRequest(
        createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', createMockImageFormData(1024)),
        env,
        budgetStore,
        abuseGuard,
      ),
    );

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.status === 200).length;
    const quotaExhaustedCount = responses.filter((r) => r.status === 429).length;

    // Strict invariant: EXACTLY 5 succeed, and EXACTLY 25 are rejected with 429
    expect(successCount).toBe(5);
    expect(quotaExhaustedCount).toBe(25);

    const today = new Date().toISOString().slice(0, 10);
    const usage = await budgetStore.getUsage(today);
    expect(usage.dailyCount).toBe(5);
    expect(usage.lifetimeCount).toBe(5);
  });

  it('enforces IP rate limiting on burst requests from the same IP', async () => {
    const freshAbuseGuard = new AbuseGuard(3); // 3 requests per minute
    const ip = '198.51.100.42';

    expect(freshAbuseGuard.checkIpRateLimit(ip).allowed).toBe(true);
    expect(freshAbuseGuard.checkIpRateLimit(ip).allowed).toBe(true);
    expect(freshAbuseGuard.checkIpRateLimit(ip).allowed).toBe(true);

    const fourth = freshAbuseGuard.checkIpRateLimit(ip);
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toContain('maximum 3 requests per minute per IP');
  });

  it('fails closed with HTTP 503 if BUDGET_COORDINATOR is not bound in production mode', async () => {
    const prodEnv: Env = {
      GEMINI_API_KEY: 'valid-test-key',
      ENABLE_EXTERNAL_AI: 'true',
      GLOBAL_KILL_SWITCH: 'false',
      TEST_MOCK_PROVIDER: 'false', // non-test production mode
      // BUDGET_COORDINATOR deliberately omitted
    };

    const form = createMockImageFormData(1024);
    const req = createRequest('POST', 'http://localhost/api/v1/vision/extract-garment', form);

    const res = await worker.fetch(req, prodEnv);
    expect(res.status).toBe(503);

    const json: any = await res.json();
    expect(json.error).toBe('BUDGET_COORDINATOR_UNAVAILABLE');
    expect(json.message).toContain('fails closed to prevent unapproved spending');
  });
});

