import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarPlus, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES, COLORS, OCCASIONS, SEASONS, COLOR_MAP, labelOf } from '@/domain/catalog';
import type { Category, ColorId, Occasion, Season, WardrobeItem } from '@/domain/types';
import {
  useDataAdmin,
  useDeleteItem,
  useLogWear,
  useSaveItem,
  useSettings,
  useWardrobe,
} from '@/hooks/data';
import { formatMoney } from '@/lib/format';
import { GarmentVisual } from '@/components/GarmentVisual';
import { WardrobeItemModal } from '@/components/WardrobeItemModal';
import { EditorialLightbox } from '@/components/EditorialLightbox';

type SortKey = 'newest' | 'name' | 'price-desc' | 'price-asc' | 'wears-desc';

export function WardrobePage() {
  const { data: items = [], isLoading } = useWardrobe();
  const { data: settings } = useSettings();
  const saveItem = useSaveItem();
  const deleteItem = useDeleteItem();
  const logWear = useLogWear();
  const { restoreSamples } = useDataAdmin();

  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [colorFilter, setColorFilter] = useState<ColorId | 'all'>('all');
  const [seasonFilter, setSeasonFilter] = useState<Season | 'all'>('all');
  const [occasionFilter, setOccasionFilter] = useState<Occasion | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inspectingItem, setInspectingItem] = useState<WardrobeItem | null>(null);

  const addingNew = searchParams.get('add') === '1';
  const editingId = searchParams.get('edit');
  const editingItem = useMemo(
    () => (editingId ? items.find((i) => i.id === editingId) ?? null : null),
    [editingId, items],
  );

  const activeInspectionItem = useMemo(
    () => (inspectingItem ? items.find((i) => i.id === inspectingItem.id) ?? inspectingItem : null),
    [inspectingItem, items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        if (colorFilter !== 'all' && !item.colors.includes(colorFilter)) return false;
        if (seasonFilter !== 'all' && !item.seasons.includes(seasonFilter)) return false;
        if (occasionFilter !== 'all' && !item.occasions.includes(occasionFilter)) return false;
        if (q) {
          const hay = [
            item.name,
            labelOf.category(item.category),
            ...item.colors.map(labelOf.color),
            item.notes ?? '',
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'price-desc':
            return (b.price?.amount ?? -1) - (a.price?.amount ?? -1);
          case 'price-asc':
            return (a.price?.amount ?? Number.MAX_SAFE_INTEGER) - (b.price?.amount ?? Number.MAX_SAFE_INTEGER);
          case 'wears-desc':
            return b.wearLog.length - a.wearLog.length;
          default:
            return b.createdAt.localeCompare(a.createdAt);
        }
      });
  }, [items, query, categoryFilter, colorFilter, seasonFilter, occasionFilter, sortBy]);

  const hasActiveFilters =
    query.trim() !== '' ||
    categoryFilter !== 'all' ||
    colorFilter !== 'all' ||
    seasonFilter !== 'all' ||
    occasionFilter !== 'all';

  function clearFilters() {
    setQuery('');
    setCategoryFilter('all');
    setColorFilter('all');
    setSeasonFilter('all');
    setOccasionFilter('all');
  }

  function openAdd() {
    setSearchParams({ add: '1' });
  }

  function openEdit(item: WardrobeItem) {
    setSearchParams({ edit: item.id });
  }

  function closeModal() {
    setSearchParams({});
  }

  return (
    <div>
      <header className="page-header">
        <div className="page-header-copy">
          <div className="eyebrow">Personal Archive</div>
          <h1 className="title-xl">My Wardrobe</h1>
          <p className="text-secondary">
            Every purchase analysis and outfit suggestion is matched directly against the garments
            cataloged here.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> Add garment
          </button>
        </div>
      </header>

      {feedback && (
        <div className="notice notice-positive" style={{ marginBottom: 20 }}>
          <span>{feedback}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <section className="surface surface-pad" style={{ marginBottom: 28 }}>
        <div className="wardrobe-filter-grid">
          <div className="field">
            <label className="field-label" htmlFor="wardrobe-search">
              <span>Search</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                className="text-muted"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                id="wardrobe-search"
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Search name, color, notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="filter-category">
              <span>Category</span>
            </label>
            <select
              id="filter-category"
              className="select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | 'all')}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.plural}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="filter-color">
              <span>Color</span>
            </label>
            <select
              id="filter-color"
              className="select"
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value as ColorId | 'all')}
            >
              <option value="all">All colors</option>
              {COLORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="filter-season">
              <span>Season</span>
            </label>
            <select
              id="filter-season"
              className="select"
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value as Season | 'all')}
            >
              <option value="all">All seasons</option>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="filter-occasion">
              <span>Occasion</span>
            </label>
            <select
              id="filter-occasion"
              className="select"
              value={occasionFilter}
              onChange={(e) => setOccasionFilter(e.target.value as Occasion | 'all')}
            >
              <option value="all">All occasions</option>
              {OCCASIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="wardrobe-sort">
              <span>Sort by</span>
            </label>
            <select
              id="wardrobe-sort"
              className="select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
            >
              <option value="newest">Recently added</option>
              <option value="name">Name (A–Z)</option>
              <option value="wears-desc">Most logged wears</option>
              <option value="price-desc">Price (high to low)</option>
              <option value="price-asc">Price (low to high)</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span className="text-xs text-secondary">
            Showing <strong>{filtered.length}</strong> of {items.length} garments
          </span>
          {hasActiveFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <SlidersHorizontal size={13} /> Reset filters
            </button>
          )}
        </div>
      </section>

      {/* Grid */}
      {isLoading ? (
        <div className="surface surface-pad">Loading wardrobe…</div>
      ) : items.length === 0 ? (
        <div className="surface surface-pad-lg" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Empty archive</div>
          <h2 className="title-md" style={{ marginTop: 6 }}>
            No clothing in your wardrobe yet
          </h2>
          <p className="text-secondary" style={{ maxWidth: 460, margin: '8px auto 20px' }}>
            Add your own garments with photos, colors, and seasons, or restore the labeled sample
            capsule to explore.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} /> Add first garment
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => restoreSamples.mutate()}
            >
              Restore sample wardrobe
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface surface-pad" style={{ textAlign: 'center' }}>
          <div className="title-sm">No garments match these filters</div>
          <p className="text-xs text-secondary" style={{ marginTop: 4, marginBottom: 12 }}>
            Try broadening your search or clearing active filters.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="wardrobe-grid">
          {filtered.map((item) => (
            <article key={item.id} className="garment-card">
              <div
                style={{ position: 'relative', cursor: 'pointer' }}
                onClick={() => setInspectingItem(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setInspectingItem(item);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Inspect photo and details of ${item.name}`}
              >
                <GarmentVisual
                  image={item.image}
                  name={item.name}
                  category={item.category}
                  colors={item.colors}
                />
                <div className="garment-overlay-top">
                  {item.isSample ? <span className="badge badge-sample">Sample</span> : <span />}
                  {item.wearLog.length > 0 && (
                    <span className="badge">{item.wearLog.length}× worn</span>
                  )}
                </div>
              </div>

              <div className="garment-body">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <span className="eyebrow" style={{ fontSize: 10 }}>
                    {labelOf.category(item.category)}
                  </span>
                  {item.price && (
                    <span className="text-xs text-secondary tabular">
                      {formatMoney(item.price)}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  style={{ textAlign: 'left', padding: 0 }}
                  className="title-sm"
                >
                  {item.name}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {item.colors.map((c) => (
                    <span
                      key={c}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      className="text-xs text-secondary"
                    >
                      <span
                        className="color-swatch"
                        style={{ backgroundColor: COLOR_MAP[c]?.hex, width: 10, height: 10 }}
                      />
                      {labelOf.color(c)}
                    </span>
                  ))}
                </div>

                <div className="text-xs text-muted">
                  {item.seasons.map(labelOf.season).join(', ')} ·{' '}
                  {item.occasions.map(labelOf.occasion).join(', ')}
                </div>

                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      logWear.mutate(
                        { id: item.id, date: new Date().toISOString() },
                        {
                          onSuccess: () =>
                            setFeedback(`Logged a wear for “${item.name}” today.`),
                        },
                      );
                    }}
                  >
                    <CalendarPlus size={13} /> Wore today
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {(addingNew || editingItem) && (
        <WardrobeItemModal
          item={editingItem}
          defaultCurrency={settings?.currency ?? 'USD'}
          saving={saveItem.isPending}
          onClose={closeModal}
          onSave={async (input) => {
            const saved = await saveItem.mutateAsync(input);
            setFeedback(
              input.id ? `Updated “${saved.name}”.` : `Added “${saved.name}” to My Wardrobe.`,
            );
          }}
          onDelete={async (id) => {
            await deleteItem.mutateAsync(id);
            setFeedback('Removed item from My Wardrobe.');
          }}
          onLogWear={async (id, date) => {
            await logWear.mutateAsync({ id, date });
          }}
          onRemoveWear={async (id, removeIndex) => {
            await logWear.mutateAsync({ id, removeIndex });
          }}
        />
      )}

      {activeInspectionItem && (
        <EditorialLightbox
          item={activeInspectionItem}
          onClose={() => setInspectingItem(null)}
          onEdit={(item) => {
            setInspectingItem(null);
            openEdit(item);
          }}
          onLogWear={async (id, date) => {
            await logWear.mutateAsync({ id, date });
            setFeedback(`Logged a wear for “${activeInspectionItem.name}” today.`);
          }}
          feedback={feedback}
        />
      )}
    </div>
  );
}
