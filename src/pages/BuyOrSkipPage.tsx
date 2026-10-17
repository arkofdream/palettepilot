import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Sparkles, Trash2, ArrowLeft } from 'lucide-react';
import { CURRENCIES, labelOf } from '@/domain/catalog';
import type {
  Category,
  ColorId,
  CurrencyCode,
  MatchSource,
  MatchSourceMode,
  Occasion,
  Season,
} from '@/domain/types';
import {
  selectMatchSource,
  useAnalyses,
  useDeleteAnalysis,
  useRunAnalysis,
  useSaveItem,
  useSettings,
  useWardrobe,
} from '@/hooks/data';
import { formatDate, formatMoney, parsePrice } from '@/lib/format';
import { inspectProductUrl } from '@/services/productUrl';
import { AnalysisReport, ScoreBadge } from '@/components/AnalysisReport';
import {
  CategoryPicker,
  ColorMultiPicker,
  OccasionMultiPicker,
  SeasonMultiPicker,
} from '@/components/AttributeInputs';
import { GarmentVisual } from '@/components/GarmentVisual';
import { ImagePicker } from '@/components/ImagePicker';

export function BuyOrSkipPage() {
  const { data: wardrobe = [] } = useWardrobe();
  const { data: analyses = [] } = useAnalyses();
  const { data: settings } = useSettings();
  const runAnalysis = useRunAnalysis();
  const deleteAnalysis = useDeleteAnalysis();
  const saveItem = useSaveItem();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeAnalysisId = searchParams.get('analysis');
  const activeAnalysis = analyses.find((a) => a.id === activeAnalysisId) ?? null;

  // Candidate form state
  const [name, setName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(settings?.currency ?? 'USD');
  const [category, setCategory] = useState<Category>('outerwear');
  const [colors, setColors] = useState<ColorId[]>(['camel']);
  const [seasons, setSeasons] = useState<Season[]>(['autumn', 'winter']);
  const [intendedUse, setIntendedUse] = useState<Occasion[]>(['work', 'casual']);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  // Wardrobe matching source
  const [sourceMode, setSourceMode] = useState<MatchSourceMode>('all');
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addedToWardrobeId, setAddedToWardrobeId] = useState<string | null>(null);

  const matchSource: MatchSource =
    sourceMode === 'custom' ? { mode: 'custom', itemIds: customIds } : { mode: sourceMode };
  const selectedWardrobe = selectMatchSource(wardrobe, matchSource);
  const urlInspection = urlInput.trim() ? inspectProductUrl(urlInput) : null;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (colors.length === 0) next.colors = 'Select at least one garment color.';
    if (seasons.length === 0) next.seasons = 'Select at least one season.';
    if (urlInput.trim() && urlInspection && !urlInspection.valid) {
      next.url = urlInspection.error ?? 'Enter a valid product URL.';
    }
    if (priceStr.trim()) {
      const p = parsePrice(priceStr);
      if (p === null || p < 0) next.price = 'Enter a valid non-negative price.';
    }
    if (sourceMode === 'custom' && customIds.length === 0) {
      next.source = 'Select at least one wardrobe item for custom matching.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const parsedPrice = priceStr.trim() ? parsePrice(priceStr) : null;
    const effectiveCurrency = settings?.currency ?? currency;
    const saved = await runAnalysis.mutateAsync({
      product: {
        name: name.trim() || undefined,
        url: urlInspection?.valid ? urlInspection.input : undefined,
        price:
          parsedPrice !== null
            ? { amount: parsedPrice, currency: priceStr ? currency : effectiveCurrency }
            : undefined,
        category,
        colors,
        seasons,
        intendedUse,
      },
      image: imageBlob,
      matchSource,
    });
    setSearchParams({ analysis: saved.id });
  }

  function toggleCustomItem(id: string) {
    setCustomIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div>
      <header className="page-header">
        <div className="page-header-copy">
          <div className="eyebrow">Purchase Decision Support</div>
          <h1 className="title-xl">Buy or Skip</h1>
          <p className="text-secondary">
            Evaluate a garment before buying. Scores are calculated transparently against your
            existing wardrobe — never generic rules of thumb.
          </p>
        </div>
        {activeAnalysis && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSearchParams({})}
          >
            <ArrowLeft size={15} /> Evaluate another item
          </button>
        )}
      </header>

      {activeAnalysis ? (
        <AnalysisReport
          analysis={activeAnalysis}
          wardrobe={wardrobe}
          savingToWardrobe={addedToWardrobeId === activeAnalysis.id}
          onSaveToWardrobe={async () => {
            await saveItem.mutateAsync({
              draft: {
                name:
                  activeAnalysis.product.name?.trim() ||
                  `New ${labelOf.category(activeAnalysis.product.category).toLowerCase()}`,
                category: activeAnalysis.product.category,
                colors: activeAnalysis.product.colors,
                seasons: activeAnalysis.product.seasons,
                occasions:
                  activeAnalysis.product.intendedUse.length > 0
                    ? activeAnalysis.product.intendedUse
                    : ['casual'],
                price: activeAnalysis.product.price,
                image: activeAnalysis.product.image,
              },
            });
            setAddedToWardrobeId(activeAnalysis.id);
          }}
        />
      ) : (
        <div className="grid-2 buy-or-skip-grid">
          {/* Left: Candidate Form */}
          <form className="surface surface-pad-lg" onSubmit={handleSubmit} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div>
                <div className="eyebrow">Step 1 · Candidate garment</div>
                <h2 className="title-md" style={{ marginTop: 2 }}>
                  What are you considering buying?
                </h2>
              </div>

              <ImagePicker
                label="Product photograph"
                hint="Upload a screenshot or product photo for visual reference. (Image recognition is not connected yet, so select category and colors below.)"
                onSelect={(blob) => setImageBlob(blob)}
              />

              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="cand-name">
                    <span>Product name</span>
                    <span className="field-hint">Optional</span>
                  </label>
                  <input
                    id="cand-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Tailored linen blazer"
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="cand-price">
                    <span>Price</span>
                    <span className="field-hint">Optional · for budget fit</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      aria-label="Currency"
                      className="select"
                      style={{ width: 92 }}
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id}
                        </option>
                      ))}
                    </select>
                    <input
                      id="cand-price"
                      type="number"
                      min="0"
                      step="1"
                      className={`input ${errors.price ? 'input-error' : ''}`}
                      value={priceStr}
                      onChange={(e) => setPriceStr(e.target.value)}
                      placeholder="165"
                    />
                  </div>
                  {errors.price && <div className="field-error">{errors.price}</div>}
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="cand-url">
                  <span>Product URL</span>
                  <span className="field-hint">Optional · saved as reference link</span>
                </label>
                <input
                  id="cand-url"
                  className={`input ${errors.url ? 'input-error' : ''}`}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://shop.example.com/products/item"
                />
                {errors.url && <div className="field-error">{errors.url}</div>}
                {urlInspection?.valid && (
                  <div className="text-xs text-muted">
                    <strong>Note on retailer links ({urlInspection.hostname}):</strong>{' '}
                    {urlInspection.fetchNote}
                  </div>
                )}
              </div>

              <div className="field">
                <div className="field-label">
                  <span>Category *</span>
                </div>
                <CategoryPicker value={category} onChange={setCategory} />
              </div>

              <div className="field">
                <div className="field-label">
                  <span>Colors * (first selected is dominant)</span>
                  <span className="field-hint">{colors.length}/3 selected</span>
                </div>
                <ColorMultiPicker value={colors} onChange={setColors} max={3} />
                {errors.colors && <div className="field-error">{errors.colors}</div>}
              </div>

              <div className="field">
                <div className="field-label">
                  <span>Seasons *</span>
                </div>
                <SeasonMultiPicker value={seasons} onChange={setSeasons} />
                {errors.seasons && <div className="field-error">{errors.seasons}</div>}
              </div>

              <div className="field">
                <div className="field-label">
                  <span>Intended use</span>
                  <span className="field-hint">Optional · improves occasion matching</span>
                </div>
                <OccasionMultiPicker value={intendedUse} onChange={setIntendedUse} />
              </div>

              {/* Step 2: Matching Source */}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div>
                  <div className="eyebrow">Step 2 · Matching source</div>
                  <div className="title-sm" style={{ marginTop: 2 }}>
                    Which wardrobe items should we match against?
                  </div>
                </div>

                <div className="chip-group" role="radiogroup" aria-label="Wardrobe matching source">
                  <button
                    type="button"
                    className={`chip ${sourceMode === 'all' ? 'selected' : ''}`}
                    onClick={() => setSourceMode('all')}
                  >
                    Entire wardrobe ({wardrobe.length} items)
                  </button>
                  <button
                    type="button"
                    className={`chip ${sourceMode === 'mine' ? 'selected' : ''}`}
                    onClick={() => setSourceMode('mine')}
                  >
                    Only items I added ({wardrobe.filter((w) => !w.isSample).length})
                  </button>
                  <button
                    type="button"
                    className={`chip ${sourceMode === 'custom' ? 'selected' : ''}`}
                    onClick={() => {
                      setSourceMode('custom');
                      if (customIds.length === 0) setCustomIds(wardrobe.map((w) => w.id));
                    }}
                  >
                    Custom subset ({sourceMode === 'custom' ? customIds.length : 'select'})
                  </button>
                </div>

                {sourceMode === 'custom' && (
                  <div
                    className="surface-subtle"
                    style={{
                      padding: 12,
                      maxHeight: 200,
                      overflowY: 'auto',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                    }}
                  >
                    {wardrobe.map((w) => {
                      const on = customIds.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          className={`chip ${on ? 'selected' : ''}`}
                          onClick={() => toggleCustomItem(w.id)}
                        >
                          {w.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {errors.source && <div className="field-error">{errors.source}</div>}

                <div className="text-xs text-secondary">
                  Currently matching against <strong>{selectedWardrobe.length}</strong> wardrobe
                  pieces.
                </div>

                {wardrobe.length === 0 && (
                  <div className="notice notice-caution" style={{ marginTop: 8 }}>
                    <span>
                      Your wardrobe is currently empty. PalettePilot requires at least 3 complementary garments to calculate a Smart Buy Score. Analyses will report “More Data Needed” until you catalog items in My Wardrobe.
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={runAnalysis.isPending}
                >
                  <Sparkles size={16} />
                  {runAnalysis.isPending
                    ? 'Analyzing wardrobe fit…'
                    : 'Run Wardrobe Match Analysis'}
                </button>
              </div>
            </div>
          </form>

          {/* Right: Saved / Sample Analyses History */}
          <aside className="surface surface-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="eyebrow">Analysis Archive</div>
              <h2 className="title-md" style={{ marginTop: 2 }}>
                Previous purchase analyses
              </h2>
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                Select any analysis below to inspect its full Smart Buy Score breakdown and outfit
                suggestions.
              </p>
            </div>

            {analyses.length === 0 ? (
              <div className="surface-subtle" style={{ padding: 16 }}>
                <div className="text-sm">No saved analyses yet.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analyses.map((a) => {
                  const title =
                    a.product.name?.trim() ||
                    `Untitled ${labelOf.category(a.product.category).toLowerCase()}`;
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '54px 1fr auto',
                        gap: 12,
                        alignItems: 'center',
                        padding: 10,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <GarmentVisual
                        image={a.product.image}
                        name={title}
                        category={a.product.category}
                        colors={a.product.colors}
                      />
                      <button
                        type="button"
                        onClick={() => setSearchParams({ analysis: a.id })}
                        style={{ textAlign: 'left', padding: 0 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="text-sm" style={{ fontWeight: 600 }}>
                            {title}
                          </span>
                          {a.isSample && <span className="badge badge-sample">Sample</span>}
                        </div>
                        <div className="text-xs text-secondary" style={{ marginTop: 2 }}>
                          {a.product.price ? `${formatMoney(a.product.price)} · ` : ''}
                          {formatDate(a.createdAt)}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <ScoreBadge score={a.smartBuyScore} verdict={a.verdict} />
                        </div>
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={`Delete analysis for ${title}`}
                        onClick={() => deleteAnalysis.mutate(a.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
