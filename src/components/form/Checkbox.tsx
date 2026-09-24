'use client';

import { Check } from 'lucide-react';

import type { FieldTone } from './Field';

const TONES: Record<FieldTone, { box: string; checked: string; label: string; hint: string }> = {
  customer: {
    box: 'border-white/15 bg-ink-900',
    checked: 'border-flame-500 bg-flame-500 text-white',
    label: 'text-ink-200',
    hint: 'text-ink-400',
  },
  staff: {
    box: 'border-slate-700 bg-slate-900',
    checked: 'border-sky-500 bg-sky-500 text-slate-950',
    label: 'text-slate-300',
    hint: 'text-slate-500',
  },
};

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  tone?: FieldTone;
}

export default function Checkbox({ label, checked, onChange, hint, tone = 'customer' }: Props) {
  const styles = TONES[tone];

  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
          checked ? styles.checked : styles.box
        }`}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-medium ${styles.label}`}>{label}</span>
        {hint && <span className={`block text-[10px] ${styles.hint}`}>{hint}</span>}
      </span>
    </label>
  );
}
