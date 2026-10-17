/**
 * Server-side abuse protection and payload validation.
 *
 * NOTE ON SECURITY LIMITATIONS:
 * IP-based rate limiting is a best-effort defense against casual bot floods in an unauthenticated prototype.
 * It does NOT guarantee protection against distributed botnets or rotating IP proxies.
 * User authentication and CAPTCHA/Turnstile must be implemented before public exposure.
 */

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

interface IpRecord {
  count: number;
  resetAt: number;
}

export class AbuseGuard {
  private ipWindows = new Map<string, IpRecord>();
  private maxRequestsPerMinute: number;

  constructor(maxRequestsPerMinute = 5) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  /**
   * Evaluates client IP against rate limits (sliding 1-minute window).
   */
  checkIpRateLimit(ip: string): { allowed: boolean; reason?: string } {
    const cleanIp = ip.trim() || 'unknown';
    const now = Date.now();
    const record = this.ipWindows.get(cleanIp);

    if (!record || now >= record.resetAt) {
      this.ipWindows.set(cleanIp, { count: 1, resetAt: now + 60_000 });
      return { allowed: true };
    }

    if (record.count >= this.maxRequestsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: maximum ${this.maxRequestsPerMinute} requests per minute per IP.`,
      };
    }

    record.count++;
    return { allowed: true };
  }

  /**
   * Validates image MIME type and payload size.
   */
  validatePayload(
    byteLength: number,
    mimeType: string,
  ): { valid: boolean; error?: string; status?: number } {
    if (byteLength > MAX_PAYLOAD_BYTES) {
      return {
        valid: false,
        error: `Payload size (${Math.round(byteLength / 1024)} KB) exceeds the maximum allowed limit of ${Math.round(
          MAX_PAYLOAD_BYTES / 1024,
        )} KB.`,
        status: 413,
      };
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        valid: false,
        error: `Unsupported image MIME type "${mimeType}". Only JPEG, PNG, and WebP images are accepted.`,
        status: 400,
      };
    }

    return { valid: true };
  }

  /**
   * Validates CORS Origin header against allowed origins.
   */
  validateOrigin(origin: string | null, allowedOrigins: string[]): boolean {
    if (!origin || allowedOrigins.includes('*')) return true;
    return allowedOrigins.includes(origin);
  }
}
