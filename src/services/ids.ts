export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

/** Placeholder owner until authenticated accounts exist. Never treated as a real identity. */
export const LOCAL_OWNER_ID = 'local-device';

export const nowIso = () => new Date().toISOString();
