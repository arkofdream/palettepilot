import type { Category, ColorId, CurrencyCode, Occasion, Season, StyleTag } from './types';

export const CATEGORIES: { id: Category; label: string; plural: string }[] = [
  { id: 'top', label: 'Top', plural: 'Tops' },
  { id: 'knitwear', label: 'Knitwear', plural: 'Knitwear' },
  { id: 'bottom', label: 'Bottom', plural: 'Bottoms' },
  { id: 'dress', label: 'Dress', plural: 'Dresses' },
  { id: 'outerwear', label: 'Outerwear', plural: 'Outerwear' },
  { id: 'shoes', label: 'Shoes', plural: 'Shoes' },
  { id: 'accessory', label: 'Accessory', plural: 'Accessories' },
];

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
];

export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: 'casual', label: 'Casual' },
  { id: 'work', label: 'Work' },
  { id: 'evening', label: 'Evening' },
  { id: 'weekend', label: 'Weekend' },
  { id: 'travel', label: 'Travel' },
  { id: 'active', label: 'Active' },
];

export interface ColorDef {
  id: ColorId;
  label: string;
  hex: string;
  /** Hue in degrees; ignored for neutrals. */
  hue: number;
  neutral: boolean;
}

/**
 * Curated palette. Using named colors (rather than free hex input) keeps matching
 * explainable: "navy pairs with camel" is easier to reason about than two hex codes.
 */
export const COLORS: ColorDef[] = [
  { id: 'black', label: 'Black', hex: '#1E1D1C', hue: 0, neutral: true },
  { id: 'charcoal', label: 'Charcoal', hex: '#3C3B3A', hue: 0, neutral: true },
  { id: 'grey', label: 'Grey', hex: '#9A9792', hue: 0, neutral: true },
  { id: 'white', label: 'White', hex: '#FAFAF7', hue: 0, neutral: true },
  { id: 'cream', label: 'Cream', hex: '#EFE6D2', hue: 45, neutral: true },
  { id: 'beige', label: 'Beige', hex: '#D8C6A8', hue: 38, neutral: true },
  { id: 'camel', label: 'Camel', hex: '#B8895A', hue: 30, neutral: true },
  { id: 'brown', label: 'Brown', hex: '#6B4A33', hue: 25, neutral: true },
  { id: 'navy', label: 'Navy', hex: '#1F2A44', hue: 225, neutral: true },
  { id: 'denim', label: 'Denim', hex: '#3D5778', hue: 215, neutral: true },
  { id: 'blue', label: 'Blue', hex: '#2F5DA8', hue: 218, neutral: false },
  { id: 'light-blue', label: 'Light blue', hex: '#A9C3DE', hue: 210, neutral: false },
  { id: 'olive', label: 'Olive', hex: '#5E6339', hue: 70, neutral: false },
  { id: 'green', label: 'Green', hex: '#2F6B4A', hue: 150, neutral: false },
  { id: 'burgundy', label: 'Burgundy', hex: '#6A2333', hue: 345, neutral: false },
  { id: 'red', label: 'Red', hex: '#B3302B', hue: 3, neutral: false },
  { id: 'rust', label: 'Rust', hex: '#A4502E', hue: 18, neutral: false },
  { id: 'pink', label: 'Pink', hex: '#E3B5B5', hue: 0, neutral: false },
  { id: 'yellow', label: 'Yellow', hex: '#D9B23F', hue: 45, neutral: false },
  { id: 'purple', label: 'Purple', hex: '#5D4370', hue: 275, neutral: false },
];

export const COLOR_MAP: Record<ColorId, ColorDef> = Object.fromEntries(
  COLORS.map((c) => [c.id, c]),
) as Record<ColorId, ColorDef>;

export const CURRENCIES: { id: CurrencyCode; label: string; locale: string }[] = [
  { id: 'USD', label: 'US Dollar', locale: 'en-US' },
  { id: 'EUR', label: 'Euro', locale: 'en-IE' },
  { id: 'GBP', label: 'British Pound', locale: 'en-GB' },
  { id: 'CHF', label: 'Swiss Franc', locale: 'de-CH' },
  { id: 'CAD', label: 'Canadian Dollar', locale: 'en-CA' },
  { id: 'SEK', label: 'Swedish Krona', locale: 'sv-SE' },
  { id: 'NOK', label: 'Norwegian Krone', locale: 'nb-NO' },
  { id: 'DKK', label: 'Danish Krone', locale: 'da-DK' },
  { id: 'PLN', label: 'Polish Złoty', locale: 'pl-PL' },
];

export const STYLE_TAGS: { id: StyleTag; label: string }[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'classic', label: 'Classic' },
  { id: 'tailored', label: 'Tailored' },
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'street', label: 'Streetwear' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'statement', label: 'Statement' },
];

export const labelOf = {
  category: (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id,
  categoryPlural: (id: Category) => CATEGORIES.find((c) => c.id === id)?.plural ?? id,
  season: (id: Season) => SEASONS.find((s) => s.id === id)?.label ?? id,
  occasion: (id: Occasion) => OCCASIONS.find((o) => o.id === id)?.label ?? id,
  color: (id: ColorId) => COLOR_MAP[id]?.label ?? id,
  style: (id: StyleTag) => STYLE_TAGS.find((s) => s.id === id)?.label ?? id,
};
