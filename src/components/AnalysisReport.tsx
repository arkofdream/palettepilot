import { Link } from 'react-router';
import { ExternalLink, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { labelOf } from '@/domain/catalog';
import type {
  OutfitSuggestion,
  PurchaseAnalysis,
  ScoreFactor,
  Verdict,
  WardrobeItem,
} from '@/domain/types';
import { formatDate, formatMoney } from '@/lib/format';
import { CANDIDATE_ID, FACTOR_DESCRIPTIONS, VERDICT_THRESHOLDS } from '@/services/engine/scoring';
import { GarmentVisual } from './GarmentVisual';

export function verdictMeta(verdict: Verdict): {
  label: string;
  badgeClass: string;
  headline: string;
} {
  switch (verdict) {
    case 'buy':
      return {
        label: 'Strong Buy Fit',
        badgeClass: 'badge-positive',
        headline: 'Strong wardrobe fit — integrates cleanly with pieces you already own.',
      };
    case 'consider':
      return {
        label: 'Worth Considering',
        badgeClass: 'badge-caution',
        headline: 'Mixed case — works with parts of your wardrobe, with trade-offs to weigh.',
      };
    case 'skip':
      return {
        label: 'Skip for Now',
        badgeClass: 'badge-negative',
        headline: 'Weak fit — either overlaps with what you own or needs extra purchases to work.',
      };
    default:
      return {
        label: 'More Data Needed',
        badgeClass: 'badge-info',
        headline: 'Your wardrobe needs a few more items in complementary categories to score this piece.',
      };
  }
}

export function ScoreBadge({
  score,
  verdict,
}: {
  score: number | null;
  verdict: Verdict;
}) {
  const meta = verdictMeta(verdict);
  return (
    <span className={`badge ${meta.badgeClass}`}>
      {score !== null ? `${score}/100 · ${meta.label}` : meta.label}
    </span>
  );
}

export function AnalysisReport({
  analysis,
  wardrobe,
  onSaveToWardrobe,
  savingToWardrobe,
}: {
  analysis: PurchaseAnalysis;
  wardrobe: WardrobeItem[];
  onSaveToWardrobe?: () => void;
  savingToWardrobe?: boolean;
}) {
  const meta = verdictMeta(analysis.verdict);
  const itemMap = new Map(wardrobe.map((w) => [w.id, w]));
  const productTitle =
    analysis.product.name?.trim() ||
    `Untitled ${labelOf.category(analysis.product.category).toLowerCase()}`;

  const assessedFactors = analysis.factors.filter((f) => f.status === 'assessed');
  const topBooster = [...assessedFactors].sort((a, b) => b.score - a.score)[0];
  const topLimiter = [...assessedFactors].sort((a, b) => a.score - b.score)[0];
  const hasBooster = Boolean(topBooster && topBooster.score >= 60);
  const hasLimiter = Boolean(topLimiter && topLimiter.score < 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {analysis.isSample && (
        <div className="notice notice-info">
          <div>
            <strong>Sample analysis (demo data)</strong> — This report was generated against the
            bundled sample wardrobe so you can inspect how every score factor is explained.
          </div>
          <span className="badge badge-sample">Sample</span>
        </div>
      )}

      {/* Top Summary Card */}
      <div className="surface surface-pad-lg">
        <div className="analysis-hero-grid">
          <div>
            <GarmentVisual
              image={analysis.product.image}
              name={productTitle}
              category={analysis.product.category}
              colors={analysis.product.colors}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
              <span className="badge">
                {analysis.engine.usesAI ? 'AI-assisted' : 'Rule-based · No AI'}
              </span>
              <span className="badge">Confidence: {analysis.confidence}</span>
              <span className="text-xs text-muted">
                Evaluated {formatDate(analysis.createdAt, 'long')} against {analysis.wardrobeSize}{' '}
                wardrobe items
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 16,
              }}
            >
              <div>
                <h2 className="title-lg">{productTitle}</h2>
                <div className="text-sm text-secondary" style={{ marginTop: 4 }}>
                  {labelOf.category(analysis.product.category)} ·{' '}
                  {analysis.product.colors.map(labelOf.color).join(', ')}
                  {analysis.product.price ? ` · ${formatMoney(analysis.product.price)}` : ''}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div className="eyebrow">Smart Buy Score</div>
                <div
                  className="font-display tabular"
                  style={{ fontSize: '3.4rem', lineHeight: 1, marginTop: 2 }}
                >
                  {analysis.smartBuyScore !== null ? analysis.smartBuyScore : '—'}
                  <span className="text-muted" style={{ fontSize: '1.35rem' }}>
                    /100
                  </span>
                </div>
                <div className="text-xs text-muted">
                  Decision-support estimate (≥{VERDICT_THRESHOLDS.buy} buy ·{' '}
                  {VERDICT_THRESHOLDS.consider}–{VERDICT_THRESHOLDS.buy - 1} consider)
                </div>
              </div>
            </div>

            <p style={{ fontSize: 15.5, color: 'var(--text-primary)' }}>{meta.headline}</p>

            {/* Itemized explanation */}
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div className="eyebrow">Why this recommendation</div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                {analysis.explanation.map((pt, i) => (
                  <li
                    key={i}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 14 }}
                  >
                    <ToneIcon tone={pt.tone} />
                    <span>{pt.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Assessment Confidence & Data Completeness Reasons */}
            {analysis.confidenceReasons && analysis.confidenceReasons.length > 0 && (
              <div
                className="surface-subtle"
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--accent-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={14} className="text-secondary" />
                  <span className="eyebrow" style={{ fontSize: 11 }}>
                    Confidence Rationale & Evaluation Basis ({analysis.confidence.toUpperCase()})
                  </span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                  className="text-xs text-secondary"
                >
                  {analysis.confidenceReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.styleNotes.length > 0 && (
              <div
                className="surface-subtle"
                style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <div className="eyebrow" style={{ fontSize: 10 }}>
                  Personal style alignment
                </div>
                {analysis.styleNotes.map((n, i) => (
                  <div key={i} className="text-sm">
                    {n}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 4 }}>
              {onSaveToWardrobe && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onSaveToWardrobe}
                  disabled={savingToWardrobe}
                >
                  {savingToWardrobe ? 'Added to wardrobe' : 'I bought it — add to My Wardrobe'}
                </button>
              )}
              {analysis.product.url && (
                <a
                  href={analysis.product.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  Reference product link <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Factor Breakdown */}
      <section className="surface surface-pad">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div className="eyebrow">Transparent scoring</div>
            <h3 className="title-md" style={{ marginTop: 2 }}>
              Factor-by-factor breakdown
            </h3>
          </div>
          <p className="text-xs text-muted">
            When a factor cannot be assessed (e.g. no price given), its weight is redistributed
            proportionally across assessed factors.
          </p>
        </div>

        {/* Key Drivers Highlight */}
        {(hasBooster || hasLimiter) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            {hasBooster && topBooster && (
              <div
                className="surface-subtle"
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="badge badge-positive" style={{ fontSize: 10 }}>
                  Top Driver
                </span>
                <span className="text-xs">
                  <strong>{topBooster.label}</strong> ({topBooster.score}/100) — {topBooster.summary}
                </span>
              </div>
            )}
            {hasLimiter && topLimiter && (
              <div
                className="surface-subtle"
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="badge badge-caution" style={{ fontSize: 10 }}>
                  Score Drag
                </span>
                <span className="text-xs">
                  <strong>{topLimiter.label}</strong> ({topLimiter.score}/100) — {topLimiter.summary}
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {analysis.factors.map((f) => (
            <FactorRow
              key={f.id}
              factor={f}
              isBooster={hasBooster && topBooster?.id === f.id}
              isLimiter={hasLimiter && topLimiter?.id === f.id}
            />
          ))}
        </div>
      </section>

      {/* Outfits & Similar Items */}
      <div className="grid-2">
        <section className="surface surface-pad">
          <div className="eyebrow">Outfit combinations</div>
          <h3 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
            Suggested outfits using your wardrobe
          </h3>
          <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
            Every piece below is taken directly from your wardrobe — PalettePilot never invents
            items you don’t own.
          </p>

          {analysis.outfits.length === 0 ? (
            <div className="surface-subtle" style={{ padding: 18 }}>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                No complete outfits found yet
              </div>
              <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                A complete outfit requires a top + bottom + shoes (or a dress + shoes) that share
                season, occasion, and color harmony. Add complementary pieces in{' '}
                <Link to="/wardrobe" style={{ textDecoration: 'underline' }}>
                  My Wardrobe
                </Link>{' '}
                to unlock outfit combinations.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {analysis.outfits.map((o, idx) => (
                <OutfitCard
                  key={o.id}
                  index={idx + 1}
                  outfit={o}
                  analysis={analysis}
                  itemMap={itemMap}
                />
              ))}
            </div>
          )}
        </section>

        <section className="surface surface-pad">
          <div className="eyebrow">Duplication check</div>
          <h3 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
            Similar items already owned
          </h3>
          <p className="text-xs text-muted" style={{ marginBottom: 18 }}>
            Checks category, dominant color, seasons, and occasions for overlap.
          </p>

          {analysis.similarItems.length === 0 ? (
            <div className="surface-subtle" style={{ padding: 18 }}>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                No close duplicates in your wardrobe
              </div>
              <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                None of the {analysis.wardrobeSize} evaluated items closely match this piece’s
                category and color palette.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {analysis.similarItems.map((sim) => {
                const owned = itemMap.get(sim.itemId);
                return (
                  <div
                    key={sim.itemId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '64px 1fr auto',
                      gap: 14,
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {owned ? (
                      <GarmentVisual
                        image={owned.image}
                        name={owned.name}
                        category={owned.category}
                        colors={owned.colors}
                      />
                    ) : (
                      <div className="surface-subtle" style={{ height: 80 }} />
                    )}
                    <div>
                      <div className="text-sm" style={{ fontWeight: 600 }}>
                        {owned ? owned.name : 'Previously removed item'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {sim.reasons.map((r, ri) => (
                          <span
                            key={ri}
                            className="badge badge-caution"
                            style={{ fontSize: 10, padding: '2px 6px', textTransform: 'capitalize' }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span
                      className={`badge ${sim.similarity >= 0.85 ? 'badge-negative' : 'badge-caution'}`}
                    >
                      {Math.round(sim.similarity * 100)}% overlap
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Data Provenance & Honesty Table */}
      <section className="surface surface-pad">
        <div className="eyebrow">Data provenance & limits</div>
        <h3 className="title-md" style={{ marginTop: 2, marginBottom: 6 }}>
          What was analyzed vs. unavailable
        </h3>
        <p className="text-xs text-muted" style={{ marginBottom: 16 }}>
          PalettePilot distinguishes verified inputs from data that could not be inspected in the
          browser.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {analysis.dataSources.map((ds) => (
            <div
              key={ds.label}
              style={{
                padding: '12px 14px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="text-sm" style={{ fontWeight: 600 }}>
                  {ds.label}
                </span>
                <DataSourceBadge status={ds.status} />
              </div>
              <p className="text-xs text-secondary">{ds.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FactorRow({
  factor,
  isBooster,
  isLimiter,
}: {
  factor: ScoreFactor;
  isBooster?: boolean;
  isLimiter?: boolean;
}) {
  const assessed = factor.status === 'assessed';
  const appliedPct = Math.round(factor.appliedWeight * 100);
  const nominalPct = Math.round(factor.weight * 100);

  return (
    <div
      style={{
        paddingBottom: 16,
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span className="title-sm">{factor.label}</span>
          {isBooster && (
            <span className="badge badge-positive" style={{ fontSize: 10 }}>
              Top Driver
            </span>
          )}
          {isLimiter && (
            <span className="badge badge-caution" style={{ fontSize: 10 }}>
              Score Drag
            </span>
          )}
          <span className="text-xs text-muted">
            {assessed
              ? `Weight: ${appliedPct}%${appliedPct !== nominalPct ? ` (nominal ${nominalPct}%)` : ''}`
              : `Excluded (nominal ${nominalPct}%)`}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
          {assessed ? `${factor.score} / 100` : 'Not assessed'}
        </div>
      </div>

      <div className="score-meter">
        <div
          className="score-meter-fill"
          style={{
            width: assessed ? `${factor.score}%` : '0%',
            backgroundColor: !assessed
              ? 'transparent'
              : factor.score >= 70
                ? 'var(--tone-positive)'
                : factor.score >= 45
                  ? 'var(--text-primary)'
                  : 'var(--tone-negative)',
          }}
        />
      </div>

      <div className="text-sm">{factor.summary}</div>
      <div className="text-xs text-muted">{FACTOR_DESCRIPTIONS[factor.id]}</div>

      {factor.details.length > 0 && (
        <ul
          className="text-xs text-secondary"
          style={{ margin: '2px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {factor.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutfitCard({
  index,
  outfit,
  analysis,
  itemMap,
}: {
  index: number;
  outfit: OutfitSuggestion;
  analysis: PurchaseAnalysis;
  itemMap: Map<string, WardrobeItem>;
}) {
  return (
    <div
      style={{
        padding: 14,
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">
          Look 0{index}
          {outfit.occasion ? ` · ${labelOf.occasion(outfit.occasion)}` : ''}
        </span>
        <span className="text-xs text-muted tabular">
          Harmony {Math.round(outfit.harmony * 100)}%
        </span>
      </div>

      <div className="outfit-items-grid">
        {outfit.itemIds.map((id) => {
          if (id === CANDIDATE_ID) {
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 8,
                  border: '1.5px solid var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-canvas)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    className="badge"
                    style={{
                      fontSize: 9,
                      padding: '2px 5px',
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--bg-canvas)',
                    }}
                  >
                    Considering
                  </span>
                </div>
                <GarmentVisual
                  image={analysis.product.image}
                  name={analysis.product.name}
                  category={analysis.product.category}
                  colors={analysis.product.colors}
                />
                <span className="text-xs" style={{ fontWeight: 600 }}>
                  {analysis.product.name || 'Candidate piece'}
                </span>
                <span className="text-xs text-muted">{labelOf.category(analysis.product.category)}</span>
              </div>
            );
          }
          const item = itemMap.get(id);
          if (!item) return null;
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 8,
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  className="badge badge-positive"
                  style={{ fontSize: 9, padding: '2px 5px' }}
                >
                  Owned
                </span>
              </div>
              <GarmentVisual
                image={item.image}
                name={item.name}
                category={item.category}
                colors={item.colors}
              />
              <span className="text-xs" style={{ fontWeight: 500 }}>
                {item.name}
              </span>
              <span className="text-xs text-muted">{labelOf.category(item.category)}</span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-secondary">{outfit.rationale}</p>
    </div>
  );
}

function ToneIcon({ tone }: { tone: 'positive' | 'neutral' | 'negative' | 'info' }) {
  const style = { flexShrink: 0, marginTop: 3 };
  if (tone === 'positive') return <CheckCircle2 size={15} color="var(--tone-positive)" style={style} />;
  if (tone === 'negative') return <XCircle size={15} color="var(--tone-negative)" style={style} />;
  if (tone === 'neutral') return <AlertTriangle size={15} color="var(--tone-caution)" style={style} />;
  return <Info size={15} color="var(--tone-info)" style={style} />;
}

function DataSourceBadge({
  status,
}: {
  status: 'used' | 'provided-not-analyzed' | 'unavailable' | 'missing';
}) {
  switch (status) {
    case 'used':
      return <span className="badge badge-positive">Used</span>;
    case 'provided-not-analyzed':
      return <span className="badge badge-caution">Saved · Not analyzed</span>;
    case 'unavailable':
      return <span className="badge badge-info">Unavailable</span>;
    default:
      return <span className="badge">Not provided</span>;
  }
}
