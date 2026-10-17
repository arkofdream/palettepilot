import { CURRENCIES } from '@/domain/catalog';
import type { CurrencyCode, Money } from '@/domain/types';

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(m: Money, opts: { compact?: boolean } = {}): string {
  const locale = CURRENCIES.find((c) => c.id === m.currency)?.locale ?? 'en-US';
  const key = `${locale}-${m.currency}-${opts.compact ? 'c' : 'f'}-${Number.isInteger(m.amount) ? 'i' : 'd'}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: m.currency,
      maximumFractionDigits: opts.compact || Number.isInteger(m.amount) ? 0 : 2,
      minimumFractionDigits: opts.compact || Number.isInteger(m.amount) ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f.format(m.amount);
}

export function currencySymbol(code: CurrencyCode): string {
  const locale = CURRENCIES.find((c) => c.id === code)?.locale ?? 'en-US';
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? code
  );
}

export function formatDate(iso: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', style === 'long' ? { month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

export function relativeDays(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`;
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function parsePrice(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.startsWith('-')) return null;
  const cleaned = trimmed.replace(/[^\d.,]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
