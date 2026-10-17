import type { ImageRef } from '@/domain/types';
import { newId } from '../ids';
import type { KeyValueStore } from './keyValueStore';

/**
 * Image storage contract. The local implementation keeps compressed blobs in
 * IndexedDB. A cloud implementation would upload to object storage through an
 * authenticated backend and return `{ kind: 'remote', url }` references.
 */
export interface ImageStore {
  save(blob: Blob): Promise<ImageRef>;
  resolve(ref: ImageRef): Promise<string | null>;
  remove(ref: ImageRef): Promise<void>;
}

export class LocalImageStore implements ImageStore {
  private urlCache = new Map<string, string>();

  constructor(private kv: KeyValueStore) {}

  async save(blob: Blob): Promise<ImageRef> {
    const id = newId('img');
    await this.kv.set(id, blob);
    return { kind: 'local', id };
  }

  async resolve(ref: ImageRef): Promise<string | null> {
    if (ref.kind !== 'local') return ref.url;
    const cached = this.urlCache.get(ref.id);
    if (cached) return cached;
    const blob = await this.kv.get<Blob>(ref.id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urlCache.set(ref.id, url);
    return url;
  }

  async remove(ref: ImageRef): Promise<void> {
    if (ref.kind !== 'local') return;
    const cached = this.urlCache.get(ref.id);
    if (cached) URL.revokeObjectURL(cached);
    this.urlCache.delete(ref.id);
    await this.kv.delete(ref.id);
  }
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export class ImageValidationError extends Error {}

/**
 * Validates and downsizes an image in the browser before storage. Keeps local
 * storage usage reasonable and mirrors what an upload pipeline would do.
 */
export async function prepareImage(file: File, maxEdge = 1200, quality = 0.86): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageValidationError('Please choose a JPEG, PNG or WebP image.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError('This image is larger than 15 MB. Please choose a smaller file.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageValidationError('This image could not be read. It may be corrupted.');
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  return blob ?? file;
}
