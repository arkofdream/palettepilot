import { CATEGORIES, COLORS, OCCASIONS, SEASONS } from '@/domain/catalog';
import type { Category, ColorId, Occasion, Season } from '@/domain/types';

export function CategoryPicker({
  value,
  onChange,
}: {
  value: Category;
  onChange: (c: Category) => void;
}) {
  return (
    <div className="chip-group" role="radiogroup" aria-label="Category">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip ${value === c.id ? 'selected' : ''}`}
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function ColorMultiPicker({
  value,
  onChange,
  max = 3,
}: {
  value: ColorId[];
  onChange: (next: ColorId[]) => void;
  max?: number;
}) {
  function toggle(id: ColorId) {
    if (value.includes(id)) {
      onChange(value.filter((c) => c !== id));
    } else if (value.length < max) {
      onChange([...value, id]);
    } else {
      onChange([...value.slice(0, max - 1), id]);
    }
  }

  return (
    <div className="chip-group" role="group" aria-label="Colors">
      {COLORS.map((c) => {
        const idx = value.indexOf(c.id);
        const selected = idx >= 0;
        return (
          <button
            key={c.id}
            type="button"
            className={`chip ${selected ? 'selected' : ''}`}
            aria-pressed={selected}
            onClick={() => toggle(c.id)}
          >
            <span
              className="color-swatch"
              style={{
                backgroundColor: c.hex,
                borderColor: selected ? 'rgba(255,255,255,0.5)' : 'rgba(31,29,27,0.22)',
              }}
            />
            <span>{c.label}</span>
            {idx === 0 && value.length > 1 && (
              <span style={{ fontSize: 10, opacity: 0.75 }}>(main)</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SeasonMultiPicker({
  value,
  onChange,
}: {
  value: Season[];
  onChange: (next: Season[]) => void;
}) {
  function toggle(id: Season) {
    onChange(value.includes(id) ? value.filter((s) => s !== id) : [...value, id]);
  }
  const allSelected = value.length === SEASONS.length;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {SEASONS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`chip ${value.includes(s.id) ? 'selected' : ''}`}
          aria-pressed={value.includes(s.id)}
          onClick={() => toggle(s.id)}
        >
          {s.label}
        </button>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => onChange(allSelected ? [] : SEASONS.map((s) => s.id))}
      >
        {allSelected ? 'Clear' : 'All seasons'}
      </button>
    </div>
  );
}

export function OccasionMultiPicker({
  value,
  onChange,
}: {
  value: Occasion[];
  onChange: (next: Occasion[]) => void;
}) {
  function toggle(id: Occasion) {
    onChange(value.includes(id) ? value.filter((o) => o !== id) : [...value, id]);
  }
  return (
    <div className="chip-group" role="group" aria-label="Occasions">
      {OCCASIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`chip ${value.includes(o.id) ? 'selected' : ''}`}
          aria-pressed={value.includes(o.id)}
          onClick={() => toggle(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
