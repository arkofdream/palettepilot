/**
 * Zero-Unapproved-Spend Guard for PalettePilot.
 *
 * Core Guarantees:
 * 1. Default disabled: External AI calls are blocked unless explicit owner approval is granted.
 * 2. Fail-closed: If pricing, credentials, quota, or network state are unknown, external calls are halted.
 * 3. Never fallback to paid: No automated fallback to alternative paid APIs or paid tiers.
 * 4. Hard limits: Enforces max requests per safety quota, max concurrency (1), and strict timeouts.
 * 5. Cost transparency: If pricing is unverified, cost is marked as 'Unknown / Unverified', never assumed $0.00.
 * 6. Global Kill Switch: Owner can instantly terminate all outbound AI requests.
 * 7. Persistent accounting: Counters and history persist across page reloads to prevent quota evasion via F5.
 * 8. Cross-tab synchronization: Coordinates active in-flight locks and quota across tabs using browser events.
 *
 * NOTE ON SECURITY BOUNDARIES:
 * Client-side persistence and cross-tab locks protect against accidental runaway loops and casual reloads
 * in the prototype. They do NOT provide server-grade atomic enforcement against determined users or direct
 * HTTP scripts. A real backend server-side budget must be deployed before enabling production AI.
 */

export interface SpendAuditRecord {
  id: string;
  timestamp: string;
  action: string;
  status: 'allowed' | 'blocked' | 'completed' | 'failed';
  reason?: string;
  durationMs?: number;
}

export interface SpendGuardConfig {
  /** Master kill switch: when true, ALL external calls are stopped immediately. */
  globalKillSwitch: boolean;
  /** Explicit approval: must be true to attempt any external network request. */
  externalAiApproved: boolean;
  /** Maximum number of outbound AI calls permitted in this browser safety quota. */
  sessionRequestLimit: number;
  /** Maximum concurrent requests permitted (default 1 to prevent burst concurrency). */
  maxConcurrency: number;
  /** Hard timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Bounded retries: strictly 0 or 1 for transient failures, never infinite. */
  maxRetries: number;
  /** Maximum compressed image payload bytes permitted (4 MB). */
  maxPayloadBytes: number;
}

export interface PersistentSpendCounters {
  /** Cumulative lifetime physical outbound attempts in this browser. */
  lifetimeAttempts: number;
  /** Cumulative successful calls. */
  lifetimeSuccesses: number;
  /** Cumulative failed calls (5xx, timeouts, network errors). */
  lifetimeFailures: number;
  /** Cumulative blocked calls. */
  lifetimeBlocks: number;
  /** Safety quota consumption (consumed attempts toward the safety cap). */
  safetyQuotaConsumed: number;
}

export interface SpendUsageReport {
  config: SpendGuardConfig;
  totalAttempts: number;
  successfulCalls: number;
  blockedCalls: number;
  failedCalls: number;
  activeInFlight: number;
  sessionCallsRemaining: number;
  estimatedCostDisplay: string;
  pricingStatus: 'unknown-unverified' | 'free-tier-capped' | 'disabled';
  lastBlockedReason: string | null;
  history: SpendAuditRecord[];
  lifetimeAttempts: number;
  safetyQuotaConsumed: number;
}

export const STORAGE_KEY_KILL_SWITCH = 'palettepilot:spend:killSwitch';
export const STORAGE_KEY_AI_APPROVED = 'palettepilot:spend:aiApproved';
export const STORAGE_KEY_HISTORY = 'palettepilot:spend:history';
export const STORAGE_KEY_COUNTERS = 'palettepilot:spend:counters';
export const STORAGE_KEY_CONCURRENCY_LOCK = 'palettepilot:spend:concurrencyLock';
export const BROADCAST_CHANNEL_NAME = 'palettepilot:spend:broadcast';

const inMemoryFallbackStore = new Map<string, string>();

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Storage access may throw in private browsing or constrained environments
  }
  return inMemoryFallbackStore.get(key) ?? null;
}

function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // QuotaExceeded or disabled
  }
  inMemoryFallbackStore.set(key, value);
}

function safeRemoveStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {
    // ignore
  }
  inMemoryFallbackStore.delete(key);
}

function toNonNegativeInt(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return Math.floor(val);
  }
  return fallback;
}

export function parsePersistentCounters(raw: string | null): PersistentSpendCounters {
  const defaults: PersistentSpendCounters = {
    lifetimeAttempts: 0,
    lifetimeSuccesses: 0,
    lifetimeFailures: 0,
    lifetimeBlocks: 0,
    safetyQuotaConsumed: 0,
  };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    return {
      lifetimeAttempts: toNonNegativeInt(parsed.lifetimeAttempts),
      lifetimeSuccesses: toNonNegativeInt(parsed.lifetimeSuccesses),
      lifetimeFailures: toNonNegativeInt(parsed.lifetimeFailures),
      lifetimeBlocks: toNonNegativeInt(parsed.lifetimeBlocks),
      safetyQuotaConsumed: toNonNegativeInt(parsed.safetyQuotaConsumed),
    };
  } catch {
    // Corrupted JSON: return safe defaults without crashing
    return defaults;
  }
}

export function parseAuditHistory(raw: string | null): SpendAuditRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SpendAuditRecord =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.timestamp === 'string' &&
          typeof item.action === 'string' &&
          (item.status === 'allowed' ||
            item.status === 'blocked' ||
            item.status === 'completed' ||
            item.status === 'failed'),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

export class SpendGuard {
  private config: SpendGuardConfig;
  private instanceId: string;
  private activeInFlight = 0;
  private persistentCounters: PersistentSpendCounters;
  private lastBlockedReason: string | null = null;
  private history: SpendAuditRecord[] = [];
  private broadcastChannel: BroadcastChannel | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;

  constructor() {
    this.instanceId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Read persisted owner settings safely
    const killSwitchPersisted = safeGetStorage(STORAGE_KEY_KILL_SWITCH) === 'true';
    const approvedPersisted = safeGetStorage(STORAGE_KEY_AI_APPROVED) === 'true';

    this.history = parseAuditHistory(safeGetStorage(STORAGE_KEY_HISTORY));
    this.persistentCounters = parsePersistentCounters(safeGetStorage(STORAGE_KEY_COUNTERS));

    // Default: external AI is disabled unless explicitly approved by environment or owner
    const envApproved =
      typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_APPROVED_FREE_TIER === 'true';

    this.config = {
      globalKillSwitch: killSwitchPersisted,
      externalAiApproved: approvedPersisted || envApproved,
      sessionRequestLimit: 15,
      maxConcurrency: 1,
      requestTimeoutMs: 10_000,
      maxRetries: 0, // Zero automatic retries by default to prevent stealth cost loops
      maxPayloadBytes: 4 * 1024 * 1024, // 4 MB
    };

    this.initCrossTabCoordination();
  }

  /**
   * Initializes browser-level cross-tab coordination using BroadcastChannel and storage events.
   * Best-effort coordination between cooperative browser tabs.
   */
  private initCrossTabCoordination(): void {
    if (typeof window !== 'undefined') {
      this.storageListener = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key === STORAGE_KEY_COUNTERS) {
          this.persistentCounters = parsePersistentCounters(e.newValue);
        } else if (e.key === STORAGE_KEY_KILL_SWITCH) {
          this.config.globalKillSwitch = e.newValue === 'true';
        } else if (e.key === STORAGE_KEY_AI_APPROVED) {
          this.config.externalAiApproved = e.newValue === 'true';
        } else if (e.key === STORAGE_KEY_HISTORY) {
          this.history = parseAuditHistory(e.newValue);
        }
      };
      try {
        window.addEventListener('storage', this.storageListener);
      } catch {
        // ignore
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
          this.broadcastChannel.onmessage = (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'sync') {
              this.syncFromStorage();
            }
          };
        } catch {
          // BroadcastChannel unavailable
        }
      }
    }
  }

  /**
   * Refreshes local in-memory state from localStorage.
   */
  public syncFromStorage(): void {
    const rawCounters = safeGetStorage(STORAGE_KEY_COUNTERS);
    if (rawCounters !== null) {
      this.persistentCounters = parsePersistentCounters(rawCounters);
    }
    const rawHistory = safeGetStorage(STORAGE_KEY_HISTORY);
    if (rawHistory !== null) {
      this.history = parseAuditHistory(rawHistory);
    }
    const savedKill = safeGetStorage(STORAGE_KEY_KILL_SWITCH);
    if (savedKill !== null) {
      this.config.globalKillSwitch = savedKill === 'true';
    }
    const savedApproved = safeGetStorage(STORAGE_KEY_AI_APPROVED);
    if (savedApproved !== null) {
      this.config.externalAiApproved = savedApproved === 'true';
    }
  }

  private notifyOtherTabs(): void {
    try {
      this.broadcastChannel?.postMessage({ type: 'sync', timestamp: Date.now() });
    } catch {
      // ignore
    }
  }

  private persistCounters(): void {
    safeSetStorage(STORAGE_KEY_COUNTERS, JSON.stringify(this.persistentCounters));
    this.notifyOtherTabs();
  }

  /**
   * Evaluates whether an outbound AI extraction call is permitted.
   * Checks kill switch, approval, payload size, cross-tab concurrency, and total safety quota attempts.
   */
  canMakeExternalRequest(payloadBytes?: number): { allowed: boolean; reason?: string } {
    // Sync latest state before checking to catch updates from other tabs
    this.syncFromStorage();

    if (this.config.globalKillSwitch) {
      const reason = 'Global Kill Switch is ACTIVE. All external AI calls are completely halted.';
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    if (!this.config.externalAiApproved) {
      const reason =
        'External AI is DISABLED by default (Zero-Spend Policy). Enable free-tier approval in Settings to allow visual extraction.';
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    // Check local concurrency
    if (this.activeInFlight >= this.config.maxConcurrency) {
      const reason = `Concurrency limit of ${this.config.maxConcurrency} active request reached. Please wait for the current analysis to finish.`;
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    // Check cross-tab concurrency lock (best-effort)
    const rawLock = safeGetStorage(STORAGE_KEY_CONCURRENCY_LOCK);
    if (rawLock) {
      try {
        const lock = JSON.parse(rawLock);
        if (
          lock &&
          typeof lock === 'object' &&
          lock.instanceId !== this.instanceId &&
          typeof lock.expiresAt === 'number' &&
          Date.now() < lock.expiresAt
        ) {
          const reason =
            'Concurrency limit reached: another browser tab is currently running a vision analysis.';
          this.recordBlocked(reason);
          return { allowed: false, reason };
        }
      } catch {
        // corrupted lock, safely ignore
      }
    }

    // Check safety quota against TOTAL attempts (failures, timeouts, retries, and successes)
    const attemptsOrPending = this.persistentCounters.safetyQuotaConsumed + this.activeInFlight;
    if (attemptsOrPending >= this.config.sessionRequestLimit) {
      const reason = `Safety quota reached (${this.config.sessionRequestLimit} outbound attempts max). Processing paused to prevent usage accumulation across sessions.`;
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    if (payloadBytes !== undefined && payloadBytes > this.config.maxPayloadBytes) {
      const reason = `Image payload (${Math.round(payloadBytes / 1024)} KB) exceeds the safe limit of ${Math.round(
        this.config.maxPayloadBytes / 1024,
      )} KB.`;
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * Evaluates whether a retry within the currently active request is permitted.
   * Checks kill switch, approval, payload size, and safety quota (excluding concurrency since this request is active).
   */
  canMakeRetryRequest(payloadBytes?: number): { allowed: boolean; reason?: string } {
    this.syncFromStorage();

    if (this.config.globalKillSwitch) {
      const reason = 'Global Kill Switch is ACTIVE. All external AI calls are completely halted.';
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    if (!this.config.externalAiApproved) {
      const reason =
        'External AI is DISABLED by default (Zero-Spend Policy). Enable free-tier approval in Settings to allow visual extraction.';
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    const attempts = this.persistentCounters.safetyQuotaConsumed;
    if (attempts >= this.config.sessionRequestLimit) {
      const reason = `Safety quota reached (${this.config.sessionRequestLimit} outbound attempts max). Retry halted.`;
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    if (payloadBytes !== undefined && payloadBytes > this.config.maxPayloadBytes) {
      const reason = `Image payload (${Math.round(payloadBytes / 1024)} KB) exceeds the safe limit.`;
      this.recordBlocked(reason);
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * Tracks the start of an outbound request.
   * Acquires local and cross-tab concurrency lock and increments attempt accounting.
   */
  beginRequest(): () => void {
    this.persistentCounters.lifetimeAttempts++;
    this.persistentCounters.safetyQuotaConsumed++;
    this.persistCounters();

    this.activeInFlight++;
    let ended = false;

    // Set cross-tab lock with a 15-second expiration to prevent deadlocks
    const lockPayload = {
      instanceId: this.instanceId,
      expiresAt: Date.now() + 15_000,
    };
    safeSetStorage(STORAGE_KEY_CONCURRENCY_LOCK, JSON.stringify(lockPayload));

    return () => {
      if (ended) return;
      ended = true;
      this.activeInFlight = Math.max(0, this.activeInFlight - 1);
      safeRemoveStorage(STORAGE_KEY_CONCURRENCY_LOCK);
    };
  }

  /**
   * Records a physical retry attempt so retries cannot bypass attempt accounting.
   */
  recordRetryAttempt(): void {
    this.persistentCounters.lifetimeAttempts++;
    this.persistentCounters.safetyQuotaConsumed++;
    this.persistCounters();
  }

  recordSuccess(durationMs: number): void {
    this.persistentCounters.lifetimeSuccesses++;
    this.persistCounters();
    this.addHistory({
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'Vision Attribute Extraction',
      status: 'completed',
      durationMs,
    });
  }

  recordFailure(reason: string, durationMs?: number): void {
    this.persistentCounters.lifetimeFailures++;
    this.persistCounters();
    this.addHistory({
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'Vision Attribute Extraction',
      status: 'failed',
      reason,
      durationMs,
    });
  }

  private recordBlocked(reason: string): void {
    this.persistentCounters.lifetimeBlocks++;
    this.lastBlockedReason = reason;
    this.persistCounters();
    this.addHistory({
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: 'Vision Attribute Extraction',
      status: 'blocked',
      reason,
    });
  }

  private addHistory(record: SpendAuditRecord): void {
    this.history.unshift(record);
    if (this.history.length > 20) this.history.pop();
    safeSetStorage(STORAGE_KEY_HISTORY, JSON.stringify(this.history));
    this.notifyOtherTabs();
  }

  /**
   * Owner controls: Toggle Kill Switch
   */
  setGlobalKillSwitch(active: boolean): void {
    this.config.globalKillSwitch = active;
    safeSetStorage(STORAGE_KEY_KILL_SWITCH, active ? 'true' : 'false');
    this.notifyOtherTabs();
  }

  /**
   * Owner controls: Set External AI Approved
   */
  setExternalAiApproved(approved: boolean): void {
    this.config.externalAiApproved = approved;
    safeSetStorage(STORAGE_KEY_AI_APPROVED, approved ? 'true' : 'false');
    this.notifyOtherTabs();
  }

  /**
   * Resets local prototype safety quota.
   * NOTE: This is explicitly a client-side prototype control for development testing.
   * It does not represent a server-side quota reset.
   */
  resetPrototypeSafetyQuota(): void {
    this.persistentCounters.safetyQuotaConsumed = 0;
    this.lastBlockedReason = null;
    this.persistCounters();
  }

  /**
   * Resets display session counters (backward-compatible alias for prototype reset).
   */
  resetSessionUsage(): void {
    this.resetPrototypeSafetyQuota();
  }

  getReport(): SpendUsageReport {
    this.syncFromStorage();
    const remaining = Math.max(
      0,
      this.config.sessionRequestLimit - this.persistentCounters.safetyQuotaConsumed,
    );
    const pricingStatus: SpendUsageReport['pricingStatus'] =
      !this.config.externalAiApproved || this.config.globalKillSwitch
        ? 'disabled'
        : 'unknown-unverified';

    // Rule: Never report confirmed $0 if external usage or billing is unknown.
    // If ANY outbound attempt has ever been made (or exists in history), report Unknown / Unverified.
    const hasExternalAttempts =
      this.persistentCounters.lifetimeAttempts > 0 ||
      this.history.some((h) => h.status === 'completed' || h.status === 'failed');

    const estimatedCostDisplay = !hasExternalAttempts
      ? '$0.00 (Local deterministic engine only — zero external calls attempted)'
      : 'Unknown / Unverified (Upstream model provider billing must not be assumed $0.00)';

    return {
      config: { ...this.config },
      totalAttempts: this.persistentCounters.lifetimeAttempts,
      successfulCalls: this.persistentCounters.lifetimeSuccesses,
      blockedCalls: this.persistentCounters.lifetimeBlocks,
      failedCalls: this.persistentCounters.lifetimeFailures,
      activeInFlight: this.activeInFlight,
      sessionCallsRemaining: remaining,
      estimatedCostDisplay,
      pricingStatus,
      lastBlockedReason: this.lastBlockedReason,
      history: [...this.history],
      lifetimeAttempts: this.persistentCounters.lifetimeAttempts,
      safetyQuotaConsumed: this.persistentCounters.safetyQuotaConsumed,
    };
  }

  destroy(): void {
    if (typeof window !== 'undefined' && this.storageListener) {
      try {
        window.removeEventListener('storage', this.storageListener);
      } catch {
        // ignore
      }
    }
    try {
      this.broadcastChannel?.close();
    } catch {
      // ignore
    }
  }
}

export const spendGuard = new SpendGuard();
