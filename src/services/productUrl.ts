/**
 * Product URL handling.
 *
 * The browser cannot reliably read retailer pages: most block cross-origin requests,
 * render with JavaScript, or rate-limit bots. This prototype therefore never fetches
 * product pages and never claims to have read one. A future backend fetcher can
 * implement `ProductPageReader` and return structured, verified fields.
 */

export interface UrlInspection {
  input: string;
  valid: boolean;
  hostname?: string;
  error?: string;
  fetched: false;
  fetchNote: string;
}

export function inspectProductUrl(input: string): UrlInspection {
  const trimmed = input.trim();
  const base = {
    input: trimmed,
    fetched: false as const,
    fetchNote:
      'Saved as a reference link only. The page was not opened or read — price, materials and sizing were not taken from it.',
  };
  if (!trimmed) return { ...base, valid: false, error: 'No URL entered.' };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ...base, valid: false, error: 'This doesn’t look like a valid web address.' };
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    return { ...base, valid: false, error: 'Please enter a full product link, e.g. https://shop.example.com/item.' };
  }
  return { ...base, input: url.toString(), valid: true, hostname: url.hostname.replace(/^www\./, '') };
}

/** Contract for a future server-side page reader. Not implemented in the prototype. */
export interface ProductPageReader {
  read(url: string): Promise<
    | { status: 'ok'; title?: string; price?: { amount: number; currency: string }; imageUrl?: string }
    | { status: 'blocked' | 'not-found' | 'unsupported' | 'error'; reason: string }
  >;
}
