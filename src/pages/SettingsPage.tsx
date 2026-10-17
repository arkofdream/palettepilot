import { useEffect, useState, type FormEvent } from 'react';
import { Download, RotateCcw, Trash2, Check, ShieldAlert, ShieldCheck, AlertTriangle, ZapOff, Activity, RefreshCw } from 'lucide-react';
import { COLORS, CURRENCIES, OCCASIONS, STYLE_TAGS } from '@/domain/catalog';
import type { ColorId, CurrencyCode, Occasion, StyleTag } from '@/domain/types';
import { useDataAdmin, useSettings, useUpdateSettings } from '@/hooks/data';
import { parsePrice } from '@/lib/format';
import { services } from '@/services';
import { spendGuard, type SpendUsageReport } from '@/services/spendGuard';

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { removeSamples, restoreSamples, clearAll, resetSettings } = useDataAdmin();

  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [monthlyBudgetStr, setMonthlyBudgetStr] = useState('');
  const [maxItemPriceStr, setMaxItemPriceStr] = useState('');
  const [budgetStrictness, setBudgetStrictness] = useState<'relaxed' | 'balanced' | 'strict'>(
    'balanced',
  );
  const [styleTags, setStyleTags] = useState<StyleTag[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<ColorId[]>([]);
  const [avoidColors, setAvoidColors] = useState<ColorId[]>([]);
  const [primaryOccasions, setPrimaryOccasions] = useState<Occasion[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [spendReport, setSpendReport] = useState<SpendUsageReport>(() => spendGuard.getReport());

  const refreshSpendReport = () => {
    setSpendReport(spendGuard.getReport());
  };

  const handleToggleKillSwitch = () => {
    const next = !spendReport.config.globalKillSwitch;
    spendGuard.setGlobalKillSwitch(next);
    refreshSpendReport();
    setSavedNotice(
      next
        ? 'Global Kill Switch ACTIVATED. All outbound AI requests are halted immediately.'
        : 'Global Kill Switch deactivated. Requests subject to normal quota and approval checks.',
    );
  };

  const handleToggleAiApproval = () => {
    const next = !spendReport.config.externalAiApproved;
    spendGuard.setExternalAiApproved(next);
    refreshSpendReport();
    setSavedNotice(
      next
        ? 'External AI vision extraction approved for verified free tier.'
        : 'External AI disabled (Zero-Spend Policy). Operating in deterministic local mode.',
    );
  };

  const handleResetSessionUsage = () => {
    spendGuard.resetPrototypeSafetyQuota();
    refreshSpendReport();
    setSavedNotice(
      'SpendGuard local prototype quota counter reset. (Notice: This is a client-side prototype control for local testing; it is not a secure server quota reset).'
    );
  };

  useEffect(() => {
    if (!settings) return;
    setDisplayName(settings.displayName);
    setCurrency(settings.currency);
    setMonthlyBudgetStr(settings.monthlyBudget !== undefined ? String(settings.monthlyBudget) : '');
    setMaxItemPriceStr(settings.maxItemPrice !== undefined ? String(settings.maxItemPrice) : '');
    setBudgetStrictness(settings.budgetStrictness);
    setStyleTags(settings.styleTags);
    setFavoriteColors(settings.favoriteColors);
    setAvoidColors(settings.avoidColors);
    setPrimaryOccasions(settings.primaryOccasions);
  }, [settings]);

  if (isLoading || !settings) {
    return <div className="surface surface-pad">Loading settings…</div>;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const monthlyBudget = monthlyBudgetStr.trim() ? parsePrice(monthlyBudgetStr) ?? undefined : undefined;
    const maxItemPrice = maxItemPriceStr.trim() ? parsePrice(maxItemPriceStr) ?? undefined : undefined;
    await updateSettings.mutateAsync({
      displayName: displayName.trim(),
      currency,
      monthlyBudget,
      maxItemPrice,
      budgetStrictness,
      styleTags,
      favoriteColors,
      avoidColors,
      primaryOccasions,
    });
    setSavedNotice('Preferences saved. Future analyses will use these settings.');
  }

  function toggle<T>(list: T[], item: T, set: (next: T[]) => void) {
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }

  async function handleExport() {
    const bundle = await services.data.exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `palettepilot-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-copy">
          <div className="eyebrow">Configuration</div>
          <h1 className="title-xl">Settings</h1>
          <p className="text-secondary">
            Configure your currency, budget thresholds, style direction, and local prototype data.
          </p>
        </div>
      </header>

      {savedNotice && (
        <div className="notice notice-positive">
          <span>{savedNotice}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSavedNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Currency & Budget */}
        <section className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="eyebrow">Currency & Budget</div>
            <h2 className="title-md" style={{ marginTop: 2 }}>
              Budget fit parameters
            </h2>
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              Used by the Smart Buy Score’s Budget Fit factor. Default currency is USD.
            </p>
          </div>

          <div className="grid-3">
            <div className="field">
              <label className="field-label" htmlFor="set-currency">
                <span>Preferred currency</span>
              </label>
              <select
                id="set-currency"
                className="select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="set-max-item">
                <span>Per-item target limit ({currency})</span>
              </label>
              <input
                id="set-max-item"
                type="number"
                min="0"
                className="input"
                value={maxItemPriceStr}
                onChange={(e) => setMaxItemPriceStr(e.target.value)}
                placeholder="180"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="set-monthly">
                <span>Monthly clothing budget ({currency})</span>
              </label>
              <input
                id="set-monthly"
                type="number"
                min="0"
                className="input"
                value={monthlyBudgetStr}
                onChange={(e) => setMonthlyBudgetStr(e.target.value)}
                placeholder="250"
              />
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>Budget strictness</span>
            </div>
            <div className="chip-group">
              {(['relaxed', 'balanced', 'strict'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`chip ${budgetStrictness === mode ? 'selected' : ''}`}
                  onClick={() => setBudgetStrictness(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Style Preferences */}
        <section className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="eyebrow">Style Direction</div>
            <h2 className="title-md" style={{ marginTop: 2 }}>
              Style & palette preferences
            </h2>
          </div>

          <div className="field">
            <div className="field-label">
              <span>Style descriptors</span>
            </div>
            <div className="chip-group">
              {STYLE_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`chip ${styleTags.includes(tag.id) ? 'selected' : ''}`}
                  onClick={() => toggle(styleTags, tag.id, setStyleTags)}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>Primary occasions you dress for</span>
            </div>
            <div className="chip-group">
              {OCCASIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`chip ${primaryOccasions.includes(o.id) ? 'selected' : ''}`}
                  onClick={() => toggle(primaryOccasions, o.id, setPrimaryOccasions)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>Favorite colors</span>
            </div>
            <div className="chip-group">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${favoriteColors.includes(c.id) ? 'selected' : ''}`}
                  onClick={() => toggle(favoriteColors, c.id, setFavoriteColors)}
                >
                  <span className="color-swatch" style={{ backgroundColor: c.hex }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>Colors you prefer to avoid</span>
            </div>
            <div className="chip-group">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${avoidColors.includes(c.id) ? 'selected' : ''}`}
                  onClick={() => toggle(avoidColors, c.id, setAvoidColors)}
                >
                  <span className="color-swatch" style={{ backgroundColor: c.hex }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Account & Local Storage */}
        <section className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="eyebrow">Profile & Storage</div>
            <h2 className="title-md" style={{ marginTop: 2 }}>
              Account & local prototype data
            </h2>
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              This private-beta prototype stores your wardrobe, photos, and analyses locally in
              this browser using IndexedDB. Cloud accounts and cross-device sync are not connected
              yet.
            </p>
          </div>

          <div className="field" style={{ maxWidth: 420 }}>
            <label className="field-label" htmlFor="set-name">
              <span>Display name</span>
              <span className="field-hint">Used for your dashboard greeting</span>
            </label>
            <input
              id="set-name"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Elena"
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={updateSettings.isPending}>
              <Check size={15} /> {updateSettings.isPending ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                resetSettings.mutate(undefined, {
                  onSuccess: () => setSavedNotice('Reset preferences to defaults (USD).'),
                });
              }}
            >
              <RotateCcw size={14} /> Reset preferences to defaults
            </button>
          </div>
        </section>
      </form>

      {/* Zero-Unapproved-Spend Governance & Audit */}
      <section className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div className="eyebrow">Governance & Spend Guard</div>
            <h2 className="title-md" style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              Zero-Unapproved-Spend Controls & Usage Audit
            </h2>
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              Strict fail-closed architecture: no automated fallback to paid services, max 15 session calls, max 1 concurrency, and instant kill switch.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={refreshSpendReport}
            title="Refresh Usage Stats"
          >
            <RefreshCw size={13} /> Refresh stats
          </button>
        </div>

        {/* Warning / Non-negotiable policy banner */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(138, 90, 30, 0.3)',
            backgroundColor: 'var(--tone-caution-bg)',
            color: 'var(--tone-caution)',
            fontSize: '12.5px',
            lineHeight: 1.5,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Strict Zero-Spend Guarantee:</strong> No provider&apos;s free tier is unlimited, and hosting is not guaranteed free under unlimited traffic. PalettePilot defaults all external AI to disabled and fails closed. Local IndexedDB persistence and deterministic Wardrobe Match Engine operate 100% locally without external network charges.
          </div>
        </div>

        {/* Primary Owner Controls */}
        <div className="grid-2" style={{ gap: 16 }}>
          {/* Global Kill Switch */}
          <div
            style={{
              padding: 16,
              border: spendReport.config.globalKillSwitch
                ? '1px solid rgba(140, 47, 43, 0.4)'
                : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: spendReport.config.globalKillSwitch
                ? 'var(--tone-negative-bg)'
                : 'var(--bg-subtle)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ZapOff size={15} /> Global Kill Switch
                </span>
                <span className={`badge ${spendReport.config.globalKillSwitch ? 'badge-negative' : 'badge-positive'}`}>
                  {spendReport.config.globalKillSwitch ? 'Active (All AI Halted)' : 'Inactive (Monitoring)'}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Immediately terminates 100% of outbound external AI requests at the client threshold. Local deterministic wardrobe matching continues unaffected.
              </p>
            </div>
            <button
              type="button"
              className={spendReport.config.globalKillSwitch ? 'btn btn-secondary' : 'btn btn-danger'}
              onClick={handleToggleKillSwitch}
            >
              {spendReport.config.globalKillSwitch ? 'Deactivate Kill Switch' : 'Engage Global Kill Switch'}
            </button>
          </div>

          {/* External AI Approval */}
          <div
            style={{
              padding: 16,
              border: spendReport.config.externalAiApproved
                ? '1px solid rgba(46, 90, 68, 0.3)'
                : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-subtle)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {spendReport.config.externalAiApproved ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                  External AI Free-Tier Approval
                </span>
                <span className={`badge ${spendReport.config.externalAiApproved ? 'badge-positive' : 'badge-sample'}`}>
                  {spendReport.config.externalAiApproved ? 'Approved (Capped)' : 'Disabled (Default)'}
                </span>
              </div>
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Default is disabled (fail-closed). When enabled, permits visual extraction strictly within verified free-tier limits. Never automatically switches to paid tiers.
              </p>
            </div>
            <button
              type="button"
              className={spendReport.config.externalAiApproved ? 'btn btn-secondary' : 'btn btn-primary'}
              onClick={handleToggleAiApproval}
            >
              {spendReport.config.externalAiApproved ? 'Revoke AI Approval' : 'Approve Free-Tier AI'}
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Session Usage & Cost Transparency</div>
          <div className="grid-3" style={{ gap: 12 }}>
            <div className="surface surface-pad" style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <div className="text-xs text-muted">Outbound Attempts (Safety Quota)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 4 }}>
                {spendReport.safetyQuotaConsumed}{' '}
                <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                  / {spendReport.config.sessionRequestLimit} max ({spendReport.sessionCallsRemaining} left)
                </span>
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                {spendReport.successfulCalls} completed · {spendReport.totalAttempts} lifetime attempts
              </div>
            </div>

            <div className="surface surface-pad" style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <div className="text-xs text-muted">Blocked / Failed Requests</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 4 }}>
                <span style={{ color: 'var(--tone-caution)' }}>{spendReport.blockedCalls}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}> blocked</span>
                {' / '}
                <span style={{ color: 'var(--tone-negative)' }}>{spendReport.failedCalls}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}> failed</span>
              </div>
            </div>

            <div className="surface surface-pad" style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <div className="text-xs text-muted">Active In-Flight (Concurrency)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 4 }}>
                {spendReport.activeInFlight}{' '}
                <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                  / max {spendReport.config.maxConcurrency}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Estimated Cost Callout */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div className="text-xs" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Estimated Incurred Spend
          </div>
          <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: 500 }}>
            {spendReport.estimatedCostDisplay}
          </div>
          <div className="text-xs text-muted">
            Pricing policy rule: If provider pricing is unverified, cost is reported as unknown rather than assumed $0.00.
          </div>
        </div>

        {/* Audit Log Table */}
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={12} /> Recent SpendGuard Audit Trail (Last 20 Events)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="text-xs text-muted" style={{ fontSize: '11px' }}>
                Prototype testing control; not a server quota bypass
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleResetSessionUsage}
                title="Reset local prototype quota counter"
              >
                Reset Prototype Quota
              </button>
            </div>
          </div>

          {spendReport.history.length === 0 ? (
            <div
              style={{
                padding: 16,
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
                fontSize: '12.5px',
                color: 'var(--text-muted)',
              }}
            >
              No outbound AI requests logged in this session yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-subtle)' }}>
                    <th style={{ padding: '8px 12px' }}>Time</th>
                    <th style={{ padding: '8px 12px' }}>Action</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Details / Block Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {spendReport.history.map((record) => (
                    <tr key={record.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {new Date(record.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{record.action}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          className={`badge ${
                            record.status === 'completed'
                              ? 'badge-positive'
                              : record.status === 'blocked'
                              ? 'badge-caution'
                              : 'badge-negative'
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                        {record.reason ?? (record.durationMs !== undefined ? `${record.durationMs}ms duration` : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Data Administration */}
      <section className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div className="eyebrow">Data Management</div>
          <h2 className="title-md" style={{ marginTop: 2 }}>
            Sample data & JSON export
          </h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            <Download size={14} /> Export wardrobe & analyses (JSON)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              removeSamples.mutate(undefined, {
                onSuccess: () => setSavedNotice('Removed all sample items and sample analyses.'),
              })
            }
          >
            Remove sample items
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              restoreSamples.mutate(undefined, {
                onSuccess: () => setSavedNotice('Restored the labeled sample wardrobe.'),
              })
            }
          >
            Restore sample wardrobe
          </button>

          {!confirmClear ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={14} /> Clear all browser data
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                clearAll.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmClear(false);
                    setSavedNotice('Cleared all wardrobe items, analyses, and settings.');
                  },
                })
              }
            >
              Confirm erase everything
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
