import { useState } from 'react';
import { Link } from 'react-router';
import { Info, RotateCcw, X, Eye, CheckCircle2 } from 'lucide-react';
import { COLOR_MAP, labelOf } from '@/domain/catalog';
import type { Category } from '@/domain/types';
import { useSettings, useUpdateSettings, useWardrobe } from '@/hooks/data';
import { formatDate, formatMoney, relativeDays } from '@/lib/format';
import { CAPSULE_BASELINE } from '@/services/engine/scoring';
import { computeInsights } from '@/services/insights';
import { GarmentVisual } from '@/components/GarmentVisual';

export function InsightsPage() {
  const { data: wardrobe = [], isLoading: isWardrobeLoading } = useWardrobe();
  const { data: settings, isLoading: isSettingsLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [toast, setToast] = useState<string | null>(null);
  const [showDismissedSection, setShowDismissedSection] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  if (isWardrobeLoading || isSettingsLoading || !settings) {
    return <div className="surface surface-pad">Computing wardrobe insights…</div>;
  }

  const insights = computeInsights(wardrobe, settings);

  const handleDismissGap = async (gapId: string) => {
    const current = settings.dismissedGaps ?? [];
    if (current.includes(gapId)) return;
    try {
      await updateSettings.mutateAsync({
        dismissedGaps: [...current, gapId],
      });
      showToast('Gap dismissed from active recommendations.');
    } catch {
      showToast('Could not dismiss gap. Please try again.');
    }
  };

  const handleRestoreGap = async (gapId: string) => {
    const current = settings.dismissedGaps ?? [];
    try {
      await updateSettings.mutateAsync({
        dismissedGaps: current.filter((id) => id !== gapId),
      });
      showToast('Gap restored to active analysis.');
    } catch {
      showToast('Could not restore gap. Please try again.');
    }
  };

  const handleToggleIgnoreCategory = async (category: Category) => {
    const current = settings.ignoredCategories ?? [];
    const isIgnored = current.includes(category);
    const next = isIgnored ? current.filter((c) => c !== category) : [...current, category];
    try {
      await updateSettings.mutateAsync({
        ignoredCategories: next,
      });
      showToast(
        isIgnored
          ? `${labelOf.category(category)} re-enabled in wardrobe gap analysis.`
          : `${labelOf.category(category)} category will be ignored in gap recommendations.`,
      );
    } catch {
      showToast('Could not update category preference. Please try again.');
    }
  };

  const handleRestoreAll = async () => {
    try {
      await updateSettings.mutateAsync({
        dismissedGaps: [],
        ignoredCategories: [],
      });
      showToast('All dismissed gaps and ignored categories have been restored.');
    } catch {
      showToast('Could not restore preferences. Please try again.');
    }
  };

  const totalDismissedOrIgnored =
    insights.dismissedGaps.length +
    insights.dismissedBottlenecks.length +
    insights.ignoredCategories.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="notice notice-info"
          style={{
            position: 'sticky',
            top: 16,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="var(--tone-positive)" />
            <span className="text-sm font-medium">{toast}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-copy">
          <div className="eyebrow">Wardrobe Analytics</div>
          <h1 className="title-xl">Wardrobe Insights</h1>
          <p className="text-secondary">
            Honest statistics calculated solely from the garments, prices, and wear dates you have
            recorded — designed to help you wear what you own, not shop unnecessarily.
          </p>
        </div>
      </header>

      {/* Missing Metadata Notice */}
      {insights.metadataNotice && wardrobe.length > 0 && (
        <div
          className="surface-subtle"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            borderLeft: '3px solid var(--accent-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <Info size={16} className="text-secondary" style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="text-xs text-secondary" style={{ lineHeight: 1.5 }}>
            <strong>Metadata completeness tip:</strong> {insights.metadataNotice.message}{' '}
            <Link to="/wardrobe" style={{ textDecoration: 'underline', fontWeight: 500 }}>
              Edit items in My Wardrobe
            </Link>
            .
          </div>
        </div>
      )}

      {wardrobe.length === 0 ? (
        <div className="surface surface-pad-lg" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Empty archive</div>
          <h2 className="title-md" style={{ marginTop: 6 }}>
            No wardrobe data to analyze yet
          </h2>
          <p className="text-secondary" style={{ maxWidth: 480, margin: '8px auto 20px' }}>
            Wardrobe Insights computes category balance, wear frequencies, and cost-per-wear
            directly from the garments and wears you catalog. Add your own items or restore the sample
            capsule to explore.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Link to="/wardrobe?add=1" className="btn btn-primary">
              Add first garment
            </Link>
            <Link to="/wardrobe" className="btn btn-secondary">
              Go to My Wardrobe
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Category Balance & Gaps */}
          <div className="grid-2">
            <section className="surface surface-pad">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <div className="eyebrow">Capsule Structure</div>
                  <h2 className="title-md" style={{ marginTop: 2, marginBottom: 4 }}>
                    Category balance & potential gaps
                  </h2>
                </div>
                {totalDismissedOrIgnored > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setShowDismissedSection((prev) => !prev)}
                    style={{ textDecoration: 'underline' }}
                  >
                    {showDismissedSection ? 'Hide preferences' : `Preferences (${totalDismissedOrIgnored})`}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
                Compared against a reference 17-piece capsule. You can dismiss individual gaps or
                ignore categories that you do not wear.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {insights.byCategory.map(({ category, count, isIgnored }) => {
                  const target = CAPSULE_BASELINE[category];
                  const pct = Math.min(100, Math.round((count / target) * 100));
                  const gap = insights.gaps.find((g) => g.category === category);
                  const isGap = Boolean(gap);

                  return (
                    <div
                      key={category}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        paddingBottom: 10,
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 6,
                          fontSize: 13.5,
                        }}
                      >
                        <span style={{ fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {labelOf.categoryPlural(category)}
                          {isIgnored ? (
                            <span className="badge" style={{ fontSize: 10, opacity: 0.7 }}>
                              Ignored
                            </span>
                          ) : isGap ? (
                            <span className="badge badge-caution" style={{ fontSize: 10 }}>
                              Thin category
                            </span>
                          ) : null}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="mono text-xs text-secondary">
                            {count} owned · ref {target}
                          </span>

                          {isIgnored ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleToggleIgnoreCategory(category)}
                              title={`Include ${labelOf.category(category)} in gap analysis`}
                            >
                              <Eye size={12} style={{ marginRight: 3 }} /> Re-enable
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              {isGap && gap && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleDismissGap(gap.id)}
                                  aria-label={`Dismiss gap for ${labelOf.category(category)}`}
                                  title="Dismiss this gap suggestion"
                                >
                                  Dismiss
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-muted"
                                onClick={() => handleToggleIgnoreCategory(category)}
                                aria-label={`Ignore ${labelOf.category(category)} category`}
                                title={`Ignore ${labelOf.category(category)} category`}
                              >
                                Ignore
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="score-meter" style={{ opacity: isIgnored ? 0.35 : 1 }}>
                        <div
                          className="score-meter-fill"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: isIgnored
                              ? 'var(--text-muted)'
                              : isGap
                                ? 'var(--tone-caution)'
                                : 'var(--text-primary)',
                          }}
                        />
                      </div>

                      {/* Evidence & Contextual Reasoning */}
                      {!isIgnored && isGap && gap && (
                        <div className="text-xs text-secondary" style={{ marginTop: 2, lineHeight: 1.45 }}>
                          {gap.evidence}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="surface surface-pad">
              <div className="eyebrow">Restrained Recommendations</div>
              <h2 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
                Useful additions (grounded in gaps & bottlenecks)
              </h2>
              <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
                PalettePilot only suggests an addition when a genuine gap or combination bottleneck
                exists that cannot already be satisfied by existing clothes.
              </p>

              {insights.additions.length === 0 ? (
                <div className="surface-subtle" style={{ padding: 18 }}>
                  <div className="title-sm">No new purchases recommended right now</div>
                  <p className="text-sm text-secondary" style={{ marginTop: 6 }}>
                    {wardrobe.length < 3
                      ? 'At least 3 complementary pieces are needed before the engine can recommend additions that pair with what you own.'
                      : totalDismissedOrIgnored > 0 && insights.gaps.length === 0
                        ? 'All identified gaps are currently dismissed or ignored in your preferences. Your wardrobe is operating as balanced.'
                        : 'Your wardrobe has healthy coverage across core categories and combinations. Focus on wearing and combining the pieces you already own.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {insights.additions.map((idea) => (
                    <div
                      key={`${idea.category}-${idea.color}`}
                      style={{
                        padding: 14,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 14,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className="color-swatch"
                            style={{ backgroundColor: COLOR_MAP[idea.color]?.hex }}
                          />
                          <span className="title-sm">
                            {labelOf.color(idea.color)} {labelOf.category(idea.category).toLowerCase()}
                          </span>
                        </div>
                        <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                          {idea.reason}
                        </p>
                      </div>
                      <span className="badge badge-positive" style={{ flexShrink: 0 }}>
                        Pairs with {idea.pairsWith}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {insights.byColor.length > 0 && (
                <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>
                    Color distribution ({Math.round(insights.neutralShare * 100)}% neutrals)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {insights.byColor.map(({ color, count }) => (
                      <span key={color} className="badge">
                        <span
                          className="color-swatch"
                          style={{ backgroundColor: COLOR_MAP[color]?.hex }}
                        />
                        {labelOf.color(color)} · {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Combination Bottlenecks Section */}
          {insights.bottlenecks.length > 0 && (
            <section className="surface surface-pad">
              <div className="eyebrow">Outfit Combination Bottlenecks</div>
              <h2 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
                Occasion pairing roadblocks
              </h2>
              <p className="text-xs text-muted" style={{ marginBottom: 16 }}>
                These occur when you have separates (tops and bottoms) or dresses for an occasion,
                but lack a compatible pairing (such as shoes or layers) to create complete outfits.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {insights.bottlenecks.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: 14,
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="badge badge-caution">Combination Roadblock</span>
                        <span className="badge">{labelOf.occasion(b.occasion)}</span>
                        <span className="title-sm">
                          Missing {labelOf.category(b.missingCategory).toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs text-secondary" style={{ margin: 0 }}>
                        {b.evidence}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleDismissGap(b.id)}
                      aria-label={`Dismiss combination bottleneck for ${labelOf.occasion(b.occasion)}`}
                    >
                      Dismiss bottleneck
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Dismissed Gaps & Ignored Preferences Panel */}
          {totalDismissedOrIgnored > 0 && showDismissedSection && (
            <section
              className="surface surface-pad"
              style={{
                backgroundColor: 'rgba(31, 29, 27, 0.02)',
                border: '1px dashed var(--border-strong)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div className="eyebrow">User Preferences Archive</div>
                  <h3 className="title-sm" style={{ marginTop: 2 }}>
                    Dismissed gaps & ignored categories ({totalDismissedOrIgnored})
                  </h3>
                </div>
                <button type="button" className="btn btn-secondary btn-xs" onClick={handleRestoreAll}>
                  <RotateCcw size={12} style={{ marginRight: 4 }} /> Restore all to defaults
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.dismissedGaps.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span className="text-xs">
                      <strong>Dismissed Category Gap:</strong> {labelOf.categoryPlural(g.category)} ({g.owned} owned)
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleRestoreGap(g.id)}
                      aria-label={`Restore gap for ${labelOf.category(g.category)}`}
                    >
                      Restore
                    </button>
                  </div>
                ))}

                {insights.dismissedBottlenecks.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span className="text-xs">
                      <strong>Dismissed Bottleneck:</strong> {labelOf.occasion(b.occasion)} wear (missing{' '}
                      {labelOf.category(b.missingCategory).toLowerCase()})
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleRestoreGap(b.id)}
                      aria-label={`Restore bottleneck for ${labelOf.occasion(b.occasion)}`}
                    >
                      Restore
                    </button>
                  </div>
                ))}

                {insights.ignoredCategories.map((c) => (
                  <div
                    key={c}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span className="text-xs">
                      <strong>Ignored Category:</strong> {labelOf.categoryPlural(c)} (excluded from gap analysis)
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleToggleIgnoreCategory(c)}
                      aria-label={`Re-enable ${labelOf.category(c)} category`}
                    >
                      Include
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Wear Frequency: Most Worn & Rarely Used */}
          <div className="grid-2">
            <section className="surface surface-pad">
              <div className="eyebrow">Recorded Wear Frequency</div>
              <h2 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
                Frequently worn pieces
              </h2>
              <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
                Ranked by wears logged in the last 90 days ({insights.wear.itemsWithData} of{' '}
                {insights.total} items have recorded wear logs; {insights.wear.itemsWithoutData} have
                no wear data yet).
              </p>

              {insights.wear.mostWorn.length === 0 ? (
                <div className="surface-subtle" style={{ padding: 18 }}>
                  <div className="text-sm" style={{ fontWeight: 500 }}>
                    No recent wear logs yet
                  </div>
                  <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                    PalettePilot never guesses how often you wear an item. Click “Wore today” on any
                    piece in{' '}
                    <Link to="/wardrobe" style={{ textDecoration: 'underline' }}>
                      My Wardrobe
                    </Link>{' '}
                    to track real usage.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {insights.wear.mostWorn.map((stat) => (
                    <div
                      key={stat.item.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '56px 1fr auto',
                        gap: 14,
                        alignItems: 'center',
                        padding: 10,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <GarmentVisual
                        image={stat.item.image}
                        name={stat.item.name}
                        category={stat.item.category}
                        colors={stat.item.colors}
                      />
                      <div>
                        <div className="text-sm" style={{ fontWeight: 600 }}>
                          {stat.item.name}
                        </div>
                        <div className="text-xs text-secondary">
                          Last worn {relativeDays(stat.lastWorn)} ({formatDate(stat.lastWorn)})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge badge-positive">{stat.recentWears}× in 90d</span>
                        <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                          {stat.wears} total
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="surface surface-pad">
              <div className="eyebrow">Underused with Recorded History</div>
              <h2 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
                Rarely worn pieces & rediscovery outfits
              </h2>
              <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
                Only includes items that have recorded wear dates but haven’t been worn recently. Items
                with zero logged dates are treated as “untracked”, not “unworn”.
              </p>

              {insights.wear.rarelyWorn.length === 0 ? (
                <div className="surface-subtle" style={{ padding: 18 }}>
                  <div className="text-sm" style={{ fontWeight: 500 }}>
                    No underused items detected
                  </div>
                  <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                    Items appear here once they have at least one wear date recorded and are not worn
                    for over 60 days.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {insights.wear.rarelyWorn.map((stat) => {
                    const redis = insights.rediscover.find((r) => r.item.id === stat.item.id);
                    return (
                      <div
                        key={stat.item.id}
                        style={{
                          padding: 12,
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '56px 1fr auto',
                            gap: 14,
                            alignItems: 'center',
                          }}
                        >
                          <GarmentVisual
                            image={stat.item.image}
                            name={stat.item.name}
                            category={stat.item.category}
                            colors={stat.item.colors}
                          />
                          <div>
                            <div className="text-sm" style={{ fontWeight: 600 }}>
                              {stat.item.name}
                            </div>
                            <div className="text-xs text-secondary">
                              Last worn {relativeDays(stat.lastWorn)} ({formatDate(stat.lastWorn)}) · {stat.wears} total
                            </div>
                          </div>
                          <span className="badge badge-caution">Underused</span>
                        </div>

                        {redis && (
                          <div
                            className="surface-subtle"
                            style={{ padding: 10, borderRadius: 'var(--radius-sm)' }}
                          >
                            <div className="eyebrow" style={{ fontSize: 10 }}>
                              Rediscovery pairing
                            </div>
                            <p className="text-xs text-secondary" style={{ marginTop: 2 }}>
                              {redis.rationale}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Cost per Wear: Computed vs Insufficient Data */}
          <section className="surface surface-pad">
            <div className="eyebrow">Investment Realism</div>
            <h2 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
              Estimated cost per wear
            </h2>
            <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
              Requires a recorded purchase price and at least 3 logged wears (to avoid meaningless
              single-wear spikes). Items missing a price or with fewer than 3 wears are clearly listed
              as uncomputed.
            </p>

            <div className="grid-2">
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  Calculated ({insights.costPerWear.computed.length} items)
                </div>
                {insights.costPerWear.computed.length === 0 ? (
                  <div className="surface-subtle" style={{ padding: 14 }}>
                    <p className="text-xs text-secondary">
                      No items qualify yet. Once an item has a purchase price and 3 recorded wears,
                      its cost per wear is calculated here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {insights.costPerWear.computed.map(({ item, wears, costPerWear }) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div>
                          <div className="text-sm" style={{ fontWeight: 600 }}>
                            {item.name}
                          </div>
                          <div className="text-xs text-secondary">
                            Original {formatMoney(item.price!)} · {wears} wears recorded
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>
                            {formatMoney(costPerWear)}
                          </div>
                          <div className="text-xs text-muted">per wear</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  Insufficient data ({insights.costPerWear.insufficient.length} items)
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  {insights.costPerWear.insufficient.map(({ item, reason }) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'rgba(31, 29, 27, 0.02)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12.5,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <span className="badge badge-info" style={{ fontSize: 10 }}>
                        {reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
