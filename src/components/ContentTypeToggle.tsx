'use client';

export type ContentType = 'all' | 'long_form' | 'short';

const OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'long_form', label: 'Long-form' },
  { value: 'short', label: 'Shorts' },
];

interface ContentTypeToggleProps {
  value: ContentType;
  onChange: (v: ContentType) => void;
}

export function ContentTypeToggle({ value, onChange }: ContentTypeToggleProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="content-type-toggle">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          data-testid={`content-type-${opt.value}`}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
          style={{
            background: value === opt.value ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
            color: value === opt.value ? '#000' : 'var(--text-3)',
            borderColor: value === opt.value ? 'transparent' : 'rgba(247,231,206,0.08)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
