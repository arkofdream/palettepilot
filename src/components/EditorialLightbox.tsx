import { useEffect, useRef, useState } from 'react';
import { X, CalendarPlus, Edit3 } from 'lucide-react';
import { COLOR_MAP, labelOf } from '@/domain/catalog';
import type { WardrobeItem } from '@/domain/types';
import { formatDate, formatMoney } from '@/lib/format';
import { MIN_WEARS_FOR_CPW } from '@/services/insights';
import { GarmentVisual } from './GarmentVisual';

interface EditorialLightboxProps {
  item: WardrobeItem | null;
  onClose: () => void;
  onEdit: (item: WardrobeItem) => void;
  onLogWear: (id: string, dateIso: string) => Promise<void>;
  feedback?: string | null;
}

/**
 * Native Editorial Shared-Element Lightbox
 * Pure CSS transition lightbox without heavy animation libraries.
 * Honors prefers-reduced-motion, Escape key, Tab focus trap, and keyboard focus restoration.
 */
export function EditorialLightbox({
  item,
  onClose,
  onEdit,
  onLogWear,
  feedback,
}: EditorialLightboxProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!item) return;

    // Save previous active element for return focus on close
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Prevent background scrolling while dialog is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on mount for accessibility
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 10);

    // Escape key & Tab focus trap listener
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!panelRef.current) return;
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !panelRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !panelRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      // Return focus to previously active element
      previouslyFocusedRef.current?.focus?.();
    };
  }, [item, onClose]);

  if (!item) return null;

  const wearsCount = item.wearLog.length;
  const hasCpw = item.price && wearsCount >= MIN_WEARS_FOR_CPW;
  const cpwAmount = hasCpw ? Math.round((item.price!.amount / wearsCount) * 100) / 100 : null;

  return (
    <div
      className="editorial-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editorial-lightbox-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="editorial-lightbox-panel" ref={panelRef}>
        {/* Visual Media Column */}
        <div className="editorial-lightbox-media">
          <GarmentVisual
            image={item.image}
            name={item.name}
            category={item.category}
            colors={item.colors}
            aspectRatio="4/5"
          />
        </div>

        {/* Editorial Information Column */}
        <div className="editorial-lightbox-content">
          <div className="editorial-lightbox-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="eyebrow">{labelOf.category(item.category)}</span>
                {item.isSample && <span className="badge badge-sample">Sample Piece</span>}
              </div>
              <h2 id="editorial-lightbox-title" className="title-lg">
                {item.name}
              </h2>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              aria-label="Close image inspection"
            >
              <X size={18} />
            </button>
          </div>

          {feedback && <div className="notice notice-info">{feedback}</div>}

          {/* Color Palette */}
          <div>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>
              Color Harmony Palette
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.colors.map((c) => (
                <span
                  key={c}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  className="text-xs text-secondary"
                >
                  <span
                    className="color-swatch"
                    style={{
                      backgroundColor: COLOR_MAP[c]?.hex ?? '#ccc',
                      width: 14,
                      height: 14,
                    }}
                  />
                  <strong>{labelOf.color(c)}</strong>
                </span>
              ))}
            </div>
          </div>

          {/* Seasons & Occasions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
                Seasons
              </div>
              <div className="text-xs text-secondary">
                {item.seasons.map(labelOf.season).join(' · ')}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
                Occasions
              </div>
              <div className="text-xs text-secondary">
                {item.occasions.map(labelOf.occasion).join(' · ')}
              </div>
            </div>
          </div>

          {/* Honest Wear Statistics & Cost-per-wear */}
          <div
            className="surface-subtle"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>
                Wear Frequency & Economics
              </span>
              <span className="badge">
                {wearsCount > 0 ? `${wearsCount}× logged` : '0 logged wears'}
              </span>
            </div>

            {hasCpw && cpwAmount !== null ? (
              <div className="text-sm">
                Cost per wear:{' '}
                <strong className="tabular font-display" style={{ fontSize: '1.15rem' }}>
                  {formatMoney({ amount: cpwAmount, currency: item.price!.currency })}
                </strong>{' '}
                <span className="text-xs text-muted">
                  (original purchase {formatMoney(item.price!)})
                </span>
              </div>
            ) : item.price && wearsCount > 0 ? (
              <p className="text-xs text-secondary">
                Original purchase: <strong>{formatMoney(item.price)}</strong>. Log{' '}
                <strong>{MIN_WEARS_FOR_CPW - wearsCount}</strong> more wear
                {MIN_WEARS_FOR_CPW - wearsCount === 1 ? '' : 's'} to calculate reliable cost-per-wear.
              </p>
            ) : item.price ? (
              <p className="text-xs text-secondary">
                Purchase price: <strong>{formatMoney(item.price)}</strong>. Log wear dates as you
                wear this piece to track cost-per-wear over time.
              </p>
            ) : (
              <p className="text-xs text-muted">
                Price not recorded. Add a purchase price in Edit to enable cost-per-wear analytics.
              </p>
            )}

            {wearsCount > 0 && (
              <div style={{ marginTop: 4 }}>
                <span className="text-xs text-muted">Recent wear dates: </span>
                <span className="text-xs text-secondary">
                  {item.wearLog
                    .slice(-4)
                    .reverse()
                    .map((d) => formatDate(d))
                    .join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Optional notes */}
          {item.notes && (
            <div className="text-xs text-secondary" style={{ fontStyle: 'italic' }}>
              “{item.notes}”
            </div>
          )}

          {/* Action Footer */}
          <div className="editorial-lightbox-footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={logging}
              onClick={async () => {
                if (logging) return;
                setLogging(true);
                try {
                  await onLogWear(item.id, new Date().toISOString());
                } finally {
                  setLogging(false);
                }
              }}
            >
              <CalendarPlus size={14} /> {logging ? 'Logging wear…' : 'Wore today'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onClose();
                  onEdit(item);
                }}
              >
                <Edit3 size={14} /> Edit details
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
