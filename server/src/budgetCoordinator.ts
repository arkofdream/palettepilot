/**
 * Cloudflare Durable Object: Authoritative Budget Coordinator.
 *
 * WHY A DURABLE OBJECT IS REQUIRED INSTEAD OF CLOUDFLARE KV:
 * Cloudflare KV is an eventually consistent key-value store with no atomic increment or
 * compare-and-swap primitive. Concurrent requests arriving at edge nodes can read stale
 * counters simultaneously, causing race conditions that blow past daily/lifetime budgets.
 *
 * In contrast, a Cloudflare Durable Object (DO) guarantees:
 * 1. Global uniqueness: Exactly ONE instance exists globally for a given ID.
 * 2. Single-threaded execution: Requests are serialized in an event loop; no two reservations
 *    can execute concurrently.
 * 3. Strong consistency: Reads and writes to `state.storage` are immediately consistent and transactional.
 *
 * FREE-TIER LIMITS (Cloudflare Workers Free Plan):
 * - 1,000,000 requests / month
 * - 400,000 GB-seconds / month
 * - 1 GB storage
 * For a prototype budget of 20 daily / 100 lifetime calls, usage stays < 0.01% of free limits.
 */

import type { BudgetLimits, BudgetReservation } from './budget';

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list?<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}

export class BudgetCoordinatorDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/reserve' && request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          todayKey: string;
          limits: BudgetLimits;
        };

        if (!body || !body.todayKey || !body.limits) {
          return new Response(JSON.stringify({ error: 'INVALID_RESERVATION_PAYLOAD' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const reservation = await this.reserve(body.todayKey, body.limits);
        return new Response(JSON.stringify(reservation), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: 'Durable Object internal storage error. Failed closed.',
            dailyRemaining: 0,
            lifetimeRemaining: 0,
            dailyCount: 0,
            lifetimeCount: 0,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (url.pathname === '/usage' && request.method === 'GET') {
      const todayKey = url.searchParams.get('todayKey') || new Date().toISOString().slice(0, 10);
      const usage = await this.getUsage(todayKey);
      return new Response(JSON.stringify(usage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async reserve(todayKey: string, limits: BudgetLimits): Promise<BudgetReservation> {
    const dailyStorageKey = `daily:${todayKey}`;
    const lifetimeStorageKey = 'lifetime';

    // Strongly consistent read from DO embedded transactional storage
    const currentDaily = (await this.state.storage.get<number>(dailyStorageKey)) ?? 0;
    const currentLifetime = (await this.state.storage.get<number>(lifetimeStorageKey)) ?? 0;

    // Check lifetime limit
    if (currentLifetime >= limits.maxLifetime) {
      return {
        allowed: false,
        reason: `Lifetime prototype budget limit reached (${limits.maxLifetime} max).`,
        dailyRemaining: Math.max(0, limits.maxDaily - currentDaily),
        lifetimeRemaining: 0,
        dailyCount: currentDaily,
        lifetimeCount: currentLifetime,
      };
    }

    // Check daily limit
    if (currentDaily >= limits.maxDaily) {
      return {
        allowed: false,
        reason: `Daily free-tier request limit reached (${limits.maxDaily}/day). Processing paused until tomorrow.`,
        dailyRemaining: 0,
        lifetimeRemaining: Math.max(0, limits.maxLifetime - currentLifetime),
        dailyCount: currentDaily,
        lifetimeCount: currentLifetime,
      };
    }

    // Atomic increment
    const nextDaily = currentDaily + 1;
    const nextLifetime = currentLifetime + 1;

    await Promise.all([
      this.state.storage.put(dailyStorageKey, nextDaily),
      this.state.storage.put(lifetimeStorageKey, nextLifetime),
    ]);

    return {
      allowed: true,
      dailyRemaining: limits.maxDaily - nextDaily,
      lifetimeRemaining: limits.maxLifetime - nextLifetime,
      dailyCount: nextDaily,
      lifetimeCount: nextLifetime,
    };
  }

  private async getUsage(todayKey: string): Promise<{ dailyCount: number; lifetimeCount: number }> {
    const currentDaily = (await this.state.storage.get<number>(`daily:${todayKey}`)) ?? 0;
    const currentLifetime = (await this.state.storage.get<number>('lifetime')) ?? 0;
    return { dailyCount: currentDaily, lifetimeCount: currentLifetime };
  }
}
