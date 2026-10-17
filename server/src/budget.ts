/**
 * Server-Enforced Durable Budget and Spend Protection.
 *
 * CRITICAL ARCHITECTURAL FINDING:
 * Cloudflare KV is an eventually consistent key-value store with read-modify-write race conditions.
 * It does NOT guarantee atomic concurrent reservation. Concurrent requests can read stale counters
 * simultaneously and breach quotas.
 *
 * AUTHORITATIVE REPLACEMENT:
 * Cloudflare Durable Objects provide a single-threaded global actor with strongly consistent
 * embedded storage. `DurableObjectBudgetStore` coordinates all Worker instances worldwide.
 */

export interface BudgetReservation {
  allowed: boolean;
  reason?: string;
  dailyRemaining: number;
  lifetimeRemaining: number;
  dailyCount: number;
  lifetimeCount: number;
}

export interface BudgetLimits {
  maxDaily: number;
  maxLifetime: number;
}

export interface ServerBudgetStore {
  reserveAttempt(todayDateKey: string, limits: BudgetLimits): Promise<BudgetReservation>;
  getUsage(todayDateKey: string): Promise<{ dailyCount: number; lifetimeCount: number }>;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): DurableObjectStub;
}

/**
 * Production-ready atomic store that delegates reservations to the Cloudflare Durable Object singleton.
 * All requests across every global Cloudflare edge node are serialized by the single DO instance.
 */
export class DurableObjectBudgetStore implements ServerBudgetStore {
  constructor(private doNamespace: DurableObjectNamespace) {}

  async reserveAttempt(todayDateKey: string, limits: BudgetLimits): Promise<BudgetReservation> {
    try {
      const id = this.doNamespace.idFromName('global-spend-budget');
      const stub = this.doNamespace.get(id);

      const res = await stub.fetch(
        new Request('https://do-budget/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ todayKey: todayDateKey, limits }),
        }),
      );

      if (!res.ok) {
        return {
          allowed: false,
          reason: `Durable Object budget coordinator returned HTTP ${res.status}. Failed closed.`,
          dailyRemaining: 0,
          lifetimeRemaining: 0,
          dailyCount: 0,
          lifetimeCount: 0,
        };
      }

      return (await res.json()) as BudgetReservation;
    } catch {
      // Fail closed: if the Durable Object is unreachable or throws, halt immediately
      return {
        allowed: false,
        reason: 'Authoritative budget coordinator unreachable. Failed closed to prevent unapproved spend.',
        dailyRemaining: 0,
        lifetimeRemaining: 0,
        dailyCount: 0,
        lifetimeCount: 0,
      };
    }
  }

  async getUsage(todayDateKey: string): Promise<{ dailyCount: number; lifetimeCount: number }> {
    try {
      const id = this.doNamespace.idFromName('global-spend-budget');
      const stub = this.doNamespace.get(id);
      const res = await stub.fetch(
        new Request(`https://do-budget/usage?todayKey=${encodeURIComponent(todayDateKey)}`),
      );
      if (!res.ok) return { dailyCount: 0, lifetimeCount: 0 };
      return (await res.json()) as { dailyCount: number; lifetimeCount: number };
    } catch {
      return { dailyCount: 0, lifetimeCount: 0 };
    }
  }
}

/**
 * Thread-safe Atomic In-Memory Budget Store for local tests and development.
 * Uses a promise queue mutex to serialize concurrent asynchronous reservations,
 * reproducing the exact single-threaded transactional behavior of a Durable Object.
 */
export class AtomicInMemoryBudgetStore implements ServerBudgetStore {
  private dailyCounts = new Map<string, number>();
  private lifetimeCount = 0;
  private shouldFail = false;
  private mutexQueue: Promise<void> = Promise.resolve();

  setSimulateStorageFailure(fail: boolean): void {
    this.shouldFail = fail;
  }

  async reserveAttempt(todayDateKey: string, limits: BudgetLimits): Promise<BudgetReservation> {
    // Chain onto mutex to guarantee strict serial execution under high async concurrency
    return new Promise<BudgetReservation>((resolve) => {
      this.mutexQueue = this.mutexQueue.then(async () => {
        if (this.shouldFail) {
          resolve({
            allowed: false,
            reason: 'Budget storage error: failed closed.',
            dailyRemaining: 0,
            lifetimeRemaining: 0,
            dailyCount: 0,
            lifetimeCount: 0,
          });
          return;
        }

        const currentDaily = this.dailyCounts.get(todayDateKey) ?? 0;
        const currentLifetime = this.lifetimeCount;

        if (currentLifetime >= limits.maxLifetime) {
          resolve({
            allowed: false,
            reason: `Lifetime prototype budget limit reached (${limits.maxLifetime} attempts max).`,
            dailyRemaining: Math.max(0, limits.maxDaily - currentDaily),
            lifetimeRemaining: 0,
            dailyCount: currentDaily,
            lifetimeCount: currentLifetime,
          });
          return;
        }

        if (currentDaily >= limits.maxDaily) {
          resolve({
            allowed: false,
            reason: `Daily free-tier request limit reached (${limits.maxDaily} attempts/day). Processing paused until tomorrow.`,
            dailyRemaining: 0,
            lifetimeRemaining: Math.max(0, limits.maxLifetime - currentLifetime),
            dailyCount: currentDaily,
            lifetimeCount: currentLifetime,
          });
          return;
        }

        const nextDaily = currentDaily + 1;
        const nextLifetime = currentLifetime + 1;

        this.dailyCounts.set(todayDateKey, nextDaily);
        this.lifetimeCount = nextLifetime;

        resolve({
          allowed: true,
          dailyRemaining: limits.maxDaily - nextDaily,
          lifetimeRemaining: limits.maxLifetime - nextLifetime,
          dailyCount: nextDaily,
          lifetimeCount: nextLifetime,
        });
      });
    });
  }

  async getUsage(todayDateKey: string): Promise<{ dailyCount: number; lifetimeCount: number }> {
    return {
      dailyCount: this.dailyCounts.get(todayDateKey) ?? 0,
      lifetimeCount: this.lifetimeCount,
    };
  }
}

// Keep InMemoryBudgetStore as alias for test backwards compatibility
export const InMemoryBudgetStore = AtomicInMemoryBudgetStore;

/**
 * @deprecated VULNERABLE TO CONCURRENT OVERSPEND.
 * Cloudflare KV is eventually consistent and lacks atomic transactions.
 * Retained strictly for documentation of why KV must NOT be used for budget enforcement.
 */
export interface MinimalKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export class DeprecatedKvBudgetStore implements ServerBudgetStore {
  constructor(private kv: MinimalKV) {}

  async reserveAttempt(todayDateKey: string, limits: BudgetLimits): Promise<BudgetReservation> {
    // VULNERABLE: Read-Modify-Write over eventually consistent KV
    const dailyKey = `palettepilot:budget:daily:${todayDateKey}`;
    const lifetimeKey = 'palettepilot:budget:lifetime';

    const [rawDaily, rawLifetime] = await Promise.all([
      this.kv.get(dailyKey),
      this.kv.get(lifetimeKey),
    ]);

    const currentDaily = rawDaily ? parseInt(rawDaily, 10) || 0 : 0;
    const currentLifetime = rawLifetime ? parseInt(rawLifetime, 10) || 0 : 0;

    if (currentLifetime >= limits.maxLifetime || currentDaily >= limits.maxDaily) {
      return {
        allowed: false,
        reason: 'Quota reached.',
        dailyRemaining: 0,
        lifetimeRemaining: 0,
        dailyCount: currentDaily,
        lifetimeCount: currentLifetime,
      };
    }

    const nextDaily = currentDaily + 1;
    const nextLifetime = currentLifetime + 1;

    await Promise.all([
      this.kv.put(dailyKey, String(nextDaily)),
      this.kv.put(lifetimeKey, String(nextLifetime)),
    ]);

    return {
      allowed: true,
      dailyRemaining: limits.maxDaily - nextDaily,
      lifetimeRemaining: limits.maxLifetime - nextLifetime,
      dailyCount: nextDaily,
      lifetimeCount: nextLifetime,
    };
  }

  async getUsage(todayDateKey: string): Promise<{ dailyCount: number; lifetimeCount: number }> {
    return { dailyCount: 0, lifetimeCount: 0 };
  }
}
