import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { labelOf, COLOR_MAP } from '@/domain/catalog';
import { formatMoney } from '@/lib/format';
import type { CuratedOutfit } from '@/services/curatedOutfits';
import { GarmentVisual } from '@/components/GarmentVisual';

interface EditorialOutfitCarouselProps {
  outfits: CuratedOutfit[];
  onLogWear?: (itemIds: string[], outfitId: string) => void;
  loggedOutfitId?: string | null;
  isLoggingId?: string | null;
}

export function EditorialOutfitCarousel({
  outfits,
  onLogWear,
  loggedOutfitId,
  isLoggingId,
}: EditorialOutfitCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(outfits.length > 1);

  const updateScrollState = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);

    // Calculate active card index based on scroll position
    const cardWidth = el.firstElementChild
      ? (el.firstElementChild as HTMLElement).offsetWidth + 18
      : 340;
    const newIndex = Math.min(
      outfits.length - 1,
      Math.max(0, Math.round(scrollLeft / cardWidth)),
    );
    setActiveIndex(newIndex);
  };

  useEffect(() => {
    updateScrollState();
  }, [outfits.length]);

  const scrollTo = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const cardWidth = el.firstElementChild
      ? (el.firstElementChild as HTMLElement).offsetWidth + 18
      : 340;
    const delta = direction === 'left' ? -cardWidth : cardWidth;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const scrollToIndex = (index: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const cardWidth = el.firstElementChild
      ? (el.firstElementChild as HTMLElement).offsetWidth + 18
      : 340;
    el.scrollTo({ left: index * cardWidth, behavior: 'smooth' });
    setActiveIndex(index);
  };

  if (outfits.length === 0) return null;

  return (
    <div className="editorial-carousel-wrapper">
      {/* Header with Title & Navigation Controls */}
      <div className="editorial-carousel-header">
        <div>
          <div className="eyebrow" style={{ color: 'var(--accent-terracotta)' }}>
            Daily Curation · Ready to Wear
          </div>
          <h2 className="title-md" style={{ marginTop: 2 }}>
            Today's curated pairings
          </h2>
          <p className="text-xs text-secondary" style={{ marginTop: 2 }}>
            Complete, harmonious looks assembled strictly from your cataloged pieces.
          </p>
        </div>

        <div className="editorial-carousel-controls">
          <span className="editorial-carousel-counter tabular">
            0{activeIndex + 1} <span style={{ opacity: 0.4 }}>/</span> 0{outfits.length}
          </span>
          <div className="carousel-btn-group">
            <button
              type="button"
              className="carousel-nav-btn"
              onClick={() => scrollTo('left')}
              disabled={!canScrollLeft}
              aria-label="Previous outfit"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="carousel-nav-btn"
              onClick={() => scrollTo('right')}
              disabled={!canScrollRight}
              aria-label="Next outfit"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scroll-Snap Track */}
      <div
        ref={scrollContainerRef}
        className="editorial-carousel-track"
        onScroll={updateScrollState}
        tabIndex={0}
        aria-label="Curated outfit combinations gallery"
      >
        {outfits.map((outfit, index) => {
          const isWorn = loggedOutfitId === outfit.id;
          const harmonyPercent = Math.round(outfit.harmony * 100);

          return (
            <article
              key={outfit.id}
              className={`editorial-outfit-card ${activeIndex === index ? 'is-active' : ''}`}
            >
              {/* Card Top Banner */}
              <div className="editorial-card-top">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="editorial-look-number">Look 0{index + 1}</span>
                  {outfit.occasion && (
                    <span className="editorial-look-tag">
                      {labelOf.occasion(outfit.occasion)}
                    </span>
                  )}
                </div>

                <div
                  className="editorial-harmony-badge"
                  title="Deterministic color & category harmony score"
                >
                  <span className="harmony-dot" />
                  <span className="tabular">{harmonyPercent}% harmony</span>
                </div>
              </div>

              {/* Garment Grid: Display each piece with authentic photos/visuals */}
              <div className="editorial-garment-grid">
                {outfit.items.map((item) => (
                  <Link
                    key={item.id}
                    to={`/wardrobe?edit=${item.id}`}
                    className="editorial-garment-tile"
                    title={`Inspect ${item.name} in My Wardrobe`}
                  >
                    <div className="editorial-garment-visual-wrap">
                      <GarmentVisual
                        image={item.image}
                        name={item.name}
                        category={item.category}
                        colors={item.colors}
                      />
                    </div>
                    <div className="editorial-garment-meta">
                      <span className="editorial-category-label">
                        {labelOf.category(item.category)}
                      </span>
                      <span className="editorial-garment-name" title={item.name}>
                        {item.name}
                      </span>
                      <div className="editorial-garment-subtext">
                        {item.colors[0] && (
                          <span
                            className="color-swatch-sm"
                            style={{ backgroundColor: COLOR_MAP[item.colors[0]]?.hex }}
                            title={labelOf.color(item.colors[0])}
                          />
                        )}
                        {item.price ? formatMoney(item.price) : labelOf.color(item.colors[0])}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Editorial Rationale Note */}
              <div className="editorial-rationale">
                <p className="text-xs text-secondary">{outfit.rationale}</p>
              </div>

              {/* Card Action Footer */}
              <div className="editorial-card-footer">
                <button
                  type="button"
                  className={`btn btn-sm ${isWorn ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => onLogWear?.(outfit.items.map((i) => i.id), outfit.id)}
                  disabled={isWorn || isLoggingId === outfit.id}
                  aria-busy={isLoggingId === outfit.id}
                >
                  {isWorn ? (
                    <>
                      <Check size={14} style={{ color: 'var(--tone-positive)' }} /> Worn today
                    </>
                  ) : isLoggingId === outfit.id ? (
                    'Logging wear…'
                  ) : (
                    <>
                      <Check size={14} /> Log as worn today
                    </>
                  )}
                </button>
                <Link to="/wardrobe" className="text-xs text-muted" style={{ textDecoration: 'underline' }}>
                  {outfit.items.length} pieces
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination Pill Dots */}
      {outfits.length > 1 && (
        <div className="editorial-carousel-dots" role="tablist" aria-label="Outfit pagination">
          {outfits.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={activeIndex === idx}
              aria-label={`Go to Look 0${idx + 1}`}
              className={`carousel-dot ${activeIndex === idx ? 'active' : ''}`}
              onClick={() => scrollToIndex(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
