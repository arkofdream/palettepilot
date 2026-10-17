import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Plus, Scale, Sparkles, Check } from 'lucide-react';
import { COLOR_MAP, labelOf } from '@/domain/catalog';
import { useAnalyses, useDataAdmin, useLogWear, useSettings, useWardrobe } from '@/hooks/data';
import { formatDate, formatMoney, pluralize } from '@/lib/format';
import { computeInsights } from '@/services/insights';
import { curateWardrobeOutfits } from '@/services/curatedOutfits';
import { ScoreBadge } from '@/components/AnalysisReport';
import { GarmentVisual } from '@/components/GarmentVisual';
import { EditorialOutfitCarousel } from '@/components/EditorialOutfitCarousel';

export function DashboardPage() {
  const { data: wardrobe = [], isLoading: loadingWardrobe } = useWardrobe();
  const { data: analyses = [] } = useAnalyses();
  const { data: settings } = useSettings();
  const { removeSamples, restoreSamples } = useDataAdmin();
  const logWearMutation = useLogWear();

  const [isLoggingOutfitId, setIsLoggingOutfitId] = useState<string | null>(null);
  const [loggedOutfitId, setLoggedOutfitId] = useState<string | null>(null);
  const [wearToast, setWearToast] = useState<string | null>(null);

  if (loadingWardrobe || !settings) {
    return (
      <div className="surface surface-pad-lg">
        <div className="eyebrow">Loading</div>
        <p className="text-secondary" style={{ marginTop: 6 }}>
          Preparing your wardrobe and curated daily pairings…
        </p>
      </div>
    );
  }

  const insights = computeInsights(wardrobe, settings);
  const curated = curateWardrobeOutfits(wardrobe, 5);
  const recentItems = wardrobe.slice(0, 4);
  const recentAnalyses = analyses.slice(0, 4);
  const greetingName = settings.displayName.trim() ? `, ${settings.displayName.trim()}` : '';

  const handleLogOutfitWear = async (itemIds: string[], outfitId: string) => {
    // Guard against concurrent execution / double-clicks
    if (isLoggingOutfitId || loggedOutfitId === outfitId) return;

    setIsLoggingOutfitId(outfitId);
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todayIso = new Date().toISOString();

    try {
      const itemMap = new Map(wardrobe.map((w) => [w.id, w]));

      for (const id of itemIds) {
        const item = itemMap.get(id);
        // Only log if not already logged today (prevents duplicate daily records)
        const alreadyLoggedToday = item?.wearLog.some((d) => d.startsWith(todayPrefix));
        if (!alreadyLoggedToday) {
          await logWearMutation.mutateAsync({ id, date: todayIso });
        }
      }

      setLoggedOutfitId(outfitId);
      setWearToast('Outfit logged in your wear diary! Total wear counts updated.');
      setTimeout(() => setWearToast(null), 4000);
    } catch {
      setWearToast('Could not record wear date. Please try again.');
    } finally {
      setIsLoggingOutfitId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      {/* Sample data banner when sample items exist */}
      {insights.sampleCount > 0 && (
        <div className="notice">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge badge-sample">Sample</span>
            <span>
              <strong>Exploring with sample data</strong> — Your wardrobe currently includes{' '}
              {pluralize(insights.sampleCount, 'sample item')} and demo analyses so you can test the
              Wardrobe Match Engine right away. Every sample record is labeled.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => removeSamples.mutate()}
            disabled={removeSamples.isPending}
          >
            Start with an empty wardrobe
          </button>
        </div>
      )}

      {/* Toast Notice when wear is logged */}
      {wearToast && (
        <div className="notice notice-positive">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={16} />
            <span>{wearToast}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setWearToast(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Personalized Editorial Hero / Welcome & Quick Actions */}
      <section className="surface surface-pad-lg">
        <div className="grid-2 dashboard-hero-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="eyebrow" style={{ color: 'var(--accent-terracotta)' }}>
              Personal Wardrobe Intelligence
            </div>
            <h1 className="title-xl">
              Welcome{greetingName}. Buy less, pair better.
            </h1>
            <p className="text-secondary" style={{ fontSize: 16, maxWidth: 580, lineHeight: 1.6 }}>
              Before you bring a new piece home, check how it works with the clothes you already
              own — across color harmony, outfit versatility, duplication, and budget fit.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingTop: 4 }}>
              <Link to="/buy-or-skip" className="btn btn-primary btn-lg">
                <Sparkles size={16} /> Should I buy this?
              </Link>
              <Link to="/showdown" className="btn btn-secondary btn-lg">
                <Scale size={16} /> Compare two options
              </Link>
              <Link to="/wardrobe?add=1" className="btn btn-ghost btn-lg">
                <Plus size={16} /> Add wardrobe item
              </Link>
            </div>
          </div>

          {/* Quick Wardrobe Philosophy & Curated Summary */}
          <div
            className="surface-subtle"
            style={{
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 18,
              borderLeft: '3px solid var(--accent-terracotta)',
            }}
          >
            <div>
              <div className="eyebrow">Core Capsule Direction</div>
              <h3 className="title-sm" style={{ marginTop: 4 }}>
                A conscious wardrobe built on harmony
              </h3>
              <p className="text-xs text-secondary" style={{ marginTop: 6, lineHeight: 1.6 }}>
                Every pairing and buy score is computed deterministically from your owned pieces. No
                external data tracking, zero third-party ads, and 100% private local storage.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div className="text-xs text-muted">Ready combinations</div>
                <div className="font-display tabular" style={{ fontSize: '1.8rem', lineHeight: 1.1, marginTop: 2 }}>
                  {curated.totalCombinationsCount}
                </div>
              </div>
              <Link to="/wardrobe" className="btn btn-ghost btn-sm">
                Open closet <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Today's Curated Pairings (Carousel Cards) / Empty Wardrobe Guidance */}
      <section>
        {curated.outfits.length > 0 ? (
          <EditorialOutfitCarousel
            outfits={curated.outfits}
            onLogWear={handleLogOutfitWear}
            loggedOutfitId={loggedOutfitId}
            isLoggingId={isLoggingOutfitId}
          />
        ) : wardrobe.length > 0 ? (
          <div className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="eyebrow">Daily Curation</div>
            <h2 className="title-md">Building your capsule pairings</h2>
            <p className="text-sm text-secondary" style={{ maxWidth: 620, lineHeight: 1.6 }}>
              You have {wardrobe.length} {pluralize(wardrobe.length, 'piece')} in your closet.
              Complete outfits require at least a top, a bottom, and shoes that share seasons and
              occasions. Add complementary items to unlock daily curated outfit suggestions.
            </p>
            <div style={{ marginTop: 6 }}>
              <Link to="/wardrobe?add=1" className="btn btn-secondary btn-sm">
                <Plus size={14} /> Add complementary piece
              </Link>
            </div>
          </div>
        ) : (
          /* Empty state when wardrobe is 0 items */
          <div
            className="surface surface-pad-lg"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 20,
              borderLeft: '3px solid var(--accent-terracotta)',
            }}
          >
            <div style={{ maxWidth: 580 }}>
              <div className="eyebrow" style={{ color: 'var(--accent-terracotta)' }}>
                Capsule Foundation Needed
              </div>
              <h2 className="title-md" style={{ marginTop: 2 }}>
                Your wardrobe is empty
              </h2>
              <p className="text-secondary" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
                Add at least 3 pieces across tops, bottoms, and shoes so the Wardrobe Match Engine can
                build outfits and score new purchases.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/wardrobe?add=1" className="btn btn-primary btn-sm">
                <Plus size={14} /> Add your first item
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => restoreSamples.mutate()}
                disabled={restoreSamples.isPending}
              >
                Load sample wardrobe
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 3. Your Wardrobe at a Glance (Metrics Row & Dominant Palette) */}
      <section className="surface surface-pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div className="eyebrow">Closet Metrics</div>
            <h2 className="title-md" style={{ marginTop: 2 }}>
              Your wardrobe at a glance
            </h2>
          </div>
          <Link to="/insights" className="btn btn-ghost btn-sm">
            Full insights <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid-4" style={{ gap: 14 }}>
          <div className="editorial-metric-card">
            <span className="editorial-metric-label">Total Pieces</span>
            <div className="editorial-metric-number tabular">{insights.total}</div>
            <span className="editorial-metric-sub">
              {insights.ownCount} yours · {insights.sampleCount} sample
            </span>
          </div>

          <div className="editorial-metric-card">
            <span className="editorial-metric-label">Ready Outfits</span>
            <div className="editorial-metric-number tabular">{curated.totalCombinationsCount}</div>
            <span className="editorial-metric-sub">Complete pairings ready</span>
          </div>

          <div className="editorial-metric-card">
            <span className="editorial-metric-label">Neutral Anchor</span>
            <div className="editorial-metric-number tabular">
              {Math.round(insights.neutralShare * 100)}%
            </div>
            <span className="editorial-metric-sub">Timeless foundation core</span>
          </div>

          <div className="editorial-metric-card">
            <span className="editorial-metric-label">Wear Tracking</span>
            <div className="editorial-metric-number tabular">
              {insights.wear.itemsWithData}
            </div>
            <span className="editorial-metric-sub">
              of {insights.total} logged in diary
            </span>
          </div>
        </div>

        {insights.byColor.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>
              Dominant Palette
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {insights.byColor.slice(0, 6).map(({ color, count }) => (
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

      {/* 4. Recent Purchase Analyses & Wardrobe Insights Split Grid */}
      <div className="grid-2">
        {/* Recent Decisions */}
        <section className="surface surface-pad">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
            }}
          >
            <div>
              <div className="eyebrow">Decision Log</div>
              <h2 className="title-md">Recent purchase analyses</h2>
            </div>
            <Link to="/buy-or-skip" className="btn btn-ghost btn-sm">
              New analysis <ArrowRight size={14} />
            </Link>
          </div>

          {recentAnalyses.length === 0 ? (
            <div className="surface-subtle" style={{ padding: 18 }}>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                No analyses yet
              </div>
              <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                Test a piece you’re considering in Buy or Skip to see its Smart Buy Score, outfit
                combinations, and duplicate check.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentAnalyses.map((a) => {
                const title =
                  a.product.name?.trim() ||
                  `Untitled ${labelOf.category(a.product.category).toLowerCase()}`;
                return (
                  <Link
                    key={a.id}
                    to={`/buy-or-skip?analysis=${a.id}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '58px 1fr auto',
                      gap: 14,
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <GarmentVisual
                      image={a.product.image}
                      name={title}
                      category={a.product.category}
                      colors={a.product.colors}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="text-sm" style={{ fontWeight: 600 }}>
                          {title}
                        </span>
                        {a.isSample && <span className="badge badge-sample">Sample</span>}
                      </div>
                      <div className="text-xs text-secondary" style={{ marginTop: 2 }}>
                        {labelOf.category(a.product.category)}
                        {a.product.price ? ` · ${formatMoney(a.product.price)}` : ''} ·{' '}
                        {formatDate(a.createdAt)}
                      </div>
                    </div>
                    <ScoreBadge score={a.smartBuyScore} verdict={a.verdict} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Closet Balance & Intelligence */}
        <section className="surface surface-pad">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
            }}
          >
            <div>
              <div className="eyebrow">Closet Balance</div>
              <h2 className="title-md">Useful wardrobe insights</h2>
            </div>
            <Link to="/insights" className="btn btn-ghost btn-sm">
              Full insights <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="surface-subtle" style={{ padding: 14 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>
                Category balance
              </div>
              <div className="text-sm" style={{ marginTop: 4, lineHeight: 1.55 }}>
                {insights.gaps.length === 0
                  ? 'Your core categories (tops, knitwear, bottoms, outerwear, shoes, accessories) are well balanced against a standard capsule.'
                  : `Thin categories: ${insights.gaps
                      .map((g) => `${labelOf.categoryPlural(g.category)} (${g.owned} owned)`)
                      .join(', ')}.`}
              </div>
            </div>

            <div className="surface-subtle" style={{ padding: 14 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>
                Recorded wear data
              </div>
              <div className="text-sm" style={{ marginTop: 4, lineHeight: 1.55 }}>
                {insights.wear.itemsWithData === 0
                  ? 'No wear dates logged yet. Log wears on any item in My Wardrobe to unlock most-worn and cost-per-wear insights.'
                  : `${insights.wear.itemsWithData} of ${insights.total} items have recorded wear dates.${
                      insights.wear.mostWorn[0]
                        ? ` Most worn recently: ${insights.wear.mostWorn[0].item.name} (${insights.wear.mostWorn[0].recentWears} wears in 90 days).`
                        : ''
                    }`}
              </div>
            </div>

            <div className="surface-subtle" style={{ padding: 14 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>
                Cost per wear (≥3 recorded wears + price)
              </div>
              <div className="text-sm" style={{ marginTop: 4, lineHeight: 1.55 }}>
                {insights.costPerWear.computed.length === 0
                  ? 'Add a price and log at least 3 wears on an item to estimate its cost per wear.'
                  : `Best value so far: ${insights.costPerWear.computed[0].item.name} at ${formatMoney(
                      insights.costPerWear.computed[0].costPerWear,
                    )} per wear (${insights.costPerWear.computed[0].wears} wears).`}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 5. Recently Added Garments */}
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 18,
          }}
        >
          <div>
            <div className="eyebrow">Your Closet</div>
            <h2 className="title-md">Recently added clothing</h2>
          </div>
          <Link to="/wardrobe" className="btn btn-ghost btn-sm">
            View all ({wardrobe.length}) <ArrowRight size={14} />
          </Link>
        </div>

        {recentItems.length === 0 ? (
          <div className="surface surface-pad" style={{ padding: 20 }}>
            <div className="text-sm text-secondary">
              No garments cataloged yet. Add your first item to build your private digital archive.
            </div>
          </div>
        ) : (
          <div className="grid-4">
            {recentItems.map((item) => (
              <Link
                key={item.id}
                to={`/wardrobe?edit=${item.id}`}
                className="garment-card"
              >
                <div style={{ position: 'relative' }}>
                  <GarmentVisual
                    image={item.image}
                    name={item.name}
                    category={item.category}
                    colors={item.colors}
                  />
                  {item.isSample && (
                    <div className="garment-overlay-top">
                      <span className="badge badge-sample">Sample</span>
                    </div>
                  )}
                </div>
                <div className="garment-body">
                  <div className="text-xs text-muted">{labelOf.category(item.category)}</div>
                  <div className="title-sm">{item.name}</div>
                  <div className="text-xs text-secondary">
                    {item.colors.map(labelOf.color).join(', ')}
                    {item.price ? ` · ${formatMoney(item.price)}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
