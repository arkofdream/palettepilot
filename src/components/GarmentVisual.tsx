import { COLOR_MAP, labelOf } from '@/domain/catalog';
import type { Category, ColorId, ImageRef } from '@/domain/types';
import { useImageUrl } from '@/hooks/data';

interface GarmentVisualProps {
  image?: ImageRef;
  name?: string;
  category: Category;
  colors: ColorId[];
  aspectRatio?: '4/5' | '1/1' | '3/2';
  className?: string;
}

/**
 * Renders either the resolved photograph or an editorial studio swatch + silhouette
 * plate when no photo is attached.
 */
export function GarmentVisual({
  image,
  name,
  category,
  colors,
  aspectRatio = '4/5',
  className = '',
}: GarmentVisualProps) {
  const { url } = useImageUrl(image);
  const primary = colors[0] ? COLOR_MAP[colors[0]] : undefined;
  const secondary = colors[1] ? COLOR_MAP[colors[1]] : undefined;
  const primaryHex = primary?.hex ?? '#C8BFB1';
  const isLight = primary?.id === 'white' || primary?.id === 'cream' || primary?.id === 'beige';

  if (url) {
    return (
      <div
        className={`garment-media ${className}`}
        style={{ aspectRatio }}
      >
        <img src={url} alt={name || labelOf.category(category)} loading="lazy" />
      </div>
    );
  }

  return (
    <div
      className={`garment-media ${className}`}
      style={{
        aspectRatio,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '18px',
        background: 'linear-gradient(180deg, #F3EFE7 0%, #EAE3D7 100%)',
      }}
      aria-label={name || `${labelOf.category(category)} swatch`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>
          {labelOf.category(category)}
        </span>
        <span className="text-xs text-muted">
          {colors.map((c) => labelOf.color(c)).join(' / ')}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 0',
        }}
      >
        <SilhouetteSvg
          category={category}
          fill={primaryHex}
          secondaryFill={secondary?.hex}
          stroke={isLight ? '#857E75' : 'rgba(31,29,27,0.28)'}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(31,29,27,0.1)',
          paddingTop: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {colors.slice(0, 3).map((c) => (
            <span
              key={c}
              className="color-swatch"
              style={{ backgroundColor: COLOR_MAP[c]?.hex ?? '#ccc', width: 14, height: 14 }}
              title={labelOf.color(c)}
            />
          ))}
        </div>
        <span className="text-xs text-muted" style={{ fontSize: 11 }}>
          Color plate
        </span>
      </div>
    </div>
  );
}

function SilhouetteSvg({
  category,
  fill,
  secondaryFill,
  stroke,
}: {
  category: Category;
  fill: string;
  secondaryFill?: string;
  stroke: string;
}) {
  const common = { fill, stroke, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  switch (category) {
    case 'top':
    case 'knitwear':
      return (
        <svg viewBox="0 0 120 120" width="64%" height="64%" aria-hidden="true">
          <path
            d="M36 22 L48 18 C52 25 68 25 72 18 L84 22 L106 42 L94 56 L82 46 L82 98 L38 98 L38 46 L26 56 L14 42 Z"
            {...common}
          />
          {secondaryFill && (
            <>
              <line x1="38" y1="62" x2="82" y2="62" stroke={secondaryFill} strokeWidth="4" />
              <line x1="38" y1="76" x2="82" y2="76" stroke={secondaryFill} strokeWidth="4" />
            </>
          )}
        </svg>
      );
    case 'bottom':
      return (
        <svg viewBox="0 0 120 120" width="62%" height="62%" aria-hidden="true">
          <path
            d="M36 16 L84 16 L90 104 L66 104 L60 48 L54 104 L30 104 Z"
            {...common}
          />
          <line x1="36" y1="26" x2="84" y2="26" stroke={stroke} strokeWidth="1.2" />
        </svg>
      );
    case 'dress':
      return (
        <svg viewBox="0 0 120 120" width="64%" height="64%" aria-hidden="true">
          <path
            d="M44 16 L52 22 L68 22 L76 16 L84 34 L76 48 L92 104 L28 104 L44 48 L36 34 Z"
            {...common}
          />
        </svg>
      );
    case 'outerwear':
      return (
        <svg viewBox="0 0 120 120" width="66%" height="66%" aria-hidden="true">
          <path
            d="M34 18 L50 14 L60 28 L70 14 L86 18 L106 42 L94 58 L84 48 L86 104 L34 104 L36 48 L26 58 L14 42 Z"
            {...common}
          />
          <line x1="60" y1="28" x2="60" y2="104" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case 'shoes':
      return (
        <svg viewBox="0 0 120 120" width="66%" height="66%" aria-hidden="true">
          <path
            d="M22 44 L50 44 L62 66 L96 70 C102 71 104 78 104 84 L18 84 L18 52 C18 47 20 44 22 44 Z"
            {...common}
          />
          <rect x="18" y="82" width="86" height="7" fill={stroke} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 120" width="62%" height="62%" aria-hidden="true">
          <path
            d="M44 38 C44 24 76 24 76 38 L92 38 L96 98 L24 98 L28 38 Z"
            {...common}
          />
          <path d="M46 38 C46 26 74 26 74 38" fill="none" stroke={stroke} strokeWidth="2.2" />
        </svg>
      );
  }
}
