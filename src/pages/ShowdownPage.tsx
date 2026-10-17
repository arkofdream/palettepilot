import { useState, type FormEvent } from 'react';
import { Bookmark, Check, Scale, Trash2 } from 'lucide-react';
import { CURRENCIES, labelOf } from '@/domain/catalog';
import type {
  Category,
  ColorId,
  Comparison,
  CurrencyCode,
  Occasion,
  PurchaseAnalysis,
  Season,
} from '@/domain/types';
import {
  runAnalysis,
  useAnalyses,
  useComparisons,
  useDeleteComparison,
  useSaveComparison,
  useSettings,
  useWardrobe,
} from '@/hooks/data';
import { formatDate, formatMoney, parsePrice } from '@/lib/format';
import { buildComparison, productLabel } from '@/services/comparison';
import { ScoreBadge } from '@/components/AnalysisReport';
import {
  CategoryPicker,
  ColorMultiPicker,
  OccasionMultiPicker,
  SeasonMultiPicker,
} from '@/components/AttributeInputs';
import { GarmentVisual } from '@/components/GarmentVisual';
import { ImagePicker } from '@/components/ImagePicker';

interface CandidateDraftState {
  name: string;
  priceStr: string;
  currency: CurrencyCode;
  category: Category;
  colors: ColorId[];
  seasons: Season[];
  intendedUse: Occasion[];
  imageBlob: Blob | null;
}

export function ShowdownPage() {
  const { data: wardrobe = [] } = useWardrobe();
  const { data: analyses = [] } = useAnalyses();
  const { data: comparisons = [] } = useComparisons();
  const { data: settings } = useSettings();
  const saveComparison = useSaveComparison();
  const deleteComparison = useDeleteComparison();

  const defaultCurrency = settings?.currency ?? 'USD';

  const [optionA, setOptionA] = useState<CandidateDraftState>({
    name: 'Cream cable-knit sweater',
    priceStr: '140',
    currency: defaultCurrency,
    category: 'knitwear',
    colors: ['cream'],
    seasons: ['autumn', 'winter'],
    intendedUse: ['casual', 'weekend'],
    imageBlob: null,
  });

  const [optionB, setOptionB] = useState<CandidateDraftState>({
    name: 'Navy cotton crewneck',
    priceStr: '89',
    currency: defaultCurrency,
    category: 'knitwear',
    colors: ['navy'],
    seasons: ['spring', 'autumn', 'winter'],
    intendedUse: ['casual', 'work'],
    imageBlob: null,
  });

  const [activeComparison, setActiveComparison] = useState<Comparison | null>(
    () => comparisons[0] ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadFromExistingAnalysis(side: 'A' | 'B', id: string) {
    const found = analyses.find((a) => a.id === id);
    if (!found) return;
    const next: CandidateDraftState = {
      name: found.product.name ?? '',
      priceStr: found.product.price ? String(found.product.price.amount) : '',
      currency: found.product.price?.currency ?? defaultCurrency,
      category: found.product.category,
      colors: found.product.colors,
      seasons: found.product.seasons,
      intendedUse: found.product.intendedUse,
      imageBlob: null,
    };
    if (side === 'A') setOptionA(next);
    else setOptionB(next);
  }

  async function handleCompare(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (optionA.colors.length === 0 || optionB.colors.length === 0) {
      setError('Please select at least one color for both options.');
      return;
    }
    if (optionA.seasons.length === 0 || optionB.seasons.length === 0) {
      setError('Please select at least one season for both options.');
      return;
    }
    setBusy(true);
    try {
      const toInput = (s: CandidateDraftState) => {
        const p = s.priceStr.trim() ? parsePrice(s.priceStr) : null;
        return {
          product: {
            name: s.name.trim() || undefined,
            price: p !== null ? { amount: p, currency: s.currency } : undefined,
            category: s.category,
            colors: s.colors,
            seasons: s.seasons,
            intendedUse: s.intendedUse,
          },
          image: s.imageBlob,
          matchSource: { mode: 'all' as const },
        };
      };
      const [resA, resB] = await Promise.all([
        runAnalysis(toInput(optionA)),
        runAnalysis(toInput(optionB)),
      ]);
      const cmp = buildComparison(resA, resB);
      setActiveComparison(cmp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare options.');
    } finally {
      setBusy(false);
    }
  }

  const displayedComparison = activeComparison ?? comparisons[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-copy">
          <div className="eyebrow">Side-by-Side Evaluation</div>
          <h1 className="title-xl">Shopping Showdown</h1>
          <p className="text-secondary">
            Torn between two pieces? Compare how each option pairs with your wardrobe, whether
            either duplicates what you own, and how they fit your budget.
          </p>
        </div>
      </header>

      {/* Comparison Result Banner */}
      {displayedComparison && (
        <ComparisonResultView
          comparison={displayedComparison}
          onSave={async () => {
            const saved = await saveComparison.mutateAsync(displayedComparison);
            setActiveComparison(saved);
          }}
          saving={saveComparison.isPending}
        />
      )}

      {wardrobe.length < 3 && (
        <div className="notice notice-caution">
          <span>
            Your wardrobe has {wardrobe.length} item{wardrobe.length === 1 ? '' : 's'} (minimum 3 required for full scoring). Showdown can compare garment attributes, but cannot calculate numerical Smart Buy Scores until more wardrobe items are cataloged.
          </span>
        </div>
      )}

      {/* Side-by-side Form */}
      <form onSubmit={handleCompare} noValidate>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
          }}
        >
          <div>
            <div className="eyebrow">Configure candidates</div>
            <h2 className="title-md">Compare two products</h2>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            <Scale size={16} /> {busy ? 'Comparing…' : 'Evaluate side by side'}
          </button>
        </div>

        {error && (
          <div className="notice notice-negative" style={{ marginBottom: 18 }}>
            {error}
          </div>
        )}

        <div className="grid-2">
          <CandidateColumn
            label="Option A"
            state={optionA}
            onChange={setOptionA}
            analyses={analyses}
            onLoadAnalysis={(id) => loadFromExistingAnalysis('A', id)}
          />
          <CandidateColumn
            label="Option B"
            state={optionB}
            onChange={setOptionB}
            analyses={analyses}
            onLoadAnalysis={(id) => loadFromExistingAnalysis('B', id)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <span className="text-xs text-muted">
            Both options are evaluated against your {wardrobe.length} wardrobe items using identical
            scoring weights.
          </span>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Scale size={15} /> {busy ? 'Comparing…' : 'Run comparison'}
          </button>
        </div>
      </form>

      {/* Saved Comparisons */}
      <section className="surface surface-pad">
        <div className="eyebrow">Saved Showdowns</div>
        <h2 className="title-md" style={{ marginTop: 2, marginBottom: 14 }}>
          Saved comparisons ({comparisons.length})
        </h2>

        {comparisons.length === 0 ? (
          <p className="text-sm text-secondary">
            No saved comparisons yet. Run a showdown above and click “Save comparison” to keep it
            for reference.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comparisons.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveComparison(c)}
                  style={{ textAlign: 'left', padding: 0 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="title-sm">{c.title}</span>
                    {c.isSample && <span className="badge badge-sample">Sample</span>}
                  </div>
                  <div className="text-xs text-secondary" style={{ marginTop: 2 }}>
                    {formatDate(c.createdAt)} · {c.reasons[0]}
                  </div>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActiveComparison(c)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Delete comparison ${c.title}`}
                    onClick={() => {
                      deleteComparison.mutate(c.id);
                      if (activeComparison?.id === c.id) setActiveComparison(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CandidateColumn({
  label,
  state,
  onChange,
  analyses,
  onLoadAnalysis,
}: {
  label: string;
  state: CandidateDraftState;
  onChange: (next: CandidateDraftState) => void;
  analyses: PurchaseAnalysis[];
  onLoadAnalysis: (id: string) => void;
}) {
  return (
    <div className="surface surface-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span className="eyebrow">{label}</span>
        {analyses.length > 0 && (
          <select
            aria-label={`Prefill ${label} from a recent analysis`}
            className="select"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onLoadAnalysis(e.target.value);
            }}
          >
            <option value="">Prefill from analyzed item…</option>
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.product.name || labelOf.category(a.product.category)}
              </option>
            ))}
          </select>
        )}
      </div>

      <ImagePicker
        label={`${label} photo`}
        onSelect={(blob) => onChange({ ...state, imageBlob: blob })}
      />

      <div className="grid-2">
        <div className="field">
          <label className="field-label">
            <span>Name</span>
          </label>
          <input
            className="input"
            value={state.name}
            onChange={(e) => onChange({ ...state, name: e.target.value })}
            placeholder={label}
          />
        </div>
        <div className="field">
          <label className="field-label">
            <span>Price</span>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              aria-label={`${label} currency`}
              className="select"
              style={{ width: 84 }}
              value={state.currency}
              onChange={(e) => onChange({ ...state, currency: e.target.value as CurrencyCode })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              className="input"
              value={state.priceStr}
              onChange={(e) => onChange({ ...state, priceStr: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          <span>Category</span>
        </div>
        <CategoryPicker
          value={state.category}
          onChange={(category) => onChange({ ...state, category })}
        />
      </div>

      <div className="field">
        <div className="field-label">
          <span>Colors</span>
        </div>
        <ColorMultiPicker
          value={state.colors}
          onChange={(colors) => onChange({ ...state, colors })}
        />
      </div>

      <div className="field">
        <div className="field-label">
          <span>Seasons</span>
        </div>
        <SeasonMultiPicker
          value={state.seasons}
          onChange={(seasons) => onChange({ ...state, seasons })}
        />
      </div>

      <div className="field">
        <div className="field-label">
          <span>Intended use</span>
        </div>
        <OccasionMultiPicker
          value={state.intendedUse}
          onChange={(intendedUse) => onChange({ ...state, intendedUse })}
        />
      </div>
    </div>
  );
}

function ComparisonResultView({
  comparison,
  onSave,
  saving,
}: {
  comparison: Comparison;
  onSave: () => void;
  saving: boolean;
}) {
  const { analysisA: a, analysisB: b } = comparison;
  const nameA = productLabel(a, 'Option A');
  const nameB = productLabel(b, 'Option B');

  const headline =
    comparison.winner === 'A'
      ? `${nameA} is the stronger fit for your wardrobe`
      : comparison.winner === 'B'
        ? `${nameB} is the stronger fit for your wardrobe`
        : comparison.winner === 'neither'
          ? 'Neither option is a strong match right now'
          : a.smartBuyScore === null || b.smartBuyScore === null
            ? 'Insufficient wardrobe data to declare a winner'
            : `${nameA} and ${nameB} are a near tie`;

  return (
    <section className="surface surface-pad-lg">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="eyebrow">Showdown Verdict</span>
            {comparison.isSample && <span className="badge badge-sample">Sample</span>}
          </div>
          <h2 className="title-lg" style={{ marginTop: 4 }}>
            {headline}
          </h2>
          <ul
            style={{
              margin: '10px 0 0',
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
            className="text-sm text-secondary"
          >
            {comparison.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSave}
          disabled={saving || comparison.saved}
        >
          {comparison.saved ? (
            <>
              <Check size={15} /> Saved
            </>
          ) : (
            <>
              <Bookmark size={15} /> Save comparison
            </>
          )}
        </button>
      </div>

      {/* Side-by-side summary cards + factor table */}
      <div className="grid-2" style={{ marginTop: 22 }}>
        {[
          { side: 'A' as const, analysis: a, name: nameA },
          { side: 'B' as const, analysis: b, name: nameB },
        ].map(({ side, analysis, name }) => {
          const isWinner = comparison.winner === side;
          return (
            <div
              key={side}
              style={{
                padding: 18,
                border: isWinner
                  ? '1.5px solid var(--text-primary)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isWinner ? 'var(--bg-canvas)' : 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div className="showdown-candidate-header">
                <GarmentVisual
                  image={analysis.product.image}
                  name={name}
                  category={analysis.product.category}
                  colors={analysis.product.colors}
                />
                <div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="eyebrow">Option {side}</span>
                    {isWinner && <span className="badge badge-positive">Recommended</span>}
                  </div>
                  <div className="title-md" style={{ marginTop: 2 }}>
                    {name}
                  </div>
                  <div className="text-xs text-secondary">
                    {labelOf.category(analysis.product.category)} ·{' '}
                    {analysis.product.colors.map(labelOf.color).join(', ')}
                    {analysis.product.price ? ` · ${formatMoney(analysis.product.price)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="font-display tabular" style={{ fontSize: '2.4rem', lineHeight: 1 }}>
                    {analysis.smartBuyScore ?? '—'}
                  </div>
                  <ScoreBadge score={analysis.smartBuyScore} verdict={analysis.verdict} />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 12,
                }}
              >
                {analysis.factors.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      fontSize: 13,
                    }}
                  >
                    <span className="text-secondary">{f.label}</span>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {f.status === 'assessed' ? `${f.score}/100` : 'Not assessed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
