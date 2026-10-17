import type { Page } from '@playwright/test';

/**
 * Attaches a listener to verify no unapproved external network requests occur.
 * PalettePilot is strictly zero-unapproved-spend and local-first.
 */
export function attachNetworkGuard(page: Page): string[] {
  const disallowedRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      return;
    }
    disallowedRequests.push(url);
  });
  return disallowedRequests;
}

/**
 * Tracks uncaught page errors and console errors.
 */
export function attachErrorMonitor(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(`PageError: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore favicon or non-critical 404s if any
      if (!text.includes('favicon.ico')) {
        errors.push(`ConsoleError: ${text}`);
      }
    }
  });
  return errors;
}

/**
 * Minimal valid 1x1 PNG image buffer for testing uploads.
 */
export const SYNTHETIC_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Invalid text file buffer for testing validation handling.
 */
export const INVALID_TEXT_BUFFER = Buffer.from('This is not an image file.', 'utf-8');
