import { useState, type FormEvent } from 'react';
import { X, CalendarPlus, Trash2 } from 'lucide-react';
import { CURRENCIES } from '@/domain/catalog';
import type {
  Category,
  ColorId,
  CurrencyCode,
  Occasion,
  Season,
  WardrobeItem,
  WardrobeItemDraft,
} from '@/domain/types';
import { formatDate, parsePrice } from '@/lib/format';
import {
  CategoryPicker,
  ColorMultiPicker,
  OccasionMultiPicker,
  SeasonMultiPicker,
} from './AttributeInputs';
import { ImagePicker } from './ImagePicker';

interface WardrobeItemModalProps {
  item?: WardrobeItem | null;
  defaultCurrency: CurrencyCode;
  saving?: boolean;
  onClose: () => void;
  onSave: (input: { id?: string; draft: WardrobeItemDraft; newImage?: Blob | null }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onLogWear?: (id: string, dateIso: string) => Promise<void>;
  onRemoveWear?: (id: string, index: number) => Promise<void>;
}

export function WardrobeItemModal({
  item,
  defaultCurrency,
  saving,
  onClose,
  onSave,
  onDelete,
  onLogWear,
  onRemoveWear,
}: WardrobeItemModalProps) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<Category>(item?.category ?? 'top');
  const [colors, setColors] = useState<ColorId[]>(item?.colors ?? ['black']);
  const [seasons, setSeasons] = useState<Season[]>(
    item?.seasons ?? ['spring', 'autumn', 'winter'],
  );
  const [occasions, setOccasions] = useState<Occasion[]>(item?.occasions ?? ['casual']);
  const [priceStr, setPriceStr] = useState(item?.price ? String(item.price.amount) : '');
  const [currency, setCurrency] = useState<CurrencyCode>(
    item?.price?.currency ?? defaultCurrency,
  );
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [newImage, setNewImage] = useState<Blob | null>(null);
  const [clearedExisting, setClearedExisting] = useState(false);
  const [wearDate, setWearDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Please enter an item name.';
    if (colors.length === 0) next.colors = 'Select at least one color.';
    if (seasons.length === 0) next.seasons = 'Select at least one season.';
    if (occasions.length === 0) next.occasions = 'Select at least one occasion.';
    if (priceStr.trim()) {
      const p = parsePrice(priceStr);
      if (p === null || p < 0) next.price = 'Enter a valid non-negative price.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    const parsedPrice = priceStr.trim() ? parsePrice(priceStr) : null;
    const draft: WardrobeItemDraft = {
      name: name.trim(),
      category,
      colors,
      seasons,
      occasions,
      price: parsedPrice !== null ? { amount: parsedPrice, currency } : undefined,
      image: clearedExisting ? undefined : item?.image,
      notes: notes.trim() || undefined,
    };
    try {
      await onSave({ id: item?.id, draft, newImage });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save item.');
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wardrobe-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="modal-panel" onSubmit={handleSubmit} noValidate>
        <div className="modal-header">
          <div>
            <div className="eyebrow">{item ? 'Edit garment' : 'New garment'}</div>
            <h2 id="wardrobe-modal-title" className="title-md">
              {item ? item.name : 'Add to My Wardrobe'}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {submitError && <div className="notice notice-negative">{submitError}</div>}

          <ImagePicker
            existingImage={item?.image}
            onSelect={(blob, cleared) => {
              setNewImage(blob);
              if (cleared) setClearedExisting(true);
            }}
          />

          <div className="field">
            <label className="field-label" htmlFor="item-name">
              <span>Name *</span>
              <span className="field-hint">e.g. Navy merino crewneck</span>
            </label>
            <input
              id="item-name"
              className={`input ${errors.name ? 'input-error' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Describe the garment"
            />
            {errors.name && <div className="field-error">{errors.name}</div>}
          </div>

          <div className="field">
            <div className="field-label">
              <span>Category *</span>
            </div>
            <CategoryPicker value={category} onChange={setCategory} />
          </div>

          <div className="field">
            <div className="field-label">
              <span>Colors * (up to 3, first is dominant)</span>
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
              <span>Occasions *</span>
            </div>
            <OccasionMultiPicker value={occasions} onChange={setOccasions} />
            {errors.occasions && <div className="field-error">{errors.occasions}</div>}
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="item-price">
                <span>Purchase price</span>
                <span className="field-hint">Optional · for cost-per-wear</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  aria-label="Currency"
                  className="select"
                  style={{ width: 96 }}
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
                  id="item-price"
                  type="number"
                  min="0"
                  step="1"
                  className={`input ${errors.price ? 'input-error' : ''}`}
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  placeholder="0"
                />
              </div>
              {errors.price && <div className="field-error">{errors.price}</div>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="item-notes">
                <span>Notes</span>
                <span className="field-hint">Optional · fabric, fit, brand</span>
              </label>
              <input
                id="item-notes"
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 100% merino, relaxed fit"
              />
            </div>
          </div>

          {item && onLogWear && (
            <div
              className="surface-subtle"
              style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <div className="eyebrow">Recorded wear log</div>
                  <div className="text-xs text-secondary">
                    {item.wearLog.length === 0
                      ? 'No wears logged yet. PalettePilot only calculates wear stats from dates you log.'
                      : `${item.wearLog.length} recorded wear${item.wearLog.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="date"
                    className="input"
                    style={{ width: 148, padding: '6px 8px', fontSize: 12.5 }}
                    value={wearDate}
                    onChange={(e) => setWearDate(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!wearDate}
                    onClick={() => {
                      if (!wearDate) return;
                      const parsed = new Date(wearDate);
                      if (isNaN(parsed.getTime())) return;
                      onLogWear(item.id, parsed.toISOString());
                    }}
                  >
                    <CalendarPlus size={14} /> Log wear
                  </button>
                </div>
              </div>

              {item.wearLog.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {item.wearLog.map((iso, idx) => (
                    <span key={`${iso}-${idx}`} className="badge">
                      {formatDate(iso)}
                      {onRemoveWear && (
                        <button
                          type="button"
                          aria-label="Remove wear date"
                          onClick={() => onRemoveWear(item.id, idx)}
                          style={{ padding: 0, display: 'inline-flex', color: 'var(--text-muted)' }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div>
            {item && onDelete && (
              confirmDelete ? (
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      await onDelete(item.id);
                      onClose();
                    }}
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--tone-negative)' }}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={14} /> Delete item
                </button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : item ? 'Save changes' : 'Add to wardrobe'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
