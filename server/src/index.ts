/**
 * PalettePilot Vision Proxy - Cloudflare Worker Entrypoint.
 *
 * This worker acts as a secure, zero-unapproved-spend proxy between the PalettePilot
 * client and Google Gemini 2.5 Flash Vision.
 *
 * It keeps API keys strictly server-side, applies atomic durable budgets,
 * validates payload sizes (<= 4MB), enforces strict model allowlisting,
 * and fails closed when quotas or configurations are unverified.
 */

import { AbuseGuard } from './abuseGuard';
import {
  AtomicInMemoryBudgetStore,
  DurableObjectBudgetStore,
  type ServerBudgetStore,
} from './budget';
import { BudgetCoordinatorDO } from './budgetCoordinator';
import type { Env } from './config';
import { handleExtractGarmentRequest } from './handler';

export { BudgetCoordinatorDO };

const abuseGuard = new AbuseGuard(5); // Max 5 requests/minute per IP (best-effort instance-level throttling)
const inMemoryFallbackBudget = new AtomicInMemoryBudgetStore();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || '*';
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Health check endpoint (for monitoring and deployment checks)
    if (url.pathname === '/api/v1/health' && request.method === 'GET') {
      const enableExternalAi = env.ENABLE_EXTERNAL_AI === 'true';
      const globalKillSwitch = env.GLOBAL_KILL_SWITCH === 'true';
      const hasApiKey = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
      const hasBudgetCoordinator = Boolean(
        env.BUDGET_COORDINATOR && typeof env.BUDGET_COORDINATOR.idFromName === 'function',
      );

      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'palettepilot-vision-proxy',
          enableExternalAi,
          globalKillSwitch,
          hasApiKey,
          hasBudgetCoordinator,
          model: 'gemini-2.5-flash',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Vision Extraction Endpoint
    if (url.pathname === '/api/v1/vision/extract-garment') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are supported.' }),
          { status: 405, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Authoritative atomic budget coordinator deployment guard:
      // In production (non-test), an authoritative Durable Object MUST be bound.
      // If BUDGET_COORDINATOR is not bound, fail closed immediately to prevent unapproved spending.
      let budgetStore: ServerBudgetStore;
      if (env.BUDGET_COORDINATOR && typeof env.BUDGET_COORDINATOR.idFromName === 'function') {
        budgetStore = new DurableObjectBudgetStore(env.BUDGET_COORDINATOR);
      } else if (env.TEST_MOCK_PROVIDER === 'true') {
        budgetStore = inMemoryFallbackBudget;
      } else {
        return new Response(
          JSON.stringify({
            error: 'BUDGET_COORDINATOR_UNAVAILABLE',
            message:
              'Authoritative budget coordinator (Durable Object) is not bound on this server. The server fails closed to prevent unapproved spending. Local in-memory budgets are not permitted in production deployments.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return handleExtractGarmentRequest(request, env, budgetStore, abuseGuard);
    }

    // Unknown routes
    return new Response(
      JSON.stringify({ error: 'NOT_FOUND', message: 'The requested API route does not exist.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  },
};
