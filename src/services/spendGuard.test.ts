import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpendGuard,
  STORAGE_KEY_COUNTERS,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_CONCURRENCY_LOCK,
} from './spendGuard';

class MockStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

describe('SpendGuard - Zero-Unapproved-Spend Architecture', () => {
  let guard: SpendGuard;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockStorage }).localStorage = new MockStorage();
    guard = new SpendGuard();
  });

  it('defaults to fail-closed with external AI disabled', () => {
    const report = guard.getReport();
    expect(report.config.externalAiApproved).toBe(false);

    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('External AI is DISABLED by default (Zero-Spend Policy)');
  });

  it('allows requests only after explicit owner approval', () => {
    guard.setExternalAiApproved(true);
    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(true);
  });

  it('global kill switch immediately halts all outbound requests even if approved', () => {
    guard.setExternalAiApproved(true);
    guard.setGlobalKillSwitch(true);

    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Global Kill Switch is ACTIVE');
  });

  it('enforces strict concurrency limit of 1 to prevent burst concurrency and automated surges', () => {
    guard.setExternalAiApproved(true);

    const release = guard.beginRequest();
    expect(guard.getReport().activeInFlight).toBe(1);

    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Concurrency limit of 1');

    release();
    expect(guard.getReport().activeInFlight).toBe(0);

    const retryCheck = guard.canMakeExternalRequest();
    expect(retryCheck.allowed).toBe(true);
  });

  it('enforces safety quota cap on total outbound attempts', () => {
    guard.setExternalAiApproved(true);

    for (let i = 0; i < 15; i++) {
      const release = guard.beginRequest();
      release();
      guard.recordSuccess(120);
    }

    const report = guard.getReport();
    expect(report.successfulCalls).toBe(15);
    expect(report.sessionCallsRemaining).toBe(0);

    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Safety quota reached');
  });

  it('rejects oversized payloads exceeding the 4MB safety limit', () => {
    guard.setExternalAiApproved(true);

    const safeSize = 2 * 1024 * 1024; // 2 MB
    expect(guard.canMakeExternalRequest(safeSize).allowed).toBe(true);

    const oversized = 5 * 1024 * 1024; // 5 MB
    const check = guard.canMakeExternalRequest(oversized);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('exceeds the safe limit of 4096 KB');
  });

  it('never reports $0.00 for external calls when provider pricing is unverified', () => {
    // Zero external calls: local deterministic engine only -> explicitly labeled $0.00 local
    const initialReport = guard.getReport();
    expect(initialReport.estimatedCostDisplay).toContain('$0.00 (Local deterministic engine only');

    // After an external call is completed: must display as Unknown / Unverified, NEVER $0.00
    guard.setExternalAiApproved(true);
    const release = guard.beginRequest();
    release();
    guard.recordSuccess(250);

    const reportAfterCall = guard.getReport();
    expect(reportAfterCall.successfulCalls).toBe(1);
    expect(reportAfterCall.estimatedCostDisplay).toMatch(/^Unknown \/ Unverified/);
    expect(reportAfterCall.pricingStatus).toBe('unknown-unverified');
  });

  it('resets safety quota correctly on prototype reset command while tracking lifetime attempts', () => {
    guard.setExternalAiApproved(true);
    const release = guard.beginRequest();
    release();
    guard.recordSuccess(100);

    expect(guard.getReport().safetyQuotaConsumed).toBe(1);
    expect(guard.getReport().lifetimeAttempts).toBe(1);

    guard.resetPrototypeSafetyQuota();

    const resetReport = guard.getReport();
    expect(resetReport.safetyQuotaConsumed).toBe(0);
    expect(resetReport.lifetimeAttempts).toBe(1);
    // Cost must still be Unknown / Unverified because an external call was made
    expect(resetReport.estimatedCostDisplay).toMatch(/^Unknown \/ Unverified/);
  });
});

describe('SpendGuard Regression Tests - Audit Vulnerability Fixes', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockStorage }).localStorage = new MockStorage();
  });

  it('persists counters and audit history across simulated page reload (F5)', () => {
    const tab1 = new SpendGuard();
    tab1.setExternalAiApproved(true);

    const release = tab1.beginRequest();
    release();
    tab1.recordSuccess(150);

    expect(tab1.getReport().successfulCalls).toBe(1);
    expect(tab1.getReport().totalAttempts).toBe(1);

    // Simulate page reload: instantiate new SpendGuard instance reading same storage
    const reloadedTab = new SpendGuard();
    const report = reloadedTab.getReport();

    expect(report.config.externalAiApproved).toBe(true);
    expect(report.totalAttempts).toBe(1);
    expect(report.successfulCalls).toBe(1);
    expect(report.safetyQuotaConsumed).toBe(1);
    expect(report.history.length).toBe(1);
    expect(report.history[0].status).toBe('completed');
  });

  it('preserves Unknown / Unverified cost display after page reload', () => {
    const tab1 = new SpendGuard();
    tab1.setExternalAiApproved(true);
    const release = tab1.beginRequest();
    release();
    tab1.recordSuccess(120);

    // Simulating reload
    const reloadedTab = new SpendGuard();
    const report = reloadedTab.getReport();

    expect(report.estimatedCostDisplay).toMatch(/^Unknown \/ Unverified/);
    expect(report.pricingStatus).toBe('unknown-unverified');
  });

  it('counts failed attempts toward safety quota to prevent error flood loops', () => {
    const guard = new SpendGuard();
    guard.setExternalAiApproved(true);

    // Run 15 failed calls (e.g. 500 server errors or timeouts)
    for (let i = 0; i < 15; i++) {
      const release = guard.beginRequest();
      release();
      guard.recordFailure('HTTP 500 Server Error', 50);
    }

    const report = guard.getReport();
    expect(report.failedCalls).toBe(15);
    expect(report.safetyQuotaConsumed).toBe(15);
    expect(report.sessionCallsRemaining).toBe(0);

    // 16th call must be blocked even though successfulCalls is 0
    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Safety quota reached');
  });

  it('tracks retries as physical attempts so retries cannot bypass quota', () => {
    const guard = new SpendGuard();
    guard.setExternalAiApproved(true);

    const release = guard.beginRequest(); // attempt 1
    guard.recordRetryAttempt(); // physical retry attempt 2
    release();
    guard.recordSuccess(300);

    const report = guard.getReport();
    expect(report.totalAttempts).toBe(2);
    expect(report.safetyQuotaConsumed).toBe(2);
    expect(report.successfulCalls).toBe(1);
  });

  it('safely handles corrupted localStorage without throwing or crashing', () => {
    localStorage.setItem(STORAGE_KEY_COUNTERS, '{corrupted: JSON,, "bad');
    localStorage.setItem(STORAGE_KEY_HISTORY, 'not an array');

    expect(() => new SpendGuard()).not.toThrow();

    const guard = new SpendGuard();
    const report = guard.getReport();

    expect(report.totalAttempts).toBe(0);
    expect(report.history).toEqual([]);
    expect(report.config.externalAiApproved).toBe(false);
  });

  it('blocks concurrent requests when another tab holds active concurrency lock', () => {
    const guard = new SpendGuard();
    guard.setExternalAiApproved(true);

    // Simulate another browser tab holding an active lock
    const otherTabLock = {
      instanceId: 'other_tab_456',
      expiresAt: Date.now() + 10_000,
    };
    localStorage.setItem(STORAGE_KEY_CONCURRENCY_LOCK, JSON.stringify(otherTabLock));

    const check = guard.canMakeExternalRequest();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('another browser tab is currently running');
  });
});
