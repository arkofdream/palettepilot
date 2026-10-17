import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { ImageRef } from '@/domain/types';
import { useImageUrl } from '@/hooks/data';
import { prepareImage } from '@/services/storage/imageStore';

interface ImagePickerProps {
  existingImage?: ImageRef;
  onSelect: (blob: Blob | null, clearedExisting?: boolean) => void;
  label?: string;
  hint?: string;
}

export function ImagePicker({
  existingImage,
  onSelect,
  label = 'Photograph',
  hint = 'JPEG, PNG or WebP up to 15 MB. Stored locally in your browser.',
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { url: existingUrl } = useImageUrl(existingImage);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const activeUrl = previewUrl ?? (!cleared ? existingUrl : null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await prepareImage(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const nextUrl = URL.createObjectURL(blob);
      setPreviewUrl(nextUrl);
      setCleared(false);
      onSelect(blob, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read image.');
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCleared(true);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onSelect(null, true);
  }

  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="field-hint">Optional</span>
      </div>

      {activeUrl ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: 12,
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <img
            src={activeUrl}
            alt="Selected garment preview"
            style={{
              width: 76,
              height: 95,
              objectFit: 'cover',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="text-sm" style={{ fontWeight: 500 }}>
              Image ready
            </span>
            <span className="text-xs text-muted">{hint}</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => inputRef.current?.click()}
              >
                Replace photo
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleClear}
              >
                <X size={14} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '16px 18px',
            border: '1px dashed var(--border-strong)',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-sm)',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Upload size={18} className="text-secondary" />
            <div>
              <div className="text-sm" style={{ fontWeight: 500 }}>
                {busy ? 'Preparing image…' : 'Upload a garment photo'}
              </div>
              <div className="text-xs text-muted">{hint}</div>
            </div>
          </div>
          <span className="btn btn-secondary btn-sm">Choose file</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
