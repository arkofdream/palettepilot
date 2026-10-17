/**
 * Server-side configuration and operational controls for PalettePilot Vision Proxy.
 *
 * NON-NEGOTIABLE SPEND CONTROLS:
 * - External AI is DISABLED by default.
 * - Missing secrets, unknown pricing, or unverified limits cause the server to FAIL CLOSED.
 * - API keys must exist exclusively in server-side environment secrets.
 */

export interface Env {
  /**
   * Secret: Gemini API key.
   * MUST be configured via `wrangler secret put GEMINI_API_KEY`.
   * NEVER set in plaintext or exposed to frontend bundles.
   */
  GEMINI_API_KEY?: string;

  /**
   * Master operational toggle. Must be explicitly set to 'true' to allow external calls.
   * Default: 'false' (disabled).
   */
  ENABLE_EXTERNAL_AI?: string;

  /**
   * Emergency global kill switch. When 'true', unconditionally halts all external calls.
   * Default: 'false'.
   */
  GLOBAL_KILL_SWITCH?: string;

  /**
   * Hard daily attempt quota. Default: 20 attempts.
   */
  MAX_DAILY_REQUESTS?: string;

  /**
   * Hard lifetime attempt quota for this prototype deployment. Default: 100 attempts.
   */
  MAX_LIFETIME_REQUESTS?: string;

  /**
   * Comma-separated list of strictly permitted model IDs.
   * Default: 'gemini-2.5-flash'.
   */
  ALLOWED_MODELS?: string;

  /**
   * Comma-separated list of permitted CORS origins.
   * Example: 'http://localhost:5173,https://palettepilot.pages.dev'
   */
  ALLOWED_ORIGINS?: string;

  /**
   * Cloudflare KV namespace binding for durable budget tracking (deprecated for atomic reservations).
   */
  PALETTEPILOT_BUDGET_KV?: unknown;

  /**
   * Cloudflare Durable Object namespace binding for Authoritative Atomic Budget Coordinator.
   */
  BUDGET_COORDINATOR?: any;

  /**
   * Local automated test mode flag. When 'true', uses mocked upstream model responses.
   */
  TEST_MOCK_PROVIDER?: string;
}

export interface ParsedServerConfig {
  enableExternalAi: boolean;
  globalKillSwitch: boolean;
  maxDailyRequests: number;
  maxLifetimeRequests: number;
  allowedModels: string[];
  allowedOrigins: string[];
  requestTimeoutMs: number;
  maxPayloadBytes: number;
  isTestMockProvider: boolean;
  hasApiKey: boolean;
  apiKey: string;
}

export const DEFAULT_ALLOWED_MODELS = ['gemini-2.5-flash'];
export const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
export const SERVER_TIMEOUT_MS = 8_000; // 8 seconds hard server-side timeout

export function parseServerConfig(env: Env): ParsedServerConfig {
  const enableExternalAi = env.ENABLE_EXTERNAL_AI === 'true';
  const globalKillSwitch = env.GLOBAL_KILL_SWITCH === 'true';

  const maxDaily = parseInt(env.MAX_DAILY_REQUESTS || '20', 10);
  const maxDailyRequests = Number.isFinite(maxDaily) && maxDaily > 0 ? maxDaily : 20;

  const maxLifetime = parseInt(env.MAX_LIFETIME_REQUESTS || '100', 10);
  const maxLifetimeRequests = Number.isFinite(maxLifetime) && maxLifetime > 0 ? maxLifetime : 100;

  const allowedModels = env.ALLOWED_MODELS
    ? env.ALLOWED_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_MODELS;

  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['*'];

  const apiKey = (env.GEMINI_API_KEY || '').trim();
  const hasApiKey = apiKey.length > 0;

  const isTestMockProvider = env.TEST_MOCK_PROVIDER === 'true';

  return {
    enableExternalAi,
    globalKillSwitch,
    maxDailyRequests,
    maxLifetimeRequests,
    allowedModels: allowedModels.length > 0 ? allowedModels : DEFAULT_ALLOWED_MODELS,
    allowedOrigins,
    requestTimeoutMs: SERVER_TIMEOUT_MS,
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
    isTestMockProvider,
    hasApiKey,
    apiKey,
  };
}
